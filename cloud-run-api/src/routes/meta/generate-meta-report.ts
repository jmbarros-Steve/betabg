import { Context } from 'hono';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import { fetchMetaReportData } from '../../lib/meta-report/data.js';
import { generateAIRecommendations } from '../../lib/meta-report/ai-insights.js';
import { MetaReportDocument } from '../../lib/meta-report/Document.js';

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
 * POST /api/generate-meta-report
 * Body: { clientId, connectionIds?, startDate, endDate, triggerType? }
 * Auth: JWT (super_admin o dueño del client_id)
 *
 * Multi-account: si connectionIds está vacío, agrega TODAS las conexiones Meta
 * activas del cliente. Si viene populated, usa solo esas.
 */
export async function generateMetaReport(c: Context) {
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
  let body: {
    clientId?: string;
    connectionIds?: string[];
    startDate?: string;
    endDate?: string;
    triggerType?: 'on_demand' | 'scheduled';
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const { clientId, connectionIds, startDate, endDate, triggerType = 'on_demand' } = body;

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
    return c.json(
      { error: `El período mínimo del informe es ${MIN_PERIOD_DAYS} días. Para rangos más cortos usá el dashboard.` },
      400,
    );
  }

  // ----- Ownership check -----
  const client = await safeQuerySingleOrDefault<{ id: string; user_id: string; client_user_id: string | null }>(
    supabase
      .from('clients')
      .select('id, user_id, client_user_id')
      .eq('id', clientId)
      .single(),
    null,
    'generateMetaReport.getClient',
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
      'generateMetaReport.getRole',
    );
    isAuthorized = role?.is_super_admin === true;
  }

  if (!isAuthorized) return c.json({ error: 'Forbidden' }, 403);

  // ----- Resolver connectionIds: si vacío, agarrar todas las activas Meta del cliente -----
  let resolvedConnectionIds: string[] = Array.isArray(connectionIds) ? connectionIds.filter(Boolean) : [];
  if (resolvedConnectionIds.length === 0) {
    const { data: conns } = await supabase
      .from('platform_connections')
      .select('id')
      .eq('client_id', clientId)
      .eq('platform', 'meta')
      .eq('is_active', true);
    resolvedConnectionIds = (conns || []).map((c) => c.id);
  } else {
    // Validar que las connectionIds dadas pertenezcan al cliente y sean Meta activas
    const { data: conns } = await supabase
      .from('platform_connections')
      .select('id')
      .eq('client_id', clientId)
      .eq('platform', 'meta')
      .eq('is_active', true)
      .in('id', resolvedConnectionIds);
    resolvedConnectionIds = (conns || []).map((c) => c.id);
  }

  if (resolvedConnectionIds.length === 0) {
    return c.json(
      { error: 'El cliente no tiene conexiones Meta activas. Conectá una cuenta antes de generar el informe.' },
      400,
    );
  }

  // ----- Insert pending report row -----
  const { data: reportRow, error: insertErr } = await supabase
    .from('meta_reports')
    .insert({
      client_id: clientId,
      connection_ids: resolvedConnectionIds,
      from_date: startDate,
      to_date: endDate,
      status: 'generating',
      requested_by: userId,
      trigger_type: triggerType,
    })
    .select('id')
    .single();

  if (insertErr || !reportRow) {
    console.error('[generate-meta-report] insert failed:', insertErr);
    return c.json({ error: 'Failed to create report row' }, 500);
  }

  const reportId = reportRow.id;
  const startTime = Date.now();

  try {
    // ----- Fetch data + AI recommendations -----
    const reportData = await fetchMetaReportData(
      supabase,
      clientId,
      resolvedConnectionIds,
      startDate,
      endDate,
    );

    reportData.recommendations = await generateAIRecommendations(reportData);

    // ----- Render PDF -----
    const pdfBuffer = await renderToBuffer(
      React.createElement(MetaReportDocument, { data: reportData }) as any,
    );
    const fileSize = pdfBuffer.length;

    // ----- Upload to Storage -----
    const timestamp = Date.now();
    const storagePath = `${clientId}/meta-${startDate}-${endDate}-${timestamp}.pdf`;
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

    // ----- Mark as completed -----
    const { error: updateErr } = await supabase
      .from('meta_reports')
      .update({
        status: 'completed',
        storage_path: storagePath,
        signed_url: signedData.signedUrl,
        file_size_bytes: fileSize,
        generated_at: new Date().toISOString(),
        metadata: {
          generation_duration_ms: durationMs,
          period_days: periodDays,
          connection_count: resolvedConnectionIds.length,
          campaigns_analyzed: reportData.campaigns.length,
          ai_recommendations_count: reportData.recommendations.length,
          spend_clp: Math.round(reportData.current.spend),
          revenue_clp: Math.round(reportData.current.revenue),
          roas: Number(reportData.current.roas.toFixed(2)),
        },
      })
      .eq('id', reportId);

    if (updateErr) {
      console.error('[generate-meta-report] update completed failed:', updateErr);
    }

    console.log(
      `[generate-meta-report] reportId=${reportId} client=${clientId} period=${startDate}..${endDate} connections=${resolvedConnectionIds.length} size=${fileSize}b duration=${durationMs}ms`,
    );

    return c.json({
      reportId,
      pdfUrl: signedData.signedUrl,
      fileSizeBytes: fileSize,
      generationDurationMs: durationMs,
      campaignsAnalyzed: reportData.campaigns.length,
      recommendationsCount: reportData.recommendations.length,
    });
  } catch (err: any) {
    const errMsg = err?.message || 'unknown error';
    console.error(`[generate-meta-report] failed reportId=${reportId}:`, errMsg);

    await supabase
      .from('meta_reports')
      .update({
        status: 'failed',
        error_message: errMsg.slice(0, 500),
      })
      .eq('id', reportId);

    return c.json({ error: errMsg, reportId }, 500);
  }
}

/**
 * GET /api/meta-reports
 * Body o query: { clientId }
 * Lista historial de reportes Meta del cliente con URLs firmadas refrescadas.
 */
export async function listMetaReports(c: Context) {
  const supabase = getSupabaseAdmin();

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
  const clientId = body.clientId || c.req.query('clientId');
  if (!clientId) return c.json({ error: 'clientId required' }, 400);

  const client = await safeQuerySingleOrDefault<{ user_id: string; client_user_id: string | null }>(
    supabase.from('clients').select('user_id, client_user_id').eq('id', clientId).single(),
    null,
    'listMetaReports.getClient',
  );
  if (!client) return c.json({ error: 'Client not found' }, 404);

  let isAuthorized = client.user_id === userId || client.client_user_id === userId;
  if (!isAuthorized) {
    const role = await safeQuerySingleOrDefault<{ is_super_admin: boolean }>(
      supabase.from('user_roles').select('is_super_admin').eq('user_id', userId).maybeSingle(),
      null,
      'listMetaReports.getRole',
    );
    isAuthorized = role?.is_super_admin === true;
  }
  if (!isAuthorized) return c.json({ error: 'Forbidden' }, 403);

  const { data: reports, error } = await supabase
    .from('meta_reports')
    .select('id, from_date, to_date, status, storage_path, file_size_bytes, generated_at, trigger_type, metadata, error_message, created_at, connection_ids')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return c.json({ error: error.message }, 500);

  const reportsWithUrls = await Promise.all(
    (reports || []).map(async (r) => {
      if (r.status !== 'completed' || !r.storage_path) return { ...r, signed_url: null };
      const { data: signed } = await supabase.storage
        .from('reports')
        .createSignedUrl(r.storage_path, SIGNED_URL_TTL_SECONDS);
      return { ...r, signed_url: signed?.signedUrl || null };
    }),
  );

  return c.json({ reports: reportsWithUrls });
}
