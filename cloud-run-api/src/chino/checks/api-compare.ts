// El Chino — api_compare executor
// Handles checks 1-3, 6, 11-14, 17, 21-28
// Category A: Connectivity checks (1-3, 6) — verify API responds 200
// Category B: Numeric comparison checks (11-14, 17, 21-28) — compare Steve vs real API

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChinoCheck, MerchantConn, CheckResult } from '../types.js';

// ─── Platform API fetchers ────────────────────────────────────────

async function fetchShopifyApi(
  storeUrl: string,
  token: string,
  endpoint: string
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    return await fetch(`https://${storeUrl}/admin/api/2025-01/${endpoint}`, {
      headers: { 'X-Shopify-Access-Token': token },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchMetaApi(
  token: string,
  endpoint: string
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  const separator = endpoint.includes('?') ? '&' : '?';
  try {
    return await fetch(`https://graph.facebook.com/v21.0/${endpoint}${separator}access_token=${token}`, {
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchKlaviyoApi(
  apiKey: string,
  endpoint: string
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    return await fetch(`https://a.klaviyo.com/api/${endpoint}`, {
      headers: {
        'Authorization': `Klaviyo-API-Key ${apiKey}`,
        'revision': '2024-10-15',
        'accept': 'application/json',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Retry on 429 ────────────────────────────────────────────────

async function fetchWithRetry(
  fn: () => Promise<Response>
): Promise<Response> {
  const res = await fn();
  if (res.status === 429) {
    console.log('[chino] Rate limited (429), waiting 30s and retrying once...');
    await new Promise((r) => setTimeout(r, 30_000));
    return fn();
  }
  return res;
}

// ─── Connectivity checks (1-3, 6) ────────────────────────────────

async function executeConnectivity(
  check: ChinoCheck,
  merchant: MerchantConn,
  decryptedToken: string | null
): Promise<CheckResult> {
  const start = Date.now();

  if (!decryptedToken) {
    return {
      result: 'fail',
      error_message: 'No hay token',
      duration_ms: Date.now() - start,
    };
  }

  try {
    let res: Response;

    switch (check.check_number) {
      case 1: // Shopify connectivity
        if (!merchant.store_url) {
          return { result: 'skip', error_message: 'No store_url', duration_ms: Date.now() - start };
        }
        res = await fetchWithRetry(() => fetchShopifyApi(merchant.store_url!, decryptedToken, 'shop.json'));
        break;

      case 2: // Meta connectivity
        res = await fetchWithRetry(() => fetchMetaApi(decryptedToken, 'me?fields=id,name'));
        break;

      case 3: // Klaviyo connectivity
        res = await fetchWithRetry(() => fetchKlaviyoApi(decryptedToken, 'accounts/'));
        break;

      case 6: // All platforms — verify connection has working token
        // Dispatches based on merchant.platform
        if (merchant.platform === 'shopify' && merchant.store_url) {
          res = await fetchWithRetry(() => fetchShopifyApi(merchant.store_url!, decryptedToken, 'shop.json'));
        } else if (merchant.platform === 'meta') {
          res = await fetchWithRetry(() => fetchMetaApi(decryptedToken, 'me?fields=id,name'));
        } else if (merchant.platform === 'klaviyo') {
          res = await fetchWithRetry(() => fetchKlaviyoApi(decryptedToken, 'accounts/'));
        } else {
          return { result: 'skip', error_message: `Platform ${merchant.platform} not supported for check 6`, duration_ms: Date.now() - start };
        }
        break;

      default:
        return { result: 'skip', error_message: `Connectivity not implemented for check #${check.check_number}`, duration_ms: Date.now() - start };
    }

    if (res.ok) {
      return { result: 'pass', duration_ms: Date.now() - start };
    }
    return {
      result: 'fail',
      error_message: `API returned ${res.status}`,
      duration_ms: Date.now() - start,
    };
  } catch (err: any) {
    return {
      result: 'error',
      error_message: err.name === 'AbortError' ? 'Timeout (30s)' : err.message,
      duration_ms: Date.now() - start,
    };
  }
}

// ─── Steve value getters ─────────────────────────────────────────

async function getSteveValue(
  supabase: SupabaseClient,
  check: ChinoCheck,
  merchant: MerchantConn
): Promise<number | null> {
  switch (check.check_number) {
    case 11: { // Shopify revenue 7d
      const { data } = await supabase
        .from('platform_metrics')
        .select('metric_value')
        .eq('connection_id', merchant.connection_id)
        .eq('metric_type', 'revenue')
        .gte('metric_date', new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10));
      return data?.reduce((sum, r) => sum + (Number(r.metric_value) || 0), 0) ?? null;
    }
    case 12: { // Shopify orders 7d
      const { data } = await supabase
        .from('platform_metrics')
        .select('metric_value')
        .eq('connection_id', merchant.connection_id)
        .eq('metric_type', 'orders')
        .gte('metric_date', new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10));
      return data?.reduce((sum, r) => sum + (Number(r.metric_value) || 0), 0) ?? null;
    }
    case 13: { // Shopify products count
      const { count } = await supabase
        .from('shopify_products')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', merchant.client_id);
      return count ?? null;
    }
    case 14: { // Shopify collections count
      const { count } = await supabase
        .from('shopify_collections')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', merchant.client_id);
      return count ?? null;
    }
    case 17: { // Shopify products with price (count products with price > 0)
      const { count } = await supabase
        .from('shopify_products')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', merchant.client_id)
        .gt('price', 0);
      return count ?? null;
    }
    case 21: { // Meta spend 7d
      const { data } = await supabase
        .from('campaign_metrics')
        .select('spend')
        .eq('connection_id', merchant.connection_id)
        .gte('metric_date', new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10));
      return data?.reduce((sum, r) => sum + (Number(r.spend) || 0), 0) ?? null;
    }
    case 22: { // Meta ROAS 7d
      const { data } = await supabase
        .from('campaign_metrics')
        .select('spend, revenue')
        .eq('connection_id', merchant.connection_id)
        .gte('metric_date', new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10));
      const totalSpend = data?.reduce((s, r) => s + (Number(r.spend) || 0), 0) ?? 0;
      const totalRevenue = data?.reduce((s, r) => s + (Number(r.revenue) || 0), 0) ?? 0;
      return totalSpend > 0 ? Math.round((totalRevenue / totalSpend) * 100) / 100 : null;
    }
    case 23: { // Meta active campaigns count
      const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
      const { count } = await supabase
        .from('campaign_metrics')
        .select('id', { count: 'exact', head: true })
        .eq('connection_id', merchant.connection_id)
        .eq('metric_date', yesterday)
        .gt('spend', 0);
      return count ?? null;
    }
    case 24: { // Meta reach 7d
      const { data } = await supabase
        .from('campaign_metrics')
        .select('reach')
        .eq('connection_id', merchant.connection_id)
        .gte('metric_date', new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10));
      return data?.reduce((sum, r) => sum + (Number(r.reach) || 0), 0) ?? null;
    }
    case 25: { // Meta impressions 7d
      const { data } = await supabase
        .from('campaign_metrics')
        .select('impressions')
        .eq('connection_id', merchant.connection_id)
        .gte('metric_date', new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10));
      return data?.reduce((sum, r) => sum + (Number(r.impressions) || 0), 0) ?? null;
    }
    case 26: { // Meta clicks 7d
      const { data } = await supabase
        .from('campaign_metrics')
        .select('clicks')
        .eq('connection_id', merchant.connection_id)
        .gte('metric_date', new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10));
      return data?.reduce((sum, r) => sum + (Number(r.clicks) || 0), 0) ?? null;
    }
    case 27: { // Meta CPC 7d
      const { data } = await supabase
        .from('campaign_metrics')
        .select('spend, clicks')
        .eq('connection_id', merchant.connection_id)
        .gte('metric_date', new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10));
      const totalSpend = data?.reduce((s, r) => s + (Number(r.spend) || 0), 0) ?? 0;
      const totalClicks = data?.reduce((s, r) => s + (Number(r.clicks) || 0), 0) ?? 0;
      return totalClicks > 0 ? Math.round((totalSpend / totalClicks) * 100) / 100 : null;
    }
    case 28: { // Meta CPM 7d
      const { data } = await supabase
        .from('campaign_metrics')
        .select('spend, impressions')
        .eq('connection_id', merchant.connection_id)
        .gte('metric_date', new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10));
      const totalSpend = data?.reduce((s, r) => s + (Number(r.spend) || 0), 0) ?? 0;
      const totalImpressions = data?.reduce((s, r) => s + (Number(r.impressions) || 0), 0) ?? 0;
      return totalImpressions > 0 ? Math.round((totalSpend / totalImpressions * 1000) * 100) / 100 : null;
    }
    default:
      return null;
  }
}

// ─── Real value getters ──────────────────────────────────────────

async function getRealValue(
  check: ChinoCheck,
  merchant: MerchantConn,
  decryptedToken: string
): Promise<{ value: number | null; error?: string }> {
  try {
    switch (check.check_number) {
      case 11: { // Shopify revenue 7d
        const since = new Date(Date.now() - 7 * 86400_000).toISOString();
        const res = await fetchWithRetry(() =>
          fetchShopifyApi(merchant.store_url!, decryptedToken, `orders.json?status=any&created_at_min=${since}&fields=total_price&limit=250`)
        );
        if (!res.ok) return { value: null, error: `Shopify API ${res.status}` };
        const data = await res.json() as any;
        const total = (data.orders || []).reduce((s: number, o: any) => s + (parseFloat(o.total_price) || 0), 0);
        return { value: Math.round(total * 100) / 100 };
      }
      case 12: { // Shopify orders 7d
        const since = new Date(Date.now() - 7 * 86400_000).toISOString();
        const res = await fetchWithRetry(() =>
          fetchShopifyApi(merchant.store_url!, decryptedToken, `orders.json?status=any&created_at_min=${since}&fields=id&limit=250`)
        );
        if (!res.ok) return { value: null, error: `Shopify API ${res.status}` };
        const data = await res.json() as any;
        return { value: (data.orders || []).length };
      }
      case 13: { // Shopify products count
        const res = await fetchWithRetry(() =>
          fetchShopifyApi(merchant.store_url!, decryptedToken, 'products/count.json')
        );
        if (!res.ok) return { value: null, error: `Shopify API ${res.status}` };
        const data = await res.json() as any;
        return { value: data.count ?? null };
      }
      case 14: { // Shopify collections count
        const res = await fetchWithRetry(() =>
          fetchShopifyApi(merchant.store_url!, decryptedToken, 'custom_collections/count.json')
        );
        if (!res.ok) return { value: null, error: `Shopify API ${res.status}` };
        const data = await res.json() as any;
        // Also count smart collections
        const res2 = await fetchWithRetry(() =>
          fetchShopifyApi(merchant.store_url!, decryptedToken, 'smart_collections/count.json')
        );
        const data2 = res2.ok ? (await res2.json() as any) : { count: 0 };
        return { value: (data.count ?? 0) + (data2.count ?? 0) };
      }
      case 17: { // Shopify products count (same as 13 for real value)
        const res = await fetchWithRetry(() =>
          fetchShopifyApi(merchant.store_url!, decryptedToken, 'products/count.json')
        );
        if (!res.ok) return { value: null, error: `Shopify API ${res.status}` };
        const data = await res.json() as any;
        return { value: data.count ?? null };
      }
      case 21: { // Meta spend 7d
        if (!merchant.account_id) return { value: null, error: 'No account_id' };
        const res = await fetchWithRetry(() =>
          fetchMetaApi(decryptedToken, `act_${merchant.account_id}/insights?date_preset=last_7d&fields=spend`)
        );
        if (!res.ok) return { value: null, error: `Meta API ${res.status}` };
        const data = await res.json() as any;
        const spend = parseFloat(data.data?.[0]?.spend || '0');
        return { value: Math.round(spend * 100) / 100 };
      }
      case 22: { // Meta ROAS 7d
        if (!merchant.account_id) return { value: null, error: 'No account_id' };
        const res = await fetchWithRetry(() =>
          fetchMetaApi(decryptedToken, `act_${merchant.account_id}/insights?date_preset=last_7d&fields=spend,purchase_roas`)
        );
        if (!res.ok) return { value: null, error: `Meta API ${res.status}` };
        const data = await res.json() as any;
        const roas = data.data?.[0]?.purchase_roas?.[0]?.value;
        return { value: roas ? Math.round(parseFloat(roas) * 100) / 100 : null };
      }
      case 23: { // Meta active campaigns
        if (!merchant.account_id) return { value: null, error: 'No account_id' };
        const res = await fetchWithRetry(() =>
          fetchMetaApi(decryptedToken, `act_${merchant.account_id}/campaigns?effective_status=['ACTIVE']&fields=id&limit=500`)
        );
        if (!res.ok) return { value: null, error: `Meta API ${res.status}` };
        const data = await res.json() as any;
        return { value: (data.data || []).length };
      }
      case 24: { // Meta reach 7d
        if (!merchant.account_id) return { value: null, error: 'No account_id' };
        const res = await fetchWithRetry(() =>
          fetchMetaApi(decryptedToken, `act_${merchant.account_id}/insights?date_preset=last_7d&fields=reach`)
        );
        if (!res.ok) return { value: null, error: `Meta API ${res.status}` };
        const data = await res.json() as any;
        return { value: parseInt(data.data?.[0]?.reach || '0', 10) };
      }
      case 25: { // Meta impressions 7d
        if (!merchant.account_id) return { value: null, error: 'No account_id' };
        const res = await fetchWithRetry(() =>
          fetchMetaApi(decryptedToken, `act_${merchant.account_id}/insights?date_preset=last_7d&fields=impressions`)
        );
        if (!res.ok) return { value: null, error: `Meta API ${res.status}` };
        const data = await res.json() as any;
        return { value: parseInt(data.data?.[0]?.impressions || '0', 10) };
      }
      case 26: { // Meta clicks 7d
        if (!merchant.account_id) return { value: null, error: 'No account_id' };
        const res = await fetchWithRetry(() =>
          fetchMetaApi(decryptedToken, `act_${merchant.account_id}/insights?date_preset=last_7d&fields=clicks`)
        );
        if (!res.ok) return { value: null, error: `Meta API ${res.status}` };
        const data = await res.json() as any;
        return { value: parseInt(data.data?.[0]?.clicks || '0', 10) };
      }
      case 27: { // Meta CPC 7d
        if (!merchant.account_id) return { value: null, error: 'No account_id' };
        const res = await fetchWithRetry(() =>
          fetchMetaApi(decryptedToken, `act_${merchant.account_id}/insights?date_preset=last_7d&fields=cpc`)
        );
        if (!res.ok) return { value: null, error: `Meta API ${res.status}` };
        const data = await res.json() as any;
        const cpc = parseFloat(data.data?.[0]?.cpc || '0');
        return { value: Math.round(cpc * 100) / 100 };
      }
      case 28: { // Meta CPM 7d
        if (!merchant.account_id) return { value: null, error: 'No account_id' };
        const res = await fetchWithRetry(() =>
          fetchMetaApi(decryptedToken, `act_${merchant.account_id}/insights?date_preset=last_7d&fields=cpm`)
        );
        if (!res.ok) return { value: null, error: `Meta API ${res.status}` };
        const data = await res.json() as any;
        const cpm = parseFloat(data.data?.[0]?.cpm || '0');
        return { value: Math.round(cpm * 100) / 100 };
      }
      default:
        return { value: null, error: `Numeric compare not implemented for check #${check.check_number}` };
    }
  } catch (err: any) {
    return { value: null, error: err.name === 'AbortError' ? 'Timeout (30s)' : err.message };
  }
}

// ─── Main executor ───────────────────────────────────────────────

export async function executeApiCompare(
  supabase: SupabaseClient,
  check: ChinoCheck,
  merchant: MerchantConn,
  decryptedToken: string | null
): Promise<CheckResult> {
  // Category A: Connectivity checks
  const connectivityChecks = [1, 2, 3, 6];
  if (connectivityChecks.includes(check.check_number)) {
    return executeConnectivity(check, merchant, decryptedToken);
  }

  // Category B: Numeric comparison
  const start = Date.now();

  if (!decryptedToken) {
    return {
      result: 'fail',
      error_message: 'No hay token para comparar datos',
      duration_ms: Date.now() - start,
    };
  }

  const steveValue = await getSteveValue(supabase, check, merchant);
  const realResult = await getRealValue(check, merchant, decryptedToken);

  if (realResult.error) {
    return {
      result: 'error',
      steve_value: steveValue,
      error_message: realResult.error,
      duration_ms: Date.now() - start,
    };
  }

  if (steveValue === null || realResult.value === null) {
    return {
      result: 'skip',
      steve_value: steveValue,
      real_value: realResult.value,
      error_message: 'No hay datos suficientes para comparar',
      duration_ms: Date.now() - start,
    };
  }

  // Compare with tolerance
  const tolerance = (check.check_config?.tolerance_pct as number) ?? 10;
  const diff = Math.abs(steveValue - realResult.value);
  const maxDiff = Math.abs(realResult.value) * (tolerance / 100);

  if (diff <= maxDiff || (realResult.value === 0 && steveValue === 0)) {
    return {
      result: 'pass',
      steve_value: steveValue,
      real_value: realResult.value,
      duration_ms: Date.now() - start,
    };
  }

  const pctDiff = realResult.value !== 0
    ? Math.round((diff / Math.abs(realResult.value)) * 100)
    : 100;

  return {
    result: 'fail',
    steve_value: steveValue,
    real_value: realResult.value,
    error_message: `Diferencia de ${pctDiff}% (tolerancia: ${tolerance}%)`,
    duration_ms: Date.now() - start,
  };
}
