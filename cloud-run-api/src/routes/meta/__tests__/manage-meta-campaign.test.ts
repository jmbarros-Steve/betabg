/**
 * Unit tests for manage-meta-campaign.ts — 10 error paths
 *
 * Strategy: Mock global.fetch to simulate Meta Graph API responses.
 * Mock getSupabaseAdmin() to bypass auth/DB.
 * Use Hono app.request() to call the handler without a real HTTP server.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

// ── Mocks must be set up BEFORE importing the handler ──

// Mock getSupabaseAdmin — returns a fake Supabase client
vi.mock('../../../lib/supabase.js', () => ({
  getSupabaseAdmin: () => mockSupabase,
}));

// Mock criterio-meta — always approve (we're not testing CRITERIO here)
vi.mock('../../ai/criterio-meta.js', () => ({
  criterioMeta: vi.fn().mockResolvedValue({ can_publish: true, score: 80, reason: 'ok', failed_rules: [] }),
}));

// Mock espejo — always pass
vi.mock('../../ai/espejo.js', () => ({
  espejoAd: vi.fn().mockResolvedValue({ pass: true, score: 90, issues: [] }),
}));

// Mock angle-detector
vi.mock('../../../lib/angle-detector.js', () => ({
  detectAngle: vi.fn().mockResolvedValue('urgencia'),
}));

// ── Fake Supabase client ──

const mockSupabase = {
  auth: {
    getUser: vi.fn().mockResolvedValue({
      data: { user: { id: 'test-user-123' } },
      error: null,
    }),
  },
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'conn-1',
              platform: 'meta',
              account_id: '123456789',
              access_token_encrypted: 'enc-token',
              client_id: 'client-1',
              clients: { user_id: 'test-user-123', client_user_id: null },
            },
            error: null,
          }),
        }),
      }),
    }),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
  rpc: vi.fn().mockResolvedValue({ data: 'fake-access-token', error: null }),
};

// ── Import handler after mocks ──

import { manageMetaCampaign } from '../manage-meta-campaign.js';

// ── Build a minimal Hono app with the handler ──

function buildApp() {
  const app = new Hono();
  app.post('/api/manage-meta-campaign', manageMetaCampaign);
  return app;
}

// ── Fetch mock helpers ──

type FetchMockFn = (url: string, init?: RequestInit) => Promise<Response>;

const META_API = 'https://graph.facebook.com/v21.0';

/** Create a mock Response */
function metaOk(data: Record<string, any>) {
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function metaError(errorMsg: string, status = 400) {
  return new Response(JSON.stringify({ error: { message: errorMsg } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Build the base request body for a create action */
function createBody(overrides: Record<string, any> = {}) {
  return {
    action: 'create',
    connection_id: 'conn-1',
    data: {
      name: 'Test Campaign',
      objective: 'OUTCOME_TRAFFIC',
      status: 'PAUSED',
      daily_budget: 10000,
      targeting: { geo_locations: { countries: ['CL'] } },
      destination_url: 'https://example.com',
      primary_text: 'Buy now',
      headline: 'Great Deal',
      image_url: 'https://example.com/img.jpg',
      page_id: 'page-123',
      ...overrides,
    },
  };
}

/** Make a POST request to the test app */
async function postCreate(app: Hono, body: Record<string, any>) {
  const req = new Request('http://localhost/api/manage-meta-campaign', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer fake-jwt-token',
    },
    body: JSON.stringify(body),
  });
  return app.request(req);
}

// ── Tests ──

describe('manage-meta-campaign error paths (207→502)', () => {
  let originalFetch: typeof global.fetch;
  let app: Hono;

  beforeEach(() => {
    originalFetch = global.fetch;
    app = buildApp();
    // Reset mock call counts
    vi.clearAllMocks();
    // Re-setup default supabase mocks
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'test-user-123' } },
      error: null,
    });
    mockSupabase.rpc.mockResolvedValue({ data: 'fake-access-token', error: null });
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'conn-1',
                platform: 'meta',
                account_id: '123456789',
                access_token_encrypted: 'enc-token',
                client_id: 'client-1',
                clients: { user_id: 'test-user-123', client_user_id: null },
              },
              error: null,
            }),
          }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // Helper to verify common 502 response shape
  async function assert502(res: Response, expectedFields: Record<string, any>) {
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.partial).toBe(true);
    for (const [key, val] of Object.entries(expectedFields)) {
      if (val === true) {
        expect(json[key]).toBeTruthy();
      } else if (typeof val === 'string') {
        expect(json[key]).toContain(val);
      }
    }
    return json;
  }

  // ────────────────────────────────────────────────
  // Test 1: Ad set creation fails
  // ────────────────────────────────────────────────
  it('1. Adset fails → 502, adset_error', async () => {
    let callCount = 0;
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = url.toString();
      callCount++;
      // Call 1: promote_pages (auto-resolve page_id) — but we pass page_id so this may not be called
      // Call 1: campaign creation → OK
      if (u.includes('/campaigns')) {
        return metaOk({ id: 'camp-1' });
      }
      // Call 2: adset creation → FAIL
      if (u.includes('/adsets')) {
        return metaError('Invalid targeting spec');
      }
      return metaOk({});
    }) as any;

    const res = await postCreate(app, createBody());
    await assert502(res, {
      adset_error: 'Invalid targeting spec',
      error: 'Falló la creación del Ad Set',
      campaign_id: true,
    });
  });

  // ────────────────────────────────────────────────
  // Test 2: DPA creative fails
  // ────────────────────────────────────────────────
  it('2. DPA creative fails → 502, creative_error', async () => {
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = url.toString();
      if (u.includes('/campaigns')) return metaOk({ id: 'camp-1' });
      if (u.includes('/adsets')) return metaOk({ id: 'adset-1' });
      if (u.includes('/adcreatives')) return metaError('Invalid DPA template');
      return metaOk({});
    }) as any;

    const res = await postCreate(app, createBody({
      product_catalog_id: 'cat-1',
      product_set_id: 'set-1',
    }));
    await assert502(res, {
      creative_error: 'Invalid DPA template',
      error: 'Falló la creación del creativo DPA',
      adset_id: true,
    });
  });

  // ────────────────────────────────────────────────
  // Test 3: DPA ad fails
  // ────────────────────────────────────────────────
  it('3. DPA ad fails → 502, ad_error', async () => {
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = url.toString();
      if (u.includes('/campaigns')) return metaOk({ id: 'camp-1' });
      if (u.includes('/adsets')) return metaOk({ id: 'adset-1' });
      if (u.includes('/adcreatives')) return metaOk({ id: 'creative-1' });
      if (u.includes('/ads')) return metaError('Ad policy violation');
      return metaOk({});
    }) as any;

    const res = await postCreate(app, createBody({
      product_catalog_id: 'cat-1',
      product_set_id: 'set-1',
    }));
    const json = await assert502(res, {
      ad_error: 'Ad policy violation',
      error: 'Falló la creación del anuncio DPA',
      creative_id: true,
    });
    expect(json.campaign_id).toBe('camp-1');
    expect(json.adset_id).toBe('adset-1');
  });

  // ────────────────────────────────────────────────
  // Test 4: All flexible image uploads fail
  // ────────────────────────────────────────────────
  it('4. Flexible — all image uploads fail → 502, creative_error', async () => {
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = url.toString();
      if (u.includes('/campaigns')) return metaOk({ id: 'camp-1' });
      if (u.includes('/adsets')) return metaOk({ id: 'adset-1' });
      // Image upload via URL → fail
      if (u.includes('/adimages')) return metaError('Image not found', 404);
      // Fallback image download → fail too
      if (u.includes('example.com/img')) return new Response('Not Found', { status: 404 });
      return metaOk({});
    }) as any;

    const res = await postCreate(app, createBody({
      ad_set_format: 'flexible',
      images: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
      texts: ['Buy now', 'Shop today'],
      headlines: ['Great Deal', 'Amazing Offer'],
    }));
    await assert502(res, {
      creative_error: 'All image uploads failed',
      error: 'Falló la subida de todas las imágenes',
    });
  });

  // ────────────────────────────────────────────────
  // Test 5: DCT creative fails (images upload OK)
  // ────────────────────────────────────────────────
  it('5. DCT creative fails → 502, creative_error', async () => {
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = url.toString();
      if (u.includes('/campaigns')) return metaOk({ id: 'camp-1' });
      if (u.includes('/adsets')) return metaOk({ id: 'adset-1' });
      if (u.includes('/adimages')) return metaOk({ images: { img1: { hash: 'hash1' } } });
      if (u.includes('/adcreatives')) return metaError('Invalid asset_feed_spec');
      return metaOk({});
    }) as any;

    const res = await postCreate(app, createBody({
      ad_set_format: 'flexible',
      images: ['https://example.com/img1.jpg'],
      texts: ['Buy now'],
      headlines: ['Great Deal'],
    }));
    await assert502(res, {
      creative_error: 'Invalid asset_feed_spec',
      error: 'Falló la creación del Dynamic Creative',
    });
  });

  // ────────────────────────────────────────────────
  // Test 6: Carousel — less than 2 images succeed
  // ────────────────────────────────────────────────
  it('6. Carousel < 2 images → 502, creative_error', async () => {
    let imgCallCount = 0;
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = url.toString();
      if (u.includes('/campaigns')) return metaOk({ id: 'camp-1' });
      if (u.includes('/adsets')) return metaOk({ id: 'adset-1' });
      if (u.includes('/adimages')) {
        imgCallCount++;
        // Only first image succeeds, rest fail
        if (imgCallCount === 1) return metaOk({ images: { img1: { hash: 'hash1' } } });
        return metaError('Upload failed', 400);
      }
      // Fallback download also fails
      if (u.includes('example.com/img')) return new Response('Not Found', { status: 404 });
      return metaOk({});
    }) as any;

    const res = await postCreate(app, createBody({
      ad_set_format: 'carousel',
      images: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg', 'https://example.com/img3.jpg'],
      texts: ['Buy now'],
      headlines: ['Great Deal'],
    }));
    await assert502(res, {
      creative_error: 'Carousel requires at least 2 images',
      error: 'Carousel necesita al menos 2 imágenes',
    });
  });

  // ────────────────────────────────────────────────
  // Test 7: Carousel creative creation fails
  // ────────────────────────────────────────────────
  it('7. Carousel creative fails → 502, creative_error', async () => {
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = url.toString();
      if (u.includes('/campaigns')) return metaOk({ id: 'camp-1' });
      if (u.includes('/adsets')) return metaOk({ id: 'adset-1' });
      if (u.includes('/adimages')) return metaOk({ images: { img1: { hash: 'hash1' } } });
      if (u.includes('/adcreatives')) return metaError('Carousel spec error');
      return metaOk({});
    }) as any;

    const res = await postCreate(app, createBody({
      ad_set_format: 'carousel',
      images: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
      texts: ['Buy now'],
      headlines: ['Great Deal'],
    }));
    await assert502(res, {
      creative_error: 'Carousel spec error',
      error: 'Falló la creación del creativo Carousel',
    });
  });

  // ────────────────────────────────────────────────
  // Test 8: Single image upload fails
  // ────────────────────────────────────────────────
  it('8. Single image upload fails → 502, creative_error', async () => {
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = url.toString();
      if (u.includes('/campaigns')) return metaOk({ id: 'camp-1' });
      if (u.includes('/adsets')) return metaOk({ id: 'adset-1' });
      // Image upload → fail
      if (u.includes('/adimages')) return metaError('Image format not supported', 400);
      // Fallback download → also fail
      if (u.includes('example.com/img')) return new Response('Not Found', { status: 404 });
      return metaOk({});
    }) as any;

    const res = await postCreate(app, createBody());
    await assert502(res, {
      creative_error: true,
      error: 'Falló la subida de imagen',
    });
  });

  // ────────────────────────────────────────────────
  // Test 9: Single creative creation fails
  // ────────────────────────────────────────────────
  it('9. Single creative fails → 502, creative_error', async () => {
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = url.toString();
      if (u.includes('/campaigns')) return metaOk({ id: 'camp-1' });
      if (u.includes('/adsets')) return metaOk({ id: 'adset-1' });
      if (u.includes('/adimages')) return metaOk({ images: { img1: { hash: 'hash1' } } });
      if (u.includes('/adcreatives')) return metaError('Creative spec invalid');
      return metaOk({});
    }) as any;

    const res = await postCreate(app, createBody());
    await assert502(res, {
      creative_error: 'Creative spec invalid',
      error: 'Falló la creación del creativo',
    });
  });

  // ────────────────────────────────────────────────
  // Test 10: Ad creation fails (creative OK)
  // ────────────────────────────────────────────────
  it('10. Ad fails → 502, ad_error, creative_id present', async () => {
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = url.toString();
      if (u.includes('/campaigns')) return metaOk({ id: 'camp-1' });
      if (u.includes('/adsets')) return metaOk({ id: 'adset-1' });
      if (u.includes('/adimages')) return metaOk({ images: { img1: { hash: 'hash1' } } });
      if (u.includes('/adcreatives')) return metaOk({ id: 'creative-1' });
      if (u.includes('/ads')) return metaError('Ad rejected by policy');
      return metaOk({});
    }) as any;

    const res = await postCreate(app, createBody());
    const json = await assert502(res, {
      ad_error: 'Ad rejected by policy',
      error: 'Falló la creación del anuncio',
    });
    expect(json.creative_id).toBe('creative-1');
    expect(json.campaign_id).toBe('camp-1');
    expect(json.adset_id).toBe('adset-1');
  });

  // ────────────────────────────────────────────────
  // Bonus: Happy path returns 200
  // ────────────────────────────────────────────────
  it('Happy path → 200, success: true', async () => {
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = url.toString();
      if (u.includes('/campaigns')) return metaOk({ id: 'camp-1' });
      if (u.includes('/adsets')) return metaOk({ id: 'adset-1' });
      if (u.includes('/adimages')) return metaOk({ images: { img1: { hash: 'hash1' } } });
      if (u.includes('/adcreatives')) return metaOk({ id: 'creative-1' });
      if (u.includes('/ads')) return metaOk({ id: 'ad-1' });
      return metaOk({});
    }) as any;

    const res = await postCreate(app, createBody());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.campaign_id).toBe('camp-1');
    expect(json.ad_id).toBe('ad-1');
  });
});
