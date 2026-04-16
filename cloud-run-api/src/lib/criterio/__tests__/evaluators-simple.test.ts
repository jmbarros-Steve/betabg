import { describe, it, expect } from 'vitest';
import {
  evaluateLength,
  evaluateForbidden,
  evaluateRequired,
  evaluateRegex,
  evaluateRange,
  evaluateComparison,
} from '../evaluators-simple.js';

describe('evaluateLength', () => {
  it('passes when within range', () => {
    const result = evaluateLength(
      { field: 'primary_text', min: 80, max: 300 },
      { primary_text: 'A'.repeat(150) },
    );
    expect(result.passed).toBe(true);
  });

  it('fails when too short', () => {
    const result = evaluateLength(
      { field: 'primary_text', min: 80, max: 300 },
      { primary_text: 'Short' },
    );
    expect(result.passed).toBe(false);
    expect(result.details).toContain('Too short');
  });

  it('fails when too long', () => {
    const result = evaluateLength(
      { field: 'primary_text', min: 80, max: 300 },
      { primary_text: 'A'.repeat(500) },
    );
    expect(result.passed).toBe(false);
    expect(result.details).toContain('Too long');
  });

  it('handles nested fields', () => {
    const result = evaluateLength(
      { field: 'campaign.headline', min: 10 },
      { campaign: { headline: 'Great Headline Here' } },
    );
    expect(result.passed).toBe(true);
  });

  it('handles missing fields gracefully', () => {
    const result = evaluateLength(
      { field: 'missing_field', min: 10 },
      {},
    );
    expect(result.passed).toBe(false);
    expect(result.actual).toBe('0 chars');
  });
});

describe('evaluateForbidden', () => {
  it('passes when no forbidden words found', () => {
    const result = evaluateForbidden(
      { field: 'text', words: ['cura', 'sana', 'elimina'] },
      { text: 'Compra el mejor producto para tu mascota' },
    );
    expect(result.passed).toBe(true);
  });

  it('fails when forbidden word found', () => {
    const result = evaluateForbidden(
      { field: 'text', words: ['cura', 'sana', 'elimina'] },
      { text: 'Este producto cura todas las enfermedades' },
    );
    expect(result.passed).toBe(false);
    expect(result.actual).toContain('cura');
  });

  it('case insensitive by default', () => {
    const result = evaluateForbidden(
      { field: 'text', words: ['GRATIS'] },
      { text: 'Producto gratis para ti' },
    );
    expect(result.passed).toBe(false);
  });

  it('respects case_sensitive flag', () => {
    const result = evaluateForbidden(
      { field: 'text', words: ['GRATIS'], case_sensitive: true },
      { text: 'Producto gratis para ti' },
    );
    expect(result.passed).toBe(true);
  });
});

describe('evaluateRequired', () => {
  it('passes when field exists and has value', () => {
    const result = evaluateRequired(
      { field: 'cta_url' },
      { cta_url: 'https://example.com' },
    );
    expect(result.passed).toBe(true);
  });

  it('fails when field is missing', () => {
    const result = evaluateRequired(
      { field: 'cta_url' },
      {},
    );
    expect(result.passed).toBe(false);
  });

  it('fails when field is empty string', () => {
    const result = evaluateRequired(
      { field: 'cta_url' },
      { cta_url: '  ' },
    );
    expect(result.passed).toBe(false);
  });

  it('checks contains when specified', () => {
    const result = evaluateRequired(
      { field: 'text', contains: 'CL' },
      { text: 'Chile CL zone' },
    );
    expect(result.passed).toBe(true);
  });

  it('fails contains check when substring missing', () => {
    const result = evaluateRequired(
      { field: 'text', contains: 'CL' },
      { text: 'Argentina AR zone' },
    );
    expect(result.passed).toBe(false);
  });
});

describe('evaluateRegex', () => {
  it('passes when pattern should NOT match and does not', () => {
    const result = evaluateRegex(
      { field: 'text', pattern: '#\\w+', should_match: false },
      { text: 'Clean copy without hashtags' },
    );
    expect(result.passed).toBe(true);
  });

  it('fails when pattern should NOT match but does', () => {
    const result = evaluateRegex(
      { field: 'text', pattern: '#\\w+', should_match: false },
      { text: 'Check out #sale #promo' },
    );
    expect(result.passed).toBe(false);
  });

  it('passes when pattern should match and does', () => {
    const result = evaluateRegex(
      { field: 'text', pattern: 'https?://\\S+', should_match: true },
      { text: 'Visit https://example.com' },
    );
    expect(result.passed).toBe(true);
  });

  it('default should_match is false', () => {
    const result = evaluateRegex(
      { field: 'text', pattern: '  +' },
      { text: 'No  double  spaces' },
    );
    expect(result.passed).toBe(false);
  });
});

describe('evaluateRange', () => {
  it('passes when value in range', () => {
    const result = evaluateRange(
      { field: 'budget', min: 3000, max: 100000, unit: 'CLP' },
      { budget: 5000 },
    );
    expect(result.passed).toBe(true);
  });

  it('fails when below minimum', () => {
    const result = evaluateRange(
      { field: 'budget', min: 3000 },
      { budget: 1000 },
    );
    expect(result.passed).toBe(false);
  });

  it('fails when above maximum', () => {
    const result = evaluateRange(
      { field: 'budget', max: 100000 },
      { budget: 200000 },
    );
    expect(result.passed).toBe(false);
  });

  it('handles string numbers', () => {
    const result = evaluateRange(
      { field: 'size', min: 100 },
      { size: '250' },
    );
    expect(result.passed).toBe(true);
  });
});

describe('evaluateComparison', () => {
  it('passes when fields are different (neq)', () => {
    const result = evaluateComparison(
      { field_a: 'headline', field_b: 'body_first_line', operator: 'different' },
      { headline: 'Buy Now', body_first_line: 'Discover our collection' },
    );
    expect(result.passed).toBe(true);
  });

  it('fails when fields are same (neq)', () => {
    const result = evaluateComparison(
      { field_a: 'headline', field_b: 'body_first_line', operator: 'different' },
      { headline: 'Buy Now', body_first_line: 'Buy Now' },
    );
    expect(result.passed).toBe(false);
  });

  it('passes eq comparison', () => {
    const result = evaluateComparison(
      { field_a: 'currency', field_b: 'expected_currency', operator: 'eq' },
      { currency: 'CLP', expected_currency: 'CLP' },
    );
    expect(result.passed).toBe(true);
  });

  it('handles numeric comparisons', () => {
    const result = evaluateComparison(
      { field_a: 'budget', field_b: 'min_budget', operator: 'gte' },
      { budget: 5000, min_budget: 3000 },
    );
    expect(result.passed).toBe(true);
  });
});
