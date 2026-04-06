# Valentina W1 — Estado Actual

**Última sesión:** 2026-04-06

## Trabajo completado hoy (sesión con JM)

### Bugs encontrados y corregidos en `flow-engine.ts`
1. **Logo nunca aparecía** — `enrollment.metadata?.brand` siempre vacío (webhooks no lo populan). Fix: SELECT logo_url + brand_color desde tabla `clients`. Deploy: rev 00385.
2. **`scheduleFlowStep` re-lanzaba error de Cloud Tasks** — causaba 500 aunque email ya enviado. Fix: catch ya no re-lanza. Deploy: rev 00389.
3. **Idempotency check roto** — verificaba `subscriber_id + flow_id + step_path` sin filtrar por enrollment. Al re-enrollar mismo subscriber en mismo flow, saltaba todos los pasos como "ya enviados". Fix: `.gte('created_at', enrollment.enrolled_at)`. Deploy: rev 00389.

### Bugs encontrados y corregidos en templates del flow de prueba
- `{ first_name }` y `{ cart.url }` con una sola llave — Nunjucks no los procesaba.
- Templates sin bloque logo (`{% if brand.logo_url %} <img> {% endif %}`).
- Fix: HTML de los 3 steps actualizados directamente en Supabase.

### Nuevo bloque GrapeJS en `grapes-steve-blocks.ts`
- `steve-cart-products`: bloque de carrito abandonado con `data-product-type="abandoned_cart"`
- `steve-coupon` actualizado: usa `[[DISCOUNT_CODE]]` (Nunjucks-safe) + `data-steve-discount="true"` + `data-discount-mode="shopify_create"`

### Fix en `email-html-processor.ts`
- Discount placeholder ahora soporta tanto `[[DISCOUNT_CODE]]` como `{{ discount_code }}`

### Prueba end-to-end completada
- Flow: `7fc2ebb2` (Jardín de Eva, 3 steps, abandoned cart)
- Subscriber: jm@steve.cl (José Manuel)
- Productos reales: Bugambilias desde Shopify CDN (raicesdelalma.myshopify.com)
- Logo real: jardindeeva.cl/cdn/shop/files/logo_vivero_...
- 3 emails delivered ✅, logo ✅, botones ✅, productos ✅

## Problemas conocidos pendientes
- `email_send_queue` = 0 filas — pipeline de envío roto (compartido con Rodrigo W0)
- Cloud Tasks IAM: `steve-api` service account sin permiso `cloudtasks.tasks.create` → flows solo pueden dispararse manualmente o via webhook (NO se auto-programan los pasos)
- Shopify `write_discounts` scope: no verificado si el token de raicesdelalma tiene este scope

## Tareas pendientes
- [ ] Verificar scope `write_discounts` en Shopify connection de Jardín de Eva
- [ ] Fix IAM para Cloud Tasks (Sebastián W5)
- [ ] Revisar mobile responsiveness de templates de flow
