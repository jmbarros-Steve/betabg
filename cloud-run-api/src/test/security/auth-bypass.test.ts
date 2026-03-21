import { describe, it, expect, vi, beforeAll } from 'vitest';
import { Hono } from 'hono';

// Set env BEFORE importing auth middleware
process.env.SUPABASE_SERVICE_ROLE_KEY = 'real-service-role-key-that-is-secret';

// Mock supabase admin — always reject tokens
vi.mock('../../lib/supabase.js', () => ({
  getSupabaseAdmin: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      }),
    },
  }),
}));

import { authMiddleware } from '../../middleware/auth.js';

// Sample protected routes that must require auth
const PROTECTED_ROUTES = [
  '/api/steve-chat',
  '/api/generate-meta-copy',
  '/api/manage-meta-campaign',
  '/api/sync-meta-metrics',
  '/api/fetch-shopify-products',
  '/api/sync-shopify-metrics',
  '/api/manage-email-campaigns',
  '/api/sync-klaviyo-metrics',
  '/api/export-all-data',
  '/api/send-email',
  '/api/create-client-user',
  '/api/store-platform-connection',
  '/api/fetch-meta-ad-accounts',
  '/api/manage-meta-audiences',
  '/api/email-ab-testing',
];

describe('Auth bypass protection', () => {
  let app: Hono;

  beforeAll(() => {
    app = new Hono();
    // Register a protected handler for each route
    for (const route of PROTECTED_ROUTES) {
      app.post(route, authMiddleware, (c) => c.json({ data: 'secret' }));
    }
  });

  for (const route of PROTECTED_ROUTES) {
    it(`${route} rejects request without Authorization header`, async () => {
      const res = await app.request(route, { method: 'POST' });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it(`${route} rejects request with invalid token`, async () => {
      const res = await app.request(route, {
        method: 'POST',
        headers: { Authorization: 'Bearer invalid-token-xyz' },
      });
      expect(res.status).toBe(401);
    });

    it(`${route} rejects request with empty Bearer`, async () => {
      const res = await app.request(route, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' },
      });
      expect(res.status).toBe(401);
    });
  }
});
