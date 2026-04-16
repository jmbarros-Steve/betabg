// External API evaluators: LanguageTool, Claude Vision, video metadata
// Used for rules that require external service calls

import type { EvalResult, ExternalConfig, EvalContext } from './types.js';

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

export async function evaluateExternal(
  config: ExternalConfig,
  data: Record<string, any>,
  _context?: EvalContext,
): Promise<EvalResult> {
  const value = getNestedField(data, config.field);
  if (!value) {
    return { passed: true, actual: 'No content to check', expected: 'N/A', details: null };
  }

  try {
    switch (config.service) {
      case 'languagetool':
        return await checkLanguageTool(String(value), config.language || 'es');

      case 'vision':
        return await checkVision(String(value), config.check || 'quality');

      case 'ffmpeg':
        // Video metadata checks — placeholder for now
        return {
          passed: true,
          actual: 'Video check skipped (ffmpeg not available in Cloud Run)',
          expected: config.check || 'video metadata',
          details: null,
        };

      default:
        return {
          passed: true,
          actual: `Unknown service: ${config.service}`,
          expected: 'N/A',
          details: null,
        };
    }
  } catch (error) {
    console.error(`[criterio-external] ${config.service} check failed:`, error);
    return {
      passed: true, // fail-open on external errors
      actual: `${config.service} error (fail-open)`,
      expected: config.check || config.service,
      details: `External check error: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

async function checkLanguageTool(text: string, language: string): Promise<EvalResult> {
  // Strip HTML if present
  const cleanText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleanText.length < 10) {
    return { passed: true, actual: 'Text too short to check', expected: 'No errors', details: null };
  }

  const response = await fetch('https://api.languagetool.org/v2/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      text: cleanText.substring(0, 5000),
      language,
      enabledOnly: 'false',
    }),
  });

  if (!response.ok) {
    return { passed: true, actual: 'LanguageTool unavailable', expected: 'No errors', details: null };
  }

  const result = await response.json() as { matches?: any[] };
  const errors = result.matches || [];

  // Filter out minor style suggestions, keep only spelling/grammar
  const realErrors = errors.filter((e: any) =>
    e.rule?.category?.id === 'TYPOS' ||
    e.rule?.category?.id === 'GRAMMAR' ||
    e.rule?.category?.id === 'PUNCTUATION'
  );

  return {
    passed: realErrors.length === 0,
    actual: realErrors.length > 0
      ? `${realErrors.length} errors: ${realErrors.slice(0, 3).map((e: any) => `"${e.context?.text?.substring(e.context.offset, e.context.offset + e.context.length)}" → ${e.message}`).join('; ')}`
      : '0 errors',
    expected: '0 spelling/grammar errors',
    details: realErrors.length > 0 ? `Found ${realErrors.length} spelling/grammar error(s)` : null,
  };
}

async function checkVision(imageUrl: string, check: string): Promise<EvalResult> {
  if (!ANTHROPIC_API_KEY) {
    return { passed: true, actual: 'Vision check skipped (no API key)', expected: check, details: null };
  }

  // Only process URLs, not base64 or local paths
  if (!imageUrl.startsWith('http')) {
    return { passed: true, actual: 'Not a URL — skipped', expected: check, details: null };
  }

  const prompts: Record<string, string> = {
    blur: 'Is this image blurry or low quality? Respond with JSON: {"pass": true/false, "reason": "brief"}. pass=true means image is clear/good quality.',
    logo: 'Does this image contain a brand logo? Respond with JSON: {"pass": true/false, "reason": "brief"}. pass=true means logo is present.',
    text_overlay: 'Does this image have text that is cut off or unreadable? Respond with JSON: {"pass": true/false, "reason": "brief"}. pass=true means text is fine.',
    quality: 'Is this image high quality and suitable for an ad? Respond with JSON: {"pass": true/false, "reason": "brief"}. pass=true means good quality.',
    inappropriate: 'Does this image contain sexual, violent, or inappropriate content? Respond with JSON: {"pass": true/false, "reason": "brief"}. pass=true means image is appropriate/safe.',
  };

  const prompt = prompts[check] || prompts.quality;

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
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: imageUrl } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (!response.ok) {
      return { passed: true, actual: 'Vision API error', expected: check, details: null };
    }

    const result = await response.json() as { content?: Array<{ text?: string }> };
    const text = result.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[^}]+\}/);

    if (!jsonMatch) {
      return { passed: true, actual: 'Vision parse error', expected: check, details: null };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      passed: parsed.pass === true,
      actual: parsed.reason || (parsed.pass ? 'OK' : 'Failed'),
      expected: check,
      details: !parsed.pass ? (parsed.reason || `Vision check "${check}" failed`) : null,
    };
  } catch (error) {
    return { passed: true, actual: 'Vision error (fail-open)', expected: check, details: null };
  }
}
