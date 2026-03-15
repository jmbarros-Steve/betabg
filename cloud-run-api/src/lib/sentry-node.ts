import * as Sentry from '@sentry/node';

export function initSentryNode() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: 0.2,
  });
}

export { Sentry };
