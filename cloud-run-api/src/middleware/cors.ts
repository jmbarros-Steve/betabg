import { cors } from 'hono/cors';

export const corsMiddleware = cors({
  origin: '*',
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
