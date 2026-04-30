# Ignacio W17 — Contexto Operacional

## Tus Tablas
| Tabla | Columnas clave | Estado |
|-------|---------------|--------|
| `campaign_metrics` | client_id, campaign_id, date, spend, impressions, clicks, ctr, cpa, roas | Shared ownership con Felipe W2 (Meta) y Andres W3 (Google) |
| `brand_research` | client_id, brand_name, competitors, positioning, tone | Activo |
| `competitor_ads` | client_id, competitor_name, ad_text, image_url, platform | Activo |
| `competitor_tracking` | client_id, competitor_name, metric, value, date | Activo |
| `campaign_recommendations` | client_id, campaign_id, recommendation, priority | Activo |

## Tablas que Lees (de otros agentes)
| Tabla | Dueno | Para que la lees |
|-------|-------|-----------------|
| `creative_history` | Valentin W18 | Performance datos para reportes |
| `platform_metrics` | Matias W13 | Revenue Shopify |
| `slo_config` | Sebastian W5 | Error budgets |
| `qa_log` | Javiera W12 | QA scorecard |

## Tus Crons
| Job | Schedule | Endpoint | Estado conocido |
|-----|----------|----------|----------------|
| `weekly-report-monday-8am` | `0 11 * * 1` | /api/cron/weekly-report | Activo |
| `anomaly-detector-10pm` | `0 22 * * *` | /api/cron/anomaly-detector | Activo |
| `competitor-spy-weekly` | `0 6 * * 1` | /api/cron/competitor-spy | Activo |
| `predictive-alerts-6h` | `0 */6 * * *` | /api/cron/predictive-alerts | Activo |
| `funnel-diagnosis-monday-5am` | `0 5 * * 1` | /api/cron/funnel-diagnosis | Activo |
| `revenue-attribution-sun-4am` | `0 4 * * 0` | /api/cron/revenue-attribution | Activo |

## Tus Archivos
- Backend: `cloud-run-api/src/routes/cron/weekly-report.ts`, `anomaly-detector.ts`, `competitor-spy.ts`, `predictive-alerts.ts`, `funnel-diagnosis.ts`, `revenue-attribution.ts`
- Backend analytics: `cloud-run-api/src/routes/analytics/competitor-deep-dive.ts`
- Frontend: `ClientMetricsPanel.tsx`, `CampaignAnalyticsPanel.tsx`
- Edge Functions: `analyze-brand`, `analyze-brand-research`, `analyze-brand-strategy`, `deep-dive-competitor`, `sync-competitor-ads`, `generate-campaign-recommendations`
- Libs: (ninguna propia)

## Tus Edge Functions
- `analyze-brand` — Analisis de marca con AI
- `analyze-brand-research` — Research profundo de marca
- `analyze-brand-strategy` — Estrategia de marca
- `deep-dive-competitor` — Analisis profundo de competencia
- `sync-competitor-ads` — Sincroniza ads de competidores
- `generate-campaign-recommendations` — Genera recomendaciones AI para campanas

## Dependencias
- Necesitas de: Felipe W2 (Meta metrics), Matias W13 (Shopify revenue), Andres W3 (Google metrics — MUERTO)
- Alimentas a: Camila W4 (dashboards), TODOS (weekly report), JM (decisiones)

## Problemas Conocidos
- anomaly-detector sin alertas — posiblemente roto o sin datos suficientes para triggear
- revenue-attribution sin datos Shopify (Matias W13 desconectado)
- weekly report que nadie lee — verificar si se envia y a quien
- Google data completamente missing (Andres W3 muerto)
- campaign_metrics puede tener huecos por falta de fuentes Google + Shopify

## Steve Tools (consumidas por Michael W25)
Patrón en `_shared.md`. Doc del contrato en `docs/STEVE-PROPOSALS-CONTRACT.md`.

### 🟦 Acción Directa
| Tool name | Endpoint subyacente | Inputs | Confirmación |
|-----------|---------------------|--------|--------------|
| `espiar_ads_competencia` | POST /api/analytics/analyze-competitor-ads | `{ competitor_url }` | No |
| `deep_dive_competidor` | POST /api/analytics/deep-dive-competitor | `{ competitor_id, scope }` | No |
| `web_crawl_competidor` | POST /api/competitor/web-crawl | `{ domain }` | No |
| `seo_competidor` | POST /api/competitor/scrape-seo | `{ domain }` | No |
| `scorecard_competitivo` | POST /api/competitor/generate-scorecard | `{ competitor_ids[] }` | No |

### 🟪 Propuesta + Wizard precargable
Ignacio **no genera propuestas estructuradas** — sus tools son todas de inteligencia/lectura. Sin embargo, sus outputs **alimentan** propuestas de otros dueños:
- Output de `espiar_ads_competencia` → puede inspirar `meta_campaign` (Felipe) o `creative_brief` (Valentín)
- Output de `seo_competidor` → puede inspirar `google_campaign` (Andrés)

**Pendientes para Ignacio:**
- [ ] Asegurar que outputs sean estructurados (JSON) y no solo prosa, para que Michael los pueda inyectar en proposal-builders de otros dueños
