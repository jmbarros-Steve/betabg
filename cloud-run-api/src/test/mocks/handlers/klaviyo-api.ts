/**
 * MSW handlers for the Klaviyo API (revision 2024-10-15 / 2025-01-15).
 * Matches the response shapes expected by:
 *   - src/routes/klaviyo/sync-klaviyo-metrics.ts
 *     (fetchCampaigns, fetchFlows, fetchLists, fetchSegments,
 *      findConversionMetricId, fetchCampaignReport, fetchFlowReport)
 */
import { http, HttpResponse } from 'msw';

const KLAVIYO_BASE = 'https://a.klaviyo.com/api';

export const klaviyoHandlers = [
  // ── Metrics list (used by findConversionMetricId) ──
  http.get(`${KLAVIYO_BASE}/metrics/`, () => {
    return HttpResponse.json({
      data: [
        {
          type: 'metric',
          id: 'metric_placed_order_001',
          attributes: {
            name: 'Placed Order',
            created: '2025-06-01T00:00:00+00:00',
            updated: '2026-03-19T12:00:00+00:00',
            integration: { object: 'integration', id: 'shopify', name: 'Shopify' },
          },
        },
        {
          type: 'metric',
          id: 'metric_opened_email_002',
          attributes: {
            name: 'Opened Email',
            created: '2025-06-01T00:00:00+00:00',
            updated: '2026-03-19T12:00:00+00:00',
            integration: { object: 'integration', id: 'klaviyo', name: 'Klaviyo' },
          },
        },
        {
          type: 'metric',
          id: 'metric_clicked_email_003',
          attributes: {
            name: 'Clicked Email',
            created: '2025-06-01T00:00:00+00:00',
            updated: '2026-03-19T12:00:00+00:00',
            integration: { object: 'integration', id: 'klaviyo', name: 'Klaviyo' },
          },
        },
      ],
      links: { self: `${KLAVIYO_BASE}/metrics/` },
    });
  }),

  // ── Campaigns list (paginated email campaigns) ──
  http.get(`${KLAVIYO_BASE}/campaigns/`, ({ request }) => {
    const url = new URL(request.url);
    const cursor = url.searchParams.get('page[cursor]');

    if (cursor === 'page2') {
      return HttpResponse.json({
        data: [
          {
            type: 'campaign',
            id: 'camp_003',
            attributes: {
              name: 'Promo Marzo',
              status: 'sent',
              send_time: '2026-03-10T14:00:00+00:00',
              created_at: '2026-03-08T10:00:00+00:00',
              updated_at: '2026-03-10T14:30:00+00:00',
            },
          },
        ],
        links: { self: `${KLAVIYO_BASE}/campaigns/?page[cursor]=page2` },
      });
    }

    return HttpResponse.json({
      data: [
        {
          type: 'campaign',
          id: 'camp_001',
          attributes: {
            name: 'Newsletter Semanal',
            status: 'sent',
            send_time: '2026-03-15T10:00:00+00:00',
            created_at: '2026-03-14T08:00:00+00:00',
            updated_at: '2026-03-15T10:30:00+00:00',
          },
        },
        {
          type: 'campaign',
          id: 'camp_002',
          attributes: {
            name: 'Lanzamiento Producto',
            status: 'draft',
            send_time: null,
            created_at: '2026-03-18T16:00:00+00:00',
            updated_at: '2026-03-19T09:00:00+00:00',
          },
        },
      ],
      links: {
        self: `${KLAVIYO_BASE}/campaigns/`,
        next: `${KLAVIYO_BASE}/campaigns/?page[cursor]=page2`,
      },
    });
  }),

  // ── Flows list ──
  http.get(`${KLAVIYO_BASE}/flows/`, () => {
    return HttpResponse.json({
      data: [
        {
          type: 'flow',
          id: 'flow_welcome_001',
          attributes: {
            name: 'Welcome Series',
            status: 'live',
            created: '2025-12-01T10:00:00+00:00',
            updated: '2026-03-19T08:00:00+00:00',
            trigger_type: 'list',
          },
        },
        {
          type: 'flow',
          id: 'flow_abandon_002',
          attributes: {
            name: 'Abandoned Cart',
            status: 'live',
            created: '2026-01-15T14:00:00+00:00',
            updated: '2026-03-18T16:00:00+00:00',
            trigger_type: 'metric',
          },
        },
        {
          type: 'flow',
          id: 'flow_winback_003',
          attributes: {
            name: 'Win-Back',
            status: 'manual',
            created: '2026-02-20T09:00:00+00:00',
            updated: '2026-03-01T11:00:00+00:00',
            trigger_type: 'segment',
          },
        },
      ],
      links: { self: `${KLAVIYO_BASE}/flows/` },
    });
  }),

  // ── Lists ──
  http.get(`${KLAVIYO_BASE}/lists/`, () => {
    return HttpResponse.json({
      data: [
        {
          type: 'list',
          id: 'list_newsletter_001',
          attributes: {
            name: 'Newsletter Principal',
            created: '2025-06-01T00:00:00+00:00',
            updated: '2026-03-19T12:00:00+00:00',
          },
        },
        {
          type: 'list',
          id: 'list_vip_002',
          attributes: {
            name: 'VIP Customers',
            created: '2025-09-15T00:00:00+00:00',
            updated: '2026-03-18T08:00:00+00:00',
          },
        },
      ],
      links: { self: `${KLAVIYO_BASE}/lists/` },
    });
  }),

  // ── Segments ──
  http.get(`${KLAVIYO_BASE}/segments/`, () => {
    return HttpResponse.json({
      data: [
        {
          type: 'segment',
          id: 'seg_engaged_001',
          attributes: {
            name: 'Engaged Subscribers (90 days)',
            created: '2025-08-01T00:00:00+00:00',
            updated: '2026-03-19T06:00:00+00:00',
          },
        },
      ],
      links: { self: `${KLAVIYO_BASE}/segments/` },
    });
  }),

  // ── Profiles (for estimateTotalProfiles) ──
  http.get(`${KLAVIYO_BASE}/profiles/`, () => {
    const profiles = Array.from({ length: 100 }, (_, i) => ({
      type: 'profile',
      id: `prof_${String(i + 1).padStart(3, '0')}`,
      attributes: { email: `user${i + 1}@test.cl` },
    }));

    return HttpResponse.json({
      data: profiles,
      links: {
        self: `${KLAVIYO_BASE}/profiles/`,
        next: `${KLAVIYO_BASE}/profiles/?page[cursor]=more`,
      },
    });
  }),

  // ── Campaign values report (POST) ──
  http.post(`${KLAVIYO_BASE}/campaign-values-reports/`, () => {
    return HttpResponse.json({
      data: {
        type: 'campaign-values-report',
        attributes: {
          results: [
            {
              groupings: { campaign_id: 'camp_001' },
              statistics: {
                delivered: 4500,
                opens: 1800,
                clicks: 450,
                recipients: 5000,
                open_rate: 0.40,
                click_rate: 0.10,
                conversion_value: 1250000,
                unsubscribes: 25,
                bounce_rate: 0.02,
                conversion_rate: 0.035,
                conversion_uniques: 35,
              },
            },
            {
              groupings: { campaign_id: 'camp_002' },
              statistics: {
                delivered: 0,
                opens: 0,
                clicks: 0,
                recipients: 0,
                open_rate: 0,
                click_rate: 0,
                conversion_value: 0,
                unsubscribes: 0,
                bounce_rate: 0,
                conversion_rate: 0,
                conversion_uniques: 0,
              },
            },
          ],
        },
      },
    });
  }),

  // ── Flow values report (POST) ──
  http.post(`${KLAVIYO_BASE}/flow-values-reports/`, () => {
    return HttpResponse.json({
      data: {
        type: 'flow-values-report',
        attributes: {
          results: [
            {
              groupings: { flow_id: 'flow_welcome_001' },
              statistics: {
                delivered: 12000,
                opens: 7200,
                clicks: 2400,
                recipients: 13000,
                open_rate: 0.60,
                click_rate: 0.20,
                conversion_value: 3500000,
                unsubscribes: 50,
                conversion_rate: 0.08,
                conversion_uniques: 240,
              },
            },
            {
              groupings: { flow_id: 'flow_abandon_002' },
              statistics: {
                delivered: 8000,
                opens: 4800,
                clicks: 1600,
                recipients: 8500,
                open_rate: 0.60,
                click_rate: 0.20,
                conversion_value: 8000000,
                unsubscribes: 30,
                conversion_rate: 0.12,
                conversion_uniques: 480,
              },
            },
          ],
        },
      },
    });
  }),

  // ── Error: Invalid API key ──
  http.get(`${KLAVIYO_BASE}/invalid-endpoint/`, () => {
    return HttpResponse.json(
      {
        errors: [
          {
            id: 'err_001',
            status: 401,
            code: 'not_authenticated',
            title: 'Not Authenticated',
            detail: 'The API key is invalid.',
          },
        ],
      },
      { status: 401 },
    );
  }),

  // ── List/segment profiles count ──
  http.get(`${KLAVIYO_BASE}/lists/:listId/profiles/`, () => {
    return HttpResponse.json({
      data: Array.from({ length: 50 }, (_, i) => ({
        type: 'profile',
        id: `prof_list_${i + 1}`,
        attributes: { email: `listuser${i + 1}@test.cl` },
      })),
      links: { self: `${KLAVIYO_BASE}/lists/list_001/profiles/` },
    });
  }),

  http.get(`${KLAVIYO_BASE}/segments/:segId/profiles/`, () => {
    return HttpResponse.json({
      data: Array.from({ length: 25 }, (_, i) => ({
        type: 'profile',
        id: `prof_seg_${i + 1}`,
        attributes: { email: `seguser${i + 1}@test.cl` },
      })),
      links: { self: `${KLAVIYO_BASE}/segments/seg_001/profiles/` },
    });
  }),
];
