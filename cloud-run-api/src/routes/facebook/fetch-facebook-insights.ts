/**
 * POST /api/fetch-facebook-insights
 *
 * Body: { client_id, action: 'overview' | 'top_posts', date_from?, date_to? }
 *
 * overview  → page insights (fans, impressions, engaged_users, post_engagements, page_views)
 *             + fan trend (last 30 days)
 * top_posts → top 5 posts by engagement (reactions + comments + shares)
 */

import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { metaApiJson } from '../../lib/meta-fetch.js';
import { getTokenForConnection } from '../../lib/resolve-meta-token.js';

export async function fetchFacebookInsights(c: Context) {
  const supabase = getSupabaseAdmin();
  const body = await c.req.json();
  const { client_id, action = 'overview', date_from, date_to } = body;

  if (!client_id) return c.json({ error: 'client_id is required' }, 400);

  // Verify ownership
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const { data: ownerCheck } = await supabase
    .from('clients')
    .select('id')
    .eq('id', client_id)
    .or(`user_id.eq.${user.id},client_user_id.eq.${user.id}`)
    .maybeSingle();
  if (!ownerCheck) return c.json({ error: 'No tienes acceso a este cliente' }, 403);

  // Get Meta connection
  const { data: conn } = await supabase
    .from('platform_connections')
    .select('id, access_token_encrypted, page_id, connection_type')
    .eq('client_id', client_id)
    .eq('platform', 'meta')
    .maybeSingle();

  if (!conn) {
    return c.json({ error: 'No hay conexion a Meta/Facebook' }, 404);
  }

  const userToken = await getTokenForConnection(supabase, conn);
  if (!userToken) return c.json({ error: 'Error resolviendo token Meta' }, 500);

  // Find page_id
  let pageId = conn.page_id;
  if (!pageId) {
    const pagesRes = await metaApiJson<{ data: any[] }>('/me/accounts', userToken, {
      params: { fields: 'id,name', limit: '10' },
    });
    if (pagesRes.ok && pagesRes.data?.data?.[0]) {
      pageId = pagesRes.data.data[0].id;
      await supabase.from('platform_connections')
        .update({ page_id: pageId })
        .eq('id', conn.id);
    }
  }

  if (!pageId) {
    return c.json({ error: 'No se encontro pagina de Facebook conectada' }, 404);
  }

  // Get page access token
  const pageTokenRes = await metaApiJson<{ access_token: string; name: string; fan_count?: number }>(
    `/${pageId}`, userToken,
    { params: { fields: 'access_token,name,fan_count,picture' } },
  );

  if (!pageTokenRes.ok || !pageTokenRes.data?.access_token) {
    return c.json({ error: 'No se pudo obtener token de pagina' }, 500);
  }

  const pageToken = pageTokenRes.data.access_token;

  try {
    if (action === 'overview') {
      return await handleOverview(c, pageToken, pageId, pageTokenRes.data, date_from, date_to);
    } else if (action === 'top_posts') {
      return await handleTopPosts(c, pageToken, pageId);
    } else {
      return c.json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err: any) {
    console.error('[fb-insights]', err);
    return c.json({ error: 'Error obteniendo datos de Facebook' }, 500);
  }
}

async function handleOverview(
  c: Context, pageToken: string, pageId: string,
  pageInfo: any, dateFrom?: string, dateTo?: string,
) {
  const now = new Date();
  const since = dateFrom
    ? Math.floor(new Date(dateFrom).getTime() / 1000)
    : Math.floor(new Date(now.getTime() - 30 * 86400000).getTime() / 1000);
  const until = dateTo
    ? Math.floor(new Date(dateTo).getTime() / 1000)
    : Math.floor(now.getTime() / 1000);

  // Page insights (daily) — Graph API v21 valid metrics
  // Deprecated in v21: page_impressions, page_engaged_users, page_fans, page_fan_adds
  // Valid in v21: page_views_total, page_post_engagements, page_actions_post_reactions_total,
  //              page_follows, page_daily_follows_unique
  const insightsRes = await metaApiJson<any>(`/${pageId}/insights`, pageToken, {
    params: {
      metric: 'page_views_total,page_post_engagements,page_actions_post_reactions_total,page_follows,page_daily_follows_unique',
      period: 'day',
      since: String(since),
      until: String(until),
    },
  });

  const metrics: Record<string, number> = {
    page_views_total: 0,
    page_post_engagements: 0,
    page_actions_post_reactions_total: 0,
    page_follows: 0,
    page_daily_follows_unique: 0,
  };

  const followTrend: Array<{ date: string; value: number }> = [];

  if (insightsRes.ok && insightsRes.data?.data) {
    for (const metric of insightsRes.data.data) {
      const name = metric.name;
      const values = metric.values || [];
      if (metrics[name] !== undefined) {
        metrics[name] = values.reduce((sum: number, v: any) => sum + (v.value || 0), 0);
      }
      // Capture follows trend for chart (replaces fan_adds)
      if (name === 'page_daily_follows_unique') {
        for (const v of values) {
          followTrend.push({
            date: v.end_time?.split('T')[0] || '',
            value: v.value || 0,
          });
        }
      }
    }
  }

  return c.json({
    page: {
      name: pageInfo.name || '',
      fan_count: pageInfo.fan_count || 0,
    },
    metrics,
    follow_trend: followTrend,
  });
}

async function handleTopPosts(c: Context, pageToken: string, pageId: string) {
  const feedRes = await metaApiJson<any>(`/${pageId}/feed`, pageToken, {
    params: {
      fields: 'id,message,created_time,permalink_url,full_picture,shares,reactions.summary(true),comments.summary(true)',
      limit: '20',
    },
  });

  if (!feedRes.ok || !feedRes.data?.data) {
    return c.json({ error: 'Error obteniendo posts' }, 500);
  }

  const posts = feedRes.data.data
    .map((p: any) => ({
      id: p.id,
      message: (p.message || '').substring(0, 200),
      reactions: p.reactions?.summary?.total_count || 0,
      comments: p.comments?.summary?.total_count || 0,
      shares: p.shares?.count || 0,
      engagement: (p.reactions?.summary?.total_count || 0) + (p.comments?.summary?.total_count || 0) + (p.shares?.count || 0),
      created_time: p.created_time,
      permalink_url: p.permalink_url,
      full_picture: p.full_picture,
    }))
    .sort((a: any, b: any) => b.engagement - a.engagement)
    .slice(0, 5);

  return c.json({ top_posts: posts });
}
