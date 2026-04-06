import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { discoverAssetsInternal } from '../meta/discover-client-assets.js';

/**
 * Leadsie Webhook — receives notification when a merchant accepts sharing
 * their Meta assets with Steve's Business Manager.
 *
 * POST /api/webhooks/leadsie
 * Headers: X-Leadsie-Secret: {LEADSIE_WEBHOOK_SECRET}
 * Body: { customUserId, status, assets[], clientName, requestUrl }
 *
 * Public endpoint (no JWT) — validated via shared secret.
 */
export async function leadsieWebhook(c: Context) {
  try {
    // Validate webhook secret
    const secret = c.req.header('X-Leadsie-Secret');
    const expectedSecret = process.env.LEADSIE_WEBHOOK_SECRET;

    if (!expectedSecret || secret !== expectedSecret) {
      console.error('[leadsie-webhook] Invalid or missing X-Leadsie-Secret');
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const { customUserId, status, assets, clientName } = body;

    console.log(`[leadsie-webhook] Received: status=${status}, customUserId=${customUserId}, clientName=${clientName}`);

    // customUserId is the client_id passed via Leadsie embed URL
    const clientId = customUserId;
    if (!clientId) {
      console.error('[leadsie-webhook] Missing customUserId');
      return c.json({ error: 'Missing customUserId' }, 400);
    }

    // If not success, just log and return 200 (Leadsie may retry otherwise)
    if (status !== 'SUCCESS' && status !== 'success') {
      console.warn(`[leadsie-webhook] Non-success status: ${status} for client ${clientId}`);
      return c.json({ ok: true, status: 'skipped' });
    }

    const supabase = getSupabaseAdmin();

    // Verify the client exists
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, company_name')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      console.error(`[leadsie-webhook] Client not found: ${clientId}`, clientError);
      return c.json({ error: 'Client not found' }, 404);
    }

    // Use SUAT to discover what assets are now shared with Steve's BM
    const suat = process.env.META_SYSTEM_TOKEN;
    const steveBmId = process.env.STEVE_BM_ID;

    if (!suat || !steveBmId) {
      console.error('[leadsie-webhook] META_SYSTEM_TOKEN or STEVE_BM_ID not configured');
      return c.json({ error: 'Server configuration error' }, 500);
    }

    const discovered = await discoverAssetsInternal(suat, steveBmId);
    console.log(`[leadsie-webhook] Discovered: ${discovered.adAccounts.length} ad accounts, ${discovered.pages.length} pages, ${discovered.pixels.length} pixels`);

    if (discovered.adAccounts.length === 0) {
      console.warn(`[leadsie-webhook] No active ad accounts found for client ${clientId}`);
      // Still return 200 — assets may take a moment to propagate
      return c.json({ ok: true, status: 'no_accounts', message: 'No active ad accounts found yet' });
    }

    // Pick the first page and pixel (most merchants have 1 of each)
    const page = discovered.pages[0] || null;
    const pixel = discovered.pixels[0] || null;

    if (discovered.adAccounts.length === 1) {
      // AUTO-CREATE: Single ad account → create connection immediately
      const acc = discovered.adAccounts[0];
      const adAccountId = acc.account_id || acc.id.replace('act_', '');

      const { error: upsertError } = await supabase
        .from('platform_connections')
        .upsert({
          client_id: clientId,
          platform: 'meta',
          connection_type: 'bm_partner',
          account_id: adAccountId,
          page_id: page?.id || null,
          ig_account_id: page?.instagram_business_account?.id || null,
          pixel_id: pixel?.id || null,
          is_active: true,
          store_name: acc.name || clientName || null,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'client_id,platform',
        });

      if (upsertError) {
        console.error('[leadsie-webhook] Upsert failed:', upsertError);
        return c.json({ error: 'Failed to create connection' }, 500);
      }

      console.log(`[leadsie-webhook] Auto-created bm_partner connection for client ${clientId}, ad account ${adAccountId}`);

      // Fire & forget: trigger metrics sync
      triggerMetricsSync(clientId).catch(err =>
        console.error('[leadsie-webhook] Metrics sync trigger failed:', err),
      );

      return c.json({ ok: true, status: 'connected', ad_account: adAccountId });
    }

    // MULTIPLE AD ACCOUNTS: Store asset info for manual selection
    // Save discovered assets as JSON in the connection (merchant picks later)
    const { error: upsertError } = await supabase
      .from('platform_connections')
      .upsert({
        client_id: clientId,
        platform: 'meta',
        connection_type: 'bm_partner',
        is_active: false, // Needs manual account selection
        store_name: clientName || null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'client_id,platform',
      });

    if (upsertError) {
      console.error('[leadsie-webhook] Upsert (multi-account) failed:', upsertError);
    }

    console.log(`[leadsie-webhook] Multiple ad accounts (${discovered.adAccounts.length}) for client ${clientId} — needs manual selection`);

    return c.json({
      ok: true,
      status: 'needs_selection',
      ad_accounts_count: discovered.adAccounts.length,
    });
  } catch (error) {
    console.error('[leadsie-webhook] Error:', error);
    return c.json({ error: 'Internal error' }, 500);
  }
}

/**
 * Fire & forget: call sync-meta-metrics for the newly connected client.
 */
async function triggerMetricsSync(clientId: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Find the connection we just created
  const { data: conn } = await supabase
    .from('platform_connections')
    .select('id')
    .eq('client_id', clientId)
    .eq('platform', 'meta')
    .eq('is_active', true)
    .single();

  if (!conn) return;

  const baseUrl = process.env.SELF_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !serviceKey) return;

  await fetch(`${baseUrl}/api/sync-meta-metrics`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
      'X-Internal-Key': serviceKey,
    },
    body: JSON.stringify({ connection_id: conn.id }),
  });
}
