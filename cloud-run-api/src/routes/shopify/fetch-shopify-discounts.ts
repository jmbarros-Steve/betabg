import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { decryptPlatformToken } from '../../lib/decrypt-token.js';

/**
 * POST /api/fetch-shopify-discounts
 * Returns active/expired price rules + discount codes for a client's Shopify store.
 * Body: { client_id, connection_id? }
 */
export async function fetchShopifyDiscounts(c: Context) {
  try {
    const supabase = getSupabaseAdmin();
    const { client_id, connection_id } = await c.req.json();

    if (!client_id) return c.json({ error: 'client_id required' }, 400);

    // Find Shopify connection
    let query = supabase
      .from('platform_connections')
      .select('id, store_url, access_token_encrypted')
      .eq('client_id', client_id)
      .eq('platform', 'shopify')
      .eq('is_active', true);

    if (connection_id) query = query.eq('id', connection_id);

    const { data: conn } = await query.limit(1).single();
    if (!conn?.store_url || !conn?.access_token_encrypted) {
      return c.json({ error: 'No active Shopify connection' }, 404);
    }

    const token = await decryptPlatformToken(supabase, conn.access_token_encrypted);
    if (!token) return c.json({ error: 'Token decryption failed' }, 500);

    const storeUrl = conn.store_url.replace(/^https?:\/\//, '');
    const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' };
    const API_VERSION = '2025-01';

    // Fetch price rules
    const prRes = await fetch(
      `https://${storeUrl}/admin/api/${API_VERSION}/price_rules.json?limit=50`,
      { headers }
    );

    if (!prRes.ok) {
      return c.json({ error: `Shopify API error: ${prRes.status}` }, 502);
    }

    const { price_rules } = await prRes.json() as any;

    // For each price rule, fetch discount codes
    const discounts: any[] = [];
    for (const pr of (price_rules || [])) {
      const codesRes = await fetch(
        `https://${storeUrl}/admin/api/${API_VERSION}/price_rules/${pr.id}/discount_codes.json?limit=10`,
        { headers }
      );

      let codes: any[] = [];
      if (codesRes.ok) {
        const data = await codesRes.json() as any;
        codes = data.discount_codes || [];
      }

      const now = new Date();
      const startsAt = pr.starts_at ? new Date(pr.starts_at) : null;
      const endsAt = pr.ends_at ? new Date(pr.ends_at) : null;
      const isExpired = endsAt ? endsAt < now : false;
      const isActive = !isExpired && (startsAt ? startsAt <= now : true);

      discounts.push({
        id: pr.id,
        title: pr.title,
        value_type: pr.value_type, // 'percentage' | 'fixed_amount'
        value: pr.value, // "-20.0" for 20% off or "-5000" for $5000 off
        usage_limit: pr.usage_limit,
        times_used: codes.reduce((s: number, c: any) => s + (c.usage_count || 0), 0),
        starts_at: pr.starts_at,
        ends_at: pr.ends_at,
        status: isExpired ? 'expired' : isActive ? 'active' : 'scheduled',
        codes: codes.map((c: any) => ({
          id: c.id,
          code: c.code,
          usage_count: c.usage_count,
          created_at: c.created_at,
        })),
      });
    }

    return c.json({
      discounts,
      total: discounts.length,
      active: discounts.filter((d) => d.status === 'active').length,
      expired: discounts.filter((d) => d.status === 'expired').length,
    });
  } catch (err: any) {
    console.error('[fetch-shopify-discounts] Error:', err);
    return c.json({ error: err.message }, 500);
  }
}
