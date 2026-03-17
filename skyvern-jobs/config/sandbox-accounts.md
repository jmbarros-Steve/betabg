# Cuentas Sandbox para Skyvern

## Estado de creación

| Plataforma | Estado | URL | Cuenta |
|------------|--------|-----|--------|
| Shopify Dev Store | PENDIENTE | steve-qa-sandbox.myshopify.com | — |
| Meta Business Manager | PENDIENTE | business.facebook.com | — |
| Klaviyo | PENDIENTE | klaviyo.com | — |
| Steve Ads QA User | ACTIVO | www.steve.cl | qa-bot@steveads.com |

## Shopify — Dev Store

**Cómo crear:**
1. Ir a https://partners.shopify.com
2. Stores → Add store → Development store
3. Store name: `steve-qa-sandbox`
4. Purpose: "I'm building an app or a theme"
5. Agregar productos de prueba (5-10 productos variados con precios)

**Scopes necesarios para custom app:**
- `read_products`, `write_products`
- `read_orders`, `write_orders`
- `read_analytics`
- `read_checkouts`
- `read_draft_orders`, `write_draft_orders`
- `read_reports`

**Datos de prueba a cargar:**
- 10 productos con precios entre $5.990 y $49.990 CLP
- 3 colecciones: "Plantas interior", "Suculentas", "Maceteros"
- 5 órdenes históricas para métricas

## Meta — Business Manager de prueba

**Cómo crear:**
1. Crear cuenta Facebook nueva (o usar personal)
2. Ir a https://business.facebook.com/overview
3. Crear Business: "Steve Ads QA Sandbox"
4. Crear Ad Account dentro del BM (no necesita tarjeta)
5. Crear Page: "Steve QA Test Page"
6. No necesita gastar — solo verificar que la API responde

**Configuración necesaria:**
- Business ID: (se obtiene al crear)
- Ad Account ID: act_XXXXXXXXX
- Page ID: XXXXXXXXX
- System User token con scopes: ads_management, ads_read, pages_read_engagement, business_management

## Klaviyo — Cuenta Free

**Cómo crear:**
1. Ir a https://www.klaviyo.com/sign-up
2. Email: qa-sandbox@steveads.com (o alias)
3. Plan: Free (250 contactos)
4. Crear lista: "QA Test List"
5. Agregar 5 contactos de prueba

**Datos necesarios:**
- Private API Key (pk_XXXXX)
- Public API Key (para tracking)
- List ID de "QA Test List"
