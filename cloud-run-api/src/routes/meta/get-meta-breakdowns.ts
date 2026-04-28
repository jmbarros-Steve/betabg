import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getTokenForConnection } from '../../lib/resolve-meta-token.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import { metaApiFetch } from '../../lib/meta-fetch.js';
import { convertToCLP } from '../../lib/currency.js';

/**
 * On-demand breakdowns endpoint for the Análisis tab.
 *
 * Llama Meta `/insights` con `breakdowns` específicos a nivel de cuenta para
 * que el dashboard pueda mostrar performance segmentado por edad, género,
 * país, dispositivo, placement, etc. NO persiste — el dashboard cachea en
 * memoria y vuelve a llamar al cambiar el rango de fecha. Esto evita una
 * tabla nueva + cron solo para datos que el cliente consulta esporádicamente.
 *
 * Breakdowns válidos en Meta Marketing API v23:
 *   - age, gender (combinable con coma → "age,gender")
 *   - country, region
 *   - device_platform (mobile / desktop / connected_tv)
 *   - publisher_platform (facebook / instagram / messenger / audience_network)
 *   - platform_position (feed / stories / reels / etc.)
 *   - hourly_stats_aggregated_by_advertiser_time_zone
 */

const VALID_BREAKDOWNS = new Set([
  'age',
  'gender',
  'age,gender',
  'country',
  'region',
  'device_platform',
  'publisher_platform',
  'platform_position',
  'hourly_stats_aggregated_by_advertiser_time_zone',
]);

interface MetaBreakdownRow {
  date_start: string;
  date_stop: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
  age?: string;
  gender?: string;
  country?: string;
  region?: string;
  device_platform?: string;
  publisher_platform?: string;
  platform_position?: string;
  hourly_stats_aggregated_by_advertiser_time_zone?: string;
}

export async function getMetaBreakdowns(c: Context) {
  try {
    const supabase = getSupabaseAdmin();

    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const body = await c.req.json();
    const { connection_id, breakdown, date_from, date_to } = body as {
      connection_id: string;
      breakdown: string;
      date_from: string;
      date_to: string;
    };

    if (!connection_id || !breakdown || !date_from || !date_to) {
      return c.json(
        { error: 'Missing required: connection_id, breakdown, date_from, date_to' },
        400,
      );
    }

    if (!VALID_BREAKDOWNS.has(breakdown)) {
      return c.json(
        { error: `Invalid breakdown. Valid: ${Array.from(VALID_BREAKDOWNS).join(', ')}` },
        400,
      );
    }

    // Fetch connection + verify ownership (mismo patrón que otros endpoints Meta)
    const { data: connection } = await supabase
      .from('platform_connections')
      .select(
        `id, platform, account_id, access_token_encrypted, connection_type, client_id,
         clients!inner(user_id, client_user_id)`,
      )
      .eq('id', connection_id)
      .eq('platform', 'meta')
      .maybeSingle();

    if (!connection) return c.json({ error: 'Connection not found' }, 404);
    const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null };
    const isOwner = clientData.user_id === user.id || clientData.client_user_id === user.id;
    if (!isOwner) {
      const adminRole = await safeQuerySingleOrDefault<any>(
        supabase
          .from('user_roles').select('role').eq('user_id', user.id)
          .in('role', ['admin', 'super_admin']).limit(1).maybeSingle(),
        null,
        'getMetaBreakdowns.adminRole',
      );
      if (!adminRole) return c.json({ error: 'Unauthorized' }, 403);
    }

    if (!connection.account_id) {
      return c.json({ error: 'Missing Meta account ID on connection' }, 400);
    }

    const decryptedToken = await getTokenForConnection(supabase, connection);
    if (!decryptedToken) return c.json({ error: 'Failed to resolve token' }, 500);

    const accountId = connection.account_id.replace(/^act_/, '');

    // Detect account currency for CLP conversion
    let accountCurrency = 'CLP';
    try {
      const acctResp = await metaApiFetch(
        `https://graph.facebook.com/v23.0/act_${accountId}?fields=currency`,
        decryptedToken,
      );
      if (acctResp.ok) {
        const acctJson = (await acctResp.json()) as { currency?: string };
        accountCurrency = acctJson.currency || 'CLP';
      }
    } catch {
      // ignore — default CLP
    }

    // Fetch insights with breakdowns
    const fields = 'spend,impressions,reach,clicks,actions,action_values';
    const insightsUrl = new URL(`https://graph.facebook.com/v23.0/act_${accountId}/insights`);
    insightsUrl.searchParams.set('fields', fields);
    insightsUrl.searchParams.set('breakdowns', breakdown);
    insightsUrl.searchParams.set('time_range', JSON.stringify({ since: date_from, until: date_to }));
    insightsUrl.searchParams.set('level', 'account');
    insightsUrl.searchParams.set('limit', '500');

    const allRows: MetaBreakdownRow[] = [];
    let nextUrl: string | null = insightsUrl.toString();
    let pageCount = 0;
    while (nextUrl && pageCount < 10) {
      const resp = await metaApiFetch(nextUrl, decryptedToken);
      if (!resp.ok) {
        let errBody: any;
        try { errBody = await resp.json(); } catch { errBody = {}; }
        console.error('[get-meta-breakdowns] Meta error:', errBody);
        return c.json(
          { error: 'Meta API error', details: errBody?.error?.message || `HTTP ${resp.status}` },
          502,
        );
      }
      const json = (await resp.json()) as { data?: MetaBreakdownRow[]; paging?: { next?: string } };
      if (Array.isArray(json.data)) allRows.push(...json.data);
      if (json.paging?.next) {
        const cursor = new URL(json.paging.next);
        cursor.searchParams.delete('access_token');
        nextUrl = cursor.toString();
      } else {
        nextUrl = null;
      }
      pageCount++;
    }

    // Agregar por valor de breakdown (ej. age=18-24, age=25-34, ...)
    type Aggregated = {
      label: string;
      impressions: number;
      reach: number;
      clicks: number;
      spend: number;
      conversions: number;
      conversion_value: number;
    };
    const map = new Map<string, Aggregated>();

    for (const row of allRows) {
      // Construir label combinando los breakdown fields disponibles
      const labelParts: string[] = [];
      if (row.age) labelParts.push(row.age);
      if (row.gender) labelParts.push(row.gender);
      if (row.country) labelParts.push(row.country);
      if (row.region) labelParts.push(row.region);
      if (row.device_platform) labelParts.push(row.device_platform);
      if (row.publisher_platform) labelParts.push(row.publisher_platform);
      if (row.platform_position) labelParts.push(row.platform_position);
      if (row.hourly_stats_aggregated_by_advertiser_time_zone) {
        labelParts.push(row.hourly_stats_aggregated_by_advertiser_time_zone);
      }
      const label = labelParts.join(' · ') || '(sin valor)';

      const impressions = parseFloat(row.impressions || '0');
      const reach = parseFloat(row.reach || '0');
      const clicks = parseFloat(row.clicks || '0');
      const spendOriginal = parseFloat(row.spend || '0');
      const spendCLP = await convertToCLP(spendOriginal, accountCurrency);

      const purchases = row.actions?.find(
        (a) => a.action_type === 'purchase' || a.action_type === 'omni_purchase',
      );
      const conversions = parseFloat(purchases?.value || '0');

      const purchaseValue = row.action_values?.find(
        (a) => a.action_type === 'purchase' || a.action_type === 'omni_purchase',
      );
      const valueOriginal = parseFloat(purchaseValue?.value || '0');
      const conversionValueCLP = valueOriginal > 0 ? await convertToCLP(valueOriginal, accountCurrency) : 0;

      const existing = map.get(label) || {
        label,
        impressions: 0,
        reach: 0,
        clicks: 0,
        spend: 0,
        conversions: 0,
        conversion_value: 0,
      };
      existing.impressions += impressions;
      existing.reach += reach;
      existing.clicks += clicks;
      existing.spend += Math.round(spendCLP);
      existing.conversions += conversions;
      existing.conversion_value += Math.round(conversionValueCLP);
      map.set(label, existing);
    }

    const breakdowns = Array.from(map.values()).sort((a, b) => b.spend - a.spend);

    return c.json({
      success: true,
      breakdown,
      date_from,
      date_to,
      currency: 'CLP',
      original_currency: accountCurrency,
      rows: breakdowns,
    });
  } catch (err: any) {
    console.error('[get-meta-breakdowns] Unhandled error:', err);
    return c.json(
      { error: 'Internal error', details: err?.message || 'Unknown' },
      500,
    );
  }
}
