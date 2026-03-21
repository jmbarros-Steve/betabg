/**
 * Test setup — mock environment variables needed by the application.
 * Imported automatically via vitest globals or explicitly in test files.
 */

// Set environment variables before any module loads
process.env.SUPABASE_URL = "https://test-project.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key-12345";
process.env.SUPABASE_ANON_KEY = "test-anon-key-12345";
process.env.META_APP_ID = "000000000000000";
process.env.META_APP_SECRET = "test-meta-app-secret";
process.env.SENTRY_DSN = "https://examplePublicKey@o0.ingest.sentry.io/0";
process.env.RESEND_API_KEY = "re_test_1234567890";
process.env.SHOPIFY_WEBHOOK_SECRET = "test-shopify-webhook-secret";
process.env.SHOPIFY_CLIENT_SECRET = "test-shopify-client-secret";
process.env.NODE_ENV = "test";
