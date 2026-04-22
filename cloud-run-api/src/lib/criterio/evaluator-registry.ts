// Evaluator Registry: maps check_type → evaluator function
// This is the core of the config-driven CRITERIO system.
// Rules in criterio_rules have check_type + check_config → the registry dispatches to the right evaluator.

import type { CriterioRule, EvalResult, EvalContext, CheckConfig } from './types.js';
import {
  evaluateLength,
  evaluateForbidden,
  evaluateRequired,
  evaluateRegex,
  evaluateRange,
  evaluateComparison,
} from './evaluators-simple.js';
import { evaluateDbLookup } from './evaluators-data.js';
import { evaluateAi } from './evaluators-ai.js';
import { evaluateExternal } from './evaluators-external.js';

type SyncEvaluator = (config: CheckConfig, data: Record<string, any>, context?: EvalContext, rule?: CriterioRule) => EvalResult;
type AsyncEvaluator = (config: CheckConfig, data: Record<string, any>, context?: EvalContext, rule?: CriterioRule) => Promise<EvalResult>;
type Evaluator = SyncEvaluator | AsyncEvaluator;

// Registry: check_type → evaluator function
const evaluatorRegistry: Record<string, Evaluator> = {
  length: evaluateLength as Evaluator,
  forbidden: evaluateForbidden as Evaluator,
  required: evaluateRequired as Evaluator,
  regex: evaluateRegex as Evaluator,
  range: evaluateRange as Evaluator,
  comparison: evaluateComparison as Evaluator,
  db_lookup: evaluateDbLookup as Evaluator,
  ai: evaluateAi as Evaluator,
  external: evaluateExternal as Evaluator,
  // manual_review: rules that don't block but create a task for human review
  manual_review: (config: any, _data: Record<string, any>) => ({
    passed: true,
    actual: 'Pending manual review',
    expected: config.description || 'Human review required',
    details: null,
  }),
};

/**
 * Evaluate a rule using the config-driven registry.
 * Returns null if the check_type is unknown (caller should fallback to legacy evaluation).
 */
export async function evaluateWithRegistry(
  rule: CriterioRule,
  data: Record<string, any>,
  context?: EvalContext,
): Promise<EvalResult | null> {
  const checkType = rule.check_type;
  if (!checkType || checkType === 'manual') return null;

  const evaluator = evaluatorRegistry[checkType];
  if (!evaluator) {
    console.warn(`[criterio-registry] Unknown check_type "${checkType}" for rule ${rule.id}`);
    return null;
  }

  const config = rule.check_config || {};

  try {
    const result = await evaluator(config, data, context, rule);
    return result;
  } catch (error) {
    console.error(`[criterio-registry] Error evaluating rule ${rule.id} (${checkType}):`, error);
    // Registry-level catch: unexpected evaluator crash. AI + external
    // evaluators already handle their own failures fail-closed; this path is
    // for sync evaluators that throw unexpectedly. Keep fail-open here to
    // avoid blocking on simple-evaluator bugs, but log loudly.
    return {
      passed: true,
      actual: `Eval error (fail-open): ${error instanceof Error ? error.message : 'Unknown'}`,
      expected: rule.check_rule,
      details: null,
    };
  }
}

/**
 * Register a custom evaluator for a new check_type.
 * Useful for domain-specific evaluators (criterio-steve, criterio-shopify, etc.)
 */
export function registerEvaluator(checkType: string, evaluator: Evaluator): void {
  evaluatorRegistry[checkType] = evaluator;
}

/**
 * Get list of all registered check_types (for debugging/admin)
 */
export function getRegisteredTypes(): string[] {
  return Object.keys(evaluatorRegistry);
}
