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

## Steve Tools (consumidas por Michael W25)
Patrón en `_shared.md`. Doc del contrato en `docs/STEVE-PROPOSALS-CONTRACT.md`.

### 🟦 Acción Directa
| Tool name | Endpoint subyacente | Inputs | Confirmación |
|-----------|---------------------|--------|--------------|
| `pausar_campana_meta` | POST /api/meta-adset-action | `{ campaign_id, action: 'pause' }` | No |
| `activar_campana_meta` | POST /api/meta-adset-action | `{ campaign_id, action: 'resume' }` | No |
| `ajustar_presupuesto_meta` | PATCH /api/manage-meta-campaign | `{ campaign_id, daily_budget_clp }` | Si delta >20% |
| `ver_breakdowns_meta` | GET /api/get-meta-breakdowns | `{ campaign_id, breakdown, from, to }` | No |
| `sincronizar_metricas_meta` | POST /api/sync-meta-metrics | `{ client_id }` | No |
| `detectar_overlap_publicos` | POST /api/detect-audience-overlap | `{ audience_ids[] }` | No |

### 🟪 Propuesta + Wizard precargable
| proposal_type | Wizard | Endpoint status | Schema |
|---------------|--------|-----------------|--------|
| `meta_campaign` | `CampaignCreateWizard.tsx` (acepta `?proposal=<id>`) | POST /api/proposals/:id/status | [contract](../../docs/STEVE-PROPOSALS-CONTRACT.md#meta_campaign) |
| `meta_audience` | `MetaAudienceManager.tsx` (acepta `?proposal=<id>`) | POST /api/proposals/:id/status | [contract](../../docs/STEVE-PROPOSALS-CONTRACT.md#meta_audience) |

**Pendientes para Felipe:**
- [ ] Agregar parser de `?proposal=<id>` en `CampaignCreateWizard.tsx` y precargar campos
- [ ] Endpoint `POST /api/proposals/:id/status` (compartido para todos los dueños — coordinar con Diego W8)
- [ ] Validación previa: si `meta_campaign` propuesto y `platform_connections.meta` no activa → mostrar prompt de conexión
