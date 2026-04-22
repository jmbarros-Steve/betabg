// Tests for evaluators-data.ts — R-005 (price matches Shopify), R-007 (stock).
// We stub the Supabase client so tests are fully offline.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DbLookupConfig, EvalContext } from '../types.js';

// Build a chainable mock that mimics the tiny slice of the supabase-js API
// that evaluators-data uses: from().select().eq().limit() → Promise<{data,error}>.
function mockSupabase(rows: any[] | null, error: any = null) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: rows, error }),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: rows && rows[0] ? rows[0] : null, error }),
  };
  const client: any = {
    from: vi.fn().mockReturnValue(chain),
  };
  return { client, chain };
}

// Import evaluator AFTER we've set up the mock factory below.
// We mock '../../supabase.js' so `getSupabaseAdmin()` returns our stub.
let supabaseMockClient: any = null;
vi.mock('../../supabase.js', () => ({
  getSupabaseAdmin: () => supabaseMockClient,
}));

const { evaluateDbLookup } = await import('../evaluators-data.js');

describe('evaluateDbLookup — R-007 stock check on shopify_products', () => {
  beforeEach(() => {
    supabaseMockClient = null;
  });

  const config: DbLookupConfig = {
    table: 'shopify_products',
    match_field: 'id',
    match_value_field: 'product_ids[0]',
    check: 'exists',
  };

  it('skips when no product_ids provided', async () => {
    supabaseMockClient = mockSupabase([]).client;
    const result = await evaluateDbLookup(config, {});
    expect(result.passed).toBe(true);
    expect(result.skipped).toBe(true);
  });

  it('fails when product not found', async () => {
    supabaseMockClient = mockSupabase([]).client;
    const result = await evaluateDbLookup(config, { product_ids: ['abc-123'] });
    expect(result.passed).toBe(false);
    expect(result.details).toContain('no existe');
  });

  it('fails when product has zero inventory', async () => {
    supabaseMockClient = mockSupabase([
      { id: 'abc-123', title: 'Producto Test', inventory_total: 0, status: 'active' },
    ]).client;
    const result = await evaluateDbLookup(config, { product_ids: ['abc-123'] });
    expect(result.passed).toBe(false);
    expect(result.actual).toBe('Sin stock');
    expect(result.details).toContain('inventory_total=0');
  });

  it('fails when product status is not active', async () => {
    supabaseMockClient = mockSupabase([
      { id: 'abc-123', title: 'Producto Test', inventory_total: 100, status: 'archived' },
    ]).client;
    const result = await evaluateDbLookup(config, { product_ids: ['abc-123'] });
    expect(result.passed).toBe(false);
    expect(result.details).toContain('no está activo');
  });

  it('passes when product has stock and is active', async () => {
    supabaseMockClient = mockSupabase([
      { id: 'abc-123', title: 'Producto Test', inventory_total: 50, status: 'active' },
    ]).client;
    const result = await evaluateDbLookup(config, { product_ids: ['abc-123'] });
    expect(result.passed).toBe(true);
    expect(result.actual).toContain('50 en stock');
  });
});

describe('evaluateDbLookup — R-005 price matches Shopify', () => {
  beforeEach(() => {
    supabaseMockClient = null;
  });

  const config: DbLookupConfig = {
    table: 'shopify_products',
    match_field: 'id',
    match_value_field: 'product_ids[0]',
    check: 'value_matches',
    value_field: 'price',
  };

  it('skips when copy has no price mentioned', async () => {
    supabaseMockClient = mockSupabase([
      { id: 'abc-123', title: 'P', price_min: 19990, price_max: 19990 },
    ]).client;
    const result = await evaluateDbLookup(config, {
      product_ids: ['abc-123'],
      primary_text: 'Los mejores productos para ti',
    });
    expect(result.passed).toBe(true);
    expect(result.skipped).toBe(true);
  });

  it('passes when price in copy matches shopify price', async () => {
    supabaseMockClient = mockSupabase([
      { id: 'abc-123', title: 'Zapatillas', price_min: 19990, price_max: 19990 },
    ]).client;
    const result = await evaluateDbLookup(config, {
      product_ids: ['abc-123'],
      primary_text: 'Ahora a sólo $19.990',
    });
    expect(result.passed).toBe(true);
    expect(result.actual).toBe('$19.990');
  });

  it('passes when price is within 2% tolerance', async () => {
    supabaseMockClient = mockSupabase([
      { id: 'abc-123', title: 'Zapatillas', price_min: 20000, price_max: 20000 },
    ]).client;
    const result = await evaluateDbLookup(config, {
      product_ids: ['abc-123'],
      primary_text: 'Sólo $20.100', // within 2%
    });
    expect(result.passed).toBe(true);
  });

  it('fails when copy price mismatches by more than tolerance', async () => {
    supabaseMockClient = mockSupabase([
      { id: 'abc-123', title: 'Zapatillas', price_min: 19990, price_max: 19990 },
    ]).client;
    const result = await evaluateDbLookup(config, {
      product_ids: ['abc-123'],
      primary_text: 'Sólo $9.990 (engaño)',
    });
    expect(result.passed).toBe(false);
    expect(result.details).toContain('Shopify');
  });

  it('accepts price band (price_min..price_max) for variant products', async () => {
    supabaseMockClient = mockSupabase([
      { id: 'abc-123', title: 'Polera', price_min: 14990, price_max: 24990 },
    ]).client;
    // Copy mentions mid-band price
    const r1 = await evaluateDbLookup(config, {
      product_ids: ['abc-123'],
      primary_text: 'Desde $14.990',
    });
    expect(r1.passed).toBe(true);
    // Copy mentions upper-band price
    supabaseMockClient = mockSupabase([
      { id: 'abc-123', title: 'Polera', price_min: 14990, price_max: 24990 },
    ]).client;
    const r2 = await evaluateDbLookup(config, {
      product_ids: ['abc-123'],
      primary_text: 'Hasta $24.990',
    });
    expect(r2.passed).toBe(true);
  });
});

describe('evaluateDbLookup — generic exists on non-shopify table', () => {
  beforeEach(() => {
    supabaseMockClient = null;
  });

  it('passes when record exists', async () => {
    supabaseMockClient = mockSupabase([{ id: 'x' }]).client;
    const result = await evaluateDbLookup(
      {
        table: 'brand_research',
        match_field: 'shop_id',
        match_value_field: 'shop_id',
        check: 'exists',
      } as DbLookupConfig,
      { shop_id: 'abc' },
    );
    expect(result.passed).toBe(true);
  });

  it('fails when record absent', async () => {
    supabaseMockClient = mockSupabase([]).client;
    const result = await evaluateDbLookup(
      {
        table: 'brand_research',
        match_field: 'shop_id',
        match_value_field: 'shop_id',
        check: 'exists',
      } as DbLookupConfig,
      { shop_id: 'abc' },
    );
    expect(result.passed).toBe(false);
  });
});
