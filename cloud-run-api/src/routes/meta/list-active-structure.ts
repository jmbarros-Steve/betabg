import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getTokenForConnection } from '../../lib/resolve-meta-token.js';
import { convertToCLP } from '../../lib/currency.js';

/**
 * POST /api/meta/list-active-structure
 *
 * Devuelve la estructura activa (campañas + adsets + #ads) de la cuenta Meta
 * de un cliente. Endpoint primario para que Michael W25 lo llame desde una
 * tool agentic en strategy-chat.ts: con esto el cerebro de estrategia ve
 * exactamente qué tiene corriendo el cliente antes de proponer cambios.
 *
 * Auth: JWT (user owner / admin) OR `X-Internal-Key` con service role key.
 *
 * Input: { client_id: string }
 *
 * Output:
 *   {
 *     campaigns: [
 *       {
 *         id: string,
 *         name: string,
 *         objective: string | null,
 *         status: 'ACTIVE' | 'PAUSED' | ...,
 *         daily_budget_clp: number | null,    // ← convertido a CLP
 *         lifetime_budget_clp: number | null, // ← convertido a CLP
 *         adsets: [{ id, name, status, ads_count }]
 *       }
 *     ],
 *     account_currency: string,
 *     account_id: string
 *   }
 *
 * Antipatrones que respeta (ver MEMORY.md):
 *   #1 — NO chequea `access_token_encrypted` antes de getTokenForConnection
 *        (rompe SUAT bm_partner / leadsie).
 *   #2 — Para SUAT NO usa `/me/adaccounts`. Usa `connection.account_id` directo
 *        para evitar cross-contamination multi-merchant.
 */

const META_API_BASE = 'https://graph.facebook.com/v23.0';

interface RequestBody {
  client_id?: string;
}

interface MetaCampaignRaw {
  id: string;
  name: string;
  objective?: string;
  status?: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
}

interface MetaAdSetRaw {
  id: string;
  name: string;
  status?: string;
  effective_status?: string;
}

interface AdSetOut {
  id: string;
  name: string;
  status: string;
  ads_count: number;
}

interface CampaignOut {
  id: string;
  name: string;
  objective: string | null;
  status: string;
  daily_budget_clp: number | null;
  lifetime_budget_clp: number | null;
  adsets: AdSetOut[];
}

/**
 * Currencies that Meta returns in minor units (cents).
 * For CLP/JPY/KRW Meta returns the integer amount directly (no division by 100).
 */
const ZERO_DECIMAL_CURRENCIES = new Set(['CLP', 'JPY', 'KRW', 'VND', 'CLF', 'BIF', 'DJF', 'GNF', 'ISK', 'KMF', 'PYG', 'RWF', 'UGX', 'UYI', 'VUV', 'XAF', 'XOF', 'XPF']);

function metaBudgetToBaseUnit(rawBudget: string | undefined, currency: string): number | null {
  if (!rawBudget) return null;
  const n = Number(rawBudget);
  if (!Number.isFinite(n) || n <= 0) return null;
  const upper = (currency || 'USD').toUpperCase();
  return ZERO_DECIMAL_CURRENCIES.has(upper) ? n : n / 100;
}

async function metaGet<T>(path: string, token: string, params: Record<string, string> = {}): Promise<{ data?: T[]; summary?: any; error?: string }> {
  const url = new URL(`${META_API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    let body: any;
    try {
      body = await res.json();
    } catch {
      return { error: `Non-JSON response (HTTP ${res.status})` };
    }
    if (!res.ok || body?.error) {
      const msg = body?.error?.message || `HTTP ${res.status}`;
      console.error(`[meta-list-structure] Meta API error on ${path}:`, msg);
      return { error: msg };
    }
    return { data: body?.data ?? [], summary: body?.summary };
  } catch (err: any) {
    if (err?.name === 'AbortError') return { error: 'Request timeout' };
    return { error: err?.message || 'Network error' };
  }
}

export async function listActiveStructure(c: Context) {
  try {
    const supabase = getSupabaseAdmin();
    const user = c.get('user');
    const isInternal = c.get('isInternal') === true;

    if (!user && !isInternal) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    let body: RequestBody = {};
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { client_id } = body;
    if (!client_id) {
      return c.json({ error: 'client_id required' }, 400);
    }

    // 1. Fetch the most-recently-updated active Meta connection for this client.
    //    NO filtramos por access_token_encrypted (antipatrón #1) — los SUAT
    //    bm_partner / leadsie no tienen token en DB, lo resuelve env.
    const { data: connection, error: connErr } = await supabase
      .from('platform_connections')
      .select('id, platform, access_token_encrypted, connection_type, client_id, account_id, clients!inner(user_id, client_user_id)')
      .eq('client_id', client_id)
      .eq('platform', 'meta')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (connErr) {
      console.error('[meta-list-structure] DB error fetching connection:', connErr);
      return c.json({ error: 'Database error', details: connErr.message }, 500);
    }
    if (!connection) {
      return c.json({ error: 'No active Meta connection found for this client' }, 404);
    }

    // 2. Authorization (skip si vino por X-Internal-Key)
    if (!isInternal) {
      const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null };
      const { data: roleRow } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['admin', 'super_admin'])
        .limit(1)
        .maybeSingle();
      const isAdmin = !!roleRow;
      const isOwner = clientData.user_id === user.id || clientData.client_user_id === user.id;
      if (!isAdmin && !isOwner) {
        return c.json({ error: 'Forbidden' }, 403);
      }
    }

    // 3. Resolve token (SUAT or decrypted oauth)
    const token = await getTokenForConnection(supabase, connection);
    if (!token) {
      console.error('[meta-list-structure] Failed to resolve token for connection', connection.id);
      return c.json({ error: 'Failed to resolve Meta token' }, 500);
    }

    const accountId = (connection as any).account_id as string | null;
    if (!accountId) {
      return c.json({ error: 'Meta connection has no account_id (run business hierarchy first)' }, 400);
    }

    // 4. Lookup currency (SUAT NO debe llamar /me/adaccounts → antipatrón #2,
    //    así que pegamos GET directo al ad account, que NO devuelve colección
    //    sino el objeto único — por eso no usamos metaGet aquí).
    let currency = 'USD';
    try {
      const accRes = await fetch(`${META_API_BASE}/act_${accountId}?fields=currency`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (accRes.ok) {
        const accBody: any = await accRes.json();
        if (accBody?.currency) currency = accBody.currency;
      } else {
        console.warn(`[meta-list-structure] Could not read account currency, defaulting USD (HTTP ${accRes.status})`);
      }
    } catch (err) {
      console.warn('[meta-list-structure] Currency lookup failed, defaulting USD:', err);
    }

    // 5. List campaigns (ACTIVE/PAUSED — incluimos PAUSED porque Michael
    //    necesita ver la estructura completa, no solo lo que está corriendo).
    const campaignsRes = await metaGet<MetaCampaignRaw>(`/act_${accountId}/campaigns`, token, {
      fields: 'id,name,objective,status,effective_status,daily_budget,lifetime_budget',
      effective_status: JSON.stringify(['ACTIVE', 'PAUSED']),
      limit: '50',
    });
    if (campaignsRes.error) {
      return c.json({ error: 'Failed to list campaigns', details: campaignsRes.error }, 502);
    }
    const campaigns = campaignsRes.data ?? [];

    // 6. For each campaign fetch adsets + count ads.
    //    Procesamos en serie para no saturar Meta API (rate-limit friendly).
    const out: CampaignOut[] = [];
    for (const camp of campaigns) {
      const adsetsRes = await metaGet<MetaAdSetRaw>(`/${camp.id}/adsets`, token, {
        fields: 'id,name,status,effective_status',
        effective_status: JSON.stringify(['ACTIVE', 'PAUSED']),
        limit: '20',
      });

      const adsetsRaw = adsetsRes.data ?? [];
      const adsets: AdSetOut[] = [];

      for (const adset of adsetsRaw) {
        // Conteo barato: pedimos summary=true con limit=0 — Meta devuelve total_count
        // sin transferir los rows.
        let adsCount = 0;
        const adsRes = await metaGet<any>(`/${adset.id}/ads`, token, {
          fields: 'id',
          summary: 'true',
          limit: '0',
        });
        if (!adsRes.error) {
          adsCount = adsRes.summary?.total_count ?? (adsRes.data?.length ?? 0);
        }
        adsets.push({
          id: adset.id,
          name: adset.name,
          status: adset.effective_status || adset.status || 'UNKNOWN',
          ads_count: adsCount,
        });
      }

      // Convert budgets: raw → base unit → CLP
      const dailyBase = metaBudgetToBaseUnit(camp.daily_budget, currency);
      const lifetimeBase = metaBudgetToBaseUnit(camp.lifetime_budget, currency);
      const dailyCLP = dailyBase !== null ? Math.round(await convertToCLP(dailyBase, currency)) : null;
      const lifetimeCLP = lifetimeBase !== null ? Math.round(await convertToCLP(lifetimeBase, currency)) : null;

      out.push({
        id: camp.id,
        name: camp.name,
        objective: camp.objective || null,
        status: camp.effective_status || camp.status || 'UNKNOWN',
        daily_budget_clp: dailyCLP,
        lifetime_budget_clp: lifetimeCLP,
        adsets,
      });
    }

    console.log(`[meta-list-structure] client=${client_id} → ${out.length} campaigns, ${out.reduce((s, c) => s + c.adsets.length, 0)} adsets`);

    return c.json({
      campaigns: out,
      account_currency: currency,
      account_id: accountId,
    });
  } catch (err: any) {
    console.error('[meta-list-structure] Unhandled error:', err);
    return c.json({ error: err?.message || 'Internal server error' }, 500);
  }
}
