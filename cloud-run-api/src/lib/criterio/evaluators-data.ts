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

/**
 * Resolve "product_ids[0]" → product_ids.0, returning the first product UUID.
 * The configs in criterio_rules (R-005, R-007, etc.) use "product_ids[0]" to
 * denote "the first product in the list". Support that syntax here.
 */
function resolveMatchValue(data: Record<string, any>, field: string): any {
  // product_ids[0] → array element
  const arrayMatch = field.match(/^(.+)\[(\d+)\]$/);
  if (arrayMatch) {
    const arr = getNestedField(data, arrayMatch[1]);
    if (Array.isArray(arr)) return arr[Number(arrayMatch[2])];
    return undefined;
  }
  return getNestedField(data, field);
}

/**
 * Parse a price mentioned in ad copy (e.g. "$19.990", "$ 19990", "19.990 CLP").
 * Returns the integer CLP amount, or null if nothing recognisable.
 */
function extractPriceFromCopy(text: string): number | null {
  if (!text) return null;
  // Match $<digits with optional thousands separators>
  const match = text.match(/\$\s*([\d][\d.,]*)/);
  if (!match) return null;
  const digits = match[1].replace(/[.,]/g, '');
  const n = parseInt(digits, 10);
  if (isNaN(n) || n < 100) return null; // Very small numbers are almost certainly not prices.
  return n;
}

export async function evaluateDbLookup(
  config: DbLookupConfig,
  data: Record<string, any>,
  context?: EvalContext,
): Promise<EvalResult> {
  const supabase = context?.supabase || getSupabaseAdmin();
  const matchValue = resolveMatchValue(data, config.match_value_field);

  if (matchValue == null) {
    // Payload didn't include the lookup key (e.g. no product_ids[0]) — skip,
    // don't fail. This is a "not applicable" scenario, e.g. a brand-awareness
    // ad that doesn't reference a specific product.
    return {
      passed: true,
      actual: `No ${config.match_value_field} provided`,
      expected: 'N/A',
      details: null,
      skipped: true,
    };
  }

  try {
    switch (config.check) {
      case 'exists': {
        // For shopify_products we ALSO check stock (R-007). The rule
        // "Producto tiene stock" is stored as exists-check because the
        // existence-without-stock case and the no-product case share the
        // same "can't promote" outcome.
        if (config.table === 'shopify_products') {
          const { data: rows, error } = await supabase
            .from('shopify_products')
            .select('id, title, inventory_total, status')
            .eq(config.match_field, matchValue)
            .limit(1);

          if (error) throw error;
          if (!rows || rows.length === 0) {
            return {
              passed: false,
              actual: 'No encontrado',
              expected: 'Producto existe en Shopify',
              details: `Producto ${matchValue} no existe en shopify_products`,
            };
          }
          const prod = rows[0] as { id: string; title: string; inventory_total: number | null; status: string | null };
          if (prod.status && prod.status !== 'active') {
            return {
              passed: false,
              actual: `status=${prod.status}`,
              expected: 'status=active',
              details: `"${prod.title}" no está activo en Shopify (status=${prod.status})`,
            };
          }
          const stock = prod.inventory_total ?? 0;
          if (stock <= 0) {
            return {
              passed: false,
              actual: 'Sin stock',
              expected: 'inventory_total > 0',
              details: `"${prod.title}" tiene inventory_total=${stock}`,
            };
          }
          return {
            passed: true,
            actual: `${stock} en stock`,
            expected: '> 0',
            details: null,
          };
        }

        const { data: rows, error } = await supabase
          .from(config.table)
          .select('id')
          .eq(config.match_field, matchValue)
          .limit(1);

        if (error) throw error;
        const exists = !!(rows && rows.length > 0);
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

        // R-005 "Precio coincide Shopify": extract the price mentioned in the
        // ad copy (primary_text) and compare with the product in Shopify.
        // 2% tolerance — or minimum 100 CLP — to absorb rounding/currency noise.
        if (
          config.table === 'shopify_products' &&
          (config.value_field === 'price' ||
            config.value_field === 'price_min' ||
            config.value_field === 'price_max')
        ) {
          const copy = String(data.primary_text || data.subject || data.headline || '');
          const mentioned = extractPriceFromCopy(copy);
          if (mentioned == null) {
            return {
              passed: true,
              actual: 'No price mentioned in copy',
              expected: 'N/A',
              details: null,
              skipped: true,
            };
          }

          const { data: rows, error } = await supabase
            .from('shopify_products')
            .select('id, title, price_min, price_max')
            .eq(config.match_field, matchValue)
            .limit(1);
          if (error) throw error;
          if (!rows || rows.length === 0) {
            return {
              passed: true,
              actual: 'Producto no en Shopify',
              expected: 'N/A',
              details: null,
              skipped: true,
            };
          }

          const prod = rows[0] as { title: string; price_min: number | null; price_max: number | null };
          const priceMin = Number(prod.price_min ?? 0);
          const priceMax = Number(prod.price_max ?? priceMin);
          // If the copy price falls in the [min, max] band (± 2% / 100 CLP tolerance), pass.
          const tolerance = Math.max(100, Math.max(priceMin, priceMax) * 0.02);
          const withinBand =
            mentioned >= priceMin - tolerance && mentioned <= priceMax + tolerance;

          const displayRange =
            priceMin === priceMax
              ? `$${priceMin.toLocaleString('es-CL')}`
              : `$${priceMin.toLocaleString('es-CL')}-$${priceMax.toLocaleString('es-CL')}`;

          return {
            passed: withinBand,
            actual: `$${mentioned.toLocaleString('es-CL')}`,
            expected: displayRange,
            details: withinBand
              ? null
              : `Copy dice $${mentioned.toLocaleString('es-CL')} pero "${prod.title}" cuesta ${displayRange} en Shopify`,
          };
        }

        // Generic value_matches fallback (non-shopify tables).
        const { data: rows, error } = await supabase
          .from(config.table)
          .select(config.value_field)
          .eq(config.match_field, matchValue)
          .limit(1);

        if (error) throw error;
        if (!rows || rows.length === 0) {
          return { passed: true, actual: 'No record to compare', expected: 'N/A', details: null, skipped: true };
        }
        const dbValue = (rows[0] as Record<string, unknown>)[config.value_field];
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
