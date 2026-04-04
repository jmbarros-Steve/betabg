import { cors } from 'hono/cors';

export const corsMiddleware = cors({
  origin: (origin) => {
    if (!origin) return origin;
    const allowed = [
      'https://steve.cl',
      'https://www.steve.cl',
      'https://app.steve.cl',
    ];
    if (allowed.includes(origin)) return origin;
    if (origin.endsWith('.vercel.app') && origin.startsWith('https://')) return origin;
    if (origin.startsWith('http://localhost')) return origin;
    return '';
  },
  allowHeaders: [
    'authorization',
    'x-client-info',
    'apikey',
    'content-type',
    'x-internal-key',
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
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  maxAge: 86400,
});
