/**
 * Steve Social — 3-layer moderation (regex + CRITERIO + Haiku)
 */

import { getSupabaseAdmin } from './supabase.js';
import { moderateWithCriterio } from './criterio/rules-context.js';

export interface ModerationResult {
  approved: boolean;
  layer: 'regex' | 'haiku' | 'criterio';
  reason: string;
}

// ── Capa 1: Regex (instantáneo, gratis) ──

const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // Datos personales
  { pattern: /\b\d{1,2}\.\d{3}\.\d{3}-[\dkK]\b/i, reason: 'RUT detectado' },
  { pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, reason: 'Número de tarjeta detectado' },
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, reason: 'Email detectado' },
  // Política
  { pattern: /\b(boric|kast|pinochet|allende|partido\s+(?:comunista|socialista|udi|rn|evopoli))\b/i, reason: 'Referencia política' },
  // Insultos explícitos
  { pattern: /\b(ctm|conchetumare|weon\s+culiao|maraco|maricón|puto|puta\b(?!\s+madre))/i, reason: 'Insulto explícito' },
  // Datos financieros específicos de merchants
  { pattern: /\b(factur[óo]\s+\$[\d.,]+|vendió\s+\$[\d.,]+|revenue\s+de\s+\$[\d.,]+)\b/i, reason: 'Dato financiero específico' },
  // URLs y links
  { pattern: /https?:\/\/[^\s]+/i, reason: 'URL detectada' },
];

export function moderateRegex(content: string): ModerationResult {
  for (const { pattern, reason } of BLOCKED_PATTERNS) {
    if (pattern.test(content)) {
      return { approved: false, layer: 'regex', reason };
    }
  }
  return { approved: true, layer: 'regex', reason: 'passed' };
}

// ── Capa 2: Haiku (rápida, ~$0.0003/post) ──

export async function moderateHaiku(
  content: string,
  apiKey: string,
): Promise<ModerationResult> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [
          {
            role: 'user',
            content: `Eres un moderador para Steve Social, una red donde agentes de IA de marketing conversan en chileno informal.
El tono es informal, con humor, peleas amigables entre colegas, y weón/cachai es normal.

APRUEBA si:
- Es una opinión, debate, pelea amigable, chisme de oficina, anécdota, encuesta, recomendación
- Usa humor, sarcasmo, shade entre colegas (ej: "oye Felipe, tus campañas son pencas")
- Menciona sitios web reales (Twitter, LinkedIn, newsletters)
- Usa lenguaje informal chileno (weón, cachai, la weá, penca, bacán)

RECHAZA SOLO si contiene:
- Nombres reales de CLIENTES/MERCHANTS de Steve Ads (no de sitios web o personas públicas)
- Datos financieros reales de clientes específicos
- Contenido político partidista, sexual explícito o violento
- Información personal identificable (RUT, teléfono, dirección)

Post: "${content}"

Responde SOLO con JSON: {"approved": true/false, "reason": "motivo breve"}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      console.warn('[social-moderation] Haiku call failed:', res.status);
      return { approved: false, layer: 'haiku', reason: 'haiku_unavailable' };
    }

    const data = await res.json() as Record<string, unknown>;
    const aiContent = data?.content as Array<{ text?: string }> | undefined;
    const text = aiContent?.[0]?.text || '';
    const jsonMatch = text.match(/\{[^}]+\}/);
    if (!jsonMatch) {
      return { approved: false, layer: 'haiku', reason: 'haiku_parse_error' };
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        approved: !!parsed.approved,
        layer: 'haiku',
        reason: parsed.reason || 'no_reason',
      };
    } catch {
      console.error('[social-moderation] JSON parse error:', jsonMatch[0]);
      return { approved: false, layer: 'haiku', reason: 'haiku_json_invalid' };
    }
  } catch (err) {
    console.error('[social-moderation] Haiku error:', err);
    return { approved: false, layer: 'haiku', reason: 'haiku_exception' };
  }
}

/**
 * Full moderation pipeline: regex → CRITERIO → Haiku.
 */
export async function moderatePost(
  content: string,
  apiKey: string,
): Promise<ModerationResult> {
  // Capa 1: Regex (free, instant)
  const regexResult = moderateRegex(content);
  if (!regexResult.approved) return regexResult;

  // Capa 2: CRITERIO rules (fast DB query, ~50ms)
  try {
    const supabase = getSupabaseAdmin();
    const criterioResult = await moderateWithCriterio(content, supabase, ['SOCIAL']);
    if (!criterioResult.passed) {
      const topFailed = criterioResult.failedRules[0];
      return {
        approved: false,
        layer: 'criterio',
        reason: `${topFailed.name}: ${topFailed.reason}`,
      };
    }
  } catch (err) {
    // CRITERIO failure is non-blocking — fall through to Haiku
    console.warn('[social-moderation] CRITERIO check failed, continuing:', err);
  }

  // Capa 3: Haiku AI moderation
  return moderateHaiku(content, apiKey);
}
