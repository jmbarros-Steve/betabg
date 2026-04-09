import { cors } from 'hono/cors';

export const corsMiddleware = cors({
  origin: (origin) => {
    // No Origin header (same-origin, server-to-server, cURL) — allow through
    if (!origin) return origin;

    // SECURITY: Reject "null" string origin (sandboxed iframes, data: URIs, file://)
    // This is different from undefined/missing — the string "null" can be used in attacks
    if (origin === 'null') return '';

    const allowed = [
      'https://steve.cl',
      'https://www.steve.cl',
      'https://app.steve.cl',
    ];
    if (allowed.includes(origin)) return origin;

    // Vercel preview deployments (HTTPS only)
    if (origin.endsWith('.vercel.app') && origin.startsWith('https://')) return origin;

    // Local development
    if (origin.startsWith('http://localhost')) return origin;

    return '';
  },
  allowHeaders: [
    'authorization',
    'x-client-info',
    'apikey',
    'content-type',
    'x-internal-key',
    'x-cron-secret',
    'x-shopify-hmac-sha256',
    'x-shopify-topic',
    'x-shopify-shop-domain',
    'x-shopify-webhook-id',
    'x-shopify-session-token',
    'x-shopify-host',
    'x-shopify-shop',
    'x-supabase-client-platform',
    'x-supabase-client-platform-version',
    'x-supabase-client-runtime',
    'x-supabase-client-runtime-version',
  ],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  maxAge: 86400,
});
