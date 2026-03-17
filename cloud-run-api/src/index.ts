import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler } from './middleware/error-handler.js';
import { registerRoutes } from './routes/index.js';

// Catch silent crashes
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err.message, err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason);
});
process.on('SIGTERM', () => {
  console.log('[LIFECYCLE] SIGTERM received');
});
process.on('SIGINT', () => {
  console.log('[LIFECYCLE] SIGINT received');
});
process.on('exit', (code) => {
  console.log(`[LIFECYCLE] Process exit with code ${code}`);
});

const app = new Hono();

// Global middleware
app.use('*', corsMiddleware);
app.onError(errorHandler);

// Health check (both / and /health for compatibility)
app.get('/', (c) =>
  c.json({ status: 'ok', service: 'steve-api', timestamp: new Date().toISOString() })
);
app.get('/health', (c) =>
  c.json({ status: 'ok', service: 'steve-api', timestamp: new Date().toISOString() })
);

// Register all API routes
registerRoutes(app);

// 404 handler
app.notFound((c) =>
  c.json({ error: 'Not found', path: c.req.path }, 404)
);

const port = parseInt(process.env.PORT || '8080');
serve({ fetch: app.fetch, port }, () => {
  console.log(`Steve API running on port ${port}`);
});
