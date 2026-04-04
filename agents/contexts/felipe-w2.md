# Felipe W2 — Contexto Operacional

## Tus Tablas
| Tabla | Columnas clave | Estado |
|-------|---------------|--------|
| `meta_campaigns` | client_id, campaign_id, name, status, budget, objective | OK |
| `campaign_metrics` | client_id, campaign_id, date, spend, impressions, clicks, ctr, cpa, roas | 25 rows |
| `adset_metrics` | adset_id, date, spend, impressions, clicks | OK |
| `ad_creatives` | client_id, headline, body, image_url, status | OK |
| `ad_assets` | client_id, type (image/video), url, created_at | OK |
| `ad_references` | client_id, reference_url, notes | OK |
| `meta_automated_rules` | client_id, rule_type (cpa/roas), threshold, action | OK |
| `meta_rule_execution_log` | rule_id, campaign_id, action_taken, result | OK |

## Tablas que Lees (de otros agentes)
| Tabla | Dueno | Para que la lees |
|-------|-------|-----------------|
| `platform_connections` | Diego W8 | Tokens Meta (OAuth) |
| `creative_history` | Valentin W18 | Performance historica de creativos |
| `brand_research` | Ignacio W17 | Contexto de marca para campanas |
| `shopify_products` | Matias W13 | Productos para Dynamic Product Ads (DPA) |

## Tus Crons
| Job | Schedule | Endpoint | Estado conocido |
|-----|----------|----------|----------------|
| `performance-tracker-meta-8am` | `0 8 * * *` | /api/cron/performance-tracker-meta | Activo |
| `execute-meta-rules-9am` | `0 9 * * *` | /api/cron/execute-meta-rules | Activo |
| `fatigue-detector-11am` | `0 11 * * *` | /api/cron/fatigue-detector | Activo (shared con Valentin) |

## Tus Archivos
- Backend: `cloud-run-api/src/routes/meta/manage-meta-campaign.ts` (56KB), `meta-adset-action.ts`, `manage-meta-rules.ts` (524 lin), `meta-catalogs.ts`, `sync-meta-metrics.ts` (476 lin), `meta-fetch.ts`, `manage-meta-audiences.ts` (559 lin), `sync-klaviyo-to-meta-audience.ts`, `detect-audience-overlap.ts`, `meta-targeting-search.ts`, `publish-instagram.ts`, `fetch-instagram-insights.ts`, `meta-social-inbox.ts` (725 lin)
- Frontend: `CampaignCreateWizard.tsx` (141KB), `MetaCampaignManager.tsx` (86KB), `CampaignStudio`, `MetaAudienceManager`, `InstagramPublisher`, `InstagramHub`
- Edge Functions: `fetch-campaign-adsets`, `sync-campaign-metrics`
- Libs: (ninguna)

## Tus Edge Functions
- `fetch-campaign-adsets` — obtiene adsets de una campana Meta
- `sync-campaign-metrics` — sincroniza metricas de campanas desde Meta API

## Dependencias
- Necesitas de: Diego W8 (tokens), Matias W13 (productos Shopify), Valentin W18 (creativos)
- Alimentas a: Ignacio W17 (metricas), Valentin W18 (performance data), Isidora W6 (evaluacion)

## Problemas Conocidos
- `campaign_metrics` solo tiene 25 rows — datos insuficientes para analisis serio
- Tokens Meta pueden expirar cada 60 dias — no hay alerta de renovacion
- Silent failures en sync: el cron corre pero no reporta errores cuando falla la API
- `CampaignCreateWizard.tsx` es 141KB — archivo monstruoso, candidato a refactor
- `MetaCampaignManager.tsx` es 86KB — mismo problema
