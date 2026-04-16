// Data evaluators: DB lookups against Supabase tables
// Used for rules that need to verify data against shopify_products, brand_research, campaign_metrics, etc.

import type { EvalResult, DbLookupConfig, EvalContext } from './types.js';
import { getSupabaseAdmin } from '../supabase.js';

function getNestedField(data: Record<string, any>, field: string): any {
  const parts = field.split('.');
  let value: any = data;
  for (const part of parts) {
    if (value == null) return undefined;
    value = value[part];
  }
  return value;
}

export async function evaluateDbLookup(
  config: DbLookupConfig,
  data: Record<string, any>,
  context?: EvalContext,
): Promise<EvalResult> {
  const supabase = context?.supabase || getSupabaseAdmin();
  const matchValue = getNestedField(data, config.match_value_field);

  if (matchValue == null) {
    return {
      passed: true,
      actual: `No ${config.match_value_field} provided`,
      expected: 'N/A',
      details: null,
    };
  }

  try {
    switch (config.check) {
      case 'exists': {
        const { data: rows, error } = await supabase
          .from(config.table)
          .select('id')
          .eq(config.match_field, matchValue)
          .limit(1);

        if (error) throw error;
        const exists = rows && rows.length > 0;
        return {
          passed: exists,
          actual: exists ? 'Found' : 'Not found',
          expected: `Exists in ${config.table}`,
          details: exists ? null : `No record in ${config.table} where ${config.match_field} = ${matchValue}`,
        };
      }

      case 'not_exists': {
        const { data: rows, error } = await supabase
          .from(config.table)
          .select('id')
          .eq(config.match_field, matchValue)
          .limit(1);

        if (error) throw error;
        const exists = rows && rows.length > 0;
        return {
          passed: !exists,
          actual: exists ? 'Found (should not exist)' : 'Not found (good)',
          expected: `Not in ${config.table}`,
          details: exists ? `Unexpected record found in ${config.table}` : null,
        };
      }

      case 'value_matches': {
        if (!config.value_field) {
          return { passed: false, actual: 'Config error', expected: 'value_field required', details: 'Missing value_field in config' };
        }
        const { data: rows, error } = await supabase
          .from(config.table)
          .select(config.value_field)
          .eq(config.match_field, matchValue)
          .limit(1);

        if (error) throw error;
        if (!rows || rows.length === 0) {
          return { passed: true, actual: 'No record to compare', expected: 'N/A', details: null };
        }
        const dbValue = rows[0][config.value_field];
        const dataValue = getNestedField(data, config.value_field);
        const matches = String(dbValue) === String(dataValue);
        return {
          passed: matches,
          actual: String(dataValue),
          expected: String(dbValue),
          details: matches ? null : `Value mismatch: expected ${dbValue}, got ${dataValue}`,
        };
      }

      case 'count_min': {
        const { count, error } = await supabase
          .from(config.table)
          .select('id', { count: 'exact', head: true })
          .eq(config.match_field, matchValue);

        if (error) throw error;
        const total = count ?? 0;
        const minCount = config.min_count ?? 1;
        return {
          passed: total >= minCount,
          actual: `${total} records`,
          expected: `Min ${minCount}`,
          details: total < minCount ? `Only ${total} records, need at least ${minCount}` : null,
        };
      }

      case 'count_max': {
        const { count, error } = await supabase
          .from(config.table)
          .select('id', { count: 'exact', head: true })
          .eq(config.match_field, matchValue);

        if (error) throw error;
        const total = count ?? 0;
        const maxCount = config.max_count ?? 100;
        return {
          passed: total <= maxCount,
          actual: `${total} records`,
          expected: `Max ${maxCount}`,
          details: total > maxCount ? `${total} records exceeds max ${maxCount}` : null,
        };
      }

      case 'freshness': {
        const { data: rows, error } = await supabase
          .from(config.table)
          .select('updated_at, created_at')
          .eq(config.match_field, matchValue)
          .order('updated_at', { ascending: false })
          .limit(1);

        if (error) throw error;
        if (!rows || rows.length === 0) {
          return { passed: false, actual: 'No records', expected: 'Recent data', details: `No records in ${config.table}` };
        }
        const lastUpdate = new Date(rows[0].updated_at || rows[0].created_at);
        const hoursSince = (Date.now() - lastUpdate.getTime()) / 3600000;
        const maxAge = config.max_age_hours ?? 24;
        return {
          passed: hoursSince <= maxAge,
          actual: `${Math.round(hoursSince)}h ago`,
          expected: `Within ${maxAge}h`,
          details: hoursSince > maxAge ? `Data is ${Math.round(hoursSince)}h old, max ${maxAge}h` : null,
        };
      }

      default:
        return {
          passed: true,
          actual: `Unknown check: ${config.check}`,
          expected: 'N/A',
          details: null,
        };
    }
  } catch (error) {
    console.error(`[criterio-data] DB lookup failed for ${config.table}:`, error);
    return {
      passed: true, // fail-open on DB errors
      actual: 'DB error (fail-open)',
      expected: config.check,
      details: `DB lookup error: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}
