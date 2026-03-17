/**
 * angle-detector.ts — Detects the marketing angle of a copy text using Claude Haiku.
 * Part of Bloque D.6: Loop cerrado — guardar ángulo al crear.
 */

const VALID_ANGLES = [
  'descuento', 'testimonio', 'beneficio', 'urgencia', 'exclusividad',
  'educativo', 'emocional', 'comparación', 'autoridad', 'novedad',
  'problema-solución', 'social proof', 'storytelling', 'aspiracional',
  'curiosidad', 'oferta', 'behind-the-scenes', 'transformación',
] as const;

/**
 * Classifies a copy text into a single marketing angle using Claude Haiku.
 * Returns a 1-3 word angle label (e.g. "urgencia", "social proof").
 * Falls back to keyword matching if the API call fails.
 */
export async function detectAngle(copy: string): Promise<string> {
  if (!copy || copy.trim().length < 5) return 'sin clasificar';

  // Try fast keyword-based detection first (avoids API call for obvious cases)
  const fast = fastDetect(copy);
  if (fast) return fast;

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    console.warn('[angle-detector] ANTHROPIC_API_KEY not set, using keyword fallback');
    return 'sin clasificar';
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 50,
        messages: [{
          role: 'user',
          content: `Clasifica este copy en UN ángulo de marketing. Responde SOLO el ángulo, 1-3 palabras.

Opciones: descuento, testimonio, beneficio, urgencia, exclusividad, educativo, emocional, comparación, autoridad, novedad, problema-solución, social proof, storytelling, aspiracional, curiosidad, oferta, behind-the-scenes, transformación.

Copy: "${copy.substring(0, 300)}"

Ángulo:`,
        }],
      }),
    });

    if (!response.ok) {
      console.error('[angle-detector] API error:', response.status);
      return 'sin clasificar';
    }

    const result: any = await response.json();
    const raw = (result.content?.[0]?.text || '').trim().toLowerCase();

    // Validate the angle is one of the known options
    const matched = VALID_ANGLES.find(a => raw.includes(a));
    return matched || raw.substring(0, 30) || 'sin clasificar';
  } catch (err) {
    console.error('[angle-detector] Error:', err);
    return 'sin clasificar';
  }
}

/** Fast keyword-based detection for obvious cases (no API call needed). */
function fastDetect(copy: string): string | null {
  const lower = copy.toLowerCase();

  if (/\d+%\s*off|descuento|\bdcto\b|% de descuento|cupón|código/.test(lower)) return 'descuento';
  if (/última[s]?\s+unidad|quedan\s+\d|solo\s+hoy|últim[oa]s?\s+hora|termina\s+hoy|no te quedes sin/.test(lower)) return 'urgencia';
  if (/exclusiv[oa]|solo\s+para\s+(ti|miembros|suscriptores)|acceso\s+(anticipado|exclusivo)/.test(lower)) return 'exclusividad';
  if (/client[ea]s?\s+(dic|opinan|confían)|testimonio|reseña|\d+\s*estrellas|★/.test(lower)) return 'testimonio';
  if (/nuev[oa]|recién\s+llegad|just\s+dropped|lanzamiento|nueva\s+colección/.test(lower)) return 'novedad';
  if (/sabías\s+que|el\s+secreto|te\s+contamos|dato\s+curioso|aprende/.test(lower)) return 'educativo';
  if (/oferta|promo|2x1|gratis|envío\s+gratis|regalo/.test(lower)) return 'oferta';

  return null;
}
