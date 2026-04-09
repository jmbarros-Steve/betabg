import { Context } from 'hono';
import { timingSafeEqual } from 'crypto';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/**
 * Leadsie Webhook — receives POST when a merchant connects their assets via Leadsie.
 *
 * POST /api/webhooks/leadsie
 *
 * Client matching (in priority order):
 *   1. body.user === customUserId → Steve client_id passed in the Connect URL:
 *      https://app.leadsie.com/connect/<slug>?customUserId=<client_id>
 *   2. Fallback: match body.clientName against clients.name (case-insensitive)
 *   No match → stored as orphan for manual assignment.
 *
 * Platforms processed:
 *   Meta only — "Meta Ad Account", "Facebook Page", "Instagram Account",
 *               "Meta Pixel", "Facebook Catalog" (catalog id ignored — no DB column).
 *
 * Other platforms in the payload (Shopify, Klaviyo, Google) are intentionally
 * ignored. Their backend modules are not built yet — when each is ready, the
 * handler will be extended to upsert those connections.
 *
 * Only processes assets where connectionStatus === "Connected".
 * Leadsie docs: https://help.leadsie.com/article/webhooks
 */

// ─────────────────────────────────────────────────────────
// Types (shared with leadsie-google-webhook.ts)
// ─────────────────────────────────────────────────────────
import type { LeadsiePayload, LeadsieAsset } from './leadsie-types.js';

// Assets collected per platform
interface MetaAssets {
  account_id: string | null;
  page_id: string | null;
  ig_account_id: string | null;
  pixel_id: string | null;
  catalog_id: string | null;
}

// ─────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────

export async function leadsieWebhook(c: Context) {
  try {
    // ── 0. Shared-secret validation ────────────────────
    // Leadsie does not sign webhooks with HMAC, so we rely on a shared secret
    // passed either as query param (?secret=...) or as header X-Webhook-Secret.
    // If LEADSIE_WEBHOOK_SECRET env var is unset we log a warning and accept
    // the request — this keeps the initial bootstrap flow working, but prod
    // should always have the secret set.
    const expectedSecret = process.env.LEADSIE_WEBHOOK_SECRET;
    if (expectedSecret) {
      if (c.req.query('secret')) {
        console.warn('[leadsie-webhook] Secret in URL query param — should use header instead');
      }
      const providedSecret =
        c.req.header('x-webhook-secret') || c.req.query('secret') || '';
      const isValid = providedSecret &&
        expectedSecret.length === providedSecret.length &&
        timingSafeEqual(Buffer.from(providedSecret), Buffer.from(expectedSecret));
      if (!isValid) {
        console.warn('[leadsie-webhook] Rejected: invalid secret');
        return c.json({ error: 'Unauthorized' }, 401);
      }
    } else {
      console.warn(
        '[leadsie-webhook] LEADSIE_WEBHOOK_SECRET not set — accepting without auth (dev mode)',
      );
    }

    const rawBody = await c.req.text();
    let body: LeadsiePayload;
    try {
      body = JSON.parse(rawBody);
    } catch {
      console.error('[leadsie-webhook] Invalid JSON body');
      return c.json({ error: 'Invalid JSON' }, 400);
    }

    console.log(`[leadsie-webhook] Received: status=${body.status} user=${body.user} clientName="${body.clientName}" assets=${body.connectionAssets?.length ?? 0}`);

    // Only process successful connections
    if (body.status === 'FAILED') {
      console.log('[leadsie-webhook] status=FAILED, ignoring');
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
      console.warn(`[leadsie-webhook] No client matched user="${customUserId}" clientName="${body.clientName}" → orphan`);
      try {
        await storeOrphan(body, 'no_match');
      } catch (err) {
        // Log the full payload structured so Cloud Logging / Sentry keeps a
        // record even if the orphan table insert failed permanently. Without
        // this the webhook would tell Leadsie to retry while silently losing
        // the data to the failing insert.
        console.error('[leadsie-webhook] storeOrphan failed — payload lost to table:', {
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
      console.warn(`[leadsie-webhook] No connected assets for client ${clientId}`);
      return c.json({ ok: true, status: 'no_assets', client_id: clientId });
    }

    // ── 3. Map Meta assets ─────────────────────────────
    // Other platforms (Shopify, Klaviyo, Google) are intentionally ignored
    // for now — modules not built yet. They'll be added when each module is ready.
    const meta = mapMetaAssets(assets);

    if (!meta.account_id && !meta.page_id && !meta.ig_account_id && !meta.pixel_id) {
      console.warn(`[leadsie-webhook] No Meta assets found for client ${clientId}`);
      return c.json({ ok: true, status: 'no_meta_assets', client_id: clientId });
    }

    // ── 4. Upsert Meta connection ──────────────────────
    // is_active = true if we got ANY asset that unlocks value.
    // Ad account enables paid campaigns; page/IG alone still enables organic
    // publishing + insights, so the merchant should see the connection as "on"
    // (MetaPartnerSetup polls for is_active to move to "connected" state).
    const isActive = !!(
      meta.account_id ||
      meta.page_id ||
      meta.ig_account_id
    );
    const { error: metaErr } = await supabase
      .from('platform_connections')
      .upsert(
        {
          client_id: clientId,
          platform: 'meta',
          connection_type: 'leadsie',
          account_id: meta.account_id,
          page_id: meta.page_id,
          ig_account_id: meta.ig_account_id,
          pixel_id: meta.pixel_id,
          is_active: isActive,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'client_id,platform' },
      );

    if (metaErr) {
      console.error('[leadsie-webhook] Meta upsert error:', metaErr);
      return c.json({ error: 'Failed to save connection' }, 500);
    }

    if (isActive) {
      triggerMetaSync(clientId).catch((err) =>
        console.error('[leadsie-webhook] Meta sync trigger failed:', err),
      );
    }

    console.log(
      `[leadsie-webhook] Connected client=${clientId} ad_account=${meta.account_id} page=${meta.page_id} ig=${meta.ig_account_id} pixel=${meta.pixel_id} active=${isActive}`,
    );

    return c.json({
      ok: true,
      status: isActive ? 'connected' : 'partial',
      client_id: clientId,
      meta: {
        account_id: meta.account_id,
        page_id: meta.page_id,
        ig_account_id: meta.ig_account_id,
        pixel_id: meta.pixel_id,
        active: isActive,
      },
    });

  } catch (error) {
    console.error('[leadsie-webhook] Error:', error);
    return c.json({ error: 'Internal error' }, 500);
  }
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function mapMetaAssets(assets: LeadsieAsset[]): MetaAssets {
  const result: MetaAssets = {
    account_id: null,
    page_id: null,
    ig_account_id: null,
    pixel_id: null,
    catalog_id: null,
  };

  for (const a of assets) {
    const type = a.type;
    if (!result.account_id && type === 'Meta Ad Account') {
      result.account_id = a.id.replace(/^act_/, '');
    } else if (!result.page_id && type === 'Facebook Page') {
      result.page_id = a.id;
    } else if (!result.ig_account_id && type === 'Instagram Account') {
      result.ig_account_id = a.id;
    } else if (!result.pixel_id && type === 'Meta Pixel') {
      result.pixel_id = a.id;
    } else if (!result.catalog_id && type === 'Facebook Catalog') {
      result.catalog_id = a.id;
    }
  }

  return result;
}

async function storeOrphan(body: LeadsiePayload, reason: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('orphan_meta_connections').insert({
    end_user_id: body.user || null,
    end_user_name: body.clientName || null,
    event_type: 'leadsie_webhook',
    status: body.status || null,
    raw_payload: body as unknown as Record<string, unknown>,
    notes: reason,
  });
  if (error) {
    // Propagate so the caller can return 500 and Leadsie retries the webhook
    throw new Error(`orphan_meta_connections insert failed: ${error.message}`);
  }
}

async function triggerMetaSync(clientId: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data: conn } = await supabase
    .from('platform_connections')
    .select('id')
    .eq('client_id', clientId)
    .eq('platform', 'meta')
    .eq('is_active', true)
    .maybeSingle();

  if (!conn) return;

  const baseUrl = process.env.SELF_URL || `https://steve-api-850416724643.us-central1.run.app`;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return;

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
