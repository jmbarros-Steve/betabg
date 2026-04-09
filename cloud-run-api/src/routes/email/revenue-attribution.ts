import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { convertToCLP } from '../../lib/currency.js';
import { safeQueryOrDefault, safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

const SHOPIFY_API_VERSION = '2025-01';
const ATTRIBUTION_WINDOW_DAYS = 7;

/**
 * Revenue attribution for Steve Mail campaigns.
 * POST /api/email-revenue-attribution
 */
export async function emailRevenueAttribution(c: Context) {
  const supabase = getSupabaseAdmin();

  // Authenticate user
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json();
  const { action, client_id } = body;

  if (!client_id) return c.json({ error: 'client_id is required' }, 400);

  // Verify user owns this client
  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('id, user_id, client_user_id')
    .eq('id', client_id)
    .single();

  if (clientErr || !client) {
    return c.json({ error: 'Client not found' }, 404);
  }

  const isOwner = client.user_id === user.id || client.client_user_id === user.id;

  const roleRow = await safeQuerySingleOrDefault<any>(
    supabase
      .from('user_roles')
      .select('is_super_admin')
      .eq('user_id', user.id)
      .maybeSingle(),
    null,
    'emailRevenueAttribution.getRoleRow',
  );

  if (!isOwner && !roleRow?.is_super_admin) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  switch (action) {
    case 'campaign_revenue': {
      const { campaign_id } = body;
      if (!campaign_id) return c.json({ error: 'campaign_id is required' }, 400);

      // 1. Get campaign details (for sent_at date)
      const { data: campaign, error: campErr } = await supabase
        .from('email_campaigns')
        .select('id, name, sent_at, created_at')
        .eq('id', campaign_id)
        .eq('client_id', client_id)
        .single();

      if (campErr || !campaign) return c.json({ error: 'Campaign not found' }, 404);

      const sentAt = campaign.sent_at || campaign.created_at;
      const sentDate = new Date(sentAt);
      const windowEnd = new Date(sentDate.getTime() + ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000);

      // 2. Get all subscribers who were sent this campaign
      const { data: sentEvents, error: sentErr } = await supabase
        .from('email_events')
        .select('subscriber_id')
        .eq('campaign_id', campaign_id)
        .eq('event_type', 'sent');

      if (sentErr) return c.json({ error: sentErr.message }, 500);

      const subscriberIds = [...new Set((sentEvents || []).map(e => e.subscriber_id).filter(Boolean))];
      const totalSent = subscriberIds.length;

      if (totalSent === 0) {
        return c.json({
          total_revenue: 0,
          total_orders: 0,
          aov: 0,
          conversion_rate: 0,
          conversions_by_day: [],
          top_products: [],
          total_sent: 0,
          attribution_window_days: ATTRIBUTION_WINDOW_DAYS,
        });
      }

      // 3. Get subscriber emails
      const { data: subscribers, error: subErr } = await supabase
        .from('email_subscribers')
        .select('id, email')
        .in('id', subscriberIds);

      if (subErr) return c.json({ error: subErr.message }, 500);

      const subscriberEmails = (subscribers || []).map(s => s.email?.toLowerCase()).filter(Boolean) as string[];
      const emailSet = new Set(subscriberEmails);

      // 4. Get Shopify connection for this client
      const shopifyConn = await safeQuerySingleOrDefault<any>(
        supabase
          .from('platform_connections')
          .select('id, store_url, access_token_encrypted')
          .eq('client_id', client_id)
          .eq('platform', 'shopify')
          .maybeSingle(),
        null,
        'emailRevenueAttribution.getShopifyConnCampaign',
      );

      if (!shopifyConn?.store_url || !shopifyConn?.access_token_encrypted) {
        return c.json({ error: 'No Shopify connection found for this client' }, 404);
      }

      // Decrypt token
      const { data: decryptedToken, error: decryptError } = await supabase
        .rpc('decrypt_platform_token', { encrypted_token: shopifyConn.access_token_encrypted });

      if (decryptError || !decryptedToken) {
        return c.json({ error: 'Token decryption failed' }, 500);
      }

      const cleanStoreUrl = shopifyConn.store_url.replace(/^https?:\/\//, '');
      const shopifyHeaders: Record<string, string> = {
        'X-Shopify-Access-Token': decryptedToken,
        'Content-Type': 'application/json',
      };

      // 5. Fetch orders from Shopify within the attribution window
      const ordersUrl = `https://${cleanStoreUrl}/admin/api/${SHOPIFY_API_VERSION}/orders.json?status=any&created_at_min=${sentDate.toISOString()}&created_at_max=${windowEnd.toISOString()}&limit=250&fields=id,email,total_price,created_at,line_items,currency,financial_status,landing_site,note_attributes,customer`;

      const allOrders: any[] = [];
      let nextUrl: string | null = ordersUrl;

      while (nextUrl) {
        const res = await fetch(nextUrl, { headers: shopifyHeaders });
        if (!res.ok) {
          console.warn(`[revenue-attribution] Shopify fetch failed: ${res.status}`);
          break;
        }
        const json: any = await res.json();
        allOrders.push(...(json.orders || []));

        const linkHeader = res.headers.get('Link') || '';
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        nextUrl = nextMatch ? nextMatch[1] : null;
      }

      // 6. Filter orders attributed to this campaign
      const attributedOrders: any[] = [];

      for (const order of allOrders) {
        const fs = order.financial_status || '';
        if (fs === 'refunded' || fs === 'voided' || fs === 'cancelled') continue;

        const orderEmail = (order.email || order.customer?.email || '').toLowerCase();

        // Attribution method 1: Email match
        const emailMatch = emailSet.has(orderEmail);

        // Attribution method 2: UTM campaign match via landing_site
        const landingSite = order.landing_site || '';
        const utmMatch = landingSite.includes(`utm_campaign=${campaign_id}`) ||
          landingSite.includes(`utm_source=stevemail`);

        // Attribution method 3: note_attributes
        const noteAttrs = order.note_attributes || [];
        const noteMatch = noteAttrs.some((attr: any) =>
          (attr.name === 'utm_campaign' && attr.value === campaign_id) ||
          (attr.name === 'utm_source' && attr.value === 'stevemail')
        );

        if (emailMatch || utmMatch || noteMatch) {
          attributedOrders.push(order);
        }
      }

      // 7. Calculate metrics
      let totalRevenue = 0;
      const dailyMap = new Map<string, { revenue: number; orders: number }>();
      const productMap = new Map<string, { title: string; quantity: number; revenue: number }>();

      for (const order of attributedOrders) {
        const rawRevenue = parseFloat(order.total_price || '0');
        const orderCurrency = order.currency || 'CLP';
        const orderRevenue = await convertToCLP(rawRevenue, orderCurrency);
        totalRevenue += orderRevenue;

        // Daily breakdown
        const dateKey = (order.created_at || '').split('T')[0];
        if (dateKey) {
          const day = dailyMap.get(dateKey) || { revenue: 0, orders: 0 };
          day.revenue += orderRevenue;
          day.orders += 1;
          dailyMap.set(dateKey, day);
        }

        // Product breakdown
        for (const item of (order.line_items || [])) {
          const productKey = item.title || item.name || 'Sin nombre';
          const existing = productMap.get(productKey) || { title: productKey, quantity: 0, revenue: 0 };
          existing.quantity += item.quantity || 0;
          existing.revenue += await convertToCLP(
            parseFloat(item.price || '0') * (item.quantity || 0),
            orderCurrency
          );
          productMap.set(productKey, existing);
        }
      }

      const totalOrders = attributedOrders.length;
      const aov = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
      const conversionRate = totalSent > 0
        ? parseFloat(((totalOrders / totalSent) * 100).toFixed(2))
        : 0;

      // Sort daily by date
      const conversionsByDay = Array.from(dailyMap.entries())
        .map(([date, data]) => ({ date, revenue: Math.round(data.revenue), orders: data.orders }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Top products sorted by revenue
      const topProducts = Array.from(productMap.values())
        .map(p => ({ ...p, revenue: Math.round(p.revenue) }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      return c.json({
        total_revenue: Math.round(totalRevenue),
        total_orders: totalOrders,
        aov,
        conversion_rate: conversionRate,
        conversions_by_day: conversionsByDay,
        top_products: topProducts,
        total_sent: totalSent,
        attribution_window_days: ATTRIBUTION_WINDOW_DAYS,
      });
    }

    case 'revenue_summary': {
      const { start_date, end_date } = body;

      // Get all campaigns for this client in the date range
      let campaignQuery = supabase
        .from('email_campaigns')
        .select('id, name, sent_at, created_at, status')
        .eq('client_id', client_id)
        .in('status', ['sent', 'completed']);

      if (start_date) campaignQuery = campaignQuery.gte('sent_at', start_date);
      if (end_date) campaignQuery = campaignQuery.lte('sent_at', end_date);

      const { data: campaigns, error: campErr } = await campaignQuery.order('sent_at', { ascending: false });

      if (campErr) return c.json({ error: campErr.message }, 500);

      if (!campaigns || campaigns.length === 0) {
        return c.json({
          campaigns: [],
          total_revenue: 0,
          total_orders: 0,
          total_sent: 0,
          overall_conversion_rate: 0,
        });
      }

      // Get Shopify connection
      const shopifyConn = await safeQuerySingleOrDefault<any>(
        supabase
          .from('platform_connections')
          .select('id, store_url, access_token_encrypted')
          .eq('client_id', client_id)
          .eq('platform', 'shopify')
          .maybeSingle(),
        null,
        'emailRevenueAttribution.getShopifyConnSummary',
      );

      if (!shopifyConn?.store_url || !shopifyConn?.access_token_encrypted) {
        return c.json({ error: 'No Shopify connection found' }, 404);
      }

      const { data: decryptedToken, error: decryptError } = await supabase
        .rpc('decrypt_platform_token', { encrypted_token: shopifyConn.access_token_encrypted });

      if (decryptError || !decryptedToken) {
        return c.json({ error: 'Token decryption failed' }, 500);
      }

      const cleanStoreUrl = shopifyConn.store_url.replace(/^https?:\/\//, '');
      const shopifyHeaders: Record<string, string> = {
        'X-Shopify-Access-Token': decryptedToken,
        'Content-Type': 'application/json',
      };

      // Determine the full date range for Shopify query
      const earliestSent = campaigns[campaigns.length - 1].sent_at || campaigns[campaigns.length - 1].created_at;
      const latestSent = campaigns[0].sent_at || campaigns[0].created_at;
      const rangeStart = new Date(earliestSent);
      const rangeEnd = new Date(new Date(latestSent).getTime() + ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000);

      // Fetch all orders in the range
      const ordersUrl = `https://${cleanStoreUrl}/admin/api/${SHOPIFY_API_VERSION}/orders.json?status=any&created_at_min=${rangeStart.toISOString()}&created_at_max=${rangeEnd.toISOString()}&limit=250&fields=id,email,total_price,created_at,currency,financial_status,landing_site,note_attributes,customer`;

      const allOrders: any[] = [];
      let nextUrl: string | null = ordersUrl;

      while (nextUrl) {
        const res = await fetch(nextUrl, { headers: shopifyHeaders });
        if (!res.ok) break;
        const json: any = await res.json();
        allOrders.push(...(json.orders || []));

        const linkHeader = res.headers.get('Link') || '';
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        nextUrl = nextMatch ? nextMatch[1] : null;
      }

      // For each campaign, compute attribution
      let grandTotalRevenue = 0;
      let grandTotalOrders = 0;
      let grandTotalSent = 0;

      const campaignResults: any[] = [];

      for (const campaign of campaigns) {
        const sentAt = campaign.sent_at || campaign.created_at;
        const sentDate = new Date(sentAt);
        const windowEnd = new Date(sentDate.getTime() + ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000);

        // Get subscribers sent this campaign
        const sentEvents = await safeQueryOrDefault<any>(
          supabase
            .from('email_events')
            .select('subscriber_id')
            .eq('campaign_id', campaign.id)
            .eq('event_type', 'sent'),
          [],
          'emailRevenueAttribution.getSentEventsSummary',
        );

        const subIds = [...new Set((sentEvents || []).map(e => e.subscriber_id).filter(Boolean))];
        const totalSent = subIds.length;
        grandTotalSent += totalSent;

        if (totalSent === 0) {
          campaignResults.push({
            campaign_id: campaign.id,
            campaign_name: campaign.name,
            sent_at: sentAt,
            total_sent: 0,
            total_revenue: 0,
            total_orders: 0,
            conversion_rate: 0,
          });
          continue;
        }

        // Get subscriber emails
        const subs = await safeQueryOrDefault<any>(
          supabase
            .from('email_subscribers')
            .select('id, email')
            .in('id', subIds),
          [],
          'emailRevenueAttribution.getSubscribersSummary',
        );

        const emailSet = new Set((subs || []).map(s => s.email?.toLowerCase()).filter(Boolean));

        // Filter orders for this campaign's window
        let campaignRevenue = 0;
        let campaignOrders = 0;

        for (const order of allOrders) {
          const orderDate = new Date(order.created_at);
          if (orderDate < sentDate || orderDate > windowEnd) continue;

          const fs = order.financial_status || '';
          if (fs === 'refunded' || fs === 'voided' || fs === 'cancelled') continue;

          const orderEmail = (order.email || order.customer?.email || '').toLowerCase();
          const landingSite = order.landing_site || '';
          const noteAttrs = order.note_attributes || [];

          const emailMatch = emailSet.has(orderEmail);
          const utmMatch = landingSite.includes(`utm_campaign=${campaign.id}`);
          const noteMatch = noteAttrs.some((attr: any) =>
            attr.name === 'utm_campaign' && attr.value === campaign.id
          );

          if (emailMatch || utmMatch || noteMatch) {
            const rawRevenue = parseFloat(order.total_price || '0');
            const orderCurrency = order.currency || 'CLP';
            const orderRevenue = await convertToCLP(rawRevenue, orderCurrency);
            campaignRevenue += orderRevenue;
            campaignOrders++;
          }
        }

        grandTotalRevenue += campaignRevenue;
        grandTotalOrders += campaignOrders;

        campaignResults.push({
          campaign_id: campaign.id,
          campaign_name: campaign.name,
          sent_at: sentAt,
          total_sent: totalSent,
          total_revenue: Math.round(campaignRevenue),
          total_orders: campaignOrders,
          conversion_rate: totalSent > 0 ? parseFloat(((campaignOrders / totalSent) * 100).toFixed(2)) : 0,
        });
      }

      return c.json({
        campaigns: campaignResults,
        total_revenue: Math.round(grandTotalRevenue),
        total_orders: grandTotalOrders,
        total_sent: grandTotalSent,
        overall_conversion_rate: grandTotalSent > 0
          ? parseFloat(((grandTotalOrders / grandTotalSent) * 100).toFixed(2))
          : 0,
      });
    }

    default:
      return c.json({ error: `Unknown action: ${action}` }, 400);
  }
}
