/**
 * MSW handlers for the Meta Graph API (v21.0).
 * Matches the response shapes expected by:
 *   - src/lib/meta-fetch.ts (metaApiFetch, metaApiJson, metaApiPaginateAll)
 *   - src/routes/meta/sync-meta-metrics.ts (MetaInsightsResponse)
 *   - src/routes/meta/manage-meta-audiences.ts (customaudiences)
 *   - src/routes/meta/manage-meta-campaign.ts (campaigns)
 *
 * IMPORTANT: Specific (error) handlers MUST be listed BEFORE generic
 * :accountId handlers because MSW uses first-match-wins ordering.
 */
import { http, HttpResponse } from 'msw';

const BASE = 'https://graph.facebook.com/v21.0';

export const metaHandlers = [
  // ────────────────────────────────────────────────────────────
  // ERROR handlers — must come FIRST (before generic :accountId)
  // ────────────────────────────────────────────────────────────

  // ── Error: Invalid token (401 OAuthException) ──
  http.get(`${BASE}/act_invalid_token/insights`, () => {
    return HttpResponse.json(
      {
        error: {
          message: 'Invalid OAuth 2.0 Access Token',
          type: 'OAuthException',
          code: 190,
          error_subcode: 463,
          fbtrace_id: 'A1b2C3d4E5',
        },
      },
      { status: 401 },
    );
  }),

  // ── Error: Rate limit (429) ──
  http.get(`${BASE}/act_rate_limited/insights`, () => {
    return HttpResponse.json(
      {
        error: {
          message: '(#4) Application request limit reached',
          type: 'OAuthException',
          code: 4,
          fbtrace_id: 'F6g7H8i9J0',
        },
      },
      { status: 429 },
    );
  }),

  // ── Error: Rate limit via 403 with code 4 ──
  http.get(`${BASE}/act_rate_limited_403/insights`, () => {
    return HttpResponse.json(
      {
        error: {
          message: '(#4) Application request limit reached',
          type: 'OAuthException',
          code: 4,
          fbtrace_id: 'K1l2M3n4O5',
        },
      },
      { status: 403 },
    );
  }),

  // ── Error: Server error (500) ──
  http.get(`${BASE}/act_server_error/insights`, () => {
    return HttpResponse.json(
      {
        error: {
          message: 'An unexpected error has occurred. Please retry your request later.',
          type: 'OAuthException',
          code: 2,
          fbtrace_id: 'P6q7R8s9T0',
        },
      },
      { status: 500 },
    );
  }),

  // ── Paginated endpoint (page 2) ──
  http.get(`${BASE}/act_paginated/campaigns`, ({ request }) => {
    const url = new URL(request.url);
    const after = url.searchParams.get('after');

    if (after === 'page2_cursor') {
      // Page 2 — no next page
      return HttpResponse.json({
        data: [
          { id: '333', name: 'Campaign Page 2', status: 'ACTIVE', objective: 'OUTCOME_TRAFFIC' },
        ],
        paging: { cursors: { after: 'page2_end' } },
      });
    }

    // Page 1 — has next page
    return HttpResponse.json({
      data: [
        { id: '111', name: 'Campaign Page 1a', status: 'ACTIVE', objective: 'OUTCOME_SALES' },
        { id: '222', name: 'Campaign Page 1b', status: 'PAUSED', objective: 'OUTCOME_AWARENESS' },
      ],
      paging: {
        cursors: { after: 'page2_cursor' },
        next: `${BASE}/act_paginated/campaigns?after=page2_cursor`,
      },
    });
  }),

  // ────────────────────────────────────────────────────────────
  // GENERIC handlers — match any :accountId / :campaignId
  // ────────────────────────────────────────────────────────────

  // ── Account info ──
  http.get(`${BASE}/:accountId`, ({ params, request }) => {
    const url = new URL(request.url);
    const fields = url.searchParams.get('fields') || '';
    if (fields.includes('currency')) {
      return HttpResponse.json({
        id: params.accountId,
        currency: 'USD',
        timezone_name: 'America/Santiago',
      });
    }
    return HttpResponse.json({ id: params.accountId });
  }),

  // ── Campaigns list ──
  http.get(`${BASE}/:accountId/campaigns`, () => {
    return HttpResponse.json({
      data: [
        {
          id: '120208123456',
          name: 'Test Campaign - Conversions',
          status: 'ACTIVE',
          objective: 'OUTCOME_SALES',
          daily_budget: '5000',
          created_time: '2026-01-15T10:00:00-0300',
          updated_time: '2026-03-15T14:30:00-0300',
        },
        {
          id: '120208789012',
          name: 'Brand Awareness Campaign',
          status: 'PAUSED',
          objective: 'OUTCOME_AWARENESS',
          daily_budget: '3000',
          created_time: '2026-02-01T08:00:00-0300',
          updated_time: '2026-03-10T09:00:00-0300',
        },
      ],
      paging: {
        cursors: { before: 'bef_cursor', after: 'aft_cursor' },
      },
    });
  }),

  // ── Insights (daily breakdown) ──
  // Returns data matching MetaInsightsResponse from sync-meta-metrics.ts
  http.get(`${BASE}/:accountId/insights`, () => {
    return HttpResponse.json({
      data: [
        {
          date_start: '2026-03-18',
          date_stop: '2026-03-18',
          spend: '25000',
          impressions: '15000',
          cpm: '1666.67',
          actions: [
            { action_type: 'purchase', value: '12' },
            { action_type: 'link_click', value: '150' },
            { action_type: 'page_engagement', value: '200' },
          ],
          action_values: [
            { action_type: 'purchase', value: '450000' },
            { action_type: 'link_click', value: '0' },
          ],
          cost_per_action_type: [
            { action_type: 'purchase', value: '2083.33' },
            { action_type: 'link_click', value: '166.67' },
          ],
          purchase_roas: [
            { action_type: 'omni_purchase', value: '18.0' },
          ],
        },
        {
          date_start: '2026-03-19',
          date_stop: '2026-03-19',
          spend: '30000',
          impressions: '18000',
          cpm: '1666.67',
          actions: [
            { action_type: 'purchase', value: '15' },
            { action_type: 'link_click', value: '180' },
          ],
          action_values: [
            { action_type: 'purchase', value: '600000' },
          ],
          cost_per_action_type: [
            { action_type: 'purchase', value: '2000' },
          ],
          purchase_roas: [
            { action_type: 'omni_purchase', value: '20.0' },
          ],
        },
      ],
      paging: {
        cursors: { after: 'insights_cursor' },
      },
    });
  }),

  // ── Custom audiences list ──
  http.get(`${BASE}/:accountId/customaudiences`, () => {
    return HttpResponse.json({
      data: [
        {
          id: '23851234567890',
          name: 'Website Visitors - Last 30 days',
          approximate_count_lower_bound: 1200,
          approximate_count_upper_bound: 5800,
          subtype: 'WEBSITE',
          time_created: '2026-01-10T12:00:00+0000',
          time_updated: '2026-03-19T08:00:00+0000',
        },
        {
          id: '23859876543210',
          name: 'Customer List - Chile',
          approximate_count_lower_bound: 3500,
          approximate_count_upper_bound: 4200,
          subtype: 'CUSTOM',
          time_created: '2026-02-05T14:00:00+0000',
          time_updated: '2026-03-18T16:00:00+0000',
        },
      ],
      paging: {
        cursors: { after: 'aud_cursor' },
      },
    });
  }),
];
