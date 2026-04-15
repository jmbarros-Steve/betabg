# Andres W3 — Contexto Operacional

## Tus Tablas
| Tabla | Columnas clave | Estado |
|-------|---------------|--------|
| `campaign_metrics` | client_id, campaign_id, date, spend, clicks, ctr, cpa (porcion Google) | **Sync implementado, pendiente credenciales prod** |
| `platform_metrics` | client_id, date, source (google), revenue, orders | **Sync implementado, pendiente credenciales prod** |
| `google_automated_rules` | id, client_id, rule_name, conditions, actions, is_active | **NUEVA — Tier 1, con RLS + indexes** |
| `google_rule_execution_log` | id, rule_id, execution_result, executed_at | **NUEVA — Tier 1, con RLS** |

## Tablas que Lees (de otros agentes)
| Tabla | Dueno | Para que la lees |
|-------|-------|-----------------|
| `platform_connections` | Diego W8 | Tokens Google (pendiente config Leadsie+MCC) |

## Tus Crons
| Job | Schedule | Endpoint | Estado conocido |
|-----|----------|----------|----------------|
| `sync-all-metrics-6h` | cada 6h | /api/cron/sync-all-metrics | Implementado, pendiente credenciales prod |
| `execute-google-rules-1h` | cada 1h | /api/cron/execute-google-rules | **NUEVO — Tier 1, reglas automaticas** |

## Tus Archivos
- Shared Lib: `google-ads-api.ts` (~465 lineas, dedup, timeout 60s, error details)
- Backend: `manage-google-campaign.ts` (13 actions), `manage-google-pmax.ts` (6 actions), `manage-google-rules.ts` (CRUD reglas), `execute-google-rules.ts` (cron), `sync-google-ads-metrics.ts`, `sync-campaign-metrics.ts`, `check-google-ads-health.ts`, `currency.ts`
- Frontend: `GoogleCampaignManager.tsx` (wizard PMAX 6 pasos, +496 lineas), `GoogleAutomatedRules.tsx` (5 presets + historial), `GoogleAdsTab.tsx` (4 tabs: Analiticas/Campanas/Reglas/Copys), `GoogleAnalyticsDashboard.tsx` (30 fixes), `OAuthGoogleAdsCallback.tsx`, `PlatformConnectionsPanel.tsx`, `ClientMetricsPanel.tsx`
- Sub-componentes: `ImageUploadZone`, `YouTubeInput`, `fileToBase64`
- Edge Functions: `google-ads-oauth-callback`, `sync-google-ads-metrics`

## Tus Edge Functions
- `google-ads-oauth-callback` — maneja el callback OAuth de Google Ads
- `sync-google-ads-metrics` — sincroniza metricas desde Google Ads API

## Dependencias
- Necesitas de: env vars para produccion (`GOOGLE_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_MCC_CUSTOMER_ID`, `GOOGLE_MCC_REFRESH_TOKEN`)
- Alimentas a: Ignacio W17 (metricas Google), Felipe W2 (comparativa cross-platform)

## Progreso (actualizado 2026-04-15)
- **Tier 1 COMPLETADO (10/04):** Pause/resume campanas, editar budget, reglas automaticas con cron. 2 tablas nuevas + RLS. Deploy completo. Commit `12b642f0`.
- **Tier 2 COMPLETADO (10/04):** Keywords, RSA Ads, Extensions, Conversions, Search Terms. 8 archivos nuevos.
- **Tier 3 COMPLETADO (12/04):** Shared lib google-ads-api.ts, 13 actions manage-campaign, PMAX manager, Steve AI recommendations. +2979/-785 lineas. Commit `5b3c60bb`, deploy rev 00513-489.
- **Tier 3.5 COMPLETADO (13/04):** Wizard PMAX 6 pasos (imagenes+videos+CTA+display URL), 10 fixes API v23, arquitectura single-batch. 7 commits, 6 deploys.
- **Dashboard (09/04):** 7 features nuevas + 30 fixes + 1 bug fix (goals reset).
- **Pipeline (10/04):** Fix sync-campaign-metrics, health check, currency, MCC fallback.

## Problemas Conocidos
- Credenciales Google no configuradas en Cloud Run para produccion (5 env vars pendientes)
- Sin tokens activos en `platform_connections` para Google (requiere Leadsie+MCC setup)
- Verificar PMAX end-to-end con imagenes reales (pendiente)
- Validacion aspect ratio client-side (pendiente)
- Edicion de assets post-creacion (pendiente)
- Plan Leadsie+MCC documentado en memory pero NO implementado aun

## Roadmap 20 Features (Notion)
- **Critica (5):** Keywords, Search Terms+Negatives, RSA, Extensions, Conversion Tracking → parcialmente cubiertos en Tier 2
- **Alta (5):** Display Creator, Remarketing, PMax Asset Groups, Shopify→Merchant Center, Performance Tracker → PMAX avanzado en Tier 3
- **Media (5):** Quality Score, Placements, CRITERIO Google, Experiments, Bid Strategy → pendientes
- **Normal (5):** Asset Library, Shopping por producto, Klaviyo→Customer Match, Report semanal, Copy Generator → pendientes
