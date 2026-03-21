/**
 * Contract tests for Shopify Admin API (2025-01).
 *
 * These tests verify that our MSW mocks return the exact shapes
 * our application code expects. Verified against:
 *   - src/routes/shopify/sync-shopify-metrics.ts (ShopifyOrder interface)
 *   - src/routes/shopify/fetch-shopify-products.ts
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { server } from '../mocks/server.js';

const SHOPIFY_BASE = 'https://test-store.myshopify.com/admin/api/2025-01';
const SHOPIFY_HEADERS = {
  'X-Shopify-Access-Token': 'test-token',
  'Content-Type': 'application/json',
};

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Shopify API Contract: Orders', () => {
  it('returns orders wrapped in { orders: [...] }', async () => {
    const res = await fetch(`${SHOPIFY_BASE}/orders.json?status=any&limit=250`, {
      headers: SHOPIFY_HEADERS,
    });
    expect(res.ok).toBe(true);

    const body = await res.json();
    expect(body).toHaveProperty('orders');
    expect(Array.isArray(body.orders)).toBe(true);
    expect(body.orders.length).toBeGreaterThan(0);
  });

  it('each order has id, created_at, total_price, currency, and financial_status', async () => {
    const res = await fetch(`${SHOPIFY_BASE}/orders.json?status=any&limit=250`, {
      headers: SHOPIFY_HEADERS,
    });
    const body = await res.json();
    const order = body.orders[0];

    // These fields match the ShopifyOrder interface in sync-shopify-metrics.ts
    expect(order).toHaveProperty('id');
    expect(order).toHaveProperty('created_at');
    expect(order).toHaveProperty('total_price');
    expect(order).toHaveProperty('currency');
    expect(order).toHaveProperty('financial_status');

    expect(typeof order.id).toBe('number');
    expect(typeof order.created_at).toBe('string');
    expect(typeof order.total_price).toBe('string'); // Shopify returns prices as strings
    expect(typeof order.currency).toBe('string');
    expect(typeof order.financial_status).toBe('string');
  });

  it('created_at is ISO 8601 date format', async () => {
    const res = await fetch(`${SHOPIFY_BASE}/orders.json?status=any&limit=250`, {
      headers: SHOPIFY_HEADERS,
    });
    const body = await res.json();
    const order = body.orders[0];

    // Our code splits on 'T' to extract the date: order.created_at.split('T')[0]
    expect(order.created_at).toContain('T');
    const datePart = order.created_at.split('T')[0];
    expect(datePart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('total_price is a numeric string (parseable by parseFloat)', async () => {
    const res = await fetch(`${SHOPIFY_BASE}/orders.json?status=any&limit=250`, {
      headers: SHOPIFY_HEADERS,
    });
    const body = await res.json();
    const order = body.orders[0];

    const parsed = parseFloat(order.total_price);
    expect(Number.isNaN(parsed)).toBe(false);
    expect(parsed).toBeGreaterThanOrEqual(0);
  });

  it('financial_status is one of the expected Shopify statuses', async () => {
    const res = await fetch(`${SHOPIFY_BASE}/orders.json?status=any&limit=250`, {
      headers: SHOPIFY_HEADERS,
    });
    const body = await res.json();

    const validStatuses = ['paid', 'pending', 'refunded', 'voided', 'cancelled', 'partially_paid', 'partially_refunded', 'authorized'];
    for (const order of body.orders) {
      expect(validStatuses).toContain(order.financial_status);
    }
  });

  it('provides Link header for pagination with rel="next"', async () => {
    const res = await fetch(`${SHOPIFY_BASE}/orders.json?status=any&limit=250`, {
      headers: SHOPIFY_HEADERS,
    });
    const linkHeader = res.headers.get('Link');

    // Our code parses: linkHeader.match(/<([^>]+)>;\s*rel="next"/)
    expect(linkHeader).toBeTruthy();
    expect(linkHeader).toContain('rel="next"');

    const nextMatch = linkHeader!.match(/<([^>]+)>;\s*rel="next"/);
    expect(nextMatch).not.toBeNull();
    expect(nextMatch![1]).toContain('page_info=');
  });

  it('pagination page 2 returns more orders without Link next', async () => {
    const res = await fetch(`${SHOPIFY_BASE}/orders.json?page_info=page2`, {
      headers: SHOPIFY_HEADERS,
    });
    expect(res.ok).toBe(true);

    const body = await res.json();
    expect(body.orders.length).toBeGreaterThan(0);

    // No Link header on last page
    const linkHeader = res.headers.get('Link');
    expect(linkHeader).toBeNull();
  });
});

describe('Shopify API Contract: Products', () => {
  it('returns products wrapped in { products: [...] }', async () => {
    const res = await fetch(`${SHOPIFY_BASE}/products.json`, {
      headers: SHOPIFY_HEADERS,
    });
    expect(res.ok).toBe(true);

    const body = await res.json();
    expect(body).toHaveProperty('products');
    expect(Array.isArray(body.products)).toBe(true);
    expect(body.products.length).toBeGreaterThan(0);
  });

  it('each product has id, title, vendor, product_type, status, and variants', async () => {
    const res = await fetch(`${SHOPIFY_BASE}/products.json`, {
      headers: SHOPIFY_HEADERS,
    });
    const body = await res.json();
    const product = body.products[0];

    expect(product).toHaveProperty('id');
    expect(product).toHaveProperty('title');
    expect(product).toHaveProperty('vendor');
    expect(product).toHaveProperty('product_type');
    expect(product).toHaveProperty('status');
    expect(product).toHaveProperty('variants');

    expect(typeof product.id).toBe('number');
    expect(typeof product.title).toBe('string');
    expect(Array.isArray(product.variants)).toBe(true);
  });

  it('each variant has id, title, price (string), sku, and inventory_quantity', async () => {
    const res = await fetch(`${SHOPIFY_BASE}/products.json`, {
      headers: SHOPIFY_HEADERS,
    });
    const body = await res.json();
    const variant = body.products[0].variants[0];

    expect(variant).toHaveProperty('id');
    expect(variant).toHaveProperty('title');
    expect(variant).toHaveProperty('price');
    expect(variant).toHaveProperty('sku');
    expect(variant).toHaveProperty('inventory_quantity');

    // Prices are strings in Shopify API
    expect(typeof variant.price).toBe('string');
    expect(Number.isNaN(parseFloat(variant.price))).toBe(false);
    expect(typeof variant.inventory_quantity).toBe('number');
  });

  it('products may have images array with src and alt', async () => {
    const res = await fetch(`${SHOPIFY_BASE}/products.json`, {
      headers: SHOPIFY_HEADERS,
    });
    const body = await res.json();
    const product = body.products[0];

    expect(product).toHaveProperty('images');
    expect(Array.isArray(product.images)).toBe(true);
    if (product.images.length > 0) {
      expect(product.images[0]).toHaveProperty('src');
      expect(typeof product.images[0].src).toBe('string');
    }
  });
});

describe('Shopify API Contract: Error Responses', () => {
  it('returns 401 with errors string for invalid API key', async () => {
    const res = await fetch(
      'https://invalid-store.myshopify.com/admin/api/2025-01/orders.json',
      { headers: SHOPIFY_HEADERS },
    );
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body).toHaveProperty('errors');
    expect(typeof body.errors).toBe('string');
    expect(body.errors).toContain('Invalid API key');
  });

  it('returns 404 for non-existent store', async () => {
    const res = await fetch(
      'https://nonexistent.myshopify.com/admin/api/2025-01/orders.json',
      { headers: SHOPIFY_HEADERS },
    );
    expect(res.status).toBe(404);
  });

  it('returns 429 with Retry-After header for rate limiting', async () => {
    const res = await fetch(
      'https://rate-limited.myshopify.com/admin/api/2025-01/orders.json',
      { headers: SHOPIFY_HEADERS },
    );
    expect(res.status).toBe(429);

    const retryAfter = res.headers.get('Retry-After');
    expect(retryAfter).toBeTruthy();

    const body = await res.json();
    expect(body).toHaveProperty('errors');
    expect(body.errors).toContain('Exceeded');
  });
});
