import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/**
 * Leadsie Webhook — receives POST when a merchant connects their assets via Leadsie.
 *
 * POST /api/webhooks/leadsie
 *
 * Auth / client matching (in priority order):
 *   1. body.user === customUserId → Steve client_id passed in the Leadsie webhook URL:
 *      https://steve-api-*.run.app/api/webhooks/leadsie?customUserId=<client_id>
 *   2. Fallback: match body.clientName against clients.name (case-insensitive)
 *   No match → stored as orphan for manual assignment.
 *
 * Platform mapping (by asset.type):
 *   Meta:    "Meta Ad Account", "Facebook Page", "Facebook Catalog",
 *            "Meta Pixel", "Instagram Account"
 *   Shopify: "Shopify Store"
 *   Klaviyo: "Klaviyo Account"
 *   Google:  "Google Ads Account", "Google Analytics Account",
 *            "Google Merchant Center", "Google Tag Manager", "Google My Business Location"
 *
 * Only processes assets where connectionStatus === "Connected".
 *
 * Leadsie docs: https://help.leadsie.com/article/webhooks
 */

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

interface LeadsieAsset {
  id: string;
  name: string;
  type: string;
  platform: string;
  connectionStatus: 'Connected' | 'In progress' | 'Unknown' | 'Insufficient permissions' | 'Not Connected';
  wasInitialGrantSuccessful?: boolean;
  time?: string;
  statusLastCheckedAt?: string;
  linkToAsset?: string;
  accessLevel?: 'Manage' | 'ViewOnly' | 'Owner';
  wasInvitedByEmail?: boolean;
  wasCreatedByLeadsie?: boolean;
  wasGrantedViaAssetType?: string;
  platformPermissionsGranted?: string | string[];
  shopifyCollaboratorCode?: string;
  messageFromUser?: string;
  notes?: string;
  assignedUsers?: Array<{
    id?: string;
    name?: string;
    role?: string;
    isSuccess?: boolean;
  }>;
  connectedAccount?: { id: string; name: string };
  googleBusinessProfileLocationMapsUri?: string;
  googleBusinessProfileLocationPlaceId?: string;
}

interface LeadsiePayload {
  user?: string;               // customUserId — we pass client_id here
  accessLevel?: 'view' | 'admin';
  requestName?: string;
  requestUrl?: string;
  status?: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED';
  clientName?: string;
  clientSummaryUrl?: string;
  apiVersion?: number;
  connectionAssets?: LeadsieAsset[];
}

// Assets collected per platform
interface MetaAssets {
  account_id: string | null;
  page_id: string | null;
  ig_account_id: string | null;
  pixel_id: string | null;
  catalog_id: string | null;
}

interface GoogleAssets {
  ads_account_id: string | null;
  analytics_account_id: string | null;
  merchant_center_id: string | null;
  tag_manager_id: string | null;
}

// ─────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────

export async function leadsieWebhook(c: Context) {
  try {
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
      await storeOrphan(body, 'no_match');
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

    // ── 3. Map by platform ─────────────────────────────
    const meta = mapMetaAssets(assets);
    const shopify = assets.find((a) => a.type === 'Shopify Store') || null;
    const klaviyo = assets.find((a) => a.type === 'Klaviyo Account') || null;
    const google = mapGoogleAssets(assets);

    const results: Record<string, any> = {};

    // ── 4. Upsert Meta connection ──────────────────────
    if (meta.account_id || meta.page_id || meta.ig_account_id || meta.pixel_id) {
      const isActive = !!meta.account_id;
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
      } else {
        results.meta = { account_id: meta.account_id, page_id: meta.page_id, active: isActive };
        if (isActive) {
          triggerMetaSync(clientId).catch((err) =>
            console.error('[leadsie-webhook] Meta sync trigger failed:', err),
          );
        }
      }
    }

    // ── 5. Upsert Shopify connection ───────────────────
    if (shopify) {
      const shopifyDomain = shopify.id.includes('.') ? shopify.id : `${shopify.id}.myshopify.com`;
      const { error: shopifyErr } = await supabase
        .from('platform_connections')
        .upsert(
          {
            client_id: clientId,
            platform: 'shopify',
            connection_type: 'leadsie',
            store_name: shopify.name,
            account_id: shopify.id,
            is_active: true,
            extra_data: {
              shopify_domain: shopifyDomain,
              collaborator_code: shopify.shopifyCollaboratorCode || null,
              link: shopify.linkToAsset || null,
            },
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'client_id,platform' },
        );

      if (shopifyErr) {
        console.error('[leadsie-webhook] Shopify upsert error:', shopifyErr);
      } else {
        results.shopify = { store: shopifyDomain, active: true };
      }
    }

    // ── 6. Upsert Klaviyo connection ───────────────────
    if (klaviyo) {
      const { error: klaviyoErr } = await supabase
        .from('platform_connections')
        .upsert(
          {
            client_id: clientId,
            platform: 'klaviyo',
            connection_type: 'leadsie',
            account_id: klaviyo.id,
            store_name: klaviyo.name,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'client_id,platform' },
        );

      if (klaviyoErr) {
        console.error('[leadsie-webhook] Klaviyo upsert error:', klaviyoErr);
      } else {
        results.klaviyo = { account_id: klaviyo.id, active: true };
      }
    }

    // ── 7. Upsert Google connection ────────────────────
    if (google.ads_account_id || google.analytics_account_id || google.merchant_center_id) {
      const isActive = !!google.ads_account_id;
      const { error: googleErr } = await supabase
        .from('platform_connections')
        .upsert(
          {
            client_id: clientId,
            platform: 'google',
            connection_type: 'leadsie',
            account_id: google.ads_account_id,
            is_active: isActive,
            extra_data: {
              analytics_account_id: google.analytics_account_id,
              merchant_center_id: google.merchant_center_id,
              tag_manager_id: google.tag_manager_id,
            },
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'client_id,platform' },
        );

      if (googleErr) {
        console.error('[leadsie-webhook] Google upsert error:', googleErr);
      } else {
        results.google = { ads_account_id: google.ads_account_id, active: isActive };
      }
    }

    console.log(`[leadsie-webhook] Processed client=${clientId} platforms=${Object.keys(results).join(',')} status=${body.status}`);

    return c.json({
      ok: true,
      status: 'connected',
      client_id: clientId,
      ...results,
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

function mapGoogleAssets(assets: LeadsieAsset[]): GoogleAssets {
  const result: GoogleAssets = {
    ads_account_id: null,
    analytics_account_id: null,
    merchant_center_id: null,
    tag_manager_id: null,
  };

  for (const a of assets) {
    const type = a.type;
    if (!result.ads_account_id && type === 'Google Ads Account') {
      result.ads_account_id = a.id;
    } else if (!result.analytics_account_id && type === 'Google Analytics Account') {
      result.analytics_account_id = a.id;
    } else if (!result.merchant_center_id && type === 'Google Merchant Center') {
      result.merchant_center_id = a.id;
    } else if (!result.tag_manager_id && type === 'Google Tag Manager') {
      result.tag_manager_id = a.id;
    }
  }

  return result;
}

async function storeOrphan(body: LeadsiePayload, reason: string): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('orphan_meta_connections').insert({
      end_user_id: body.user || null,
      end_user_name: body.clientName || null,
      event_type: 'leadsie_webhook',
      status: body.status || null,
      raw_payload: body as unknown as Record<string, unknown>,
      notes: reason,
    });
  } catch (err) {
    console.error('[leadsie-webhook] Failed to store orphan:', err);
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
