import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler } from './middleware/error-handler.js';
import { registerRoutes } from './routes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const UNLAYER_CUSTOM_TOOLS_JS = readFileSync(join(__dirname, 'static', 'unlayer-custom-tools.js'), 'utf-8');

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

// Health check
app.get('/health', (c) =>
  c.json({ status: 'ok', version: '2026-03-10-diag', timestamp: new Date().toISOString() })
);

// Serve Unlayer custom tools JS (static, no auth, CORS enabled)
app.get('/api/static/unlayer-custom-tools.js', (c) => {
  c.header('Content-Type', 'application/javascript; charset=utf-8');
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Cache-Control', 'public, max-age=3600');
  return c.body(UNLAYER_CUSTOM_TOOLS_JS);
});

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
