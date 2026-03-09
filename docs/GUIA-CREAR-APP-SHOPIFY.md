# Guía: Crear la App de Steve en Shopify Partners

## Qué es esto

Steve es una app de **distribución personalizada** en Shopify. Eso significa que NO se publica en el App Store. Tú la creas en Shopify Partners y le pasas un link de instalación al merchant.

El merchant hace clic → Shopify le pide permiso → se conecta automáticamente.

---

## PASO 1: Crear la App en Shopify Partners

1. Entra a **https://partners.shopify.com**
2. En el menú lateral, haz clic en **Apps**
3. Haz clic en **Create app**
4. Selecciona **Create app manually**
5. Nombre de la app: **Steve**
6. App URL (lo más importante):

```
https://steve-api-850416724643.us-central1.run.app/api/shopify-install
```

> Esta es la URL a la que Shopify va a redirigir cuando un merchant instale la app. Es el punto de entrada de todo.

7. Allowed redirection URL(s) — agrega esta URL:

```
https://steve-api-850416724643.us-central1.run.app/api/shopify-oauth-callback
```

> Esta es la URL a la que Shopify devuelve al merchant después de aceptar los permisos. Aquí es donde se intercambia el código por el token de acceso.

8. Haz clic en **Create app**

---

## PASO 2: Obtener las credenciales (Client ID y Client Secret)

Una vez creada la app, Shopify te muestra:

- **Client ID** (también llamado API key) — Ejemplo: `abc123def456`
- **Client secret** (también llamado API secret key) — Ejemplo: `shpss_xxxxxxxxxxxx`

> GUARDA ESTAS DOS COSAS. Las necesitas para configurar el backend.

Estas credenciales se configuran como secretos en Google Cloud Run:

| Variable de entorno | Valor |
|---|---|
| `SHOPIFY_CLIENT_ID` | El Client ID de arriba |
| `SHOPIFY_CLIENT_SECRET` | El Client secret de arriba |

---

## PASO 3: Configurar los Scopes (permisos)

Los scopes NO se configuran en Shopify Partners. Se piden automáticamente cuando el merchant instala la app. Nuestro backend pide estos:

| Scope | Para qué |
|---|---|
| `read_products` | Ver el catálogo de productos |
| `read_orders` | Métricas de ventas y analytics |
| `read_analytics` | Tendencias de la tienda |
| `read_checkouts` | Carritos abandonados |
| `read_discounts` | Ver descuentos existentes |
| `write_discounts` | Crear códigos de descuento |

El merchant ve estos permisos en la pantalla de instalación y acepta o rechaza.

---

## PASO 4: Configurar los GDPR Webhooks (obligatorio)

Shopify EXIGE que toda app tenga 3 webhooks de privacidad. Sin esto, no aprueban la app.

En la configuración de la app en Shopify Partners, busca la sección **GDPR mandatory webhooks** y llena:

| Webhook | URL |
|---|---|
| Customer data request | `https://steve-api-850416724643.us-central1.run.app/api/shopify-gdpr-webhooks` |
| Customer data erasure | `https://steve-api-850416724643.us-central1.run.app/api/shopify-gdpr-webhooks` |
| Shop data erasure | `https://steve-api-850416724643.us-central1.run.app/api/shopify-gdpr-webhooks` |

> Las 3 apuntan a la misma URL. El backend identifica cuál es cuál por el campo `topic` del body.

---

## PASO 5: Configurar la Distribución

1. En la página de la app, ve a la pestaña **Distribution**
2. Selecciona **Custom distribution**
3. Shopify te va a pedir confirmar que entiendes que la app NO estará en el App Store
4. Selecciona la tienda de desarrollo o confirma

Una vez configurado, Shopify te genera un **link de instalación**. Tiene esta forma:

```
https://admin.shopify.com/store/{nombre-tienda}/oauth/install?client_id={SHOPIFY_CLIENT_ID}
```

> Este es el link que le mandas al merchant para que instale la app.

---

## PASO 6: Instalar en una tienda (lo que hace el merchant)

El merchant recibe el link y:

1. Hace clic en el link
2. Shopify le muestra: "Steve quiere acceder a tu tienda" con los permisos listados
3. Hace clic en **Instalar**
4. Shopify redirige a tu App URL → tu backend procesa todo automáticamente
5. El merchant termina en el portal de Steve, logueado y listo

**Si es un merchant nuevo:** se le crea cuenta automáticamente con el email de su tienda Shopify.

**Si ya tenía cuenta:** se reconecta la tienda a su cuenta existente.

---

## Resumen Visual

```
TÚ                          SHOPIFY                         MERCHANT
 │                              │                               │
 │  Creas app en Partners       │                               │
 │  Configuras URLs ──────────► │                               │
 │  Configuras GDPR webhooks ─► │                               │
 │  Eliges Custom Distribution  │                               │
 │                              │                               │
 │  Obtienes link de ─────────► │                               │
 │  instalación                 │                               │
 │                              │                               │
 │  Le mandas el link ──────────┼─────────────────────────────► │
 │                              │                               │
 │                              │ ◄──── Hace clic en el link    │
 │                              │                               │
 │                              │ ────► Muestra permisos ─────► │
 │                              │                               │
 │                              │ ◄──── Acepta permisos         │
 │                              │                               │
 │                              │ ────► Redirige a tu API       │
 │                              │       (shopify-install)       │
 │                              │                               │
 │     TU API procesa:          │                               │
 │     - Verifica firma         │                               │
 │     - Intercambia token      │                               │
 │     - Crea usuario           │                               │
 │     - Guarda conexión        │                               │
 │     - Registra webhooks      │                               │
 │                              │                               │
 │     Redirige al frontend ────┼─────────────────────────────► │
 │                              │                               │
 │                              │              Ve el portal ◄── │
```

---

## Checklist Final

- [ ] App creada en Shopify Partners
- [ ] App URL configurada: `https://steve-api-850416724643.us-central1.run.app/api/shopify-install`
- [ ] Redirect URL configurada: `https://steve-api-850416724643.us-central1.run.app/api/shopify-oauth-callback`
- [ ] 3 GDPR webhooks configurados (todos apuntan a `/api/shopify-gdpr-webhooks`)
- [ ] Client ID y Client Secret guardados en Google Cloud Run como variables de entorno
- [ ] Distribución configurada como **Custom distribution**
- [ ] Link de instalación generado y probado en una tienda de desarrollo

---

## Valores Exactos para Copiar y Pegar

**App URL:**
```
https://steve-api-850416724643.us-central1.run.app/api/shopify-install
```

**Redirect URL:**
```
https://steve-api-850416724643.us-central1.run.app/api/shopify-oauth-callback
```

**GDPR Webhooks (las 3 iguales):**
```
https://steve-api-850416724643.us-central1.run.app/api/shopify-gdpr-webhooks
```

**Variables de entorno para Cloud Run:**
```
SHOPIFY_CLIENT_ID=<el que te da Shopify Partners>
SHOPIFY_CLIENT_SECRET=<el que te da Shopify Partners>
```
