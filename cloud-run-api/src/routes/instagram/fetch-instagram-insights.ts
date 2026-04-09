import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { metaApiJson } from '../../lib/meta-fetch.js';
import { getTokenForConnection } from '../../lib/resolve-meta-token.js';

/**
 * POST /api/fetch-instagram-insights
 *
 * Body: { client_id, action: 'overview' | 'top_posts', date_from?, date_to? }
 *
 * overview → account insights (impressions, reach, follower_count, profile_views, website_clicks)
 *            + follower trend (last 30 days)
 * top_posts → top 5 posts by engagement (likes + comments)
 */
export async function fetchInstagramInsights(c: Context) {
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

  // Get Meta connection (Instagram uses Meta token)
  const { data: conn } = await supabase
    .from('platform_connections')
    .select('id, access_token_encrypted, ig_account_id, page_id, connection_type')
    .eq('client_id', client_id)
    .eq('platform', 'meta')
    .maybeSingle();

  if (!conn) {
    return c.json({ error: 'No hay conexión a Meta/Instagram' }, 404);
  }

  const token = await getTokenForConnection(supabase, conn);
  if (!token) return c.json({ error: 'Error resolviendo token Meta' }, 500);

  // Find Instagram Business Account ID
  let resolvedIgId = conn.ig_account_id;

  // 1. If page_id is set, resolve IG from the page directly (most reliable)
  if (conn.page_id) {
    const pageRes = await metaApiJson<{ instagram_business_account?: { id: string } }>(
      `/${conn.page_id}`, token,
      { params: { fields: 'instagram_business_account' } },
    );
    if (pageRes.ok && pageRes.data?.instagram_business_account?.id) {
      const freshIgId = pageRes.data.instagram_business_account.id;
      if (freshIgId !== resolvedIgId) {
        resolvedIgId = freshIgId;
        await supabase.from('platform_connections')
          .update({ ig_account_id: resolvedIgId })
          .eq('id', conn.id);
      }
    }
  }

  // 2. Fallback: discover from first page with IG
  //    SKIP for SUAT connections — /me/accounts returns ALL merchants' pages (cross-contamination)
  const isSuat = conn.connection_type === 'bm_partner' || conn.connection_type === 'leadsie';
  if (!resolvedIgId && !isSuat) {
    const pagesRes = await metaApiJson<{ data: any[] }>('/me/accounts', token, {
      params: { fields: 'id,instagram_business_account', limit: '10' },
    });
    if (pagesRes.ok && pagesRes.data?.data) {
      for (const page of pagesRes.data.data) {
        if (page.instagram_business_account?.id) {
          resolvedIgId = page.instagram_business_account.id;
          await supabase.from('platform_connections')
            .update({ ig_account_id: resolvedIgId, page_id: conn.page_id || page.id })
            .eq('id', conn.id);
          break;
        }
      }
    }
  }

  if (!resolvedIgId) {
    return c.json({ error: 'No se encontró cuenta de Instagram Business conectada' }, 404);
  }

  try {
    if (action === 'overview') {
      return await handleOverview(c, token, resolvedIgId, date_from, date_to);
    } else if (action === 'top_posts') {
      return await handleTopPosts(c, token, resolvedIgId);
    } else {
      return c.json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err: any) {
    console.error('[ig-insights]', err);
    return c.json({ error: 'Error obteniendo datos de Instagram' }, 500);
  }
}

async function handleOverview(c: Context, token: string, igId: string, dateFrom?: string, dateTo?: string) {
  const now = new Date();
  const since = dateFrom
    ? Math.floor(new Date(dateFrom).getTime() / 1000)
    : Math.floor(new Date(now.getTime() - 30 * 86400000).getTime() / 1000);
  const until = dateTo
    ? Math.floor(new Date(dateTo).getTime() / 1000)
    : Math.floor(now.getTime() / 1000);

  // 1. Account info (follower count)
  const profileRes = await metaApiJson<any>(`/${igId}`, token, {
    params: { fields: 'followers_count,media_count,username,name,profile_picture_url' },
  });
  const profile = profileRes.ok ? profileRes.data : {};

  // 2. Account insights — split into two calls for Graph API v21 compatibility
  // Call A: daily period metrics (reach)
  const dailyRes = await metaApiJson<any>(`/${igId}/insights`, token, {
    params: {
      metric: 'reach',
      period: 'day',
      since: String(since),
      until: String(until),
    },
  });

  // Call B: total_value metrics (profile_views, website_clicks) — v21 requires metric_type=total_value
  const totalRes = await metaApiJson<any>(`/${igId}/insights`, token, {
    params: {
      metric: 'profile_views,website_clicks',
      metric_type: 'total_value',
      period: 'day',
      since: String(since),
      until: String(until),
    },
  });

  const metrics: Record<string, number> = {
    reach: 0,
    profile_views: 0,
    website_clicks: 0,
  };
  const followerTrend: Array<{ date: string; value: number }> = [];

  // Parse daily metrics (summing day values)
  if (dailyRes.ok && dailyRes.data?.data) {
    for (const metric of dailyRes.data.data) {
      const name = metric.name;
      const values = metric.values || [];
      if (metrics[name] !== undefined) {
        metrics[name] = values.reduce((sum: number, v: any) => sum + (v.value || 0), 0);
      }
    }
  }

  // Parse total_value metrics (single aggregated value per metric)
  if (totalRes.ok && totalRes.data?.data) {
    for (const metric of totalRes.data.data) {
      const name = metric.name;
      if (metrics[name] !== undefined) {
        metrics[name] = metric.total_value?.value || 0;
      }
    }
  }

  // 3. Follower count trend (use follower_count from insights if available)
  const followerRes = await metaApiJson<any>(`/${igId}/insights`, token, {
    params: {
      metric: 'follower_count',
      period: 'day',
      since: String(since),
      until: String(until),
    },
  });

  if (followerRes.ok && followerRes.data?.data?.[0]?.values) {
    for (const v of followerRes.data.data[0].values) {
      followerTrend.push({
        date: v.end_time?.split('T')[0] || '',
        value: v.value || 0,
      });
    }
  }

  return c.json({
    profile: {
      username: profile.username,
      name: profile.name,
      followers_count: profile.followers_count || 0,
      media_count: profile.media_count || 0,
      profile_picture_url: profile.profile_picture_url,
    },
    metrics,
    follower_trend: followerTrend,
  });
}

async function handleTopPosts(c: Context, token: string, igId: string) {
  const mediaRes = await metaApiJson<any>(`/${igId}/media`, token, {
    params: {
      fields: 'id,caption,like_count,comments_count,timestamp,media_type,thumbnail_url,permalink,media_url',
      limit: '20',
    },
  });

  if (!mediaRes.ok || !mediaRes.data?.data) {
    return c.json({ error: 'Error obteniendo posts' }, 500);
  }

  const posts = mediaRes.data.data
    .map((p: any) => ({
      id: p.id,
      caption: (p.caption || '').substring(0, 200),
      likes: p.like_count || 0,
      comments: p.comments_count || 0,
      engagement: (p.like_count || 0) + (p.comments_count || 0),
      timestamp: p.timestamp,
      media_type: p.media_type,
      thumbnail_url: p.thumbnail_url || p.media_url,
      permalink: p.permalink,
    }))
    .sort((a: any, b: any) => b.engagement - a.engagement)
    .slice(0, 5);

  return c.json({ top_posts: posts });
}
