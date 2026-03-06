import { Hono } from 'hono';

/**
 * Registers all API routes on the Hono app.
 * Routes are added incrementally as functions are migrated from Supabase.
 *
 * Convention: each route maps to /api/{original-function-name}
 * to maintain consistency with the frontend callApi() helper.
 */
export function registerRoutes(app: Hono) {
  // ============================================================
  // Phase 1: Utilities (low-risk, JSON in/out)
  // ============================================================
  // Uncomment as functions are migrated:
  // app.post('/api/chonga-support', authMiddleware, chongaSupport);
  // app.post('/api/parse-email-html', authMiddleware, parseEmailHtml);
  // app.post('/api/check-video-status', authMiddleware, checkVideoStatus);
  // ... etc.

  // ============================================================
  // Phase 2: AI & Analytics
  // ============================================================
  // app.post('/api/steve-chat', authMiddleware, steveChat);
  // app.post('/api/analyze-brand-research', authMiddleware, analyzeBrandResearch);
  // app.post('/api/analyze-brand-strategy', authMiddleware, analyzeBrandStrategy);
  // ... etc.

  // ============================================================
  // Phase 3: Platform Integrations
  // ============================================================
  // Shopify
  // app.post('/api/fetch-shopify-products', authMiddleware, fetchShopifyProducts);
  // Meta
  // app.post('/api/fetch-meta-ad-accounts', authMiddleware, fetchMetaAdAccounts);
  // Google
  // app.post('/api/fetch-campaign-adsets', authMiddleware, fetchCampaignAdsets);
  // Klaviyo
  // app.post('/api/store-klaviyo-connection', authMiddleware, storeKlaviyoConnection);
  // ... etc.

  // ============================================================
  // Phase 4: Auth & OAuth
  // ============================================================
  // app.post('/api/self-signup', selfSignup);  // No auth (public)
  // app.get('/api/shopify-install', shopifyInstall);  // No auth (redirect)
  // app.all('/api/shopify-oauth-callback', shopifyOauthCallback);
  // app.post('/api/shopify-gdpr-webhooks', shopifyHmacMiddleware, shopifyGdprWebhooks);
  // ... etc.
}
