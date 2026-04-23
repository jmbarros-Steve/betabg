import { Context } from 'hono';
import { timingSafeEqual } from 'crypto';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { assignAssetsToSystemUser } from '../../lib/meta-asset-assign.js';

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
 *   Meta — "Meta Ad Account", "Facebook Page", "Instagram Account",
 *          "Meta Pixel", "Facebook Catalog" (catalog id ignored — no DB column).
 *   Google Ads — "Google Ads Account" (customer_id stored in account_id).
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
      // Pad to same length before timingSafeEqual to avoid length-based info leak
      const maxLen = Math.max(expectedSecret.length, providedSecret.length);
      const expectedBuf = Buffer.alloc(maxLen);
      const providedBuf = Buffer.alloc(maxLen);
      Buffer.from(expectedSecret).copy(expectedBuf);
      Buffer.from(providedSecret).copy(providedBuf);
      const isValid = providedSecret.length === expectedSecret.length &&
        timingSafeEqual(providedBuf, expectedBuf);
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
    const meta = mapMetaAssets(assets);

    // ── 4. Map Google Ads assets ─────────────────────
    const google = mapGoogleAssets(assets);

    if (!meta.account_id && !meta.page_id && !meta.ig_account_id && !meta.pixel_id && !google.customer_id) {
      console.warn(`[leadsie-webhook] No Meta or Google assets found for client ${clientId}`);
      return c.json({ ok: true, status: 'no_assets_mapped', client_id: clientId });
    }

    // ── 5. Merge Meta connection (non-null wins) ──────
    let metaActive = false;
    if (meta.account_id || meta.page_id || meta.ig_account_id || meta.pixel_id) {
      // Check if connection already exists to MERGE instead of blindly overwriting.
      // Leadsie fires multiple webhooks (PARTIAL_SUCCESS retries) within ms — the last
      // one to commit wins.  A webhook with fewer Connected assets would null out fields
      // set by a previous webhook.  Fix: only update fields that are non-null in THIS
      // webhook; preserve previously stored values for the rest.
      const { data: existing } = await supabase
        .from('platform_connections')
        .select('id, account_id, page_id, ig_account_id, pixel_id')
        .eq('client_id', clientId)
        .eq('platform', 'meta')
        .maybeSingle();

      const merged = {
        account_id: meta.account_id ?? existing?.account_id ?? null,
        page_id: meta.page_id ?? existing?.page_id ?? null,
        ig_account_id: meta.ig_account_id ?? existing?.ig_account_id ?? null,
        pixel_id: meta.pixel_id ?? existing?.pixel_id ?? null,
      };

      metaActive = !!(merged.account_id || merged.page_id || merged.ig_account_id);

      if (existing) {
        // UPDATE — merge non-null values, keep existing for null fields
        const { error: metaErr } = await supabase
          .from('platform_connections')
          .update({
            connection_type: 'leadsie',
            account_id: merged.account_id,
            page_id: merged.page_id,
            ig_account_id: merged.ig_account_id,
            pixel_id: merged.pixel_id,
            is_active: metaActive,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (metaErr) {
          console.error('[leadsie-webhook] Meta update error:', metaErr);
          return c.json({ error: 'Failed to save Meta connection' }, 500);
        }
      } else {
        // INSERT — first time, no existing data to merge
        const { error: metaErr } = await supabase
          .from('platform_connections')
          .insert({
            client_id: clientId,
            platform: 'meta',
            connection_type: 'leadsie',
            account_id: merged.account_id,
            page_id: merged.page_id,
            ig_account_id: merged.ig_account_id,
            pixel_id: merged.pixel_id,
            is_active: metaActive,
            updated_at: new Date().toISOString(),
          });

        if (metaErr) {
          console.error('[leadsie-webhook] Meta insert error:', metaErr);
          return c.json({ error: 'Failed to save Meta connection' }, 500);
        }
      }

      if (metaActive) {
        triggerMetaSync(clientId).catch((err) =>
          console.error(`[leadsie-webhook] Meta sync trigger failed for client=${clientId}:`, err),
        );
      }

      console.log(
        `[leadsie-webhook] Meta connected client=${clientId} ad_account=${merged.account_id} page=${merged.page_id} ig=${merged.ig_account_id} pixel=${merged.pixel_id} active=${metaActive} (merged=${!!existing})`,
      );

      // Assign Steve's System User to the freshly-shared assets so the API
      // token can actually operate them. BM-level partnership via Leadsie
      // grants access to Steve BM but NOT to the SU — we must add the SU
      // explicitly or creating campaigns fails with "ads_management not
      // granted". Non-blocking: we log failures but don't abort the webhook.
      assignAssetsToSystemUser({
        ad_account_id: merged.account_id,
        page_id: merged.page_id,
        pixel_id: merged.pixel_id,
        ig_account_id: merged.ig_account_id,
        // catalog_id comes from the webhook payload (meta.catalog_id) even
        // though we don't persist it yet — still worth assigning to the SU.
        catalog_id: meta.catalog_id || null,
      })
        .then((r) =>
          console.log(
            `[leadsie-webhook] SU assignment for client=${clientId}: assigned=${r.assigned.length} skipped=${r.skipped.length} failed=${r.failed.length}${r.failed.length > 0 ? ' — ' + JSON.stringify(r.failed) : ''}`,
          ),
        )
        .catch((err) =>
          console.error(`[leadsie-webhook] SU assignment threw for client=${clientId}:`, err),
        );
    }

    // ── 6. Upsert Google Ads connection ────────────────
    let googleActive = false;
    if (google.customer_id) {
      googleActive = true;
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
        console.error('[leadsie-webhook] Google upsert error:', googleErr);
        // Don't fail the whole request if Meta already succeeded
      } else {
        triggerGoogleSync(clientId).catch((err) =>
          console.error(`[leadsie-webhook] Google sync trigger failed for client=${clientId}:`, err),
        );
        console.log(
          `[leadsie-webhook] Google connected client=${clientId} customer_id=${google.customer_id}`,
        );
      }
    }

    return c.json({
      ok: true,
      status: (metaActive || googleActive) ? 'connected' : 'partial',
      client_id: clientId,
      meta: {
        account_id: meta.account_id,
        page_id: meta.page_id,
        ig_account_id: meta.ig_account_id,
        pixel_id: meta.pixel_id,
        active: metaActive,
      },
      google: {
        customer_id: google.customer_id,
        active: googleActive,
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

function mapGoogleAssets(assets: LeadsieAsset[]): { customer_id: string | null } {
  for (const a of assets) {
    if (a.type === 'Google Ads Account') {
      return { customer_id: a.id.replace(/\D/g, '') };
    }
  }
  return { customer_id: null };
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

  const res = await fetch(`${baseUrl}/api/sync-meta-metrics`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
      'X-Internal-Key': serviceKey,
    },
    body: JSON.stringify({ connection_id: conn.id }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`sync-meta-metrics returned ${res.status}: ${detail.slice(0, 200)}`);
  }
}
