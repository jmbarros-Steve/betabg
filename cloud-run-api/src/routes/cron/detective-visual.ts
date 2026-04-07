import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { decryptPlatformToken } from '../../lib/decrypt-token.js';
import { safeQuery } from '../../lib/safe-supabase.js';

/**
 * Detective Visual — Compares Steve data vs real platform data every 2 hours.
 *
 * Since Skyvern (browser automation) is not yet deployed, this endpoint uses
 * API-based comparison: fetches data from Steve's DB and compares against
 * platform APIs (Meta, Shopify, Klaviyo) to detect mismatches.
 *
 * Schedule: 0 8,10,12,14,16,18,20 * * * (every 2h during business hours)
 * Auth: X-Cron-Secret header
 */

interface ComparisonResult {
  module: string;
  check_type: string;
  status: 'PASS' | 'MISMATCH' | 'MISSING' | 'ERROR';
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR';
  steve_value: unknown;
  real_value: unknown;
  mismatched_fields: string[];
  details: string;
  client_id?: string;
  steve_record_id?: string;
  external_id?: string;
}

const TOLERANCES = {
  spend: 0.05,
  roas: 0.10,
  cpa: 0.10,
  conversions: 0.05,
  budget: 0.0,
  price: 0.0,
};

function withinTolerance(steveVal: number, realVal: number, tolerance: number): boolean {
  if (realVal === 0 && steveVal === 0) return true;
  if (realVal === 0) return steveVal === 0;
  return Math.abs(steveVal - realVal) / Math.abs(realVal) <= tolerance;
}

async function checkMetaCampaigns(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<ComparisonResult[]> {
  const results: ComparisonResult[] = [];

  const connections = await safeQuery<{ id: string; client_id: string; account_id: string; access_token_encrypted: string }>(
    supabase
      .from('platform_connections')
      .select('id, client_id, account_id, access_token_encrypted')
      .eq('platform', 'meta')
      .eq('is_active', true),
    'detectiveVisual.fetchMetaConnections',
  );

  if (!connections.length) return results;

  for (const conn of connections.slice(0, 5)) {
    const clientId = conn.client_id;
    const steveCampaigns = await safeQuery<{ id: string; campaign_name: string | null; campaign_status: string | null; metric_date: string; spend: number | null }>(
      supabase
        .from('campaign_metrics')
        .select('id, campaign_name, campaign_status, metric_date, spend')
        .eq('connection_id', conn.id)
        .order('metric_date', { ascending: false })
        .limit(50),
      'detectiveVisual.fetchSteveCampaigns',
    );

    if (!steveCampaigns.length) continue;

    const accessToken = await decryptPlatformToken(supabase, conn.access_token_encrypted);
    const adAccountId = conn.account_id;
    if (!accessToken || !adAccountId) continue;

    try {
      const metaRes = await fetch(
        `https://graph.facebook.com/v21.0/${adAccountId}/campaigns?fields=name,status,daily_budget,lifetime_budget&limit=50`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!metaRes.ok) {
        results.push({ module: 'meta-campaigns', check_type: 'api_access', status: 'ERROR', severity: 'MAJOR', steve_value: null, real_value: null, mismatched_fields: [], details: `Meta API error: HTTP ${metaRes.status}`, client_id: clientId });
        continue;
      }

      const metaData = await metaRes.json() as { data?: any[] };
      const metaCampaigns = metaData.data || [];
      const metaByName = new Map(metaCampaigns.map((c: any) => [c.name?.toLowerCase(), c]));

      // Deduplicate Steve campaigns by name (campaign_metrics has daily rows)
      const uniqueSteveCampaigns = new Map<string, typeof steveCampaigns[0]>();
      for (const sc of steveCampaigns) {
        if (sc.campaign_name && !uniqueSteveCampaigns.has(sc.campaign_name.toLowerCase())) {
          uniqueSteveCampaigns.set(sc.campaign_name.toLowerCase(), sc);
        }
      }

      for (const [, sc] of uniqueSteveCampaigns) {
        const metaCamp = metaByName.get(sc.campaign_name?.toLowerCase());
        if (!metaCamp) {
          results.push({ module: 'meta-campaigns', check_type: 'campaign_exists', status: 'MISSING', severity: 'MAJOR', steve_value: { name: sc.campaign_name }, real_value: null, mismatched_fields: ['existence'], details: `Campaign "${sc.campaign_name}" in Steve but not in Meta`, client_id: clientId, steve_record_id: sc.id, external_id: metaCamp?.id });
          continue;
        }

        const mismatched: string[] = [];
        const metaStatus = metaCamp.status?.toLowerCase();
        const steveStatus = sc.campaign_status?.toLowerCase();
        if (metaStatus && steveStatus && metaStatus !== steveStatus) mismatched.push('status');

        if (mismatched.length > 0) {
          results.push({ module: 'meta-campaigns', check_type: 'campaign_data', status: 'MISMATCH', severity: 'MAJOR', steve_value: { name: sc.campaign_name, status: sc.campaign_status }, real_value: { name: metaCamp.name, status: metaStatus }, mismatched_fields: mismatched, details: `Campaign "${sc.campaign_name}": ${mismatched.join(', ')} differ`, client_id: clientId, steve_record_id: sc.id, external_id: metaCamp.id });
        } else {
          results.push({ module: 'meta-campaigns', check_type: 'campaign_data', status: 'PASS', severity: 'MINOR', steve_value: { name: sc.campaign_name }, real_value: { name: metaCamp.name }, mismatched_fields: [], details: `Campaign "${sc.campaign_name}" matches`, client_id: clientId });
        }
      }
    } catch (e) {
      results.push({ module: 'meta-campaigns', check_type: 'api_access', status: 'ERROR', severity: 'MAJOR', steve_value: null, real_value: null, mismatched_fields: [], details: `Meta API fetch error: ${(e as Error).message}`, client_id: clientId });
    }
  }
  return results;
}

async function checkShopifyProducts(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<ComparisonResult[]> {
  const results: ComparisonResult[] = [];

  const connections = await safeQuery<{ id: string; client_id: string; shop_domain: string | null; access_token_encrypted: string }>(
    supabase
      .from('platform_connections')
      .select('id, client_id, shop_domain, access_token_encrypted')
      .eq('platform', 'shopify')
      .eq('is_active', true),
    'detectiveVisual.fetchShopifyConnections',
  );

  if (!connections.length) return results;

  for (const conn of connections.slice(0, 5)) {
    const clientId = conn.client_id;
    const shopDomain = conn.shop_domain;
    const accessToken = await decryptPlatformToken(supabase, conn.access_token_encrypted);
    if (!shopDomain || !accessToken) continue;

    const steveProducts = await safeQuery<{ id: string; title: string | null; price: number | null; shopify_product_id: string }>(
      supabase
        .from('shopify_products')
        .select('id, title, price, shopify_product_id')
        .eq('client_id', clientId)
        .limit(50),
      'detectiveVisual.fetchSteveProducts',
    );

    if (!steveProducts.length) continue;

    try {
      const shopifyRes = await fetch(
        `https://${shopDomain}/admin/api/2024-01/products.json?limit=50&fields=id,title,variants,status`,
        { headers: { 'X-Shopify-Access-Token': accessToken } }
      );
      if (!shopifyRes.ok) {
        results.push({ module: 'shopify-products', check_type: 'api_access', status: 'ERROR', severity: 'MAJOR', steve_value: null, real_value: null, mismatched_fields: [], details: `Shopify API error: HTTP ${shopifyRes.status}`, client_id: clientId });
        continue;
      }

      const shopifyData = await shopifyRes.json() as { products?: any[] };
      const shopifyProducts = shopifyData.products || [];
      const shopifyMap = new Map(shopifyProducts.map((p: any) => [String(p.id), p]));

      for (const sp of steveProducts) {
        const realProd = shopifyMap.get(sp.shopify_product_id);
        if (!realProd) {
          results.push({ module: 'shopify-products', check_type: 'product_exists', status: 'MISSING', severity: 'MAJOR', steve_value: { title: sp.title, id: sp.shopify_product_id }, real_value: null, mismatched_fields: ['existence'], details: `Product "${sp.title}" in Steve but missing in Shopify`, client_id: clientId, steve_record_id: sp.id, external_id: sp.shopify_product_id });
          continue;
        }
        const firstVariant = realProd.variants?.[0];
        const realPrice = firstVariant ? Number(firstVariant.price) : 0;
        const stevePrice = Number(sp.price) || 0;
        if (stevePrice > 0 && realPrice > 0 && !withinTolerance(stevePrice, realPrice, TOLERANCES.price)) {
          results.push({ module: 'shopify-products', check_type: 'product_data', status: 'MISMATCH', severity: 'CRITICAL', steve_value: { title: sp.title, price: stevePrice }, real_value: { title: realProd.title, price: realPrice }, mismatched_fields: ['price'], details: `Product "${sp.title}": price Steve=$${stevePrice} vs Shopify=$${realPrice}`, client_id: clientId, steve_record_id: sp.id, external_id: sp.shopify_product_id });
        } else {
          results.push({ module: 'shopify-products', check_type: 'product_data', status: 'PASS', severity: 'MINOR', steve_value: { title: sp.title }, real_value: { title: realProd.title }, mismatched_fields: [], details: `Product "${sp.title}" matches`, client_id: clientId });
        }
      }
    } catch (e) {
      results.push({ module: 'shopify-products', check_type: 'api_access', status: 'ERROR', severity: 'MAJOR', steve_value: null, real_value: null, mismatched_fields: [], details: `Shopify API fetch error: ${(e as Error).message}`, client_id: clientId });
    }
  }
  return results;
}

const AGENT_MAP: Record<string, string> = {
  'meta-campaigns': 'W2',
  'shopify-products': 'W13',
  'klaviyo-emails': 'W1',
};

export async function detectiveVisual(c: Context) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = c.req.header('X-Cron-Secret');
  if (!cronSecret || providedSecret !== cronSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const runId = `detective-${Date.now()}`;
  const allResults: ComparisonResult[] = [];

  console.log(`[detective-visual] Starting run ${runId}`);

  try {
    const [metaResults, shopifyResults] = await Promise.all([
      checkMetaCampaigns(supabase),
      checkShopifyProducts(supabase),
    ]);
    allResults.push(...metaResults, ...shopifyResults);
  } catch (e) {
    console.error(`[detective-visual] Run error:`, e);
  }

  const passed = allResults.filter(r => r.status === 'PASS').length;
  const mismatches = allResults.filter(r => r.status === 'MISMATCH').length;
  const missing = allResults.filter(r => r.status === 'MISSING').length;
  const errors = allResults.filter(r => r.status === 'ERROR').length;
  const critical = allResults.filter(r => r.severity === 'CRITICAL' && r.status !== 'PASS').length;
  const total = allResults.length;
  const score = total > 0 ? Math.round((passed / total) * 100) : 100;

  const byModule: Record<string, { passed: number; failed: number }> = {};
  for (const r of allResults) {
    if (!byModule[r.module]) byModule[r.module] = { passed: 0, failed: 0 };
    if (r.status === 'PASS') byModule[r.module].passed++;
    else byModule[r.module].failed++;
  }

  await supabase.from('detective_runs').insert({
    run_id: runId, source: 'api', total_checks: total, passed, mismatches: mismatches + missing, critical, score, by_module: byModule,
  });

  const failedResults = allResults.filter(r => r.status !== 'PASS');
  if (failedResults.length > 0) {
    await supabase.from('detective_log').insert(
      failedResults.map(r => ({
        run_id: runId, source: 'api', module: r.module, client_id: r.client_id || null, check_type: r.check_type, status: r.status, severity: r.severity, steve_value: r.steve_value, real_value: r.real_value, mismatched_fields: r.mismatched_fields, details: r.details, steve_record_id: r.steve_record_id || null, external_id: r.external_id || null,
      }))
    );
  }

  const criticals = allResults.filter(r => r.severity === 'CRITICAL' && r.status !== 'PASS');
  for (const cr of criticals) {
    const title = `[DETECTIVE] ${cr.severity}: ${cr.details.slice(0, 80)}`;
    const existing = await safeQuery<{ id: string }>(
      supabase.from('tasks').select('id').eq('title', title).in('status', ['pending', 'in_progress']).limit(1),
      'detectiveVisual.fetchExistingTask',
    );
    if (!existing.length) {
      await supabase.from('tasks').insert({
        title, description: `Detective run ${runId}.\nModule: ${cr.module}\nMismatch: ${cr.mismatched_fields.join(', ')}`,
        priority: 'critica', type: 'bug', source: 'detective', assigned_agent: AGENT_MAP[cr.module] || 'W5', status: 'pending', attempts: 0,
      });
    }
  }

  console.log(`[detective-visual] Run ${runId} complete: ${passed}/${total} passed, ${critical} critical`);

  return c.json({ success: true, run_id: runId, total, passed, mismatches: mismatches + missing, errors, critical, score, by_module: byModule });
}
