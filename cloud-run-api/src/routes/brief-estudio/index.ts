/**
 * Brief Estudio — Etapa 1
 *
 * Endpoints REST para el estudio creativo. Unifica actores, voces, productos
 * destacados y preferencias musicales por cliente.
 *
 * Storage esperado (lazy — se crean al subir):
 *   - bucket `client-assets` → `brand-actors/{client_id}/*`
 *   - bucket `client-assets` → `brand-voices/{client_id}/*`
 *
 * Auth: authMiddleware (JWT Supabase o service role).
 *       Se valida además que el user es owner del client_id o super_admin.
 *
 * Tablas: brand_actors, brand_voices, brand_featured_products,
 *         brand_music_preferences, clients.studio_ready
 */

import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getUserClientIds } from '../../lib/user-scoping.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

// ----------------------------- Types -----------------------------------------

export interface BrandActor {
  id: string;
  client_id: string;
  source: 'ai_generated' | 'user_upload' | 'real_model';
  name: string | null;
  reference_images: string[];
  persona_tags: string[];
  is_primary: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface BrandVoice {
  id: string;
  client_id: string;
  source: 'xtts_cloned' | 'preset' | 'none';
  voice_id: string | null;
  sample_url: string | null;
  preset_key: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface BrandFeaturedProduct {
  id: string;
  client_id: string;
  shopify_product_id: string;
  is_featured: boolean;
  priority: number;
  created_at: string;
}

export interface BrandMusicPreferences {
  id: string;
  client_id: string;
  moods: string[];
  keywords: string | null;
  created_at: string;
  updated_at: string;
}

// Payload shapes for POST /save
interface ActorInput {
  id?: string;
  source: 'ai_generated' | 'user_upload' | 'real_model';
  name?: string | null;
  reference_images?: string[];
  persona_tags?: string[];
  is_primary?: boolean;
  sort_order?: number;
}

interface VoiceInput {
  source: 'xtts_cloned' | 'preset' | 'none';
  voice_id?: string | null;
  sample_url?: string | null;
  preset_key?: string | null;
  is_primary?: boolean;
}

interface MusicInput {
  moods?: string[];
  keywords?: string | null;
}

interface SavePayload {
  client_id: string;
  actors?: ActorInput[];
  voice?: VoiceInput;
  featured_product_ids?: string[];
  music?: MusicInput;
}

// ----------------------------- Helpers ---------------------------------------

async function assertClientAccess(
  c: Context,
  clientId: string,
): Promise<{ allowed: boolean; isSuperAdmin: boolean; userId: string | null }> {
  const user = c.get('user');
  if (!user) return { allowed: false, isSuperAdmin: false, userId: null };

  const supabase = getSupabaseAdmin();
  const { isSuperAdmin, clientIds } = await getUserClientIds(supabase, user.id);
  if (isSuperAdmin) return { allowed: true, isSuperAdmin: true, userId: user.id };
  return {
    allowed: clientIds.includes(clientId),
    isSuperAdmin: false,
    userId: user.id,
  };
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function sanitizeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isNonEmptyString);
}

/**
 * Criterio de completitud para `clients.studio_ready`:
 *   - al menos 1 actor
 *   - voice existente con source distinto de 'none'
 *   - al menos 1 featured product
 *   - music con al menos 1 mood
 */
function computeStudioReady(args: {
  actorCount: number;
  voice: { source: string } | null;
  featuredCount: number;
  moods: string[];
}): boolean {
  if (args.actorCount < 1) return false;
  if (!args.voice || args.voice.source === 'none') return false;
  if (args.featuredCount < 1) return false;
  if (!args.moods || args.moods.length < 1) return false;
  return true;
}

async function recomputeAndStoreStudioReady(clientId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const [{ count: actorCount }, { data: voiceRow }, { count: featuredCount }, { data: musicRow }] =
    await Promise.all([
      supabase
        .from('brand_actors')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId),
      supabase
        .from('brand_voices')
        .select('source')
        .eq('client_id', clientId)
        .order('is_primary', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('brand_featured_products')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('is_featured', true),
      supabase
        .from('brand_music_preferences')
        .select('moods')
        .eq('client_id', clientId)
        .maybeSingle(),
    ]);

  const ready = computeStudioReady({
    actorCount: actorCount ?? 0,
    voice: voiceRow ? { source: (voiceRow as { source: string }).source } : null,
    featuredCount: featuredCount ?? 0,
    moods: ((musicRow as { moods?: string[] } | null)?.moods ?? []) as string[],
  });

  const { error: updateErr } = await supabase
    .from('clients')
    .update({ studio_ready: ready })
    .eq('id', clientId);

  if (updateErr) {
    console.error('[brief-estudio] failed to update clients.studio_ready:', updateErr.message);
  }

  return ready;
}

// ----------------------------- Handlers --------------------------------------

/**
 * GET /api/brief-estudio/get?client_id={id}
 * Devuelve el estado completo del Brief Estudio de un cliente.
 */
export async function getBriefEstudio(c: Context) {
  try {
    const clientId = c.req.query('client_id');
    if (!isNonEmptyString(clientId)) {
      return c.json({ error: 'client_id is required' }, 400);
    }

    const access = await assertClientAccess(c, clientId);
    if (!access.userId) return c.json({ error: 'Unauthorized' }, 401);
    if (!access.allowed) return c.json({ error: 'Forbidden' }, 403);

    const supabase = getSupabaseAdmin();

    const [actorsRes, voicesRes, featuredRes, musicRes, clientRes] = await Promise.all([
      supabase
        .from('brand_actors')
        .select('*')
        .eq('client_id', clientId)
        .order('is_primary', { ascending: false })
        .order('sort_order', { ascending: true }),
      supabase
        .from('brand_voices')
        .select('*')
        .eq('client_id', clientId)
        .order('is_primary', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(1),
      supabase
        .from('brand_featured_products')
        .select('*')
        .eq('client_id', clientId)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('brand_music_preferences')
        .select('*')
        .eq('client_id', clientId)
        .maybeSingle(),
      supabase
        .from('clients')
        .select('studio_ready')
        .eq('id', clientId)
        .maybeSingle(),
    ]);

    if (actorsRes.error) return c.json({ error: actorsRes.error.message }, 500);
    if (voicesRes.error) return c.json({ error: voicesRes.error.message }, 500);
    if (featuredRes.error) return c.json({ error: featuredRes.error.message }, 500);
    if (musicRes.error) return c.json({ error: musicRes.error.message }, 500);
    if (clientRes.error) return c.json({ error: clientRes.error.message }, 500);

    const voice = (voicesRes.data as BrandVoice[] | null)?.[0] ?? null;
    const studioReady = Boolean(
      (clientRes.data as { studio_ready?: boolean } | null)?.studio_ready,
    );

    return c.json({
      actors: (actorsRes.data as BrandActor[] | null) ?? [],
      voice,
      featured_products: (featuredRes.data as BrandFeaturedProduct[] | null) ?? [],
      music: (musicRes.data as BrandMusicPreferences | null) ?? null,
      studio_ready: studioReady,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[brief-estudio][get] error:', message);
    return c.json({ error: message }, 500);
  }
}

/**
 * POST /api/brief-estudio/save
 * Upsert parcial. Solo toca las secciones que llegan en el body.
 * Recalcula clients.studio_ready al final.
 */
export async function saveBriefEstudio(c: Context) {
  try {
    const body = (await c.req.json()) as SavePayload;
    const { client_id: clientId } = body;
    if (!isNonEmptyString(clientId)) {
      return c.json({ error: 'client_id is required' }, 400);
    }

    const access = await assertClientAccess(c, clientId);
    if (!access.userId) return c.json({ error: 'Unauthorized' }, 401);
    if (!access.allowed) return c.json({ error: 'Forbidden' }, 403);

    const supabase = getSupabaseAdmin();

    // --- Actors: reemplazo total si llega el array (snapshot approach) ---
    if (Array.isArray(body.actors)) {
      const validSources = new Set(['ai_generated', 'user_upload', 'real_model']);
      for (const actor of body.actors) {
        if (!validSources.has(actor.source)) {
          return c.json({ error: `Invalid actor.source: ${actor.source}` }, 400);
        }
      }

      const { error: deleteErr } = await supabase
        .from('brand_actors')
        .delete()
        .eq('client_id', clientId);
      if (deleteErr) return c.json({ error: deleteErr.message }, 500);

      if (body.actors.length > 0) {
        const rows = body.actors.map((a, idx) => ({
          client_id: clientId,
          source: a.source,
          name: isNonEmptyString(a.name) ? a.name : null,
          reference_images: sanitizeStringArray(a.reference_images),
          persona_tags: sanitizeStringArray(a.persona_tags),
          is_primary: Boolean(a.is_primary),
          sort_order: typeof a.sort_order === 'number' ? a.sort_order : idx,
        }));
        const { error: insertErr } = await supabase.from('brand_actors').insert(rows);
        if (insertErr) return c.json({ error: insertErr.message }, 500);
      }
    }

    // --- Voice: 1 fila "primary" por cliente (reemplazo total) ---
    if (body.voice) {
      const validVoiceSources = new Set(['xtts_cloned', 'preset', 'none']);
      if (!validVoiceSources.has(body.voice.source)) {
        return c.json({ error: `Invalid voice.source: ${body.voice.source}` }, 400);
      }

      const { error: deleteVoiceErr } = await supabase
        .from('brand_voices')
        .delete()
        .eq('client_id', clientId);
      if (deleteVoiceErr) return c.json({ error: deleteVoiceErr.message }, 500);

      const { error: insertVoiceErr } = await supabase.from('brand_voices').insert({
        client_id: clientId,
        source: body.voice.source,
        voice_id: isNonEmptyString(body.voice.voice_id) ? body.voice.voice_id : null,
        sample_url: isNonEmptyString(body.voice.sample_url) ? body.voice.sample_url : null,
        preset_key: isNonEmptyString(body.voice.preset_key) ? body.voice.preset_key : null,
        is_primary: body.voice.is_primary ?? true,
      });
      if (insertVoiceErr) return c.json({ error: insertVoiceErr.message }, 500);
    }

    // --- Featured products: reemplazo total si llega la lista ---
    if (Array.isArray(body.featured_product_ids)) {
      const ids = body.featured_product_ids.filter(isNonEmptyString);

      const { error: deleteFeatErr } = await supabase
        .from('brand_featured_products')
        .delete()
        .eq('client_id', clientId);
      if (deleteFeatErr) return c.json({ error: deleteFeatErr.message }, 500);

      if (ids.length > 0) {
        // Validamos contra shopify_products del cliente — evita IDs inventados.
        const { data: validProducts, error: prodErr } = await supabase
          .from('shopify_products')
          .select('shopify_product_id')
          .eq('client_id', clientId)
          .in('shopify_product_id', ids);

        if (prodErr) return c.json({ error: prodErr.message }, 500);

        const validSet = new Set(
          (validProducts ?? []).map(
            (p: { shopify_product_id: string }) => p.shopify_product_id,
          ),
        );
        const validIds = ids.filter((id) => validSet.has(id));

        if (validIds.length > 0) {
          // Priority preserva el orden del input: el primero tiene mayor prioridad.
          const orderMap = new Map<string, number>();
          ids.forEach((id, idx) => {
            if (!orderMap.has(id)) orderMap.set(id, idx);
          });
          const rows = validIds.map((shopify_product_id) => ({
            client_id: clientId,
            shopify_product_id,
            is_featured: true,
            priority: ids.length - (orderMap.get(shopify_product_id) ?? 0),
          }));
          const { error: insertFeatErr } = await supabase
            .from('brand_featured_products')
            .insert(rows);
          if (insertFeatErr) return c.json({ error: insertFeatErr.message }, 500);
        }
      }
    }

    // --- Music: upsert 1:1 por cliente ---
    if (body.music) {
      const moods = sanitizeStringArray(body.music.moods);
      const keywords = isNonEmptyString(body.music.keywords) ? body.music.keywords : null;

      const { error: musicErr } = await supabase
        .from('brand_music_preferences')
        .upsert(
          {
            client_id: clientId,
            moods,
            keywords,
          },
          { onConflict: 'client_id' },
        );
      if (musicErr) return c.json({ error: musicErr.message }, 500);
    }

    const studioReady = await recomputeAndStoreStudioReady(clientId);
    return c.json({ ok: true, studio_ready: studioReady });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[brief-estudio][save] error:', message);
    return c.json({ error: message }, 500);
  }
}

/**
 * GET /api/brief-estudio/prefill-from-brief?client_id={id}
 * Lee brand_research + buyer_personas y devuelve sugerencias iniciales.
 * No persiste nada.
 */
export async function prefillBriefEstudioFromBrief(c: Context) {
  try {
    const clientId = c.req.query('client_id');
    if (!isNonEmptyString(clientId)) {
      return c.json({ error: 'client_id is required' }, 400);
    }

    const access = await assertClientAccess(c, clientId);
    if (!access.userId) return c.json({ error: 'Unauthorized' }, 401);
    if (!access.allowed) return c.json({ error: 'Forbidden' }, 403);

    const supabase = getSupabaseAdmin();

    const brief = await safeQuerySingleOrDefault<{ research_data: Record<string, unknown> | null }>(
      supabase
        .from('brand_research')
        .select('research_data')
        .eq('client_id', clientId)
        .eq('research_type', 'brand_brief')
        .maybeSingle(),
      null,
      'prefillBriefEstudio.brandResearch',
    );

    const persona = await safeQuerySingleOrDefault<{ persona_data: Record<string, unknown> | null }>(
      supabase
        .from('buyer_personas')
        .select('persona_data')
        .eq('client_id', clientId)
        .maybeSingle(),
      null,
      'prefillBriefEstudio.buyerPersona',
    );

    const personaTags = extractPersonaTags(persona?.persona_data, brief?.research_data);
    const voiceTone = extractVoiceTone(brief?.research_data);
    const musicMoods = extractMusicMoods(brief?.research_data, voiceTone);

    return c.json({
      suggested_persona_tags: personaTags,
      suggested_voice_tone: voiceTone,
      suggested_music_moods: musicMoods,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[brief-estudio][prefill] error:', message);
    return c.json({ error: message }, 500);
  }
}

// ----------------------------- Heuristics ------------------------------------

type VoiceTone = 'warm' | 'energetic' | 'neutral' | 'luxury';

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null;
}

function pickField(data: unknown, keys: string[]): string | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  for (const key of keys) {
    const val = asString(obj[key]);
    if (val) return val;
  }
  return null;
}

function extractPersonaTags(
  personaData: Record<string, unknown> | null | undefined,
  briefData: Record<string, unknown> | null | undefined,
): string[] {
  const tags: string[] = [];

  const age =
    pickField(personaData, ['age', 'edad', 'age_range', 'rango_edad']) ||
    pickField(briefData, ['target_age', 'edad_objetivo']);
  if (age) tags.push(`edad:${age}`);

  const gender =
    pickField(personaData, ['gender', 'genero', 'sex']) ||
    pickField(briefData, ['target_gender', 'genero_objetivo']);
  if (gender) tags.push(`genero:${gender}`);

  const style =
    pickField(personaData, ['style', 'estilo', 'aesthetic']) ||
    pickField(briefData, ['style', 'estilo_marca']);
  if (style) tags.push(`estilo:${style}`);

  const country =
    pickField(personaData, ['country', 'pais', 'location', 'ubicacion']) ||
    pickField(briefData, ['country', 'pais']);
  if (country) tags.push(`pais:${country}`);

  const income =
    pickField(personaData, ['income', 'ingresos', 'economic_level', 'nse']) ||
    pickField(briefData, ['target_nse']);
  if (income) tags.push(`nse:${income}`);

  return tags;
}

function extractVoiceTone(
  briefData: Record<string, unknown> | null | undefined,
): VoiceTone {
  const raw = (
    pickField(briefData, ['brand_tone', 'tono_marca', 'tone', 'tono']) ?? ''
  ).toLowerCase();

  if (!raw) return 'neutral';

  if (/(luj|premium|elegant|alto estándar|aspirac)/.test(raw)) return 'luxury';
  if (/(energ|vibran|diverti|juven|fresc|dinám)/.test(raw)) return 'energetic';
  if (/(cálid|warm|cerca|amig|familiar|humano|emocional)/.test(raw)) return 'warm';
  return 'neutral';
}

function extractMusicMoods(
  briefData: Record<string, unknown> | null | undefined,
  tone: VoiceTone,
): string[] {
  const briefMoods = pickField(briefData, ['music_moods', 'vibe_musical', 'music_vibe']);
  if (briefMoods) {
    return briefMoods
      .split(/[,;|]/g)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 4);
  }

  switch (tone) {
    case 'luxury':
      return ['cinematic', 'elegant'];
    case 'energetic':
      return ['energetic', 'upbeat'];
    case 'warm':
      return ['warm', 'emotional'];
    default:
      return ['neutral', 'modern'];
  }
}
