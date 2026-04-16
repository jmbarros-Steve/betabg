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
    value = value[part];
  }
  return value;
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

  const found = config.words.filter(word => {
    const searchWord = config.case_sensitive ? word : word.toLowerCase();
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
  const value = getNestedField(data, config.field);
  const exists = value != null && String(value).trim().length > 0;

  if (!exists) {
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
  const hasMatch = matches !== null && matches.length > 0;

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
  const num = typeof value === 'number' ? value : parseFloat(String(value || '0'));

  if (isNaN(num)) {
    return {
      passed: false,
      actual: `Invalid number: ${value}`,
      expected: `Numeric value`,
      details: `Field "${config.field}" is not a valid number`,
    };
  }

  const min = config.min ?? -Infinity;
  const max = config.max ?? Infinity;
  const unit = config.unit || '';
  const passed = num >= min && num <= max;

  const expected = config.min != null && config.max != null
    ? `${min}-${max}${unit ? ' ' + unit : ''}`
    : config.min != null
      ? `Min ${min}${unit ? ' ' + unit : ''}`
      : `Max ${max}${unit ? ' ' + unit : ''}`;

  return {
    passed,
    actual: `${num}${unit ? ' ' + unit : ''}`,
    expected,
    details: !passed
      ? (num < min ? `Value ${num} below minimum ${min}` : `Value ${num} above maximum ${max}`)
      : null,
  };
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
