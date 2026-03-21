/**
 * Contract tests for Klaviyo API (revision 2024-10-15 / 2025-01-15).
 *
 * These tests verify that our MSW mocks return the exact shapes
 * our application code expects. Verified against:
 *   - src/routes/klaviyo/sync-klaviyo-metrics.ts
 *     (findConversionMetricId, fetchCampaigns, fetchFlows,
 *      fetchLists, fetchSegments, fetchCampaignReport, fetchFlowReport)
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { server } from '../mocks/server.js';

const KLAVIYO_BASE = 'https://a.klaviyo.com/api';
const KLAVIYO_HEADERS = {
  Authorization: 'Klaviyo-API-Key pk_test_1234567890',
  accept: 'application/json',
  revision: '2024-10-15',
};

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Klaviyo API Contract: Metrics', () => {
  it('returns metrics with data array where each item has id and attributes.name', async () => {
    const res = await fetch(`${KLAVIYO_BASE}/metrics/`, { headers: KLAVIYO_HEADERS });
    expect(res.ok).toBe(true);

    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    const metric = body.data[0];
    expect(metric).toHaveProperty('id');
    expect(metric).toHaveProperty('attributes');
    expect(metric.attributes).toHaveProperty('name');
    expect(typeof metric.id).toBe('string');
    expect(typeof metric.attributes.name).toBe('string');
  });

  it('contains a "Placed Order" metric (used by findConversionMetricId)', async () => {
    const res = await fetch(`${KLAVIYO_BASE}/metrics/`, { headers: KLAVIYO_HEADERS });
    const body = await res.json();

    // Our code: metrics.find(m => m.attributes.name.toLowerCase() === 'placed order')
    const placedOrder = body.data.find(
      (m: any) => (m.attributes?.name || '').toLowerCase() === 'placed order',
    );
    expect(placedOrder).toBeDefined();
    expect(placedOrder.id).toBeTruthy();
  });
});

describe('Klaviyo API Contract: Campaigns', () => {
  it('returns campaigns with JSON:API structure (data array)', async () => {
    const res = await fetch(
      `${KLAVIYO_BASE}/campaigns/?filter=equals(messages.channel,"email")&sort=-updated_at`,
      { headers: KLAVIYO_HEADERS },
    );
    expect(res.ok).toBe(true);

    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('each campaign has id, attributes.name, attributes.status', async () => {
    const res = await fetch(`${KLAVIYO_BASE}/campaigns/`, { headers: KLAVIYO_HEADERS });
    const body = await res.json();
    const campaign = body.data[0];

    expect(campaign).toHaveProperty('id');
    expect(campaign).toHaveProperty('attributes');
    expect(campaign.attributes).toHaveProperty('name');
    expect(campaign.attributes).toHaveProperty('status');
    expect(typeof campaign.id).toBe('string');
    expect(typeof campaign.attributes.name).toBe('string');
    expect(typeof campaign.attributes.status).toBe('string');
  });

  it('campaigns include send_time, created_at, updated_at in attributes', async () => {
    const res = await fetch(`${KLAVIYO_BASE}/campaigns/`, { headers: KLAVIYO_HEADERS });
    const body = await res.json();
    const campaign = body.data[0];

    // These are mapped in our fetchCampaigns function
    expect(campaign.attributes).toHaveProperty('send_time');
    expect(campaign.attributes).toHaveProperty('created_at');
    expect(campaign.attributes).toHaveProperty('updated_at');
  });

  it('uses links.next for pagination (not paging.next like Meta)', async () => {
    const res = await fetch(`${KLAVIYO_BASE}/campaigns/`, { headers: KLAVIYO_HEADERS });
    const body = await res.json();

    // Our code: url = data.links?.next || null
    expect(body).toHaveProperty('links');
    expect(body.links).toHaveProperty('next');
    expect(typeof body.links.next).toBe('string');
  });
});

describe('Klaviyo API Contract: Flows', () => {
  it('returns flows with id, attributes.name, attributes.status, attributes.trigger_type', async () => {
    const res = await fetch(`${KLAVIYO_BASE}/flows/`, { headers: KLAVIYO_HEADERS });
    expect(res.ok).toBe(true);

    const body = await res.json();
    expect(body).toHaveProperty('data');
    const flow = body.data[0];

    expect(flow).toHaveProperty('id');
    expect(flow.attributes).toHaveProperty('name');
    expect(flow.attributes).toHaveProperty('status');
    expect(flow.attributes).toHaveProperty('trigger_type');

    // Our code maps: status: f.attributes?.status || 'manual'
    expect(['live', 'manual', 'draft']).toContain(flow.attributes.status);
  });

  it('flows include created and updated timestamps', async () => {
    const res = await fetch(`${KLAVIYO_BASE}/flows/`, { headers: KLAVIYO_HEADERS });
    const body = await res.json();
    const flow = body.data[0];

    // Our code maps: created: f.attributes?.created, updated: f.attributes?.updated
    expect(flow.attributes).toHaveProperty('created');
    expect(flow.attributes).toHaveProperty('updated');
  });
});

describe('Klaviyo API Contract: Lists', () => {
  it('returns lists with id, attributes.name, attributes.created, attributes.updated', async () => {
    const res = await fetch(`${KLAVIYO_BASE}/lists/`, { headers: KLAVIYO_HEADERS });
    expect(res.ok).toBe(true);

    const body = await res.json();
    expect(body).toHaveProperty('data');
    const list = body.data[0];

    expect(list).toHaveProperty('id');
    expect(list.attributes).toHaveProperty('name');
    expect(list.attributes).toHaveProperty('created');
    expect(list.attributes).toHaveProperty('updated');
  });
});

describe('Klaviyo API Contract: Segments', () => {
  it('returns segments with id, attributes.name, attributes.created, attributes.updated', async () => {
    const res = await fetch(`${KLAVIYO_BASE}/segments/`, { headers: KLAVIYO_HEADERS });
    expect(res.ok).toBe(true);

    const body = await res.json();
    expect(body).toHaveProperty('data');
    const segment = body.data[0];

    expect(segment).toHaveProperty('id');
    expect(segment.attributes).toHaveProperty('name');
    expect(segment.attributes).toHaveProperty('created');
    expect(segment.attributes).toHaveProperty('updated');
  });
});

describe('Klaviyo API Contract: Campaign Values Report (POST)', () => {
  it('returns report with data.attributes.results array', async () => {
    const res = await fetch(`${KLAVIYO_BASE}/campaign-values-reports/`, {
      method: 'POST',
      headers: {
        ...KLAVIYO_HEADERS,
        'content-type': 'application/json',
        revision: '2025-01-15',
      },
      body: JSON.stringify({
        data: {
          type: 'campaign-values-report',
          attributes: {
            statistics: ['opens', 'clicks', 'delivered'],
            timeframe: { key: 'last_30_days' },
            conversion_metric_id: 'metric_placed_order_001',
          },
        },
      }),
    });
    expect(res.ok).toBe(true);

    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(body.data).toHaveProperty('attributes');
    expect(body.data.attributes).toHaveProperty('results');
    expect(Array.isArray(body.data.attributes.results)).toBe(true);
  });

  it('each result has groupings.campaign_id and statistics object', async () => {
    const res = await fetch(`${KLAVIYO_BASE}/campaign-values-reports/`, {
      method: 'POST',
      headers: {
        ...KLAVIYO_HEADERS,
        'content-type': 'application/json',
        revision: '2025-01-15',
      },
      body: JSON.stringify({
        data: { type: 'campaign-values-report', attributes: { statistics: ['opens'], timeframe: { key: 'last_30_days' }, conversion_metric_id: 'x' } },
      }),
    });
    const body = await res.json();
    const result = body.data.attributes.results[0];

    expect(result).toHaveProperty('groupings');
    expect(result.groupings).toHaveProperty('campaign_id');
    expect(result).toHaveProperty('statistics');

    // Our code extracts these from statistics:
    const stats = result.statistics;
    expect(stats).toHaveProperty('delivered');
    expect(stats).toHaveProperty('opens');
    expect(stats).toHaveProperty('clicks');
    expect(stats).toHaveProperty('recipients');
    expect(stats).toHaveProperty('open_rate');
    expect(stats).toHaveProperty('click_rate');
    expect(stats).toHaveProperty('conversion_value');
    expect(stats).toHaveProperty('unsubscribes');
    expect(stats).toHaveProperty('bounce_rate');
    expect(stats).toHaveProperty('conversion_rate');
    expect(stats).toHaveProperty('conversion_uniques');
  });
});

describe('Klaviyo API Contract: Flow Values Report (POST)', () => {
  it('each result has groupings.flow_id and statistics object', async () => {
    const res = await fetch(`${KLAVIYO_BASE}/flow-values-reports/`, {
      method: 'POST',
      headers: {
        ...KLAVIYO_HEADERS,
        'content-type': 'application/json',
        revision: '2025-01-15',
      },
      body: JSON.stringify({
        data: { type: 'flow-values-report', attributes: { statistics: ['opens'], timeframe: { key: 'last_30_days' }, conversion_metric_id: 'x' } },
      }),
    });
    expect(res.ok).toBe(true);

    const body = await res.json();
    const result = body.data.attributes.results[0];

    expect(result).toHaveProperty('groupings');
    expect(result.groupings).toHaveProperty('flow_id');

    const stats = result.statistics;
    expect(stats).toHaveProperty('delivered');
    expect(stats).toHaveProperty('opens');
    expect(stats).toHaveProperty('clicks');
    expect(stats).toHaveProperty('recipients');
    expect(stats).toHaveProperty('open_rate');
    expect(stats).toHaveProperty('click_rate');
    expect(stats).toHaveProperty('conversion_value');
    expect(stats).toHaveProperty('unsubscribes');
    expect(stats).toHaveProperty('conversion_rate');
    expect(stats).toHaveProperty('conversion_uniques');
  });
});

describe('Klaviyo API Contract: Profiles', () => {
  it('profiles endpoint uses links.next for pagination', async () => {
    const res = await fetch(
      `${KLAVIYO_BASE}/profiles/?page[size]=100&fields[profile]=email`,
      { headers: KLAVIYO_HEADERS },
    );
    expect(res.ok).toBe(true);

    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);

    // Our code: const hasMore = !!data.links?.next
    expect(body).toHaveProperty('links');
    expect(body.links).toHaveProperty('next');
  });

  it('profiles data contains email attribute', async () => {
    const res = await fetch(
      `${KLAVIYO_BASE}/profiles/?page[size]=100&fields[profile]=email`,
      { headers: KLAVIYO_HEADERS },
    );
    const body = await res.json();
    const profile = body.data[0];

    expect(profile).toHaveProperty('attributes');
    expect(profile.attributes).toHaveProperty('email');
    expect(typeof profile.attributes.email).toBe('string');
  });
});
