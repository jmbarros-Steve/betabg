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
import { runReplicatePrediction, ReplicateError } from '../../lib/replicate.js';
import { syncClientShopifyProducts } from '../cron/sync-shopify-products.js';
import { anthropicFetch } from '../../lib/anthropic-fetch.js';
import {
  MUSIC_LIBRARY_SEED,
  MOOD_LABELS_ES,
  type MusicMood,
} from '../../lib/music-library.js';

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

export async function assertClientAccess(
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

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function sanitizeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isNonEmptyString);
}

/**
 * Criterio de completitud para `clients.studio_ready`:
 *   - al menos 1 actor
 *   - voice configurada (source='none' cuenta — elección explícita del cliente)
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
  if (!args.voice) return false;
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
      // Truncar a 2000 chars para evitar que un cliente pueda guardar 10MB de
      // texto libre y saturar la tabla. El CHECK constraint en DB también lo
      // bloquea, pero truncamos silenciosamente en vez de devolver error.
      const keywordsRaw = isNonEmptyString(body.music.keywords) ? body.music.keywords.slice(0, 2000).trim() : '';
      const keywords = keywordsRaw.length > 0 ? keywordsRaw : null;

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

export type VoiceTone = 'warm' | 'energetic' | 'neutral' | 'luxury';

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

export function extractVoiceTone(
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

// ============================================================================
// Etapa 2 — Replicate Flux (actores) + XTTS-v2 (voz)
// ============================================================================

// Replicate models. Kept as constants so they are easy to bump when we upgrade.
const FLUX_ACTORS_MODEL = 'black-forest-labs/flux-1.1-pro-ultra';
// XTTS-v2 hosted on Replicate by @lucataco — voice cloning from a single sample.
// Es community model → requiere version hash explícito (sin él, /v1/models/.../
// predictions devuelve HTTP 404 igual que MusicGen y Kling). Pineamos la versión
// estable conocida; si Replicate la deprecara, actualizar acá.
export const XTTS_V2_MODEL = 'lucataco/xtts-v2';
export const XTTS_V2_VERSION = '684bc3855b37866c0c65add2ff39c78f3dea3f4ff103a436465326e0f438d55e';

// Costs. 1 credit = $0.01 for simplicity.
const FLUX_USD_PER_IMAGE = 0.06;
const FLUX_CREDITS_PER_IMAGE = Math.round(FLUX_USD_PER_IMAGE * 100);
const XTTS_USD_PER_GENERATION = 0.003;
const XTTS_CREDITS_PER_GENERATION = Math.max(1, Math.round(XTTS_USD_PER_GENERATION * 100));

// Rate limit — 10 calls/hour per client_id for the heavy AI endpoints.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_PER_WINDOW = 10;

type Endpoint = 'generate-actors' | 'clone-voice';

async function checkBriefEstudioRateLimit(
  clientId: string,
  endpoint: Endpoint,
): Promise<{ allowed: true } | { allowed: false; retryAfterMin: number }> {
  const supabase = getSupabaseAdmin();
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from('brief_estudio_ai_usage')
    .select('created_at')
    .eq('client_id', clientId)
    .eq('endpoint', endpoint)
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  if (error) {
    // Fail open — don't block legitimate users because the log table has an issue.
    console.error('[brief-estudio][rate-limit] query failed, allowing:', error.message);
    return { allowed: true };
  }

  const rows = (data ?? []) as Array<{ created_at: string }>;
  if (rows.length < RATE_LIMIT_MAX_PER_WINDOW) return { allowed: true };

  const oldest = new Date(rows[0].created_at).getTime();
  const retryAfterMs = oldest + RATE_LIMIT_WINDOW_MS - Date.now();
  return {
    allowed: false,
    retryAfterMin: Math.max(1, Math.ceil(retryAfterMs / 60_000)),
  };
}

async function logAiUsage(
  clientId: string,
  endpoint: Endpoint,
  costCredits: number,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('brief_estudio_ai_usage').insert({
    client_id: clientId,
    endpoint,
    cost_credits: costCredits,
  });
  if (error) {
    // Non-fatal — usage logging is best-effort.
    console.error('[brief-estudio][rate-limit] usage insert failed:', error.message);
  }
}

/**
 * Download a URL to Uint8Array with a sensible timeout. Returns null on failure.
 */
export async function downloadToBytes(url: string, timeoutMs = 30_000): Promise<Uint8Array | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
    if (!resp.ok) {
      console.warn(`[brief-estudio] download failed ${resp.status} ${url.slice(0, 80)}`);
      return null;
    }
    const buf = await resp.arrayBuffer();
    return new Uint8Array(buf);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[brief-estudio] download error:', message);
    return null;
  }
}

/**
 * Upload bytes to Supabase Storage (bucket `client-assets`) and return the
 * public URL. Throws on failure.
 */
export async function uploadToClientAssets(
  storagePath: string,
  bytes: Uint8Array,
  contentType: string,
  upsert = false,
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { error: upErr } = await supabase.storage
    .from('client-assets')
    .upload(storagePath, bytes, { contentType, upsert });
  if (upErr) throw new Error(`storage upload failed: ${upErr.message}`);
  const { data } = supabase.storage.from('client-assets').getPublicUrl(storagePath);
  return data.publicUrl;
}

// ---- Prompt construction for Flux actor generation --------------------------

interface PersonaContext {
  age: string | null;
  gender: string | null;
  country: string | null;
  lifestyle: string | null;
  tone: string | null;
  brandName: string | null;
  brandCategory: string | null;
  brandAesthetic: string | null;
  tags: string[];
}

/**
 * Extrae un campo de un texto libre buscando "Clave: Valor\n". Case-insensitive.
 * Devuelve el primer match que aparezca. Útil para parsear `raw_responses` del
 * brief que viene en formato "👤 Nombre ficticio: Francisca\n🎂 Edad: 35\n...".
 */
function matchFieldInText(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(`${label}\\s*:\\s*([^\\n\\r]+)`, 'i');
    const m = text.match(re);
    if (m && m[1]) {
      const val = m[1].trim();
      if (val && val.length < 200) return val;
    }
  }
  return null;
}

/**
 * Concatena todos los raw_responses de persona_data a un solo string para
 * que matchFieldInText pueda escanearlo.
 */
function personaRawText(personaData: Record<string, unknown> | null | undefined): string {
  if (!personaData) return '';
  const raw = (personaData as { raw_responses?: unknown }).raw_responses;
  if (!Array.isArray(raw)) return '';
  return raw.filter((s): s is string => typeof s === 'string').join('\n');
}

/**
 * Normaliza un género crudo del brief (puede venir como "Mujer", "Hombre",
 * "Femenino", "Masculino", "Female", "Male", "Unisex", etc.) a inglés simple
 * para el prompt de Flux: "woman" | "man" | "person" (fallback neutral).
 */
function normalizeGender(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.toLowerCase().trim();
  if (/^(mujer|femenino|female|woman|f)\b/.test(v)) return 'woman';
  if (/^(hombre|masculino|male|man|m)\b/.test(v)) return 'man';
  if (/^(unisex|ambos|cualquier)/.test(v)) return 'person';
  return null;
}

/**
 * Extrae país de un string tipo "Chile", "Puerto Varas, Chile", "Santiago, Chile".
 * Prioriza "Chile" / "Argentina" / etc. sobre nombres de ciudad.
 */
function normalizeCountry(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim();
  const countries = ['Chile', 'Argentina', 'México', 'Mexico', 'Colombia', 'Perú', 'Peru', 'Uruguay', 'Brasil', 'Brazil', 'España', 'Spain'];
  for (const c of countries) {
    if (new RegExp(`\\b${c}\\b`, 'i').test(v)) return c;
  }
  // Si no detectamos país conocido, devolvemos "Latin American" salvo que venga un valor útil.
  if (v.length > 3 && v.length < 80) return v;
  return null;
}

/**
 * Lee la primera fila de brand_research que calce (filtro por types o cualquier).
 */
function findResearch(
  allResearch: Array<{ research_type: string; research_data: Record<string, unknown> | null }>,
  types: string[],
): Record<string, unknown> | null {
  for (const t of types) {
    const row = allResearch.find((r) => r.research_type === t);
    if (row?.research_data) return row.research_data;
  }
  return null;
}

function extractPersonaContext(
  personaData: Record<string, unknown> | null | undefined,
  allResearch: Array<{ research_type: string; research_data: Record<string, unknown> | null }>,
): PersonaContext {
  const brief = findResearch(allResearch, ['brand_brief']);
  const summary = findResearch(allResearch, ['executive_summary', 'brand_strategy', 'analysis_progress']);
  const personaText = personaRawText(personaData);
  const summaryText = summary ? JSON.stringify(summary).slice(0, 8000) : '';

  // Age — prueba fields estructurados, fallback a regex sobre raw_responses.
  const age =
    pickField(personaData, ['age', 'edad', 'age_range', 'rango_edad']) ||
    pickField(brief, ['target_age', 'edad_objetivo']) ||
    matchFieldInText(personaText, ['Edad', 'Age']);

  // Gender — idem.
  const genderRaw =
    pickField(personaData, ['gender', 'genero', 'sex']) ||
    pickField(brief, ['target_gender', 'genero_objetivo']) ||
    matchFieldInText(personaText, ['Género', 'Genero', 'Gender', 'Sexo']);
  const gender = normalizeGender(genderRaw);

  // Country/location.
  const countryRaw =
    pickField(personaData, ['country', 'pais', 'location', 'ubicacion']) ||
    pickField(brief, ['country', 'pais']) ||
    matchFieldInText(personaText, ['País', 'Pais', 'Country', 'Ciudad', 'Zona', 'Location', 'Ubicación']);
  const country = normalizeCountry(countryRaw);

  // Lifestyle / ocupación.
  const lifestyle =
    pickField(personaData, ['lifestyle', 'estilo_vida', 'ocupacion', 'occupation']) ||
    pickField(brief, ['lifestyle', 'estilo_vida']) ||
    matchFieldInText(personaText, ['Ocupación', 'Ocupacion', 'Occupation', 'Lifestyle', 'Estilo de vida']);

  const tone =
    pickField(brief, ['brand_tone', 'tono_marca', 'tone', 'tono']) ||
    pickField(personaData, ['tone', 'tono']);

  // Brand context — del executive_summary o brand_brief.
  const brandName =
    pickField(brief, ['brand_name', 'nombre_marca', 'business_name']) ||
    matchFieldInText(summaryText, ['brand_name', 'nombre de la marca', 'marca']) ||
    matchFieldInText(personaText, ['URL de tu sitio web', 'sitio web']);

  const brandCategory =
    pickField(brief, ['business_category', 'category', 'product_category']) ||
    matchFieldInText(summaryText, ['categoria', 'categoría', 'product_category', 'business_category']);

  // Estética / descripción visual — a menudo es narrative, tomamos un snippet.
  const brandAesthetic =
    pickField(brief, ['brand_aesthetic', 'aesthetic', 'estetica', 'brand_style']) ||
    (summaryText.length > 0 ? extractAestheticSnippet(summaryText) : null);

  return {
    age,
    gender,
    country,
    lifestyle,
    tone,
    brandName,
    brandCategory,
    brandAesthetic,
    tags: extractPersonaTags(personaData, brief),
  };
}

/**
 * De un JSON stringifica'o del executive_summary, extrae 150-300 chars que
 * describan visualmente la marca (producto, estética, patrimonio cultural).
 * No es perfecto pero suficiente para dar contexto a Flux.
 */
function extractAestheticSnippet(text: string): string | null {
  // Busca descripciones típicas del brand.
  const patterns = [
    /descripcion["'\s:]+([^"]{80,400})/i,
    /producto["'\s:]+([^"]{60,300})/i,
    /estetica["'\s:]+([^"]{40,300})/i,
    /patrimonio[^"]{20,300}/i,
    /inspirad[ao][^"]{20,250}/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return (m[1] || m[0]).replace(/[\\n"]+/g, ' ').trim().slice(0, 300);
  }
  return null;
}

type ActorVariant = 'actor_safe' | 'actor_casual' | 'actor_editorial';

interface SceneSet {
  safe: string;
  casual: string;
  editorial: string;
}

/**
 * Usa Claude Haiku para traducir el contexto crudo del brief al inglés y
 * generar 3 descripciones de escena específicas al universo de la marca.
 * Esto evita los prompts genéricos de "urban café" cuando la marca es, por
 * ejemplo, cerámica artesanal del sur de Chile o ropa fitness.
 *
 * Devuelve null si falla (Claude caído, API key ausente, JSON inválido) —
 * el caller debe hacer fallback a los prompts legacy.
 */
async function buildSmartActorContext(
  personaData: Record<string, unknown> | null | undefined,
  allResearch: Array<{ research_type: string; research_data: Record<string, unknown> | null }>,
): Promise<{
  persona: { age: string; gender: 'woman' | 'man' | 'person'; country: string; lifestyle: string };
  brand: { name: string; category: string; aestheticKeywords: string };
  scenes: SceneSet;
} | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[brief-estudio][smart-ctx] ANTHROPIC_API_KEY missing, fallback to regex');
    return null;
  }

  const personaBlob = personaData ? JSON.stringify(personaData).slice(0, 4000) : '(vacío)';
  const researchBlob = allResearch
    .map((r) => `[${r.research_type}] ${r.research_data ? JSON.stringify(r.research_data).slice(0, 3000) : ''}`)
    .join('\n\n')
    .slice(0, 9000);

  const systemPrompt = `You are a senior Meta Ads creative director. Given a client's buyer persona and brand research, output a JSON describing the target customer AND three BACKGROUND / ATMOSPHERIC ENVIRONMENTS for portrait photos of a human actor. All output in ENGLISH.

CRITICAL RULES:
1. The output images WILL BE HUMAN PORTRAIT PHOTOS (one person in frame, chest-up). Your "scenes" describe only the BACKGROUND / AMBIENT SETTING that appears softly blurred behind the actor. Not a full scene. Not a still life. Not a tablescape. Not a product shot.
2. Each "scene" is 20-50 words describing: location type, lighting quality, wall/surface textures, atmospheric props visible in the out-of-focus background. Examples of GOOD scenes: "artisan pottery workshop background with soft wooden shelves, hanging natural fibers, warm window light". Examples of BAD scenes (NEVER output these): "a table full of ceramics", "stoneware dishes on a linen cloth", "product display".
3. Scenes MUST match the brand's real world. Ceramics artisanal from southern Chile → workshop, rustic kitchen, forest. Streetwear → urban street. Fitness → gym. Luxury → minimalist studio. NEVER default to "city café" unless the brand is truly urban.
4. Do NOT describe the person. Do NOT describe products as the subject — products may appear small and incidental in the background but are NOT the focus.
5. Translate all persona/brand fields to English. Examples: "Dueña de casa" → "homemaker", "cerámica gres artesanal" → "handcrafted stoneware ceramics".

Output STRICTLY this JSON shape with NO markdown fences, NO prose before or after:
{"persona":{"age":"","gender":"woman|man|person","country":"","lifestyle":""},"brand":{"name":"","category":"","aestheticKeywords":""},"scenes":{"safe":"","casual":"","editorial":""}}`;

  const userPrompt = `BUYER PERSONA (raw from brief):
${personaBlob}

BRAND RESEARCH (multiple types concatenated):
${researchBlob}

Return the JSON now.`;

  try {
    const res = await anthropicFetch(
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1400,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      },
      apiKey,
      { timeoutMs: 20_000 },
    );
    if (!res.ok) {
      console.warn('[brief-estudio][smart-ctx] claude not ok:', res.status);
      return null;
    }
    const text = (res.data?.content?.[0]?.text || '').trim();
    if (!text) return null;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[brief-estudio][smart-ctx] no JSON in claude response');
      return null;
    }
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed?.persona || !parsed?.brand || !parsed?.scenes) return null;
    if (!parsed.scenes.safe || !parsed.scenes.casual || !parsed.scenes.editorial) return null;
    return parsed;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[brief-estudio][smart-ctx] failed:', msg);
    return null;
  }
}

function buildActorPrompt(variant: ActorVariant, p: PersonaContext, scenes?: SceneSet | null): string {
  // Demo básico del target customer (en inglés si smart-ctx corrió, crudo si no).
  const gender = p.gender || 'person';
  const age = p.age ? `${p.age}-year-old` : 'adult';
  const country = p.country ? `from ${p.country}` : 'Latin American';
  const lifestyle = p.lifestyle ? `, ${p.lifestyle}` : '';

  // Contexto de marca (prosa corta que acompaña al sujeto).
  const brandBits: string[] = [];
  if (p.brandName) brandBits.push(`target customer of the brand "${p.brandName}"`);
  if (p.brandCategory) brandBits.push(`which sells ${p.brandCategory}`);
  const brandContext = brandBits.length > 0 ? ` (${brandBits.join(', ')})` : '';

  // Ambiente — si la IA lo generó, se convierte en BACKGROUND del retrato.
  // CRÍTICO: el retrato de la persona es el sujeto. La escena es fondo/atmósfera.
  let environment: string;
  if (scenes) {
    const sceneText =
      variant === 'actor_safe'
        ? scenes.safe
        : variant === 'actor_casual'
          ? scenes.casual
          : scenes.editorial;
    environment = sceneText.replace(/["\\\n\r]+/g, ' ').slice(0, 350);
  } else {
    environment =
      variant === 'actor_safe'
        ? 'neutral studio background, soft even lighting (softbox)'
        : variant === 'actor_casual'
          ? 'everyday setting matching the brand\'s world, natural daylight, candid mood'
          : 'aspirational setting matching the brand\'s aesthetic, cinematic lighting';
  }

  // Framing + expresión varían por variante.
  const framingAndExpression =
    variant === 'actor_safe'
      ? 'Medium close-up casting headshot, subject centered and filling the frame from the chest up, looking directly at the camera with a warm confident expression. Classic professional casting photo composition.'
      : variant === 'actor_casual'
        ? 'Waist-up or three-quarter shot, subject clearly the main focus and filling most of the frame, candid natural expression, captured in a real moment. Documentary photography style.'
        : 'Waist-up editorial portrait, subject dominant in the frame, confident posture with slight motion, magazine-cover quality composition.';

  const wardrobe =
    variant === 'actor_safe'
      ? 'Wardrobe: clean, minimal, true to the brand identity.'
      : variant === 'actor_casual'
        ? 'Wardrobe: authentic everyday clothing aligned with the brand world.'
        : 'Wardrobe: styled but accessible, reflecting the brand aesthetic.';

  // Construcción: el retrato de LA PERSONA primero y claro. La escena después, como background.
  // Cerramos con reglas absolutas para que Flux no genere solo producto/bodegón.
  const realism = `Ultra-realistic portrait photograph, real human, natural skin texture with pores and subtle imperfections, genuine expression, sharp focus on the face, shallow depth of field with background softly blurred. No illustrations, no 3D renders, no AI artifacts, no plastic skin, no airbrushing. Vertical portrait framing (3:4).`;

  const hardRules = `ABSOLUTE REQUIREMENTS: the image MUST show exactly one real human person as the main subject, visible from the chest up or waist up, face clearly visible and in focus. The person is the protagonist — NOT the product, NOT the setting, NOT a still life. No empty rooms, no product-only shots, no tablescapes without a person. Single person, no logos, no text on image.`;

  return `PORTRAIT PHOTOGRAPHY. Subject: a ${age} ${gender} ${country}${lifestyle}${brandContext}. ${framingAndExpression} ${wardrobe} Background / setting: ${environment}. ${realism} ${hardRules}`;
}

// ----------------------------- Handlers --------------------------------------

/**
 * POST /api/brief-estudio/generate-actors
 * Body: { client_id: string, regenerate?: boolean }
 *
 * Generates 3 Flux actor photos matching the client's buyer persona. If
 * actors already exist and regenerate=false, returns the cached set to avoid
 * spending credits on reloads.
 */
export async function generateActors(c: Context) {
  let clientId: string | undefined;
  try {
    const body = (await c.req.json().catch(() => ({}))) as {
      client_id?: string;
      regenerate?: boolean;
    };
    clientId = body.client_id;
    const regenerate = Boolean(body.regenerate);

    if (!isNonEmptyString(clientId)) {
      return c.json({ error: 'client_id is required' }, 400);
    }

    const access = await assertClientAccess(c, clientId);
    if (!access.userId) return c.json({ error: 'Unauthorized' }, 401);
    if (!access.allowed) return c.json({ error: 'Forbidden' }, 403);

    const supabase = getSupabaseAdmin();

    // If not regenerating, short-circuit with cached actors.
    if (!regenerate) {
      const { data: cached, error: cacheErr } = await supabase
        .from('brand_actors')
        .select('*')
        .eq('client_id', clientId)
        .eq('source', 'ai_generated')
        .order('is_primary', { ascending: false })
        .order('sort_order', { ascending: true });
      if (cacheErr) return c.json({ error: cacheErr.message }, 500);
      if (cached && cached.length > 0) {
        return c.json({
          actors: cached as BrandActor[],
          cost_credits: 0,
          cached: true,
        });
      }
    }

    // Require a buyer persona to prompt Flux intelligently.
    const persona = await safeQuerySingleOrDefault<{ persona_data: Record<string, unknown> | null }>(
      supabase
        .from('buyer_personas')
        .select('persona_data')
        .eq('client_id', clientId)
        .maybeSingle(),
      null,
      'generateActors.buyerPersona',
    );
    if (!persona?.persona_data) {
      return c.json({ error: 'Primero completa tu brief' }, 400);
    }

    // Rate limit.
    const rl = await checkBriefEstudioRateLimit(clientId, 'generate-actors');
    if (!rl.allowed) {
      return c.json(
        {
          error: `Rate limit exceeded. Try again in ${rl.retryAfterMin} minutes`,
          retry_after_minutes: rl.retryAfterMin,
        },
        429,
      );
    }

    // Leer TODOS los research_types del cliente (brand_brief, executive_summary,
    // brand_strategy, etc.). Algunos proyectos tienen la data distribuida en
    // múltiples rows — concatenamos todo para enriquecer el prompt.
    const { data: allResearch } = await supabase
      .from('brand_research')
      .select('research_type,research_data')
      .eq('client_id', clientId);

    // Intentamos construir contexto enriquecido con Claude (traduce al inglés
    // y genera 3 escenas específicas del mundo de la marca). Si Claude cae,
    // usamos el extractor por regex como fallback.
    const smartCtx = await buildSmartActorContext(persona.persona_data, allResearch ?? []);
    const personaCtx: PersonaContext = smartCtx
      ? {
          age: smartCtx.persona.age || null,
          gender: smartCtx.persona.gender || null,
          country: smartCtx.persona.country || null,
          lifestyle: smartCtx.persona.lifestyle || null,
          tone: null,
          brandName: smartCtx.brand.name || null,
          brandCategory: smartCtx.brand.category || null,
          brandAesthetic: smartCtx.brand.aestheticKeywords || null,
          tags: extractPersonaTags(persona.persona_data, findResearch(allResearch ?? [], ['brand_brief'])),
        }
      : extractPersonaContext(persona.persona_data, allResearch ?? []);

    if (!smartCtx) {
      console.warn('[brief-estudio][generate-actors] smart context unavailable, using regex fallback');
    }

    const variants: ActorVariant[] = ['actor_safe', 'actor_casual', 'actor_editorial'];
    const prompts = variants.map((v) => ({
      variant: v,
      prompt: buildActorPrompt(v, personaCtx, smartCtx?.scenes ?? null),
    }));

    // Fire 3 Flux predictions in parallel.
    const predictions = await Promise.allSettled(
      prompts.map((p) =>
        runReplicatePrediction<Record<string, unknown>, string | string[]>({
          model: FLUX_ACTORS_MODEL,
          input: {
            prompt: p.prompt,
            aspect_ratio: '3:4',
            output_format: 'jpg',
            safety_tolerance: 2,
          },
          timeoutMs: 120_000,
          preferWaitSeconds: 55,
        }),
      ),
    );

    const successfulOutputs: Array<{ variant: ActorVariant; url: string }> = [];
    const failures: Array<{ variant: ActorVariant; reason: string }> = [];
    predictions.forEach((res, idx) => {
      const variant = prompts[idx].variant;
      if (res.status === 'fulfilled') {
        const out = res.value;
        const url = Array.isArray(out) ? out[0] : typeof out === 'string' ? out : null;
        if (url) successfulOutputs.push({ variant, url });
        else failures.push({ variant, reason: 'no output url' });
      } else {
        const err = res.reason;
        const msg = err instanceof ReplicateError ? err.message : err?.message || 'unknown';
        failures.push({ variant, reason: msg });
      }
    });

    if (successfulOutputs.length === 0) {
      console.error('[brief-estudio][generate-actors] all Flux predictions failed:', failures);
      return c.json(
        {
          error: 'No se pudo generar ningún actor',
          details: failures.map((f) => `${f.variant}: ${f.reason}`).join('; ').slice(0, 400),
        },
        502,
      );
    }

    // Download + upload each successful image to Supabase Storage.
    const uploaded: Array<{ variant: ActorVariant; publicUrl: string }> = [];
    for (const out of successfulOutputs) {
      const bytes = await downloadToBytes(out.url);
      if (!bytes) {
        failures.push({ variant: out.variant, reason: 'download failed' });
        continue;
      }
      const uuid = crypto.randomUUID();
      const path = `brand-actors/${clientId}/${uuid}.jpg`;
      try {
        const publicUrl = await uploadToClientAssets(path, bytes, 'image/jpeg', false);
        uploaded.push({ variant: out.variant, publicUrl });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'storage error';
        failures.push({ variant: out.variant, reason: message });
      }
    }

    if (uploaded.length === 0) {
      return c.json({ error: 'No se pudo persistir ningún actor generado' }, 502);
    }

    // If regenerating, drop the previous ai_generated set first.
    if (regenerate) {
      const { error: delErr } = await supabase
        .from('brand_actors')
        .delete()
        .eq('client_id', clientId)
        .eq('source', 'ai_generated');
      if (delErr) {
        console.error('[brief-estudio][generate-actors] delete previous failed:', delErr.message);
      }
    }

    // Insert new rows. Order matches `variants` so safe is always first.
    const variantOrder: Record<ActorVariant, number> = {
      actor_safe: 0,
      actor_casual: 1,
      actor_editorial: 2,
    };
    // Preserve the original sort order based on variant, not on upload order.
    uploaded.sort((a, b) => variantOrder[a.variant] - variantOrder[b.variant]);

    const rows = uploaded.map((u, idx) => ({
      client_id: clientId!,
      source: 'ai_generated' as const,
      name: u.variant,
      reference_images: [u.publicUrl],
      persona_tags: personaCtx.tags,
      is_primary: idx === 0,
      sort_order: variantOrder[u.variant],
    }));

    const { data: inserted, error: insertErr } = await supabase
      .from('brand_actors')
      .insert(rows)
      .select('*');
    if (insertErr) return c.json({ error: insertErr.message }, 500);

    // Log usage (per image generated — we only charge for successful ones).
    const totalCredits = uploaded.length * FLUX_CREDITS_PER_IMAGE;
    await logAiUsage(clientId, 'generate-actors', totalCredits);

    return c.json({
      actors: (inserted as BrandActor[] | null) ?? [],
      cost_credits: totalCredits,
      cached: false,
      failures: failures.length > 0 ? failures : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[brief-estudio][generate-actors] error:', message);
    return c.json({ error: message }, 500);
  }
}

// ---- Voice presets ----------------------------------------------------------

/**
 * Voice presets for the suggest-voice endpoint. These are static MP3 samples
 * that should live in `client-assets/voice-presets/{preset_key}.mp3`.
 *
 * TODO (manual, one-time): generate the 4 preset samples by running a short
 * Spanish phrase through XTTS-v2 with 4 public reference voices (masculine
 * premium, feminine warm, masculine energetic, feminine neutral) and upload
 * the MP3s to the bucket at the paths below. Until then, `sample_url` points
 * to placeholder paths and the frontend will render as "sample unavailable".
 */
export const VOICE_PRESETS: Record<
  string,
  { description: string; storagePath: string }
> = {
  masculine_premium: {
    description: 'Voz masculina grave, calmada y profesional. Ideal para lujo y autoridad.',
    storagePath: 'voice-presets/masculine_premium.mp3',
  },
  feminine_warm: {
    description: 'Voz femenina cálida y cercana. Transmite cercanía y confianza.',
    storagePath: 'voice-presets/feminine_warm.mp3',
  },
  masculine_energetic: {
    description: 'Voz masculina joven y enérgica. Ideal para marcas dinámicas o juveniles.',
    storagePath: 'voice-presets/masculine_energetic.mp3',
  },
  feminine_neutral: {
    description: 'Voz femenina neutra y versátil. Funciona para casi cualquier marca.',
    storagePath: 'voice-presets/feminine_neutral.mp3',
  },
};

function toneToPresetPrimary(tone: VoiceTone): string {
  switch (tone) {
    case 'luxury':
      return 'masculine_premium';
    case 'warm':
      return 'feminine_warm';
    case 'energetic':
      return 'masculine_energetic';
    case 'neutral':
    default:
      return 'feminine_neutral';
  }
}

function toneToPresetSecondary(tone: VoiceTone): string {
  // Always suggest a contrast so the user has a second option.
  switch (tone) {
    case 'luxury':
      return 'feminine_warm';
    case 'warm':
      return 'masculine_premium';
    case 'energetic':
      return 'feminine_neutral';
    case 'neutral':
    default:
      return 'masculine_energetic';
  }
}

/**
 * POST /api/brief-estudio/suggest-voice
 * Body: { client_id: string }
 *
 * Reads the brand brief tone and returns 2 preset voice suggestions with
 * pre-generated MP3 samples hosted on Supabase Storage.
 */
export async function suggestVoice(c: Context) {
  try {
    const body = (await c.req.json().catch(() => ({}))) as { client_id?: string };
    const clientId = body.client_id;
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
      'suggestVoice.brandResearch',
    );

    const tone = extractVoiceTone(brief?.research_data);
    const primaryKey = toneToPresetPrimary(tone);
    const secondaryKey = toneToPresetSecondary(tone);

    const toSuggestion = (key: string) => {
      const preset = VOICE_PRESETS[key];
      if (!preset) return null;
      const { data } = supabase.storage
        .from('client-assets')
        .getPublicUrl(preset.storagePath);
      return {
        preset_key: key,
        sample_url: data.publicUrl,
        description: preset.description,
      };
    };

    const suggestions = [toSuggestion(primaryKey), toSuggestion(secondaryKey)].filter(
      (x): x is NonNullable<ReturnType<typeof toSuggestion>> => x !== null,
    );

    return c.json({
      tone,
      suggestions,
      // Surface in case the frontend wants to warn the user: the mp3 files
      // still need to be manually generated and uploaded (see VOICE_PRESETS
      // TODO note in the source).
      presets_ready: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[brief-estudio][suggest-voice] error:', message);
    return c.json({ error: message }, 500);
  }
}

// ---- XTTS voice cloning -----------------------------------------------------

const XTTS_PREVIEW_TEXT = 'Hola, soy Steve. Bienvenido a tu marca.';
const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * POST /api/brief-estudio/clone-voice
 * Body: { client_id: string, audio_base64: string, audio_format: 'webm'|'mp3' }
 *
 * Uploads the raw voice sample, then runs XTTS-v2 on Replicate to produce a
 * short preview using the cloned voice. Stores both the sample and the preview
 * on Supabase Storage, and upserts the primary `brand_voices` row.
 */
export async function cloneVoice(c: Context) {
  let clientId: string | undefined;
  try {
    // Guard: reject oversized bodies BEFORE parsing JSON to avoid OOM on
    // Cloud Run. MAX_AUDIO_BYTES (5MB raw) + ~35% base64 overhead + JSON
    // metadata → 8MB cap on the request body itself.
    const MAX_BODY_BYTES = 8 * 1024 * 1024;
    const contentLength = Number(c.req.header('content-length') || 0);
    if (contentLength > 0 && contentLength > MAX_BODY_BYTES) {
      return c.json(
        { error: `Request demasiado grande (máx ${MAX_BODY_BYTES / (1024 * 1024)}MB)` },
        413,
      );
    }

    const body = (await c.req.json().catch(() => ({}))) as {
      client_id?: string;
      audio_base64?: string;
      audio_format?: string;
    };
    clientId = body.client_id;
    const audioBase64 = body.audio_base64;
    const audioFormat = (body.audio_format || '').toLowerCase();

    if (!isNonEmptyString(clientId)) {
      return c.json({ error: 'client_id is required' }, 400);
    }
    if (!isNonEmptyString(audioBase64)) {
      return c.json({ error: 'audio_base64 is required' }, 400);
    }
    if (audioFormat !== 'webm' && audioFormat !== 'mp3') {
      return c.json({ error: "audio_format must be 'webm' or 'mp3'" }, 400);
    }

    // Rough base64 size check BEFORE decoding (base64 is ~4/3 of raw bytes).
    const approxRawBytes = (audioBase64.length * 3) / 4;
    if (approxRawBytes > MAX_AUDIO_BYTES) {
      return c.json(
        { error: `Audio demasiado grande (máximo ${MAX_AUDIO_BYTES / (1024 * 1024)}MB)` },
        400,
      );
    }

    const access = await assertClientAccess(c, clientId);
    if (!access.userId) return c.json({ error: 'Unauthorized' }, 401);
    if (!access.allowed) return c.json({ error: 'Forbidden' }, 403);

    // Rate limit.
    const rl = await checkBriefEstudioRateLimit(clientId, 'clone-voice');
    if (!rl.allowed) {
      return c.json(
        {
          error: `Rate limit exceeded. Try again in ${rl.retryAfterMin} minutes`,
          retry_after_minutes: rl.retryAfterMin,
        },
        429,
      );
    }

    // Decode.
    let audioBytes: Buffer;
    try {
      audioBytes = Buffer.from(audioBase64, 'base64');
    } catch {
      return c.json({ error: 'audio_base64 inválido' }, 400);
    }
    if (audioBytes.length > MAX_AUDIO_BYTES) {
      return c.json(
        { error: `Audio decodificado demasiado grande (${audioBytes.length} bytes)` },
        400,
      );
    }
    if (audioBytes.length < 1024) {
      return c.json({ error: 'Audio demasiado corto' }, 400);
    }

    const timestamp = Date.now();
    const sampleExt = audioFormat === 'mp3' ? 'mp3' : 'webm';
    const sampleContentType = audioFormat === 'mp3' ? 'audio/mpeg' : 'audio/webm';
    const samplePath = `brand-voices/${clientId}/sample-${timestamp}.${sampleExt}`;

    const supabase = getSupabaseAdmin();

    // Upload the raw sample.
    let sampleUrl: string;
    try {
      sampleUrl = await uploadToClientAssets(
        samplePath,
        new Uint8Array(audioBytes),
        sampleContentType,
        false,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'storage error';
      return c.json({ error: `No se pudo guardar el sample: ${message}` }, 502);
    }

    // Run XTTS-v2 on Replicate using the uploaded sample URL as the speaker.
    let predictionOutput: string | string[] | null = null;
    let predictionId = '';
    try {
      predictionOutput = await runReplicatePrediction<
        Record<string, unknown>,
        string | string[]
      >({
        model: XTTS_V2_MODEL,
        version: XTTS_V2_VERSION,
        input: {
          text: XTTS_PREVIEW_TEXT,
          speaker: sampleUrl,
          language: 'es',
        },
        timeoutMs: 180_000,
        preferWaitSeconds: 55,
      });
    } catch (err) {
      if (err instanceof ReplicateError) {
        predictionId = err.predictionId || '';
        console.error('[brief-estudio][clone-voice] Replicate failed:', err.message);
        return c.json(
          {
            error: 'Falló la clonación de voz',
            details: err.message.slice(0, 400),
          },
          502,
        );
      }
      throw err;
    }

    const previewSourceUrl =
      typeof predictionOutput === 'string'
        ? predictionOutput
        : Array.isArray(predictionOutput)
          ? predictionOutput[0]
          : null;
    if (!previewSourceUrl) {
      return c.json({ error: 'XTTS completó pero no devolvió audio' }, 502);
    }

    // Download preview + persist.
    const previewBytes = await downloadToBytes(previewSourceUrl, 60_000);
    if (!previewBytes) {
      return c.json({ error: 'No se pudo descargar el preview de XTTS' }, 502);
    }
    const previewPath = `brand-voices/${clientId}/preview-${timestamp}.mp3`;
    let previewUrl: string;
    try {
      previewUrl = await uploadToClientAssets(previewPath, previewBytes, 'audio/mpeg', true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'storage error';
      return c.json({ error: `No se pudo guardar el preview: ${message}` }, 502);
    }

    // Upsert brand_voices — replace the primary voice row.
    const { error: delErr } = await supabase
      .from('brand_voices')
      .delete()
      .eq('client_id', clientId);
    if (delErr) {
      console.error('[brief-estudio][clone-voice] delete existing voice failed:', delErr.message);
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('brand_voices')
      .insert({
        client_id: clientId,
        source: 'xtts_cloned' as const,
        voice_id: predictionId || null,
        sample_url: sampleUrl,
        preset_key: null,
        is_primary: true,
      })
      .select('*')
      .single();
    if (insertErr) return c.json({ error: insertErr.message }, 500);

    await logAiUsage(clientId, 'clone-voice', XTTS_CREDITS_PER_GENERATION);

    // Recompute studio_ready since the voice just flipped from 'none' → 'xtts_cloned'.
    await recomputeAndStoreStudioReady(clientId);

    return c.json({
      voice: inserted as BrandVoice,
      preview_url: previewUrl,
      cost_credits: XTTS_CREDITS_PER_GENERATION,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[brief-estudio][clone-voice] error:', message);
    return c.json({ error: message }, 500);
  }
}

// ============================================================================
// Etapa 4 — Productos Shopify + Música mood-based
// ============================================================================

// ---- MusicGen (Replicate) para generar previews de 30s ----
// Model hosted by Meta on Replicate. `melody-large` supports 30s generation.
// Cost ~ $0.10 per 30s track (20 tracks = $2.00 one-time seed).
const MUSICGEN_MODEL = 'meta/musicgen';
// meta/musicgen no es "official model" en Replicate → requiere version hash.
// Este es el hash estable de la stereo-melody-large (2024). Si Replicate lo
// deprecara, actualizar aquí o cambiar a 'riffusion/riffusion' como fallback.
const MUSICGEN_VERSION = '671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb';

// ---- Helpers ---------------------------------------------------------------

async function assertSuperAdmin(
  c: Context,
): Promise<{ allowed: boolean; userId: string | null }> {
  const user = c.get('user');
  if (!user) return { allowed: false, userId: null };
  if (user.id === 'internal') return { allowed: true, userId: user.id };
  const supabase = getSupabaseAdmin();
  const { isSuperAdmin } = await getUserClientIds(supabase, user.id);
  return { allowed: isSuperAdmin, userId: user.id };
}

export function musicPreviewStoragePath(trackId: string): string {
  return `music-previews/${trackId}.mp3`;
}

export function musicPreviewPublicUrl(trackId: string): string {
  const supabase = getSupabaseAdmin();
  const { data } = supabase.storage
    .from('client-assets')
    .getPublicUrl(musicPreviewStoragePath(trackId));
  return data.publicUrl;
}

// ----------------------------- Handlers --------------------------------------

/**
 * GET /api/brief-estudio/products?client_id={id}
 *
 * Returns the client's Shopify catalog with a `is_featured` flag merged from
 * `brand_featured_products`. If the client has no active Shopify connection,
 * returns `shopify_connected: false` so the UI shows the "conectá Shopify" CTA.
 */
export async function getBriefEstudioProducts(c: Context) {
  try {
    const clientId = c.req.query('client_id');
    if (!isNonEmptyString(clientId)) {
      return c.json({ error: 'client_id is required' }, 400);
    }

    const access = await assertClientAccess(c, clientId);
    if (!access.userId) return c.json({ error: 'Unauthorized' }, 401);
    if (!access.allowed) return c.json({ error: 'Forbidden' }, 403);

    const supabase = getSupabaseAdmin();

    // Check shopify connection
    const { data: conn } = await supabase
      .from('platform_connections')
      .select('id')
      .eq('client_id', clientId)
      .eq('platform', 'shopify')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (!conn) {
      return c.json({ products: [], shopify_connected: false });
    }

    const [productsRes, featuredRes] = await Promise.all([
      supabase
        .from('shopify_products')
        .select(
          'shopify_product_id, title, image_url, price_min, price_max, status, synced_at',
        )
        .eq('client_id', clientId)
        .eq('status', 'active')
        .order('synced_at', { ascending: false })
        .limit(500),
      supabase
        .from('brand_featured_products')
        .select('shopify_product_id, is_featured, priority')
        .eq('client_id', clientId),
    ]);

    if (productsRes.error) return c.json({ error: productsRes.error.message }, 500);
    if (featuredRes.error) return c.json({ error: featuredRes.error.message }, 500);

    const featMap = new Map<string, { is_featured: boolean; priority: number }>();
    for (const row of (featuredRes.data ?? []) as Array<{
      shopify_product_id: string;
      is_featured: boolean;
      priority: number;
    }>) {
      featMap.set(row.shopify_product_id, {
        is_featured: !!row.is_featured,
        priority: row.priority ?? 0,
      });
    }

    type ProductRow = {
      shopify_product_id: string;
      title: string;
      image_url: string | null;
      price_min: number | null;
      price_max: number | null;
    };

    const merged = ((productsRes.data ?? []) as ProductRow[]).map((p) => {
      const feat = featMap.get(p.shopify_product_id);
      return {
        shopify_product_id: p.shopify_product_id,
        title: p.title,
        image_url: p.image_url,
        price_min: p.price_min ?? 0,
        price_max: p.price_max ?? 0,
        is_featured: feat?.is_featured ?? false,
        priority: feat?.priority ?? 0,
      };
    });

    // Featured first (by priority desc), then the rest (already sorted by synced_at desc).
    merged.sort((a, b) => {
      if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
      if (a.is_featured) return (b.priority ?? 0) - (a.priority ?? 0);
      return 0;
    });

    return c.json({
      products: merged,
      shopify_connected: true,
      total: merged.length,
      featured_count: merged.filter((p) => p.is_featured).length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[brief-estudio][products] error:', message);
    return c.json({ error: message }, 500);
  }
}

/**
 * POST /api/brief-estudio/products/sync
 * Body: { client_id: string }
 *
 * Synchronous re-sync of the client's Shopify catalog. For typical shops
 * (<5k products) this finishes within the HTTP budget. Larger shops may need
 * to be split later — for now the user sees the sync progress via toast.
 */
export async function syncBriefEstudioProducts(c: Context) {
  try {
    const body = (await c.req.json().catch(() => ({}))) as { client_id?: string };
    const clientId = body.client_id;
    if (!isNonEmptyString(clientId)) {
      return c.json({ error: 'client_id is required' }, 400);
    }

    const access = await assertClientAccess(c, clientId);
    if (!access.userId) return c.json({ error: 'Unauthorized' }, 401);
    if (!access.allowed) return c.json({ error: 'Forbidden' }, 403);

    const result = await syncClientShopifyProducts(clientId);
    if (result.error) {
      return c.json(
        {
          ok: false,
          error: result.error,
          shop_domain: result.shop_domain,
          synced: result.synced,
        },
        502,
      );
    }

    return c.json({
      ok: true,
      synced: result.synced,
      shop_domain: result.shop_domain,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[brief-estudio][products/sync] error:', message);
    return c.json({ error: message }, 500);
  }
}

/**
 * GET /api/brief-estudio/music/library
 * Public-ish (any authenticated user) — the seed is shared across all clients.
 */
export async function getBriefEstudioMusicLibrary(c: Context) {
  try {
    // Require auth (middleware already did it), but no client_id needed.
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const moods = (Object.keys(MOOD_LABELS_ES) as MusicMood[]).map((key) => ({
      key,
      label: MOOD_LABELS_ES[key].label,
      description: MOOD_LABELS_ES[key].description,
      emoji: MOOD_LABELS_ES[key].emoji,
    }));

    const tracks_by_mood: Record<string, Array<{
      id: string;
      name: string;
      tempo_bpm: number;
      instruments: string[];
      preview_url: string;
    }>> = {};

    for (const mood of moods) tracks_by_mood[mood.key] = [];

    for (const track of MUSIC_LIBRARY_SEED) {
      tracks_by_mood[track.mood].push({
        id: track.id,
        name: track.name,
        tempo_bpm: track.tempo_bpm,
        instruments: track.instruments,
        preview_url: musicPreviewPublicUrl(track.id),
      });
    }

    return c.json({ moods, tracks_by_mood });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[brief-estudio][music/library] error:', message);
    return c.json({ error: message }, 500);
  }
}

/**
 * POST /api/brief-estudio/music/generate-previews  (SUPER ADMIN)
 *
 * One-time (idempotent) job to generate all 20 mp3 previews with MusicGen and
 * upload them to `client-assets/music-previews/{id}.mp3`. Re-running skips
 * tracks whose mp3 is already present — useful for incremental retry.
 */
export async function generateMusicPreviews(c: Context) {
  try {
    const admin = await assertSuperAdmin(c);
    if (!admin.userId) return c.json({ error: 'Unauthorized' }, 401);
    if (!admin.allowed) return c.json({ error: 'Forbidden — super admin only' }, 403);

    const supabase = getSupabaseAdmin();

    // Figure out which tracks are already uploaded — list the prefix.
    const existing = new Set<string>();
    const { data: listed } = await supabase.storage
      .from('client-assets')
      .list('music-previews', { limit: 1000 });
    for (const f of listed ?? []) {
      // file names look like `warm_acoustic_morning.mp3`
      if (f.name?.endsWith('.mp3')) {
        existing.add(f.name.replace(/\.mp3$/, ''));
      }
    }

    const results: {
      generated: number;
      skipped: number;
      failures: Array<{ id: string; error: string }>;
    } = { generated: 0, skipped: 0, failures: [] };

    // Procesar 1 track: devuelve ok/error.
    async function renderSingleTrack(
      track: (typeof MUSIC_LIBRARY_SEED)[number],
    ): Promise<{ ok: true } | { ok: false; error: string }> {
      try {
        const prediction = await runReplicatePrediction<
          Record<string, unknown>,
          string | string[]
        >({
          model: MUSICGEN_MODEL,
          version: MUSICGEN_VERSION,
          input: {
            prompt: track.musicgen_prompt,
            duration: Math.min(Math.max(track.duration_sec, 8), 30),
            output_format: 'mp3',
            normalization_strategy: 'peak',
          },
          timeoutMs: 300_000,
          preferWaitSeconds: 55,
        });

        const mp3Url =
          typeof prediction === 'string'
            ? prediction
            : Array.isArray(prediction)
              ? prediction[0]
              : null;
        if (!mp3Url) return { ok: false, error: 'no output url' };

        const bytes = await downloadToBytes(mp3Url, 60_000);
        if (!bytes) return { ok: false, error: 'download failed' };

        await uploadToClientAssets(
          musicPreviewStoragePath(track.id),
          bytes,
          'audio/mpeg',
          true,
        );
        console.log(`[brief-estudio][music] generated ${track.id}`);
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown';
        console.error(`[brief-estudio][music] ${track.id} failed:`, message);
        return { ok: false, error: message.slice(0, 300) };
      }
    }

    // Separar skipped (ya existen) de los pendientes de renderizar.
    const pending: typeof MUSIC_LIBRARY_SEED = [];
    for (const track of MUSIC_LIBRARY_SEED) {
      if (existing.has(track.id)) results.skipped += 1;
      else pending.push(track);
    }

    // Batch paralelo de 4 concurrentes. 20 tracks / 4 = 5 rondas × ~3min =
    // ~15min total, bien dentro del wall-clock budget de Cloud Run.
    const BATCH_SIZE = 4;
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const chunk = pending.slice(i, i + BATCH_SIZE);
      const settled = await Promise.allSettled(chunk.map(renderSingleTrack));
      settled.forEach((r, idx) => {
        const trackId = chunk[idx].id;
        if (r.status === 'fulfilled') {
          if (r.value.ok) results.generated += 1;
          else results.failures.push({ id: trackId, error: r.value.error });
        } else {
          const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
          results.failures.push({ id: trackId, error: reason.slice(0, 300) });
        }
      });
    }

    return c.json({
      ...results,
      total_tracks: MUSIC_LIBRARY_SEED.length,
      cost_estimated_usd: results.generated * 0.1,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[brief-estudio][music/generate-previews] error:', message);
    return c.json({ error: message }, 500);
  }
}
