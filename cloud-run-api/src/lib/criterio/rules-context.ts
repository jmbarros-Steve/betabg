/**
 * Shared CRITERIO rules context builder.
 * Loads active rules from criterio_rules and formats them as a prompt block
 * for injection into AI generators. Used by Meta copy, Google copy, video scripts,
 * product descriptions, WA chat, inbox replies, and image analysis.
 */

import { getSupabaseAdmin } from '../supabase.js';

export interface CriterioContextOptions {
  /** Max number of rules to include (default: unlimited) */
  maxRules?: number;
  /** Only include BLOQUEAR and Rechazar severity (for latency-sensitive flows) */
  lightMode?: boolean;
}

/**
 * Build a prompt-injectable block of CRITERIO quality rules.
 *
 * @param supabase - Supabase client instance
 * @param categories - Rule categories to load (e.g. ['META COPY', 'META CREATIVE'])
 * @param options - Optional: maxRules, lightMode
 * @returns Formatted rules block string (empty string if no rules found)
 */
export async function buildCriterioRulesBlock(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  categories: string[],
  options?: CriterioContextOptions,
): Promise<string> {
  try {
    let query = supabase
      .from('criterio_rules')
      .select('name, check_rule, category, severity, implemented')
      .eq('active', true)
      .in('category', categories)
      .order('weight', { ascending: false });

    if (options?.lightMode) {
      query = query.in('severity', ['BLOQUEAR', 'Rechazar']);
    }

    if (options?.maxRules) {
      query = query.limit(options.maxRules);
    }

    const { data: rules, error } = await query;

    if (error || !rules || rules.length === 0) return '';

    // Group by category for clarity
    const grouped: Record<string, string[]> = {};
    for (const r of rules) {
      const cat = r.category;
      if (!grouped[cat]) grouped[cat] = [];
      const severity = r.severity === 'BLOQUEAR' ? '⛔' : r.severity === 'Rechazar' ? '❌' : '⚠️';
      grouped[cat].push(`${severity} ${r.name}: ${r.check_rule}`);
    }

    let result = '\n══ REGLAS DE CALIDAD CRITERIO (tu contenido SERÁ evaluado contra TODAS estas reglas) ══\n';
    for (const [cat, ruleTexts] of Object.entries(grouped)) {
      result += `\n[${cat}]\n${ruleTexts.join('\n')}\n`;
    }
    result += '\n⛔ = BLOQUEA publicación | ❌ = Rechaza | ⚠️ = Advertencia\n';
    result += 'IMPORTANTE: Genera contenido que cumpla TODAS las reglas ❌ y ⛔.\n';
    return result;
  } catch (err) {
    console.error('[criterio/rules-context] Failed to fetch criterio_rules:', err);
    return '';
  }
}

/**
 * Post-generation moderation using CRITERIO rules.
 * Used for social posts/replies where injecting rules into the prompt
 * would kill agent personalities.
 */
export interface ModerationCriterioResult {
  passed: boolean;
  severity: 'ok' | 'warning' | 'reject' | 'block';
  failedRules: Array<{ name: string; severity: string; reason: string }>;
}

export async function moderateWithCriterio(
  content: string,
  supabase: ReturnType<typeof getSupabaseAdmin>,
  categories: string[],
): Promise<ModerationCriterioResult> {
  try {
    const { data: rules, error } = await supabase
      .from('criterio_rules')
      .select('name, check_rule, category, severity, check_type, check_config')
      .eq('active', true)
      .in('category', categories)
      .order('weight', { ascending: false });

    if (error || !rules || rules.length === 0) {
      return { passed: true, severity: 'ok', failedRules: [] };
    }

    const failedRules: ModerationCriterioResult['failedRules'] = [];
    const lowerContent = content.toLowerCase();

    for (const rule of rules) {
      let failed = false;
      let reason = rule.check_rule;

      // Check type: forbidden words
      const config = rule.check_config as Record<string, any> | null;
      if (rule.check_type === 'forbidden' && config?.words) {
        const words = config.words as string[];
        for (const word of words) {
          if (lowerContent.includes(word.toLowerCase())) {
            failed = true;
            reason = `Palabra prohibida detectada: "${word}"`;
            break;
          }
        }
      }

      // Check type: regex
      if (rule.check_type === 'regex' && config?.pattern) {
        try {
          const regex = new RegExp(config.pattern, config.flags || 'i');
          const shouldMatch = config.should_match !== false;
          const matches = regex.test(content);
          if (shouldMatch && !matches) {
            failed = true;
            reason = `No cumple patrón requerido: ${rule.name}`;
          } else if (!shouldMatch && matches) {
            failed = true;
            reason = `Patrón prohibido detectado: ${rule.name}`;
          }
        } catch { /* invalid regex, skip */ }
      }

      // Check type: length
      if (rule.check_type === 'length' && config) {
        const len = content.length;
        if (config.min && len < config.min) {
          failed = true;
          reason = `Muy corto (${len} chars, mín ${config.min})`;
        }
        if (config.max && len > config.max) {
          failed = true;
          reason = `Muy largo (${len} chars, máx ${config.max})`;
        }
      }

      if (failed) {
        failedRules.push({ name: rule.name, severity: rule.severity, reason });
      }
    }

    if (failedRules.length === 0) {
      return { passed: true, severity: 'ok', failedRules: [] };
    }

    const hasBlocker = failedRules.some(r => r.severity === 'BLOQUEAR');
    const hasReject = failedRules.some(r => r.severity === 'Rechazar');

    return {
      passed: !hasBlocker && !hasReject,
      severity: hasBlocker ? 'block' : hasReject ? 'reject' : 'warning',
      failedRules,
    };
  } catch (err) {
    console.error('[criterio/rules-context] moderateWithCriterio error:', err);
    return { passed: true, severity: 'ok', failedRules: [] };
  }
}
