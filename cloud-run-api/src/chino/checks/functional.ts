// El Chino — functional check executor
// Creates something real on an external platform, verifies it exists, then cleans up.
// Pattern: CREATE → WAIT → VERIFY → CLEANUP (always)

import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptPlatformToken } from '../../lib/decrypt-token.js';
import type { ChinoCheck, MerchantConn, CheckResult } from '../types.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TIMEOUT = 30_000;

// ─── Fetch with timeout ──────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  Klaviyo: Create → Verify → Delete a test campaign
// ═══════════════════════════════════════════════════════════════════

async function createTestEmailInKlaviyo(apiKey: string): Promise<string | null> {
  // First get a list ID to use for the campaign
  const listsRes = await fetchWithTimeout(
    'https://a.klaviyo.com/api/lists/',
    {
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        revision: '2024-10-15',
        accept: 'application/json',
      },
    },
  );
  if (!listsRes.ok) return null;
  const listsData = (await listsRes.json()) as any;
  const listId = listsData.data?.[0]?.id;
  if (!listId) return null;

  const scheduledAt = new Date(Date.now() + 7 * 86400_000).toISOString();

  const res = await fetchWithTimeout(
    'https://a.klaviyo.com/api/campaigns/',
    {
      method: 'POST',
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        revision: '2024-10-15',
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        data: {
          type: 'campaign',
          attributes: {
            name: `QA_CHINO_TEST_${Date.now()}`,
            audiences: {
              included: [listId],
              excluded: [],
            },
            campaign_type: 'email',
            send_strategy: {
              method: 'static',
              options_static: { datetime: scheduledAt },
            },
          },
        },
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error(`[chino/functional] Klaviyo create failed ${res.status}: ${errText}`);
    return null;
  }
  const data = (await res.json()) as any;
  return data.data?.id || null;
}

async function verifyEmailExistsInKlaviyo(apiKey: string, campaignId: string): Promise<boolean> {
  const res = await fetchWithTimeout(
    `https://a.klaviyo.com/api/campaigns/${campaignId}`,
    {
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        revision: '2024-10-15',
        accept: 'application/json',
      },
    },
  );
  return res.ok;
}

async function deleteFromKlaviyo(apiKey: string, campaignId: string): Promise<void> {
  await fetchWithTimeout(
    `https://a.klaviyo.com/api/campaigns/${campaignId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        revision: '2024-10-15',
      },
    },
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Shopify: Create → Verify → Delete a test price rule (discount)
// ═══════════════════════════════════════════════════════════════════

async function createTestDiscountInShopify(storeUrl: string, token: string): Promise<string | null> {
  const res = await fetchWithTimeout(
    `https://${storeUrl}/admin/api/2025-01/price_rules.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        price_rule: {
          title: `QA_CHINO_TEST_${Date.now()}`,
          target_type: 'line_item',
          target_selection: 'all',
          allocation_method: 'across',
          value_type: 'percentage',
          value: '-10.0',
          customer_selection: 'all',
          starts_at: new Date().toISOString(),
          // Expires in 1 hour as safety net
          ends_at: new Date(Date.now() + 3600_000).toISOString(),
        },
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error(`[chino/functional] Shopify create discount failed ${res.status}: ${errText}`);
    return null;
  }
  const data = (await res.json()) as any;
  return data.price_rule?.id ? String(data.price_rule.id) : null;
}

async function verifyDiscountExistsInShopify(storeUrl: string, token: string, priceRuleId: string): Promise<boolean> {
  const res = await fetchWithTimeout(
    `https://${storeUrl}/admin/api/2025-01/price_rules/${priceRuleId}.json`,
    {
      headers: { 'X-Shopify-Access-Token': token },
    },
  );
  return res.ok;
}

async function deleteFromShopify(storeUrl: string, token: string, priceRuleId: string): Promise<void> {
  await fetchWithTimeout(
    `https://${storeUrl}/admin/api/2025-01/price_rules/${priceRuleId}.json`,
    {
      method: 'DELETE',
      headers: { 'X-Shopify-Access-Token': token },
    },
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Meta: Create → Verify → Delete a PAUSED test campaign
// ═══════════════════════════════════════════════════════════════════

async function createTestCampaignInMeta(token: string, accountId: string): Promise<string | null> {
  const res = await fetchWithTimeout(
    `https://graph.facebook.com/v21.0/act_${accountId}/campaigns`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `QA_CHINO_TEST_${Date.now()}`,
        objective: 'OUTCOME_AWARENESS',
        status: 'PAUSED', // NEVER active — don't spend merchant money
        special_ad_categories: [],
        access_token: token,
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error(`[chino/functional] Meta create campaign failed ${res.status}: ${errText}`);
    return null;
  }
  const data = (await res.json()) as any;
  return data.id || null;
}

async function verifyCampaignExistsInMeta(token: string, campaignId: string): Promise<boolean> {
  const res = await fetchWithTimeout(
    `https://graph.facebook.com/v21.0/${campaignId}?fields=name,status&access_token=${token}`,
    {},
  );
  return res.ok;
}

async function deleteFromMeta(token: string, campaignId: string): Promise<void> {
  await fetchWithTimeout(
    `https://graph.facebook.com/v21.0/${campaignId}?access_token=${token}`,
    { method: 'DELETE' },
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Main functional check executor
// ═══════════════════════════════════════════════════════════════════

export async function executeFunctional(
  supabase: SupabaseClient,
  check: ChinoCheck,
  merchant: MerchantConn,
  decryptedToken: string | null
): Promise<CheckResult> {
  const start = Date.now();
  const action = check.check_config?.action as string | undefined;
  const cleanup = check.check_config?.cleanup !== false; // default true

  if (!action) {
    return {
      result: 'skip',
      error_message: 'check_config missing action',
      duration_ms: Date.now() - start,
    };
  }

  if (!decryptedToken) {
    return {
      result: 'skip',
      error_message: 'No hay token para functional check',
      duration_ms: Date.now() - start,
    };
  }

  let createdId: string | null = null;

  try {
    // ── 1. CREATE ──
    if (action === 'push_test_email') {
      createdId = await createTestEmailInKlaviyo(decryptedToken);
    } else if (action === 'create_discount') {
      if (!merchant.store_url) {
        return { result: 'skip', error_message: 'No store_url', duration_ms: Date.now() - start };
      }
      createdId = await createTestDiscountInShopify(merchant.store_url, decryptedToken);
    } else if (action === 'create_campaign') {
      if (!merchant.account_id) {
        return { result: 'skip', error_message: 'No account_id', duration_ms: Date.now() - start };
      }
      createdId = await createTestCampaignInMeta(decryptedToken, merchant.account_id);
    } else {
      return {
        result: 'skip',
        error_message: `Unknown functional action: ${action}`,
        duration_ms: Date.now() - start,
      };
    }

    if (!createdId) {
      return {
        result: 'fail',
        error_message: `No se pudo crear ${action}`,
        duration_ms: Date.now() - start,
      };
    }

    console.log(`[chino/functional] Created ${action}: ${createdId} (merchant ${merchant.client_id})`);

    // ── 2. WAIT ──
    await sleep(5000);

    // ── 3. VERIFY ──
    let exists = false;
    if (action === 'push_test_email') {
      exists = await verifyEmailExistsInKlaviyo(decryptedToken, createdId);
    } else if (action === 'create_discount') {
      exists = await verifyDiscountExistsInShopify(merchant.store_url!, decryptedToken, createdId);
    } else if (action === 'create_campaign') {
      exists = await verifyCampaignExistsInMeta(decryptedToken, createdId);
    }

    if (!exists) {
      return {
        result: 'fail',
        steve_value: `Creado: ${createdId}`,
        real_value: 'No encontrado en API',
        error_message: `${action} se creó en Steve pero no existe en la plataforma real`,
        duration_ms: Date.now() - start,
      };
    }

    return {
      result: 'pass',
      steve_value: `Creado: ${createdId}`,
      real_value: 'Verificado en API',
      duration_ms: Date.now() - start,
    };
  } catch (err: any) {
    return {
      result: 'error',
      error_message: `Error en ${action}: ${err.message}`,
      duration_ms: Date.now() - start,
    };
  } finally {
    // ── 4. CLEANUP (always, even on failure) ──
    if (cleanup && createdId) {
      try {
        if (action === 'push_test_email') {
          await deleteFromKlaviyo(decryptedToken!, createdId);
        } else if (action === 'create_discount' && merchant.store_url) {
          await deleteFromShopify(merchant.store_url, decryptedToken!, createdId);
        } else if (action === 'create_campaign') {
          await deleteFromMeta(decryptedToken!, createdId);
        }
        console.log(`[chino/functional] Cleaned up ${action}: ${createdId}`);
      } catch (cleanupErr: any) {
        // Log but don't fail the check for cleanup errors
        console.error(`[chino/functional] Cleanup failed for ${action} ${createdId}: ${cleanupErr.message}`);
      }
    }
  }
}
