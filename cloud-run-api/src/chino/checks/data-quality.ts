// El Chino — data_quality check executor
// 16 deterministic validations matched to real DB descriptions

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChinoCheck, MerchantConn, CheckResult } from '../types.js';

// ─── Shared helper: fetch with timeout ───────────────────────────

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 15000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Shopify API helper ──────────────────────────────────────────

function shopifyApi(storeUrl: string, token: string, path: string): Promise<Response> {
  const base = storeUrl.replace(/\/+$/, '');
  const url = `${base}/admin/api/2025-01/${path}`;
  return fetchWithTimeout(url, {
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
  });
}

// ─── Check 7: No duplicate platform_connections per merchant+platform ─

async function check7_duplicateConnections(
  supabase: SupabaseClient
): Promise<CheckResult> {
  const start = Date.now();
  const { data, error } = await supabase
    .from('platform_connections')
    .select('client_id, platform')
    .eq('is_active', true);

  if (error) throw new Error(`DB error: ${error.message}`);
  if (!data || data.length === 0) {
    return { result: 'pass', steve_value: '0 connections', duration_ms: Date.now() - start };
  }

  const groups = new Map<string, number>();
  for (const row of data) {
    const key = `${row.client_id}::${row.platform}`;
    groups.set(key, (groups.get(key) || 0) + 1);
  }

  const dupes = [...groups.entries()].filter(([, count]) => count > 1);
  if (dupes.length > 0) {
    const details = dupes.map(([key, count]) => `${key} (${count}x)`).slice(0, 5).join('; ');
    return {
      result: 'fail',
      steve_value: `${dupes.length} duplicados`,
      error_message: `Conexiones duplicadas: ${details}`,
      duration_ms: Date.now() - start,
    };
  }

  return {
    result: 'pass',
    steve_value: `${data.length} conexiones, 0 duplicados`,
    duration_ms: Date.now() - start,
  };
}

// ─── Check 10: No connection > 24h without successful sync ──────

async function check10_staleSync(
  supabase: SupabaseClient,
  check: ChinoCheck
): Promise<CheckResult> {
  const start = Date.now();
  const maxHours = (check.check_config?.max_hours as number) || 24;

  const { data, error } = await supabase
    .from('platform_connections')
    .select('id, client_id, platform, last_sync_at')
    .eq('is_active', true);

  if (error) throw new Error(`DB error: ${error.message}`);
  if (!data || data.length === 0) {
    return { result: 'pass', steve_value: '0 conexiones activas', duration_ms: Date.now() - start };
  }

  const cutoff = Date.now() - maxHours * 3600_000;
  const stale = data.filter((row) => {
    if (!row.last_sync_at) return true; // never synced = stale
    return new Date(row.last_sync_at).getTime() < cutoff;
  });

  if (stale.length > 0) {
    const details = stale
      .slice(0, 5)
      .map((r) => `${r.platform}/${r.client_id} (last: ${r.last_sync_at || 'never'})`)
      .join('; ');
    return {
      result: 'fail',
      steve_value: `${stale.length} conexiones atrasadas`,
      error_message: `Conexiones sin sync >${maxHours}h: ${details}`,
      duration_ms: Date.now() - start,
    };
  }

  return {
    result: 'pass',
    steve_value: `${data.length} conexiones, todas sincronizadas <${maxHours}h`,
    duration_ms: Date.now() - start,
  };
}

// ─── Check 15: No products in Supabase that don't exist in Shopify ─

async function check15_supabaseProductsExistInShopify(
  supabase: SupabaseClient,
  merchant: MerchantConn,
  token: string
): Promise<CheckResult> {
  const start = Date.now();

  const { data: products, error } = await supabase
    .from('shopify_products')
    .select('shopify_product_id')
    .eq('client_id', merchant.client_id);

  if (error) throw new Error(`DB error: ${error.message}`);
  if (!products || products.length === 0) {
    return { result: 'pass', steve_value: '0 products in DB', duration_ms: Date.now() - start };
  }

  const ids = products.map((p) => p.shopify_product_id).filter(Boolean);
  if (ids.length === 0) {
    return { result: 'pass', steve_value: 'No shopify_product_ids', duration_ms: Date.now() - start };
  }

  // Shopify limits ids param; check in batches of 100
  const missing: string[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const resp = await shopifyApi(
      merchant.store_url!,
      token,
      `products.json?ids=${batch.join(',')}&fields=id`
    );
    if (!resp.ok) throw new Error(`Shopify API ${resp.status}: ${await resp.text()}`);
    const json = await resp.json() as any;
    const found = new Set((json.products || []).map((p: any) => String(p.id)));
    for (const id of batch) {
      if (!found.has(String(id))) missing.push(String(id));
    }
  }

  if (missing.length > 0) {
    return {
      result: 'fail',
      steve_value: `${missing.length} fantasma(s) en Supabase`,
      error_message: `Products in Supabase not in Shopify: ${missing.slice(0, 5).join(', ')}`,
      duration_ms: Date.now() - start,
    };
  }

  return {
    result: 'pass',
    steve_value: `${ids.length} productos verificados`,
    duration_ms: Date.now() - start,
  };
}

// ─── Check 16: No products in Shopify missing from Supabase ─────

async function check16_shopifyProductsMissingInSupabase(
  supabase: SupabaseClient,
  merchant: MerchantConn,
  token: string
): Promise<CheckResult> {
  const start = Date.now();

  // Count in Shopify
  const resp = await shopifyApi(merchant.store_url!, token, 'products/count.json');
  if (!resp.ok) throw new Error(`Shopify API ${resp.status}: ${await resp.text()}`);
  const { count: shopifyCount } = await resp.json() as any;

  // Count in Supabase
  const { count: dbCount, error } = await supabase
    .from('shopify_products')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', merchant.client_id);

  if (error) throw new Error(`DB error: ${error.message}`);

  const diff = shopifyCount - (dbCount || 0);
  if (diff > 0) {
    return {
      result: 'fail',
      steve_value: `Shopify: ${shopifyCount}, Supabase: ${dbCount || 0}`,
      error_message: `Faltan ${diff} productos de Shopify en Supabase`,
      duration_ms: Date.now() - start,
    };
  }

  return {
    result: 'pass',
    steve_value: `Shopify: ${shopifyCount}, Supabase: ${dbCount || 0}`,
    duration_ms: Date.now() - start,
  };
}

// ─── Check 18: Product images load (no 404) ─────────────────────

async function check18_productImagesLoad(
  supabase: SupabaseClient,
  merchant: MerchantConn,
  token: string,
  check: ChinoCheck
): Promise<CheckResult> {
  const start = Date.now();
  const sampleSize = (check.check_config?.sample_size as number) || 10;

  // Try DB first
  const { data: dbProducts } = await supabase
    .from('shopify_products')
    .select('image_url')
    .eq('client_id', merchant.client_id)
    .not('image_url', 'is', null)
    .limit(sampleSize);

  let imageUrls: string[] = (dbProducts || []).map((p) => p.image_url).filter(Boolean);

  // Fallback to Shopify API if DB is empty
  if (imageUrls.length === 0) {
    const resp = await shopifyApi(
      merchant.store_url!,
      token,
      `products.json?fields=id,images&limit=${sampleSize}`
    );
    if (!resp.ok) throw new Error(`Shopify API ${resp.status}: ${await resp.text()}`);
    const json = await resp.json() as any;
    for (const product of json.products || []) {
      for (const img of product.images || []) {
        if (img.src) imageUrls.push(img.src);
      }
    }
    imageUrls = imageUrls.slice(0, sampleSize);
  }

  if (imageUrls.length === 0) {
    return { result: 'skip', error_message: 'No product images found', duration_ms: Date.now() - start };
  }

  const broken: string[] = [];
  for (const url of imageUrls) {
    try {
      const resp = await fetchWithTimeout(url, { method: 'HEAD' }, 10000);
      if (resp.status === 404 || resp.status === 410) {
        broken.push(url);
      }
    } catch {
      broken.push(url);
    }
  }

  if (broken.length > 0) {
    return {
      result: 'fail',
      steve_value: `${broken.length}/${imageUrls.length} broken`,
      error_message: `Broken images: ${broken.slice(0, 3).join(', ')}`,
      duration_ms: Date.now() - start,
    };
  }

  return {
    result: 'pass',
    steve_value: `${imageUrls.length} images OK`,
    duration_ms: Date.now() - start,
  };
}

// ─── Check 19: Revenue today > 0 if merchant normally sells ─────

async function check19_revenueToday(
  merchant: MerchantConn,
  token: string,
  check: ChinoCheck
): Promise<CheckResult> {
  const start = Date.now();
  const minDailyAvg = (check.check_config?.min_daily_avg as number) || 3;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const createdAtMin = todayStart.toISOString();

  const resp = await shopifyApi(
    merchant.store_url!,
    token,
    `orders.json?created_at_min=${encodeURIComponent(createdAtMin)}&status=any&fields=id,total_price`
  );
  if (!resp.ok) throw new Error(`Shopify API ${resp.status}: ${await resp.text()}`);
  const json = await resp.json() as any;
  const orders = json.orders || [];

  const revenue = orders.reduce((sum: number, o: any) => sum + (parseFloat(o.total_price) || 0), 0);

  if (revenue === 0 && minDailyAvg > 0) {
    return {
      result: 'fail',
      steve_value: `$0 revenue hoy`,
      error_message: `Revenue hoy = $0. Merchant normalmente tiene ~${minDailyAvg} orders/dia`,
      duration_ms: Date.now() - start,
    };
  }

  return {
    result: 'pass',
    steve_value: `$${revenue.toFixed(2)} revenue hoy (${orders.length} orders)`,
    duration_ms: Date.now() - start,
  };
}

// ─── Check 20: Most recent order is from today ──────────────────

async function check20_recentOrder(
  merchant: MerchantConn,
  token: string,
  check: ChinoCheck
): Promise<CheckResult> {
  const start = Date.now();
  const maxHoursOld = (check.check_config?.max_hours_old as number) || 24;

  const resp = await shopifyApi(
    merchant.store_url!,
    token,
    'orders.json?limit=1&order=created_at+desc&status=any&fields=id,created_at'
  );
  if (!resp.ok) throw new Error(`Shopify API ${resp.status}: ${await resp.text()}`);
  const json = await resp.json() as any;
  const orders = json.orders || [];

  if (orders.length === 0) {
    return { result: 'skip', error_message: 'No orders found', duration_ms: Date.now() - start };
  }

  const lastOrderTime = new Date(orders[0].created_at).getTime();
  const hoursAgo = (Date.now() - lastOrderTime) / 3600_000;

  if (hoursAgo > maxHoursOld) {
    return {
      result: 'fail',
      steve_value: `${hoursAgo.toFixed(1)}h ago`,
      error_message: `Last order is ${hoursAgo.toFixed(1)}h old (max: ${maxHoursOld}h)`,
      duration_ms: Date.now() - start,
    };
  }

  return {
    result: 'pass',
    steve_value: `Last order ${hoursAgo.toFixed(1)}h ago`,
    duration_ms: Date.now() - start,
  };
}

// ─── Check 29: Campaigns in Meta not in Steve ───────────────────

async function check29_metaCampaignsNotInSteve(
  supabase: SupabaseClient,
  merchant: MerchantConn,
  token: string
): Promise<CheckResult> {
  const start = Date.now();

  if (!merchant.account_id) {
    return { result: 'skip', error_message: 'No account_id configured', duration_ms: Date.now() - start };
  }

  const accountId = merchant.account_id.startsWith('act_')
    ? merchant.account_id
    : `act_${merchant.account_id}`;

  const resp = await fetchWithTimeout(
    `https://graph.facebook.com/v21.0/${accountId}/campaigns?fields=id,name,status&access_token=${token}`,
    { method: 'GET' }
  );
  if (!resp.ok) throw new Error(`Meta API ${resp.status}: ${await resp.text()}`);
  const json = await resp.json() as any;
  const metaCampaigns: { id: string; name: string }[] = json.data || [];

  // Get DB campaigns
  const { data: dbCampaigns, error } = await supabase
    .from('campaign_metrics')
    .select('campaign_id')
    .eq('platform', 'meta');

  if (error) throw new Error(`DB error: ${error.message}`);

  const dbIds = new Set((dbCampaigns || []).map((c) => String(c.campaign_id)));
  const missing = metaCampaigns.filter((c) => !dbIds.has(String(c.id)));

  if (missing.length > 0) {
    const names = missing.slice(0, 5).map((c) => `${c.name} (${c.id})`).join('; ');
    return {
      result: 'fail',
      steve_value: `${missing.length} campaigns missing in Steve`,
      error_message: `Meta campaigns not in Steve: ${names}`,
      duration_ms: Date.now() - start,
    };
  }

  return {
    result: 'pass',
    steve_value: `${metaCampaigns.length} Meta campaigns synced`,
    duration_ms: Date.now() - start,
  };
}

// ─── Check 30: Campaigns in Steve not in Meta ───────────────────

async function check30_steveCampaignsNotInMeta(
  supabase: SupabaseClient,
  merchant: MerchantConn,
  token: string
): Promise<CheckResult> {
  const start = Date.now();

  if (!merchant.account_id) {
    return { result: 'skip', error_message: 'No account_id configured', duration_ms: Date.now() - start };
  }

  const accountId = merchant.account_id.startsWith('act_')
    ? merchant.account_id
    : `act_${merchant.account_id}`;

  const resp = await fetchWithTimeout(
    `https://graph.facebook.com/v21.0/${accountId}/campaigns?fields=id&access_token=${token}`,
    { method: 'GET' }
  );
  if (!resp.ok) throw new Error(`Meta API ${resp.status}: ${await resp.text()}`);
  const json = await resp.json() as any;
  const metaIds = new Set((json.data || []).map((c: any) => String(c.id)));

  // Get DB campaigns
  const { data: dbCampaigns, error } = await supabase
    .from('campaign_metrics')
    .select('campaign_id, campaign_name')
    .eq('platform', 'meta');

  if (error) throw new Error(`DB error: ${error.message}`);

  const uniqueDb = new Map<string, string>();
  for (const c of dbCampaigns || []) {
    if (c.campaign_id) uniqueDb.set(String(c.campaign_id), c.campaign_name || '');
  }

  const orphaned = [...uniqueDb.entries()].filter(([id]) => !metaIds.has(id));

  if (orphaned.length > 0) {
    const names = orphaned.slice(0, 5).map(([id, name]) => `${name || id} (${id})`).join('; ');
    return {
      result: 'fail',
      steve_value: `${orphaned.length} orphaned in Steve`,
      error_message: `Steve campaigns not in Meta: ${names}`,
      duration_ms: Date.now() - start,
    };
  }

  return {
    result: 'pass',
    steve_value: `${uniqueDb.size} Steve campaigns verified in Meta`,
    duration_ms: Date.now() - start,
  };
}

// ─── Check 37: Campaigns in Klaviyo not in Steve ────────────────

async function check37_klaviyoCampaignsNotInSteve(
  supabase: SupabaseClient,
  _merchant: MerchantConn,
  token: string
): Promise<CheckResult> {
  const start = Date.now();

  const resp = await fetchWithTimeout(
    'https://a.klaviyo.com/api/campaigns/?filter=equals(messages.channel,\'email\')',
    {
      method: 'GET',
      headers: {
        'Authorization': `Klaviyo-API-Key ${token}`,
        'revision': '2024-10-15',
        'Accept': 'application/json',
      },
    }
  );
  if (!resp.ok) throw new Error(`Klaviyo API ${resp.status}: ${await resp.text()}`);
  const json = await resp.json() as any;
  const klaviyoCampaigns: { id: string; attributes?: { name?: string } }[] = json.data || [];

  // Get DB campaigns
  const { data: dbCampaigns, error } = await supabase
    .from('campaign_metrics')
    .select('campaign_id')
    .eq('platform', 'klaviyo');

  if (error) throw new Error(`DB error: ${error.message}`);

  const dbIds = new Set((dbCampaigns || []).map((c) => String(c.campaign_id)));
  const missing = klaviyoCampaigns.filter((c) => !dbIds.has(String(c.id)));

  if (missing.length > 0) {
    const names = missing.slice(0, 5).map((c) => `${c.attributes?.name || c.id}`).join('; ');
    return {
      result: 'fail',
      steve_value: `${missing.length} Klaviyo campaigns missing`,
      error_message: `Klaviyo campaigns not in Steve: ${names}`,
      duration_ms: Date.now() - start,
    };
  }

  return {
    result: 'pass',
    steve_value: `${klaviyoCampaigns.length} Klaviyo campaigns synced`,
    duration_ms: Date.now() - start,
  };
}

// ─── Check 38: Bounce rate < 1% ────────────────────────────────

async function check38_bounceRate(
  supabase: SupabaseClient,
  merchant: MerchantConn,
  check: ChinoCheck
): Promise<CheckResult> {
  const start = Date.now();
  const maxBounce = (check.check_config?.max_bounce as number) || 0.01;

  // Try DB first
  const { data } = await supabase
    .from('platform_metrics')
    .select('metric_value')
    .eq('connection_id', merchant.connection_id)
    .eq('metric_type', 'bounce_rate')
    .order('metric_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data?.metric_value != null) {
    const rate = Number(data.metric_value);
    if (rate > maxBounce) {
      return {
        result: 'fail',
        steve_value: `${(rate * 100).toFixed(2)}%`,
        error_message: `Bounce rate ${(rate * 100).toFixed(2)}% > max ${(maxBounce * 100).toFixed(1)}%`,
        duration_ms: Date.now() - start,
      };
    }
    return {
      result: 'pass',
      steve_value: `Bounce rate ${(rate * 100).toFixed(2)}%`,
      duration_ms: Date.now() - start,
    };
  }

  return { result: 'skip', error_message: 'No bounce_rate data in platform_metrics', duration_ms: Date.now() - start };
}

// ─── Check 39: Spam rate < 0.1% ────────────────────────────────

async function check39_spamRate(
  supabase: SupabaseClient,
  merchant: MerchantConn,
  check: ChinoCheck
): Promise<CheckResult> {
  const start = Date.now();
  const maxSpam = (check.check_config?.max_spam as number) || 0.001;

  const { data } = await supabase
    .from('platform_metrics')
    .select('metric_value')
    .eq('connection_id', merchant.connection_id)
    .eq('metric_type', 'spam_rate')
    .order('metric_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data?.metric_value != null) {
    const rate = Number(data.metric_value);
    if (rate > maxSpam) {
      return {
        result: 'fail',
        steve_value: `${(rate * 100).toFixed(3)}%`,
        error_message: `Spam rate ${(rate * 100).toFixed(3)}% > max ${(maxSpam * 100).toFixed(2)}%`,
        duration_ms: Date.now() - start,
      };
    }
    return {
      result: 'pass',
      steve_value: `Spam rate ${(rate * 100).toFixed(3)}%`,
      duration_ms: Date.now() - start,
    };
  }

  return { result: 'skip', error_message: 'No spam_rate data in platform_metrics', duration_ms: Date.now() - start };
}

// ─── Check 40: SPF + DKIM verified ─────────────────────────────

async function check40_deliverability(
  supabase: SupabaseClient,
  merchant: MerchantConn
): Promise<CheckResult> {
  const start = Date.now();

  // Check platform_metrics for spf_pass and dkim_pass
  const { data: spfData } = await supabase
    .from('platform_metrics')
    .select('metric_value')
    .eq('connection_id', merchant.connection_id)
    .eq('metric_type', 'spf_pass')
    .order('metric_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: dkimData } = await supabase
    .from('platform_metrics')
    .select('metric_value')
    .eq('connection_id', merchant.connection_id)
    .eq('metric_type', 'dkim_pass')
    .order('metric_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!spfData && !dkimData) {
    return { result: 'skip', error_message: 'No SPF/DKIM data in platform_metrics', duration_ms: Date.now() - start };
  }

  const spfOk = spfData?.metric_value === 'true' || spfData?.metric_value === '1' || Number(spfData?.metric_value) === 1;
  const dkimOk = dkimData?.metric_value === 'true' || dkimData?.metric_value === '1' || Number(dkimData?.metric_value) === 1;

  const issues: string[] = [];
  if (!spfOk) issues.push('SPF not verified');
  if (!dkimOk) issues.push('DKIM not verified');

  if (issues.length > 0) {
    return {
      result: 'fail',
      steve_value: issues.join(', '),
      error_message: `Deliverability issues: ${issues.join(', ')}`,
      duration_ms: Date.now() - start,
    };
  }

  return {
    result: 'pass',
    steve_value: 'SPF + DKIM verified',
    duration_ms: Date.now() - start,
  };
}

// ─── Check 43: Steve Chat responds in Spanish ───────────────────

async function check43_chatSpanish(): Promise<CheckResult> {
  const start = Date.now();

  // Call Steve Chat internally
  const apiBase = process.env.STEVE_API_URL || 'https://steve-api-850416724643.us-central1.run.app';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  let chatResponse: string;
  try {
    const resp = await fetchWithTimeout(
      `${apiBase}/api/ai/steve-chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          message: '¿Cuáles son las métricas de hoy?',
          system_test: true,
        }),
      },
      20000
    );
    if (!resp.ok) {
      return {
        result: 'skip',
        error_message: `Steve Chat returned ${resp.status}`,
        duration_ms: Date.now() - start,
      };
    }
    const json = await resp.json() as any;
    chatResponse = (json.response || json.message || json.reply || '').toLowerCase();
  } catch (err: any) {
    return {
      result: 'skip',
      error_message: `Steve Chat unreachable: ${err.message}`,
      duration_ms: Date.now() - start,
    };
  }

  if (!chatResponse || chatResponse.length < 10) {
    return { result: 'skip', error_message: 'Empty response from Steve Chat', duration_ms: Date.now() - start };
  }

  // Count Spanish vs English words
  const englishWords = ['the', ' and ', 'your', 'campaign', 'data', 'here', 'today', 'metrics', 'have', 'from'];
  const spanishWords = [' las ', ' los ', ' del ', ' para ', 'métricas', 'hoy', 'tienes', 'datos', 'tus', 'aquí'];

  let enCount = 0;
  let esCount = 0;
  for (const w of englishWords) {
    if (chatResponse.includes(w)) enCount++;
  }
  for (const w of spanishWords) {
    if (chatResponse.includes(w)) esCount++;
  }

  if (enCount > esCount && enCount >= 3) {
    return {
      result: 'fail',
      steve_value: `EN:${enCount} ES:${esCount}`,
      error_message: `Steve Chat respondió en inglés (EN:${enCount} vs ES:${esCount})`,
      duration_ms: Date.now() - start,
    };
  }

  return {
    result: 'pass',
    steve_value: `ES:${esCount} EN:${enCount}`,
    duration_ms: Date.now() - start,
  };
}

// ─── Check 49: Brief mentions real merchant data ────────────────

async function check49_briefMentionsRealData(
  supabase: SupabaseClient
): Promise<CheckResult> {
  const start = Date.now();

  // Get recent briefs
  const { data: briefs, error: briefErr } = await supabase
    .from('steve_knowledge')
    .select('contenido, client_id')
    .eq('categoria', 'brief')
    .order('created_at', { ascending: false })
    .limit(5);

  if (briefErr) throw new Error(`DB error: ${briefErr.message}`);
  if (!briefs || briefs.length === 0) {
    return { result: 'skip', error_message: 'No briefs found', duration_ms: Date.now() - start };
  }

  // Get merchant names
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name')
    .limit(50);

  const clientNames = (clients || []).map((c) => c.name?.toLowerCase()).filter(Boolean) as string[];

  if (clientNames.length === 0) {
    return { result: 'skip', error_message: 'No clients in DB', duration_ms: Date.now() - start };
  }

  // Check if any brief mentions a real client name
  let found = false;
  for (const brief of briefs) {
    const content = (brief.contenido || '').toLowerCase();
    if (clientNames.some((name) => content.includes(name))) {
      found = true;
      break;
    }
  }

  if (!found) {
    return {
      result: 'fail',
      steve_value: `${briefs.length} briefs checked`,
      error_message: 'Ningún brief menciona datos reales de un merchant',
      duration_ms: Date.now() - start,
    };
  }

  return {
    result: 'pass',
    steve_value: `Briefs mencionan merchants reales`,
    duration_ms: Date.now() - start,
  };
}

// ─── Check 50: Scraping results have 2025-2026 data ────────────

async function check50_scrapingFreshData(
  supabase: SupabaseClient
): Promise<CheckResult> {
  const start = Date.now();

  const { data, error } = await supabase
    .from('steve_knowledge')
    .select('source_url, created_at')
    .not('source_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) throw new Error(`DB error: ${error.message}`);
  if (!data || data.length === 0) {
    return {
      result: 'fail',
      steve_value: '0 scraping results',
      error_message: 'No hay datos de scraping (source_url) en steve_knowledge',
      duration_ms: Date.now() - start,
    };
  }

  const hasFresh = data.some((row) => {
    if (!row.created_at) return false;
    const year = new Date(row.created_at).getFullYear();
    return year >= 2025;
  });

  if (!hasFresh) {
    return {
      result: 'fail',
      steve_value: `${data.length} results, none from 2025+`,
      error_message: 'Datos de scraping no tienen registros de 2025-2026',
      duration_ms: Date.now() - start,
    };
  }

  return {
    result: 'pass',
    steve_value: `${data.length} scraping results with fresh data`,
    duration_ms: Date.now() - start,
  };
}

// ─── Main data_quality executor ──────────────────────────────────

export async function executeDataQuality(
  supabase: SupabaseClient,
  check: ChinoCheck,
  merchant?: MerchantConn | null,
  decryptedToken?: string | null
): Promise<CheckResult> {
  const start = Date.now();

  try {
    switch (check.check_number) {
      // ── platform: all ──
      case 7:
        return await check7_duplicateConnections(supabase);

      case 10:
        return await check10_staleSync(supabase, check);

      // ── platform: shopify (need token + store_url) ──
      case 15:
        if (!merchant?.store_url || !decryptedToken) {
          return { result: 'skip', error_message: 'Shopify token o store_url no disponible', duration_ms: Date.now() - start };
        }
        return await check15_supabaseProductsExistInShopify(supabase, merchant, decryptedToken);

      case 16:
        if (!merchant?.store_url || !decryptedToken) {
          return { result: 'skip', error_message: 'Shopify token o store_url no disponible', duration_ms: Date.now() - start };
        }
        return await check16_shopifyProductsMissingInSupabase(supabase, merchant, decryptedToken);

      case 18:
        if (!merchant?.store_url || !decryptedToken) {
          return { result: 'skip', error_message: 'Shopify token o store_url no disponible', duration_ms: Date.now() - start };
        }
        return await check18_productImagesLoad(supabase, merchant, decryptedToken, check);

      case 19:
        if (!merchant?.store_url || !decryptedToken) {
          return { result: 'skip', error_message: 'Shopify token o store_url no disponible', duration_ms: Date.now() - start };
        }
        return await check19_revenueToday(merchant, decryptedToken, check);

      case 20:
        if (!merchant?.store_url || !decryptedToken) {
          return { result: 'skip', error_message: 'Shopify token o store_url no disponible', duration_ms: Date.now() - start };
        }
        return await check20_recentOrder(merchant, decryptedToken, check);

      // ── platform: meta (need token + account_id) ──
      case 29:
        if (!merchant || !decryptedToken) {
          return { result: 'skip', error_message: 'Meta token no disponible', duration_ms: Date.now() - start };
        }
        return await check29_metaCampaignsNotInSteve(supabase, merchant, decryptedToken);

      case 30:
        if (!merchant || !decryptedToken) {
          return { result: 'skip', error_message: 'Meta token no disponible', duration_ms: Date.now() - start };
        }
        return await check30_steveCampaignsNotInMeta(supabase, merchant, decryptedToken);

      // ── platform: klaviyo (need token) ──
      case 37:
        if (!merchant || !decryptedToken) {
          return { result: 'skip', error_message: 'Klaviyo token no disponible', duration_ms: Date.now() - start };
        }
        return await check37_klaviyoCampaignsNotInSteve(supabase, merchant, decryptedToken);

      case 38:
        if (!merchant) {
          return { result: 'skip', error_message: 'No merchant connection', duration_ms: Date.now() - start };
        }
        return await check38_bounceRate(supabase, merchant, check);

      case 39:
        if (!merchant) {
          return { result: 'skip', error_message: 'No merchant connection', duration_ms: Date.now() - start };
        }
        return await check39_spamRate(supabase, merchant, check);

      case 40:
        if (!merchant) {
          return { result: 'skip', error_message: 'No merchant connection', duration_ms: Date.now() - start };
        }
        return await check40_deliverability(supabase, merchant);

      // ── platform: steve_chat ──
      case 43:
        return await check43_chatSpanish();

      // ── platform: brief ──
      case 49:
        return await check49_briefMentionsRealData(supabase);

      // ── platform: scraping ──
      case 50:
        return await check50_scrapingFreshData(supabase);

      default:
        return {
          result: 'skip',
          error_message: `data_quality check #${check.check_number} not implemented`,
          duration_ms: Date.now() - start,
        };
    }
  } catch (err: any) {
    return {
      result: 'error',
      error_message: err.message,
      duration_ms: Date.now() - start,
    };
  }
}
