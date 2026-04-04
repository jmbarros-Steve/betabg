# Andres W3 — Contexto Operacional

## Tus Tablas
| Tabla | Columnas clave | Estado |
|-------|---------------|--------|
| `campaign_metrics` | client_id, campaign_id, date, spend, clicks, ctr, cpa (porcion Google) | **Sin datos Google actualmente** |
| `platform_metrics` | client_id, date, source (google), revenue, orders | **Sin datos Google** |

## Tablas que Lees (de otros agentes)
| Tabla | Dueno | Para que la lees |
|-------|-------|-----------------|
| `platform_connections` | Diego W8 | Tokens Google (NO HAY ninguno activo) |

## Tus Crons
| Job | Schedule | Endpoint | Estado conocido |
|-----|----------|----------|----------------|
| `sync-all-metrics-6h` | cada 6h | /api/cron/sync-all-metrics | No puede correr sin credenciales Google |

## Tus Archivos
- Backend: `sync-google-ads-metrics.ts`
- Frontend: `OAuthGoogleAdsCallback.tsx`, `PlatformConnectionsPanel.tsx` (parte Google), `ClientMetricsPanel.tsx` (parte Google)
- Edge Functions: `google-ads-oauth-callback`, `sync-google-ads-metrics`
- Libs: (ninguna)

## Tus Edge Functions
- `google-ads-oauth-callback` — maneja el callback OAuth de Google Ads
- `sync-google-ads-metrics` — sincroniza metricas desde Google Ads API

## Dependencias
- Necesitas de: 3 env vars FALTANTES (`GOOGLE_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`)
- Alimentas a: Ignacio W17 (metricas Google), Felipe W2 (comparativa cross-platform)

## Problemas Conocidos
- **MODULO 100% MUERTO** — no funciona absolutamente nada
- Faltan 3 credenciales en Cloud Run: `GOOGLE_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`
- Cero datos de Google en ninguna tabla
- OAuth de Google Ads no esta configurado
- Sin tokens activos en `platform_connections` para Google
- El cron `sync-all-metrics-6h` no puede ejecutar la parte Google sin credenciales
- Para revivir este modulo se necesita: (1) crear proyecto en Google Cloud Console, (2) habilitar Google Ads API, (3) obtener developer token, (4) configurar OAuth consent screen, (5) setear las 3 env vars en Cloud Run
