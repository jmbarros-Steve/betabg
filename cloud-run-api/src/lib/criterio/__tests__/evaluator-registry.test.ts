import { describe, it, expect } from 'vitest';
import { evaluateWithRegistry, getRegisteredTypes, registerEvaluator } from '../evaluator-registry.js';
import type { CriterioRule } from '../types.js';

function makeRule(overrides: Partial<CriterioRule> = {}): CriterioRule {
  return {
    id: 'R-TEST',
    category: 'TEST',
    name: 'Test Rule',
    check_rule: 'Test check',
    severity: 'Advertencia',
    weight: 1,
    auto: true,
    organ: 'CRITERIO',
    active: true,
    check_type: 'length',
    check_config: { field: 'text', min: 10, max: 100 },
    implemented: true,
    ...overrides,
  };
}

describe('evaluateWithRegistry', () => {
  it('returns null for manual check_type', async () => {
    const rule = makeRule({ check_type: 'manual' });
    const result = await evaluateWithRegistry(rule, { text: 'hello' });
    expect(result).toBeNull();
  });

  it('returns null for undefined check_type', async () => {
    const rule = makeRule({ check_type: undefined });
    const result = await evaluateWithRegistry(rule, { text: 'hello' });
    expect(result).toBeNull();
  });

  it('returns null for unknown check_type', async () => {
    const rule = makeRule({ check_type: 'unknown_type' });
    const result = await evaluateWithRegistry(rule, { text: 'hello' });
    expect(result).toBeNull();
  });

  it('evaluates length rule correctly', async () => {
    const rule = makeRule({
      check_type: 'length',
      check_config: { field: 'text', min: 5, max: 50 },
    });
    const result = await evaluateWithRegistry(rule, { text: 'Hello World' });
    expect(result).not.toBeNull();
    expect(result!.passed).toBe(true);
  });

  it('evaluates forbidden rule correctly', async () => {
    const rule = makeRule({
      check_type: 'forbidden',
      check_config: { field: 'text', words: ['spam', 'gratis'] },
    });

    const passResult = await evaluateWithRegistry(rule, { text: 'Great product' });
    expect(passResult!.passed).toBe(true);

    const failResult = await evaluateWithRegistry(rule, { text: 'Free gratis product' });
    expect(failResult!.passed).toBe(false);
  });

  it('evaluates regex rule correctly', async () => {
    const rule = makeRule({
      check_type: 'regex',
      check_config: { field: 'text', pattern: '#\\w+', should_match: false },
    });

    const passResult = await evaluateWithRegistry(rule, { text: 'Clean text' });
    expect(passResult!.passed).toBe(true);

    const failResult = await evaluateWithRegistry(rule, { text: '#hashtag text' });
    expect(failResult!.passed).toBe(false);
  });

  it('evaluates range rule correctly', async () => {
    const rule = makeRule({
      check_type: 'range',
      check_config: { field: 'budget', min: 3000 },
    });
    const result = await evaluateWithRegistry(rule, { budget: 5000 });
    expect(result!.passed).toBe(true);
  });

  it('evaluates comparison rule correctly', async () => {
    const rule = makeRule({
      check_type: 'comparison',
      check_config: { field_a: 'headline', field_b: 'body', operator: 'different' },
    });
    const result = await evaluateWithRegistry(rule, { headline: 'Buy', body: 'Discover' });
    expect(result!.passed).toBe(true);
  });

  it('evaluates manual_review as passed', async () => {
    const rule = makeRule({
      check_type: 'manual_review',
      check_config: { description: 'Needs human review' },
    });
    const result = await evaluateWithRegistry(rule, {});
    expect(result!.passed).toBe(true);
    expect(result!.actual).toContain('manual review');
  });

  it('handles evaluation errors gracefully (fail-open)', async () => {
    // Register a broken evaluator
    registerEvaluator('broken', () => { throw new Error('Boom!'); });
    const rule = makeRule({ check_type: 'broken', check_config: {} });
    const result = await evaluateWithRegistry(rule, {});
    expect(result).not.toBeNull();
    expect(result!.passed).toBe(true); // fail-open
    expect(result!.actual).toContain('Eval error');
  });
});

describe('getRegisteredTypes', () => {
  it('returns all registered types', () => {
    const types = getRegisteredTypes();
    expect(types).toContain('length');
    expect(types).toContain('forbidden');
    expect(types).toContain('required');
    expect(types).toContain('regex');
    expect(types).toContain('range');
    expect(types).toContain('comparison');
    expect(types).toContain('db_lookup');
    expect(types).toContain('ai');
    expect(types).toContain('external');
    expect(types).toContain('manual_review');
  });
});

describe('Meta campaign E2E simulation', () => {
  it('valid campaign passes META COPY rules', async () => {
    const campaign = {
      primary_text: 'Descubre los mejores productos para tu mascota. Compra ahora en PetStore Chile con envío rápido a todo el país. ¡Tu mascota lo merece!',
      headline: 'Los mejores productos para mascotas',
      description: 'PetStore Chile - Tu tienda de mascotas online con los mejores precios y envío rápido a todo Chile.',
      link_url: 'https://petstore.cl',
    };

    // Length check on primary_text (80-300)
    const r1 = await evaluateWithRegistry(
      makeRule({ id: 'R-001', check_type: 'length', check_config: { field: 'primary_text', min: 80, max: 300 } }),
      campaign,
    );
    expect(r1!.passed).toBe(true);

    // No hashtags
    const r16 = await evaluateWithRegistry(
      makeRule({ id: 'R-016', check_type: 'regex', check_config: { field: 'primary_text', pattern: '#\\w+', should_match: false } }),
      campaign,
    );
    expect(r16!.passed).toBe(true);

    // No double spaces
    const r30 = await evaluateWithRegistry(
      makeRule({ id: 'R-030', check_type: 'regex', check_config: { field: 'primary_text', pattern: '  +', should_match: false } }),
      campaign,
    );
    expect(r30!.passed).toBe(true);

    // No medical claims
    const r9 = await evaluateWithRegistry(
      makeRule({
        id: 'R-009', check_type: 'forbidden',
        check_config: { field: 'primary_text', words: ['cura', 'sana', 'elimina', 'garantizado', '100% efectivo', 'milagroso'] },
      }),
      campaign,
    );
    expect(r9!.passed).toBe(true);
  });

  it('bad campaign fails specific rules', async () => {
    const badCampaign = {
      primary_text: 'COMPRA YA!!! Este producto CURA todo. #oferta  #sale xq es GRATIS!!!',
      headline: 'COMPRA YA!!! Este producto CURA todo.',
      description: 'Short',
    };

    // Too short for 80 min
    const r1 = await evaluateWithRegistry(
      makeRule({ id: 'R-001', check_type: 'length', check_config: { field: 'primary_text', min: 80, max: 300 } }),
      badCampaign,
    );
    expect(r1!.passed).toBe(false);

    // Has hashtags
    const r16 = await evaluateWithRegistry(
      makeRule({ id: 'R-016', check_type: 'regex', check_config: { field: 'primary_text', pattern: '#\\w+', should_match: false } }),
      badCampaign,
    );
    expect(r16!.passed).toBe(false);

    // Has double spaces
    const r30 = await evaluateWithRegistry(
      makeRule({ id: 'R-030', check_type: 'regex', check_config: { field: 'primary_text', pattern: '  +', should_match: false } }),
      badCampaign,
    );
    expect(r30!.passed).toBe(false);

    // Has medical claims
    const r9 = await evaluateWithRegistry(
      makeRule({
        id: 'R-009', check_type: 'forbidden',
        check_config: { field: 'primary_text', words: ['cura', 'sana', 'elimina'] },
      }),
      badCampaign,
    );
    expect(r9!.passed).toBe(false);

    // Has abbreviations
    const r26 = await evaluateWithRegistry(
      makeRule({
        id: 'R-026', check_type: 'forbidden',
        check_config: { field: 'primary_text', words: ['xq', 'pq', 'tb'] },
      }),
      badCampaign,
    );
    expect(r26!.passed).toBe(false);

    // Description too short (min 50)
    const r15 = await evaluateWithRegistry(
      makeRule({ id: 'R-015', check_type: 'length', check_config: { field: 'description', min: 50, max: 200 } }),
      badCampaign,
    );
    expect(r15!.passed).toBe(false);
  });
});

describe('Email E2E simulation', () => {
  it('valid email passes key rules', async () => {
    const email = {
      subject: 'Descubre nuestra nueva colección',
      preview_text: 'Los mejores productos de temporada están aquí. No te los pierdas.',
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
        <h1>Nueva Colección</h1>
        <p>Descubre los productos que están marcando tendencia esta temporada.</p>
        <a href="https://tienda.cl?utm_source=email" class="cta">Ver colección</a>
        <img src="https://img.tienda.cl/hero.jpg" alt="Colección otoño" />
        <p><a href="https://tienda.cl/unsubscribe">Desuscribirte</a></p>
      </body></html>`,
    };

    // Subject max 50
    const r112 = await evaluateWithRegistry(
      makeRule({ id: 'R-112', check_type: 'length', check_config: { field: 'subject', max: 50 } }),
      email,
    );
    expect(r112!.passed).toBe(true);

    // Has unsubscribe link
    const r136 = await evaluateWithRegistry(
      makeRule({
        id: 'R-136', check_type: 'regex',
        check_config: { field: 'html', pattern: 'unsubscribe|desuscri', flags: 'i', should_match: true },
      }),
      email,
    );
    expect(r136!.passed).toBe(true);

    // No script tags
    const r151 = await evaluateWithRegistry(
      makeRule({ id: 'R-151', check_type: 'regex', check_config: { field: 'html', pattern: '<script', should_match: false } }),
      email,
    );
    expect(r151!.passed).toBe(true);
  });

  it('email without unsubscribe fails BLOQUEAR rule', async () => {
    const badEmail = {
      subject: 'Buy Now',
      html: '<html><body><p>Buy our stuff</p></body></html>',
    };

    const r136 = await evaluateWithRegistry(
      makeRule({
        id: 'R-136', check_type: 'regex',
        check_config: { field: 'html', pattern: 'unsubscribe|desuscri', flags: 'i', should_match: true },
      }),
      badEmail,
    );
    expect(r136!.passed).toBe(false);
  });
});
