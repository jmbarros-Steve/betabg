# Matías W13 — Shopify
Squad: Infra | Última sesión: 2026-04-08

## Estado actual: Dual-Mode Credential Resolver DEPLOYADO — Custom App operativa, App Store listo para activar

### Completado (sesión 08/04/2026)

#### Diagnóstico line-by-line módulo Shopify (previo a implementación)
- [x] 3 HTML diagnósticos creados (abiertos por JM en browser)
  - `diagnostico-shopify.html` — vista general + 14 hallazgos
  - `diagnostico-shopify-customapps.html` — análisis Custom Apps
  - `arquitectura-shopify-dual.html` — diseño del patrón Credential Resolver
- [x] Identificados los problemas críticos:
  - Edge Functions zombi (duplicados con Cloud Run) ~600 líneas muertas
  - Solo 4 de 7 webhooks mandatorios auto-registrados (faltaban 3 GDPR)
  - Sin validación client-side en wizard Custom App
  - Polling sin timeout (cuelgue infinito si store-credentials falla)
  - Hardcoded URL en wizard (inconsistente con resto del frontend)

#### Sprint 1 — Credential Resolver pattern
- [x] Migration `20260408150000_shopify_dual_mode.sql` — columna `platform_connections.connection_mode` (default `custom_app`, CHECK constraint)
- [x] `cloud-run-api/src/lib/shopify-credentials.ts` (327 líneas, Node) — `resolveShopifyCredentials()`, `getShopifyMode()`, `registerShopifyWebhooks()`, `validateShopifyCredentialsFormat()`, `SHOPIFY_WEBHOOK_TOPICS` constant con 8 topics
- [x] `supabase/functions/_shared/shopify-credentials.ts` (165 líneas, Deno) — misma lógica para edge functions
- [x] TypeScript compila clean (exit 0)

#### Sprint 2 — Refactor webhook handlers (4 archivos)
- [x] `shopify-fulfillment-webhooks/index.ts` (edge function) — usa `getWebhookSecretForShop()`
- [x] `shopify-gdpr-webhooks/index.ts` (edge function) — mismo patrón
- [x] `routes/shopify/shopify-fulfillment-webhooks.ts` (Cloud Run) — `resolveShopifyCredentials()` con fallback a env vars
- [x] `routes/shopify/shopify-gdpr-webhooks.ts` (Cloud Run) — mismo patrón

#### Sprint 3 — Auto-registro GDPR webhooks faltantes
- [x] `shopify-oauth-callback.ts` — añadidos 3 topics GDPR a `webhooksToRegister`:
  - `customers/data_request`
  - `customers/redact`
  - `shop/redact`
- [x] Añadido `connection_mode: 'custom_app'` en upsert de `platform_connections`

#### Sprint 4 — Wizard Custom App hardening
- [x] `ShopifyCustomAppWizard.tsx` — removido hardcoded URL fallback
- [x] Añadido `POLL_TIMEOUT_MS = 10 * 60 * 1000` con `pollStartRef`
- [x] Client-side validation con regex (Client ID hex 32, Client Secret `shpss_*` o hex 32+)
- [x] Estado `pollTimedOut` + UI retry button `handleRetryPolling`
- [x] `store-shopify-credentials.ts` — `validateShopifyCredentialsFormat()` antes de guardar + `connection_mode: 'custom_app'` en upsert

#### Sprint 5 — Feature flag SHOPIFY_MODE
- [x] `routes/shopify/shopify-config.ts` — endpoint `GET /api/shopify/config` retorna `{mode, appStoreAvailable, customAppAvailable, appStoreUrl}`
- [x] `src/hooks/useShopifyConfig.ts` — React hook con defaults seguros (`mode=custom`)
- [x] Ruta registrada en `routes/index.ts`

#### HTML explainer (idiot-proof)
- [x] `que-hice-shopify-dual.html` — analogía del portero con master key vs keyring, 6 cambios, Switch Day, 4 riesgos honestos

#### Deploy
- [x] Safety query: 1 conexión Shopify activa (`raicesdelalma.myshopify.com`) con todas las credenciales presentes → safe
- [x] Commit `ac63d5b`: `feat(shopify): dual-mode credential resolver + auto-register webhooks` (12 archivos, +764/-34)
- [x] Migración aplicada via `supabase db query --file --linked` (evitó problema de migraciones fantasma 20260321/22/25)
- [x] `raicesdelalma.myshopify.com` quedó marcada como `connection_mode='custom_app'` automáticamente (default)
- [x] Backend Cloud Run deployado: revisión `steve-api-00425-9p8`
- [x] Endpoint verificado: `GET /api/shopify/config` → `{"mode":"custom","appStoreAvailable":false,"customAppAvailable":true,"appStoreUrl":null}`
- [x] Frontend en `origin/main` (Vercel auto-deploy)

### Pendiente

#### Limpieza técnica (no bloqueante)
- [ ] Borrar edge functions zombi (~600 líneas muertas): `shopify-fulfillment-webhooks`, `shopify-gdpr-webhooks`, `shopify-install`, `shopify-session-validate`, `shopify-data-verify` — solo Cloud Run recibe webhooks hoy
- [ ] Reparar migraciones fantasma 20260321/22/25 con `migration repair` (afecta a todos los agentes, coordinar con Sebastián W5)
- [ ] Duplicación: hay una `resolveShopifyCredentials` inline en `shopify-oauth-callback.ts` — consolidar con la de `lib/`

#### Switch Day (cuando Shopify apruebe public app)
- [ ] Setear env vars en Cloud Run: `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_WEBHOOK_SECRET`, `SHOPIFY_APP_STORE_URL`
- [ ] Cambiar `SHOPIFY_MODE=custom` → `SHOPIFY_MODE=both` (deja ambos flujos visibles) o `appstore` (solo 1-click)
- [ ] Nuevas conexiones via App Store se marcan `connection_mode='app_store'` automáticamente (pendiente wire en el callback OAuth del App Store)
- [ ] Conexiones viejas siguen como `custom_app` — cero migración de datos

#### Features Shopify aún no implementadas
- [ ] Sync orders real-time (solo tenemos metrics agregadas hoy)
- [ ] Analytics avanzado (top SKUs, cohorts, LTV, funnel) — archivo existe pero sin validar
- [ ] Rate limiting explícito en fetch-shopify-products (Shopify API limita a 2 req/s REST)
- [ ] Alerta de token expirado → Shopify tokens no expiran (OK) pero Custom App puede ser desinstalada

### Notas
- **Dual-Mode pattern cero-downtime**: el resolver lee `connection_mode` por conexión, no hay switch global. Conexiones Custom App y App Store conviven.
- **Webhook secret por tienda**: Custom Apps firman HMAC con el `client_secret` específico de CADA tienda, no un secret global. El resolver devuelve el secret correcto según modo.
- **Env var `SHOPIFY_MODE`** solo controla la UI (qué flujo ofrecer a conexiones NUEVAS). Las existentes siguen usando su `connection_mode` guardado.
- **Fallback a env vars**: los 4 webhook handlers hacen fallback a `SHOPIFY_WEBHOOK_SECRET`/`SHOPIFY_CLIENT_SECRET` si el resolver retorna null → tiendas viejas sin `connection_mode` no quedan huérfanas.
- **TypeScript errors encontrados y resueltos**:
  - `string | undefined` en `webhookSecret` → fix con `|| ''`
  - `Property 'webhook'/'webhooks' does not exist on '{}'` → cast `(await resp.json()) as any`
- **Git confusion resuelta**: durante el deploy hubo un `git stash --include-untracked` hecho por otra sesión antes de la compactación; recuperado con `stash pop stash@{0}`.
- **Migración fantasma workaround**: usé `supabase db query --file --linked` en vez de `db push` para evitar tocar el historial de migraciones.
