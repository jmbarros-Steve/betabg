import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { metaApiJson } from '../../lib/meta-fetch.js';

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
    .select('id, access_token_encrypted, ig_account_id')
    .eq('client_id', client_id)
    .eq('platform', 'meta')
    .maybeSingle();

  if (!conn?.access_token_encrypted) {
    return c.json({ error: 'No hay conexión a Meta/Instagram' }, 404);
  }

  const { data: token } = await supabase.rpc('decrypt_platform_token', {
    encrypted_token: conn.access_token_encrypted,
  });
  if (!token) return c.json({ error: 'Error descifrando token' }, 500);

  // Find Instagram Business Account ID — try DB first, then API discovery
  let resolvedIgId = conn.ig_account_id;

  if (!resolvedIgId) {
    // Fallback: discover from connected pages
    const pagesRes = await metaApiJson<{ data: any[] }>('/me/accounts', token, {
      params: { fields: 'id,instagram_business_account', limit: '10' },
    });
    if (pagesRes.ok && pagesRes.data?.data) {
      for (const page of pagesRes.data.data) {
        if (page.instagram_business_account?.id) {
          resolvedIgId = page.instagram_business_account.id;
          // Persist for future use
          await supabase
            .from('platform_connections')
            .update({ ig_account_id: resolvedIgId })
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

  // 2. Account insights (daily metrics for the period)
  const insightsRes = await metaApiJson<any>(`/${igId}/insights`, token, {
    params: {
      metric: 'impressions,reach,profile_views,website_clicks',
      period: 'day',
      since: String(since),
      until: String(until),
    },
  });

  const metrics: Record<string, number> = {
    impressions: 0,
    reach: 0,
    profile_views: 0,
    website_clicks: 0,
  };
  const followerTrend: Array<{ date: string; value: number }> = [];

  if (insightsRes.ok && insightsRes.data?.data) {
    for (const metric of insightsRes.data.data) {
      const name = metric.name;
      const values = metric.values || [];
      if (metrics[name] !== undefined) {
        metrics[name] = values.reduce((sum: number, v: any) => sum + (v.value || 0), 0);
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
