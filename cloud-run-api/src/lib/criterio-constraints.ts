/**
 * CRITERIO → Claude constraints translator (Meta Copy specific).
 *
 * Converts criterio_rules.check_config JSON shapes into clear Spanish
 * natural-language restrictions that Claude can follow at generation time,
 * so the copy passes CRITERIO on the first shot (no self-rejection loop).
 *
 * This module complements (does NOT replace) buildCriterioRulesBlock() from
 * lib/criterio/rules-context.ts — that one is a shared multi-surface formatter
 * of check_rule strings; this one is a Meta-Copy-only deeper translator of
 * check_config. Both are injected together in generate-meta-copy.ts.
 *
 * Cache: 5 min TTL in-memory (process scope, shared across Cloud Run requests).
 * Fail-open: if DB query fails, returns empty string — generation continues.
 *
 * Owner: Valentín W18 (Creativos & Imágenes). Changes require Isidora W6 review.
 */

import { getSupabaseAdmin } from './supabase.js';

interface CriterioRuleRow {
  id: string;
  name: string;
  check_rule: string | null;
  severity: string;
  check_type: string | null;
  check_config: Record<string, any> | null;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let _cachedConstraints: string | null = null;
let _cachedAt = 0;

/**
 * Translate a single CRITERIO rule into a natural-language Spanish restriction.
 * Returns null if the check_type is unknown or config is missing (rule skipped).
 */
function translateRule(rule: CriterioRuleRow): string | null {
  const cfg = rule.check_config || {};
  const type = rule.check_type || '';
  const field = cfg.field ? fieldLabel(cfg.field) : 'el texto';

  switch (type) {
    case 'length': {
      if (cfg.min != null && cfg.max != null) {
        return `${capitalize(field)} debe tener entre ${cfg.min} y ${cfg.max} caracteres.`;
      }
      if (cfg.max != null) return `${capitalize(field)} debe tener máximo ${cfg.max} caracteres.`;
      if (cfg.min != null) return `${capitalize(field)} debe tener mínimo ${cfg.min} caracteres.`;
      return null;
    }

    case 'range': {
      const unit = cfg.unit ? ` ${cfg.unit}` : '';
      if (cfg.min != null && cfg.max != null) {
        return `${capitalize(field)} debe estar entre ${cfg.min}${unit} y ${cfg.max}${unit}.`;
      }
      if (cfg.max != null) return `${capitalize(field)} debe ser máximo ${cfg.max}${unit}.`;
      if (cfg.min != null) return `${capitalize(field)} debe ser mínimo ${cfg.min}${unit}.`;
      return null;
    }

    case 'forbidden': {
      const words: string[] = Array.isArray(cfg.words) ? cfg.words.filter(Boolean) : [];
      // Some forbidden rules use an external source (e.g. competitor list) with empty words array
      if (words.length === 0) {
        if (cfg.should_contain_any) {
          // Flipped: this rule actually REQUIRES one of the words (e.g. CTA verbs)
          return `${capitalize(field)} debe incluir al menos una llamada a la acción clara (ej: compra, descubre, agenda, mira, prueba).`;
        }
        if (cfg.source) {
          return `${capitalize(field)} NO debe mencionar marcas competidoras del cliente.`;
        }
        return null;
      }
      const list = words.slice(0, 12).map((w) => `"${w}"`).join(', ');
      if (cfg.conditional && cfg.verify_source) {
        return `Evita prometer "${words[0]}" o similares (${list}) salvo que el cliente lo tenga activo en su tienda.`;
      }
      return `Evita estas palabras/frases prohibidas en ${field}: ${list}.`;
    }

    case 'regex': {
      const max = cfg.max_matches;
      const maxPct = cfg.max_pct;
      const shouldMatch = cfg.should_match;
      const pattern: string = cfg.pattern || '';

      // Emoji counter
      if (max != null && /1F6|1F3|2600|2700/.test(pattern)) {
        return `Máximo ${max} emojis en total en ${field}.`;
      }
      // Uppercase percentage
      if (maxPct != null && /A-Z/.test(pattern)) {
        return `No escribas más del ${maxPct}% de las letras en MAYÚSCULAS (evita GRITAR, usa mayúsculas solo para énfasis puntual).`;
      }
      // URL pattern disallowed
      if (shouldMatch === false && /https?/.test(pattern)) {
        return `No incluyas URLs en ${field} (el link va en el botón del anuncio).`;
      }
      // Hashtags disallowed
      if (shouldMatch === false && pattern.includes('#')) {
        return `No uses hashtags (#palabra) en ${field}.`;
      }
      // Phone number
      if (shouldMatch === false && /\\d/.test(pattern) && /56|09/.test(pattern)) {
        return `No incluyas números de teléfono en ${field}.`;
      }
      // Dates
      if (shouldMatch === false && /\\d\{1,2\}/.test(pattern)) {
        return `No incluyas fechas específicas (formato dd/mm/aaaa) en ${field} salvo que sean futuras y reales.`;
      }
      // Double spaces
      if (shouldMatch === false && pattern.trim() === '+') {
        return `Usa un solo espacio entre palabras en ${field} (nunca dobles espacios).`;
      }
      // Weird special chars
      if (shouldMatch === false && /2605|2665|25B2/.test(pattern)) {
        return `No uses caracteres especiales decorativos (★ ♥ ▲ ● etc.) en ${field}.`;
      }
      // Generic fallback for regex rules
      if (shouldMatch === false) {
        return `Evita el patrón "${rule.name}" en ${field} (${rule.check_rule || 'ver regla'}).`;
      }
      return null;
    }

    case 'comparison': {
      const desc = cfg.description || '';
      if (cfg.field_b === '_history_angles' || /\u00e1ngulo/i.test(desc)) {
        return `Usa un ángulo creativo distinto a los últimos 5 generados (revisa el historial inyectado más abajo).`;
      }
      if (cfg.field_a === 'variant_a' && cfg.field_b === 'variant_b') {
        const diff = cfg.min_diff_pct || 30;
        return `Si generas variantes A/B, deben diferir en más de ${diff}% del texto (no cambios cosméticos).`;
      }
      return desc || null;
    }

    case 'required': {
      if (cfg.contains) {
        return `${capitalize(field)} debe contener "${cfg.contains}".`;
      }
      return `${capitalize(field)} es obligatorio (no puede ir vacío).`;
    }

    case 'ai': {
      const ctxFields: string[] = Array.isArray(cfg.context_fields) ? cfg.context_fields : [];
      if (ctxFields.includes('tone') || ctxFields.includes('brand_voice')) {
        return `El tono del copy debe ser coherente con el tono y la voz de marca del cliente (ver sección del brief).`;
      }
      if (/singular|plural/i.test(cfg.prompt || '')) {
        return `Mantén coherencia gramatical: si hablas de 1 producto usa singular, si de varios usa plural.`;
      }
      return cfg.prompt ? truncate(cfg.prompt, 160) : null;
    }

    case 'db_lookup': {
      // DB-bound rules depend on post-generation validation — skip most,
      // except those where we can give Claude a clear pre-gen guardrail.
      if (cfg.value_field === 'price') {
        return `Si mencionas precio, debe coincidir exactamente con el precio real del producto en la tienda del cliente.`;
      }
      if (cfg.value_field === 'compare_at_price') {
        return `Si mencionas descuento, debe ser un descuento real del producto (compare_at_price > price en Shopify).`;
      }
      if (cfg.check === 'exists' && cfg.table === 'shopify_products') {
        return `Solo menciona productos que realmente existen en la tienda del cliente (ver productos reales en el contexto).`;
      }
      return null;
    }

    case 'external': {
      // Most external checks (URL 200, languagetool) we can't enforce pre-gen,
      // but we can nudge Claude:
      if (cfg.service === 'languagetool') {
        return `Revisa la ortografía y gramática — el copy se valida con LanguageTool en español.`;
      }
      return null;
    }

    default: {
      console.warn(`[criterio-constraints] Unknown check_type "${type}" for rule "${rule.name}" — skipping`);
      return null;
    }
  }
}

function fieldLabel(raw: string): string {
  const map: Record<string, string> = {
    primary_text: 'el texto principal',
    headline: 'el titular',
    description: 'la descripción',
    link_url: 'la URL de destino',
    cta: 'el llamado a la acción',
    subject: 'el asunto',
  };
  return map[raw] || `"${raw}"`;
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/**
 * Fetch active BLOQUEAR + Rechazar rules for META COPY. Advertencia rules
 * are suggestions, not enforced, so we skip them to keep the prompt tight.
 */
async function fetchCriterioCopyConstraints(
  supabase: ReturnType<typeof getSupabaseAdmin>,
): Promise<CriterioRuleRow[]> {
  const { data, error } = await supabase
    .from('criterio_rules')
    .select('id, name, check_rule, severity, check_type, check_config')
    .eq('organ', 'CRITERIO')
    .eq('category', 'META COPY')
    .eq('active', true)
    .in('severity', ['BLOQUEAR', 'Rechazar'])
    .order('severity', { ascending: false })
    .order('weight', { ascending: false });

  if (error) throw error;
  return (data as CriterioRuleRow[]) || [];
}

function buildConstraintsString(rules: CriterioRuleRow[]): string {
  if (!rules.length) return '';

  const sentences: string[] = [];
  const seen = new Set<string>();
  for (const rule of rules) {
    const sentence = translateRule(rule);
    if (!sentence) continue;
    // De-dupe by exact text (some rules translate to the same constraint)
    if (seen.has(sentence)) continue;
    seen.add(sentence);
    sentences.push(sentence);
  }

  if (!sentences.length) return '';

  const numbered = sentences.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return (
    '\n══ RESTRICCIONES OBLIGATORIAS (si no las respetas, el copy será rechazado y no publicado) ══\n' +
    numbered +
    '\n═════════════════════════════════════════════════════════════════════════════════════════\n'
  );
}

/**
 * Public entrypoint. Returns a prompt-injectable block of constraints derived
 * from criterio_rules.check_config. Cached 5 min in memory, fail-open on error.
 *
 * Use BEFORE "Tu tarea:" / "Formato de respuesta:" sections so Claude reads
 * the constraints at the start of the system prompt context.
 */
export async function getCopyConstraintsBlock(
  supabase: ReturnType<typeof getSupabaseAdmin>,
): Promise<string> {
  if (_cachedConstraints !== null && Date.now() - _cachedAt < CACHE_TTL_MS) {
    return _cachedConstraints;
  }
  try {
    const rules = await fetchCriterioCopyConstraints(supabase);
    const block = buildConstraintsString(rules);
    _cachedConstraints = block;
    _cachedAt = Date.now();
    return block;
  } catch (err) {
    console.error('[criterio-constraints] Failed to fetch/translate rules — continuing without constraints:', err);
    return '';
  }
}

/**
 * Test helper: reset the in-memory cache. Not exported via barrel; used only
 * by unit tests or admin tools.
 */
export function __resetCopyConstraintsCache(): void {
  _cachedConstraints = null;
  _cachedAt = 0;
}
