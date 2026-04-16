// AI evaluators: Claude Haiku semantic analysis
// Used for rules that require understanding tone, relevance, quality, etc.

import type { EvalResult, AiConfig, EvalContext } from './types.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

function getNestedField(data: Record<string, any>, field: string): any {
  const parts = field.split('.');
  let value: any = data;
  for (const part of parts) {
    if (value == null) return undefined;
    value = value[part];
  }
  return value;
}

export async function evaluateAi(
  config: AiConfig,
  data: Record<string, any>,
  context?: EvalContext,
): Promise<EvalResult> {
  if (!ANTHROPIC_API_KEY) {
    return {
      passed: true,
      actual: 'AI eval skipped (no API key)',
      expected: config.prompt,
      details: null,
    };
  }

  const content = getNestedField(data, config.field);
  if (!content || String(content).trim().length === 0) {
    return {
      passed: true,
      actual: 'No content to evaluate',
      expected: 'N/A',
      details: null,
    };
  }

  // Build context string from additional fields
  let contextStr = '';
  if (config.context_fields && context?.brief) {
    const contextParts = config.context_fields
      .map(f => {
        const val = getNestedField(context.brief!, f);
        return val ? `${f}: ${String(val).substring(0, 200)}` : null;
      })
      .filter(Boolean);
    if (contextParts.length > 0) {
      contextStr = `\n\nContext:\n${contextParts.join('\n')}`;
    }
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `${config.prompt}\n\nContent to evaluate:\n"${String(content).substring(0, 1000)}"${contextStr}\n\nRespond with ONLY a JSON object: {"pass": true/false, "reason": "brief explanation", "score": 0.0-1.0}`,
        }],
      }),
    });

    if (!response.ok) {
      console.error(`[criterio-ai] Claude API error: ${response.status}`);
      return { passed: true, actual: 'AI eval failed (API error)', expected: config.prompt, details: null };
    }

    const result = await response.json() as { content?: Array<{ text?: string }> };
    const text = result.content?.[0]?.text || '';

    // Parse JSON response
    const jsonMatch = text.match(/\{[^}]+\}/);
    if (!jsonMatch) {
      return { passed: true, actual: 'AI eval failed (parse error)', expected: config.prompt, details: null };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const threshold = config.threshold ?? 0.7;
    const score = parsed.score ?? (parsed.pass ? 1.0 : 0.0);
    const passed = score >= threshold;

    return {
      passed,
      actual: `Score: ${score.toFixed(2)} — ${parsed.reason || 'No reason'}`,
      expected: `Min ${threshold}`,
      details: !passed ? (parsed.reason || 'Did not meet AI evaluation threshold') : null,
    };
  } catch (error) {
    console.error('[criterio-ai] Evaluation error:', error);
    return {
      passed: true, // fail-open on AI errors
      actual: 'AI eval error (fail-open)',
      expected: config.prompt,
      details: `AI eval error: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}
