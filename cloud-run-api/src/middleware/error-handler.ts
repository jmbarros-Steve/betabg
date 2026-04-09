import * as Sentry from '@sentry/node';
import { Context } from 'hono';

/**
 * Global error handler.
 * Catches unhandled errors and returns a consistent JSON response.
 * SECURITY: Never leak stack traces or detailed error messages in production.
 */
export function errorHandler(err: Error, c: Context) {
  // Always log full details server-side for debugging
  console.error(`[ERROR] ${c.req.method} ${c.req.path}:`, err.message);
  console.error(err.stack);

  // Report to Sentry for production monitoring
  Sentry.captureException(err, {
    extra: { method: c.req.method, path: c.req.path },
  });

  const isDev = process.env.NODE_ENV === 'development';

  return c.json(
    {
      error: isDev ? err.message : 'Internal server error',
      ...(isDev && { stack: err.stack }),
    },
    500
  );
}
