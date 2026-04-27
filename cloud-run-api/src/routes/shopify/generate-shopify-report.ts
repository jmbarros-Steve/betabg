import { Context } from 'hono';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import { fetchReportData } from '../../lib/shopify-report/data.js';
import { ShopifyReportDocument } from '../../lib/shopify-report/Document.js';

const MIN_PERIOD_DAYS = 7;
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 días

function isoOnly(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function daysBetween(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00Z').getTime();
  const e = new Date(end + 'T00:00:00Z').getTime();
  return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * POST /api/generate-shopify-report
 * Body: { clientId, startDate, endDate }
 * Auth: JWT (super_admin o dueño del client_id)
 *
 * Flujo:
 *  1. Valida auth + ownership
 *  2. Valida rango ≥ 7 días
 *  3. Inserta fila pending en shopify_reports
 *  4. Fetcha data (lib/shopify-report/data.ts)
 *  5. Renderiza PDF con react-pdf (lib/shopify-report/Document.tsx)
 *  6. Sube a Supabase Storage bucket 'reports' como {client_id}/{report_id}.pdf
 *  7. Update fila a ready con pdf_path + URL firmada
 *  8. Devuelve { reportId, pdfUrl }
 */
export async function generateShopifyReport(c: Context) {
  const supabase = getSupabaseAdmin();

  // ----- Auth -----
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const token = authHeader.replace('Bearer ', '');
  const { data: userResult, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userResult?.user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const userId = userResult.user.id;

  // ----- Body -----
  let body: { clientId?: string; startDate?: string; endDate?: string; triggerType?: 'on_demand' | 'scheduled' };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const { clientId, startDate, endDate, triggerType = 'on_demand' } = body;

  if (!clientId || !startDate || !endDate) {
    return c.json({ error: 'clientId, startDate, endDate required' }, 400);
  }

  if (!isoOnly(startDate) || !isoOnly(endDate)) {
    return c.json({ error: 'Dates must be YYYY-MM-DD' }, 400);
  }

  if (startDate > endDate) {
    return c.json({ error: 'startDate must be <= endDate' }, 400);
  }

  const periodDays = daysBetween(startDate, endDate);
  if (periodDays < MIN_PERIOD_DAYS) {
    return c.json({ error: `Minimum period is ${MIN_PERIOD_DAYS} days. Use the dashboard for shorter ranges.` }, 400);
  }

  // ----- Ownership check -----
  const client = await safeQuerySingleOrDefault<{ id: string; user_id: string; client_user_id: string | null }>(
    supabase
      .from('clients')
      .select('id, user_id, client_user_id')
      .eq('id', clientId)
      .single(),
    null,
    'generateShopifyReport.getClient',
  );

  if (!client) return c.json({ error: 'Client not found' }, 404);

  let isAuthorized = client.user_id === userId || client.client_user_id === userId;
  if (!isAuthorized) {
    const role = await safeQuerySingleOrDefault<{ is_super_admin: boolean }>(
      supabase
        .from('user_roles')
        .select('is_super_admin')
        .eq('user_id', userId)
        .maybeSingle(),
      null,
      'generateShopifyReport.getRole',
    );
    isAuthorized = role?.is_super_admin === true;
  }

  if (!isAuthorized) return c.json({ error: 'Forbidden' }, 403);

  // ----- Insert pending report row -----
  const { data: reportRow, error: insertErr } = await supabase
    .from('shopify_reports')
    .insert({
      client_id: clientId,
      period_start: startDate,
      period_end: endDate,
      status: 'generating',
      generated_by: userId,
      trigger_type: triggerType,
    })
    .select('id')
    .single();

  if (insertErr || !reportRow) {
    console.error('[generate-shopify-report] insert failed:', insertErr);
    return c.json({ error: 'Failed to create report row' }, 500);
  }

  const reportId = reportRow.id;
  const startTime = Date.now();

  try {
    // ----- Fetch data -----
    const reportData = await fetchReportData(supabase, clientId, startDate, endDate);

    // ----- Render PDF -----
    const pdfBuffer = await renderToBuffer(React.createElement(ShopifyReportDocument, { data: reportData }) as any);
    const fileSize = pdfBuffer.length;

    // ----- Upload to Storage -----
    const storagePath = `${clientId}/${reportId}.pdf`;
    const { error: uploadErr } = await supabase.storage
      .from('reports')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadErr) {
      throw new Error(`storage upload failed: ${uploadErr.message}`);
    }

    // ----- Generate signed URL -----
    const { data: signedData, error: signedErr } = await supabase.storage
      .from('reports')
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

    if (signedErr || !signedData?.signedUrl) {
      throw new Error(`signed url failed: ${signedErr?.message || 'unknown'}`);
    }

    const durationMs = Date.now() - startTime;

    // ----- Mark as ready -----
    const { error: updateErr } = await supabase
      .from('shopify_reports')
      .update({
        status: 'ready',
        pdf_path: storagePath,
        pdf_url: signedData.signedUrl,
        file_size_bytes: fileSize,
        generated_at: new Date().toISOString(),
        metadata: {
          generation_duration_ms: durationMs,
          period_days: periodDays,
          sections_included: ['cover', 'letter', 'executive_summary', 'north_star', 'recommendations', 'next_steps'],
          sprint: 1,
        },
      })
      .eq('id', reportId);

    if (updateErr) {
      console.error('[generate-shopify-report] update ready failed:', updateErr);
    }

    console.log(`[generate-shopify-report] reportId=${reportId} client=${clientId} period=${startDate}..${endDate} size=${fileSize}b duration=${durationMs}ms`);

    return c.json({
      reportId,
      pdfUrl: signedData.signedUrl,
      fileSizeBytes: fileSize,
      generationDurationMs: durationMs,
    });
  } catch (err: any) {
    const errMsg = err?.message || 'unknown error';
    console.error(`[generate-shopify-report] failed reportId=${reportId}:`, errMsg);

    await supabase
      .from('shopify_reports')
      .update({
        status: 'failed',
        error_message: errMsg.slice(0, 500),
      })
      .eq('id', reportId);

    return c.json({ error: errMsg, reportId }, 500);
  }
}

/**
 * GET /api/shopify-reports?clientId=xxx
 * Lista historial de reportes del cliente.
 */
export async function listShopifyReports(c: Context) {
  const supabase = getSupabaseAdmin();

  // Auth
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401);
  const token = authHeader.replace('Bearer ', '');
  const { data: userResult, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userResult?.user) return c.json({ error: 'Unauthorized' }, 401);
  const userId = userResult.user.id;

  let body: { clientId?: string };
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const clientId = body.clientId;
  if (!clientId) return c.json({ error: 'clientId required' }, 400);

  // Ownership
  const client = await safeQuerySingleOrDefault<{ user_id: string; client_user_id: string | null }>(
    supabase.from('clients').select('user_id, client_user_id').eq('id', clientId).single(),
    null,
    'listShopifyReports.getClient',
  );
  if (!client) return c.json({ error: 'Client not found' }, 404);

  let isAuthorized = client.user_id === userId || client.client_user_id === userId;
  if (!isAuthorized) {
    const role = await safeQuerySingleOrDefault<{ is_super_admin: boolean }>(
      supabase.from('user_roles').select('is_super_admin').eq('user_id', userId).maybeSingle(),
      null,
      'listShopifyReports.getRole',
    );
    isAuthorized = role?.is_super_admin === true;
  }
  if (!isAuthorized) return c.json({ error: 'Forbidden' }, 403);

  const { data: reports, error } = await supabase
    .from('shopify_reports')
    .select('id, period_start, period_end, status, pdf_path, file_size_bytes, generated_at, trigger_type, metadata')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return c.json({ error: error.message }, 500);

  // Re-firmar URLs para cada reporte (las anteriores pueden haber expirado)
  const reportsWithUrls = await Promise.all(
    (reports || []).map(async (r) => {
      if (r.status !== 'ready' || !r.pdf_path) return { ...r, pdf_url: null };
      const { data: signed } = await supabase.storage.from('reports').createSignedUrl(r.pdf_path, SIGNED_URL_TTL_SECONDS);
      return { ...r, pdf_url: signed?.signedUrl || null };
    }),
  );

  return c.json({ reports: reportsWithUrls });
}
