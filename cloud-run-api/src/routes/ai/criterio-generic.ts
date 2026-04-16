// Generic CRITERIO evaluator for all non-Meta/Email/Steve categories
// Handles: UX PORTAL, SHOPIFY *, SECURITY, LEGAL, INFRA, VISUAL *, INTEL, REPORT, CROSS *
// All these categories use the config-driven registry — no legacy if-blocks needed.

import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQueryOrDefault, safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import { evaluateWithRegistry } from '../../lib/criterio/evaluator-registry.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

interface EvalResult {
  passed: boolean;
  actual: string;
  expected: string;
  details: string | null;
}

// Supported category groups and their entity types
const CATEGORY_ENTITY_MAP: Record<string, string> = {
  'UX PORTAL': 'ux_audit',
  'SHOPIFY SYNC': 'shopify_sync',
  'SHOPIFY PRODUCT': 'shopify_product',
  'SHOPIFY ORDER': 'shopify_order',
  'SHOPIFY ANALYTICS': 'shopify_analytics',
  'SECURITY': 'security_audit',
  'LEGAL': 'legal_check',
  'INFRA': 'infra_health',
  'VISUAL AD': 'visual_ad',
  'VISUAL BRAND': 'visual_brand',
  'INTEL': 'intel_scan',
  'REPORT': 'report_quality',
  'CROSS CONSIST': 'cross_consistency',
  'CROSS SYNC': 'cross_sync',
  'GOOGLE ADS': 'google_ad',
  'SOCIAL': 'social_post',
};

/**
 * Generic evaluator for any category. Pass the category name and data to evaluate.
 */
export async function criterioGenericEvaluate(
  category: string,
  data: Record<string, any>,
  shopId: string,
  entityId?: string,
): Promise<{ can_publish: boolean; score: number; reason: string; failed_rules: any[]; total?: number }> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { can_publish: true, score: 0, reason: 'Not configured', failed_rules: [] };
  }

  const supabase = getSupabaseAdmin();

  // Fetch active rules for the specified category
  const rules = await safeQueryOrDefault<any>(
    supabase
      .from('criterio_rules')
      .select('*')
      .eq('category', category)
      .eq('active', true),
    [],
    `criterio-generic.fetchRules.${category}`,
  );

  if (!rules || rules.length === 0) {
    return { can_publish: true, score: 100, reason: `No active ${category} rules`, failed_rules: [] };
  }

  // Fetch brief for context
  const brief = await safeQuerySingleOrDefault<any>(
    supabase.from('brand_research').select('*').eq('shop_id', shopId).single(),
    null,
    `criterio-generic.fetchBrief.${category}`,
  );

  // Evaluate each rule via registry
  const results = [];
  for (const rule of rules) {
    let result: EvalResult;

    if (rule.check_type && rule.check_type !== 'manual' && rule.implemented) {
      const registryResult = await evaluateWithRegistry(rule, data, { brief, supabase });
      result = registryResult || { passed: true, actual: 'Skipped', expected: rule.check_rule, details: null };
    } else {
      result = { passed: true, actual: 'Skipped (not yet implemented)', expected: rule.check_rule, details: null };
    }

    results.push({
      rule_id: rule.id,
      passed: result.passed,
      actual_value: result.actual,
      expected_value: result.expected,
      details: result.details,
      severity: rule.severity,
    });
  }

  // Call evaluate-rules edge function
  try {
    const entityType = CATEGORY_ENTITY_MAP[category] || category.toLowerCase().replace(/\s+/g, '_');
    const evalResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/evaluate-rules`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organ: 'CRITERIO',
          shop_id: shopId,
          entity_type: entityType,
          entity_id: entityId || 'audit',
          results,
        }),
      },
    );

    if (!evalResponse.ok) {
      return { can_publish: true, score: 0, reason: 'evaluate-rules unavailable', failed_rules: [] };
    }

    const result: unknown = await evalResponse.json();
    return result as { can_publish: boolean; score: number; reason: string; failed_rules: any[]; total?: number };
  } catch {
    return { can_publish: true, score: 0, reason: 'evaluate-rules error', failed_rules: [] };
  }
}

/**
 * Evaluate ALL categories at once for a full system audit.
 * Returns results per category.
 */
export async function criterioFullAudit(
  shopId: string,
  data: Record<string, Record<string, any>>,
): Promise<Record<string, { score: number; failed: number; total: number }>> {
  const results: Record<string, { score: number; failed: number; total: number }> = {};

  for (const [category, categoryData] of Object.entries(data)) {
    if (CATEGORY_ENTITY_MAP[category]) {
      const evalResult = await criterioGenericEvaluate(category, categoryData, shopId);
      results[category] = {
        score: evalResult.score || 0,
        failed: evalResult.failed_rules?.length || 0,
        total: (evalResult as any).total || 0,
      };
    }
  }

  return results;
}

/**
 * HTTP handler for generic CRITERIO evaluation.
 * POST /api/criterio-generic with { category, data, shop_id, entity_id? }
 */
export async function criterioGenericHandler(c: Context) {
  try {
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const { category, data, shop_id, entity_id } = await c.req.json();
    if (!category || !data || !shop_id) {
      return c.json({ error: 'category, data, and shop_id required' }, 400);
    }

    const result = await criterioGenericEvaluate(category, data, shop_id, entity_id);
    return c.json(result);
  } catch (error) {
    console.error('[criterio-generic] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: msg }, 500);
  }
}
