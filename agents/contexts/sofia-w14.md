# Sofia W14 — Contexto Operacional

## Tus Tablas
| Tabla | Columnas clave | Estado |
|-------|---------------|--------|
| `platform_connections` | id, client_id, platform, access_token_encrypted, refresh_token_encrypted, api_key_encrypted, account_id, is_active, last_sync_at, shopify_client_id, shopify_client_secret_encrypted | Activa (compartida con Diego W8) |
| `platform_metrics` | connection_id, metric_date, metric_type, metric_value, currency | Activa |
| `oauth_states` | nonce, shop_domain, client_id, expires_at | Activa (nonces one-time-use) |

## Tablas que Lees (de otros agentes)
| Tabla | Dueño | Para qué la lees |
|-------|-------|-----------------|
| `clients` | Diego W8 | Para validar propiedad en OAuth callbacks |
| `campaign_metrics` | Felipe W2 | Para verificar que sync Meta produce datos |
| `adset_metrics` | Felipe W2 | Para verificar granularidad del sync Meta |
| `shopify_products` | Matías W13 | Para verificar que sync Shopify produce datos |
| `email_campaigns` | Rodrigo W0 | Para verificar que sync Klaviyo produce datos |
| `merchant_onboarding` | Camila W4 | Para completar steps post-OAuth |

## Tus Crons
| Job | Schedule | Endpoint | Estado conocido |
|-----|----------|----------|----------------|
| sync-all-metrics-6h | `0 */6 * * *` | /api/cron/sync-all-metrics | Activo (verifica rows upserted) |

## Tus Archivos

### OAuth Callbacks (Backend — Cloud Run)
- `cloud-run-api/src/routes/oauth/meta-oauth-callback.ts` — Meta Ads OAuth (PKCE, long-lived token)
- `cloud-run-api/src/routes/oauth/google-ads-oauth-callback.ts` — Google Ads OAuth (CSRF state)
- `cloud-run-api/src/routes/shopify/shopify-oauth-callback.ts` — Shopify OAuth (HMAC + nonce)

### Sync Routes (Backend — Cloud Run)
- `cloud-run-api/src/routes/cron/sync-all-metrics.ts` — Cron maestro (itera todas las conexiones activas)
- `cloud-run-api/src/routes/meta/sync-meta-metrics.ts` — Sync Meta campaigns + adsets
- `cloud-run-api/src/routes/shopify/sync-shopify-metrics.ts` — Sync Shopify orders + products
- `cloud-run-api/src/routes/google/sync-google-ads-metrics.ts` — Sync Google campaigns + keywords
- `cloud-run-api/src/routes/klaviyo/sync-klaviyo-metrics.ts` — Sync Klaviyo campaigns + flows

### Storage Routes (Backend — Cloud Run)
- `cloud-run-api/src/routes/utilities/store-platform-connection.ts` — Store genérica (Shopify, Meta, Google)
- `cloud-run-api/src/routes/klaviyo/store-klaviyo-connection.ts` — Store Klaviyo (API key, no OAuth)

### Librerías (Backend — Cloud Run)
- `cloud-run-api/src/lib/meta-fetch.ts` — Helpers para Meta API (metaApiFetch, metaApiJson)
- `cloud-run-api/src/lib/meta-token-refresh.ts` — Refresh long-lived token Meta (60 días)
- `cloud-run-api/src/lib/shopify-session.ts` — Validación de Shopify Session Token

### Frontend (React)
- `src/components/dashboard/PlatformConnectionsPanel.tsx` — Admin: gestión global de conexiones
- `src/components/client-portal/ClientPortalConnections.tsx` — Cliente: conectar/desconectar plataformas
- `src/components/client-portal/meta-ads/MetaConnectionWizard.tsx` — Wizard OAuth Meta
- `src/components/client-portal/meta-ads/MetaAdAccountSelector.tsx` — Selector de ad accounts
- `src/components/client-portal/ShopifyCustomAppWizard.tsx` — Wizard Shopify custom app

### Validaciones (Chino QA)
- `cloud-run-api/src/chino/checks/data-quality.ts` — No duplicate connections, tokens válidos
- `cloud-run-api/src/chino/checks/security.ts` — access_token no NULL si connected

## Tus Edge Functions (13 de integración)
- `shopify-oauth-callback`, `shopify-install`, `shopify-session-validate`
- `google-ads-oauth-callback`
- `sync-meta-metrics`, `sync-shopify-metrics`, `sync-google-ads-metrics`, `sync-klaviyo-metrics`, `sync-campaign-metrics`
- `store-platform-connection`, `store-klaviyo-connection`
- `fetch-shopify-products`, `fetch-shopify-analytics`, `fetch-shopify-collections`
- `shopify-fulfillment-webhooks`, `shopify-gdpr-webhooks`, `shopify-data-verify`
- `create-shopify-discount`
- `import-klaviyo-templates`, `fetch-klaviyo-top-products`, `klaviyo-manage-flows`, `klaviyo-push-emails`

## RPCs de Supabase
- `encrypt_platform_token(raw_token TEXT)` — Encripta token con PGP
- `decrypt_platform_token(encrypted_token TEXT)` — Desencripta token

## APIs Externas
| API | Versión | Auth | Rate Limits |
|-----|---------|------|-------------|
| Meta Graph API | v21.0 | Bearer (long-lived token, 60 días) | 200 calls/hour/ad account |
| Google Ads API | v18 | Bearer (refresh_token rotation) | 15,000 operations/day |
| Shopify Admin API | 2024-10 | Bearer (no expira, revocable) | 2 calls/second |
| Klaviyo API | 2024-10-15 | Bearer (API key, no expira) | 75 calls/second |

## Env Vars que necesitas
- `META_APP_ID`, `META_APP_SECRET` — OAuth Meta
- `GOOGLE_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN` — OAuth Google (**PENDIENTES**)
- `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_WEBHOOK_SECRET` — OAuth Shopify (**PENDIENTES**)
- `ENCRYPTION_KEY` — Master key para PGP en Supabase

## Dependencias
- Necesitas de: Diego W8 (tabla clients, triggers), Camila W4 (frontend de conexiones)
- Alimentas a: Felipe W2 (Meta data), Matías W13 (Shopify data), Rodrigo W0 (Klaviyo data), Andrés W3 (Google data), Ignacio W17 (métricas cross-platform)

## Problemas Conocidos
- No hay job proactivo de refresh para Meta tokens (60 días → expiran en silencio)
- Google Ads env vars pendientes (GOOGLE_CLIENT_ID, etc.)
- Shopify env vars pendientes (SHOPIFY_CLIENT_ID, etc.)
- Edge Functions duplican lógica de Cloud Run (13 funciones con equivalentes en Cloud Run)
- No hay alertas cuando una conexión activa deja de sincronizar
- sync-all-metrics puede reportar "success" con 0 rows upserted (silent failure)
