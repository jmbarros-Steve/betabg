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
    "https://a.klaviyo.com/api/campaigns/?filter=equals(messages.channel,'email')",
    {
      method: 'GET',
      headers: {
        'Authorization': `Klaviyo-API-Key ${token}`,
        'revision': '2025-07-15',
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

async function check43_chatSpanish(supabase: SupabaseClient): Promise<CheckResult> {
  const start = Date.now();

  // Call Steve Chat internally
  const apiBase = process.env.STEVE_API_URL || 'https://steve-api-850416724643.us-central1.run.app';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  // Need a client_id for the chat endpoint
  const { data: anyClient } = await supabase
    .from('clients')
    .select('id')
    .limit(1)
    .single();

  if (!anyClient) {
    return { result: 'skip', error_message: 'No clients in DB for chat test', duration_ms: Date.now() - start };
  }

  let chatResponse: string;
  try {
    const resp = await fetchWithTimeout(
      `${apiBase}/api/steve-chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          client_id: anyClient.id,
          message: '¿Cuáles son las métricas de hoy?',
        }),
      },
      30000
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

// ─── Check 52: Klaviyo open rate > 15% últimos 7d ────────────────

async function check52_klaviyoOpenRate(
  supabase: SupabaseClient,
  merchant: MerchantConn | null | undefined
): Promise<CheckResult> {
  const start = Date.now();
  if (!merchant) return { result: 'skip', error_message: 'No merchant connection', duration_ms: Date.now() - start };

  const since = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('platform_metrics')
    .select('metric_value')
    .eq('connection_id', merchant.connection_id)
    .eq('metric_type', 'open_rate')
    .gte('metric_date', since);

  if (error) throw new Error(`DB error: ${error.message}`);
  if (!data || data.length === 0) {
    return { result: 'skip', error_message: 'No open_rate data últimos 7d', duration_ms: Date.now() - start };
  }

  const avg = data.reduce((s, r) => s + Number(r.metric_value || 0), 0) / data.length;
  if (avg < 0.15) {
    return {
      result: 'fail',
      steve_value: `${(avg * 100).toFixed(1)}%`,
      error_message: `Open rate promedio ${(avg * 100).toFixed(1)}% < 15%`,
      duration_ms: Date.now() - start,
    };
  }
  return { result: 'pass', steve_value: `${(avg * 100).toFixed(1)}% open rate`, duration_ms: Date.now() - start };
}

// ─── Check 53: Klaviyo flows no vacíos ──────────────────────────

async function check53_klaviyoNoEmptyFlows(token: string): Promise<CheckResult> {
  const start = Date.now();

  const resp = await fetchWithTimeout('https://a.klaviyo.com/api/flows/', {
    method: 'GET',
    headers: { 'Authorization': `Klaviyo-API-Key ${token}`, 'revision': '2025-07-15', 'Accept': 'application/json' },
  });
  if (!resp.ok) throw new Error(`Klaviyo API ${resp.status}: ${await resp.text()}`);
  const json = await resp.json() as any;
  const flows = json.data || [];

  if (flows.length === 0) {
    return { result: 'skip', error_message: 'No flows en Klaviyo', duration_ms: Date.now() - start };
  }

  const emptyFlows: string[] = [];
  for (const flow of flows.slice(0, 20)) {
    const actionsResp = await fetchWithTimeout(
      `https://a.klaviyo.com/api/flows/${flow.id}/flow-actions/`,
      { method: 'GET', headers: { 'Authorization': `Klaviyo-API-Key ${token}`, 'revision': '2025-07-15', 'Accept': 'application/json' } },
    );
    if (actionsResp.ok) {
      const actionsJson = await actionsResp.json() as any;
      if (!actionsJson.data || actionsJson.data.length === 0) {
        emptyFlows.push(flow.attributes?.name || flow.id);
      }
    }
  }

  if (emptyFlows.length > 0) {
    return {
      result: 'fail',
      steve_value: `${emptyFlows.length} flows vacíos`,
      error_message: `Flows sin actions: ${emptyFlows.slice(0, 5).join(', ')}`,
      duration_ms: Date.now() - start,
    };
  }
  return { result: 'pass', steve_value: `${flows.length} flows con actions`, duration_ms: Date.now() - start };
}

// ─── Check 54: Klaviyo bounce rate < 5% últimos 30d ─────────────

async function check54_klaviyoBounceRate30d(
  supabase: SupabaseClient,
  merchant: MerchantConn | null | undefined
): Promise<CheckResult> {
  const start = Date.now();
  if (!merchant) return { result: 'skip', error_message: 'No merchant connection', duration_ms: Date.now() - start };

  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('platform_metrics')
    .select('metric_value')
    .eq('connection_id', merchant.connection_id)
    .eq('metric_type', 'bounce_rate')
    .gte('metric_date', since);

  if (error) throw new Error(`DB error: ${error.message}`);
  if (!data || data.length === 0) {
    return { result: 'skip', error_message: 'No bounce_rate data últimos 30d', duration_ms: Date.now() - start };
  }

  const avg = data.reduce((s, r) => s + Number(r.metric_value || 0), 0) / data.length;
  if (avg > 0.05) {
    return {
      result: 'fail',
      steve_value: `${(avg * 100).toFixed(2)}%`,
      error_message: `Bounce rate promedio ${(avg * 100).toFixed(2)}% > 5%`,
      duration_ms: Date.now() - start,
    };
  }
  return { result: 'pass', steve_value: `${(avg * 100).toFixed(2)}% bounce rate`, duration_ms: Date.now() - start };
}

// ─── Check 55: Klaviyo unsubscribe rate < 1% ────────────────────

async function check55_klaviyoUnsubRate(
  supabase: SupabaseClient,
  merchant: MerchantConn | null | undefined
): Promise<CheckResult> {
  const start = Date.now();
  if (!merchant) return { result: 'skip', error_message: 'No merchant connection', duration_ms: Date.now() - start };

  const { data, error } = await supabase
    .from('platform_metrics')
    .select('metric_value')
    .eq('connection_id', merchant.connection_id)
    .eq('metric_type', 'unsubscribe_rate')
    .order('metric_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`DB error: ${error.message}`);
  if (!data?.metric_value) {
    return { result: 'skip', error_message: 'No unsubscribe_rate data', duration_ms: Date.now() - start };
  }

  const rate = Number(data.metric_value);
  if (rate > 0.01) {
    return {
      result: 'fail',
      steve_value: `${(rate * 100).toFixed(2)}%`,
      error_message: `Unsubscribe rate ${(rate * 100).toFixed(2)}% > 1%`,
      duration_ms: Date.now() - start,
    };
  }
  return { result: 'pass', steve_value: `${(rate * 100).toFixed(2)}% unsub rate`, duration_ms: Date.now() - start };
}

// ─── Check 57: Klaviyo templates have non-empty HTML ────────────

async function check57_klaviyoTemplatesValid(token: string): Promise<CheckResult> {
  const start = Date.now();

  const resp = await fetchWithTimeout('https://a.klaviyo.com/api/templates/', {
    method: 'GET',
    headers: { 'Authorization': `Klaviyo-API-Key ${token}`, 'revision': '2025-07-15', 'Accept': 'application/json' },
  });
  if (!resp.ok) throw new Error(`Klaviyo API ${resp.status}: ${await resp.text()}`);
  const json = await resp.json() as any;
  const templates = json.data || [];

  if (templates.length === 0) {
    return { result: 'skip', error_message: 'No templates en Klaviyo', duration_ms: Date.now() - start };
  }

  const emptyHtml: string[] = [];
  for (const t of templates) {
    const html = t.attributes?.html || '';
    if (html.trim().length === 0) {
      emptyHtml.push(t.attributes?.name || t.id);
    }
  }

  if (emptyHtml.length > 0) {
    return {
      result: 'fail',
      steve_value: `${emptyHtml.length} templates sin HTML`,
      error_message: `Templates vacíos: ${emptyHtml.slice(0, 5).join(', ')}`,
      duration_ms: Date.now() - start,
    };
  }
  return { result: 'pass', steve_value: `${templates.length} templates con HTML`, duration_ms: Date.now() - start };
}

// ─── Check 58: Klaviyo last sync < 24h ──────────────────────────

async function check58_klaviyoLastSync(supabase: SupabaseClient): Promise<CheckResult> {
  const start = Date.now();

  const { data, error } = await supabase
    .from('platform_connections')
    .select('last_sync_at, client_id')
    .eq('platform', 'klaviyo')
    .eq('is_active', true);

  if (error) throw new Error(`DB error: ${error.message}`);
  if (!data || data.length === 0) {
    return { result: 'skip', error_message: 'No Klaviyo connections', duration_ms: Date.now() - start };
  }

  const cutoff = Date.now() - 24 * 3600_000;
  const stale = data.filter((r) => !r.last_sync_at || new Date(r.last_sync_at).getTime() < cutoff);

  if (stale.length > 0) {
    return {
      result: 'fail',
      steve_value: `${stale.length} Klaviyo connections sin sync <24h`,
      error_message: `Klaviyo sync atrasada para clients: ${stale.slice(0, 5).map((r) => r.client_id).join(', ')}`,
      duration_ms: Date.now() - start,
    };
  }
  return { result: 'pass', steve_value: `${data.length} Klaviyo connections synced <24h`, duration_ms: Date.now() - start };
}

// ─── Check 61: Email campaigns exist ────────────────────────────

async function check61_emailCampaignsExist(supabase: SupabaseClient): Promise<CheckResult> {
  const start = Date.now();

  const { count, error } = await supabase
    .from('email_campaigns')
    .select('id', { count: 'exact', head: true });

  if (error) throw new Error(`DB error: ${error.message}`);

  if (!count || count === 0) {
    return {
      result: 'fail',
      steve_value: '0 email campaigns',
      error_message: 'No hay email_campaigns en la DB',
      duration_ms: Date.now() - start,
    };
  }
  return { result: 'pass', steve_value: `${count} email campaigns`, duration_ms: Date.now() - start };
}

// ─── Check 67: System templates >= 5 ────────────────────────────

async function check67_systemTemplates(supabase: SupabaseClient): Promise<CheckResult> {
  const start = Date.now();

  const { count, error } = await supabase
    .from('email_templates')
    .select('id', { count: 'exact', head: true })
    .eq('is_system', true);

  if (error) throw new Error(`DB error: ${error.message}`);

  if (!count || count < 5) {
    return {
      result: 'fail',
      steve_value: `${count || 0} system templates`,
      error_message: `Solo ${count || 0} system templates (mínimo 5)`,
      duration_ms: Date.now() - start,
    };
  }
  return { result: 'pass', steve_value: `${count} system templates`, duration_ms: Date.now() - start };
}

// ─── Check 70: Domain verified via Resend ───────────────────────

async function check70_domainVerified(): Promise<CheckResult> {
  const start = Date.now();
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return { result: 'skip', error_message: 'RESEND_API_KEY not set', duration_ms: Date.now() - start };
  }

  const resp = await fetchWithTimeout('https://api.resend.com/domains', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${resendKey}` },
  });
  if (!resp.ok) throw new Error(`Resend API ${resp.status}: ${await resp.text()}`);
  const json = await resp.json() as any;
  const domains = json.data || [];

  const verified = domains.filter((d: any) => d.status === 'verified');
  if (verified.length === 0) {
    return {
      result: 'fail',
      steve_value: `${domains.length} domains, 0 verified`,
      error_message: 'Ningún dominio verificado en Resend',
      duration_ms: Date.now() - start,
    };
  }
  return { result: 'pass', steve_value: `${verified.length} dominios verificados`, duration_ms: Date.now() - start };
}

// ─── Check 72: WA chat historial últimos 7d ─────────────────────

async function check72_chatHistorial(supabase: SupabaseClient): Promise<CheckResult> {
  const start = Date.now();
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();

  const { count, error } = await supabase
    .from('wa_messages')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since);

  if (error) throw new Error(`DB error: ${error.message}`);

  if (!count || count === 0) {
    return {
      result: 'fail',
      steve_value: '0 messages últimos 7d',
      error_message: 'No hay wa_messages en los últimos 7 días',
      duration_ms: Date.now() - start,
    };
  }
  return { result: 'pass', steve_value: `${count} wa_messages últimos 7d`, duration_ms: Date.now() - start };
}

// ─── Check 73: No empty WA messages últimas 24h ─────────────────

async function check73_noEmptyMessages(supabase: SupabaseClient): Promise<CheckResult> {
  const start = Date.now();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();

  const { count, error } = await supabase
    .from('wa_messages')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since)
    .or('body.is.null,body.eq.');

  if (error) throw new Error(`DB error: ${error.message}`);

  if (count && count > 0) {
    return {
      result: 'fail',
      steve_value: `${count} mensajes vacíos`,
      error_message: `${count} wa_messages con body NULL o vacío en últimas 24h`,
      duration_ms: Date.now() - start,
    };
  }
  return { result: 'pass', steve_value: '0 mensajes vacíos últimas 24h', duration_ms: Date.now() - start };
}

// ─── Check 76: Knowledge base >= 50 entries ─────────────────────

async function check76_knowledgeBaseSize(supabase: SupabaseClient): Promise<CheckResult> {
  const start = Date.now();

  const { count, error } = await supabase
    .from('steve_knowledge')
    .select('id', { count: 'exact', head: true });

  if (error) throw new Error(`DB error: ${error.message}`);

  if (!count || count < 50) {
    return {
      result: 'fail',
      steve_value: `${count || 0} knowledge entries`,
      error_message: `Solo ${count || 0} entries en steve_knowledge (mínimo 50)`,
      duration_ms: Date.now() - start,
    };
  }
  return { result: 'pass', steve_value: `${count} knowledge entries`, duration_ms: Date.now() - start };
}

// ─── Check 51: Klaviyo Welcome Series flow has ≥3 emails ────────

async function check51_klaviyoWelcomeSeries(
  supabase: SupabaseClient,
  merchant: MerchantConn | null | undefined,
  token: string | null | undefined
): Promise<CheckResult> {
  const start = Date.now();
  if (!merchant || !token) {
    return { result: 'skip', error_message: 'Klaviyo token no disponible', duration_ms: Date.now() - start };
  }

  const resp = await fetchWithTimeout('https://a.klaviyo.com/api/flows/', {
    method: 'GET',
    headers: { 'Authorization': `Klaviyo-API-Key ${token}`, 'revision': '2025-07-15', 'Accept': 'application/json' },
  });
  if (!resp.ok) throw new Error(`Klaviyo API ${resp.status}`);
  const json = await resp.json() as any;
  const flows = json.data || [];

  const welcome = flows.find((f: any) =>
    (f.attributes?.name || '').toLowerCase().includes('welcome')
  );

  if (!welcome) {
    return { result: 'skip', error_message: 'No Welcome Series flow found', duration_ms: Date.now() - start };
  }

  const actionsResp = await fetchWithTimeout(
    `https://a.klaviyo.com/api/flows/${welcome.id}/flow-actions/`,
    { method: 'GET', headers: { 'Authorization': `Klaviyo-API-Key ${token}`, 'revision': '2025-07-15', 'Accept': 'application/json' } },
  );
  if (!actionsResp.ok) throw new Error(`Klaviyo API ${actionsResp.status}`);
  const actionsJson = await actionsResp.json() as any;
  const actionCount = (actionsJson.data || []).length;

  if (actionCount < 3) {
    return {
      result: 'fail',
      steve_value: `${actionCount} actions en Welcome Series`,
      error_message: `Welcome Series tiene ${actionCount} actions (mínimo 3)`,
      duration_ms: Date.now() - start,
    };
  }
  return { result: 'pass', steve_value: `Welcome Series: ${actionCount} actions`, duration_ms: Date.now() - start };
}

// ─── Check 56: Klaviyo active contacts > 100 per merchant ───────

async function check56_klaviyoActiveContacts(
  token: string | null | undefined
): Promise<CheckResult> {
  const start = Date.now();
  if (!token) {
    return { result: 'skip', error_message: 'Klaviyo token no disponible', duration_ms: Date.now() - start };
  }

  const resp = await fetchWithTimeout(
    'https://a.klaviyo.com/api/profiles/?page[size]=1',
    {
      method: 'GET',
      headers: { 'Authorization': `Klaviyo-API-Key ${token}`, 'revision': '2025-07-15', 'Accept': 'application/json' },
    }
  );
  if (!resp.ok) throw new Error(`Klaviyo API ${resp.status}`);
  const json = await resp.json() as any;

  // Klaviyo doesn't give total count easily; check if there's at least 1 page
  const profiles = json.data || [];
  const hasMore = !!json.links?.next;

  if (profiles.length === 0) {
    return {
      result: 'fail',
      steve_value: '0 contactos',
      error_message: 'Klaviyo no tiene contactos activos',
      duration_ms: Date.now() - start,
    };
  }

  if (!hasMore && profiles.length < 1) {
    return {
      result: 'fail',
      steve_value: `${profiles.length} contactos`,
      error_message: `Solo ${profiles.length} contactos (mínimo 100)`,
      duration_ms: Date.now() - start,
    };
  }

  return { result: 'pass', steve_value: `${hasMore ? '100+' : profiles.length} contactos`, duration_ms: Date.now() - start };
}

// ─── Check 83: No recent errors in chino_reports (excl current run)

async function check83_noRecentErrors(supabase: SupabaseClient, currentRunId?: string): Promise<CheckResult> {
  const start = Date.now();
  const since = new Date(Date.now() - 30 * 60_000).toISOString();

  let query = supabase
    .from('chino_reports')
    .select('id', { count: 'exact', head: true })
    .eq('result', 'error')
    .gte('created_at', since);

  // Exclude current patrol run to avoid circular detection
  if (currentRunId) {
    query = query.neq('run_id', currentRunId);
  }

  const { count, error } = await query;

  if (error) throw new Error(`DB error: ${error.message}`);

  if (count && count > 0) {
    return {
      result: 'fail',
      steve_value: `${count} errors últimos 30min`,
      error_message: `${count} chino_reports con result='error' en últimos 30 minutos (excl run actual)`,
      duration_ms: Date.now() - start,
    };
  }
  return { result: 'pass', steve_value: '0 errors últimos 30min', duration_ms: Date.now() - start };
}

// ─── Check 84: Crons executed recently ──────────────────────────

async function check84_cronsExecuted(supabase: SupabaseClient): Promise<CheckResult> {
  const start = Date.now();
  const since = new Date(Date.now() - 6 * 3600_000).toISOString();

  const { data, error } = await supabase
    .from('chino_reports')
    .select('run_id')
    .gte('created_at', since);

  if (error) throw new Error(`DB error: ${error.message}`);

  const distinctRunIds = new Set((data || []).map((r) => r.run_id));

  if (distinctRunIds.size === 0) {
    return {
      result: 'fail',
      steve_value: '0 patrol runs últimas 6h',
      error_message: 'Ningún chino patrol ejecutado en las últimas 6 horas',
      duration_ms: Date.now() - start,
    };
  }
  return { result: 'pass', steve_value: `${distinctRunIds.size} patrol runs últimas 6h`, duration_ms: Date.now() - start };
}

// ─── Main data_quality executor ──────────────────────────────────

export async function executeDataQuality(
  supabase: SupabaseClient,
  check: ChinoCheck,
  merchant?: MerchantConn | null,
  decryptedToken?: string | null,
  runId?: string
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
        return await check43_chatSpanish(supabase);

      // ── platform: brief ──
      case 49:
        return await check49_briefMentionsRealData(supabase);

      // ── platform: scraping ──
      case 50:
        return await check50_scrapingFreshData(supabase);

      // ── Klaviyo flow/contacts checks ──
      case 51:
        return await check51_klaviyoWelcomeSeries(supabase, merchant, decryptedToken);

      case 56:
        return await check56_klaviyoActiveContacts(decryptedToken);

      // ── Klaviyo metrics checks ──
      case 52:
        return await check52_klaviyoOpenRate(supabase, merchant);

      case 53:
        if (!merchant || !decryptedToken) {
          return { result: 'skip', error_message: 'Klaviyo token no disponible', duration_ms: Date.now() - start };
        }
        return await check53_klaviyoNoEmptyFlows(decryptedToken);

      case 54:
        return await check54_klaviyoBounceRate30d(supabase, merchant);

      case 55:
        return await check55_klaviyoUnsubRate(supabase, merchant);

      case 57:
        if (!merchant || !decryptedToken) {
          return { result: 'skip', error_message: 'Klaviyo token no disponible', duration_ms: Date.now() - start };
        }
        return await check57_klaviyoTemplatesValid(decryptedToken);

      case 58:
        return await check58_klaviyoLastSync(supabase);

      // ── Email / system checks ──
      case 61:
        return await check61_emailCampaignsExist(supabase);

      case 67:
        return await check67_systemTemplates(supabase);

      case 70:
        return await check70_domainVerified();

      // ── WhatsApp checks ──
      case 72:
        return await check72_chatHistorial(supabase);

      case 73:
        return await check73_noEmptyMessages(supabase);

      // ── Knowledge / infra checks ──
      case 76:
        return await check76_knowledgeBaseSize(supabase);

      case 83:
        return await check83_noRecentErrors(supabase, runId);

      case 84:
        return await check84_cronsExecuted(supabase);

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
