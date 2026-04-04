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
import { onboardingBot } from './utilities/onboarding-bot.js';
import { checkClientConnections } from './utilities/check-client-connections.js';
import { creativeReviewFeed } from './utilities/creative-review-feed.js';

// Phase 2: AI
import { steveChat } from './ai/steve-chat.js';
import { steveStrategy } from './ai/steve-strategy.js';
import { steveEmailContent } from './ai/steve-email-content.js';
import { steveSendTimeAnalysis } from './ai/steve-send-time-analysis.js';
import { steveBulkAnalyze } from './ai/steve-bulk-analyze.js';
import { generateMetaCopy } from './ai/generate-meta-copy.js';
import { generateImage } from './ai/generate-image.js';
import { generateVideo } from './ai/generate-video.js';
import { generateVideoScript } from './ai/generate-video-script.js';
import { generateMassCampaigns } from './ai/generate-mass-campaigns.js';
import { analyzeBrand } from './ai/analyze-brand.js';
import { analyzeBrandResearch } from './ai/analyze-brand-research.js';
import { analyzeBrandStrategy } from './ai/analyze-brand-strategy.js';
import { editImageGemini } from './ai/edit-image-gemini.js';
import { criterioMetaHandler } from './ai/criterio-meta.js';
import { criterioEmail } from './ai/criterio-email.js';

import { creativePreview } from './ai/creative-preview.js';
import { espejoHandler } from './ai/espejo.js';

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
import { fetchShopifyDiscounts } from './shopify/fetch-shopify-discounts.js';
import { fetchShopifyCustomers } from './shopify/fetch-shopify-customers.js';
import { updateShopifyProduct } from './shopify/update-shopify-product.js';
import { generateProductDescription } from './shopify/generate-product-description.js';
import { computeCrossSell } from './shopify/compute-cross-sell.js';
import { collectionRevenue } from './shopify/collection-revenue.js';
import { createShopifyCombo } from './shopify/create-shopify-combo.js';

// Phase 3: Google
import { syncGoogleAdsMetrics } from './google/sync-google-ads-metrics.js';

// Phase 3: Other
import { storePlatformConnection } from './utilities/store-platform-connection.js';
import { manageSources } from './utilities/manage-sources.js';
import { approveKnowledge } from './utilities/approve-knowledge.js';
import { submitCorrection } from './utilities/submit-correction.js';
import { swarmSources } from './utilities/swarm-sources.js';

// Phase 3: Klaviyo
import { fetchKlaviyoTopProducts } from './klaviyo/fetch-klaviyo-top-products.js';
import { storeKlaviyoConnection } from './klaviyo/store-klaviyo-connection.js';
import { importKlaviyoTemplates } from './klaviyo/import-klaviyo-templates.js';
import { uploadKlaviyoDrafts } from './klaviyo/upload-klaviyo-drafts.js';
import { klaviyoManageFlows } from './klaviyo/klaviyo-manage-flows.js';
import { klaviyoPushEmails } from './klaviyo/klaviyo-push-emails.js';
import { klaviyoSmartFormat } from './klaviyo/klaviyo-smart-format.js';
import { syncKlaviyoMetrics } from './klaviyo/sync-klaviyo-metrics.js';
import { previewFlowEmails } from './klaviyo/preview-flow-emails.js';

// Phase 3: Instagram
import { publishInstagram, cronPublishInstagram } from './instagram/publish-instagram.js';

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
import { manageMetaRules } from './meta/manage-meta-rules.js';
import { metaTargetingSearch } from './meta/meta-targeting-search.js';
import { detectAudienceOverlap } from './meta/detect-audience-overlap.js';
import { syncKlaviyoToMetaAudience } from './meta/sync-klaviyo-to-meta-audience.js';
import { metaCatalogs } from './meta/meta-catalogs.js';
import { metaAdsetAction } from './meta/meta-adset-action.js';

// Instagram
import { fetchInstagramInsights } from './instagram/fetch-instagram-insights.js';

// WhatsApp
import { setupMerchantHandler } from './whatsapp/setup-merchant.js';
import { waStatusCallback } from './whatsapp/status-callback.js';

// Cron
import { syncAllMetrics } from './cron/sync-all-metrics.js';
import { errorBudgetCalculator } from './cron/error-budget-calculator.js';
import { reconciliation } from './cron/reconciliation.js';
import { ruleCalibrator } from './cron/rule-calibrator.js';
import { autoRuleGenerator } from './cron/auto-rule-generator.js';
import { weeklyReport } from './cron/weekly-report.js';
import { rootCauseAnalysis } from './cron/root-cause-analysis.js';
import { autoPostmortem } from './cron/auto-postmortem.js';
import { restartService } from './cron/restart-service.js';
import { fatigueDetector } from './cron/fatigue-detector.js';
import { performanceEvaluator } from './cron/performance-evaluator.js';
import { performanceTrackerMeta } from './cron/performance-tracker-meta.js';
import { executeMetaRulesCron } from './cron/execute-meta-rules.js';
import { taskPrioritizer } from './cron/task-prioritizer.js';
import { taskCompleted } from './cron/task-completed.js';
import { detectiveVisual } from './cron/detective-visual.js';
import { skyvernDispatcher } from './cron/skyvern-dispatcher.js';
import { prospectFollowup } from './cron/prospect-followup.js';
import { prospectRottingDetector } from './cron/prospect-rotting-detector.js';
import { meetingReminder } from './cron/meeting-reminder.js';
import { prospectEmailNurture } from './cron/prospect-email-nurture.js';
import { knowledgeDecay } from './cron/knowledge-decay.js';
import { knowledgeConsolidator } from './cron/knowledge-consolidator.js';
import { knowledgeDedup } from './cron/knowledge-dedup.js';
import { onboardingWA } from './cron/onboarding-wa.js';
import { merchantUpsell } from './cron/merchant-upsell.js';
import { churnDetector } from './cron/churn-detector.js';
import { funnelDiagnosis } from './cron/funnel-diagnosis.js';
import { predictiveAlerts } from './cron/predictive-alerts.js';
import { anomalyDetector } from './cron/anomaly-detector.js';
import { autoBriefGenerator } from './cron/auto-brief-generator.js';
import { crossClientLearning } from './cron/cross-client-learning.js';
import { revenueAttribution } from './cron/revenue-attribution.js';
import { knowledgeQualityScore } from './cron/knowledge-quality-score.js';
import { steveContentHunter } from './cron/steve-content-hunter.js';
import { steveAgentLoop } from './cron/steve-agent-loop.js';
import { steveDiscoverer } from './cron/steve-discoverer.js';
import { stevePromptEvolver } from './cron/steve-prompt-evolver.js';
import { wolfNightMode } from './cron/wolf-night-mode.js';
import { wolfMorningSend } from './cron/wolf-morning-send.js';
import { salesLearningLoop } from './cron/sales-learning-loop.js';
import { waActionProcessor } from './cron/wa-action-processor.js';
import { swarmResearch } from './cron/swarm-research.js';
import { autoLearningDigest } from './cron/auto-learning-digest.js';
import { knowledgePropagationCatchup } from './cron/knowledge-propagation-catchup.js';
import { validateContexts } from './cron/validate-contexts.js';

// WhatsApp
import { steveWAChat } from './whatsapp/steve-wa-chat.js';
import { merchantWAWebhook } from './whatsapp/merchant-wa.js';
import { waSendMessage } from './whatsapp/send-message.js';
import { waSendCampaign } from './whatsapp/send-campaign.js';
import { shopifyCheckoutWebhook } from './whatsapp/shopify-checkout-webhook.js';
import { abandonedCartWA } from './whatsapp/abandoned-cart-wa.js';
import { prospectTrial } from './whatsapp/prospect-trial.js';

// Public (no auth)
import { auditStore } from './public/audit-store.js';
import { approveRulesPublic } from './public/approve-rules-public.js';

// Triggers
import { apiChangelogWatcher } from './triggers/api-changelog-watcher.js';
import { competitorSpy } from './triggers/competitor-spy.js';

// CRM
import { prospectDetail, prospectAddNote, prospectChangeStage, prospectChangePriority, prospectUpdateTags, prospectsKanban, prospectMoveStage, prospectUpdateDeal } from './crm/prospect-crm.js';
import { salesTasksCrud, salesTasksAutoGenerate } from './crm/sales-tasks.js';
import { proposalsCrud, proposalsGenerate } from './crm/proposals.js';
import { sellersList } from './crm/sellers.js';
import { webFormsCrud, webFormSubmit, webFormConfig } from './crm/web-forms.js';

// Booking
import { bookingSlots, bookingConfirm } from './booking/booking-api.js';
import { googleCalendarOauthCallback } from './oauth/google-calendar-oauth-callback.js';

// El Chino — Check System + Fix Queue + Fixer + Reports
import {
  chinoRun, chinoReport, chinoLatest, chinoFailures,
  chinoFixNext, chinoFixDone, chinoFixFailed,
  chinoFixer, chinoReportSend, chinoInstruction,
} from '../chino/endpoints.js';

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
import { storeShopifyCredentials } from './shopify/store-shopify-credentials.js';
import { storeShopifyToken } from './shopify/store-shopify-token.js';

// Phase 5: Steve Mail (Email Marketing)
import { sendEmailHandler } from './email/send-email.js';
import { syncSubscribers } from './email/sync-subscribers.js';
import { manageEmailCampaigns, executeScheduledCampaign } from './email/manage-campaigns.js';
import { trackOpen, trackClick, sesWebhooks } from './email/track-events.js';
import { emailUnsubscribe } from './email/unsubscribe.js';
import { emailFlowExecute, manageEmailFlows } from './email/flow-engine.js';
import { emailFlowWebhooks, emailFlowCronWinback, emailFlowCronBirthday, emailFlowTrackBrowse } from './email/flow-webhooks.js';
import { queryEmailSubscribers } from './email/query-subscribers.js';
import { verifyEmailDomain } from './email/verify-domain.js';
import { emailCampaignAnalytics } from './email/campaign-analytics.js';
import { generateSteveMailContent } from './email/generate-email-content.js';
import { productAlerts } from './email/product-alerts.js';
import { productAlertWidget } from './email/product-alert-widget.js';
import { productRecommendations } from './email/product-recommendations.js';
import { emailAbTesting, executeAbTestWinner } from './email/ab-testing.js';
import { emailRevenueAttribution } from './email/revenue-attribution.js';
import { signupForms, signupFormPublic } from './email/signup-forms.js';
import { formWidget } from './email/form-widget.js';
import { emailTemplatesApi, universalBlocksApi } from './email/email-templates-api.js';
import { seedSystemEmailTemplates } from '../seed/email-system-templates.js';
import { seedChinoChecks } from '../seed/chino-checks-seed.js';
import { smartSendTime } from './email/smart-send-time.js';
import { emailSendQueue } from './email/send-queue.js';
import { emailListCleanup } from './email/list-cleanup.js';
import { uploadEmailImage } from './email/upload-email-image.js';
import { manageEmailLists } from './email/manage-email-lists.js';

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
  app.post('/api/onboarding-bot', authMiddleware, onboardingBot);
  app.post('/api/check-client-connections', authMiddleware, checkClientConnections);
  app.post('/api/manage-sources', authMiddleware, manageSources);
  app.post('/api/approve-knowledge', authMiddleware, approveKnowledge);
  app.post('/api/submit-correction', authMiddleware, submitCorrection);
  app.post('/api/swarm-sources', authMiddleware, swarmSources);
  app.post('/api/creative-review-feed', authMiddleware, creativeReviewFeed);

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
  app.post('/api/generate-video-script', authMiddleware, generateVideoScript);
  app.post('/api/generate-mass-campaigns', authMiddleware, generateMassCampaigns);
  app.post('/api/analyze-brand', authMiddleware, analyzeBrand);
  app.post('/api/analyze-brand-research', authMiddleware, analyzeBrandResearch);
  app.post('/api/analyze-brand-strategy', authMiddleware, analyzeBrandStrategy);
  app.post('/api/edit-image-gemini', authMiddleware, editImageGemini);
  app.post('/api/criterio-meta', authMiddleware, criterioMetaHandler);
  app.post('/api/criterio-email', authMiddleware, criterioEmail);

  app.post('/api/creative-preview', authMiddleware, creativePreview);
  app.post('/api/espejo', authMiddleware, espejoHandler);
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
  app.post('/api/preview-flow-emails', authMiddleware, previewFlowEmails);

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
  app.post('/api/manage-meta-rules', authMiddleware, manageMetaRules);
  app.post('/api/meta-targeting-search', authMiddleware, metaTargetingSearch);
  app.post('/api/detect-audience-overlap', authMiddleware, detectAudienceOverlap);
  app.post('/api/sync-klaviyo-to-meta-audience', authMiddleware, syncKlaviyoToMetaAudience);
  app.post('/api/meta-catalogs', authMiddleware, metaCatalogs);
  app.post('/api/meta-adset-action', authMiddleware, metaAdsetAction);

  // ============================================================
  // Phase 3: Platform Integrations (Instagram)
  // ============================================================
  app.post('/api/publish-instagram', authMiddleware, publishInstagram);
  app.post('/api/cron/publish-instagram', cronPublishInstagram); // No JWT — uses X-Cron-Secret
  app.post('/api/fetch-instagram-insights', authMiddleware, fetchInstagramInsights);

  // ============================================================
  // Phase 3: Platform Integrations (Shopify)
  // ============================================================
  app.post('/api/fetch-shopify-analytics', authMiddleware, fetchShopifyAnalytics);
  app.post('/api/fetch-shopify-products', authMiddleware, fetchShopifyProducts);
  app.post('/api/fetch-shopify-collections', authMiddleware, fetchShopifyCollections);
  app.post('/api/create-shopify-discount', authMiddleware, createShopifyDiscount);
  app.post('/api/shopify-session-validate', shopifySessionValidate); // Uses Shopify session token, no JWT
  app.post('/api/sync-shopify-metrics', authMiddleware, syncShopifyMetrics);
  app.post('/api/fetch-shopify-discounts', authMiddleware, fetchShopifyDiscounts);
  app.post('/api/store-shopify-credentials', authMiddleware, storeShopifyCredentials);
  app.post('/api/store-shopify-token', authMiddleware, storeShopifyToken);
  app.post('/api/fetch-shopify-customers', authMiddleware, fetchShopifyCustomers);
  app.post('/api/update-shopify-product', authMiddleware, updateShopifyProduct);
  app.post('/api/generate-product-description', authMiddleware, generateProductDescription);
  app.post('/api/compute-cross-sell', authMiddleware, computeCrossSell);
  app.post('/api/collection-revenue', authMiddleware, collectionRevenue);
  app.post('/api/create-shopify-combo', authMiddleware, createShopifyCombo);

  // ============================================================
  // Phase 3: Platform Integrations (Google + Other)
  // ============================================================
  app.post('/api/sync-google-ads-metrics', authMiddleware, syncGoogleAdsMetrics);
  app.post('/api/store-platform-connection', authMiddleware, storePlatformConnection);

  // ============================================================
  // Public endpoints (no JWT)
  // ============================================================
  app.post('/api/audit-store', auditStore); // No JWT — landing page store audit

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

  // ============================================================
  // Phase 5: Steve Mail (Email Marketing)
  // ============================================================
  // Authenticated endpoints (require JWT)
  app.post('/api/send-email', authMiddleware, sendEmailHandler);
  app.post('/api/sync-email-subscribers', authMiddleware, syncSubscribers);
  app.post('/api/manage-email-campaigns', authMiddleware, manageEmailCampaigns);
  app.post('/api/manage-email-flows', authMiddleware, manageEmailFlows);
  app.post('/api/query-email-subscribers', authMiddleware, queryEmailSubscribers);
  app.post('/api/manage-email-lists', authMiddleware, manageEmailLists);
  app.post('/api/verify-email-domain', authMiddleware, verifyEmailDomain);
  app.post('/api/email-campaign-analytics', authMiddleware, emailCampaignAnalytics);
  app.post('/api/generate-steve-mail-content', authMiddleware, generateSteveMailContent);
  app.post('/api/upload-email-image', authMiddleware, uploadEmailImage);

  // Product recommendations (auth required)
  app.post('/api/email-product-recommendations', authMiddleware, productRecommendations);

  // Email templates gallery & universal blocks
  app.post('/api/email-templates', authMiddleware, emailTemplatesApi);
  app.post('/api/universal-blocks', authMiddleware, universalBlocksApi);

  // Seed system email templates (admin only, idempotent)
  app.post('/api/seed-email-templates', async (c) => {
    try {
      const result = await seedSystemEmailTemplates();
      return c.json(result);
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // Seed El Chino checks (temporary, idempotent)
  app.post('/api/seed-chino-checks', async (c) => {
    try {
      const result = await seedChinoChecks();
      return c.json(result);
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // A/B testing (auth required)
  app.post('/api/email-ab-testing', authMiddleware, emailAbTesting);
  app.post('/api/email-revenue-attribution', authMiddleware, emailRevenueAttribution);
  app.post('/api/execute-ab-test-winner', authMiddleware, executeAbTestWinner); // Cloud Tasks internal call

  // Signup forms (auth for management)
  app.post('/api/email-signup-forms', authMiddleware, signupForms);

  // Product alerts (subscribe is public, management requires auth)
  app.post('/api/email-product-alerts', productAlerts); // Public — subscribe action has no auth
  app.get('/api/email-product-alert-widget', productAlertWidget); // Public — serves JS widget

  // Public endpoints for forms (no JWT - accessed from Shopify stores)
  app.post('/api/email-signup-form-public', signupFormPublic); // Public — form submit + get_config
  app.get('/api/email-form-widget', formWidget); // Public — serves JS widget

  // Public endpoints (no JWT - accessed from emails or external services)
  app.get('/api/email-track/open', trackOpen); // Tracking pixel in emails
  app.get('/api/email-track/click', trackClick); // Link click redirect
  app.get('/api/email-unsubscribe', emailUnsubscribe); // Unsubscribe link
  app.post('/api/email-ses-webhooks', sesWebhooks); // SES bounce/complaint notifications
  app.post('/api/email-flow-webhooks', emailFlowWebhooks); // Shopify webhook triggers - HMAC verified
  app.post('/api/email-flow-execute', authMiddleware, emailFlowExecute); // Cloud Tasks internal call
  app.post('/api/email-flow-cron-winback', authMiddleware, emailFlowCronWinback); // Cron: winback trigger
  app.post('/api/email-flow-cron-birthday', authMiddleware, emailFlowCronBirthday); // Cron: birthday trigger
  app.post('/api/email-flow-track-browse', emailFlowTrackBrowse); // Browse tracking pixel (public)
  app.post('/api/execute-scheduled-campaign', authMiddleware, executeScheduledCampaign); // Cloud Tasks internal call

  // Smart Send Time, Throttled Queue, List Cleanup
  app.post('/api/email-smart-send-time', authMiddleware, smartSendTime);
  app.post('/api/email-send-queue', authMiddleware, emailSendQueue);
  app.post('/api/email-list-cleanup', authMiddleware, emailListCleanup);

  // ============================================================
  // WhatsApp
  // ============================================================
  app.post('/api/whatsapp/setup-merchant', authMiddleware, setupMerchantHandler);
  app.post('/api/whatsapp/status-callback', waStatusCallback); // No JWT — called by Twilio

  // ============================================================
  // WhatsApp Webhooks (no JWT — Twilio sends form-encoded)
  // ============================================================
  app.post('/api/whatsapp/steve-wa-chat', steveWAChat); // Twilio webhook: merchant → Steve
  app.post('/api/whatsapp/merchant-wa/:clientId', merchantWAWebhook); // Twilio webhook: customer → merchant store
  app.post('/api/whatsapp/send-message', authMiddleware, waSendMessage); // Portal: merchant sends manual reply
  app.post('/api/whatsapp/send-campaign', authMiddleware, waSendCampaign); // Portal: send bulk WA campaign
  app.post('/api/whatsapp/shopify-checkout-webhook', shopifyCheckoutWebhook); // No JWT — Shopify HMAC
  app.post('/api/cron/abandoned-cart-wa', abandonedCartWA); // No JWT — X-Cron-Secret, hourly: 0 * * * *

  // ============================================================
  // Cron / Scheduled Jobs
  // ============================================================
  app.post('/api/cron/sync-all-metrics', syncAllMetrics); // No JWT — uses X-Cron-Secret
  app.post('/api/cron/changelog-watcher', apiChangelogWatcher); // No JWT — uses X-Cron-Secret, daily 0 7 * * *
  app.post('/api/cron/error-budget-calculator', errorBudgetCalculator); // No JWT — uses X-Cron-Secret, every 4h: 0 */4 * * *
  app.post('/api/cron/reconciliation', reconciliation); // No JWT — uses X-Cron-Secret, every 6h: 0 */6 * * *
  app.post('/api/cron/competitor-spy', competitorSpy); // No JWT — uses X-Cron-Secret, weekly: 0 6 * * 1 (Mon 6am Chile)
  app.post('/api/cron/rule-calibrator', ruleCalibrator); // No JWT — uses X-Cron-Secret, weekly: 0 3 * * 0 (Sun 3am)
  app.post('/api/cron/auto-rule-generator', autoRuleGenerator); // No JWT — uses X-Cron-Secret, on-demand from qa_log
  app.post('/api/cron/weekly-report', weeklyReport); // No JWT — uses X-Cron-Secret, weekly: 0 11 * * 1 (Mon 11am UTC = 8am Chile)
  app.post('/api/cron/root-cause-analysis', rootCauseAnalysis); // No JWT — uses X-Cron-Secret, weekly: 0 2 * * 0 (Sun 2am)
  app.post('/api/cron/auto-postmortem', autoPostmortem); // No JWT — uses X-Cron-Secret, on-demand when critical task completes
  app.post('/api/cron/restart-service', restartService); // No JWT — uses X-Cron-Secret, called by OJOS health-check
  app.post('/api/cron/fatigue-detector', fatigueDetector); // No JWT — uses X-Cron-Secret, daily: 0 11 * * * (11am)
  app.post('/api/cron/performance-evaluator', performanceEvaluator); // No JWT — uses X-Cron-Secret, daily: 0 10 * * * (10am)
  app.post('/api/cron/performance-tracker-meta', performanceTrackerMeta); // No JWT — uses X-Cron-Secret, daily: 0 8 * * * (8am)
  app.post('/api/cron/execute-meta-rules', executeMetaRulesCron); // No JWT — daily: 0 9 * * * (once per day)
  app.post('/api/cron/task-prioritizer', taskPrioritizer); // No JWT — uses X-Cron-Secret, hourly: 0 */1 * * *
  app.post('/api/task-completed', taskCompleted); // No JWT — uses X-Cron-Secret, called by Leonardo when task is done
  app.post('/api/cron/detective-visual', detectiveVisual); // No JWT — uses X-Cron-Secret, every 2h: 0 8,10,12,14,16,18,20 * * *
  app.post('/api/cron/skyvern-dispatcher', skyvernDispatcher); // No JWT — uses X-Cron-Secret, every 2min: */2 * * * *
  app.post('/api/cron/prospect-followup', prospectFollowup); // No JWT — uses X-Cron-Secret, every 4h: 0 */4 * * *
  app.post('/api/cron/prospect-rotting-detector', prospectRottingDetector); // No JWT — uses X-Cron-Secret, every 6h: 0 */6 * * *
  app.post('/api/cron/meeting-reminder', meetingReminder); // No JWT — uses X-Cron-Secret, every 30min: */30 * * * *
  app.post('/api/cron/prospect-email-nurture', prospectEmailNurture); // No JWT — uses X-Cron-Secret, daily 1pm UTC (10am Chile): 0 13 * * *
  app.post('/api/cron/knowledge-decay', knowledgeDecay); // No JWT — uses X-Cron-Secret, monthly: 0 4 1 * *
  app.post('/api/cron/knowledge-consolidator', knowledgeConsolidator); // No JWT — monthly: 0 5 1 * * (1st of month, 5am)
  app.post('/api/cron/knowledge-dedup', knowledgeDedup); // No JWT — monthly: 0 6 1 * * (1st of month, 6am)
  app.post('/api/cron/steve-content-hunter', steveContentHunter); // No JWT — every 20min: */20 * * * *

  // ============================================================
  // Steve Sales + Post-Venta
  // ============================================================
  app.post('/api/whatsapp/prospect-trial', prospectTrial); // No JWT — uses X-Internal-Key, triggered by [ACTIVATE_TRIAL] tag
  app.post('/api/cron/onboarding-wa', onboardingWA); // No JWT — uses X-Cron-Secret, every 4h: 0 */4 * * *
  app.post('/api/cron/merchant-upsell', merchantUpsell); // No JWT — uses X-Cron-Secret, weekly: 0 11 * * 0 (Sun 11am UTC)
  app.post('/api/cron/churn-detector', churnDetector); // No JWT — uses X-Cron-Secret, daily: 0 14 * * *
  app.post('/api/cron/funnel-diagnosis', funnelDiagnosis); // No JWT — uses X-Cron-Secret, weekly: 0 5 * * 1 (Mon 5am)
  app.post('/api/cron/predictive-alerts', predictiveAlerts); // No JWT — uses X-Cron-Secret, every 6h: 0 */6 * * *
  app.post('/api/cron/anomaly-detector', anomalyDetector); // No JWT — uses X-Cron-Secret, daily: 0 22 * * *
  app.post('/api/cron/auto-brief-generator', autoBriefGenerator); // No JWT — uses X-Cron-Secret, daily: 0 7 * * *
  app.post('/api/cron/cross-client-learning', crossClientLearning); // No JWT — uses X-Cron-Secret, monthly: 0 3 1 * *
  app.post('/api/cron/revenue-attribution', revenueAttribution); // No JWT — uses X-Cron-Secret, weekly: 0 4 * * 0 (Sun 4am)
  app.post('/api/cron/knowledge-quality-score', knowledgeQualityScore); // No JWT — uses X-Cron-Secret, weekly: 0 5 * * 0 (Sun 5am)
  app.post('/api/cron/steve-agent-loop', steveAgentLoop); // No JWT — uses X-Cron-Secret, every 2h: 0 */2 * * *
  app.post('/api/cron/steve-discoverer', steveDiscoverer); // No JWT — uses X-Cron-Secret, weekly: 0 2 * * 0 (Sun 2am)
  app.post('/api/cron/steve-prompt-evolver', stevePromptEvolver); // No JWT — uses X-Cron-Secret, weekly: 0 3 * * 0 (Sun 3am)

  // Steve Depredador — Autonomous Agent Crons
  app.post('/api/cron/wolf-night-mode', wolfNightMode); // No JWT — X-Cron-Secret, daily 3am Chile: 0 6 * * *
  app.post('/api/cron/wolf-morning-send', wolfMorningSend); // No JWT — X-Cron-Secret, daily 9am Chile: 0 12 * * *
  app.post('/api/cron/sales-learning-loop', salesLearningLoop); // No JWT — X-Cron-Secret, daily 8pm Chile: 0 23 * * *
  app.post('/api/cron/wa-action-processor', waActionProcessor); // No JWT — X-Cron-Secret, every 1min via Cloud Scheduler: * * * * *

  // Steve Brain Swarm — parallel research + auto-learning
  app.post('/api/cron/swarm-research', swarmResearch); // No JWT — X-Cron-Secret, every 2h: 0 */2 * * *
  app.post('/api/cron/auto-learning-digest', autoLearningDigest); // No JWT — X-Cron-Secret, daily 9am Chile: 0 12 * * *
  app.post('/api/cron/knowledge-propagation-catchup', knowledgePropagationCatchup); // No JWT — X-Cron-Secret, manual or piggyback on Sun 5am
  app.post('/api/cron/validate-contexts', validateContexts); // No JWT — X-Cron-Secret, every 12h: 0 6,18 * * *

  // Public approval API (token-based, no JWT)
  app.get('/api/approve-rules-public', approveRulesPublic);
  app.post('/api/approve-rules-public', approveRulesPublic);

  // ============================================================
  // Booking — Public meeting scheduler (no JWT, accessed by prospects)
  // ============================================================
  app.get('/api/booking/slots/:sellerId', bookingSlots);
  app.post('/api/booking/confirm', bookingConfirm);
  app.post('/api/google-calendar-oauth-callback', authMiddleware, googleCalendarOauthCallback);

  // ============================================================
  // CRM — Pipeline, Ficha, Timeline, Tasks, Proposals
  // ============================================================
  app.post('/api/crm/prospect/detail', authMiddleware, prospectDetail);
  app.post('/api/crm/prospect/note', authMiddleware, prospectAddNote);
  app.post('/api/crm/prospect/stage', authMiddleware, prospectChangeStage);
  app.post('/api/crm/prospect/priority', authMiddleware, prospectChangePriority);
  app.post('/api/crm/prospect/tags', authMiddleware, prospectUpdateTags);
  app.post('/api/crm/prospect/move-stage', authMiddleware, prospectMoveStage);
  app.post('/api/crm/prospect/deal', authMiddleware, prospectUpdateDeal);
  app.post('/api/crm/prospects/kanban', authMiddleware, prospectsKanban);
  app.post('/api/crm/web-forms', authMiddleware, webFormsCrud);
  app.post('/api/web-forms/submit', webFormSubmit); // PUBLIC — no auth, form submissions
  app.post('/api/web-forms/config', webFormConfig); // PUBLIC — no auth, load form config
  app.post('/api/crm/tasks', authMiddleware, salesTasksCrud);
  app.post('/api/crm/tasks/auto-generate', authMiddleware, salesTasksAutoGenerate);
  app.post('/api/crm/proposals', authMiddleware, proposalsCrud);
  app.post('/api/crm/proposals/generate', authMiddleware, proposalsGenerate);
  app.post('/api/crm/sellers', authMiddleware, sellersList);

  // ============================================================
  // El Chino — Automated Check System (sub-router to avoid Hono RegExpRouter limit)
  // ============================================================
  const chino = new Hono();
  chino.post('/run', chinoRun);
  chino.get('/report', chinoReport);
  chino.get('/latest', chinoLatest);
  chino.get('/failures', chinoFailures);
  chino.get('/fixes/next', chinoFixNext);
  chino.post('/fixes/:id/done', chinoFixDone);
  chino.post('/fixes/:id/failed', chinoFixFailed);
  chino.post('/fixer', chinoFixer);
  chino.post('/report/send', chinoReportSend);
  chino.post('/instruction', chinoInstruction);
  app.route('/api/chino', chino);
}
