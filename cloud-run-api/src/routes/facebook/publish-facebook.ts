/**
 * Facebook Content Publishing API
 *
 * Actions:
 *   publish          — Publish immediately (TEXT, PHOTO, VIDEO, LINK)
 *   schedule         — Save to facebook_scheduled_posts for future publish
 *   list             — List posts for a client
 *   update           — Update a scheduled post
 *   delete           — Delete a draft/scheduled post
 *   generate_caption — AI-generate caption from brief
 *   cron_publish     — Called by cron to publish scheduled posts (no JWT, uses X-Cron-Secret)
 *
 * Facebook Graph API flow:
 *   TEXT:  POST /{page-id}/feed { message }
 *   PHOTO: POST /{page-id}/photos { url, caption }
 *   VIDEO: POST /{page-id}/videos { file_url, description }
 *   LINK:  POST /{page-id}/feed { message, link }
 *
 * CRITICAL: Uses Page Access Token (not user token).
 */

import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { metaApiJson } from '../../lib/meta-fetch.js';
import { getTokenForConnection } from '../../lib/resolve-meta-token.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FBTokenResult {
  userToken: string;
  pageToken: string;
  pageId: string;
}

async function getFBPageToken(supabase: any, clientId: string): Promise<FBTokenResult | null> {
  const { data: conn } = await supabase
    .from('platform_connections')
    .select('id, access_token_encrypted, page_id, connection_type')
    .eq('client_id', clientId)
    .eq('platform', 'meta')
    .eq('is_active', true)
    .maybeSingle();

  if (!conn) return null;

  const userToken = await getTokenForConnection(supabase, conn);
  if (!userToken) return null;

  let pageId = conn.page_id;

  // If no page_id stored, discover from /me/accounts (only for OAuth — SUAT cross-contaminates)
  const isSuat = conn.connection_type === 'bm_partner' || conn.connection_type === 'leadsie';
  if (!pageId && !isSuat) {
    const pagesRes = await metaApiJson<{ data: any[] }>('/me/accounts', userToken, {
      params: { fields: 'id,name,access_token', limit: '10' },
    });
    if (pagesRes.ok && pagesRes.data?.data?.[0]) {
      pageId = pagesRes.data.data[0].id;
      await supabase
        .from('platform_connections')
        .update({ page_id: pageId })
        .eq('id', conn.id);
    }
  }

  if (!pageId) return null;

  // Get Page Access Token from the page
  const pageRes = await metaApiJson<{ access_token: string }>(
    `/${pageId}`, userToken,
    { params: { fields: 'access_token' } },
  );

  if (!pageRes.ok || !pageRes.data?.access_token) return null;

  return { userToken, pageToken: pageRes.data.access_token, pageId };
}

async function publishToFB(
  pageToken: string,
  pageId: string,
  mediaType: string,
  message: string,
  imageUrl?: string,
  videoUrl?: string,
  linkUrl?: string,
): Promise<{ postId: string; permalink: string }> {
  let res: any;

  switch (mediaType) {
    case 'PHOTO': {
      if (!imageUrl) throw new Error('image_url is required for PHOTO');
      res = await metaApiJson<{ id: string; post_id?: string }>(`/${pageId}/photos`, pageToken, {
        method: 'POST',
        body: { url: imageUrl, caption: message },
      });
      break;
    }
    case 'VIDEO': {
      if (!videoUrl) throw new Error('video_url is required for VIDEO');
      res = await metaApiJson<{ id: string }>(`/${pageId}/videos`, pageToken, {
        method: 'POST',
        body: { file_url: videoUrl, description: message },
      });
      break;
    }
    case 'LINK': {
      if (!linkUrl) throw new Error('link_url is required for LINK');
      res = await metaApiJson<{ id: string }>(`/${pageId}/feed`, pageToken, {
        method: 'POST',
        body: { message, link: linkUrl },
      });
      break;
    }
    case 'TEXT':
    default: {
      res = await metaApiJson<{ id: string }>(`/${pageId}/feed`, pageToken, {
        method: 'POST',
        body: { message },
      });
      break;
    }
  }

  if (!res.ok) {
    throw new Error(`FB publish failed: ${res.status} — ${JSON.stringify(res.error).substring(0, 300)}`);
  }

  const postId = res.data.post_id || res.data.id;

  // Try to get permalink
  let permalink = '';
  try {
    const infoRes = await metaApiJson<{ permalink_url?: string }>(`/${postId}`, pageToken, {
      params: { fields: 'permalink_url' },
    });
    if (infoRes.ok) permalink = infoRes.data.permalink_url || '';
  } catch { /* non-fatal */ }

  return { postId, permalink };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function publishFacebook(c: Context) {
  try {
    // User already validated by authMiddleware
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const supabase = getSupabaseAdmin();

    const body = await c.req.json();
    const { action, client_id } = body;

    if (!client_id) {
      return c.json({ error: 'client_id is required' }, 400);
    }

    // Verify user owns this client (IDOR prevention)
    const { data: ownerCheck } = await supabase
      .from('clients')
      .select('id')
      .eq('id', client_id)
      .or(`user_id.eq.${user.id},client_user_id.eq.${user.id}`)
      .maybeSingle();
    if (!ownerCheck) {
      const { data: role } = await supabase.from('user_roles').select('is_super_admin').eq('user_id', user.id).maybeSingle();
      if (!role?.is_super_admin) {
        return c.json({ error: 'No tienes acceso a este cliente' }, 403);
      }
    }

    switch (action) {
      // ─── PUBLISH NOW ────────────────────────────────────────
      case 'publish': {
        const { media_type = 'TEXT', message = '', image_url, video_url, link_url } = body;

        const fb = await getFBPageToken(supabase, client_id);
        if (!fb) {
          return c.json({ error: 'Meta connection not found or no Facebook Page linked' }, 400);
        }

        const { postId, permalink } = await publishToFB(
          fb.pageToken, fb.pageId, media_type, message, image_url, video_url, link_url,
        );

        // Save record
        await supabase.from('facebook_scheduled_posts').insert({
          client_id,
          page_id: fb.pageId,
          media_type,
          message,
          image_url,
          video_url,
          link_url,
          status: 'published',
          published_at: new Date().toISOString(),
          post_id: postId,
          permalink,
        });

        return c.json({ success: true, post_id: postId, permalink });
      }

      // ─── SCHEDULE ───────────────────────────────────────────
      case 'schedule': {
        const { media_type = 'TEXT', message = '', image_url, video_url, link_url, scheduled_at } = body;

        if (!scheduled_at) {
          return c.json({ error: 'scheduled_at is required (ISO 8601)' }, 400);
        }

        const { data: post, error: insertErr } = await supabase
          .from('facebook_scheduled_posts')
          .insert({
            client_id,
            media_type,
            message,
            image_url,
            video_url,
            link_url,
            status: 'scheduled',
            scheduled_at,
          })
          .select('id')
          .single();

        if (insertErr) {
          return c.json({ error: insertErr.message }, 500);
        }

        return c.json({ success: true, post_id: post.id, scheduled_at });
      }

      // ─── LIST ───────────────────────────────────────────────
      case 'list': {
        const { status: filterStatus, limit = 50 } = body;

        let query = supabase
          .from('facebook_scheduled_posts')
          .select('*')
          .eq('client_id', client_id)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (filterStatus) {
          query = query.eq('status', filterStatus);
        }

        const { data: posts, error: listErr } = await query;
        if (listErr) {
          return c.json({ error: listErr.message }, 500);
        }

        return c.json({ posts });
      }

      // ─── UPDATE ─────────────────────────────────────────────
      case 'update': {
        const { post_id, message, scheduled_at, image_url, video_url, link_url } = body;
        if (!post_id) return c.json({ error: 'post_id is required' }, 400);

        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        if (message !== undefined) updates.message = message;
        if (scheduled_at !== undefined) updates.scheduled_at = scheduled_at;
        if (image_url !== undefined) updates.image_url = image_url;
        if (video_url !== undefined) updates.video_url = video_url;
        if (link_url !== undefined) updates.link_url = link_url;

        const { error: updateErr } = await supabase
          .from('facebook_scheduled_posts')
          .update(updates)
          .eq('id', post_id)
          .eq('client_id', client_id)
          .in('status', ['draft', 'scheduled']);

        if (updateErr) {
          return c.json({ error: updateErr.message }, 500);
        }

        return c.json({ success: true });
      }

      // ─── DELETE ─────────────────────────────────────────────
      case 'delete': {
        const { post_id } = body;
        if (!post_id) return c.json({ error: 'post_id is required' }, 400);

        const { error: delErr } = await supabase
          .from('facebook_scheduled_posts')
          .delete()
          .eq('id', post_id)
          .eq('client_id', client_id)
          .in('status', ['draft', 'scheduled']);

        if (delErr) {
          return c.json({ error: delErr.message }, 500);
        }

        return c.json({ success: true });
      }

      // ─── GENERATE CAPTION ──────────────────────────────────
      case 'generate_caption': {
        const { topic, tone } = body;

        const [{ data: brief }, { data: clientInfo }] = await Promise.all([
          supabase
            .from('brand_research')
            .select('brand_name, industry, target_audience, value_proposition, brand_voice')
            .eq('client_id', client_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('clients')
            .select('name, company')
            .eq('id', client_id)
            .maybeSingle(),
        ]);

        const brandName = brief?.brand_name || clientInfo?.company || clientInfo?.name || 'la marca';
        const toneVoice = tone || brief?.brand_voice || 'profesional y cercano';

        const prompt = `Genera un caption para Facebook para la marca "${brandName}".

BRIEF: ${brief ? JSON.stringify(brief) : 'No disponible'}
Tema: ${topic || 'post general de la marca'}
Tono: ${toneVoice}

INSTRUCCIONES:
1. Caption en español, optimizado para Facebook (puede ser más largo que IG).
2. Incluir emojis relevantes.
3. Incluir un CTA claro al final.
4. Formatear con line breaks para legibilidad.

Return ONLY a JSON object: {"caption": "el caption aquí"}`;

        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        if (!anthropicKey) {
          return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
        }

        const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1500,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (!aiResp.ok) {
          return c.json({ error: 'AI generation failed' }, 500);
        }

        const aiData: any = await aiResp.json();
        const text = aiData.content?.[0]?.text || '';

        try {
          const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
          return c.json({ caption: parsed.caption || '' });
        } catch {
          return c.json({ caption: text });
        }
      }

      default:
        return c.json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err: any) {
    console.error('publish-facebook error:', err.message);
    return c.json({ error: err.message }, 500);
  }
}

// ---------------------------------------------------------------------------
// CRON: Publish scheduled posts (no JWT, uses X-Cron-Secret)
// ---------------------------------------------------------------------------

export async function cronPublishFacebook(c: Context) {
  const cronSecret = c.req.header('X-Cron-Secret') || '';
  if (cronSecret !== process.env.CRON_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: duePosts } = await supabase
    .from('facebook_scheduled_posts')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .limit(20);

  if (!duePosts?.length) {
    return c.json({ published: 0 });
  }

  let published = 0;
  const errors: string[] = [];

  for (const post of duePosts) {
    try {
      await supabase.from('facebook_scheduled_posts')
        .update({ status: 'publishing' })
        .eq('id', post.id);

      const fb = await getFBPageToken(supabase, post.client_id);
      if (!fb) throw new Error('No Meta/FB connection');

      const { postId, permalink } = await publishToFB(
        fb.pageToken, fb.pageId, post.media_type,
        post.message, post.image_url, post.video_url, post.link_url,
      );

      await supabase.from('facebook_scheduled_posts').update({
        status: 'published',
        published_at: new Date().toISOString(),
        post_id: postId,
        permalink,
        page_id: fb.pageId,
      }).eq('id', post.id);

      published++;
    } catch (err: any) {
      errors.push(`Post ${post.id}: ${err.message}`);
      await supabase.from('facebook_scheduled_posts').update({
        status: 'failed',
        error: err.message?.substring(0, 500),
      }).eq('id', post.id);
    }
  }

  const status = published > 0 || errors.length === 0 ? 200 : 500;
  return c.json({ published, errors: errors.length > 0 ? errors : undefined }, status);
}
