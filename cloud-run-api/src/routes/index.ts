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
  // Phase 3: Platform Integrations
  // ============================================================
  // Shopify, Meta, Google, Klaviyo routes

  // ============================================================
  // Phase 4: Auth & OAuth
  // ============================================================
  // app.post('/api/self-signup', selfSignup);
  // app.get('/api/shopify-install', shopifyInstall);
}
