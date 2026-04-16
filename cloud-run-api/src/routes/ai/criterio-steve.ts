// CRITERIO evaluator for STEVE RESP, STEVE RECO, STEVE DATOS categories
// Handles rules about Steve AI response quality, recommendations quality, and data accuracy

import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQueryOrDefault, safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import { evaluateWithRegistry } from '../../lib/criterio/evaluator-registry.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

interface SteveResponseData {
  response_text?: string;
  question?: string;
  channel?: string;
  response_time_ms?: number;
  shop_id?: string;
  merchant_name?: string;
  conversation_id?: string;
  previous_messages?: Array<{ role: string; content: string }>;
  products_mentioned?: string[];
  data_claims?: Array<{ field: string; value: any }>;
  recommendation?: {
    type: string;
    product_id?: string;
    campaign_type?: string;
    budget?: number;
    segment?: string;
    angle?: string;
  };
}

interface EvalResult {
  passed: boolean;
  actual: string;
  expected: string;
  details: string | null;
}

export async function criterioSteveEvaluate(
  data: SteveResponseData,
  shopId: string,
): Promise<{ can_publish: boolean; score: number; reason: string; failed_rules: any[] }> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { can_publish: true, score: 0, reason: 'Not configured', failed_rules: [] };
  }

  const supabase = getSupabaseAdmin();

  // Fetch all active STEVE rules
  const rules = await safeQueryOrDefault<any>(
    supabase
      .from('criterio_rules')
      .select('*')
      .in('category', ['STEVE RESP', 'STEVE RECO', 'STEVE DATOS'])
      .eq('active', true),
    [],
    'criterio-steve.fetchRules',
  );

  if (!rules || rules.length === 0) {
    return { can_publish: true, score: 100, reason: 'No STEVE rules', failed_rules: [] };
  }

  const brief = await safeQuerySingleOrDefault<any>(
    supabase.from('brand_research').select('*').eq('shop_id', shopId).single(),
    null,
    'criterio-steve.fetchBrief',
  );

  const results = [];
  for (const rule of rules) {
    let result: EvalResult;

    if (rule.check_type && rule.check_type !== 'manual' && rule.implemented) {
      const registryResult = await evaluateWithRegistry(rule, data as Record<string, any>, { brief });
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
          entity_type: 'steve_response',
          entity_id: data.conversation_id || 'unknown',
          results,
        }),
      },
    );

    if (!evalResponse.ok) {
      return { can_publish: true, score: 0, reason: 'evaluate-rules unavailable', failed_rules: [] };
    }

    const result: unknown = await evalResponse.json();
    return result as { can_publish: boolean; score: number; reason: string; failed_rules: any[] };
  } catch {
    return { can_publish: true, score: 0, reason: 'evaluate-rules error', failed_rules: [] };
  }
}

export async function criterioSteveHandler(c: Context) {
  try {
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const { response_data, shop_id } = await c.req.json();
    if (!response_data || !shop_id) {
      return c.json({ error: 'response_data and shop_id required' }, 400);
    }

    const result = await criterioSteveEvaluate(response_data, shop_id);
    return c.json(result);
  } catch (error) {
    console.error('[criterio-steve] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: msg }, 500);
  }
}
