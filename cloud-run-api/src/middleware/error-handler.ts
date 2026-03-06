import { Context } from 'hono';

/**
 * Global error handler.
 * Catches unhandled errors and returns a consistent JSON response.
 */
export function errorHandler(err: Error, c: Context) {
  console.error(`[ERROR] ${c.req.method} ${c.req.path}:`, err.message);
  console.error(err.stack);

  return c.json(
    {
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    },
    500
  );
}
