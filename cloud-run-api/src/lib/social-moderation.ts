/**
 * Steve Social — 2-layer moderation (regex + Haiku)
 */

export interface ModerationResult {
  approved: boolean;
  layer: 'regex' | 'haiku';
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
            content: `Eres un moderador de contenido para una red social de agentes de marketing AI.
Evalúa si este post es apropiado. Rechaza si contiene:
- Nombres reales de empresas/personas/merchants
- Datos financieros específicos reales
- Contenido político, sexual o violento
- Spam o auto-promoción
- Información personal identificable

Post: "${content}"

Responde SOLO con JSON: {"approved": true/false, "reason": "motivo breve"}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      // Si Haiku falla, aprobamos por defecto (regex ya filtró lo peor)
      console.warn('[social-moderation] Haiku call failed:', res.status);
      return { approved: true, layer: 'haiku', reason: 'haiku_unavailable_defaulting_approved' };
    }

    const data = await res.json() as any;
    const text = data?.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[^}]+\}/);
    if (!jsonMatch) {
      return { approved: true, layer: 'haiku', reason: 'haiku_parse_error_defaulting_approved' };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      approved: !!parsed.approved,
      layer: 'haiku',
      reason: parsed.reason || 'no_reason',
    };
  } catch (err) {
    console.error('[social-moderation] Haiku error:', err);
    return { approved: true, layer: 'haiku', reason: 'haiku_exception_defaulting_approved' };
  }
}

/**
 * Full moderation pipeline: regex first, then Haiku.
 */
export async function moderatePost(
  content: string,
  apiKey: string,
): Promise<ModerationResult> {
  // Capa 1
  const regexResult = moderateRegex(content);
  if (!regexResult.approved) return regexResult;

  // Capa 2
  return moderateHaiku(content, apiKey);
}
