import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';

// Phase 1: Utilities
import { generateMetaCopy } from './ai/generate-meta-copy.js';
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
  // Phase 2: AI & Analytics (migrated early)
  // ============================================================
  app.post('/api/generate-meta-copy', authMiddleware, generateMetaCopy);
  // app.post('/api/steve-chat', authMiddleware, steveChat);
  // app.post('/api/analyze-brand-research', authMiddleware, analyzeBrandResearch);
  // app.post('/api/analyze-brand-strategy', authMiddleware, analyzeBrandStrategy);
  // ... etc.

  // ============================================================
  // Phase 3: Platform Integrations
  // ============================================================
  // Shopify, Meta, Google, Klaviyo routes

  // ============================================================
  // Phase 4: Auth & OAuth
  // ============================================================
  // app.post('/api/self-signup', selfSignup);
  // app.get('/api/shopify-install', shopifyInstall);
  // ... etc.
}
