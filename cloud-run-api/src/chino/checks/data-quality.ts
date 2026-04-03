// El Chino — data_quality check executor
// Deterministic SQL validations per check_number (no LLM dependency)

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChinoCheck, MerchantConn, CheckResult } from '../types.js';

interface ValidationResult {
  invalid_count: number;
  total_count: number;
  sample_errors: string[];
}

// ─── Check 15: platform_metrics data quality ─────────────────────
// Revenue not negative, required fields not null

async function validatePlatformMetrics(
  supabase: SupabaseClient,
  merchant?: MerchantConn | null
): Promise<ValidationResult> {
  let query = supabase
    .from('platform_metrics')
    .select('id, metric_type, metric_value, metric_date, connection_id')
    .order('metric_date', { ascending: false })
    .limit(200);

  if (merchant?.connection_id) {
    query = query.eq('connection_id', merchant.connection_id);
  }

  const { data, error } = await query;
  if (error) throw new Error(`DB error: ${error.message}`);
  if (!data || data.length === 0) return { invalid_count: 0, total_count: 0, sample_errors: [] };

  const errors: string[] = [];

  for (const row of data) {
    // Required fields not null
    if (!row.metric_type) {
      errors.push(`id=${row.id}: metric_type is null`);
    }
    if (row.metric_date === null || row.metric_date === undefined) {
      errors.push(`id=${row.id}: metric_date is null`);
    }
    if (row.connection_id === null || row.connection_id === undefined) {
      errors.push(`id=${row.id}: connection_id is null`);
    }
    // Revenue should not be negative
    if (row.metric_type === 'revenue' && Number(row.metric_value) < 0) {
      errors.push(`id=${row.id}: negative revenue (${row.metric_value})`);
    }
    // Metric value should be a valid number
    if (row.metric_value !== null && row.metric_value !== undefined && isNaN(Number(row.metric_value))) {
      errors.push(`id=${row.id}: metric_value is NaN (${row.metric_value})`);
    }
  }

  return {
    invalid_count: errors.length,
    total_count: data.length,
    sample_errors: errors.slice(0, 10),
  };
}

// ─── Check 16: campaign_metrics data quality ─────────────────────
// No CTR > 100%, no CPC negative, no impressions < clicks

async function validateCampaignMetrics(
  supabase: SupabaseClient,
  merchant?: MerchantConn | null
): Promise<ValidationResult> {
  let query = supabase
    .from('campaign_metrics')
    .select('id, campaign_name, spend, impressions, clicks, revenue, metric_date, connection_id')
    .order('metric_date', { ascending: false })
    .limit(200);

  if (merchant?.connection_id) {
    query = query.eq('connection_id', merchant.connection_id);
  }

  const { data, error } = await query;
  if (error) throw new Error(`DB error: ${error.message}`);
  if (!data || data.length === 0) return { invalid_count: 0, total_count: 0, sample_errors: [] };

  const errors: string[] = [];

  for (const row of data) {
    const impressions = Number(row.impressions) || 0;
    const clicks = Number(row.clicks) || 0;
    const spend = Number(row.spend) || 0;

    // CTR > 100% is impossible
    if (impressions > 0 && (clicks / impressions) > 1) {
      errors.push(`id=${row.id}: clicks (${clicks}) > impressions (${impressions})`);
    }

    // CPC should not be negative
    if (spend < 0) {
      errors.push(`id=${row.id}: negative spend (${spend})`);
    }

    // Revenue should not be negative
    if (Number(row.revenue) < 0) {
      errors.push(`id=${row.id}: negative revenue (${row.revenue})`);
    }

    // Impressions and clicks should not be negative
    if (impressions < 0) {
      errors.push(`id=${row.id}: negative impressions (${impressions})`);
    }
    if (clicks < 0) {
      errors.push(`id=${row.id}: negative clicks (${clicks})`);
    }
  }

  return {
    invalid_count: errors.length,
    total_count: data.length,
    sample_errors: errors.slice(0, 10),
  };
}

// ─── Check 18: shopify_products data quality ─────────────────────
// No price=0 with active status, no empty title

async function validateShopifyProducts(
  supabase: SupabaseClient,
  merchant?: MerchantConn | null
): Promise<ValidationResult> {
  let query = supabase
    .from('shopify_products')
    .select('id, title, price, status, vendor, product_type')
    .order('created_at', { ascending: false })
    .limit(200);

  if (merchant?.client_id) {
    query = query.eq('client_id', merchant.client_id);
  }

  const { data, error } = await query;
  if (error) throw new Error(`DB error: ${error.message}`);
  if (!data || data.length === 0) return { invalid_count: 0, total_count: 0, sample_errors: [] };

  const errors: string[] = [];

  for (const row of data) {
    // Active product with price = 0
    if (row.status === 'active' && (Number(row.price) === 0 || row.price === null)) {
      errors.push(`id=${row.id}: active product with price=0 ("${(row.title || '').substring(0, 40)}")`);
    }

    // Empty title
    if (!row.title || row.title.trim() === '') {
      errors.push(`id=${row.id}: empty title`);
    }
  }

  return {
    invalid_count: errors.length,
    total_count: data.length,
    sample_errors: errors.slice(0, 10),
  };
}

// ─── Check 19: email_events data quality ─────────────────────────
// No open_rate > 100%, no future dates

async function validateEmailEvents(
  supabase: SupabaseClient,
  _merchant?: MerchantConn | null
): Promise<ValidationResult> {
  const { data, error } = await supabase
    .from('email_events')
    .select('id, event_type, created_at, metadata')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw new Error(`DB error: ${error.message}`);
  if (!data || data.length === 0) return { invalid_count: 0, total_count: 0, sample_errors: [] };

  const errors: string[] = [];
  const now = Date.now();

  for (const row of data) {
    // Future dates (more than 1 hour ahead to allow for timezone drift)
    if (row.created_at) {
      const eventTime = new Date(row.created_at).getTime();
      if (eventTime > now + 3600_000) {
        errors.push(`id=${row.id}: future date (${row.created_at})`);
      }
    }

    // Check open_rate in metadata if present
    const meta = row.metadata as Record<string, any> | null;
    if (meta?.open_rate !== undefined) {
      const rate = Number(meta.open_rate);
      if (rate > 100) {
        errors.push(`id=${row.id}: open_rate > 100% (${rate})`);
      }
      if (rate < 0) {
        errors.push(`id=${row.id}: negative open_rate (${rate})`);
      }
    }
  }

  return {
    invalid_count: errors.length,
    total_count: data.length,
    sample_errors: errors.slice(0, 10),
  };
}

// ─── Check 20: clients data quality ──────────────────────────────
// No empty email, no empty name, no duplicates by email

async function validateClients(
  supabase: SupabaseClient,
  _merchant?: MerchantConn | null
): Promise<ValidationResult> {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, email, created_at')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) throw new Error(`DB error: ${error.message}`);
  if (!data || data.length === 0) return { invalid_count: 0, total_count: 0, sample_errors: [] };

  const errors: string[] = [];
  const emailsSeen = new Map<string, string>(); // email -> first id

  for (const row of data) {
    // Empty name
    if (!row.name || row.name.trim() === '') {
      errors.push(`id=${row.id}: empty name`);
    }

    // Empty email
    if (!row.email || row.email.trim() === '') {
      errors.push(`id=${row.id}: empty email`);
    }

    // Duplicate email
    if (row.email) {
      const normalized = row.email.trim().toLowerCase();
      if (emailsSeen.has(normalized)) {
        errors.push(`id=${row.id}: duplicate email "${normalized}" (first seen in id=${emailsSeen.get(normalized)})`);
      } else {
        emailsSeen.set(normalized, row.id);
      }
    }
  }

  return {
    invalid_count: errors.length,
    total_count: data.length,
    sample_errors: errors.slice(0, 10),
  };
}

// ─── Fallback: generic null/count check ──────────────────────────

async function validateGeneric(
  supabase: SupabaseClient,
  check: ChinoCheck,
  merchant?: MerchantConn | null
): Promise<ValidationResult> {
  const table = (check.check_config?.table || check.check_config?.data_source) as string | undefined;
  if (!table) {
    return { invalid_count: 0, total_count: 0, sample_errors: ['No table configured for generic check'] };
  }

  let query = supabase.from(table).select('*').order('created_at', { ascending: false }).limit(100);

  if (merchant?.client_id && check.check_config?.scope_to_merchant !== false) {
    query = query.eq('client_id', merchant.client_id);
  }

  const { data, error } = await query;
  if (error) throw new Error(`DB error: ${error.message}`);
  if (!data || data.length === 0) return { invalid_count: 0, total_count: 0, sample_errors: [] };

  // Basic check: count rows with any null required-looking fields
  const errors: string[] = [];
  for (const row of data) {
    const nullFields = Object.entries(row)
      .filter(([key, val]) => val === null && !key.endsWith('_at') && !key.startsWith('deleted') && key !== 'metadata')
      .map(([key]) => key);
    if (nullFields.length > 3) {
      errors.push(`id=${(row as any).id}: ${nullFields.length} null fields (${nullFields.slice(0, 3).join(', ')}...)`);
    }
  }

  return {
    invalid_count: errors.length,
    total_count: data.length,
    sample_errors: errors.slice(0, 10),
  };
}

// ─── Main data_quality executor ──────────────────────────────────

export async function executeDataQuality(
  supabase: SupabaseClient,
  check: ChinoCheck,
  merchant?: MerchantConn | null
): Promise<CheckResult> {
  const start = Date.now();

  try {
    let validation: ValidationResult;

    switch (check.check_number) {
      case 15:
        validation = await validatePlatformMetrics(supabase, merchant);
        break;
      case 16:
        validation = await validateCampaignMetrics(supabase, merchant);
        break;
      case 18:
        validation = await validateShopifyProducts(supabase, merchant);
        break;
      case 19:
        validation = await validateEmailEvents(supabase, merchant);
        break;
      case 20:
        validation = await validateClients(supabase, merchant);
        break;
      default:
        validation = await validateGeneric(supabase, check, merchant);
        break;
    }

    const duration_ms = Date.now() - start;

    // No data → skip
    if (validation.total_count === 0) {
      return {
        result: 'skip',
        error_message: 'Sin datos para validar',
        duration_ms,
      };
    }

    // Has invalid rows → fail
    if (validation.invalid_count > 0) {
      return {
        result: 'fail',
        steve_value: `${validation.invalid_count}/${validation.total_count} invalid`,
        error_message: validation.sample_errors.join('; '),
        duration_ms,
      };
    }

    // All good → pass
    return {
      result: 'pass',
      steve_value: `${validation.total_count} rows checked, 0 issues`,
      duration_ms,
    };
  } catch (err: any) {
    return {
      result: 'error',
      error_message: err.message,
      duration_ms: Date.now() - start,
    };
  }
}
