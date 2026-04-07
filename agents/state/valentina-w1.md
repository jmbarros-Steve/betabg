# Valentina W1 — Estado Actual

**Última sesión:** 2026-04-08

## Trabajo completado hoy (sesión con JM)

### Tarea 6 — Verificación brandColor en GrapesEmailEditor ✅
- Confirmado que `brandColor` prop fluye end-to-end desde GrapesEmailEditor → grapes-steve-blocks.ts → grapes-theme.ts.
- Los bloques custom (producto, botón, cupón) heredan el color del cliente correctamente.

### Tarea 7 — Auditoría y fix de iframes en client-portal/email/ ✅
Quitado `allow-scripts` del sandbox en 6 iframes (6 ubicaciones, 4 archivos):
- `CampaignBuilder.tsx` — 2 iframes de preview
- `FlowBuilder.tsx` — 2 iframes de preview
- `UniversalBlocksPanel.tsx` — 1 iframe de preview de bloque
- `ClickHeatmapPanel.tsx` — 1 iframe de heatmap. **Además** reemplazado el bloque `<script>` que bloqueaba navegación por CSS `pointer-events: none` (sandbox sin allow-scripts requiere fix sin JS).

Todos ahora usan `sandbox="allow-same-origin"` sin scripts.

### Tarea 8 — Mobile responsive de templates de flow ✅
**Problema:** templates de Jardín de Eva son fragmentos HTML (sin `<!DOCTYPE>`/`<head>`) — carecen de viewport meta + @media queries → mobile rotos.

**Fix sistémico:** agregado `ensureMobileWrap()` en `cloud-run-api/src/lib/email-html-processor.ts` como paso 5 del pipeline. Detecta fragmentos vs documentos completos y envuelve los fragmentos con HTML5 full doc: viewport meta + CSS base @media ≤600px (tablas al 100%, imgs fluidas, padding adaptado, headings escalados, `.steve-mobile-stack`). No toca templates que ya son documentos completos.

Cubre los 3 templates de Jardín de Eva sin tocarlos + previene el problema en futuros templates generados por AI.

### Tarea 9 — email_send_queue roto (0 filas) ✅ código listo, deploy pendiente

**Diagnóstico:**
- `email_send_queue` = 0 filas. `email_events` sent = 37. Campañas enviadas = 4/8.
- **Causa raíz:** nadie llamaba al `enqueue`. `manage-campaigns.ts:378-436` y `flow-engine.ts:288` usaban `sendSingleEmail` directo. La cola era **código 100% huérfano** (lib + tabla + rate limit + retry + smart send implementados, sin llamadores ni cron processor).
- Implicancias: sin rate limit por cliente, sin crash-recovery, sin smart send time, sin retry, sin cancelación mid-send.

**Decisión arquitectural con JM:** Plan A con feature flag (rollout gradual).

**Implementación entregada:**

1. **Migración SQL** (`supabase/migrations/20260408100000_email_send_queue_feature_flag.sql`)
   - `ALTER TABLE email_send_settings ADD COLUMN use_send_queue BOOLEAN NOT NULL DEFAULT false;`
   - Default false → preserva comportamiento actual para todos los clientes.

2. **Handler cron** (`cloud-run-api/src/routes/cron/email-queue-tick.ts`)
   - Query distinct client_id con items `status='queued' AND scheduled_for <= now()`.
   - Para cada cliente llama internamente a `emailSendQueue({action:'process', client_id})`.
   - Secuencial entre clientes para no saturar Resend. Auth: X-Cron-Secret.

3. **Ramificación en `manage-campaigns.ts`**
   - Lee `email_send_settings.use_send_queue` para el cliente al inicio de `send`.
   - Helper nuevo `enqueueCampaignItems()` que inserta en chunks de 500.
   - Path normal: si flag ON → personaliza (Nunjucks + processEmailHtml) + encola todos los items + deja `campaign.status='sending'` (el cron lo pasará a 'sent'). Si OFF → loop directo original.
   - Path A/B: refactoré `processAndSend` extrayendo `personalizeForSub`. Si flag ON → encola variantes A y B con `ab_variant` marcado. Si OFF → envío directo original.
   - El Cloud Task de winner se sigue agendando igual (no cambia).

4. **flow-engine.ts NO ramificado** (decisión defensiva). Razones: emails de flow son 1-a-1 por Cloud Task, ya están throttled, crash-recovery viene de Cloud Tasks retry, encolar introduce latencia sin beneficio. El flag solo aplica a campañas bulk.

5. **Endpoint montado** en `index.ts:523` como `POST /api/cron/email-queue-tick`.

**TypeScript compila limpio**. NO se ha commiteado ni pusheado ni deployado.

### Code review ciclo 1: RECHAZADO (Isidora W6)
- C1 CRITICAL: send-queue.ts process nunca transicionaba status → campaña eterna en 'sending'.
- M1 MAJOR: A/B QUEUE marcaba 'sent' con sent_count=0.
- M2 MAJOR: items stuck en 'processing' sin recovery.
- M3 MAJOR: email-queue-tick serial → timeout >60s con >15 clientes.
- M4 MAJOR: ensureMobileWrap detección laxa (includes sin anclar).

### Code review ciclo 2: APROBADO CON OBSERVACIONES (Isidora W6)
Fixes aplicados:
- **C1** — `send-queue.ts process`: itera todos los campaign_ids distintos, query `stillPending` (queued+processing). Solo setea `status='sent'` cuando stillPending=0. sent_count siempre actualizado.
- **M1** — `manage-campaigns.ts` A/B: bifurcación QUEUE/DIRECT. QUEUE deja `status='sending'` (deja que C1 sweep lo cierre). DIRECT mantiene comportamiento original. `scheduleAbTestWinner` con margen +10 min en QUEUE.
- **M2** — `send-queue.ts`: al mover a 'processing' setea `processed_at=now()` (last-touched marker). `email-queue-tick.ts`: pre-sweep antes del loop que resetea items con `status='processing' AND processed_at < now()-30min` → 'queued', reporta `recovered_stuck`.
- **M3** — `email-queue-tick.ts`: `CONCURRENCY=5` constante, `Promise.allSettled` sobre chunks. Capacidad ~50 clientes/tick. Sin deps externas.
- **M4** — `email-html-processor.ts ensureMobileWrap`: regex anclado `/^<!doctype\s/i` sobre `trimStart()` + `<html[\s>]/i` + `<head[\s>]/i` + `<body[\s>]/i`. Idempotente, no matchea `<header>`.

TypeScript compila limpio. Sin regresiones detectadas. Observaciones menores no bloqueantes:
- Smart-send bypass en A/B QUEUE path (preexistente, no introducido por fixes).
- `client_id='unknown'` cuando Promise.allSettled rechaza (cosmetic debug).
- Sweep error solo logueado, sin Sentry capture.
- `STUCK_PROCESSING_MINUTES=30` podría ser env-configurable a futuro.

**Listo para commit** con `Reviewed-By: Isidora W6`.

**Follow-up Javiera W12 (S-1)**: crear migración separada antes de GA para `REVOKE UPDATE (use_send_queue) ON email_send_settings FROM authenticated;`.

## Pasos de activación pendientes (requieren autorización JM)

1. **Aplicar migración SQL:**
   ```bash
   cd ~/betabg && npx supabase db push
   ```

2. **Deploy backend Cloud Run:**
   ```bash
   cd ~/betabg/cloud-run-api && gcloud run deploy steve-api --source . --project steveapp-agency --region us-central1
   ```

3. **Crear job Cloud Scheduler (después del deploy):**
   ```bash
   gcloud scheduler jobs create http email-queue-tick-1m \
     --schedule="* * * * *" \
     --uri="https://steve-api-850416724643.us-central1.run.app/api/cron/email-queue-tick" \
     --http-method=POST \
     --headers="X-Cron-Secret=steve-cron-secret-2024,Content-Type=application/json" \
     --location=us-central1 --project=steveapp-agency
   ```

4. **Activar flag para cliente de prueba:**
   ```sql
   UPDATE email_send_settings SET use_send_queue = true WHERE client_id = '<tu_client_id>';
   ```

5. **Prueba e2e:** mandar campaña real de ~10 subs, verificar:
   - `email_send_queue` tiene 10 filas `status='queued'` después del envío.
   - Después de ≤1 min, las filas pasan a `status='sent'`.
   - `email_events` event_type='sent' tiene 10 nuevos registros.
   - `email_campaigns.sent_count` = 10.

6. **Rollout gradual:** activar flag por cliente; si todo va bien 1 semana, eventualmente deprecar el path directo.

## Problemas conocidos pendientes (no tocados esta sesión)
- Cloud Tasks IAM: `steve-api` service account sin permiso `cloudtasks.tasks.create` → flows solo se auto-programan si el IAM está OK (Sebastián W5).
- Shopify `write_discounts` scope: no verificado en Jardín de Eva.
- **Deuda técnica heredada de Rodrigo:** `KlaviyoPlanner.tsx` iframe sin sandbox (coordinar).

## Coordinación cruzada activa con Rodrigo W0 (semana 07/04)

Rodrigo confirmó 3 puntos — sin conflicto:
1. `klaviyo_metrics_cache` solo FK a `clients(id)`, sin relación con email_send_queue.
2. Fix variables Klaviyo limitado a UI, no toca `email-html-processor.ts` ni `flow-engine.ts`.
3. Sandbox iframes de Rodrigo limitado a `campaign-studio/templates/ImportKlaviyoDialog.tsx`, NO toca `client-portal/email/`.

**Mi Task 7 cubrió client-portal/email/** — 6 iframes + 1 script replaced. No choca con Rodrigo.

## Files modificados esta sesión
- `cloud-run-api/src/lib/email-html-processor.ts` — ensureMobileWrap()
- `cloud-run-api/src/routes/email/manage-campaigns.ts` — enqueueCampaignItems() + feature flag ramification
- `cloud-run-api/src/routes/cron/email-queue-tick.ts` — NEW
- `cloud-run-api/src/routes/index.ts` — import + mount cron
- `src/components/client-portal/email/CampaignBuilder.tsx` — 2 iframe sandbox fix
- `src/components/client-portal/email/FlowBuilder.tsx` — 2 iframe sandbox fix
- `src/components/client-portal/email/UniversalBlocksPanel.tsx` — 1 iframe sandbox fix
- `src/components/client-portal/email/ClickHeatmapPanel.tsx` — 1 iframe sandbox fix + CSS pointer-events (no script)
- `supabase/migrations/20260408100000_email_send_queue_feature_flag.sql` — NEW
- `agents/state/valentina-w1.md` — este archivo
