import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/**
 * Detective Visual — Compares Steve data vs real platform data every 2 hours.
 *
 * Since Skyvern (browser automation) is not yet deployed, this endpoint uses
 * API-based comparison: fetches data from Steve's DB and compares against
 * platform APIs (Meta, Shopify, Klaviyo) to detect mismatches.
 *
 * When Skyvern is deployed, this will be extended with screenshot comparison.
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
  spend: 0.05,       // 5%
  roas: 0.10,        // 10%
  cpa: 0.10,         // 10%
  conversions: 0.05, // 5%
  budget: 0.0,       // exact
  price: 0.0,        // exact (critical for Shopify)
};

function withinTolerance(steveVal: number, realVal: number, tolerance: number): boolean {
  if (realVal === 0 && steveVal === 0) return true;
  if (realVal === 0) return steveVal === 0;
  return Math.abs(steveVal - realVal) / Math.abs(realVal) <= tolerance;
}

// ── Meta Campaigns comparison ──────────────────────────────────────
async function checkMetaCampaigns(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<ComparisonResult[]> {
  const results: ComparisonResult[] = [];

  // Get shops with Meta connections
  const { data: connections } = await supabase
    .from('platform_connections')
    .select('shop_id, credentials')
    .eq('platform', 'meta')
    .eq('status', 'active');

  if (!connections?.length) return results;

  for (const conn of connections.slice(0, 5)) { // Limit to 5 shops per run
    const shopId = conn.shop_id;

    // Steve's campaign data
    const { data: steveCampaigns } = await supabase
      .from('meta_campaigns')
      .select('id, name, status, daily_budget, lifetime_budget, campaign_id')
      .eq('shop_id', shopId)
      .limit(50);

    if (!steveCampaigns?.length) continue;

    // Steve's latest metrics
    const { data: steveMetrics } = await supabase
      .from('meta_campaign_metrics')
      .select('campaign_id, spend, roas, cpa, conversions, date')
      .eq('shop_id', shopId)
      .order('date', { ascending: false })
      .limit(50);

    const metricsMap = new Map<string, (typeof steveMetrics extends (infer T)[] | null ? T : never)>();
    for (const m of steveMetrics || []) {
      if (!metricsMap.has(m.campaign_id)) metricsMap.set(m.campaign_id, m);
    }

    // Compare against Meta API
    const accessToken = (conn.credentials as any)?.access_token;
    const adAccountId = (conn.credentials as any)?.ad_account_id;
    if (!accessToken || !adAccountId) continue;

    try {
      const metaRes = await fetch(
        `https://graph.facebook.com/v21.0/${adAccountId}/campaigns?fields=name,status,daily_budget,lifetime_budget&limit=50&access_token=${accessToken}`
      );
      if (!metaRes.ok) {
        results.push({
          module: 'meta-campaigns',
          check_type: 'api_access',
          status: 'ERROR',
          severity: 'MAJOR',
          steve_value: null,
          real_value: null,
          mismatched_fields: [],
          details: `Meta API error: HTTP ${metaRes.status}`,
          client_id: shopId,
        });
        continue;
      }

      const metaData = await metaRes.json() as { data?: any[] };
      const metaCampaigns = metaData.data || [];
      const metaMap = new Map(metaCampaigns.map((c: any) => [c.id, c]));

      for (const sc of steveCampaigns) {
        const metaCamp = metaMap.get(sc.campaign_id);
        if (!metaCamp) {
          results.push({
            module: 'meta-campaigns',
            check_type: 'campaign_exists',
            status: 'MISSING',
            severity: 'MAJOR',
            steve_value: { name: sc.name, campaign_id: sc.campaign_id },
            real_value: null,
            mismatched_fields: ['existence'],
            details: `Campaign "${sc.name}" exists in Steve but not in Meta`,
            client_id: shopId,
            steve_record_id: sc.id,
            external_id: sc.campaign_id,
          });
          continue;
        }

        const mismatched: string[] = [];

        // Status check
        const metaStatus = (metaCamp as any).status?.toLowerCase();
        const steveStatus = sc.status?.toLowerCase();
        if (metaStatus && steveStatus && metaStatus !== steveStatus) {
          mismatched.push('status');
        }

        // Budget check
        const steveBudget = sc.daily_budget || sc.lifetime_budget || 0;
        const metaBudget = Number((metaCamp as any).daily_budget || (metaCamp as any).lifetime_budget || 0) / 100; // Meta returns cents
        if (steveBudget > 0 && metaBudget > 0 && !withinTolerance(steveBudget, metaBudget, TOLERANCES.budget)) {
          mismatched.push('budget');
        }

        if (mismatched.length > 0) {
          results.push({
            module: 'meta-campaigns',
            check_type: 'campaign_data',
            status: 'MISMATCH',
            severity: mismatched.includes('budget') ? 'CRITICAL' : 'MAJOR',
            steve_value: { name: sc.name, status: sc.status, budget: steveBudget },
            real_value: { name: (metaCamp as any).name, status: metaStatus, budget: metaBudget },
            mismatched_fields: mismatched,
            details: `Campaign "${sc.name}": ${mismatched.join(', ')} differ`,
            client_id: shopId,
            steve_record_id: sc.id,
            external_id: sc.campaign_id,
          });
        } else {
          results.push({
            module: 'meta-campaigns',
            check_type: 'campaign_data',
            status: 'PASS',
            severity: 'MINOR',
            steve_value: { name: sc.name },
            real_value: { name: (metaCamp as any).name },
            mismatched_fields: [],
            details: `Campaign "${sc.name}" matches`,
            client_id: shopId,
          });
        }
      }
    } catch (e) {
      results.push({
        module: 'meta-campaigns',
        check_type: 'api_access',
        status: 'ERROR',
        severity: 'MAJOR',
        steve_value: null,
        real_value: null,
        mismatched_fields: [],
        details: `Meta API fetch error: ${(e as Error).message}`,
        client_id: shopId,
      });
    }
  }

  return results;
}

// ── Shopify Products comparison ────────────────────────────────────
async function checkShopifyProducts(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<ComparisonResult[]> {
  const results: ComparisonResult[] = [];

  const { data: connections } = await supabase
    .from('platform_connections')
    .select('shop_id, credentials')
    .eq('platform', 'shopify')
    .eq('status', 'active');

  if (!connections?.length) return results;

  for (const conn of connections.slice(0, 5)) {
    const shopId = conn.shop_id;
    const creds = conn.credentials as any;
    const shopDomain = creds?.shop_domain || creds?.shop;
    const accessToken = creds?.access_token;

    if (!shopDomain || !accessToken) continue;

    // Steve's products
    const { data: steveProducts } = await supabase
      .from('shopify_products')
      .select('id, title, price, compare_at_price, status, shopify_product_id')
      .eq('shop_id', shopId)
      .limit(50);

    if (!steveProducts?.length) continue;

    try {
      const shopifyRes = await fetch(
        `https://${shopDomain}/admin/api/2024-01/products.json?limit=50&fields=id,title,variants,status`,
        { headers: { 'X-Shopify-Access-Token': accessToken } }
      );

      if (!shopifyRes.ok) {
        results.push({
          module: 'shopify-products',
          check_type: 'api_access',
          status: 'ERROR',
          severity: 'MAJOR',
          steve_value: null,
          real_value: null,
          mismatched_fields: [],
          details: `Shopify API error: HTTP ${shopifyRes.status}`,
          client_id: shopId,
        });
        continue;
      }

      const shopifyData = await shopifyRes.json() as { products?: any[] };
      const shopifyProducts = shopifyData.products || [];
      const shopifyMap = new Map(shopifyProducts.map((p: any) => [String(p.id), p]));

      for (const sp of steveProducts) {
        const realProd = shopifyMap.get(sp.shopify_product_id);
        if (!realProd) {
          results.push({
            module: 'shopify-products',
            check_type: 'product_exists',
            status: 'MISSING',
            severity: 'MAJOR',
            steve_value: { title: sp.title, id: sp.shopify_product_id },
            real_value: null,
            mismatched_fields: ['existence'],
            details: `Product "${sp.title}" in Steve but missing in Shopify`,
            client_id: shopId,
            steve_record_id: sp.id,
            external_id: sp.shopify_product_id,
          });
          continue;
        }

        const mismatched: string[] = [];
        const firstVariant = (realProd as any).variants?.[0];
        const realPrice = firstVariant ? Number(firstVariant.price) : 0;
        const stevePrice = Number(sp.price) || 0;

        // Price mismatch is CRITICAL
        if (stevePrice > 0 && realPrice > 0 && !withinTolerance(stevePrice, realPrice, TOLERANCES.price)) {
          mismatched.push('price');
        }

        if (mismatched.length > 0) {
          results.push({
            module: 'shopify-products',
            check_type: 'product_data',
            status: 'MISMATCH',
            severity: 'CRITICAL',
            steve_value: { title: sp.title, price: stevePrice },
            real_value: { title: (realProd as any).title, price: realPrice },
            mismatched_fields: mismatched,
            details: `Product "${sp.title}": price Steve=$${stevePrice} vs Shopify=$${realPrice}`,
            client_id: shopId,
            steve_record_id: sp.id,
            external_id: sp.shopify_product_id,
          });
        } else {
          results.push({
            module: 'shopify-products',
            check_type: 'product_data',
            status: 'PASS',
            severity: 'MINOR',
            steve_value: { title: sp.title },
            real_value: { title: (realProd as any).title },
            mismatched_fields: [],
            details: `Product "${sp.title}" matches`,
            client_id: shopId,
          });
        }
      }
    } catch (e) {
      results.push({
        module: 'shopify-products',
        check_type: 'api_access',
        status: 'ERROR',
        severity: 'MAJOR',
        steve_value: null,
        real_value: null,
        mismatched_fields: [],
        details: `Shopify API fetch error: ${(e as Error).message}`,
        client_id: shopId,
      });
    }
  }

  return results;
}

// ── Agent map for auto-task creation ───────────────────────────────
const AGENT_MAP: Record<string, string> = {
  'meta-campaigns': 'W2',
  'meta-audiences': 'W2',
  'meta-metrics': 'W2',
  'shopify-products': 'W13',
  'shopify-orders': 'W13',
  'klaviyo-emails': 'W1',
  'visual-meta': 'W2',
  'visual-shopify': 'W13',
  'visual-klaviyo': 'W1',
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

  // Run all checks
  try {
    const [metaResults, shopifyResults] = await Promise.all([
      checkMetaCampaigns(supabase),
      checkShopifyProducts(supabase),
    ]);
    allResults.push(...metaResults, ...shopifyResults);
  } catch (e) {
    console.error(`[detective-visual] Run error:`, e);
  }

  // Calculate summary
  const passed = allResults.filter(r => r.status === 'PASS').length;
  const mismatches = allResults.filter(r => r.status === 'MISMATCH').length;
  const missing = allResults.filter(r => r.status === 'MISSING').length;
  const errors = allResults.filter(r => r.status === 'ERROR').length;
  const critical = allResults.filter(r => r.severity === 'CRITICAL' && r.status !== 'PASS').length;
  const total = allResults.length;
  const score = total > 0 ? Math.round((passed / total) * 100) : 100;

  // Group by module
  const byModule: Record<string, { passed: number; failed: number }> = {};
  for (const r of allResults) {
    if (!byModule[r.module]) byModule[r.module] = { passed: 0, failed: 0 };
    if (r.status === 'PASS') byModule[r.module].passed++;
    else byModule[r.module].failed++;
  }

  // Insert run summary
  await supabase.from('detective_runs').insert({
    run_id: runId,
    source: 'api',  // Will be 'visual' when Skyvern is deployed
    total_checks: total,
    passed,
    mismatches: mismatches + missing,
    critical,
    score,
    by_module: byModule,
  });

  // Insert individual check results (only non-PASS to keep DB lean)
  const failedResults = allResults.filter(r => r.status !== 'PASS');
  if (failedResults.length > 0) {
    await supabase.from('detective_log').insert(
      failedResults.map(r => ({
        run_id: runId,
        source: 'api',
        module: r.module,
        client_id: r.client_id || null,
        check_type: r.check_type,
        status: r.status,
        severity: r.severity,
        steve_value: r.steve_value,
        real_value: r.real_value,
        mismatched_fields: r.mismatched_fields,
        details: r.details,
        steve_record_id: r.steve_record_id || null,
        external_id: r.external_id || null,
      }))
    );
  }

  // Create tasks for critical mismatches
  const criticals = allResults.filter(r => r.severity === 'CRITICAL' && r.status !== 'PASS');
  for (const cr of criticals) {
    const title = `[DETECTIVE] ${cr.severity}: ${cr.details.slice(0, 80)}`;
    const agent = AGENT_MAP[cr.module] || 'W5';

    // Dedup
    const { data: existing } = await supabase
      .from('tasks')
      .select('id')
      .eq('title', title)
      .in('status', ['pending', 'in_progress'])
      .limit(1);

    if (!existing?.length) {
      await supabase.from('tasks').insert({
        title,
        description: `Detective run ${runId}.\nModule: ${cr.module}\nMismatch: ${cr.mismatched_fields.join(', ')}\nSteve: ${JSON.stringify(cr.steve_value)}\nReal: ${JSON.stringify(cr.real_value)}`,
        priority: 'critica',
        type: 'bug',
        source: 'detective',
        assigned_agent: agent,
        status: 'pending',
        attempts: 0,
      });
      console.log(`[detective-visual] Created critical task for ${cr.module}: ${cr.details.slice(0, 60)}`);
    }
  }

  console.log(`[detective-visual] Run ${runId} complete: ${passed}/${total} passed, ${critical} critical`);

  return c.json({
    success: true,
    run_id: runId,
    total,
    passed,
    mismatches: mismatches + missing,
    errors,
    critical,
    score,
    by_module: byModule,
  });
}
