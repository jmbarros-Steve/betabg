// El Chino — data_quality check executor
// Fetches data from Supabase and uses Claude Haiku to evaluate if it makes sense

import type { SupabaseClient } from '@supabase/supabase-js';
import { anthropicFetch } from '../../lib/anthropic-fetch.js';
import type { ChinoCheck, MerchantConn, CheckResult } from '../types.js';

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

// ─── Data fetchers by check_config.data_source ───────────────────

async function getDataForCheck(
  supabase: SupabaseClient,
  check: ChinoCheck,
  merchant?: MerchantConn | null
): Promise<Record<string, any> | null> {
  const source = check.check_config?.data_source as string | undefined;
  const table = check.check_config?.table as string | undefined;
  const limit = (check.check_config?.sample_limit as number) || 20;

  // If a specific table is configured, fetch recent rows
  if (table) {
    let query = supabase.from(table).select('*').order('created_at', { ascending: false }).limit(limit);

    // Scope to merchant if provided and table has client_id
    if (merchant?.client_id && check.check_config?.scope_to_merchant !== false) {
      query = query.eq('client_id', merchant.client_id);
    }

    const { data, error } = await query;
    if (error) return { _error: error.message };
    return { table, row_count: data?.length || 0, sample: data || [] };
  }

  // Predefined data sources
  switch (source) {
    case 'platform_metrics': {
      const { data, error } = await supabase
        .from('platform_metrics')
        .select('metric_type, metric_value, metric_date, connection_id')
        .order('metric_date', { ascending: false })
        .limit(limit);
      if (error) return { _error: error.message };
      return { source, row_count: data?.length || 0, sample: data || [] };
    }

    case 'campaign_metrics': {
      let query = supabase
        .from('campaign_metrics')
        .select('campaign_name, spend, impressions, clicks, revenue, metric_date, connection_id')
        .order('metric_date', { ascending: false })
        .limit(limit);

      if (merchant?.connection_id) {
        query = query.eq('connection_id', merchant.connection_id);
      }

      const { data, error } = await query;
      if (error) return { _error: error.message };
      return { source, row_count: data?.length || 0, sample: data || [] };
    }

    case 'shopify_products': {
      let query = supabase
        .from('shopify_products')
        .select('title, price, vendor, product_type, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (merchant?.client_id) {
        query = query.eq('client_id', merchant.client_id);
      }

      const { data, error } = await query;
      if (error) return { _error: error.message };
      return { source, row_count: data?.length || 0, sample: data || [] };
    }

    case 'email_events': {
      const { data, error } = await supabase
        .from('email_events')
        .select('event_type, created_at, metadata')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) return { _error: error.message };
      return { source, row_count: data?.length || 0, sample: data || [] };
    }

    case 'clients': {
      const { data, error } = await supabase
        .from('clients')
        .select('name, email, created_at, last_active_at, onboarding_status')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) return { _error: error.message };
      return { source, row_count: data?.length || 0, sample: data || [] };
    }

    default: {
      // If no source configured, fetch from chino_reports to self-check
      const { data, error } = await supabase
        .from('chino_reports')
        .select('check_number, result, steve_value, real_value, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) return { _error: error.message };
      return { source: 'chino_reports (default)', row_count: data?.length || 0, sample: data || [] };
    }
  }
}

// ─── Claude Haiku evaluation ─────────────────────────────────────

async function evaluateDataQuality(
  data: Record<string, any>,
  checkDescription: string
): Promise<{ pass: boolean; reason: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const result = await anthropicFetch(
    {
      model: HAIKU_MODEL,
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `Eres un QA evaluando datos de una plataforma de marketing para e-commerce.

Check: ${checkDescription}
Datos: ${JSON.stringify(data, null, 2).substring(0, 3000)}

¿Estos datos hacen sentido? Responde en JSON:
{
  "pass": true/false,
  "reason": "explicación breve"
}

Criterios:
- Números negativos donde no deberían haber = fail
- Fechas en el futuro donde no deberían = fail
- Datos de años anteriores a 2025 en contexto actual = fail
- Valores extremadamente altos o bajos sin explicación = fail
- Campos vacíos que deberían tener datos = fail
- Datos duplicados = fail
- Si hay 0 filas de datos y el check espera datos = fail
- Si hay un _error en los datos = fail

Responde SOLO el JSON.`,
        },
      ],
    },
    apiKey,
    { timeoutMs: 15_000 },
  );

  if (!result.ok) {
    throw new Error(`Claude Haiku API error: ${result.status}`);
  }

  const text = result.data?.content?.[0]?.text || '{}';
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return { pass: false, reason: `Unparseable Claude response: ${text.substring(0, 100)}` };
  }
}

// ─── Main data_quality executor ──────────────────────────────────

export async function executeDataQuality(
  supabase: SupabaseClient,
  check: ChinoCheck,
  merchant?: MerchantConn | null
): Promise<CheckResult> {
  const start = Date.now();

  try {
    // 1. Fetch data to evaluate
    const data = await getDataForCheck(supabase, check, merchant);

    if (!data) {
      return {
        result: 'skip',
        error_message: 'No data returned for check',
        duration_ms: Date.now() - start,
      };
    }

    if (data._error) {
      return {
        result: 'error',
        error_message: `DB error: ${data._error}`,
        duration_ms: Date.now() - start,
      };
    }

    // 2. Send to Claude Haiku for evaluation
    const evaluation = await evaluateDataQuality(data, check.description);

    return {
      result: evaluation.pass ? 'pass' : 'fail',
      steve_value: JSON.stringify(data).substring(0, 200),
      error_message: evaluation.pass ? undefined : evaluation.reason,
      duration_ms: Date.now() - start,
    };
  } catch (err: any) {
    return {
      result: 'error',
      error_message: err.message,
      duration_ms: Date.now() - start,
    };
  }
}
