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
import { serveHtml } from './utilities/serve-html.js';

// Phase 2: AI
import { steveChat } from './ai/steve-chat.js';
import { strategyChat } from './ai/strategy-chat.js';
import { strategyReport } from './ai/strategy-report.js';
import { steveStrategy } from './ai/steve-strategy.js';
import { steveEmailContent } from './ai/steve-email-content.js';
import { steveSendTimeAnalysis } from './ai/steve-send-time-analysis.js';
import { steveBulkAnalyze } from './ai/steve-bulk-analyze.js';
import { generateMetaCopy } from './ai/generate-meta-copy.js';
import { steveConfigureCampaign } from './ai/steve-configure-campaign.js';
import { steveSuggestInterests } from './ai/steve-suggest-interests.js';
import { generateImage } from './ai/generate-image.js';
import { generateVideo, generateVideoStatus } from './ai/generate-video.js';
import { generateVideoScript } from './ai/generate-video-script.js';
import { generateMassCampaigns } from './ai/generate-mass-campaigns.js';
import { analyzeBrand } from './ai/analyze-brand.js';
import { analyzeBrandResearch } from './ai/analyze-brand-research.js';
import { analyzeBrandStrategy } from './ai/analyze-brand-strategy.js';
import { editImageGemini } from './ai/edit-image-gemini.js';
import { criterioMetaHandler } from './ai/criterio-meta.js';
import { criterioEmail } from './ai/criterio-email.js';

import { suggestInboxReply } from './ai/suggest-inbox-reply.js';
import { creativePreview } from './ai/creative-preview.js';
import { espejoHandler } from './ai/espejo.js';

// Phase 2: Analytics
import { syncCompetitorAds } from './analytics/sync-competitor-ads.js';
import { analyzeCompetitorAds } from './analytics/analyze-competitor-ads.js';
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
import { syncShopifyAbandonedCheckouts, syncAllAbandonedCheckouts } from './shopify/sync-shopify-abandoned-checkouts.js';
import { snapshotShopifyPricing } from './cron/snapshot-shopify-pricing.js';
import { fetchShopifyDiscounts } from './shopify/fetch-shopify-discounts.js';
import { fetchShopifyCustomers } from './shopify/fetch-shopify-customers.js';
import { updateShopifyProduct } from './shopify/update-shopify-product.js';
import { generateProductDescription } from './shopify/generate-product-description.js';
import { computeCrossSell } from './shopify/compute-cross-sell.js';
import { collectionRevenue } from './shopify/collection-revenue.js';
import { createShopifyCombo } from './shopify/create-shopify-combo.js';
import { generateShopifyReport, listShopifyReports } from './shopify/generate-shopify-report.js';

// Phase 3: Google
import { syncGoogleAdsMetrics } from './google/sync-google-ads-metrics.js';
import { checkGoogleAdsHealth } from './google/check-google-ads-health.js';
import { manageGoogleCampaign } from './google/manage-google-campaign.js';
import { manageGoogleRules } from './google/manage-google-rules.js';
import { manageGoogleKeywords } from './google/manage-google-keywords.js';
import { manageGoogleAdsContent } from './google/manage-google-ads-content.js';
import { manageGoogleExtensions } from './google/manage-google-extensions.js';
import { manageGoogleConversions } from './google/manage-google-conversions.js';
import { manageGooglePmax } from './google/manage-google-pmax.js';
import { manageGoogleShopping } from './google/manage-google-shopping.js';

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
import { createKlaviyoCampaign } from './klaviyo/create-campaign.js';
import { klaviyoFlowMetrics } from './klaviyo/flow-metrics.js';

// Phase 3: Instagram
import { publishInstagram, cronPublishInstagram } from './instagram/publish-instagram.js';

// Phase 3: Facebook
import { publishFacebook, cronPublishFacebook } from './facebook/publish-facebook.js';
import { fetchFacebookInsights } from './facebook/fetch-facebook-insights.js';

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
import { manageReportSchedule } from './meta/manage-report-schedule.js';
import { manageMetaRules } from './meta/manage-meta-rules.js';
import { metaTargetingSearch } from './meta/meta-targeting-search.js';
import { detectAudienceOverlap } from './meta/detect-audience-overlap.js';
import { syncKlaviyoToMetaAudience } from './meta/sync-klaviyo-to-meta-audience.js';
import { metaCatalogs } from './meta/meta-catalogs.js';
import { metaPreviewEnhancements } from './meta/meta-preview-enhancements.js';
import { metaAdsetAction } from './meta/meta-adset-action.js';
import { discoverClientAssets } from './meta/discover-client-assets.js';

// Webhooks
import { leadsieWebhook } from './webhooks/leadsie-webhook.js';
import { leadsieGoogleWebhook } from './webhooks/leadsie-google-webhook.js';

// Instagram
import { fetchInstagramInsights } from './instagram/fetch-instagram-insights.js';

// WhatsApp
import { setupMerchantHandler } from './whatsapp/setup-merchant.js';
import { waStatusCallback } from './whatsapp/status-callback.js';

// Cron
import { syncAllMetrics } from './cron/sync-all-metrics.js';
import { syncShopifyProducts } from './cron/sync-shopify-products.js';
import { syncShopifyOrders } from './cron/sync-shopify-orders.js';
import { errorBudgetCalculator } from './cron/error-budget-calculator.js';
import { reconciliation } from './cron/reconciliation.js';
import { ruleCalibrator } from './cron/rule-calibrator.js';
import { autoRuleGenerator } from './cron/auto-rule-generator.js';
import { autoRuleScanner } from './cron/auto-rule-scanner.js';
import { weeklyReport } from './cron/weekly-report.js';
import { rootCauseAnalysis } from './cron/root-cause-analysis.js';
import { autoPostmortem } from './cron/auto-postmortem.js';
import { restartService } from './cron/restart-service.js';
import { fatigueDetector } from './cron/fatigue-detector.js';
import { performanceEvaluator } from './cron/performance-evaluator.js';
import { performanceTrackerMeta } from './cron/performance-tracker-meta.js';
import { executeMetaRulesCron } from './cron/execute-meta-rules.js';
import { executeGoogleRulesCron } from './cron/execute-google-rules.js';
import { searchTermsReview } from './cron/search-terms-review.js';
import { qualityScoreMonitor } from './cron/quality-score-monitor.js';
import { taskPrioritizer } from './cron/task-prioritizer.js';
import { taskCompleted } from './cron/task-completed.js';
import { detectiveVisual } from './cron/detective-visual.js';
import { prospectFollowup } from './cron/prospect-followup.js';
import { prospectRottingDetector } from './cron/prospect-rotting-detector.js';
import { meetingReminder } from './cron/meeting-reminder.js';
import { prospectEmailNurture } from './cron/prospect-email-nurture.js';
import { emailQueueTick } from './cron/email-queue-tick.js';
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
import { waBatchRespond } from './cron/wa-batch-respond.js';
import { swarmResearch } from './cron/swarm-research.js';
import { autoLearningDigest } from './cron/auto-learning-digest.js';
import { knowledgePropagationCatchup } from './cron/knowledge-propagation-catchup.js';
import { validateContexts } from './cron/validate-contexts.js';
import { refreshPlatformTokens } from './cron/refresh-platform-tokens.js';
import { chinoExecutor } from './cron/chino-executor.js';
import { chinoCodeExecutor } from './cron/chino-code-executor.js';

// Steve Social
import { socialFeed } from './social/feed.js';
import { socialSubscribe } from './social/subscribe.js';
import { socialReact } from './social/react.js';
import { socialShare } from './social/share.js';
import { socialLeaderboard } from './social/leaderboard.js';
import { socialTrending } from './social/trending.js';
import { agentRegister } from './social/agent-register.js';
import { agentPost } from './social/agent-post.js';
import { socialPostGenerator } from './cron/social-post-generator.js';
import { socialReplyGenerator } from './cron/social-reply-generator.js';
import { socialDigestSender } from './cron/social-digest-sender.js';
import { socialWeeklyRotation } from './cron/social-weekly-rotation.js';
import { extAgentLearning } from './cron/ext-agent-learning.js';

// WhatsApp
import { steveWAChat } from './whatsapp/steve-wa-chat.js';
import { merchantWAWebhook } from './whatsapp/merchant-wa.js';
import { waSendMessage } from './whatsapp/send-message.js';
import { waSendCampaign } from './whatsapp/send-campaign.js';
import { waCampaignsCrud } from './whatsapp/wa-campaigns-crud.js';
import { waMarkRead } from './whatsapp/wa-mark-read.js';
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
import { prospectDetail, prospectAddNote, prospectChangeStage, prospectChangePriority, prospectUpdateTags, prospectsKanban, prospectMoveStage, prospectUpdateDeal, prospectDelete } from './crm/prospect-crm.js';
import { salesTasksCrud, salesTasksAutoGenerate } from './crm/sales-tasks.js';
import { proposalsCrud, proposalsGenerate } from './crm/proposals.js';
import { sellersList } from './crm/sellers.js';
import { webFormsCrud, webFormSubmit, webFormConfig } from './crm/web-forms.js';

// Booking
import { bookingSlots, bookingConfirm } from './booking/booking-api.js';
import { googleCalendarOauthCallback } from './oauth/google-calendar-oauth-callback.js';

// Brief Estudio
import {
  getBriefEstudio,
  saveBriefEstudio,
  prefillBriefEstudioFromBrief,
  generateActors,
  suggestVoice,
  cloneVoice,
  getBriefEstudioProducts,
  syncBriefEstudioProducts,
  getBriefEstudioMusicLibrary,
  generateMusicPreviews,
} from './brief-estudio/index.js';
// Brief Estudio — Fase 2 (narración + audio merge)
import {
  generateNarrationScript,
  generateNarrationAudio,
} from './brief-estudio/narration.js';

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
import { shopifyConfig } from './shopify/shopify-config.js';
import { storeShopifyToken } from './shopify/store-shopify-token.js';
import { shopifyHmacMiddleware } from '../middleware/shopify-hmac.js';

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
import { queueHealthHandler } from './email/queue-health.js';
import { emailListCleanup } from './email/list-cleanup.js';
import { uploadEmailImage } from './email/upload-email-image.js';
import { manageEmailLists } from './email/manage-email-lists.js';
import { sendTestEmail } from './email/send-test.js';
import { domainHealth } from './email/domain-health.js';

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
  app.post('/api/strategy-chat', authMiddleware, strategyChat);
  app.get('/api/h', serveHtml); // Public HTML proxy for Storage files
  app.post('/api/strategy-report', authMiddleware, strategyReport);
  app.post('/api/steve-strategy', authMiddleware, steveStrategy);
  app.post('/api/steve-email-content', authMiddleware, steveEmailContent);
  app.post('/api/steve-send-time-analysis', authMiddleware, steveSendTimeAnalysis);
  app.post('/api/steve-bulk-analyze', authMiddleware, steveBulkAnalyze);
  app.post('/api/generate-meta-copy', authMiddleware, generateMetaCopy);
  app.post('/api/steve-configure-campaign', authMiddleware, steveConfigureCampaign);
  app.post('/api/steve-suggest-interests', authMiddleware, steveSuggestInterests);
  app.post('/api/generate-image', authMiddleware, generateImage);
  app.post('/api/generate-video', authMiddleware, generateVideo);
  app.get('/api/generate-video-status', authMiddleware, generateVideoStatus);
  app.post('/api/generate-video-script', authMiddleware, generateVideoScript);
  app.post('/api/generate-mass-campaigns', authMiddleware, generateMassCampaigns);
  app.post('/api/analyze-brand', authMiddleware, analyzeBrand);
  app.post('/api/analyze-brand-research', authMiddleware, analyzeBrandResearch);
  app.post('/api/analyze-brand-strategy', authMiddleware, analyzeBrandStrategy);
  app.post('/api/edit-image-gemini', authMiddleware, editImageGemini);
  app.post('/api/criterio-meta', authMiddleware, criterioMetaHandler);
  app.post('/api/criterio-email', authMiddleware, criterioEmail);

  app.post('/api/creative-preview', authMiddleware, creativePreview);
  app.post('/api/ai/suggest-inbox-reply', authMiddleware, suggestInboxReply);
  app.post('/api/espejo', authMiddleware, espejoHandler);
  app.post('/api/sync-competitor-ads', authMiddleware, syncCompetitorAds);
  app.post('/api/analyze-competitor-ads', authMiddleware, analyzeCompetitorAds);
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
  app.post('/api/klaviyo/create-campaign', authMiddleware, createKlaviyoCampaign);
  app.get('/api/klaviyo/flow-metrics', authMiddleware, klaviyoFlowMetrics);

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
  app.post('/api/meta-preview-enhancements', authMiddleware, metaPreviewEnhancements);
  app.post('/api/meta-adset-action', authMiddleware, metaAdsetAction);
  app.post('/api/discover-client-assets', authMiddleware, discoverClientAssets);
  app.post('/api/manage-report-schedule', authMiddleware, manageReportSchedule);

  // Leadsie webhooks (public — validated via shared secret)
  app.post('/api/webhooks/leadsie', leadsieWebhook);
  app.post('/api/webhooks/leadsie-google', leadsieGoogleWebhook);

  // ============================================================
  // Phase 3: Platform Integrations (Instagram)
  // ============================================================
  app.post('/api/publish-instagram', authMiddleware, publishInstagram);
  app.post('/api/cron/publish-instagram', cronPublishInstagram); // No JWT — uses X-Cron-Secret
  app.post('/api/fetch-instagram-insights', authMiddleware, fetchInstagramInsights);

  // ============================================================
  // Phase 3: Platform Integrations (Facebook)
  // ============================================================
  app.post('/api/publish-facebook', authMiddleware, publishFacebook);
  app.post('/api/cron/publish-facebook', cronPublishFacebook); // No JWT — uses X-Cron-Secret
  app.post('/api/fetch-facebook-insights', authMiddleware, fetchFacebookInsights);

  // ============================================================
  // Phase 3: Platform Integrations (Shopify)
  // ============================================================
  app.post('/api/fetch-shopify-analytics', authMiddleware, fetchShopifyAnalytics);
  app.post('/api/fetch-shopify-products', authMiddleware, fetchShopifyProducts);
  app.post('/api/fetch-shopify-collections', authMiddleware, fetchShopifyCollections);
  app.post('/api/create-shopify-discount', authMiddleware, createShopifyDiscount);
  app.post('/api/shopify-session-validate', shopifySessionValidate); // Uses Shopify session token, no JWT
  app.post('/api/sync-shopify-metrics', authMiddleware, syncShopifyMetrics);
  app.post('/api/sync-shopify-abandoned-checkouts', authMiddleware, syncShopifyAbandonedCheckouts);
  app.post('/api/fetch-shopify-discounts', authMiddleware, fetchShopifyDiscounts);
  app.post('/api/store-shopify-credentials', authMiddleware, storeShopifyCredentials);
  app.get('/api/shopify/config', shopifyConfig); // Public - returns current SHOPIFY_MODE
  app.post('/api/store-shopify-token', authMiddleware, storeShopifyToken);
  app.post('/api/fetch-shopify-customers', authMiddleware, fetchShopifyCustomers);
  app.post('/api/update-shopify-product', authMiddleware, updateShopifyProduct);
  app.post('/api/generate-product-description', authMiddleware, generateProductDescription);
  app.post('/api/generate-shopify-report', authMiddleware, generateShopifyReport);
  app.post('/api/shopify-reports', authMiddleware, listShopifyReports);
  app.post('/api/compute-cross-sell', authMiddleware, computeCrossSell);
  app.post('/api/collection-revenue', authMiddleware, collectionRevenue);
  app.post('/api/create-shopify-combo', authMiddleware, createShopifyCombo);

  // ============================================================
  // Phase 3: Platform Integrations (Google + Other)
  // ============================================================
  app.post('/api/sync-google-ads-metrics', authMiddleware, syncGoogleAdsMetrics);
  app.post('/api/check-google-ads-health', authMiddleware, checkGoogleAdsHealth);
  app.post('/api/manage-google-campaign', authMiddleware, manageGoogleCampaign);
  app.post('/api/manage-google-rules', authMiddleware, manageGoogleRules);
  app.post('/api/manage-google-keywords', authMiddleware, manageGoogleKeywords);
  app.post('/api/manage-google-ads-content', authMiddleware, manageGoogleAdsContent);
  app.post('/api/manage-google-extensions', authMiddleware, manageGoogleExtensions);
  app.post('/api/manage-google-conversions', authMiddleware, manageGoogleConversions);
  app.post('/api/manage-google-pmax', authMiddleware, manageGooglePmax);
  app.post('/api/manage-google-shopping', authMiddleware, manageGoogleShopping);
  app.post('/api/store-platform-connection', authMiddleware, storePlatformConnection);

  // ============================================================
  // Public endpoints (no JWT)
  // ============================================================
  app.post('/api/audit-store', auditStore); // No JWT — landing page store audit

  // Steve Social (public — no JWT)
  app.get('/api/social/feed', socialFeed);
  app.get('/api/social/leaderboard', socialLeaderboard);
  app.get('/api/social/trending', socialTrending);
  app.post('/api/social/subscribe', socialSubscribe);
  app.post('/api/social/react', socialReact);
  app.post('/api/social/share', socialShare);
  app.post('/api/agents/register', agentRegister);
  app.post('/api/agents/post', agentPost);

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
  app.post('/api/shopify-fulfillment-webhooks', shopifyHmacMiddleware, shopifyFulfillmentWebhooks); // No JWT - HMAC verified by middleware
  app.post('/api/shopify-gdpr-webhooks', shopifyHmacMiddleware, shopifyGdprWebhooks); // No JWT - HMAC verified by middleware

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
  app.post('/api/email/send-test', authMiddleware, sendTestEmail);
  app.get('/api/email/domain-health', authMiddleware, domainHealth);
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
  app.get('/api/email-queue-health', authMiddleware, queueHealthHandler); // P2-7: dashboard de salud
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
  app.post('/api/whatsapp/campaigns', authMiddleware, waCampaignsCrud); // Portal: CRUD WA campaign drafts
  app.post('/api/whatsapp/send-campaign', authMiddleware, waSendCampaign); // Portal: send bulk WA campaign
  app.post('/api/whatsapp/mark-read', authMiddleware, waMarkRead); // Bug #98: mark conversation read via backend (bypasses RLS)
  app.post('/api/whatsapp/shopify-checkout-webhook', shopifyHmacMiddleware, shopifyCheckoutWebhook); // No JWT — Shopify HMAC verified by middleware
  app.post('/api/task-completed', taskCompleted); // No JWT — uses X-Cron-Secret, called by Leonardo when task is done

  // ============================================================
  // Cron / Scheduled Jobs — sub-router to avoid Hono RegExpRouter limit
  // ============================================================
  const cron = new Hono();
  cron.post('/abandoned-cart-wa', abandonedCartWA);
  cron.post('/sync-all-metrics', syncAllMetrics);
  cron.post('/sync-shopify-products', syncShopifyProducts);
  cron.post('/sync-shopify-orders', syncShopifyOrders);
  cron.post('/sync-all-abandoned-checkouts', syncAllAbandonedCheckouts);
  cron.post('/snapshot-shopify-pricing', snapshotShopifyPricing);
  cron.post('/changelog-watcher', apiChangelogWatcher);
  cron.post('/error-budget-calculator', errorBudgetCalculator);
  cron.post('/reconciliation', reconciliation);
  cron.post('/competitor-spy', competitorSpy);
  cron.post('/rule-calibrator', ruleCalibrator);
  cron.post('/auto-rule-generator', autoRuleGenerator);
  cron.post('/auto-rule-scanner', autoRuleScanner);
  cron.post('/weekly-report', weeklyReport);
  cron.post('/root-cause-analysis', rootCauseAnalysis);
  cron.post('/auto-postmortem', autoPostmortem);
  cron.post('/restart-service', restartService);
  cron.post('/fatigue-detector', fatigueDetector);
  cron.post('/performance-evaluator', performanceEvaluator);
  cron.post('/performance-tracker-meta', performanceTrackerMeta);
  cron.post('/execute-meta-rules', executeMetaRulesCron);
  cron.post('/execute-google-rules', executeGoogleRulesCron);
  cron.post('/search-terms-review', searchTermsReview);
  cron.post('/quality-score-monitor', qualityScoreMonitor);
  cron.post('/task-prioritizer', taskPrioritizer);
  cron.post('/detective-visual', detectiveVisual);
  cron.post('/prospect-followup', prospectFollowup);
  cron.post('/prospect-rotting-detector', prospectRottingDetector);
  cron.post('/meeting-reminder', meetingReminder);
  cron.post('/prospect-email-nurture', prospectEmailNurture);
  cron.post('/email-queue-tick', emailQueueTick);
  cron.post('/knowledge-decay', knowledgeDecay);
  cron.post('/knowledge-consolidator', knowledgeConsolidator);
  cron.post('/knowledge-dedup', knowledgeDedup);
  cron.post('/steve-content-hunter', steveContentHunter);
  cron.post('/onboarding-wa', onboardingWA);
  cron.post('/merchant-upsell', merchantUpsell);
  cron.post('/churn-detector', churnDetector);
  cron.post('/funnel-diagnosis', funnelDiagnosis);
  cron.post('/predictive-alerts', predictiveAlerts);
  cron.post('/anomaly-detector', anomalyDetector);
  cron.post('/auto-brief-generator', autoBriefGenerator);
  cron.post('/cross-client-learning', crossClientLearning);
  cron.post('/revenue-attribution', revenueAttribution);
  cron.post('/knowledge-quality-score', knowledgeQualityScore);
  cron.post('/steve-agent-loop', steveAgentLoop);
  cron.post('/steve-discoverer', steveDiscoverer);
  cron.post('/steve-prompt-evolver', stevePromptEvolver);
  cron.post('/wolf-night-mode', wolfNightMode);
  cron.post('/wolf-morning-send', wolfMorningSend);
  cron.post('/sales-learning-loop', salesLearningLoop);
  cron.post('/wa-action-processor', waActionProcessor);
  cron.post('/wa-batch-respond', waBatchRespond);
  cron.post('/swarm-research', swarmResearch);
  cron.post('/auto-learning-digest', autoLearningDigest);
  cron.post('/knowledge-propagation-catchup', knowledgePropagationCatchup);
  cron.post('/validate-contexts', validateContexts);
  cron.post('/refresh-platform-tokens', refreshPlatformTokens);
  cron.post('/chino-executor', chinoExecutor);
  cron.post('/chino-code-executor', chinoCodeExecutor);
  cron.post('/social-post-generator', socialPostGenerator);
  cron.post('/social-reply-generator', socialReplyGenerator);
  cron.post('/social-digest-sender', socialDigestSender);
  cron.post('/ext-agent-learning', extAgentLearning);
  cron.post('/social-weekly-rotation', socialWeeklyRotation);
  app.route('/api/cron', cron);

  // ============================================================
  // Steve Sales + Post-Venta
  // ============================================================
  app.post('/api/whatsapp/prospect-trial', prospectTrial); // No JWT — uses X-Internal-Key, triggered by [ACTIVATE_TRIAL] tag

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
  app.post('/api/crm/prospect/delete', authMiddleware, prospectDelete);
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
  // Brief Estudio — Etapa 1 (actores, voces, productos, música)
  // ============================================================
  app.get('/api/brief-estudio/get', authMiddleware, getBriefEstudio);
  app.post('/api/brief-estudio/save', authMiddleware, saveBriefEstudio);
  app.get('/api/brief-estudio/prefill-from-brief', authMiddleware, prefillBriefEstudioFromBrief);

  // Brief Estudio — Etapa 2 (generación IA con Replicate)
  app.post('/api/brief-estudio/generate-actors', authMiddleware, generateActors);
  app.post('/api/brief-estudio/suggest-voice', authMiddleware, suggestVoice);
  app.post('/api/brief-estudio/clone-voice', authMiddleware, cloneVoice);

  // Brief Estudio — Etapa 4 (productos Shopify + música mood-based)
  app.get('/api/brief-estudio/products', authMiddleware, getBriefEstudioProducts);
  app.post('/api/brief-estudio/products/sync', authMiddleware, syncBriefEstudioProducts);
  app.get('/api/brief-estudio/music/library', authMiddleware, getBriefEstudioMusicLibrary);
  app.post('/api/brief-estudio/music/generate-previews', authMiddleware, generateMusicPreviews);

  // Brief Estudio — Fase 2 (narración + audio merge)
  app.post('/api/brief-estudio/narration/script', authMiddleware, generateNarrationScript);
  app.post('/api/brief-estudio/narration/audio', authMiddleware, generateNarrationAudio);

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
