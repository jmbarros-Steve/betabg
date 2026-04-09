import * as Sentry from '@sentry/node';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler } from './middleware/error-handler.js';
import { registerRoutes } from './routes/index.js';
import { checkRateLimit } from './lib/rate-limiter.js';

// Sentry — error monitoring backend
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: 'production',
  tracesSampleRate: 0.2,
});

// Catch silent crashes
process.on('uncaughtException', (err) => {
  Sentry.captureException(err);
  console.error('[FATAL] uncaughtException:', err.message, err.stack);
});
process.on('unhandledRejection', (reason) => {
  Sentry.captureException(reason);
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

// Mandatory env vars — fail fast on startup if any are missing
const REQUIRED_ENV_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'ANTHROPIC_API_KEY',
  'RESEND_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'META_APP_ID',
  'META_APP_SECRET',
  'META_SYSTEM_TOKEN',
  'STEVE_BM_ID',
  'APIFY_TOKEN',
  'ENCRYPTION_KEY',
  'CRON_SECRET',
  'SELF_URL',
  'UNSUBSCRIBE_SECRET',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
] as const;

const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`[STARTUP] Missing required env vars: ${missing.join(', ')}`);
  // Log but don't crash — Cloud Run needs the process alive to receive health checks
  // so operators can see the error in logs and fix it.
}

const app = new Hono();

// Global middleware
app.use('*', corsMiddleware);
app.onError(errorHandler);

// Rate limiting middleware for public endpoints
app.use('/health', async (c, next) => {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = checkRateLimit(ip, 'health', 30); // 30 req/min
  if (!rl.allowed) {
    return c.json({ error: 'Rate limited', retryAfter: rl.retryAfter }, 429);
  }
  await next();
});

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
