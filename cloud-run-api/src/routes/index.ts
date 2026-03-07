import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';

// Phase 1: Utilities
import { chongaSupport } from './utilities/chonga-support.js';
import { parseEmailHtml } from './utilities/parse-email-html.js';
import { checkVideoStatus } from './utilities/check-video-status.js';
import { exportAllData } from './utilities/export-all-data.js';
import { exportDatabase } from './utilities/export-database.js';
import { learnFromSource } from './utilities/learn-from-source.js';
import { trainSteve } from './utilities/train-steve.js';
import { analyzeAdImage } from './utilities/analyze-ad-image.js';
import { generateBriefVisual } from './utilities/generate-brief-visual.js';
import { generateCopy } from './utilities/generate-copy.js';
import { generateGoogleCopy } from './utilities/generate-google-copy.js';
import { generateCampaignRecommendations } from './utilities/generate-campaign-recommendations.js';
import { processQueueItem } from './utilities/process-queue-item.js';
import { processTranscription } from './utilities/process-transcription.js';

// Phase 2: AI
import { steveChat } from './ai/steve-chat.js';
import { steveStrategy } from './ai/steve-strategy.js';
import { steveEmailContent } from './ai/steve-email-content.js';
import { steveSendTimeAnalysis } from './ai/steve-send-time-analysis.js';
import { steveBulkAnalyze } from './ai/steve-bulk-analyze.js';
import { generateMetaCopy } from './ai/generate-meta-copy.js';
import { generateImage } from './ai/generate-image.js';
import { generateVideo } from './ai/generate-video.js';
import { generateMassCampaigns } from './ai/generate-mass-campaigns.js';
import { analyzeBrand } from './ai/analyze-brand.js';
import { analyzeBrandResearch } from './ai/analyze-brand-research.js';
import { analyzeBrandStrategy } from './ai/analyze-brand-strategy.js';

// Phase 2: Analytics
import { syncCompetitorAds } from './analytics/sync-competitor-ads.js';
import { deepDiveCompetitor } from './analytics/deep-dive-competitor.js';
import { fetchCampaignAdsets } from './analytics/fetch-campaign-adsets.js';
import { syncCampaignMetrics } from './analytics/sync-campaign-metrics.js';

// Phase 3: Shopify
import { fetchShopifyAnalytics } from './shopify/fetch-shopify-analytics.js';
import { fetchShopifyProducts } from './shopify/fetch-shopify-products.js';
import { fetchShopifyCollections } from './shopify/fetch-shopify-collections.js';
import { createShopifyDiscount } from './shopify/create-shopify-discount.js';
import { shopifySessionValidate } from './shopify/shopify-session-validate.js';
import { syncShopifyMetrics } from './shopify/sync-shopify-metrics.js';

// Phase 3: Google
import { syncGoogleAdsMetrics } from './google/sync-google-ads-metrics.js';

// Phase 3: Other
import { storePlatformConnection } from './utilities/store-platform-connection.js';

// Phase 3: Klaviyo
import { fetchKlaviyoTopProducts } from './klaviyo/fetch-klaviyo-top-products.js';
import { storeKlaviyoConnection } from './klaviyo/store-klaviyo-connection.js';
import { importKlaviyoTemplates } from './klaviyo/import-klaviyo-templates.js';
import { uploadKlaviyoDrafts } from './klaviyo/upload-klaviyo-drafts.js';
import { klaviyoManageFlows } from './klaviyo/klaviyo-manage-flows.js';
import { klaviyoPushEmails } from './klaviyo/klaviyo-push-emails.js';
import { klaviyoSmartFormat } from './klaviyo/klaviyo-smart-format.js';
import { syncKlaviyoMetrics } from './klaviyo/sync-klaviyo-metrics.js';

// Phase 3: Meta
import { checkMetaScopes } from './meta/check-meta-scopes.js';
import { fetchMetaAdAccounts } from './meta/fetch-meta-ad-accounts.js';
import { fetchMetaBusinessHierarchy } from './meta/fetch-meta-business-hierarchy.js';
import { manageMetaAudiences } from './meta/manage-meta-audiences.js';
import { manageMetaCampaign } from './meta/manage-meta-campaign.js';
import { manageMetaPixel } from './meta/manage-meta-pixel.js';
import { metaSocialInbox } from './meta/meta-social-inbox.js';
import { metaDataDeletion } from './meta/meta-data-deletion.js';
import { syncMetaMetrics } from './meta/sync-meta-metrics.js';

// Phase 4: Auth
import { selfSignup } from './auth/self-signup.js';
import { adminCreateClient } from './auth/admin-create-client.js';
import { createClientUser } from './auth/create-client-user.js';

// Phase 4: OAuth
import { metaOauthCallback } from './oauth/meta-oauth-callback.js';
import { googleAdsOauthCallback } from './oauth/google-ads-oauth-callback.js';

// Phase 4: Shopify OAuth & Webhooks
import { shopifyInstall } from './shopify/shopify-install.js';
import { shopifyOauthCallback } from './shopify/shopify-oauth-callback.js';
import { shopifyFulfillmentWebhooks } from './shopify/shopify-fulfillment-webhooks.js';
import { shopifyGdprWebhooks } from './shopify/shopify-gdpr-webhooks.js';

/**
 * Registers all API routes on the Hono app.
 * Convention: each route maps to /api/{original-function-name}
 */
export function registerRoutes(app: Hono) {
  // ============================================================
  // Phase 1: Utilities (low-risk, JSON in/out)
  // ============================================================
  app.post('/api/chonga-support', authMiddleware, chongaSupport);
  app.post('/api/parse-email-html', authMiddleware, parseEmailHtml);
  app.post('/api/check-video-status', authMiddleware, checkVideoStatus);
  app.post('/api/export-all-data', authMiddleware, exportAllData);
  app.post('/api/export-database', exportDatabase); // Uses x-export-key, no JWT
  app.post('/api/learn-from-source', authMiddleware, learnFromSource);
  app.post('/api/train-steve', authMiddleware, trainSteve);
  app.post('/api/analyze-ad-image', authMiddleware, analyzeAdImage);
  app.post('/api/generate-brief-visual', authMiddleware, generateBriefVisual);
  app.post('/api/generate-copy', authMiddleware, generateCopy);
  app.post('/api/generate-google-copy', authMiddleware, generateGoogleCopy);
  app.post('/api/generate-campaign-recommendations', authMiddleware, generateCampaignRecommendations);
  app.post('/api/process-queue-item', authMiddleware, processQueueItem);
  app.post('/api/process-transcription', authMiddleware, processTranscription);

  // ============================================================
  // Phase 2: AI & Analytics
  // ============================================================
  app.post('/api/steve-chat', authMiddleware, steveChat);
  app.post('/api/steve-strategy', authMiddleware, steveStrategy);
  app.post('/api/steve-email-content', authMiddleware, steveEmailContent);
  app.post('/api/steve-send-time-analysis', authMiddleware, steveSendTimeAnalysis);
  app.post('/api/steve-bulk-analyze', authMiddleware, steveBulkAnalyze);
  app.post('/api/generate-meta-copy', authMiddleware, generateMetaCopy);
  app.post('/api/generate-image', authMiddleware, generateImage);
  app.post('/api/generate-video', authMiddleware, generateVideo);
  app.post('/api/generate-mass-campaigns', authMiddleware, generateMassCampaigns);
  app.post('/api/analyze-brand', authMiddleware, analyzeBrand);
  app.post('/api/analyze-brand-research', authMiddleware, analyzeBrandResearch);
  app.post('/api/analyze-brand-strategy', authMiddleware, analyzeBrandStrategy);
  app.post('/api/sync-competitor-ads', authMiddleware, syncCompetitorAds);
  app.post('/api/deep-dive-competitor', authMiddleware, deepDiveCompetitor);
  app.post('/api/fetch-campaign-adsets', authMiddleware, fetchCampaignAdsets);
  app.post('/api/sync-campaign-metrics', authMiddleware, syncCampaignMetrics);

  // ============================================================
  // Phase 3: Platform Integrations (Klaviyo)
  // ============================================================
  app.post('/api/fetch-klaviyo-top-products', authMiddleware, fetchKlaviyoTopProducts);
  app.post('/api/store-klaviyo-connection', authMiddleware, storeKlaviyoConnection);
  app.post('/api/import-klaviyo-templates', authMiddleware, importKlaviyoTemplates);
  app.post('/api/upload-klaviyo-drafts', authMiddleware, uploadKlaviyoDrafts);
  app.post('/api/klaviyo-manage-flows', authMiddleware, klaviyoManageFlows);
  app.post('/api/klaviyo-push-emails', authMiddleware, klaviyoPushEmails);
  app.post('/api/klaviyo-smart-format', authMiddleware, klaviyoSmartFormat);
  app.post('/api/sync-klaviyo-metrics', authMiddleware, syncKlaviyoMetrics);

  // ============================================================
  // Phase 3: Platform Integrations (Meta)
  // ============================================================
  app.post('/api/check-meta-scopes', authMiddleware, checkMetaScopes);
  app.post('/api/fetch-meta-ad-accounts', authMiddleware, fetchMetaAdAccounts);
  app.post('/api/fetch-meta-business-hierarchy', authMiddleware, fetchMetaBusinessHierarchy);
  app.post('/api/manage-meta-audiences', authMiddleware, manageMetaAudiences);
  app.post('/api/manage-meta-campaign', authMiddleware, manageMetaCampaign);
  app.post('/api/manage-meta-pixel', authMiddleware, manageMetaPixel);
  app.post('/api/meta-social-inbox', authMiddleware, metaSocialInbox);
  app.post('/api/meta-data-deletion', metaDataDeletion); // No JWT - called by Meta directly
  app.post('/api/sync-meta-metrics', authMiddleware, syncMetaMetrics);

  // ============================================================
  // Phase 3: Platform Integrations (Shopify)
  // ============================================================
  app.post('/api/fetch-shopify-analytics', authMiddleware, fetchShopifyAnalytics);
  app.post('/api/fetch-shopify-products', authMiddleware, fetchShopifyProducts);
  app.post('/api/fetch-shopify-collections', authMiddleware, fetchShopifyCollections);
  app.post('/api/create-shopify-discount', authMiddleware, createShopifyDiscount);
  app.post('/api/shopify-session-validate', shopifySessionValidate); // Uses Shopify session token, no JWT
  app.post('/api/sync-shopify-metrics', authMiddleware, syncShopifyMetrics);

  // ============================================================
  // Phase 3: Platform Integrations (Google + Other)
  // ============================================================
  app.post('/api/sync-google-ads-metrics', authMiddleware, syncGoogleAdsMetrics);
  app.post('/api/store-platform-connection', authMiddleware, storePlatformConnection);

  // ============================================================
  // Phase 4: Auth & OAuth
  // ============================================================
  app.post('/api/self-signup', selfSignup); // No JWT - creates users
  app.post('/api/admin-create-client', adminCreateClient); // No JWT - uses own secret
  app.post('/api/create-client-user', authMiddleware, createClientUser);
  app.post('/api/meta-oauth-callback', authMiddleware, metaOauthCallback);
  app.post('/api/google-ads-oauth-callback', authMiddleware, googleAdsOauthCallback);
  app.get('/api/shopify-install', shopifyInstall); // GET - browser redirect, no JWT
  app.all('/api/shopify-oauth-callback', shopifyOauthCallback); // GET + POST, no JWT
  app.post('/api/shopify-fulfillment-webhooks', shopifyFulfillmentWebhooks); // No JWT - HMAC verified
  app.post('/api/shopify-gdpr-webhooks', shopifyGdprWebhooks); // No JWT - HMAC verified
}
