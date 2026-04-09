# Journal — Matías W13 (Shopify)

> Memoria acumulativa. Orden: más reciente arriba.

---

## 2026-04-08 — Dual-Mode Credential Resolver: Custom App HOY, App Store listo

### Trabajo completado
- **Diagnóstico**: 3 HTML line-by-line del módulo Shopify (14 hallazgos, arquitectura dual diseñada antes de codear)
- **Sprint Custom App (5 pasos)**: migración + resolver Node/Deno + refactor 4 webhook handlers + auto-registro GDPR + wizard hardening + feature flag
- **Deploy**: commit `ac63d5b`, backend `steve-api-00425-9p8`, frontend en `origin/main`
- **Verificación**: 1 conexión activa (`raicesdelalma.myshopify.com`) marcada automáticamente como `custom_app`, endpoint `/api/shopify/config` responde `mode=custom`

### Arquitectura: Strategy/Resolver pattern

**Por qué dual-mode y no un switch global:**
- Custom App usa credenciales **per-cliente** (cada tienda tiene su propio `client_id`/`client_secret`)
- App Store usa credenciales **globales** (una public app sirve a todas las tiendas)
- Un switch global obligaría a migrar todas las conexiones existentes al aprobar Shopify → downtime + riesgo
- **Solución**: columna `connection_mode` por conexión; el resolver decide por tienda → Custom App y App Store conviven sin migración de datos

**El resolver** (`lib/shopify-credentials.ts`):
```typescript
resolveShopifyCredentials(shopDomain) → {
  mode: 'custom_app' | 'app_store',
  clientId, clientSecret, accessToken,
  webhookSecret  // CRÍTICO: en custom_app = client_secret de la tienda
                 //          en app_store = SHOPIFY_WEBHOOK_SECRET global
}
```

**Env var `SHOPIFY_MODE`** (feature flag SOLO de UI):
- `custom` → wizard Custom App únicamente
- `appstore` → botón "Install from Shopify App Store" únicamente
- `both` → pantalla de elección con ambos flujos

No afecta a conexiones existentes — esas siguen con su `connection_mode` guardado en DB.

### Red flags descubiertas en el diagnóstico

1. **Edge functions zombi**: `shopify-fulfillment-webhooks`, `shopify-gdpr-webhooks`, `shopify-install`, etc. existen en `supabase/functions/` pero Shopify apunta sus webhooks al Cloud Run. **~600 líneas de código muerto duplicando la lógica.** Tienen que borrarse.

2. **Solo 4 de 7 webhooks mandatorios registrados**. Shopify exige para aprobar App Store:
   - Fulfillment: `orders/fulfilled`, `orders/partially_fulfilled`, `orders/cancelled`, `orders/create` ✅
   - GDPR: `customers/data_request`, `customers/redact`, `shop/redact` ❌ FALTABAN
   - Lifecycle: `app/uninstalled` ✅
   → Arreglado añadiendo los 3 GDPR a `webhooksToRegister` en `shopify-oauth-callback.ts`

3. **Polling sin timeout** en el wizard Custom App — si `store-shopify-credentials` fallaba, la UI se colgaba infinitamente sin feedback. Añadí timeout de 10min + retry button.

4. **Sin validación client-side** — usuarios pegaban cualquier cosa y se iba al backend. Añadí regex:
   - Client ID: `/^[a-f0-9]{32}$/i`
   - Client Secret: `/^(shpss_[a-f0-9]{32,}|[a-f0-9]{32,})$/i`

### Descubrimientos / aprendizajes

1. **Shopify Custom Apps vs Public Apps — diferencia clave del HMAC**:
   - Custom App: webhook firmado con el **client_secret de esa app específica** (único para esa tienda)
   - Public App: webhook firmado con un **secret global** configurado en el Partner Dashboard (`SHOPIFY_WEBHOOK_SECRET`)
   - **Error común**: asumir que existe UN webhook secret universal → falla HMAC en Custom App. Por eso `webhookSecret` en la interfaz del resolver varía según modo.

2. **Migraciones fantasma workaround**: `supabase db push --linked` estaba bloqueado por migraciones viejas `20260321/22/25` con formato inconsistente. Workaround: `supabase db query --file <migration.sql> --linked` aplica el SQL directo sin tocar el historial. Útil cuando la migración es idempotente (`IF NOT EXISTS`).

3. **`git stash --include-untracked` puede mover archivos TUYOS** si otra sesión comitea mientras tú tienes archivos nuevos. Pasó durante esta sesión: perdí temporalmente `shopify-credentials.ts`, lo recuperé con `stash pop stash@{0}`. Siempre `git stash list` antes de asumir que los archivos se borraron.

4. **`routes/index.ts` ya tenía la ruta registrada** antes de que yo hiciera commit — alguna sesión anterior añadió los imports de `shopifyConfig` sin comitear el archivo `shopify-config.ts`. HEAD quedó importando un archivo fantasma hasta que yo lo comitée. Confirmación: siempre verificar `git show HEAD:<file>` cuando un archivo "nuevo" no aparece en el diff.

### Riesgos conocidos (documentados para JM en `que-hice-shopify-dual.html`)

1. **Fallback legacy**: los 4 webhook handlers hacen fallback a `SHOPIFY_WEBHOOK_SECRET` env var si el resolver retorna null. Esto mantiene compat con tiendas que se conectaron antes de la migración. Cuando todas las tiendas tengan `connection_mode` seteado, el fallback es código muerto.

2. **Duplicación `resolveShopifyCredentials`**: existe una función inline en `shopify-oauth-callback.ts` (ligeramente distinta) que debería consolidarse con la de `lib/`. No bloquea, pero es deuda técnica.

3. **Migraciones fantasma** siguen ahí — afectan a TODO el equipo que quiera usar `supabase db push`. Hay que coordinar con Sebastián W5 + Javiera W12 para una sesión de `migration repair`.

4. **Edge functions muertas** siguen siendo deployables y podrían causar confusión en auditorías futuras. Borrarlas en una sesión de limpieza.

### Archivos tocados
- **Creados (5)**: `lib/shopify-credentials.ts`, `_shared/shopify-credentials.ts`, `routes/shopify/shopify-config.ts`, `hooks/useShopifyConfig.ts`, `migrations/20260408150000_shopify_dual_mode.sql`
- **Modificados (7)**: `shopify-fulfillment-webhooks` (edge + cloud run), `shopify-gdpr-webhooks` (edge + cloud run), `shopify-oauth-callback.ts`, `store-shopify-credentials.ts`, `ShopifyCustomAppWizard.tsx`
- **HTML (1)**: `que-hice-shopify-dual.html` con analogía del portero

### Commit + deploy
- Commit `ac63d5b` (12 archivos, +764/-34)
- Migración aplicada via `supabase db query --file --linked`
- Backend revisión: `steve-api-00425-9p8`
- Frontend: push a `origin/main` → Vercel auto-deploy
- Endpoint prod verificado: `GET /api/shopify/config` → 200 OK `mode=custom`
