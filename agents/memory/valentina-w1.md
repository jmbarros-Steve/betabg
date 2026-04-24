# Valentina W1 — Journal (Steve Mail)

Journal acumulativo: decisiones arquitecturales, patrones aprendidos, desacuerdos registrados. Crece siempre.

---

## Decisiones arquitecturales

### D-01 — Feature flag `use_send_queue` con rollout gradual (08/04, sesión mañana)
**Decisión con JM:** Plan A. La cola de envío se activa por cliente vía `email_send_settings.use_send_queue` (default `false`). Preserva comportamiento legacy mientras se valida la cola.
**Por qué:** el código de la cola estaba 100% huérfano (lib + tabla + rate limit + retry + smart send implementados, sin llamadores). Encender todo de una era inseguro.
**Consecuencia operativa:** `manage-campaigns.ts` tiene bifurcación QUEUE/DIRECT en campañas normales + A/B. El path A/B refactoró `processAndSend` extrayendo `personalizeForSub` para reuso.

### D-02 — NO ramificar `flow-engine.ts` con el feature flag (08/04, sesión mañana)
**Decisión defensiva:** el feature flag solo aplica a campañas bulk. Flows NO usan la cola.
**Razones:** (1) emails de flow son 1-a-1 por Cloud Task, (2) ya están throttled, (3) crash-recovery viene de Cloud Tasks retry, (4) encolar introduce latencia sin beneficio.

### D-03 — Activar `use_send_queue=true` por default para nuevos clientes (08/04, sesión tarde)
**Mecánica:** backfill de filas existentes + trigger `default_use_send_queue` que setea `true` en nuevos inserts a `email_send_settings`.
**Limitación:** la tabla está VACÍA en prod, así que el backfill no afectó a nadie y el trigger solo dispara al primer insert real. La activación full sigue bloqueada hasta que producto decida el trigger de onboarding que crea la primera fila.

### D-04 — Smart send time en ruta directa (no solo en la cola) (08/04, sesión tarde)
**Decisión:** agrupar subscribers por `send_time_hour` ANTES del loop de envío. Los que matchean hora UTC actual → envío directo. Los demás → diferidos via `email_send_queue` con `scheduled_for`.
**Por qué:** si la cola está off para un cliente, el smart send NO debería romperse. Evita que clientes LATAM reciban mails a las 3am.

### D-05 — Timezone por subscriber con default `America/Santiago` (08/04, sesión tarde)
**Decisión:** columna nueva `email_subscribers.timezone` + `flow-engine` usa `Intl.DateTimeFormat` para comparar con `quiet_hours_start/end`.
**Fallback:** si no hay TZ, asume `America/Santiago` (sesgo LATAM — Steve opera mayormente en Chile/LATAM).

### D-06 — Refactor `CampaignBuilder.tsx` (1865 LOC) por fases, sin borrar legacy (08/04)
**Regla de oro:** NO borrar código del archivo original hasta que su reemplazo esté testeado en producción.
**Fase 1 (hecha):** types e interfaces a `campaign-builder/types.ts`, constants a `campaign-builder/constants.ts`, README con plan 5 fases.
**Fases 2-5 (pendientes):** hooks, sub-componentes, state reducer, testing.

### D-07 — Tabla `steve_alerts` separada de `steve_fix_queue` y `steve_bugs` (08/04)
**Decisión:** nueva tabla para alertas operacionales (bounce spikes, sync failures, stuck queues).
**Por qué:** `steve_fix_queue` es para QA/El Chino, `steve_bugs` para bugs reportados. Hacía falta un bucket para alertas operacionales con severidad + acknowledge tracking.

---

## Patrones aprendidos (reusables)

### P-01 — `safeQueryOrDefault` para destructuring defensivo
Patrón del audit de deuda técnica de Isidora W6 (07/04). `const { data } = ...` sin chequear `error` ni `null` causa 500s cosméticos. Uso: `await safeQueryOrDefault(supabase.from(...).select(...), [], 'nombreFn.descripcion')`. Silencia errores transitorios devolviendo el default. Migrados 14 archivos `email/` en sesión 08/04.

### P-02 — `ensureMobileWrap()` en `email-html-processor.ts` (paso 5 del pipeline)
Templates generados por AI son fragmentos HTML (sin `<!DOCTYPE>`, sin `<head>`). Sin viewport meta + @media queries → mobile roto.
**Detección:** regex anclado `/^<!doctype\s/i` sobre `trimStart()` + `<html[\s>]/i` + `<head[\s>]/i` + `<body[\s>]/i`. Idempotente, NO matchea `<header>`.
**Wrap:** HTML5 full doc con viewport meta + CSS base @media ≤600px (tablas 100%, imgs fluidas, padding adaptado, headings escalados, `.steve-mobile-stack`).

### P-03 — Optimistic lock en send-queue
`UPDATE email_send_queue SET status='processing' WHERE id=X AND status='queued'`. Solo procesa items efectivamente reclamados. Combinado con `processed_at=now()` como last-touched marker → permite sweep de stuck items (`status='processing' AND processed_at < now()-30min` → reset a `queued`).

### P-04 — `crypto.timingSafeEqual` para HMAC
Nunca `===` para comparar firmas HMAC. Vulnerable a timing attacks. Aplicado en `send-email.ts` (webhook signature de Resend).

### P-05 — RLS con `is_super_admin` boolean, NUNCA `role='super_admin'`
El enum `app_role` NO tiene `'super_admin'`. Intentar `(role = 'admin' OR role = 'super_admin')` → Postgres rechaza `invalid input value for enum app_role`. Patrón correcto (como `20260325_academy_tables.sql`): `(role = 'admin' OR is_super_admin = true)`.
**Incidente:** primer push de `steve_alerts` falló por esto, corregido en commit `d7c1334`.

### P-06 — Dedup de alertas por hora en triggers
`alert_on_bounce_spike` no puede spammear. Check previo: "¿hubo alerta del mismo `source` y `client_id` en la última hora?". Si sí → no insert.

### P-07 — Patrón check-first en vez de blind upsert para GDPR
Antes de enrolar un subscriber en un flow: SELECT su `status`. Si `unsubscribed` o `opted_out` → no enrolar. Blind upsert violaba GDPR (enrolaba gente que ya había dicho "no").

### P-08 — `[[DISCOUNT_CODE]]` en vez de `{{ discount_code }}` para placeholders post-Nunjucks
Nunjucks corre primero y convierte `{{ discount_code }}` a string vacío si no está en el contexto. El procesador de HTML que inyecta el código real de Shopify nunca lo ve. Uso `[[DISCOUNT_CODE]]` (Nunjucks-safe) + inyección post-Nunjucks.

### P-09 — Sin `allow-scripts` en iframes de preview de email
6 iframes de `client-portal/email/` (CampaignBuilder, FlowBuilder, UniversalBlocksPanel, ClickHeatmapPanel) ahora usan `sandbox="allow-same-origin"` solo. Donde había `<script>` bloqueando navegación (click heatmap), reemplazado por CSS `pointer-events: none`.

---

## Desacuerdos registrados (protocolo de desafío)

### C-01 — `email_send_settings` vacía bloquea el rollout
> "Valentina desaprueba que `email_send_settings` esté vacía en producción y bloquee el rollout de toda la infra de cola. La decisión pendiente es de producto, no técnica: ¿quién crea la primera fila? ¿El onboarding de cliente? ¿Un seed automático con defaults sensatos? Sin esto, las 8 mejoras están deployed pero el P0-1 sigue dormante para los clientes existentes (solo aplica a nuevos inserts via trigger)."
**Estado:** activo. Necesita decisión de producto.

### C-02 — Cross-review pendiente sobre 2 sesiones acumuladas
Tanto sesión 08/04 (8 mejoras) como 09/04 (Audit Fix) tienen Isidora W6 + Javiera W12 pendientes. Self-review no reemplaza cross-review obligatorio.
**Riesgo:** acumular más cambios sin review aumenta superficie de regresión.

---

## Bugs previos corregidos (histórico)

### Sesión 06/04 — Flow de carrito abandonado Jardín de Eva
Test real: 3 emails delivered a jm@steve.cl con imágenes Shopify + logo + botones funcionales. Deploy `steve-api-00389-b55`.

1. **Logo nunca aparecía** — `flow-engine.ts` pasaba `enrollment.metadata?.brand || {}`. Webhooks Shopify NO incluyen `brand`. Fix: SELECT `logo_url, brand_color, brand_secondary_color, brand_font, website_url, shop_domain` desde tabla `clients` para construir `clientBrandInfo`.
2. **`scheduleFlowStep` re-lanzaba 500** aunque email ya enviado. Cloud Tasks IAM `PERMISSION_DENIED` (bug Sebastián W5). Fix: catch ya no re-lanza, solo loguea. Endpoint retorna 200.
3. **Idempotency roto bloqueaba re-enrollment** — check buscaba `subscriber_id + flow_id + step_path` sin filtrar por enrollment ni fecha. Fix: `.gte('created_at', enrollment.enrolled_at)`.
4. **Merge tags con una sola llave** — `{ first_name }` en templates. Nunjucks requiere `{{ }}`. Fix: PATCH directo a HTML de 3 steps en `email_flows`.
5. **Templates sin bloque de logo** — header hardcodeado "Jardín de Eva" sin imagen. Fix: bloque condicional `{% if brand.logo_url %}<img src="{{ brand.logo_url }}">{% endif %}`.

### Sesión 08/04 mañana — email_send_queue pipeline
Diagnóstico: `email_send_queue` = 0 filas, `email_events` sent = 37, campañas enviadas = 4/8. Causa raíz: nadie llamaba al `enqueue`. `manage-campaigns.ts:378-436` y `flow-engine.ts:288` usaban `sendSingleEmail` directo. Cola era código 100% huérfano.

Code review Isidora ciclo 1 — RECHAZADO con 5 hallazgos:
- C1 CRITICAL: `send-queue.ts process` nunca transicionaba status → campaña eterna en `sending`
- M1: A/B QUEUE marcaba `sent` con `sent_count=0`
- M2: items stuck en `processing` sin recovery
- M3: `email-queue-tick` serial → timeout >60s con >15 clientes
- M4: `ensureMobileWrap` detección laxa (includes sin anclar)

Todos fixeados en ciclo 2 → APROBADO CON OBSERVACIONES.

### Sesión 08/04 tarde — rollout 8 mejoras
3 intentos de `db push` fallaron antes del éxito:
1. "Remote migration versions not found in local" (versiones phantom `20260321`, `20260322`, `20260325`) → `migration repair --status reverted` + `db push --linked --include-all`
2. `invalid input value for enum app_role: "super_admin"` en RLS → commit `d7c1334` usando `is_super_admin` boolean
3. Éxito: 5 migraciones aplicadas

2 intentos de `gcloud run deploy` antes del éxito:
1. Build OK pero deploy raro (posibles deploys paralelos creando revisions 00420-00423)
2. Éxito: revision `steve-api-00425-9p8` al 100%

`git stash pop` tuvo conflictos `UU` en `CampaignBuilder.tsx` y `generate-email-content.ts` (stash con versiones obsoletas UnlayerEditor / Unlayer JSON). Resueltos con `checkout --ours` manteniendo HEAD (GrapesJS + MJML).

---

## Archivos críticos bajo mi ownership

- **Más pesados:** `CampaignBuilder.tsx` (81KB / 1865 LOC), `flow-webhooks.ts` (32KB), `flow-engine.ts` (31KB), `manage-campaigns.ts` (29KB), `email-html-processor.ts` (25KB), `campaign-analytics.ts` (20KB), `revenue-attribution.ts` (16KB), `ab-testing.ts` (12KB)
- **Compartidos con Rodrigo W0:** `email_campaigns`, `email_send_queue`, `email_templates` — riesgo de ownership conflict, coordinar cambios
- **Crons:** `wolf-morning-send-9am` (`0 9 * * *`) + `wolf-night-mode-3am` (`0 3 * * *`) + `email-queue-tick-1m` (`* * * * *`, nuevo sesión 08/04)
