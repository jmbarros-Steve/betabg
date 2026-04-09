import { Context, Next } from 'hono';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Shopify HMAC verification middleware.
 * Validates webhook signatures from Shopify.
 */
export async function shopifyHmacMiddleware(c: Context, next: Next) {
  const hmacHeader = c.req.header('x-shopify-hmac-sha256');
  if (!hmacHeader) {
    return c.json({ error: 'Missing HMAC signature' }, 401);
  }

  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret) {
    console.error('Missing SHOPIFY_WEBHOOK_SECRET or SHOPIFY_CLIENT_SECRET');
    return c.json({ error: 'Server configuration error' }, 500);
  }

  const rawBody = await c.req.text();
  const hash = createHmac('sha256', secret).update(rawBody).digest('base64');

  const hashBuffer = Buffer.from(hash);
  const hmacBuffer = Buffer.from(hmacHeader);

  if (hashBuffer.length !== hmacBuffer.length || !timingSafeEqual(hashBuffer, hmacBuffer)) {
    return c.json({ error: 'Invalid HMAC signature' }, 401);
  }

  // Store raw body for handler access
  c.set('rawBody', rawBody);
  try {
    c.set('parsedBody', JSON.parse(rawBody));
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  await next();
}
