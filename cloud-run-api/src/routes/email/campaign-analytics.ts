import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { validateShopifySessionToken } from '../../lib/shopify-session.js';

/**
 * Campaign analytics: aggregate email events per campaign.
 * POST /api/email-campaign-analytics
 */
export async function emailCampaignAnalytics(c: Context) {
  const supabase = getSupabaseAdmin();

  // Authenticate user
  const shopifySessionToken = c.req.header('X-Shopify-Session-Token');
  const authHeader = c.req.header('Authorization');
  let userId: string | null = null;

  if (shopifySessionToken) {
    const validation = await validateShopifySessionToken(shopifySessionToken, supabase);
    if (!validation.valid || !validation.userId) {
      return c.json({ error: validation.error || 'Invalid token' }, 401);
    }
    userId = validation.userId;
  } else if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    userId = user.id;
  } else {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json();
  const { action, client_id } = body;

  if (!client_id) return c.json({ error: 'client_id is required' }, 400);

  // Verify user owns this client (admin via user_id OR client via client_user_id)
  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('id, user_id, client_user_id')
    .eq('id', client_id)
    .single();

  if (clientErr || !client) {
    return c.json({ error: 'Client not found' }, 404);
  }

  const isOwner = client.user_id === userId || client.client_user_id === userId;

  // Also check super admin
  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('is_super_admin')
    .eq('user_id', userId!)
    .maybeSingle();

  if (!isOwner && !roleRow?.is_super_admin) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  switch (action) {
    case 'campaign-stats': {
      // Get detailed stats for a specific campaign
      const { campaign_id } = body;
      if (!campaign_id) return c.json({ error: 'campaign_id is required' }, 400);

      // Get campaign details
      const { data: campaign, error: campErr } = await supabase
        .from('email_campaigns')
        .select('*')
        .eq('id', campaign_id)
        .eq('client_id', client_id)
        .single();

      if (campErr || !campaign) return c.json({ error: 'Campaign not found' }, 404);

      // Count events by type
      const eventTypes = ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed', 'converted'];
      const counts: Record<string, number> = {};

      for (const eventType of eventTypes) {
        const { count } = await supabase
          .from('email_events')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaign_id)
          .eq('event_type', eventType);
        counts[eventType] = count || 0;
      }

      // Count unique opens and clicks (by subscriber)
      const { data: uniqueOpens } = await supabase
        .from('email_events')
        .select('subscriber_id')
        .eq('campaign_id', campaign_id)
        .eq('event_type', 'opened');

      const { data: uniqueClicks } = await supabase
        .from('email_events')
        .select('subscriber_id')
        .eq('campaign_id', campaign_id)
        .eq('event_type', 'clicked');

      const uniqueOpenCount = new Set((uniqueOpens || []).map(e => e.subscriber_id)).size;
      const uniqueClickCount = new Set((uniqueClicks || []).map(e => e.subscriber_id)).size;

      const sent = counts.sent || 0;
      const stats = {
        ...counts,
        unique_opens: uniqueOpenCount,
        unique_clicks: uniqueClickCount,
        open_rate: sent > 0 ? ((uniqueOpenCount / sent) * 100).toFixed(1) : '0.0',
        click_rate: sent > 0 ? ((uniqueClickCount / sent) * 100).toFixed(1) : '0.0',
        bounce_rate: sent > 0 ? (((counts.bounced || 0) / sent) * 100).toFixed(1) : '0.0',
        unsubscribe_rate: sent > 0 ? (((counts.unsubscribed || 0) / sent) * 100).toFixed(1) : '0.0',
        click_to_open_rate: uniqueOpenCount > 0 ? ((uniqueClickCount / uniqueOpenCount) * 100).toFixed(1) : '0.0',
      };

      // Get top clicked links
      const { data: clickEvents } = await supabase
        .from('email_events')
        .select('metadata')
        .eq('campaign_id', campaign_id)
        .eq('event_type', 'clicked');

      const linkCounts: Record<string, number> = {};
      for (const event of clickEvents || []) {
        const url = event.metadata?.url;
        if (url) linkCounts[url] = (linkCounts[url] || 0) + 1;
      }
      const topLinks = Object.entries(linkCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([url, clicks]) => ({ url, clicks }));

      // Revenue from conversions
      const { data: conversions } = await supabase
        .from('email_events')
        .select('metadata')
        .eq('campaign_id', campaign_id)
        .eq('event_type', 'converted');

      const totalRevenue = (conversions || []).reduce(
        (sum, e) => sum + (parseFloat(e.metadata?.revenue) || 0), 0
      );

      return c.json({
        campaign,
        stats,
        top_links: topLinks,
        total_revenue: totalRevenue,
        total_conversions: conversions?.length || 0,
      });
    }

    case 'overview': {
      // Get summary stats for all campaigns (dashboard view)
      const { days = 30 } = body;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      // Get recent campaigns
      const { data: campaigns } = await supabase
        .from('email_campaigns')
        .select('id, name, status, sent_count, total_recipients, sent_at, created_at')
        .eq('client_id', client_id)
        .gte('created_at', since)
        .order('created_at', { ascending: false });

      // Get aggregate event counts for the period
      const { count: totalSent } = await supabase
        .from('email_events')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', client_id)
        .eq('event_type', 'sent')
        .gte('created_at', since);

      const { count: totalOpened } = await supabase
        .from('email_events')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', client_id)
        .eq('event_type', 'opened')
        .gte('created_at', since);

      const { count: totalClicked } = await supabase
        .from('email_events')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', client_id)
        .eq('event_type', 'clicked')
        .gte('created_at', since);

      const { count: totalBounced } = await supabase
        .from('email_events')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', client_id)
        .eq('event_type', 'bounced')
        .gte('created_at', since);

      const { count: totalUnsubscribed } = await supabase
        .from('email_events')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', client_id)
        .eq('event_type', 'unsubscribed')
        .gte('created_at', since);

      // Subscriber growth
      const { count: subscriberCount } = await supabase
        .from('email_subscribers')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', client_id)
        .eq('status', 'subscribed');

      const { count: newSubscribers } = await supabase
        .from('email_subscribers')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', client_id)
        .gte('subscribed_at', since);

      const sent = totalSent || 0;

      return c.json({
        campaigns: campaigns || [],
        period_days: days,
        aggregate: {
          total_sent: sent,
          total_opened: totalOpened || 0,
          total_clicked: totalClicked || 0,
          total_bounced: totalBounced || 0,
          total_unsubscribed: totalUnsubscribed || 0,
          open_rate: sent > 0 ? (((totalOpened || 0) / sent) * 100).toFixed(1) : '0.0',
          click_rate: sent > 0 ? (((totalClicked || 0) / sent) * 100).toFixed(1) : '0.0',
          bounce_rate: sent > 0 ? (((totalBounced || 0) / sent) * 100).toFixed(1) : '0.0',
        },
        subscribers: {
          total: subscriberCount || 0,
          new_in_period: newSubscribers || 0,
        },
      });
    }

    case 'timeline': {
      // Get events over time for charts
      const { campaign_id, days = 7 } = body;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      let query = supabase
        .from('email_events')
        .select('event_type, created_at')
        .eq('client_id', client_id)
        .gte('created_at', since)
        .order('created_at', { ascending: true });

      if (campaign_id) query = query.eq('campaign_id', campaign_id);

      const { data: events } = await query;

      // Group by day and event type
      const timeline: Record<string, Record<string, number>> = {};
      for (const event of events || []) {
        const day = event.created_at.substring(0, 10); // YYYY-MM-DD
        if (!timeline[day]) timeline[day] = {};
        timeline[day][event.event_type] = (timeline[day][event.event_type] || 0) + 1;
      }

      const result = Object.entries(timeline).map(([date, counts]) => ({
        date,
        ...counts,
      }));

      return c.json({ timeline: result });
    }

    default:
      return c.json({ error: `Unknown action: ${action}` }, 400);
  }
}
