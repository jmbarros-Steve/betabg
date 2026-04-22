// Simple evaluators: length, forbidden, required, regex, range, comparison
// These handle ~70% of all rules with pure data checks (no DB, no AI, no external API)

import type {
  EvalResult,
  LengthConfig,
  ForbiddenConfig,
  RequiredConfig,
  RegexConfig,
  RangeConfig,
  ComparisonConfig,
} from './types.js';

function getNestedField(data: Record<string, any>, field: string): any {
  const parts = field.split('.');
  let value: any = data;
  for (const part of parts) {
    if (value == null) return undefined;
    // Special-case: "length" on an array-like treated as .length prop.
    if (part === 'length' && (Array.isArray(value) || typeof value === 'string')) {
      value = value.length;
      continue;
    }
    value = value[part];
  }
  return value;
}

/**
 * True if the field was not provided in the payload (undefined or null).
 * We distinguish this from "empty string" or "0", which ARE values.
 */
function isFieldAbsent(data: Record<string, any>, field: string): boolean {
  const v = getNestedField(data, field);
  return v === undefined || v === null;
}

/**
 * Escape a word for use inside a regex literal.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function evaluateLength(config: LengthConfig, data: Record<string, any>): EvalResult {
  const value = getNestedField(data, config.field);
  const text = String(value || '');
  const len = text.length;

  const min = config.min ?? 0;
  const max = config.max ?? Infinity;
  const passed = len >= min && len <= max;

  const expected = config.min != null && config.max != null
    ? `${min}-${max} chars`
    : config.min != null
      ? `Min ${min} chars`
      : `Max ${max} chars`;

  return {
    passed,
    actual: `${len} chars`,
    expected,
    details: !passed
      ? (len < min ? `Too short (${len} < ${min})` : `Too long (${len} > ${max})`)
      : null,
  };
}

export function evaluateForbidden(config: ForbiddenConfig, data: Record<string, any>): EvalResult {
  const value = getNestedField(data, config.field);
  const text = String(value || '');
  const searchText = config.case_sensitive ? text : text.toLowerCase();
  // word_boundary: when true, each forbidden word is matched as a whole word
  // (\bword\b) to avoid false positives like "q" matching "que".
  const wordBoundary = config.word_boundary === true;
  const words = config.words ?? [];

  const found = words.filter(word => {
    const searchWord = config.case_sensitive ? word : word.toLowerCase();
    if (wordBoundary) {
      const flags = config.case_sensitive ? '' : 'i';
      const re = new RegExp(`\\b${escapeRegex(searchWord)}\\b`, flags);
      return re.test(searchText);
    }
    return searchText.includes(searchWord);
  });

  return {
    passed: found.length === 0,
    actual: found.length > 0 ? `Found: ${found.join(', ')}` : 'Clean',
    expected: 'No forbidden words',
    details: found.length > 0 ? `Forbidden words detected: ${found.join(', ')}` : null,
  };
}

export function evaluateRequired(config: RequiredConfig, data: Record<string, any>): EvalResult {
  // Conditional rule: only enforce this requirement when another field has a
  // specific value. Example: R-108 "DPA template limpio" only applies when
  // creative_type === 'dpa'. For non-DPA creatives, skip entirely.
  const conditionalField = (config as any).conditional_field;
  const conditionalValue = (config as any).conditional_value;
  if (conditionalField && conditionalValue !== undefined) {
    const actualConditional = getNestedField(data, conditionalField);
    if (actualConditional !== conditionalValue) {
      return {
        passed: true,
        actual: `Not applicable (${conditionalField}=${actualConditional ?? 'absent'})`,
        expected: `Only required when ${conditionalField}=${conditionalValue}`,
        details: null,
        skipped: true,
      };
    }
  }

  const value = getNestedField(data, config.field);
  const exists = value != null && String(value).trim().length > 0;

  // Skip (not fail) when the PARENT object of the field exists but this
  // subfield is missing — e.g. targeting is set but targeting.countries
  // isn't provided. This prevents "Field X required but missing" fails on
  // payloads where the section simply wasn't populated. Top-level fields
  // with no parent still fail as before.
  if (!exists) {
    const parts = config.field.split('.');
    if (parts.length > 1) {
      const parentField = parts.slice(0, -1).join('.');
      const parent = getNestedField(data, parentField);
      if (parent === undefined || parent === null) {
        return {
          passed: true,
          actual: 'Not applicable (field absent)',
          expected: `${config.field} required`,
          details: null,
          skipped: true,
        };
      }
    }
    return {
      passed: false,
      actual: 'Missing or empty',
      expected: `${config.field} required`,
      details: `Field "${config.field}" is required but missing or empty`,
    };
  }

  if (config.contains) {
    const text = String(value).toLowerCase();
    const hasContent = text.includes(config.contains.toLowerCase());
    return {
      passed: hasContent,
      actual: hasContent ? `Contains "${config.contains}"` : `Missing "${config.contains}"`,
      expected: `Must contain "${config.contains}"`,
      details: hasContent ? null : `Expected "${config.contains}" in ${config.field}`,
    };
  }

  return {
    passed: true,
    actual: String(value).substring(0, 100),
    expected: `${config.field} present`,
    details: null,
  };
}

export function evaluateRegex(config: RegexConfig, data: Record<string, any>): EvalResult {
  const value = getNestedField(data, config.field);
  const text = String(value || '');
  const flags = config.flags || 'gi';
  const regex = new RegExp(config.pattern, flags);
  const matches = text.match(regex);
  const matchCount = matches ? matches.length : 0;
  const hasMatch = matchCount > 0;

  // Mode: "quota" — rule allows up to N% or N matches, not a hard yes/no.
  // Used e.g. for R-011 "MAYÚSCULAS excesivas" (max_pct: 30).
  if (config.max_pct != null) {
    // Base the percentage on the count of "countable" chars in the text.
    // For case-based regex (A-Z) this should be the total letter count, not
    // total chars incl. spaces/punct. We approximate by counting word chars.
    const letters = text.match(/[\p{L}]/gu) || [];
    const total = letters.length;
    const pct = total > 0 ? Math.round((matchCount / total) * 100) : 0;
    const passed = pct <= config.max_pct;
    return {
      passed,
      actual: `${pct}% (${matchCount}/${total})`,
      expected: `Max ${config.max_pct}%`,
      details: passed ? null : `Exceeds ${config.max_pct}% threshold: ${pct}%`,
    };
  }

  if (config.max_matches != null) {
    const passed = matchCount <= config.max_matches;
    return {
      passed,
      actual: `${matchCount} matches`,
      expected: `Max ${config.max_matches} matches`,
      details: passed ? null : `Too many matches: ${matchCount} > ${config.max_matches}`,
    };
  }

  // should_match defaults to false (pattern should NOT match — e.g. forbidden patterns)
  const shouldMatch = config.should_match ?? false;
  const passed = shouldMatch ? hasMatch : !hasMatch;

  return {
    passed,
    actual: hasMatch ? `Matched: ${matches!.slice(0, 3).join(', ')}` : 'No match',
    expected: shouldMatch ? `Must match /${config.pattern}/` : `Must NOT match /${config.pattern}/`,
    details: !passed
      ? (shouldMatch ? `Pattern not found: /${config.pattern}/` : `Unwanted pattern found: ${matches!.slice(0, 3).join(', ')}`)
      : null,
  };
}

export function evaluateRange(config: RangeConfig, data: Record<string, any>): EvalResult {
  const value = getNestedField(data, config.field);

  // Skip when the field is genuinely absent from the payload. Comparing
  // `undefined` against `min: 2` would always fail and produce noise like
  // "Value 0 below minimum 2" for every campaign that doesn't include that
  // section (e.g. estimated_reach, lookalike_source_size, custom_audience_size).
  if (isFieldAbsent(data, config.field)) {
    return {
      passed: true,
      actual: 'Not applicable (field absent)',
      expected: describeRange(config),
      details: null,
      skipped: true,
    };
  }

  const num = typeof value === 'number' ? value : parseFloat(String(value));

  if (isNaN(num)) {
    return {
      passed: false,
      actual: `Invalid number: ${value}`,
      expected: `Numeric value`,
      details: `Field "${config.field}" is not a valid number`,
    };
  }

  // skip_if_zero: legitimate broad-targeting / opt-out cases where 0 means
  // "not using this dimension" — e.g. R-033 (interests=0 is valid broad).
  if (config.skip_if_zero && num === 0) {
    return {
      passed: true,
      actual: '0 (skipped: skip_if_zero)',
      expected: describeRange(config),
      details: null,
      skipped: true,
    };
  }

  const min = config.min ?? -Infinity;
  const max = config.max ?? Infinity;
  const unit = config.unit || '';
  const passed = num >= min && num <= max;

  return {
    passed,
    actual: `${num}${unit ? ' ' + unit : ''}`,
    expected: describeRange(config),
    details: !passed
      ? (num < min ? `Value ${num} below minimum ${min}` : `Value ${num} above maximum ${max}`)
      : null,
  };
}

function describeRange(config: RangeConfig): string {
  const unit = config.unit || '';
  const suffix = unit ? ' ' + unit : '';
  if (config.min != null && config.max != null) return `${config.min}-${config.max}${suffix}`;
  if (config.min != null) return `Min ${config.min}${suffix}`;
  if (config.max != null) return `Max ${config.max}${suffix}`;
  return 'Numeric';
}

export function evaluateComparison(config: ComparisonConfig, data: Record<string, any>): EvalResult {
  const valueA = getNestedField(data, config.field_a);
  const valueB = getNestedField(data, config.field_b);

  let passed = false;
  const strA = String(valueA ?? '').toLowerCase();
  const strB = String(valueB ?? '').toLowerCase();

  switch (config.operator) {
    case 'eq':
      passed = strA === strB;
      break;
    case 'neq':
    case 'different':
      passed = strA !== strB;
      break;
    case 'gt':
      passed = Number(valueA) > Number(valueB);
      break;
    case 'lt':
      passed = Number(valueA) < Number(valueB);
      break;
    case 'gte':
      passed = Number(valueA) >= Number(valueB);
      break;
    case 'lte':
      passed = Number(valueA) <= Number(valueB);
      break;
    case 'contains':
      passed = strA.includes(strB);
      break;
  }

  return {
    passed,
    actual: `${config.field_a}=${String(valueA ?? 'null').substring(0, 50)}`,
    expected: `${config.operator} ${config.field_b}=${String(valueB ?? 'null').substring(0, 50)}`,
    details: !passed
      ? (config.description || `${config.field_a} ${config.operator} ${config.field_b} failed`)
      : null,
  };
}
