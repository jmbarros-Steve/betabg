/**
 * Instagram Content Publishing API
 *
 * Actions:
 *   publish        — Publish immediately (IMAGE, CAROUSEL, REELS)
 *   schedule       — Save to instagram_scheduled_posts for future publish
 *   list           — List posts for a client
 *   update         — Update a scheduled post
 *   delete         — Delete a draft/scheduled post
 *   generate_caption — AI-generate caption + hashtags from brief
 *   cron_publish   — Called by cron to publish scheduled posts (no JWT, uses X-Cron-Secret)
 *
 * Instagram Graph API flow:
 *   1. POST /{ig-user-id}/media  → creation container (image_url + caption)
 *   2. POST /{ig-user-id}/media_publish → publish the container
 *   For CAROUSEL: create child containers first, then parent container, then publish
 *   For REELS: use video_url instead of image_url
 */

import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { metaApiFetch, metaApiJson } from '../../lib/meta-fetch.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getMetaToken(supabase: any, clientId: string): Promise<{ token: string; igUserId: string } | null> {
  // Get meta connection — read ig_account_id + page_id from DB
  const { data: conn } = await supabase
    .from('platform_connections')
    .select('id, access_token_encrypted, ig_account_id, page_id')
    .eq('client_id', clientId)
    .eq('platform', 'meta')
    .eq('is_active', true)
    .single();

  if (!conn?.access_token_encrypted) return null;

  const { data: token } = await supabase.rpc('decrypt_platform_token', {
    encrypted_token: conn.access_token_encrypted,
  });

  if (!token) return null;

  let igUserId = conn.ig_account_id;

  // 1. If page_id is set, resolve IG account from the page directly (most reliable)
  //    This ensures we always use the IG linked to the selected page, not a stale value.
  if (conn.page_id) {
    const pageRes = await metaApiJson<{ instagram_business_account?: { id: string } }>(
      `/${conn.page_id}`, token,
      { params: { fields: 'instagram_business_account' } },
    );
    if (pageRes.ok && pageRes.data?.instagram_business_account?.id) {
      const freshIgId = pageRes.data.instagram_business_account.id;
      // Update DB if it changed
      if (freshIgId !== igUserId) {
        igUserId = freshIgId;
        await supabase
          .from('platform_connections')
          .update({ ig_account_id: igUserId })
          .eq('id', conn.id);
      }
    }
  }

  // 2. Fallback: discover from first page with IG
  if (!igUserId) {
    const pagesRes = await metaApiJson<{ data: any[] }>('/me/accounts', token, {
      params: { fields: 'id,instagram_business_account', limit: '10' },
    });
    if (pagesRes.ok && pagesRes.data?.data) {
      for (const page of pagesRes.data.data) {
        if (page.instagram_business_account?.id) {
          igUserId = page.instagram_business_account.id;
          await supabase
            .from('platform_connections')
            .update({ ig_account_id: igUserId, page_id: conn.page_id || page.id })
            .eq('id', conn.id);
          break;
        }
      }
    }
  }

  if (!igUserId) return null;
  return { token, igUserId };
}

async function createImageContainer(token: string, igUserId: string, imageUrl: string, caption: string): Promise<string> {
  const res = await metaApiJson<{ id: string }>(`/${igUserId}/media`, token, {
    method: 'POST',
    body: { image_url: imageUrl, caption },
  });
  if (!res.ok) throw new Error(`Container creation failed: ${res.status} — ${JSON.stringify(res.error).substring(0, 200)}`);
  return res.data.id;
}

async function createReelsContainer(token: string, igUserId: string, videoUrl: string, caption: string): Promise<string> {
  const res = await metaApiJson<{ id: string }>(`/${igUserId}/media`, token, {
    method: 'POST',
    body: { media_type: 'REELS', video_url: videoUrl, caption },
  });
  if (!res.ok) throw new Error(`Reels container failed: ${res.status} — ${JSON.stringify(res.error).substring(0, 200)}`);
  return res.data.id;
}

/** Poll a media container until it finishes processing (required for video/reels) */
async function waitForContainerReady(token: string, containerId: string, maxWaitMs = 60000): Promise<void> {
  const start = Date.now();
  const pollInterval = 3000; // 3 seconds between polls

  while (Date.now() - start < maxWaitMs) {
    const res = await metaApiJson<{ status_code: string; status: string }>(`/${containerId}`, token, {
      params: { fields: 'status_code,status' },
      skipDelay: true,
    });

    if (res.ok) {
      const status = res.data.status_code || res.data.status;
      if (status === 'FINISHED') return;
      if (status === 'ERROR') throw new Error(`Container processing failed: ${JSON.stringify(res.data)}`);
      // IN_PROGRESS — keep polling
    }

    await new Promise(r => setTimeout(r, pollInterval));
  }

  throw new Error(`Container ${containerId} not ready after ${maxWaitMs / 1000}s`);
}

async function createCarouselContainer(token: string, igUserId: string, imageUrls: string[], caption: string): Promise<string> {
  // 1. Create child containers (no caption)
  const childIds: string[] = [];
  for (const url of imageUrls.slice(0, 10)) {
    const res = await metaApiJson<{ id: string }>(`/${igUserId}/media`, token, {
      method: 'POST',
      body: { image_url: url, is_carousel_item: true },
    });
    if (!res.ok) throw new Error(`Carousel child failed: ${res.status} — ${JSON.stringify(res.error).substring(0, 200)}`);
    childIds.push(res.data.id);
  }

  // 2. Create parent container
  const res = await metaApiJson<{ id: string }>(`/${igUserId}/media`, token, {
    method: 'POST',
    body: { media_type: 'CAROUSEL', children: childIds, caption },
  });
  if (!res.ok) throw new Error(`Carousel parent failed: ${res.status} — ${JSON.stringify(res.error).substring(0, 200)}`);
  return res.data.id;
}

async function publishContainer(token: string, igUserId: string, creationId: string): Promise<{ mediaId: string; permalink: string }> {
  const res = await metaApiJson<{ id: string }>(`/${igUserId}/media_publish`, token, {
    method: 'POST',
    body: { creation_id: creationId },
  });
  if (!res.ok) throw new Error(`Publish failed: ${res.status} — ${JSON.stringify(res.error).substring(0, 200)}`);
  const mediaId = res.data.id;

  // Get permalink
  let permalink = '';
  try {
    const infoRes = await metaApiJson<{ permalink: string }>(`/${mediaId}`, token, {
      params: { fields: 'permalink' },
    });
    if (infoRes.ok) permalink = infoRes.data.permalink || '';
  } catch { /* non-fatal */ }

  return { mediaId, permalink };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function publishInstagram(c: Context) {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const supabase = getSupabaseAdmin();
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const { action, client_id } = body;

    if (!client_id) {
      return c.json({ error: 'client_id is required' }, 400);
    }

    switch (action) {
      // ─── PUBLISH NOW ────────────────────────────────────────
      case 'publish': {
        const { media_type = 'IMAGE', image_url, image_urls, video_url, caption = '', hashtags = [] } = body;

        const meta = await getMetaToken(supabase, client_id);
        if (!meta) {
          return c.json({ error: 'Meta connection not found or no Instagram Business account linked' }, 400);
        }

        const fullCaption = hashtags.length > 0
          ? `${caption}\n\n${hashtags.map((h: string) => h.startsWith('#') ? h : `#${h}`).join(' ')}`
          : caption;

        let creationId: string;

        if (media_type === 'CAROUSEL' && image_urls?.length > 1) {
          creationId = await createCarouselContainer(meta.token, meta.igUserId, image_urls, fullCaption);
        } else if (media_type === 'REELS' && video_url) {
          creationId = await createReelsContainer(meta.token, meta.igUserId, video_url, fullCaption);
        } else {
          const url = image_url || image_urls?.[0];
          if (!url) return c.json({ error: 'image_url is required' }, 400);
          creationId = await createImageContainer(meta.token, meta.igUserId, url, fullCaption);
        }

        // For reels, poll until container is ready
        if (media_type === 'REELS') {
          await waitForContainerReady(meta.token, creationId);
        }

        const { mediaId, permalink } = await publishContainer(meta.token, meta.igUserId, creationId);

        // Save record
        await supabase.from('instagram_scheduled_posts').insert({
          client_id,
          ig_user_id: meta.igUserId,
          media_type,
          image_url: image_url || image_urls?.[0],
          image_urls: image_urls || (image_url ? [image_url] : null),
          video_url,
          caption,
          hashtags,
          status: 'published',
          published_at: new Date().toISOString(),
          creation_id: creationId,
          media_id: mediaId,
          permalink,
        });

        return c.json({ success: true, media_id: mediaId, permalink });
      }

      // ─── SCHEDULE ───────────────────────────────────────────
      case 'schedule': {
        const { media_type = 'IMAGE', image_url, image_urls, video_url, caption = '', hashtags = [], scheduled_at } = body;

        if (!scheduled_at) {
          return c.json({ error: 'scheduled_at is required (ISO 8601)' }, 400);
        }

        const { data: post, error: insertErr } = await supabase
          .from('instagram_scheduled_posts')
          .insert({
            client_id,
            media_type,
            image_url: image_url || image_urls?.[0],
            image_urls: image_urls || (image_url ? [image_url] : null),
            video_url,
            caption,
            hashtags,
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
          .from('instagram_scheduled_posts')
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
        const { post_id, caption, hashtags, scheduled_at, image_url, image_urls, video_url } = body;
        if (!post_id) return c.json({ error: 'post_id is required' }, 400);

        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        if (caption !== undefined) updates.caption = caption;
        if (hashtags !== undefined) updates.hashtags = hashtags;
        if (scheduled_at !== undefined) updates.scheduled_at = scheduled_at;
        if (image_url !== undefined) updates.image_url = image_url;
        if (image_urls !== undefined) updates.image_urls = image_urls;
        if (video_url !== undefined) updates.video_url = video_url;

        const { error: updateErr } = await supabase
          .from('instagram_scheduled_posts')
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
          .from('instagram_scheduled_posts')
          .delete()
          .eq('id', post_id)
          .eq('client_id', client_id)
          .in('status', ['draft', 'scheduled']);

        if (delErr) {
          return c.json({ error: delErr.message }, 500);
        }

        return c.json({ success: true });
      }

      // ─── GENERATE CAPTION + HASHTAGS ────────────────────────
      case 'generate_caption': {
        const { topic, tone, product_name } = body;

        // Fetch brand brief from brand_research + buyer_personas + client info
        const [{ data: brief }, { data: persona }, { data: clientInfo }] = await Promise.all([
          supabase
            .from('brand_research')
            .select('brand_name, industry, target_audience, value_proposition, brand_voice, product_details')
            .eq('client_id', client_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('buyer_personas')
            .select('persona_data')
            .eq('client_id', client_id)
            .eq('is_complete', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('clients')
            .select('name, company, shop_domain')
            .eq('id', client_id)
            .maybeSingle(),
        ]);

        const brandName = brief?.brand_name || clientInfo?.company || clientInfo?.name || 'la marca';
        const toneVoice = tone || brief?.brand_voice || 'profesional y cercano';
        const audience = brief?.target_audience || 'audiencia general';
        const industry = brief?.industry || '';
        const valueProp = brief?.value_proposition || '';
        const productDetails = brief?.product_details || '';

        // Extract persona insights if available
        const personaData = persona?.persona_data as any;
        const personaCtx = personaData
          ? `Buyer persona: ${personaData.nombre || ''} — ${personaData.edad || ''}, ${personaData.ocupacion || ''}. Intereses: ${(personaData.intereses || []).join(', ')}. Dolor principal: ${personaData.dolor_principal || ''}.`
          : '';

        const prompt = `Genera un caption para Instagram y hashtags para la marca "${brandName}".

BRIEF DE MARCA:
- Nombre: ${brandName}
${industry ? `- Industria: ${industry}` : ''}
${valueProp ? `- Propuesta de valor: ${valueProp}` : ''}
${productDetails ? `- Productos: ${productDetails}` : ''}
- Tono de voz: ${toneVoice}
- Audiencia objetivo: ${audience}
${personaCtx ? `- ${personaCtx}` : ''}

CONTENIDO:
- Tema: ${topic || 'post general de la marca'}
${product_name ? `- Producto destacado: ${product_name}` : ''}

INSTRUCCIONES:
1. Caption en español chileno, máximo 2200 caracteres.
2. Incluir line breaks para legibilidad.
3. Incluir un CTA claro al final (antes de los hashtags).
4. El caption debe reflejar el tono de voz y valores de la marca.

HASHTAGS (20-30 total):
- 10 hashtags de nicho (específicos de la industria/producto)
- 10 hashtags de ubicación (Chile, Santiago, LATAM, ciudades relevantes)
- 5-10 hashtags populares (tendencias generales con alto alcance)

Return ONLY a JSON object:
{"caption": "el caption aquí", "hashtags": ["hashtag1", "hashtag2", ...sin el símbolo #]}`;

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
          return c.json({
            caption: parsed.caption || '',
            hashtags: parsed.hashtags || [],
          });
        } catch {
          return c.json({ caption: text, hashtags: [] });
        }
      }

      // ─── GET IG PROFILE (username + picture) ─────────────
      case 'get_profile': {
        const meta = await getMetaToken(supabase, client_id);
        if (!meta) return c.json({ error: 'No Instagram connection' }, 400);

        // Allow override from frontend (e.g. when portfolio IG differs from stored ig_account_id)
        const igId = body.ig_account_id || meta.igUserId;

        const res = await metaApiJson<{ username: string; name: string; profile_picture_url: string }>(
          `/${igId}`, meta.token,
          { params: { fields: 'username,name,profile_picture_url' } },
        );
        if (!res.ok) return c.json({ error: 'Failed to fetch IG profile' }, 500);

        return c.json({
          username: res.data.username || '',
          name: res.data.name || '',
          profile_picture_url: res.data.profile_picture_url || '',
        });
      }

      default:
        return c.json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err: any) {
    console.error('publish-instagram error:', err.message);
    return c.json({ error: err.message }, 500);
  }
}

// ---------------------------------------------------------------------------
// CRON: Publish scheduled posts (no JWT, uses X-Cron-Secret)
// ---------------------------------------------------------------------------

export async function cronPublishInstagram(c: Context) {
  const cronSecret = c.req.header('X-Cron-Secret') || '';
  if (cronSecret !== process.env.CRON_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  // Find posts that are due
  const { data: duePosts } = await supabase
    .from('instagram_scheduled_posts')
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
      await supabase.from('instagram_scheduled_posts')
        .update({ status: 'publishing' })
        .eq('id', post.id);

      const meta = await getMetaToken(supabase, post.client_id);
      if (!meta) throw new Error('No Meta/IG connection');

      const fullCaption = post.hashtags?.length > 0
        ? `${post.caption}\n\n${post.hashtags.map((h: string) => h.startsWith('#') ? h : `#${h}`).join(' ')}`
        : post.caption;

      let creationId: string;

      if (post.media_type === 'CAROUSEL' && post.image_urls?.length > 1) {
        creationId = await createCarouselContainer(meta.token, meta.igUserId, post.image_urls, fullCaption);
      } else if (post.media_type === 'REELS' && post.video_url) {
        creationId = await createReelsContainer(meta.token, meta.igUserId, post.video_url, fullCaption);
        await waitForContainerReady(meta.token, creationId);
      } else {
        const url = post.image_url || post.image_urls?.[0];
        if (!url) throw new Error('No image URL');
        creationId = await createImageContainer(meta.token, meta.igUserId, url, fullCaption);
      }

      const { mediaId, permalink } = await publishContainer(meta.token, meta.igUserId, creationId);

      await supabase.from('instagram_scheduled_posts').update({
        status: 'published',
        published_at: new Date().toISOString(),
        creation_id: creationId,
        media_id: mediaId,
        permalink,
        ig_user_id: meta.igUserId,
      }).eq('id', post.id);

      published++;
    } catch (err: any) {
      errors.push(`Post ${post.id}: ${err.message}`);
      await supabase.from('instagram_scheduled_posts').update({
        status: 'failed',
        error: err.message?.substring(0, 500),
      }).eq('id', post.id);
    }
  }

  return c.json({ published, errors: errors.length > 0 ? errors : undefined });
}
