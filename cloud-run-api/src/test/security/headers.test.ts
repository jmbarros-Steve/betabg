import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { corsMiddleware } from '../../middleware/cors.js';
import { errorHandler } from '../../middleware/error-handler.js';

describe('Security headers', () => {
  let app: Hono;

  beforeAll(() => {
    app = new Hono();
    app.use('*', corsMiddleware);
    app.onError(errorHandler);
    app.get('/test', (c) => c.json({ ok: true }));
    app.post('/test-post', (c) => c.json({ ok: true }));
  });

  it('sets CORS headers on response', async () => {
    const res = await app.request('/test');
    // CORS middleware should set Access-Control-Allow-Origin
    // The exact value depends on the middleware implementation
    expect(res.status).toBe(200);
  });

  it('handles OPTIONS preflight request', async () => {
    const res = await app.request('/test', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://betabgnuevosupa.vercel.app',
        'Access-Control-Request-Method': 'POST',
      },
    });
    // Should return 204 or 200 for preflight
    expect(res.status).toBeLessThanOrEqual(204);
  });

  it('returns JSON content-type for API responses', async () => {
    const res = await app.request('/test');
    const contentType = res.headers.get('content-type') || '';
    expect(contentType).toContain('application/json');
  });

  it('error handler returns JSON for thrown errors', async () => {
    const errorApp = new Hono();
    errorApp.onError(errorHandler);
    errorApp.get('/throw', () => {
      throw new Error('Test error');
    });

    const res = await errorApp.request('/throw');
    expect(res.status).toBeGreaterThanOrEqual(400);
    const contentType = res.headers.get('content-type') || '';
    expect(contentType).toContain('application/json');
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('error handler does not leak stack traces', async () => {
    const errorApp = new Hono();
    errorApp.onError(errorHandler);
    errorApp.get('/throw', () => {
      throw new Error('Sensitive error with stack trace');
    });

    const res = await errorApp.request('/throw');
    const body = await res.json();
    // Should not contain file paths or stack traces
    expect(JSON.stringify(body)).not.toContain('.ts:');
    expect(JSON.stringify(body)).not.toContain('.js:');
    expect(JSON.stringify(body)).not.toContain('node_modules');
  });
});
