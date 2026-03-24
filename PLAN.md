# PLAN: Testing completo de todas las funcionalidades Shopify en Steve Ads

## Prerequisitos antes de testear

### A. Variables de entorno en Cloud Run
```bash
# Verificar que existen:
gcloud run services describe steve-api --region us-central1 --project steveapp-agency \
  --format='value(spec.template.spec.containers[0].env)'
```

**Variables requeridas:**
| Variable | Necesaria para | Estado esperado |
|---|---|---|
| `SHOPIFY_CLIENT_ID` | OAuth centralizado | `3f87a3e6dcbd34a981df841f7705b7da` |
| `SHOPIFY_CLIENT_SECRET` | Token exchange + HMAC | **VERIFICAR — puede faltar** |
| `SHOPIFY_WEBHOOK_SECRET` | Webhooks HMAC | Fallback a CLIENT_SECRET si no existe |
| `CRON_SECRET` | Cron jobs | Debe existir |
| `SELF_URL` | sync-all-metrics (auto-call) | `https://steve-api-850416724643.us-central1.run.app` |
| `FRONTEND_URL` | Redirect post-OAuth | URL de Vercel |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin DB ops | Debe existir |
| `RESEND_API_KEY` | Weekly report email | Debe existir |

### B. Datos de prueba en Supabase
- **Tienda conectada**: Verificar que existe al menos 1 registro en `platform_connections` con `platform='shopify'` y `is_active=true`
- **Cliente de prueba**: Patricio Correa (`patricio.correa@jardindeeva.cl`) — client_id: buscar en `clients`
- **Admin**: `jmbarros@bgconsult.cl` — super_admin

### C. Herramientas necesarias
- Browser (Chrome DevTools abierto en Network tab)
- Terminal con `curl`
- Acceso a Supabase Dashboard
- Acceso a Cloud Run logs: `gcloud run logs read steve-api --region us-central1 --project steveapp-agency --limit=50`

---

## FASE 1: OAuth Flow (Prioridad CRÍTICA)

### Test 1.1 — Flujo OAuth completo (happy path)
**Qué testea**: Frontend → shopify-install → Shopify → callback → token guardado
**Archivo principal**: `ShopifyCustomAppWizard.tsx` → `shopify-install.ts` → `shopify-oauth-callback.ts`

**Pasos:**
1. Login como admin en `https://betabgnuevosupa.vercel.app`
2. Ir a Portal > Conexiones
3. Click "Conectar Shopify"
4. Ingresar dominio de una tienda real (ej: `jardindeeva` o una tienda de dev)
5. **Verificar en Network tab**: El redirect va a `steve-api.../api/shopify-install?shop=jardindeeva.myshopify.com&client_id=XXX`
6. **Verificar en Cloud Run logs**: `Shopify install request: { shop, hasHmac, perClientId }`
7. Shopify muestra pantalla de autorización → Click "Instalar"
8. **Verificar redirect**: Vuelve a `betabgnuevosupa.vercel.app/oauth/shopify/callback?success=true&store=...`
9. **Verificar en Supabase**: `platform_connections` tiene nuevo registro con:
   - `platform = 'shopify'`
   - `shop_domain = 'jardindeeva.myshopify.com'`
   - `access_token_encrypted` NO es null
   - `is_active = true`
10. **Verificar webhooks registrados**: Cloud Run logs muestran `Webhook orders/fulfilled registered successfully` (y los demás)

**Resultado esperado**: Conexión activa, token encriptado, webhooks registrados
**Si falla**: Revisar logs de Cloud Run, verificar SHOPIFY_CLIENT_SECRET

### Test 1.2 — OAuth con dominio inválido
**Pasos:**
1. En el wizard, ingresar `!!!invalid!!!`
2. **Verificar**: Error client-side "El nombre de la tienda solo puede tener letras, números y guiones"
3. Ingresar `tienda-que-no-existe-xyz123`
4. **Verificar**: Shopify muestra error (tienda no encontrada)

**Resultado esperado**: Errores manejados sin crash

### Test 1.3 — OAuth con tienda ya conectada (reconexión)
**Pasos:**
1. Repetir Test 1.1 con la misma tienda
2. **Verificar en Supabase**: NO se creó un registro duplicado en `platform_connections`
3. El registro existente se actualizó (nuevo token, `updated_at` cambiado)

**Resultado esperado**: Upsert correcto, sin duplicados

### Test 1.4 — State/CSRF validation
**Pasos:**
1. Abrir directamente: `https://steve-api.../api/shopify-oauth-callback?code=fake&shop=test.myshopify.com&state=invalid`
2. **Verificar**: Redirect a frontend con `?error=...` (no crash del servidor)
3. **Verificar logs**: `State validation failed: state_parse_error`

**Resultado esperado**: CSRF protection funciona, no se puede fabricar un callback

### Test 1.5 — SHOPIFY_CLIENT_SECRET faltante
**Pasos:**
1. Verificar con: `gcloud run services describe steve-api ...`
2. Si no existe, intentar OAuth flow completo
3. **Verificar**: Error claro en logs y redirect con `?error=credentials_not_found`

**Resultado esperado**: Error claro, no se queda colgado

---

## FASE 2: Dashboard y Analytics

### Test 2.1 — Dashboard carga con conexión activa
**Archivo**: `ShopifyDashboard.tsx` → `fetch-shopify-analytics`

**Pasos:**
1. Login como Patricio Correa (o admin)
2. Ir a Portal > Shopify
3. **Verificar que cargan los 4 KPIs**: Ingresos, Pedidos, Ticket Promedio, Carritos Abandonados
4. **Verificar gráfico**: "Ventas por Día" muestra barras
5. **Verificar Network tab**: Request a `/api/fetch-shopify-analytics` retorna 200
6. **Verificar moneda**: Todos los valores muestran CLP (ej: `$1.234.567`)

**Resultado esperado**: Dashboard carga en <5 segundos, datos coherentes

### Test 2.2 — Date range filters
**Pasos:**
1. En el dashboard, cambiar a "7 días"
2. **Verificar**: KPIs se actualizan, gráfico muestra solo 7 días
3. Cambiar a "30 días" → verificar
4. Cambiar a "90 días" → verificar
5. Usar "Personalizado" con rango de 3 días → verificar
6. **Verificar Network tab**: Cada cambio hace un nuevo request con `daysBack` o `startDate/endDate`

**Resultado esperado**: Datos cambian coherentemente con el rango

### Test 2.3 — Top SKUs panel
**Pasos:**
1. En el dashboard, buscar sección "Top SKUs"
2. **Verificar**: Muestra productos ordenados por revenue
3. **Verificar**: Cada SKU tiene nombre, cantidad vendida, revenue

**Resultado esperado**: SKUs reales de la tienda

### Test 2.4 — Carritos abandonados
**Pasos:**
1. En el dashboard, buscar sección "Carritos Abandonados"
2. **Verificar**: Muestra email del cliente, productos, valor
3. **Verificar filtros**: "Todos", "Sin contactar", "Contactados"

**Resultado esperado**: Datos de checkouts abandonados reales

### Test 2.5 — UTM Performance
**Pasos:**
1. Scroll hasta tabla UTM
2. **Verificar**: Muestra source, medium, campaign con revenue asociado
3. **Verificar scroll virtual**: Si hay muchos UTMs, la tabla hace scroll suave

**Resultado esperado**: Datos UTM de la tienda

### Test 2.6 — Análisis SEO
**Pasos:**
1. Buscar card "Análisis SEO"
2. **Verificar 5 checks**:
   - Productos sin imágenes
   - Imágenes sin alt text
   - Títulos cortos (<30 chars)
   - Descripciones vacías
   - Handle duplicados (si aplica)
3. Click para expandir lista de productos afectados

**Resultado esperado**: Checks con conteo real, expandibles

### Test 2.7 — Dashboard sin conexión activa
**Pasos:**
1. Login como un cliente SIN Shopify conectado
2. Ir a Portal > Shopify
3. **Verificar**: Muestra mensaje de "Conecta tu tienda" o wizard

**Resultado esperado**: No crash, muestra CTA para conectar

---

## FASE 3: Productos

### Test 3.1 — Lista de productos
**Archivo**: `ShopifyProductsPanel.tsx` → `fetch-shopify-products`

**Pasos:**
1. En dashboard Shopify, ir a tab/sección Productos
2. Click "Cargar Productos"
3. **Verificar tabla**: Imagen, Nombre, SKU, Precio, Costo, Margen%, Stock
4. **Verificar Network**: Request a `/api/fetch-shopify-products` retorna 200
5. **Verificar costos**: Si la tienda tiene costos configurados, la columna Costo NO está vacía
6. **Verificar márgenes**: Verde ≥30%, Amarillo 15-29%, Rojo <15%

**Resultado esperado**: Productos reales con datos completos

### Test 3.2 — Editar producto
**Pasos:**
1. Click icono de lápiz en un producto
2. Cambiar título → Guardar → **Verificar en Shopify admin**: título cambió
3. Cambiar precio de una variante → Guardar → **Verificar en Shopify admin**: precio cambió
4. Cambiar stock → Guardar → **Verificar en Shopify admin**: inventario cambió
5. **Verificar toast**: "Producto actualizado" aparece

**Resultado esperado**: Cambios reflejados en Shopify real

### Test 3.3 — Producto sin variantes/costos
**Pasos:**
1. Buscar un producto SIN costo configurado en Shopify
2. **Verificar**: Columna Costo muestra "-" o "Sin costo"
3. **Verificar**: Margen% muestra "-" (no NaN o error)
4. **Verificar alert**: "X productos sin costo" aparece si hay varios

**Resultado esperado**: Manejo graceful de datos faltantes

---

## FASE 4: Clientes

### Test 4.1 — Lista de clientes
**Archivo**: `ShopifyCustomersPanel.tsx` → `fetch-shopify-customers`

**Pasos:**
1. En dashboard, ir a sección Clientes
2. **Verificar stats**: Total clientes, Repeat customers, Avg ticket
3. **Verificar tabla**: Nombre, Email, Total gastado, Pedidos, Fecha registro
4. Buscar un cliente por nombre → **verificar filtro**
5. Buscar por email → **verificar filtro**

**Resultado esperado**: Clientes reales de la tienda

### Test 4.2 — Detalle de cliente
**Pasos:**
1. Click en una fila de cliente
2. **Verificar modal**: 3 KPIs (total gastado, pedidos, ticket promedio)
3. **Verificar historial**: Lista de pedidos con fecha, monto, status
4. **Verificar Network**: Request con `action=orders&customerId=XXX`

**Resultado esperado**: Historial completo del cliente

---

## FASE 5: Pedidos

### Test 5.1 — Lista de pedidos
**Archivo**: `ShopifyOrdersPanel.tsx` → `fetch-shopify-analytics`

**Pasos:**
1. En dashboard, ir a sección Pedidos
2. **Verificar KPIs**: Total pedidos (30d), Revenue filtrado, Ticket promedio
3. **Verificar tabla**: #Orden, Fecha, Cliente, Productos, Total, Status
4. **Verificar badges**: Colores correctos (verde=paid, amarillo=pending, rojo=refunded)
5. **Verificar line items**: Muestra hasta 2 productos + "+X más"

**Resultado esperado**: Pedidos reales de últimos 30 días

### Test 5.2 — Filtros de pedidos
**Pasos:**
1. Buscar por número de orden → verificar
2. Buscar por nombre de cliente → verificar
3. Buscar por nombre de producto → verificar
4. Filtrar por status "Pagado" → verificar solo pagados
5. Filtrar por status "Reembolsado" → verificar solo reembolsados

**Resultado esperado**: Filtros funcionan correctamente

---

## FASE 6: Descuentos

### Test 6.1 — Ver descuentos existentes
**Archivo**: `ShopifyDiscountsPanel.tsx` → `fetch-shopify-discounts`

**Pasos:**
1. En dashboard, ir a sección Descuentos
2. **Verificar tabla**: Código, Tipo, Valor, Usos, Expiración, Status
3. **Verificar badges**: Active (verde), Expired (gris), Scheduled (azul)
4. Buscar por código → verificar filtro
5. Filtrar por status → verificar

**Resultado esperado**: Descuentos reales de la tienda

### Test 6.2 — Crear descuento (porcentaje)
**Archivo**: `ShopifyDiscountDialog.tsx` → `create-shopify-discount`

**Pasos:**
1. Click "Crear Descuento"
2. Código: `TEST10` (o generar random)
3. Tipo: Porcentaje
4. Valor: 10
5. Mínimo de compra: 5000
6. Límite de uso: 100
7. Expiración: mañana
8. Click "Crear en Shopify"
9. **Verificar toast**: "Descuento creado"
10. **Verificar en Shopify admin**: Discount code `TEST10` existe con 10% off
11. **Limpiar**: Eliminar el descuento desde Shopify admin

**Resultado esperado**: Descuento creado correctamente en Shopify

### Test 6.3 — Crear descuento (monto fijo)
**Pasos:**
1. Código: `TEST5000`
2. Tipo: Monto fijo
3. Valor: 5000
4. Sin mínimo, sin límite, sin expiración
5. Click crear
6. **Verificar en Shopify**: Existe con $5.000 off

**Resultado esperado**: Descuento de monto fijo creado

### Test 6.4 — Validaciones de descuento
**Pasos:**
1. Intentar crear con código vacío → **Verificar**: Error de validación
2. Intentar crear con valor 0 → **Verificar**: Error
3. Intentar porcentaje 150% → **Verificar**: Error (máx 100%)
4. Intentar código con espacios → **Verificar**: Auto-limpiado o error

**Resultado esperado**: Validaciones previenen datos inválidos

---

## FASE 7: Sync de Métricas (Crons)

### Test 7.1 — sync-shopify-metrics manual
**Archivo**: `sync-shopify-metrics.ts`

**Pasos:**
1. Obtener `connectionId` de una conexión activa en Supabase
2. Obtener JWT token del usuario:
```bash
# Login para obtener token
curl -X POST 'https://zpswjccsxjtnhetkkqde.supabase.co/auth/v1/token?grant_type=password' \
  -H 'apikey: eyJhbGci...' \
  -H 'Content-Type: application/json' \
  -d '{"email":"jmbarros@bgconsult.cl","password":"TU_PASSWORD"}'
```
3. Llamar sync:
```bash
curl -X POST https://steve-api-850416724643.us-central1.run.app/api/sync-shopify-metrics \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_AQUI" \
  -d '{"connectionId":"CONNECTION_ID_AQUI"}'
```
4. **Verificar response**: `{"success":true,"ordersCount":N,"daysProcessed":N,"currency":"CLP"}`
5. **Verificar en Supabase**: `platform_metrics` tiene registros recientes con `connection_id` correcto
6. **Verificar `last_sync_at`**: Se actualizó en `platform_connections`

**Resultado esperado**: Métricas sincronizadas, todo en CLP

### Test 7.2 — Rate limiting de sync
**Pasos:**
1. Ejecutar Test 7.1
2. Inmediatamente ejecutar de nuevo (antes de 5 min)
3. **Verificar response**: `429` con mensaje "espera X segundos"

**Resultado esperado**: Rate limit funciona

### Test 7.3 — sync-all-metrics (cron completo)
**Pasos:**
```bash
curl -X POST https://steve-api-850416724643.us-central1.run.app/api/cron/sync-all-metrics \
  -H "Content-Type: application/json" \
  -H "X-Cron-Secret: TU_CRON_SECRET"
```
**Verificar**:
- Response incluye todas las conexiones procesadas
- Logs muestran sync de cada plataforma (Shopify, Meta, Google, Klaviyo)
- No hay errores 500 en los sub-calls

**Resultado esperado**: Sync completo sin errores

### Test 7.4 — weekly-report
**Pasos:**
```bash
curl -X POST https://steve-api-850416724643.us-central1.run.app/api/cron/weekly-report \
  -H "Content-Type: application/json" \
  -H "X-Cron-Secret: TU_CRON_SECRET"
```
**Verificar**:
- Response incluye `merchant_emails_sent`
- **Verificar email**: Revisa inbox de los merchants → email con ventas semanales
- **Verificar `qa_log`**: Registro `weekly_merchant_report` insertado

**Resultado esperado**: Emails enviados con datos de Shopify

---

## FASE 8: Webhooks

### Test 8.1 — Fulfillment webhook
**Archivo**: `shopify-fulfillment-webhooks.ts`

**Pasos** (desde Shopify Admin):
1. Ir a una tienda conectada en Shopify Admin
2. Crear un pedido de prueba
3. Marcar como "Fulfilled"
4. **Verificar Cloud Run logs**: `Webhook orders/fulfilled received` y procesado
5. **Verificar Supabase**: `platform_metrics` tiene nuevo registro `fulfilled_orders`

**Alternativa manual (con HMAC):**
```bash
PAYLOAD='{"id":999,"fulfillment_status":"fulfilled","total_price":"15000","currency":"CLP"}'
SECRET="tu-shopify-client-secret"
HMAC=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -binary | base64)

curl -X POST https://steve-api-850416724643.us-central1.run.app/api/shopify-fulfillment-webhooks \
  -H "Content-Type: application/json" \
  -H "x-shopify-hmac-sha256: $HMAC" \
  -H "x-shopify-topic: orders/fulfilled" \
  -H "x-shopify-shop-domain: jardindeeva.myshopify.com" \
  -d "$PAYLOAD"
```

**Resultado esperado**: 200 OK, métrica registrada

### Test 8.2 — GDPR app/uninstalled
**Pasos:**
1. **NO HACER EN PRODUCCIÓN** — Solo verificar que el endpoint responde
2. Enviar webhook simulado con HMAC válido:
```bash
PAYLOAD='{"myshopify_domain":"test-store.myshopify.com"}'
SECRET="tu-shopify-client-secret"
HMAC=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -binary | base64)

curl -X POST https://steve-api-850416724643.us-central1.run.app/api/shopify-gdpr-webhooks \
  -H "Content-Type: application/json" \
  -H "x-shopify-hmac-sha256: $HMAC" \
  -H "x-shopify-topic: app/uninstalled" \
  -H "x-shopify-shop-domain: test-store.myshopify.com" \
  -d "$PAYLOAD"
```
3. **Verificar**: 200 OK, logs muestran "Connection deactivated" (o "shop not found" si no existe)

**Resultado esperado**: Responde 200 sin crashear. NO probar shop/redact con tienda real.

### Test 8.3 — Webhook con HMAC inválido
**Pasos:**
```bash
curl -X POST https://steve-api-850416724643.us-central1.run.app/api/shopify-fulfillment-webhooks \
  -H "Content-Type: application/json" \
  -H "x-shopify-hmac-sha256: HMAC_FALSO_abc123" \
  -H "x-shopify-topic: orders/fulfilled" \
  -d '{"id":1}'
```
**Verificar**: 401 Unauthorized (HMAC inválido rechazado)

**Resultado esperado**: Seguridad HMAC funciona

### Test 8.4 — Checkout webhook (carros abandonados)
**Archivo**: `shopify-checkout-webhook.ts`

**Pasos** (desde Shopify):
1. En una tienda conectada, agregar productos al carrito
2. Ir a checkout, llenar datos pero NO completar la compra
3. **Esperar ~5 minutos** (Shopify envía webhook `checkouts/create`)
4. **Verificar Supabase**: `shopify_abandoned_checkouts` tiene nuevo registro con:
   - `customer_phone` (si se ingresó)
   - `line_items` con productos
   - `total_price`
   - `wa_reminder_sent = false`

**Resultado esperado**: Checkout capturado correctamente

---

## FASE 9: Carros Abandonados + WhatsApp

### Test 9.1 — Cron de WhatsApp reminders
**Archivo**: `abandoned-cart-wa.ts`

**Prerequisitos**:
- Tienda con checkout abandonado hace >1 hora
- Cliente con `wa_automations` activa tipo `abandoned_cart`
- Créditos WA disponibles (`wa_credits.balance > 0`)
- Cuenta Twilio configurada

**Pasos:**
```bash
curl -X POST https://steve-api-850416724643.us-central1.run.app/api/cron/abandoned-cart-wa \
  -H "X-Cron-Secret: TU_CRON_SECRET"
```
**Verificar**:
- Response muestra carros procesados
- **Supabase**: `shopify_abandoned_checkouts.wa_reminder_sent = true`
- **Supabase**: `wa_credits.balance` decrementó en 1
- **Supabase**: `wa_messages` tiene registro del mensaje
- **WhatsApp**: Cliente recibió mensaje (verificar en Twilio logs)

**Resultado esperado**: Mensaje WhatsApp enviado, créditos descontados

### Test 9.2 — Sin créditos WA
**Pasos:**
1. Temporalmente poner `wa_credits.balance = 0` para un cliente
2. Ejecutar cron
3. **Verificar**: Carro se salta (skipped), NO se envía mensaje
4. **Restaurar** balance original

**Resultado esperado**: No se envía sin créditos, no crash

---

## FASE 10: Colecciones

### Test 10.1 — Listar colecciones
**Archivo**: `useShopifyCollections` hook → `fetch-shopify-collections`

**Pasos:**
1. En algún componente que use colecciones (Campaign Studio > selección de productos)
2. **Verificar**: Lista de colecciones con nombre, tipo (custom/smart), producto count
3. Click en una colección → **Verificar**: Productos dentro de esa colección cargan

**Resultado esperado**: Colecciones reales de la tienda

---

## FASE 11: Crons de QA

### Test 11.1 — Detective visual (Shopify products)
**Archivo**: `detective-visual.ts`

**Pasos:**
```bash
curl -X POST https://steve-api-850416724643.us-central1.run.app/api/cron/detective-visual \
  -H "Content-Type: application/json" \
  -H "X-Cron-Secret: TU_CRON_SECRET"
```
**Verificar**:
- Response incluye `shopify-products` en `by_module`
- Precio de productos Steve = precio de productos Shopify
- Si hay mismatch → tarea creada automáticamente

**Resultado esperado**: Auditoría de consistencia ejecutada

### Test 11.2 — Reconciliation (product drift)
**Archivo**: `reconciliation.ts`

**Pasos:**
```bash
curl -X POST https://steve-api-850416724643.us-central1.run.app/api/cron/reconciliation \
  -H "Content-Type: application/json" \
  -H "X-Cron-Secret: TU_CRON_SECRET"
```
**Verificar**:
- Response incluye check `shopify_product_drift`
- Status `pass` si todo ok, `warn` si hay drift
- **Verificar `qa_log`**: Registro de reconciliation insertado

**Resultado esperado**: No hay drift entre Steve y Shopify

---

## FASE 12: Session Validation (App embebida)

### Test 12.1 — Shopify Session Token
**Archivo**: `shopify-session-validate.ts`

**Pasos** (solo si hay app embebida instalada):
1. Abrir la app desde Shopify Admin
2. **Verificar Network**: Request a `/api/shopify-session-validate` retorna 200
3. **Verificar**: Response incluye `access_token` y `refresh_token` para Supabase session
4. **Verificar**: El usuario queda logueado en el iframe

**Resultado esperado**: Session bridge funciona entre Shopify y Supabase

---

## FASE 13: Store Credentials (Per-client mode)

### Test 13.1 — Guardar credenciales propias del merchant
**Archivo**: `store-shopify-credentials.ts`

**Pasos:**
1. Como admin, llamar al endpoint con credenciales de prueba:
```bash
curl -X POST https://steve-api-850416724643.us-central1.run.app/api/store-shopify-credentials \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_ADMIN" \
  -d '{
    "clientId": "CLIENT_ID",
    "installLink": "https://admin.shopify.com/store/test-store/oauth/install?client_id=fake123",
    "shopifyClientSecret": "shpss_fake_secret_for_testing",
    "shopDomain": "test-store.myshopify.com"
  }'
```
2. **Verificar Supabase**: `platform_connections` tiene:
   - `shopify_client_id = 'fake123'`
   - `shopify_client_secret_encrypted` NOT NULL
   - `is_active = false` (se activa después de OAuth)
3. **Limpiar**: Borrar el registro de prueba

**Resultado esperado**: Credenciales encriptadas y guardadas

---

## FASE 14: Preview de Productos (Hook)

### Test 14.1 — useShopifyPreviewProducts
**Archivo**: `useShopifyPreviewProducts.tsx`

**Pasos:**
1. Navegar a un componente que use el hook (landing, campaign builder)
2. **Si hay conexión activa**: Muestra productos reales con imagen, título, precio
3. **Si NO hay conexión**: Muestra 6 productos demo de skincare
4. **Verificar**: `isRealData` flag correcto en cada caso

**Resultado esperado**: Fallback a demo products funciona

---

## FASE 15: E2E Tests (Automatizados)

### Test 15.1 — Ejecutar suite existente
**Archivos**: `e2e/qa-metrics-shopify.spec.ts`, `e2e/qa-run-shopify.spec.ts`

**Pasos:**
```bash
cd /Users/josemanuelpc/betabg
npx playwright test e2e/qa-run-shopify.spec.ts --headed
npx playwright test e2e/qa-metrics-shopify.spec.ts --headed
```
**Verificar**:
- 38 test cases pasan
- Screenshots guardados en caso de fallo
- No hay timeouts en carga de datos

**Resultado esperado**: Suite verde completa

---

## Orden de ejecución recomendado

| Prioridad | Fase | Tiempo estimado | Dependencia |
|---|---|---|---|
| 1 (BLOCKER) | Verificar env vars (Prereq A) | 5 min | Nada |
| 2 (CRÍTICO) | Fase 1: OAuth Flow | 20 min | Env vars OK |
| 3 (ALTO) | Fase 2: Dashboard | 15 min | OAuth OK (conexión activa) |
| 4 (ALTO) | Fase 3: Productos | 10 min | Conexión activa |
| 5 (MEDIO) | Fase 5: Pedidos | 5 min | Conexión activa |
| 6 (MEDIO) | Fase 4: Clientes | 5 min | Conexión activa |
| 7 (MEDIO) | Fase 6: Descuentos | 10 min | Conexión activa |
| 8 (MEDIO) | Fase 7: Sync métricas | 10 min | Conexión activa + CRON_SECRET |
| 9 (BAJO) | Fase 8: Webhooks | 15 min | SHOPIFY_CLIENT_SECRET |
| 10 (BAJO) | Fase 9: WhatsApp carts | 10 min | Twilio + créditos WA |
| 11 (BAJO) | Fase 10: Colecciones | 5 min | Conexión activa |
| 12 (BAJO) | Fase 11: Crons QA | 10 min | CRON_SECRET |
| 13 (BAJO) | Fase 12: Session (embebida) | 10 min | App instalada en Shopify |
| 14 (BAJO) | Fase 13: Per-client creds | 5 min | Admin token |
| 15 (BAJO) | Fase 14: Preview hook | 3 min | Nada |
| 16 (VALIDACIÓN) | Fase 15: E2E suite | 10 min | Todo lo anterior |

**Tiempo total estimado: ~2.5 horas**

---

## Checklist de bugs conocidos a verificar

- [ ] OAuth state mismatch (FIX APLICADO en esta branch)
- [ ] resolveShopifyCredentials sin fallback (FIX APLICADO)
- [ ] platform_connections update sin record previo (FIX APLICADO)
- [ ] Email/password en URL params (OAuthShopifyCallback.tsx) — riesgo de seguridad
- [ ] Phone normalization en abandoned-cart-wa.ts — agrega `+` sin country code
- [ ] Credit deduction no atómica en abandoned-cart-wa.ts
- [ ] ConnectShopify.tsx redirect nunca se resetea si falla
- [ ] fetch-shopify-discounts y create-shopify-discount no tienen authMiddleware
