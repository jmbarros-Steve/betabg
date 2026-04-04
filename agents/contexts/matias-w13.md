# Matias W13 — Contexto Operacional

## Tus Tablas
| Tabla | Columnas clave | Estado |
|-------|---------------|--------|
| `shopify_products` | client_id, product_id, title, status, variants, price, inventory_quantity | Desconocido (sync puede estar desactualizado) |
| `shopify_abandoned_checkouts` | client_id, checkout_id, email, total_price, created_at | Desconocido |
| `platform_metrics` | client_id, date, source (shopify), revenue, orders | Shared con Andres W3 |

## Tablas que Lees (de otros agentes)
| Tabla | Dueno | Para que la lees |
|-------|-------|-----------------|
| `platform_connections` | Diego W8 | Tokens Shopify |

## Tus Crons
| Job | Schedule | Endpoint | Estado conocido |
|-----|----------|----------|----------------|
| (ninguno) | — | — | Shopify desconectado sin credenciales |

## Tus Archivos
- Backend: `cloud-run-api/src/routes/shopify/fetch-shopify-products.ts`, `sync-shopify-metrics.ts`, `fetch-shopify-analytics.ts`
- Frontend: Shopify tab in ClientPortal
- Edge Functions: `shopify-install`, `shopify-oauth-callback`, `shopify-session-validate`, `shopify-data-verify`, `shopify-fulfillment-webhooks`, `shopify-gdpr-webhooks`, `fetch-shopify-products`, `fetch-shopify-analytics`, `fetch-shopify-collections`, `sync-shopify-metrics`
- Libs: (ninguna propia)

## Tus Edge Functions
- `shopify-install` — Inicio del flujo OAuth Shopify
- `shopify-oauth-callback` — Callback OAuth, guarda tokens
- `shopify-session-validate` — Valida sesion activa Shopify
- `shopify-data-verify` — Verifica integridad de datos sync
- `shopify-fulfillment-webhooks` — Recibe webhooks de fulfillment
- `shopify-gdpr-webhooks` — Compliance GDPR (mandatory Shopify)
- `fetch-shopify-products` — Pull de productos desde Shopify API
- `fetch-shopify-analytics` — Pull de analytics desde Shopify API
- `fetch-shopify-collections` — Pull de collections desde Shopify API
- `sync-shopify-metrics` — Sincroniza metricas a platform_metrics

## Env Vars Faltantes
- `SHOPIFY_CLIENT_ID` — FALTANTE
- `SHOPIFY_CLIENT_SECRET` — FALTANTE
- `SHOPIFY_WEBHOOK_SECRET` — FALTANTE

## Dependencias
- Necesitas de: 3 env vars FALTANTES (Shopify App), Diego W8 (platform_connections para tokens)
- Alimentas a: Felipe W2 (productos para DPA), Paula W19 (carritos abandonados), Ignacio W17 (revenue data)

## Problemas Conocidos
- **App Store integration 100% MUERTA** — faltan 3 credenciales criticas
- Productos posiblemente desactualizados (sin sync activo)
- Webhooks no registrados (requiere SHOPIFY_WEBHOOK_SECRET)
- Sin crons activos — toda la pipeline Shopify esta inerte
- platform_metrics sin datos Shopify frescos
