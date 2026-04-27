/**
 * Brief Estudio — Fase 2 (audio pipeline)
 *
 * Endpoints para narración:
 *   - POST /api/brief-estudio/narration/script  → Claude Haiku genera el guión
 *     (≤25 palabras, español neutro, hook/beneficio/CTA según funnel).
 *   - POST /api/brief-estudio/narration/audio   → XTTS-v2 (Replicate) sintetiza
 *     el guión usando la voz clonada del cliente o un preset.
 *
 * Storage:
 *   - bucket `client-assets` → `brand-voices/{client_id}/narration-{hash}.mp3`
 *
 * Auth: authMiddleware → assertClientAccess (owner del client_id o super_admin).
 *
 * Estos endpoints son llamados por el helper de orquestación en
 * generate-video.ts después de que Kling/Veo devuelven el mp4 (silent o con
 * audio nativo). El merge final con FFmpeg vive en lib/video-merge.ts.
 */

import { Context } from 'hono';
import { createHash } from 'node:crypto';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import { runReplicatePrediction, ReplicateError } from '../../lib/replicate.js';
import { anthropicFetch } from '../../lib/anthropic-fetch.js';
import {
  assertClientAccess,
  isNonEmptyString,
  downloadToBytes,
  uploadToClientAssets,
  extractVoiceTone,
  XTTS_V2_MODEL,
  XTTS_V2_VERSION,
  VOICE_PRESETS,
  type VoiceTone,
} from './index.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Cap script length to keep XTTS predictable (~10s read at native pace).
const MAX_SCRIPT_CHARS = 200;
const MAX_SCRIPT_WORDS = 25;

// Approx ~3 words/sec at conversational Spanish pace. Used as a sanity
// estimate so the FFmpeg merge can clip music to roughly the audio length.
const APPROX_WORDS_PER_SEC = 3;

const NARRATION_TEXT_FALLBACK_HOOK = 'Mirá esto.';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface NarrationProductHint {
  title?: string | null;
  description?: string | null;
  price_min?: number | null;
}

interface ScriptInput {
  client_id: string;
  angulo?: string | null;
  producto?: NarrationProductHint | null;
  funnel_stage?: 'TOFU' | 'MOFU' | 'BOFU' | string | null;
  duration_sec?: number | null;
}

interface ScriptCacheKeyInput {
  brand_tone: VoiceTone;
  brand_name: string | null;
  angulo: string;
  funnel_stage: string;
  duration_sec: number;
  product_title: string | null;
  product_price: number | null;
}

function hashScriptInput(k: ScriptCacheKeyInput): string {
  const raw = JSON.stringify(k);
  return createHash('sha1').update(raw).digest('hex').slice(0, 16);
}

/**
 * Read brand_research (brand_brief) to extract brand_name + brand_tone.
 * Returns null defaults if not configured. Uses safeQuery* to never throw.
 */
async function loadBrandContext(
  clientId: string,
): Promise<{ brand_name: string | null; brand_tone: VoiceTone }> {
  const supabase = getSupabaseAdmin();
  const brief = await safeQuerySingleOrDefault<{
    research_data: Record<string, unknown> | null;
  }>(
    supabase
      .from('brand_research')
      .select('research_data')
      .eq('client_id', clientId)
      .eq('research_type', 'brand_brief')
      .maybeSingle(),
    null,
    'narration.loadBrandContext',
  );

  const data = brief?.research_data ?? null;
  let brand_name: string | null = null;
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const k of ['brand_name', 'nombre_marca', 'business_name']) {
      const v = obj[k];
      if (typeof v === 'string' && v.trim().length > 0) {
        brand_name = v.trim().slice(0, 80);
        break;
      }
    }
  }

  const brand_tone = extractVoiceTone(data);
  return { brand_name, brand_tone };
}

/**
 * Truncate at word boundaries so we never split a Spanish word in half.
 * Drops trailing partial words past `maxChars`.
 */
function truncateScript(s: string, maxChars: number, maxWords: number): string {
  let out = s.trim().replace(/\s+/g, ' ');
  if (out.length === 0) return '';
  // First trim by words.
  const words = out.split(' ');
  if (words.length > maxWords) {
    out = words.slice(0, maxWords).join(' ');
  }
  // Then by chars (safety net).
  if (out.length > maxChars) {
    out = out.slice(0, maxChars);
    const lastSpace = out.lastIndexOf(' ');
    if (lastSpace > maxChars * 0.6) out = out.slice(0, lastSpace);
  }
  // Strip trailing punctuation noise.
  out = out.replace(/[\s,;:]+$/g, '').trim();
  // Ensure ending punctuation for natural read.
  if (out.length > 0 && !/[.!?]$/.test(out)) out += '.';
  return out;
}

function countWords(s: string): number {
  return s.trim().length === 0 ? 0 : s.trim().split(/\s+/).length;
}

function normalizeFunnel(stage: unknown): 'TOFU' | 'MOFU' | 'BOFU' {
  const s = (typeof stage === 'string' ? stage : '').toUpperCase().trim();
  if (s === 'MOFU') return 'MOFU';
  if (s === 'BOFU') return 'BOFU';
  return 'TOFU';
}

// ---------------------------------------------------------------------------
// Internal helpers (also used by orchestration in generate-video.ts)
// ---------------------------------------------------------------------------

/**
 * Internal: generate the narration text via Claude Haiku.
 * Returns the truncated script. Throws on configuration / API failure so the
 * orchestration layer can fall back to silent video.
 */
export async function generateNarrationScriptText(
  input: ScriptInput,
): Promise<{ script: string; word_count: number; tone: VoiceTone; brand_name: string | null }> {
  const clientId = input.client_id.trim();
  if (!clientId) throw new Error('client_id is required');

  const angulo = (input.angulo ?? '').toString().trim().slice(0, 80) || 'Bold Statement';
  const funnel_stage = normalizeFunnel(input.funnel_stage);
  const duration_sec = Math.max(
    4,
    Math.min(15, Math.round(Number(input.duration_sec ?? 8))),
  );

  const product_title = input.producto?.title?.toString().trim().slice(0, 120) || null;
  const product_price =
    typeof input.producto?.price_min === 'number'
      ? Number(input.producto.price_min)
      : input.producto?.price_min
        ? Number(input.producto.price_min)
        : null;

  const { brand_name, brand_tone } = await loadBrandContext(clientId);

  // Anthropic config check.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const funnelHint =
    funnel_stage === 'TOFU'
      ? 'Empezá con un hook fuerte (asombro, curiosidad o problema cotidiano).'
      : funnel_stage === 'MOFU'
        ? 'Centrá el guión en un beneficio concreto y tangible.'
        : 'Cerrá con un CTA claro y una razón para actuar ahora.';

  const productLine = product_title
    ? `Producto: ${product_title}${product_price ? `, $${product_price}` : ''}`
    : 'Producto: marca general (sin SKU específico)';

  const prompt = [
    `Generá un guión de narración para un anuncio de video de ${duration_sec}s.`,
    `Marca: ${brand_name ?? 'la marca del cliente'}`,
    productLine,
    `Ángulo: ${angulo}`,
    `Funnel: ${funnel_stage} (TOFU=hook, MOFU=consideración, BOFU=conversión)`,
    `Tono: ${brand_tone}`,
    '',
    'Reglas:',
    `- Máximo ${MAX_SCRIPT_WORDS} palabras`,
    '- Frases cortas, ritmo conversacional',
    '- Sin saludos vacíos ("Hola, soy...")',
    '- En español neutro/latino',
    `- ${funnelHint}`,
    '',
    'Devolveme SOLO el guión, sin comillas ni prefijos.',
  ].join('\n');

  const result = await anthropicFetch(
    {
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    },
    apiKey,
    { timeoutMs: 20_000, maxRetries: 1 },
  );

  if (!result.ok) {
    throw new Error(
      `Anthropic narration script failed: HTTP ${result.status} ${
        result.data?.error?.message ? String(result.data.error.message).slice(0, 160) : ''
      }`,
    );
  }

  const raw = (result.data?.content?.[0]?.text || '').toString();
  const cleaned = raw
    .replace(/^["“”'`]+|["“”'`]+$/g, '')
    .replace(/^[-*•·]\s*/g, '')
    .trim();

  const script = truncateScript(cleaned || NARRATION_TEXT_FALLBACK_HOOK, MAX_SCRIPT_CHARS, MAX_SCRIPT_WORDS);

  return {
    script,
    word_count: countWords(script),
    tone: brand_tone,
    brand_name,
  };
}

interface AudioInput {
  client_id: string;
  script: string;
  voice_source: 'xtts_cloned' | 'preset' | 'none';
  preset_key?: string | null;
  /**
   * Optional speaker URL (signed/public). If omitted we read brand_voices for
   * the client. Required when voice_source='xtts_cloned' and no row exists.
   */
  speaker_override?: string | null;
}

/**
 * Internal: synthesize narration mp3 via XTTS-v2 on Replicate.
 * Returns the public URL of the uploaded mp3. Throws on failure so the
 * orchestrator can fall back gracefully.
 */
export async function generateNarrationAudioFile(
  input: AudioInput,
): Promise<{ audio_url: string; duration_sec: number }> {
  const clientId = input.client_id.trim();
  if (!clientId) throw new Error('client_id is required');
  const script = (input.script || '').trim();
  if (!script) throw new Error('script is required');
  if (input.voice_source === 'none') {
    throw new Error("voice_source='none' cannot generate audio");
  }

  const supabase = getSupabaseAdmin();

  // Resolve speaker URL.
  let speakerUrl: string | null = input.speaker_override?.trim() || null;
  if (!speakerUrl) {
    if (input.voice_source === 'xtts_cloned') {
      const voice = await safeQuerySingleOrDefault<{ sample_url: string | null }>(
        supabase
          .from('brand_voices')
          .select('sample_url')
          .eq('client_id', clientId)
          .order('is_primary', { ascending: false })
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        null,
        'narration.audio.brandVoice',
      );
      speakerUrl = voice?.sample_url || null;
    } else {
      // preset
      const preset = input.preset_key ? VOICE_PRESETS[input.preset_key] : null;
      if (preset) {
        const { data } = supabase.storage
          .from('client-assets')
          .getPublicUrl(preset.storagePath);
        speakerUrl = data.publicUrl;
      }
    }
  }

  if (!speakerUrl) {
    throw new Error(
      `No speaker reference available for voice_source='${input.voice_source}' (preset_key=${input.preset_key ?? 'null'})`,
    );
  }

  // XTTS-v2 input. Same shape used in clone-voice.
  let predictionOutput: string | string[];
  try {
    predictionOutput = await runReplicatePrediction<
      Record<string, unknown>,
      string | string[]
    >({
      model: XTTS_V2_MODEL,
      version: XTTS_V2_VERSION,
      input: {
        text: script,
        speaker: speakerUrl,
        language: 'es',
      },
      timeoutMs: 180_000,
      preferWaitSeconds: 55,
    });
  } catch (err) {
    if (err instanceof ReplicateError) {
      throw new Error(`XTTS narration failed: ${err.message.slice(0, 220)}`);
    }
    throw err;
  }

  const audioSourceUrl =
    typeof predictionOutput === 'string'
      ? predictionOutput
      : Array.isArray(predictionOutput)
        ? predictionOutput[0]
        : null;
  if (!audioSourceUrl) {
    throw new Error('XTTS completed but returned no audio URL');
  }

  const bytes = await downloadToBytes(audioSourceUrl, 60_000);
  if (!bytes) throw new Error('Failed to download XTTS narration mp3');

  // Cache key: hash of script + voice ref so re-running with same input reuses.
  const hash = createHash('sha1')
    .update(`${clientId}|${speakerUrl}|${script}`)
    .digest('hex')
    .slice(0, 16);
  const path = `brand-voices/${clientId}/narration-${hash}.mp3`;

  const audioUrl = await uploadToClientAssets(path, bytes, 'audio/mpeg', true);

  // Estimate duration from word count (XTTS exact duration would require
  // probing the file with FFmpeg; this is good enough for music clipping).
  const words = countWords(script);
  const duration_sec = Math.max(2, Math.round(words / APPROX_WORDS_PER_SEC));

  return { audio_url: audioUrl, duration_sec };
}

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------

/**
 * POST /api/brief-estudio/narration/script
 * Body: { client_id, angulo?, producto?, funnel_stage?, duration_sec? }
 * Returns: { script, word_count, tone, brand_name }
 */
export async function generateNarrationScript(c: Context) {
  let clientId: string | undefined;
  try {
    const body = (await c.req.json().catch(() => ({}))) as {
      client_id?: string;
      angulo?: string;
      producto?: NarrationProductHint;
      funnel_stage?: string;
      duration_sec?: number;
    };
    clientId = body.client_id;
    if (!isNonEmptyString(clientId)) {
      return c.json({ error: 'client_id is required' }, 400);
    }

    const access = await assertClientAccess(c, clientId);
    if (!access.userId) return c.json({ error: 'Unauthorized' }, 401);
    if (!access.allowed) return c.json({ error: 'Forbidden' }, 403);

    const result = await generateNarrationScriptText({
      client_id: clientId,
      angulo: body.angulo ?? null,
      producto: body.producto ?? null,
      funnel_stage: body.funnel_stage ?? null,
      duration_sec: body.duration_sec ?? null,
    });

    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[brief-estudio][narration/script] error:', message);
    return c.json({ error: message.slice(0, 300) }, 500);
  }
}

/**
 * POST /api/brief-estudio/narration/audio
 * Body: { client_id, script, voice_source, preset_key?, speaker_override? }
 * Returns: { audio_url, duration_sec }
 */
export async function generateNarrationAudio(c: Context) {
  try {
    const body = (await c.req.json().catch(() => ({}))) as {
      client_id?: string;
      script?: string;
      voice_source?: 'xtts_cloned' | 'preset' | 'none';
      preset_key?: string | null;
      speaker_override?: string | null;
    };

    const clientId = body.client_id;
    if (!isNonEmptyString(clientId)) {
      return c.json({ error: 'client_id is required' }, 400);
    }
    if (!isNonEmptyString(body.script)) {
      return c.json({ error: 'script is required' }, 400);
    }
    const voiceSource = body.voice_source;
    if (voiceSource !== 'xtts_cloned' && voiceSource !== 'preset' && voiceSource !== 'none') {
      return c.json({ error: "voice_source must be 'xtts_cloned' | 'preset' | 'none'" }, 400);
    }
    if (voiceSource === 'none') {
      return c.json({ error: 'voice_source=none — no audio to generate' }, 400);
    }

    const access = await assertClientAccess(c, clientId);
    if (!access.userId) return c.json({ error: 'Unauthorized' }, 401);
    if (!access.allowed) return c.json({ error: 'Forbidden' }, 403);

    const result = await generateNarrationAudioFile({
      client_id: clientId,
      script: body.script,
      voice_source: voiceSource,
      preset_key: body.preset_key ?? null,
      speaker_override: body.speaker_override ?? null,
    });

    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[brief-estudio][narration/audio] error:', message);
    return c.json({ error: message.slice(0, 300) }, 500);
  }
}

// Re-export the cache key helper for tests / debugging if needed.
export const _internal = {
  hashScriptInput,
  truncateScript,
  countWords,
  normalizeFunnel,
};
