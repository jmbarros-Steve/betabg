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

    case 'click_heatmap': {
      const { campaign_id } = body;
      if (!campaign_id) return c.json({ error: 'campaign_id is required' }, 400);

      // Get all click events for this campaign
      const { data: clickEvents, error: clickErr } = await supabase
        .from('email_events')
        .select('subscriber_id, metadata')
        .eq('campaign_id', campaign_id)
        .eq('client_id', client_id)
        .eq('event_type', 'clicked');

      if (clickErr) return c.json({ error: clickErr.message }, 500);

      // Aggregate clicks per URL
      const urlClicks: Record<string, { clicks: number; subscribers: Set<string>; link_text: string }> = {};
      let totalClicks = 0;

      for (const event of clickEvents || []) {
        const url = event.metadata?.url;
        if (!url) continue;
        totalClicks++;
        if (!urlClicks[url]) {
          urlClicks[url] = { clicks: 0, subscribers: new Set(), link_text: event.metadata?.link_text || '' };
        }
        urlClicks[url].clicks++;
        if (event.subscriber_id) urlClicks[url].subscribers.add(event.subscriber_id);
      }

      const heatmap = Object.entries(urlClicks)
        .map(([url, data]) => ({
          url,
          link_text: data.link_text,
          clicks: data.clicks,
          unique_clicks: data.subscribers.size,
          percentage: totalClicks > 0 ? parseFloat(((data.clicks / totalClicks) * 100).toFixed(1)) : 0,
        }))
        .sort((a, b) => b.clicks - a.clicks);

      return c.json({ heatmap, total_clicks: totalClicks });
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

    case 'deliverability_dashboard': {
      const days = 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      // Aggregate event counts for last 30 days
      const eventTypes = ['sent', 'bounced', 'complained', 'opened'] as const;
      const counts: Record<string, number> = {};

      for (const eventType of eventTypes) {
        const { count } = await supabase
          .from('email_events')
          .select('*', { count: 'exact', head: true })
          .eq('client_id', client_id)
          .eq('event_type', eventType)
          .gte('created_at', since);
        counts[eventType] = count || 0;
      }

      const totalSent = counts.sent || 0;
      const totalBounced = counts.bounced || 0;
      const totalComplained = counts.complained || 0;
      const totalOpened = counts.opened || 0;
      const totalDelivered = totalSent - totalBounced;

      const deliveryRate = totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0;
      const bounceRate = totalSent > 0 ? (totalBounced / totalSent) * 100 : 0;
      const complaintRate = totalSent > 0 ? (totalComplained / totalSent) * 100 : 0;
      const openRate = totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0;

      // Inbox placement estimate based on open rate
      let inboxPlacement: 'likely_inbox' | 'mixed' | 'likely_spam';
      if (openRate > 20) inboxPlacement = 'likely_inbox';
      else if (openRate >= 10) inboxPlacement = 'mixed';
      else inboxPlacement = 'likely_spam';

      // Spam score based on complaint rate
      let spamScore: 'good' | 'warning' | 'critical';
      if (complaintRate < 0.1) spamScore = 'good';
      else if (complaintRate <= 0.3) spamScore = 'warning';
      else spamScore = 'critical';

      // Domain health
      const { data: domains } = await supabase
        .from('email_domains')
        .select('domain, verified, spf_verified, dkim_verified, dmarc_verified, created_at')
        .eq('client_id', client_id);

      const domainHealth = (domains || []).map((d: any) => ({
        domain: d.domain,
        verified: d.verified,
        spf: d.spf_verified ?? false,
        dkim: d.dkim_verified ?? false,
        dmarc: d.dmarc_verified ?? false,
      }));

      // Bounce breakdown (hard vs soft)
      const { data: bounceEvents } = await supabase
        .from('email_events')
        .select('metadata')
        .eq('client_id', client_id)
        .eq('event_type', 'bounced')
        .gte('created_at', since);

      let hardBounces = 0;
      let softBounces = 0;
      for (const ev of bounceEvents || []) {
        const bType = ev.metadata?.bounce_type;
        if (bType === 'hard') hardBounces++;
        else softBounces++;
      }

      // Trend data: daily stats for last 30 days
      const { data: trendEvents } = await supabase
        .from('email_events')
        .select('event_type, created_at')
        .eq('client_id', client_id)
        .in('event_type', ['sent', 'bounced', 'complained', 'opened'])
        .gte('created_at', since)
        .order('created_at', { ascending: true });

      const dailyBuckets: Record<string, { sent: number; bounced: number; complained: number; opened: number }> = {};
      // Pre-fill all 30 days
      for (let i = 0; i < 30; i++) {
        const d = new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000);
        const key = d.toISOString().substring(0, 10);
        dailyBuckets[key] = { sent: 0, bounced: 0, complained: 0, opened: 0 };
      }
      for (const ev of trendEvents || []) {
        const day = ev.created_at.substring(0, 10);
        if (dailyBuckets[day]) {
          (dailyBuckets[day] as any)[ev.event_type] = ((dailyBuckets[day] as any)[ev.event_type] || 0) + 1;
        }
      }

      const trend = Object.entries(dailyBuckets).map(([date, c]) => ({
        date,
        sent: c.sent,
        delivered: c.sent - c.bounced,
        bounced: c.bounced,
        complained: c.complained,
        delivery_rate: c.sent > 0 ? parseFloat(((( c.sent - c.bounced) / c.sent) * 100).toFixed(1)) : 100,
        bounce_rate: c.sent > 0 ? parseFloat((( c.bounced / c.sent) * 100).toFixed(1)) : 0,
      }));

      // Health score (0-100)
      let healthScore = 100;
      // Deduct for bounce rate
      if (bounceRate > 5) healthScore -= 30;
      else if (bounceRate > 2) healthScore -= 15;
      else if (bounceRate > 1) healthScore -= 5;
      // Deduct for complaint rate
      if (complaintRate > 0.3) healthScore -= 30;
      else if (complaintRate > 0.1) healthScore -= 15;
      else if (complaintRate > 0.05) healthScore -= 5;
      // Deduct for low open rate (inbox placement proxy)
      if (openRate < 10) healthScore -= 20;
      else if (openRate < 20) healthScore -= 10;
      // Deduct for unverified domains
      const hasVerifiedDomain = domainHealth.some((d: any) => d.verified);
      if (!hasVerifiedDomain && domainHealth.length > 0) healthScore -= 15;
      if (domainHealth.length === 0) healthScore -= 10;

      healthScore = Math.max(0, Math.min(100, healthScore));

      return c.json({
        health_score: healthScore,
        totals: {
          sent: totalSent,
          delivered: totalDelivered,
          bounced: totalBounced,
          complained: totalComplained,
        },
        rates: {
          delivery: parseFloat(deliveryRate.toFixed(2)),
          bounce: parseFloat(bounceRate.toFixed(2)),
          complaint: parseFloat(complaintRate.toFixed(3)),
          open: parseFloat(openRate.toFixed(1)),
        },
        inbox_placement: inboxPlacement,
        spam_score: spamScore,
        bounce_breakdown: { hard: hardBounces, soft: softBounces },
        domain_health: domainHealth,
        trend,
      });
    }

    case 'industry_benchmarks': {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // Get aggregate event counts for last 30 days
      const benchEventTypes = ['sent', 'opened', 'clicked', 'bounced', 'unsubscribed', 'converted'] as const;
      const benchCounts: Record<string, number> = {};

      for (const eventType of benchEventTypes) {
        const { count } = await supabase
          .from('email_events')
          .select('*', { count: 'exact', head: true })
          .eq('client_id', client_id)
          .eq('event_type', eventType)
          .gte('created_at', since);
        benchCounts[eventType] = count || 0;
      }

      const benchSent = benchCounts.sent || 0;

      const client_metrics = {
        open_rate: benchSent > 0 ? parseFloat(((benchCounts.opened / benchSent) * 100).toFixed(2)) : 0,
        click_rate: benchSent > 0 ? parseFloat(((benchCounts.clicked / benchSent) * 100).toFixed(2)) : 0,
        bounce_rate: benchSent > 0 ? parseFloat(((benchCounts.bounced / benchSent) * 100).toFixed(2)) : 0,
        unsubscribe_rate: benchSent > 0 ? parseFloat(((benchCounts.unsubscribed / benchSent) * 100).toFixed(2)) : 0,
        conversion_rate: benchSent > 0 ? parseFloat(((benchCounts.converted / benchSent) * 100).toFixed(2)) : 0,
        total_sent: benchSent,
      };

      const industry_avg = {
        ecommerce: {
          open_rate: 15.68,
          click_rate: 2.01,
          bounce_rate: 0.19,
          unsubscribe_rate: 0.27,
          conversion_rate: 0.10,
        },
        retail: {
          open_rate: 18.39,
          click_rate: 2.25,
        },
        saas: {
          open_rate: 21.29,
          click_rate: 2.45,
        },
      };

      const top_performers = {
        open_rate: 28.0,
        click_rate: 5.0,
        bounce_rate: 0.05,
        unsubscribe_rate: 0.10,
      };

      // Estimate percentile based on e-commerce benchmarks
      const ecom = industry_avg.ecommerce;
      const estimatePercentile = (clientVal: number, avg: number, top25: number, lowerIsBetter = false) => {
        if (lowerIsBetter) {
          if (clientVal <= top25) return Math.min(95, 75 + ((top25 - clientVal) / top25) * 20);
          if (clientVal <= avg) return 50 + ((avg - clientVal) / (avg - top25)) * 25;
          return Math.max(5, 50 - ((clientVal - avg) / avg) * 50);
        } else {
          if (clientVal >= top25) return Math.min(95, 75 + ((clientVal - top25) / top25) * 20);
          if (clientVal >= avg) return 50 + ((clientVal - avg) / (top25 - avg)) * 25;
          if (avg === 0) return 50;
          return Math.max(5, (clientVal / avg) * 50);
        }
      };

      const percentile_estimates = {
        open_rate: Math.round(estimatePercentile(client_metrics.open_rate, ecom.open_rate, top_performers.open_rate)),
        click_rate: Math.round(estimatePercentile(client_metrics.click_rate, ecom.click_rate, top_performers.click_rate)),
        bounce_rate: Math.round(estimatePercentile(client_metrics.bounce_rate, ecom.bounce_rate, top_performers.bounce_rate, true)),
        unsubscribe_rate: Math.round(estimatePercentile(client_metrics.unsubscribe_rate, ecom.unsubscribe_rate, top_performers.unsubscribe_rate, true)),
      };

      const overall = Math.round(
        (percentile_estimates.open_rate + percentile_estimates.click_rate +
         percentile_estimates.bounce_rate + percentile_estimates.unsubscribe_rate) / 4
      );

      return c.json({
        client_metrics,
        industry_avg,
        top_performers,
        percentile_estimates: {
          ...percentile_estimates,
          overall,
        },
      });
    }

    default:
      return c.json({ error: `Unknown action: ${action}` }, 400);
  }
}
