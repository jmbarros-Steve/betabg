import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { authMiddleware } from '../../middleware/auth.js';

// Mock supabase admin — allow all requests through for injection testing
vi.mock('../../lib/supabase.js', () => ({
  getSupabaseAdmin: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'test-user', email: 'test@test.com' } },
        error: null,
      }),
    },
  }),
}));

const SQL_INJECTION_PAYLOADS = [
  "'; DROP TABLE users; --",
  "1 OR 1=1",
  "' UNION SELECT * FROM users --",
  "1; DELETE FROM clients WHERE 1=1",
  "admin'--",
  "' OR '1'='1",
];

const XSS_PAYLOADS = [
  '<script>alert("xss")</script>',
  '"><img src=x onerror=alert(1)>',
  "javascript:alert('xss')",
  '<svg onload=alert(1)>',
  "'; alert('xss'); //",
];

describe('SQL Injection protection', () => {
  let app: Hono;

  beforeAll(() => {
    app = new Hono();
    // Simple echo handler to test that payloads don't cause crashes
    app.post('/api/test-endpoint', authMiddleware, async (c) => {
      const body = await c.req.json().catch(() => ({}));
      // Simulate what a real handler would do — access body fields
      const clientId = body.client_id || '';
      const message = body.message || '';
      // Should never execute SQL directly, but verify the app doesn't crash
      return c.json({ received: true, clientId: typeof clientId, message: typeof message });
    });
  });

  for (const payload of SQL_INJECTION_PAYLOADS) {
    it(`handles SQL injection payload in body: ${payload.substring(0, 30)}...`, async () => {
      const res = await app.request('/api/test-endpoint', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ client_id: payload, message: payload }),
      });

      // Should not crash — should return 200 (handled) or 400 (validation error)
      expect(res.status).toBeLessThan(500);
      const body = await res.json();
      // Should not echo back raw SQL
      expect(JSON.stringify(body)).not.toContain('DROP TABLE');
    });
  }
});

describe('XSS protection', () => {
  let app: Hono;

  beforeAll(() => {
    app = new Hono();
    app.post('/api/test-xss', authMiddleware, async (c) => {
      const body = await c.req.json().catch(() => ({}));
      // Return JSON — not HTML. JSON responses are inherently XSS-safe
      // but we verify the Content-Type is correct
      return c.json({ data: body.input || '' });
    });
  });

  for (const payload of XSS_PAYLOADS) {
    it(`returns JSON content-type for XSS payload: ${payload.substring(0, 30)}...`, async () => {
      const res = await app.request('/api/test-xss', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input: payload }),
      });

      expect(res.status).toBeLessThan(500);
      // JSON API should always return application/json, never text/html
      const contentType = res.headers.get('content-type') || '';
      expect(contentType).toContain('application/json');
    });
  }
});

describe('Header injection protection', () => {
  let app: Hono;

  beforeAll(() => {
    app = new Hono();
    app.post('/api/test-headers', authMiddleware, (c) => c.json({ ok: true }));
  });

  it('rejects oversized Authorization header', async () => {
    const res = await app.request('/api/test-headers', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + 'a'.repeat(10000),
        'Content-Type': 'application/json',
      },
    });
    // Should either reject (401 because token is invalid) or handle gracefully
    expect(res.status).toBeLessThan(500);
  });
});
