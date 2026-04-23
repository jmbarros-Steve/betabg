/**
 * Meta Asset Assignment — attach Steve's System User to client assets after
 * a Leadsie/Admatic handshake has granted the Steve BM "full control" of
 * those assets.
 *
 * Background: Meta's BM partnership gives the whole BM (Steve) access to the
 * shared assets, but System Users (the API token holders) do NOT inherit
 * those permissions automatically. Each asset must be explicitly assigned to
 * the SU or API calls fail with "(#200) Ad account owner has NOT grant
 * ads_management permission" — this was the exact bug JM hit with GoodGres.
 *
 * Required env vars:
 *   META_SYSTEM_TOKEN   — SUAT of Steve BM's System User (already set).
 *   META_SYSTEM_USER_ID — numeric ID of that same SU. Obtain via:
 *                        GET /me?access_token=$META_SYSTEM_TOKEN
 */

const META_API_BASE = 'https://graph.facebook.com/v23.0';

// Task permissions per asset type. Pulled from Meta's asset-assignment docs.
// We request the full set so the SU can do anything JM can do manually.
// https://developers.facebook.com/docs/marketing-api/business-asset-management
const TASKS_BY_ASSET: Record<string, string[]> = {
  ad_account: ['MANAGE', 'ADVERTISE', 'ANALYZE', 'DRAFT'],
  page:       ['MANAGE', 'CREATE_CONTENT', 'MODERATE', 'ADVERTISE', 'ANALYZE', 'MESSAGING'],
  pixel:      ['EDIT', 'ANALYZE'],
  catalog:    ['MANAGE_AR', 'MANAGE', 'ADVERTISE', 'AA_ANALYZE'],
  ig:         ['MANAGE', 'CREATE_CONTENT', 'MODERATE', 'ADVERTISE', 'ANALYZE'],
};

export interface AssetAssignInput {
  ad_account_id?: string | null;
  page_id?: string | null;
  pixel_id?: string | null;
  ig_account_id?: string | null;
  catalog_id?: string | null;
}

export interface AssetAssignResult {
  assigned: string[];
  skipped: string[];
  failed: Array<{ asset: string; id: string; error: string }>;
}

/**
 * Fetch with a short timeout + tolerant JSON parse. Keeps individual asset
 * failures from taking down the whole assignment — the webhook handler
 * should still persist what succeeded.
 */
async function postAssignment(
  url: string,
  suId: string,
  tasks: string[],
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const body = new URLSearchParams({
      user: suId,
      tasks: JSON.stringify(tasks),
      access_token: token,
    });
    const res = await fetch(url, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(12_000),
    });
    const data: any = await res.json().catch(() => ({}));
    if (res.ok && data?.success === true) return { ok: true };
    const msg = data?.error?.message || `HTTP ${res.status}`;
    return { ok: false, error: msg };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'network error' };
  }
}

export async function assignAssetsToSystemUser(
  assets: AssetAssignInput,
): Promise<AssetAssignResult> {
  const token = process.env.META_SYSTEM_TOKEN;
  const suId = process.env.META_SYSTEM_USER_ID;
  const result: AssetAssignResult = { assigned: [], skipped: [], failed: [] };

  if (!token || !suId) {
    console.error('[meta-asset-assign] META_SYSTEM_TOKEN or META_SYSTEM_USER_ID missing');
    return result;
  }

  // Normalize IDs (strip act_ prefix if present; Meta wants raw numeric)
  const norm = (v?: string | null): string | null => {
    if (!v) return null;
    return String(v).replace(/^act_/, '');
  };

  const ops: Array<{ type: string; id: string; url: string }> = [];
  const adAccount = norm(assets.ad_account_id);
  if (adAccount) ops.push({ type: 'ad_account', id: adAccount, url: `${META_API_BASE}/act_${adAccount}/assigned_users` });
  const page = norm(assets.page_id);
  if (page) ops.push({ type: 'page', id: page, url: `${META_API_BASE}/${page}/assigned_users` });
  const pixel = norm(assets.pixel_id);
  if (pixel) ops.push({ type: 'pixel', id: pixel, url: `${META_API_BASE}/${pixel}/assigned_users` });
  const catalog = norm(assets.catalog_id);
  if (catalog) ops.push({ type: 'catalog', id: catalog, url: `${META_API_BASE}/${catalog}/assigned_users` });
  const ig = norm(assets.ig_account_id);
  if (ig) ops.push({ type: 'ig', id: ig, url: `${META_API_BASE}/${ig}/assigned_users` });

  if (ops.length === 0) {
    console.warn('[meta-asset-assign] called with no assets');
    return result;
  }

  // Run in parallel — assignments are independent, 5 max is safe for rate limits.
  const settled = await Promise.allSettled(
    ops.map((op) => postAssignment(op.url, suId, TASKS_BY_ASSET[op.type] || ['MANAGE'], token)),
  );

  settled.forEach((s, i) => {
    const op = ops[i];
    if (s.status === 'fulfilled' && s.value.ok) {
      result.assigned.push(`${op.type}:${op.id}`);
    } else {
      const err = s.status === 'fulfilled' ? s.value.error || 'unknown' : String(s.reason);
      // Some asset types (Instagram, Pixel) are often already inherited from
      // the Page or Ad Account that's assigned. Log but don't treat as fatal.
      const isInheritable = op.type === 'ig' || op.type === 'pixel';
      if (isInheritable && /does not exist|not support|OAuthException/i.test(err)) {
        result.skipped.push(`${op.type}:${op.id} (${err.slice(0, 60)})`);
      } else {
        result.failed.push({ asset: op.type, id: op.id, error: err.slice(0, 200) });
      }
    }
  });

  console.log('[meta-asset-assign] result:', JSON.stringify(result));
  return result;
}
