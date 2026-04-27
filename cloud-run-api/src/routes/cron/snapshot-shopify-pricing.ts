import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

/**
 * Daily Shopify pricing snapshot — task #18.
 * Endpoint: POST /api/cron/snapshot-shopify-pricing (X-Cron-Secret only)
 * Schedule: 0 4 * * * (4am daily, low-traffic window)
 *
 * Reads all active shopify_products and writes a row per (client, product, today)
 * into shopify_pricing_history. Steve estrategia consumes this to detect
 * pricing changes and surface them as alerts.
 */
export async function snapshotShopifyPricing(c: Context) {
  try {
    if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const supabase = getSupabaseAdmin();
    const today = new Date().toISOString().slice(0, 10);

    // Fetch all active products in batches
    const pageSize = 1000;
    let totalSnapshotted = 0;
    let from = 0;
    while (from < 50000) {
      const { data: products, error } = await supabase
        .from('shopify_products')
        .select('client_id, shopify_product_id, title, price_min, price_max')
        .eq('status', 'active')
        .range(from, from + pageSize - 1);
      if (error) {
        console.error('[snapshot-pricing] Read error:', error.message);
        return c.json({ error: 'Failed to read products', details: error.message }, 500);
      }
      if (!products || products.length === 0) break;

      const rows = products.map((p: any) => ({
        client_id: p.client_id,
        shopify_product_id: String(p.shopify_product_id),
        title: p.title,
        price_min: Number(p.price_min) || 0,
        price_max: Number(p.price_max) || 0,
        snapshot_date: today,
      }));
      const { error: upErr } = await supabase
        .from('shopify_pricing_history')
        .upsert(rows, { onConflict: 'client_id,shopify_product_id,snapshot_date' });
      if (upErr) {
        console.error('[snapshot-pricing] Upsert error:', upErr.message);
        return c.json({ error: 'Failed to upsert', details: upErr.message }, 500);
      }
      totalSnapshotted += rows.length;
      if (products.length < pageSize) break;
      from += pageSize;
    }

    console.log(`[snapshot-pricing] Snapshotted ${totalSnapshotted} products for ${today}`);
    return c.json({ ok: true, snapshotted: totalSnapshotted, snapshot_date: today });
  } catch (err: any) {
    console.error('[snapshot-pricing] Unhandled error:', err);
    return c.json({ error: 'Internal error', details: err?.message?.slice(0, 200) }, 500);
  }
}
