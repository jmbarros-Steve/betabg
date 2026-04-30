# Ignacio W17 — Métricas & Analytics
Squad: Producto | Última sesión: 2026-04-29

## Estado actual: Competitor Intelligence v2 — backend completo, pendiente UI + deploy

### Completado sesión 29/04/2026 — Deep Dive Competitor v2 (rediseño completo)

**Arquitectura nueva paralela al `deep-dive-competitor.ts` legacy.** Construido scaffolding completo de un módulo de inteligencia competitiva más profundo: 4 fuentes de datos (Apify ads, DataForSEO SEO, Firecrawl content, Opus 4.7 scoring), 11 tablas nuevas, 4 endpoints REST.

#### Migración SQL aplicada ✅
`supabase/migrations/20260429180000_competitor_intelligence.sql` (1376L) — 11 tablas:
1. `competitor_intelligence` — master record por client × competitor_url
2. `competitor_paid_ads` — ads pagados detectados (Meta/Google/TikTok)
3. `competitor_seo_keywords` — keywords ranqueadas con position/traffic
4. `competitor_seo_backlinks` — backlinks top con domain rank
5. `competitor_seo_pages` — top páginas por tráfico
6. `competitor_social_metrics` — métricas social por plataforma
7. `competitor_catalog` — productos detectados
8. `competitor_reviews` — reviews agregados por fuente
9. `competitor_email_marketing` — estado captura email spy
10. `competitor_scorecards` — output Opus, snapshot por análisis
11. `competitor_action_plans` — output Opus, plan 30/60/90

RLS: tenant isolation por user_id/client_user_id + super_admin bypass. FKs ON DELETE CASCADE. Trigger `set_competitor_intel_updated_at()` aplicado a las 11 tablas.

#### Backend nuevo ✅
**Library** `cloud-run-api/src/lib/competitor/`:
- `apify-client.ts` (271L) — wrapper sync/async/dataset, ACTORS para Meta/Google/TikTok ad libraries
- `dataforseo-client.ts` (306L) — overview, ranked_keywords, backlinks, pages
- `firecrawl-client.ts` (328L) — web scraping
- `prompts.ts` (468L) — prompts Opus scorecard + action plan 30/60/90
- `tech-stack-detector.ts` (281L) — detección platform/tracking compartida
- `types.ts` (575L) — single source of truth (PaidAd, SeoIntelligence, ScorecardRow, etc.)

**Rutas** `cloud-run-api/src/routes/competitor/`:
- `scrape-paid-ads.ts` (740L) — fanout Meta/Google/TikTok via Apify, Promise.allSettled, page_id resolution cascade (web→Firecrawl→FB link→Apify)
- `scrape-seo.ts` (385L) — DataForSEO + content gap vs cliente
- `web-crawl.ts` (984L) — quota-based URL selection por page type
- `generate-scorecard.ts` (1104L) — Opus 4.7 scorecard cliente vs N competidores (1-5) + plan 30/60/90, persiste en `competitor_scorecards` + `competitor_action_plans`

**Modificados:**
- `routes/analytics/deep-dive-competitor.ts` — refactor: detectPlatform/Tracking → lib compartida + SSRF
- `routes/analytics/sync-competitor-ads.ts` — `findFacebookFromWebsite()` (dominio→FB Page por regex)
- `lib/prompt-utils.ts` — `sanitizeWebContentForPrompt()` (quita scripts/styles)
- `routes/ai/generate-meta-copy.ts` — fix Anthropic vacío (reportado JM 27/04)
- `lib/url-validator.ts` (nuevo, 77L) — SSRF protection
- `routes/index.ts` — registra 4 rutas: `/api/competitor/{scrape-paid-ads,generate-scorecard,web-crawl,scrape-seo}`

#### TypeScript ✅
`npx tsc --noEmit` — 0 errores. Fixes aplicados en sesión:
- scrape-seo.ts: cast `: any` en responses DataForSEO (untyped JSON nesting)
- scrape-seo.ts: typing explícito en `.sort()` callback

### Pendiente

- [ ] Cross-review por Isidora W6 (lógica) + Javiera W12 (SQL/seguridad) — en progreso
- [ ] Frontend: construir `CompetitorIntelligenceView.tsx` (no existe aún)
- [ ] Deploy Cloud Run después de cross-review aprobada
- [ ] Variables de entorno Cloud Run: `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `FIRECRAWL_API_KEY` (verificar)
- [ ] Commit + push (según workflow JM: pedir permiso antes)

### Archivos tocados 29/04
1. `cloud-run-api/src/routes/competitor/scrape-seo.ts` (TS fixes)
2. `cloud-run-api/src/routes/index.ts` (register web-crawl + scrape-seo)
