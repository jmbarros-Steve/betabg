import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import type { LeadsiePayload, LeadsieAsset } from './leadsie-types.js';

/**
 * Leadsie Webhook — Google Ads
 *
 * POST /api/webhooks/leadsie-google
 *
 * Receives POST when a merchant connects their Google Ads account via Leadsie.
 * The MCC (My Client Center) of Steve already has access; this webhook just
 * records which customer_id belongs to which Steve client.
 *
 * Client matching: same 3-step logic as Meta webhook (UUID → name → orphan).
 *
 * Only processes assets where connectionStatus === "Connected" and
 * type === "Google Ads Account".
 *
 * Token: access_token_encrypted = NULL (token lives in env var GOOGLE_MCC_REFRESH_TOKEN).
 */

interface GoogleAssets {
  customer_id: string | null;
}

export async function leadsieGoogleWebhook(c: Context) {
  try {
    // ── 0. Shared-secret validation ────────────────────
    const expectedSecret = process.env.LEADSIE_WEBHOOK_SECRET;
    if (expectedSecret) {
      const providedSecret =
        c.req.header('x-webhook-secret') || c.req.query('secret') || '';
      if (providedSecret !== expectedSecret) {
        console.warn('[leadsie-google-webhook] Rejected: invalid secret');
        return c.json({ error: 'Unauthorized' }, 401);
      }
    } else {
      console.warn(
        '[leadsie-google-webhook] LEADSIE_WEBHOOK_SECRET not set — accepting without auth (dev mode)',
      );
    }

    const rawBody = await c.req.text();
    let body: LeadsiePayload;
    try {
      body = JSON.parse(rawBody);
    } catch {
      console.error('[leadsie-google-webhook] Invalid JSON body');
      return c.json({ error: 'Invalid JSON' }, 400);
    }

    console.log(`[leadsie-google-webhook] Received: status=${body.status} user=${body.user} clientName="${body.clientName}" assets=${body.connectionAssets?.length ?? 0}`);

    // Only process successful connections
    if (body.status === 'FAILED') {
      console.log('[leadsie-google-webhook] status=FAILED, ignoring');
      return c.json({ ok: true, status: 'ignored', reason: 'failed' });
    }

    const supabase = getSupabaseAdmin();
    const customUserId = (body.user || '').trim();

    // ── 1. Match client ────────────────────────────────
    let clientId: string | null = null;

    // Priority 1: customUserId is the Steve client_id (UUID)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customUserId);
    if (isUuid) {
      const { data: byId } = await supabase
        .from('clients')
        .select('id')
        .eq('id', customUserId)
        .maybeSingle();
      if (byId) clientId = byId.id;
    }

    // Priority 2: match by clientName
    if (!clientId && body.clientName) {
      const { data: byName } = await supabase
        .from('clients')
        .select('id')
        .ilike('name', body.clientName.trim())
        .maybeSingle();
      if (byName) clientId = byName.id;
    }

    if (!clientId) {
      console.warn(`[leadsie-google-webhook] No client matched user="${customUserId}" clientName="${body.clientName}" → orphan`);
      try {
        await storeOrphan(body, 'no_match');
      } catch (err) {
        console.error('[leadsie-google-webhook] storeOrphan failed — payload:', {
          err: err instanceof Error ? err.message : String(err),
          body,
        });
        return c.json({ error: 'Failed to store orphan connection' }, 500);
      }
      return c.json({ ok: true, status: 'orphan', reason: 'no_match' });
    }

    // ── 2. Filter connected assets ─────────────────────
    const assets = (body.connectionAssets || []).filter(
      (a) => a.connectionStatus === 'Connected',
    );

    if (assets.length === 0) {
      console.warn(`[leadsie-google-webhook] No connected assets for client ${clientId}`);
      return c.json({ ok: true, status: 'no_assets', client_id: clientId });
    }

    // ── 3. Map Google Ads assets ─────────────────────
    const google = mapGoogleAssets(assets);

    if (!google.customer_id) {
      console.warn(`[leadsie-google-webhook] No Google Ads account found for client ${clientId}`);
      return c.json({ ok: true, status: 'no_google_assets', client_id: clientId });
    }

    // ── 4. Upsert Google connection ──────────────────
    const { error: googleErr } = await supabase
      .from('platform_connections')
      .upsert(
        {
          client_id: clientId,
          platform: 'google',
          connection_type: 'leadsie',
          account_id: google.customer_id,
          is_active: true,
          access_token_encrypted: null,  // Token lives in MCC env var
          refresh_token_encrypted: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'client_id,platform' },
      );

    if (googleErr) {
      console.error('[leadsie-google-webhook] Google upsert error:', googleErr);
      return c.json({ error: 'Failed to save connection' }, 500);
    }

    // Trigger Google Ads sync post-connection
    triggerGoogleSync(clientId).catch((err) =>
      console.error('[leadsie-google-webhook] Google sync trigger failed:', err),
    );

    console.log(
      `[leadsie-google-webhook] Connected client=${clientId} customer_id=${google.customer_id}`,
    );

    return c.json({
      ok: true,
      status: 'connected',
      client_id: clientId,
      google: {
        customer_id: google.customer_id,
      },
    });

  } catch (error) {
    console.error('[leadsie-google-webhook] Error:', error);
    return c.json({ error: 'Internal error' }, 500);
  }
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function mapGoogleAssets(assets: LeadsieAsset[]): GoogleAssets {
  const result: GoogleAssets = {
    customer_id: null,
  };

  for (const a of assets) {
    // Leadsie type for Google Ads accounts
    if (!result.customer_id && a.type === 'Google Ads Account') {
      // customer_id comes as the asset id; strip any non-numeric chars
      result.customer_id = a.id.replace(/\D/g, '');
    }
  }

  return result;
}

async function storeOrphan(body: LeadsiePayload, reason: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('orphan_meta_connections').insert({
    end_user_id: body.user || null,
    end_user_name: body.clientName || null,
    event_type: 'leadsie_google_webhook',
    status: body.status || null,
    raw_payload: body as unknown as Record<string, unknown>,
    notes: reason,
  });
  if (error) {
    throw new Error(`orphan_meta_connections insert failed: ${error.message}`);
  }
}

async function triggerGoogleSync(clientId: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data: conn } = await supabase
    .from('platform_connections')
    .select('id')
    .eq('client_id', clientId)
    .eq('platform', 'google')
    .eq('is_active', true)
    .maybeSingle();

  if (!conn) return;

  const baseUrl = process.env.SELF_URL || `https://steve-api-850416724643.us-central1.run.app`;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return;

  await fetch(`${baseUrl}/api/sync-google-ads-metrics`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
      'X-Internal-Key': serviceKey,
    },
    body: JSON.stringify({ connection_id: conn.id }),
  });
}
