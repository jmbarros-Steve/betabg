# Guía: Conectar Shopify con Custom App Personalizada

## Contexto para el agente
Esta guía describe cómo conectar una tienda Shopify a la plataforma Steve usando una Custom App con distribución personalizada. Cada cliente tiene su propia Custom App en Shopify. El flujo usa OAuth — el access token se obtiene automáticamente, NUNCA se pide manualmente.

## Arquitectura

- **Frontend**: React + Vite en Vercel (`betabgnuevosupa.vercel.app`)
- **Backend API**: Hono en Google Cloud Run (`steve-api-850416724643.us-central1.run.app`)
- **Base de datos**: Supabase (tabla `platform_connections`)
- **Componente wizard**: `src/components/client-portal/ShopifyCustomAppWizard.tsx`
- **Endpoint guardar credenciales**: `POST /api/store-shopify-credentials`
- **Endpoint OAuth install**: `GET /api/shopify-install`
- **Endpoint OAuth callback**: `GET /api/shopify-oauth-callback`

## Flujo completo (6 pasos)

### Paso 1: Nombre de la tienda
El usuario ingresa el subdominio de su tienda Shopify (ej: `mi-tienda` para `mi-tienda.myshopify.com`).

### Paso 2: Crear Custom App en Shopify Admin
El usuario va a su Shopify Admin → Settings → Apps → Develop apps:

1. Hacer clic en **"Desarrollar apps"** (arriba a la derecha)
2. Si es primera vez: **"Permitir el desarrollo de apps personalizadas"**
3. **"Crear una app"** → nombre: **Steve**
4. Configurar estas URLs en la app:

| Campo | Valor |
|-------|-------|
| **App URL** | `https://steve-api-850416724643.us-central1.run.app/api/shopify-install` |
| **Allowed redirection URL** | `https://steve-api-850416724643.us-central1.run.app/api/shopify-oauth-callback` |

**IMPORTANTE**: La App URL DEBE apuntar al endpoint `/api/shopify-install` del backend, NO al frontend. Esto es necesario para que el link de distribución personalizada redirija correctamente al OAuth.

### Paso 3: Configurar permisos (API Scopes)
Dentro de la Custom App → "Configure Admin API scopes" → activar estos 11 permisos:

```
read_products
write_products
read_orders
read_customers
read_checkouts
read_analytics
read_inventory
write_inventory
read_fulfillments
read_discounts
write_discounts
```

Guardar (Save).

### Paso 4: Copiar Client ID y Client Secret
En la Custom App → pestaña **"API credentials"**:

1. Copiar el **Client ID** (es público, identifica la app)
2. Copiar el **Client Secret** (es secreto, se usa para OAuth)

Estos se pegan en el wizard de Steve. El backend los guarda en `platform_connections`:
- `shopify_client_id` → texto plano
- `shopify_client_secret_encrypted` → encriptado via `encrypt_platform_token()` RPC

**Endpoint usado:**
```
POST /api/store-shopify-credentials
Authorization: Bearer <jwt>
Body: {
  "clientId": "<steve_client_id>",
  "shopDomain": "mi-tienda",
  "shopifyClientId": "<client_id_de_shopify>",
  "shopifyClientSecret": "<client_secret_de_shopify>"
}
```

Esto crea/actualiza la fila en `platform_connections` con:
- `platform: 'shopify'`
- `shop_domain: 'mi-tienda.myshopify.com'`
- `store_url: 'https://mi-tienda.myshopify.com'`
- `shopify_client_id`
- `shopify_client_secret_encrypted`
- `is_active: true`

### Paso 5: Distribución personalizada → Instalar
En la Custom App de Shopify:

1. Ir a la sección **"Distribución"**
2. Hacer clic en **"Gestionar distribución personalizada"**
3. Shopify genera un **link de instalación único** (es un hash random por app)
4. Copiar ese link y pegarlo en el navegador
5. Shopify muestra la pantalla de autorización → hacer clic en **"Instalar"**

**Qué pasa por detrás:**
1. Shopify redirige al **App URL** (`/api/shopify-install`) con params `shop`, `hmac`, `host`
2. `shopify-install.ts` busca las credenciales por `shop_domain` en `platform_connections`
3. Genera un `nonce`, lo guarda en `oauth_states`, construye la URL de autorización de Shopify
4. Redirige al usuario a `https://{shop}/admin/oauth/authorize?client_id=...&scope=...&redirect_uri=...&state=...`
5. El usuario autoriza → Shopify redirige a `/api/shopify-oauth-callback` con `code`
6. `shopify-oauth-callback.ts` intercambia el `code` por un `access_token`
7. Encripta el token y lo guarda en `platform_connections.access_token_encrypted`
8. Redirige al frontend `/oauth/shopify/callback?success=true`

**IMPORTANTE**: El endpoint usa `window.top.location.href` en vez de redirect 302 para romper el iframe de Shopify admin si la app está embebida.

### Paso 6: App instalada
El wizard hace polling cada 3 segundos a `platform_connections` buscando:
- `client_id` = el cliente actual
- `platform` = 'shopify'
- `access_token_encrypted` IS NOT NULL

Cuando lo encuentra, muestra pantalla de éxito "App instalada".

## Tabla: platform_connections (columnas relevantes para Shopify)

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | uuid | PK |
| `client_id` | uuid | FK a clients |
| `platform` | text | 'shopify' |
| `shop_domain` | text | 'mi-tienda.myshopify.com' |
| `store_url` | text | 'https://mi-tienda.myshopify.com' |
| `store_name` | text | Nombre de la tienda |
| `shopify_client_id` | text | Client ID de la Custom App |
| `shopify_client_secret_encrypted` | text | Client Secret encriptado |
| `access_token_encrypted` | text | Access Token OAuth encriptado |
| `is_active` | boolean | true si está conectada |
| `last_sync_at` | timestamp | Última sincronización |

## Endpoints relacionados

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `/api/store-shopify-credentials` | POST | JWT | Guarda Client ID + Secret |
| `/api/shopify-install` | GET | No | Inicia OAuth (redirect a Shopify) |
| `/api/shopify-oauth-callback` | GET | No | Recibe code, intercambia por token |
| `/api/store-shopify-token` | POST | JWT | Guarda token manual (legacy, no usar) |
| `/api/sync-shopify-metrics` | POST | JWT | Sincroniza órdenes/métricas |
| `/api/fetch-shopify-products` | POST | JWT | Obtiene productos de la tienda |

## Errores comunes

| Error | Causa | Solución |
|-------|-------|----------|
| "Shopify credentials not found" | No se guardaron Client ID/Secret (paso 4) | Volver al paso 4 del wizard |
| "redirect_uri is not whitelisted" | Redirect URL no configurada en Shopify | Agregar `https://steve-api-xxx/api/shopify-oauth-callback` en Allowed redirection URLs |
| "Store URL and Access Token required" | OAuth no se completó (paso 5) | Completar la instalación via distribución personalizada |
| Polling no detecta conexión | Columna `access_token_encrypted` es NULL | El OAuth no completó — revisar logs del callback |

## Archivos clave

```
src/components/client-portal/ShopifyCustomAppWizard.tsx    — Wizard frontend 6 pasos
src/components/client-portal/ClientPortalConnections.tsx   — Panel de conexiones
cloud-run-api/src/routes/shopify/shopify-install.ts        — OAuth install (GET)
cloud-run-api/src/routes/shopify/shopify-oauth-callback.ts — OAuth callback
cloud-run-api/src/routes/shopify/store-shopify-credentials.ts — Guardar credenciales
cloud-run-api/src/routes/shopify/store-shopify-token.ts    — Legacy token manual
cloud-run-api/src/routes/shopify/sync-shopify-metrics.ts   — Sync métricas
```
