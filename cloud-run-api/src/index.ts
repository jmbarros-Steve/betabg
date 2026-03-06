import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler } from './middleware/error-handler.js';
import { registerRoutes } from './routes/index.js';

const app = new Hono();

// Global middleware
app.use('*', corsMiddleware);
app.onError(errorHandler);

// Health check
app.get('/health', (c) =>
  c.json({ status: 'ok', timestamp: new Date().toISOString() })
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
