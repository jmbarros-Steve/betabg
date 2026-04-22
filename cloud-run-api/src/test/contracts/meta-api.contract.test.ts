/**
 * Contract tests for Meta Graph API v23.0.
 *
 * These tests verify that our MSW mocks return the exact shapes
 * our application code expects. If the real Meta API changes its
 * response format, updating these contracts will immediately
 * surface the discrepancy.
 *
 * Verified against:
 *   - src/lib/meta-fetch.ts (metaApiFetch, metaApiJson, metaApiPaginateAll)
 *   - src/routes/meta/sync-meta-metrics.ts (MetaInsightsResponse)
 *   - src/routes/meta/manage-meta-audiences.ts
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { server } from '../mocks/server.js';

const META_BASE = 'https://graph.facebook.com/v23.0';

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Meta API Contract: Campaigns', () => {
  it('returns campaigns with id, name, status, and objective fields', async () => {
    const res = await fetch(`${META_BASE}/act_123456/campaigns`, {
      headers: { Authorization: 'Bearer test-token' },
    });
    expect(res.ok).toBe(true);

    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('paging');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    const campaign = body.data[0];
    expect(campaign).toHaveProperty('id');
    expect(campaign).toHaveProperty('name');
    expect(campaign).toHaveProperty('status');
    expect(campaign).toHaveProperty('objective');
    expect(typeof campaign.id).toBe('string');
    expect(typeof campaign.name).toBe('string');
    expect(['ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED']).toContain(campaign.status);
  });

  it('includes paging.cursors in response', async () => {
    const res = await fetch(`${META_BASE}/act_123456/campaigns`, {
      headers: { Authorization: 'Bearer test-token' },
    });
    const body = await res.json();

    expect(body.paging).toHaveProperty('cursors');
    expect(body.paging.cursors).toHaveProperty('after');
    expect(typeof body.paging.cursors.after).toBe('string');
  });
});

describe('Meta API Contract: Insights (MetaInsightsResponse)', () => {
  it('returns daily insights with spend, impressions, cpm as strings', async () => {
    const res = await fetch(`${META_BASE}/act_123456/insights`, {
      headers: { Authorization: 'Bearer test-token' },
    });
    expect(res.ok).toBe(true);

    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    const day = body.data[0];

    // These MUST be strings — our code uses parseFloat() on them
    expect(typeof day.spend).toBe('string');
    expect(typeof day.impressions).toBe('string');
    expect(typeof day.cpm).toBe('string');
  });

  it('has date_start and date_stop in YYYY-MM-DD format', async () => {
    const res = await fetch(`${META_BASE}/act_123456/insights`, {
      headers: { Authorization: 'Bearer test-token' },
    });
    const body = await res.json();
    const day = body.data[0];

    expect(day).toHaveProperty('date_start');
    expect(day).toHaveProperty('date_stop');
    expect(day.date_start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(day.date_stop).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('has actions as array of { action_type, value } objects with string values', async () => {
    const res = await fetch(`${META_BASE}/act_123456/insights`, {
      headers: { Authorization: 'Bearer test-token' },
    });
    const body = await res.json();
    const day = body.data[0];

    expect(Array.isArray(day.actions)).toBe(true);
    expect(day.actions.length).toBeGreaterThan(0);

    const action = day.actions[0];
    expect(action).toHaveProperty('action_type');
    expect(action).toHaveProperty('value');
    expect(typeof action.action_type).toBe('string');
    expect(typeof action.value).toBe('string');
  });

  it('has action_values as array of { action_type, value } with string values', async () => {
    const res = await fetch(`${META_BASE}/act_123456/insights`, {
      headers: { Authorization: 'Bearer test-token' },
    });
    const body = await res.json();
    const day = body.data[0];

    expect(Array.isArray(day.action_values)).toBe(true);
    const av = day.action_values[0];
    expect(av).toHaveProperty('action_type');
    expect(av).toHaveProperty('value');
    expect(typeof av.value).toBe('string');
  });

  it('has cost_per_action_type as array of { action_type, value }', async () => {
    const res = await fetch(`${META_BASE}/act_123456/insights`, {
      headers: { Authorization: 'Bearer test-token' },
    });
    const body = await res.json();
    const day = body.data[0];

    expect(Array.isArray(day.cost_per_action_type)).toBe(true);
    const cpa = day.cost_per_action_type[0];
    expect(cpa).toHaveProperty('action_type');
    expect(cpa).toHaveProperty('value');
  });

  it('has purchase_roas as array of { action_type, value }', async () => {
    const res = await fetch(`${META_BASE}/act_123456/insights`, {
      headers: { Authorization: 'Bearer test-token' },
    });
    const body = await res.json();
    const day = body.data[0];

    expect(Array.isArray(day.purchase_roas)).toBe(true);
    const roas = day.purchase_roas[0];
    expect(roas).toHaveProperty('action_type');
    expect(roas).toHaveProperty('value');
  });

  it('supports paging.next for multi-page results', async () => {
    const res = await fetch(`${META_BASE}/act_123456/insights`, {
      headers: { Authorization: 'Bearer test-token' },
    });
    const body = await res.json();

    expect(body).toHaveProperty('paging');
    expect(body.paging).toHaveProperty('cursors');
    // paging.next is optional (present when there are more pages)
  });
});

describe('Meta API Contract: Custom Audiences', () => {
  it('uses approximate_count_lower_bound / approximate_count_upper_bound (NOT approximate_count)', async () => {
    const res = await fetch(`${META_BASE}/act_123456/customaudiences`, {
      headers: { Authorization: 'Bearer test-token' },
    });
    expect(res.ok).toBe(true);

    const body = await res.json();
    expect(body).toHaveProperty('data');
    const audience = body.data[0];

    // CRITICAL: The correct fields are lower_bound / upper_bound
    // The old field "approximate_count" is DEPRECATED and NOT used
    expect(audience).toHaveProperty('approximate_count_lower_bound');
    expect(audience).toHaveProperty('approximate_count_upper_bound');
    expect(audience).not.toHaveProperty('approximate_count');

    expect(typeof audience.approximate_count_lower_bound).toBe('number');
    expect(typeof audience.approximate_count_upper_bound).toBe('number');
    expect(audience.approximate_count_upper_bound).toBeGreaterThanOrEqual(audience.approximate_count_lower_bound);
  });

  it('returns audience with id, name, and subtype', async () => {
    const res = await fetch(`${META_BASE}/act_123456/customaudiences`, {
      headers: { Authorization: 'Bearer test-token' },
    });
    const body = await res.json();
    const audience = body.data[0];

    expect(audience).toHaveProperty('id');
    expect(audience).toHaveProperty('name');
    expect(audience).toHaveProperty('subtype');
    expect(typeof audience.id).toBe('string');
    expect(typeof audience.name).toBe('string');
  });
});

describe('Meta API Contract: Account Info', () => {
  it('returns currency and timezone_name for ad account', async () => {
    const res = await fetch(`${META_BASE}/act_123456?fields=currency,timezone_name`, {
      headers: { Authorization: 'Bearer test-token' },
    });
    expect(res.ok).toBe(true);

    const body = await res.json();
    expect(body).toHaveProperty('currency');
    expect(body).toHaveProperty('timezone_name');
    expect(typeof body.currency).toBe('string');
    expect(typeof body.timezone_name).toBe('string');
  });
});

describe('Meta API Contract: Error Responses', () => {
  it('returns 401 with OAuthException for invalid token', async () => {
    const { http, HttpResponse } = await import('msw');
    server.use(
      http.get(`${META_BASE}/act_invalid_token/insights`, () => {
        return HttpResponse.json(
          { error: { message: 'Invalid OAuth 2.0 Access Token', type: 'OAuthException', code: 190, fbtrace_id: 'abc' } },
          { status: 401 },
        );
      }),
    );
    const res = await fetch(`${META_BASE}/act_invalid_token/insights`);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body).toHaveProperty('error');
    expect(body.error.type).toBe('OAuthException');
    expect(body.error.code).toBe(190);
  });

  it('returns 429 with rate limit error message and code 4', async () => {
    const { http, HttpResponse } = await import('msw');
    server.use(
      http.get(`${META_BASE}/act_rate_limited/insights`, () => {
        return HttpResponse.json(
          { error: { message: '(#4) Application request limit reached', type: 'OAuthException', code: 4, fbtrace_id: 'xyz' } },
          { status: 429 },
        );
      }),
    );
    const res = await fetch(`${META_BASE}/act_rate_limited/insights`);
    expect(res.status).toBe(429);

    const body = await res.json();
    expect(body.error.code).toBe(4);
    expect(body.error.message).toContain('request limit');
  });

  it('error responses have standard error shape (message, type, code)', async () => {
    // Use server.use for one-off handler override to test error shape
    const { http, HttpResponse } = await import('msw');
    server.use(
      http.get(`${META_BASE}/act_error_test/campaigns`, () => {
        return HttpResponse.json(
          {
            error: {
              message: 'Test error',
              type: 'OAuthException',
              code: 100,
              fbtrace_id: 'trace123',
            },
          },
          { status: 400 },
        );
      }),
    );

    const res = await fetch(`${META_BASE}/act_error_test/campaigns`);
    expect(res.status).toBe(400);

    const body = await res.json();
    const err = body.error;
    expect(typeof err.message).toBe('string');
    expect(typeof err.type).toBe('string');
    expect(typeof err.code).toBe('number');
    expect(typeof err.fbtrace_id).toBe('string');
  });
});
