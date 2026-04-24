# Valentina W1 — Estado Actual

**Última sesión:** 2026-04-09 (Audit Fix Email)
**Sesión previa:** 2026-04-08 (8 mejoras Steve Mail)
**Reviewed-By:** Claude self-review (Isidora W6 + Javiera W12 pendientes sobre ambas sesiones)

---

## Trabajo completado sesión 09/04 — Audit Fix Email (7 archivos)

Auditoría de seguridad. **Antes:** 16 bugs (1 CRITICAL, 7 HIGH, 8 MEDIUM). **Después:** 0 pendientes.

1. **GDPR compliance** — `flow-webhooks.ts:493` → patrón check-first en vez de blind upsert (respeta opt-out del suscriptor antes de enrolar).
2. **Timing-safe HMAC** — `send-email.ts:46` → `crypto.timingSafeEqual` en vez de `===` (previene timing attacks en webhook signature).
3. **Optimistic lock** — `send-queue.ts:170` → `UPDATE ... WHERE id=X AND status='queued'` (solo procesa items efectivamente reclamados; evita double-send en races).
4. **XSS prevention** — `unsubscribe.ts:82` → `escapeHtml()` en output HTML (página de desuscripción era vulnerable).
5. **Cron auth** — handlers `winback` + `birthday` → `X-Cron-Secret` check (antes: endpoints abiertos).
6. **SNS validation** — `track-events.ts` → valida estructura del mensaje SNS antes de procesar.
7. **authMiddleware sweep** — verificado en todas las rutas email.

---

## Trabajo completado sesión 08/04 — 8 mejoras Steve Mail

**Commits:** `0614d65` + `d7c1334` (33 archivos, +3237/-503). **Deploy:** revision `steve-api-00425-9p8` al 100%. **Migraciones:** 5 (`20260408140000` → `20260408140400`).

| # | Tarea | Status |
|---|------|--------|
| P0-1 | Backfill `email_send_settings.use_send_queue=true` + trigger `default_use_send_queue` | ✅ |
| P0-2 | Smart send en ruta directa (agrupa por `send_time_hour`, difiere via queue aunque flag off) | ✅ |
| P0-3 | Quiet hours TZ-aware en `flow-engine` (`Intl.DateTimeFormat`, col `email_subscribers.timezone`) | ✅ |
| P1-4 | Comentario SES→Resend corregido en `send-email.ts` | ✅ |
| P1-5 | Tabla `email_industry_benchmarks` + seeds + `EmailAnalytics.tsx` lee desde DB | ✅ |
| P1-6 | Refactor `CampaignBuilder.tsx` (1865 LOC) — Fase 1/5 (types + constants extraídos) | ✅ |
| P2-7 | `GET /api/email-queue-health` + `QueueHealthDashboard.tsx` (tab "Cola" super-admin) | ✅ |
| P2-8 | Tabla `steve_alerts` + trigger `alert_on_bounce_spike` (>5% bounce última hora) | ✅ |
| safe-supabase | Migración defensiva de 14 archivos `email/` (patrón audit deuda técnica 07/04) | ✅ |

---

## Trabajo completado sesión previa 08/04 (mañana) — feature flag email_send_queue

Commit `312a8d5` — código listo + deploy. Migración `20260408100000_email_send_queue_feature_flag.sql` aplicada vía `migration repair --status reverted 20260321 20260322 20260325`.

- `manage-campaigns.ts` ramificado con feature flag `use_send_queue` (campañas normales + A/B)
- `email-queue-tick.ts` NEW — cron con `CONCURRENCY=5` + `Promise.allSettled`, sweep de stuck items `processing > 30 min` → `queued`
- `send-queue.ts` process: itera todos los `campaign_id` distintos, transición `status='sent'` solo cuando `stillPending=0`
- `ensureMobileWrap()` en `email-html-processor.ts` — detecta fragmentos HTML vs docs completos, envuelve con viewport + @media queries
- 6 iframes `client-portal/email/` — removido `allow-scripts` del sandbox (CampaignBuilder, FlowBuilder, UniversalBlocksPanel, ClickHeatmapPanel con CSS `pointer-events:none` en vez de script)
- Cloud Scheduler `email-queue-tick-1m` ENABLED

**Code review Isidora W6:** ciclo 1 RECHAZADO (5 hallazgos) → fixes aplicados → ciclo 2 APROBADO CON OBSERVACIONES.

---

## Verificación Pendiente

### Crítico (bloquea activación full)
- [ ] **Activar `use_send_queue=true` en primer cliente real** — sigue bloqueado: `email_send_settings` está **vacía en prod** (0 filas). El trigger de default solo aplica a nuevos inserts. Pending decisión de producto: ¿qué onboarding crea la primera fila?
- [ ] **E2E test del trigger `alert_on_bounce_spike`** — simular 20+ sends con >5% bounces para ver entry en `steve_alerts`
- [ ] **Verdict de `queue-health` con datos reales** — ahora devuelve `ok` cosméticamente porque no hay tráfico en la cola

### Reviews pendientes
- [ ] **Isidora W6** — backend (queue-health, smart send directo, quiet hours TZ-aware) + frontend (QueueHealthDashboard 323 LOC)
- [ ] **Javiera W12** — RLS de `steve_alerts`, trigger `alert_on_bounce_spike`, índices `email_industry_benchmarks`
- [ ] **Javiera W12 S-1** — migración separada antes de GA: `REVOKE UPDATE (use_send_queue) ON email_send_settings FROM authenticated;`

### UX / QA
- [ ] **Mobile responsive de QueueHealthDashboard** en iPhone SE (regla #1 de Valentina)
- [ ] **Testear desuscripción con caracteres especiales** (verificar escapeHtml)
- [ ] **Verificar winback/birthday rechazan llamadas sin CRON_SECRET**
- [ ] **Confirmar SNS validation no rechaza mensajes legítimos**

### Deuda técnica (no bloquea)
- [ ] **CampaignBuilder.tsx Fases 2-5** — hooks, sub-componentes, state reducer, testing. Regla de oro: NO borrar código legacy hasta que reemplazo esté testeado en prod
- [ ] **Smart-send bypass en A/B QUEUE path** (preexistente, no introducido)
- [ ] **Sentry capture en sweep error** de `email-queue-tick.ts` (cosmetic)
- [ ] **`STUCK_PROCESSING_MINUTES=30`** env-configurable

---

## Problemas conocidos pendientes (externos a Valentina)

- **Cloud Tasks IAM** — `steve-api` service account sin `cloudtasks.tasks.create` → flows no se auto-programan (Sebastián W5)
- **Shopify `write_discounts` scope** — no verificado en Jardín de Eva → step 3 del carrito abandonado podría fallar
- **Deuda heredada Rodrigo W0** — `KlaviyoPlanner.tsx` iframe sin sandbox

---

## Coordinación cruzada activa

### Rodrigo W0 (semana 07-09/04) — sin conflicto
1. `klaviyo_metrics_cache` solo FK a `clients(id)`, sin relación con email_send_queue
2. Fix variables Klaviyo limitado a UI, no toca `email-html-processor.ts` ni `flow-engine.ts`
3. Sandbox iframes de Rodrigo limitado a `campaign-studio/templates/ImportKlaviyoDialog.tsx` (NO `client-portal/email/` que cubrí yo)

### Isidora W6 — review pendiente sobre sesiones 08/04 y 09/04
### Javiera W12 — review SQL pendiente + S-1 REVOKE UPDATE

---

## Infraestructura operativa — estado dormante

- **`use_send_queue` feature flag** — deployed, cron vivo (`email-queue-tick-1m` cada minuto, HTTP 200 consistente), pero `{processed_clients:0, total_sent:0}` porque no hay cliente con settings. Infra lista para arrancar en cuanto exista la primera fila.
- **Trigger `default_use_send_queue`** — activará por default solo a NUEVOS clientes (los existentes necesitan UPDATE manual o backfill).
- **Trigger `alert_on_bounce_spike`** — vivo, esperando tráfico con bounce rate >5%.

---

## Archivos modificados sesión 09/04
- `cloud-run-api/src/routes/email/flow-webhooks.ts` — GDPR check-first
- `cloud-run-api/src/routes/email/send-email.ts` — timingSafeEqual
- `cloud-run-api/src/routes/email/send-queue.ts` — optimistic lock
- `cloud-run-api/src/routes/email/unsubscribe.ts` — escapeHtml
- `cloud-run-api/src/routes/email/winback.ts` — cron secret
- `cloud-run-api/src/routes/email/birthday.ts` — cron secret
- `cloud-run-api/src/routes/email/track-events.ts` — SNS validation
