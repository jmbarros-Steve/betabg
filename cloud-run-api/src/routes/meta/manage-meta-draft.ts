import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

/**
 * Meta Campaign Drafts — endpoint único multi-action.
 *
 * POST /api/meta-draft
 *   { action: 'create' | 'get' | 'update' | 'preview' | 'publish' | 'reject' | 'list', ... }
 *
 * Auth: usuario dueño del client (vía authMiddleware) | internal (service role) | cron secret
 *
 * Steve estrategia llama 'create' y 'update'. Frontend llama 'get', 'update', 'preview', 'publish'.
 *
 * Spec shape (mínimo viable):
 *   {
 *     objective: 'CONVERSIONS' | 'TRAFFIC' | 'AWARENESS' | 'ENGAGEMENT' | 'CATALOG',
 *     budget: { type: 'daily' | 'lifetime', amount_clp: number },
 *     schedule: { start: ISO, end?: ISO },
 *     audience: { gender?: 'all'|'male'|'female', age_min: number, age_max: number,
 *                 geo: { countries: string[], cities?: string[] },
 *                 interests?: string[], custom_audiences?: string[],
 *                 exclusions?: { custom_audiences?: string[] } },
 *     placements: { platforms: ('facebook'|'instagram'|'audience_network'|'messenger')[],
 *                   positions?: ('feed'|'reels'|'stories'|'explore')[] },
 *     creative: { type: 'image'|'video'|'carousel'|'dpa',
 *                 headline?: string, body?: string, cta?: string,
 *                 image_url?: string, video_url?: string,
 *                 destination_url?: string },
 *     adset_name?: string, ad_name?: string,
 *   }
 */

type Action = 'create' | 'get' | 'update' | 'preview' | 'publish' | 'reject' | 'list';

interface DraftSpec {
  objective?: string;
  budget?: { type: 'daily' | 'lifetime'; amount_clp: number };
  schedule?: { start?: string; end?: string };
  audience?: any;
  placements?: any;
  creative?: any;
  adset_name?: string;
  ad_name?: string;
  [key: string]: any;
}

interface RequestBody {
  action: Action;
  draft_id?: string;
  client_id?: string;
  connection_id?: string;
  name?: string;
  spec?: DraftSpec;
  source_conversation_id?: string;
  notes?: string;
  changes?: Partial<DraftSpec>;
}

export async function manageMetaDraft(c: Context) {
  try {
    const supabase = getSupabaseAdmin();
    const isCron = isValidCronSecret(c.req.header('X-Cron-Secret'));
    const isInternal = c.get('isInternal') === true;
    const user = c.get('user');

    if (!isCron && !isInternal && !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json() as RequestBody;
    const { action } = body;

    if (!action) {
      return c.json({ error: 'Missing action' }, 400);
    }

    // ─── Helper: verifica que el usuario es dueño del client ───
    async function assertClientOwner(client_id: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
      if (isCron || isInternal) return { ok: true };
      const userId = user?.id;
      if (!userId) return { ok: false, status: 401, error: 'Unauthorized' };
      const { data: client } = await supabase
        .from('clients')
        .select('user_id, client_user_id')
        .eq('id', client_id)
        .single();
      if (!client) return { ok: false, status: 404, error: 'Client not found' };
      if (client.user_id === userId || client.client_user_id === userId) return { ok: true };
      // Super admin escape hatch
      const { data: roleRow } = await supabase
        .from('user_roles')
        .select('is_super_admin')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle();
      if (roleRow?.is_super_admin) return { ok: true };
      return { ok: false, status: 403, error: 'Forbidden' };
    }

    // ─── CREATE ───
    if (action === 'create') {
      const { client_id, connection_id, name, spec, source_conversation_id } = body;
      if (!client_id || !name || !spec) {
        return c.json({ error: 'create requires client_id, name, spec' }, 400);
      }
      const auth = await assertClientOwner(client_id);
      if (!auth.ok) return c.json({ error: auth.error }, auth.status as any);

      const { data, error } = await supabase
        .from('meta_campaign_drafts')
        .insert({
          client_id,
          connection_id: connection_id || null,
          name,
          spec,
          source_conversation_id: source_conversation_id || null,
          status: 'draft',
          created_by: 'steve',
        })
        .select()
        .single();

      if (error || !data) {
        console.error('[meta-draft] create error:', error);
        return c.json({ error: 'Failed to create draft', details: error?.message }, 500);
      }

      return c.json({
        ok: true,
        draft: data,
        review_url: `/portal/campaigns/draft/${data.id}`,
      });
    }

    // ─── GET ───
    if (action === 'get') {
      if (!body.draft_id) return c.json({ error: 'get requires draft_id' }, 400);
      const { data, error } = await supabase
        .from('meta_campaign_drafts')
        .select('*')
        .eq('id', body.draft_id)
        .single();
      if (error || !data) return c.json({ error: 'Draft not found' }, 404);
      const auth = await assertClientOwner(data.client_id);
      if (!auth.ok) return c.json({ error: auth.error }, auth.status as any);
      return c.json({ ok: true, draft: data });
    }

    // ─── LIST (per client) ───
    if (action === 'list') {
      if (!body.client_id) return c.json({ error: 'list requires client_id' }, 400);
      const auth = await assertClientOwner(body.client_id);
      if (!auth.ok) return c.json({ error: auth.error }, auth.status as any);
      const { data, error } = await supabase
        .from('meta_campaign_drafts')
        .select('id, name, status, spec, meta_campaign_id, created_at, updated_at, published_at')
        .eq('client_id', body.client_id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) return c.json({ error: 'Failed to list', details: error.message }, 500);
      return c.json({ ok: true, drafts: data || [] });
    }

    // ─── UPDATE (cambios parciales a name / spec / notes) ───
    if (action === 'update') {
      if (!body.draft_id) return c.json({ error: 'update requires draft_id' }, 400);
      const { data: existing } = await supabase
        .from('meta_campaign_drafts')
        .select('client_id, status, spec')
        .eq('id', body.draft_id)
        .single();
      if (!existing) return c.json({ error: 'Draft not found' }, 404);
      if (existing.status === 'published') {
        return c.json({ error: 'Draft already published — edit on Meta directly via update_budget / update_ad' }, 400);
      }
      const auth = await assertClientOwner(existing.client_id);
      if (!auth.ok) return c.json({ error: auth.error }, auth.status as any);

      const patch: any = {};
      if (body.name) patch.name = body.name;
      if (body.spec) patch.spec = body.spec;
      if (body.changes) patch.spec = { ...(existing.spec as any), ...body.changes };
      if (body.notes !== undefined) patch.notes = body.notes;
      if (Object.keys(patch).length === 0) {
        return c.json({ error: 'Nothing to update' }, 400);
      }

      const { data, error } = await supabase
        .from('meta_campaign_drafts')
        .update(patch)
        .eq('id', body.draft_id)
        .select()
        .single();
      if (error || !data) return c.json({ error: 'Failed to update', details: error?.message }, 500);
      return c.json({ ok: true, draft: data });
    }

    // ─── REJECT (marcar como rechazado, no se publica) ───
    if (action === 'reject') {
      if (!body.draft_id) return c.json({ error: 'reject requires draft_id' }, 400);
      const { data: existing } = await supabase
        .from('meta_campaign_drafts')
        .select('client_id, status')
        .eq('id', body.draft_id)
        .single();
      if (!existing) return c.json({ error: 'Draft not found' }, 404);
      const auth = await assertClientOwner(existing.client_id);
      if (!auth.ok) return c.json({ error: auth.error }, auth.status as any);
      const { error } = await supabase
        .from('meta_campaign_drafts')
        .update({ status: 'rejected' })
        .eq('id', body.draft_id);
      if (error) return c.json({ error: 'Failed to reject', details: error.message }, 500);
      return c.json({ ok: true });
    }

    // ─── PREVIEW (Meta API generatepreviews — NO crea campaña, solo render) ───
    if (action === 'preview') {
      if (!body.draft_id) return c.json({ error: 'preview requires draft_id' }, 400);
      const { data: draft } = await supabase
        .from('meta_campaign_drafts')
        .select('*, platform_connections(access_token_encrypted, account_id)')
        .eq('id', body.draft_id)
        .single();
      if (!draft) return c.json({ error: 'Draft not found' }, 404);
      const auth = await assertClientOwner(draft.client_id);
      if (!auth.ok) return c.json({ error: auth.error }, auth.status as any);

      // Need a Meta connection
      let connection: any = (draft as any).platform_connections;
      if (!connection) {
        const { data: conn } = await supabase
          .from('platform_connections')
          .select('access_token_encrypted, account_id')
          .eq('client_id', draft.client_id)
          .eq('platform', 'meta')
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        connection = conn;
      }
      if (!connection?.access_token_encrypted || !connection?.account_id) {
        return c.json({ error: 'No active Meta connection for this client' }, 400);
      }
      const { data: token } = await supabase
        .rpc('decrypt_platform_token', { encrypted_token: connection.access_token_encrypted });
      if (!token) return c.json({ error: 'Failed to decrypt token' }, 500);

      const spec = (draft.spec || {}) as DraftSpec;
      const cre = spec.creative || {};
      // Build minimum creative spec inline for generatepreviews
      const creativeSpec: any = {
        object_story_spec: {
          page_id: spec.page_id || undefined,
          link_data: {
            link: cre.destination_url || 'https://example.com',
            message: cre.body || '',
            name: cre.headline || '',
            call_to_action: cre.cta ? { type: cre.cta } : undefined,
            picture: cre.image_url || undefined,
          },
        },
      };
      try {
        const res = await fetch(`https://graph.facebook.com/v23.0/act_${connection.account_id}/generatepreviews`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ad_format: 'INSTAGRAM_STANDARD',
            creative: creativeSpec,
            access_token: token,
          }),
        });
        const json: any = await res.json();
        if (!res.ok) {
          return c.json({ error: 'Meta preview failed', details: json?.error?.message || 'unknown' }, 502);
        }
        return c.json({ ok: true, previews: json.data || [] });
      } catch (e: any) {
        return c.json({ error: 'Preview exception', details: e?.message }, 500);
      }
    }

    // ─── PUBLISH (sube a Meta como status=PAUSED) ───
    if (action === 'publish') {
      if (!body.draft_id) return c.json({ error: 'publish requires draft_id' }, 400);
      const { data: draft } = await supabase
        .from('meta_campaign_drafts')
        .select('*')
        .eq('id', body.draft_id)
        .single();
      if (!draft) return c.json({ error: 'Draft not found' }, 404);
      const auth = await assertClientOwner(draft.client_id);
      if (!auth.ok) return c.json({ error: auth.error }, auth.status as any);
      if (draft.status === 'published') {
        return c.json({ error: 'Draft already published', meta_campaign_id: draft.meta_campaign_id }, 400);
      }

      // Llamamos internamente a manage-meta-campaign action=create con status=PAUSED
      const baseUrl = process.env.SELF_URL || 'https://steve-api-850416724643.us-central1.run.app';
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      const spec = (draft.spec || {}) as DraftSpec;

      // Map creative.type → manage-meta-campaign expected shape
      // IMPORTANTE: manage-meta-campaign espera { action, connection_id, data: {...} }
      // Todos los params de la campaña van DENTRO de `data`, no en top-level.
      const creative = spec.creative || {};
      const creativeType: string = creative.type || 'image';

      // Mapeo de objetivos legacy → ODAX (Meta Ads API 2023+).
      // Meta deprecó TRAFFIC, REACH, etc. en favor de los OUTCOME_*.
      const objectiveMap: Record<string, string> = {
        'CONVERSIONS': 'OUTCOME_SALES',
        'TRAFFIC': 'OUTCOME_TRAFFIC',
        'AWARENESS': 'OUTCOME_AWARENESS',
        'ENGAGEMENT': 'OUTCOME_ENGAGEMENT',
        'LEAD_GENERATION': 'OUTCOME_LEADS',
        'CATALOG': 'OUTCOME_SALES',  // CATALOG / DPA usa OUTCOME_SALES con product_catalog_id
        'APP_INSTALLS': 'OUTCOME_APP_PROMOTION',
      };
      const rawObj = (spec.objective || 'CONVERSIONS').toUpperCase();
      const mappedObjective = objectiveMap[rawObj] || rawObj;

      const innerData: any = {
        name: draft.name,
        objective: mappedObjective,
        // Budget: manage-meta-campaign espera daily_budget (en CLP * 100 microunits? o solo CLP int).
        // Pasamos como espera el shape del Wizard original — daily_budget en CLP.
        daily_budget: spec.budget?.type === 'daily' ? spec.budget?.amount_clp : undefined,
        lifetime_budget: spec.budget?.type === 'lifetime' ? spec.budget?.amount_clp : undefined,
        budget_type: spec.budget?.type,
        start_time: spec.schedule?.start,
        end_time: spec.schedule?.end,
        // Targeting / audience
        targeting: spec.audience ? {
          age_min: spec.audience.age_min,
          age_max: spec.audience.age_max,
          genders: spec.audience.gender === 'male' ? [1] : spec.audience.gender === 'female' ? [2] : undefined,
          geo_locations: spec.audience.geo ? { countries: spec.audience.geo.countries } : undefined,
          interests: spec.audience.interests,
          custom_audiences: spec.audience.custom_audiences,
          excluded_custom_audiences: spec.audience.exclusions?.custom_audiences,
        } : undefined,
        placements: spec.placements,
        adset_name: spec.adset_name,
        ad_name: spec.ad_name,
        // Status: queremos PAUSED para que el cliente apruebe en Meta
        initial_status: 'PAUSED',
        currency: 'CLP',
      };

      if (creativeType === 'image') {
        innerData.ad_set_format = 'single';
        innerData.headline = creative.headline;
        innerData.primary_text = creative.body;
        innerData.headlines = creative.headline ? [creative.headline] : undefined;
        innerData.texts = creative.body ? [creative.body] : undefined;
        innerData.cta = creative.cta || 'SHOP_NOW';
        innerData.destination_url = creative.destination_url;
        innerData.image_url = creative.image_url;
        innerData.image_urls = creative.image_url ? [creative.image_url] : undefined;
      } else if (creativeType === 'video') {
        innerData.ad_set_format = 'single';
        innerData.headline = creative.headline;
        innerData.primary_text = creative.body;
        innerData.cta = creative.cta || 'SHOP_NOW';
        innerData.destination_url = creative.destination_url;
        innerData.video_url = creative.video_url;
        innerData.thumbnail_url = creative.thumbnail_url;
      } else if (creativeType === 'dct') {
        innerData.ad_set_format = 'flexible';
        innerData.cta = creative.cta || 'SHOP_NOW';
        innerData.destination_url = creative.destination_url;
        const afs = creative.asset_feed_spec || {};
        innerData.image_urls = (afs.images || []).map((i: any) => i.url);
        innerData.headlines = (afs.titles || []).map((t: any) => t.text);
        innerData.descriptions = (afs.bodies || []).map((b: any) => b.text);
        innerData.texts = innerData.descriptions; // alias para variantes de body
      } else if (creativeType === 'carousel') {
        innerData.ad_set_format = 'carousel';
        innerData.cta = creative.cta || 'SHOP_NOW';
        innerData.primary_text = creative.primary_text;
        innerData.cards = creative.cards;
      } else if (creativeType === 'catalog') {
        innerData.objective = 'OUTCOME_SALES';
        innerData.product_catalog_id = creative.product_catalog_id;
        innerData.product_set_id = creative.product_set_id;
        innerData.primary_text = creative.primary_text;
        innerData.cta = creative.cta || 'SHOP_NOW';
      } else {
        // Unknown type — pass creative as-is
        Object.assign(innerData, creative);
      }

      const createBody: any = {
        action: 'create',
        connection_id: draft.connection_id,
        data: innerData,
      };

      try {
        const res = await fetch(`${baseUrl}/api/manage-meta-campaign`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
            'X-Internal-Key': serviceKey,
          },
          body: JSON.stringify(createBody),
          signal: AbortSignal.timeout(60_000),
        });
        const respBody: any = await res.json().catch(() => ({}));
        if (!res.ok || !respBody?.success) {
          // Concatenar error + details para no perder el error real de Meta API
          const errParts: string[] = [];
          if (respBody?.error) errParts.push(String(respBody.error));
          if (respBody?.details) errParts.push(String(respBody.details));
          const errDetails = errParts.join(' — ') || `HTTP ${res.status}`;
          console.error('[meta-draft] Publish failed. Full response:', JSON.stringify(respBody).slice(0, 500));
          // Mejorar mensajes para errores comunes
          let userFacingMessage = errDetails;
          if (typeof errDetails === 'string' && /invalid token|expired|access[_ ]token/i.test(errDetails)) {
            userFacingMessage = 'El token de tu cuenta Meta no es válido o expiró. Reconectá tu cuenta de Meta desde Conexiones para volver a publicar campañas.';
          } else if (typeof errDetails === 'string' && /permission|scope/i.test(errDetails)) {
            userFacingMessage = 'Falta un permiso de Meta para crear campañas. Reconectá tu cuenta otorgando todos los permisos solicitados.';
          }
          return c.json({ error: 'Failed to publish to Meta', details: userFacingMessage, raw: errDetails }, 502);
        }

        const metaCampaignId = respBody.campaign_id || respBody.data?.campaign_id;
        const metaAdsetId = respBody.adset_id || respBody.data?.adset_id;
        const metaAdId = respBody.ad_id || respBody.data?.ad_id;

        const { error: upErr } = await supabase
          .from('meta_campaign_drafts')
          .update({
            status: 'published',
            meta_campaign_id: metaCampaignId || null,
            meta_adset_id: metaAdsetId || null,
            meta_ad_id: metaAdId || null,
            published_at: new Date().toISOString(),
          })
          .eq('id', body.draft_id);
        if (upErr) {
          console.error('[meta-draft] publish update error:', upErr);
        }

        return c.json({
          ok: true,
          meta_campaign_id: metaCampaignId,
          meta_adset_id: metaAdsetId,
          meta_ad_id: metaAdId,
          status_in_meta: 'PAUSED',
          message: 'Campaña creada en Meta como BORRADOR (PAUSED). Para activarla, usar action=resume en manage-meta-campaign.',
        });
      } catch (e: any) {
        return c.json({ error: 'Publish exception', details: e?.message?.slice(0, 200) }, 500);
      }
    }

    return c.json({ error: 'Unknown action' }, 400);
  } catch (err: any) {
    console.error('[meta-draft] Unhandled:', err);
    return c.json({ error: 'Internal error', details: err?.message?.slice(0, 200) }, 500);
  }
}
