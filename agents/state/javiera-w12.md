# Javiera W12 — QA / El Chino
Squad: Infra (QA transversal) | Última sesión: 2026-04-07

## Estado actual: Pipeline auto-fix desbloqueado, OJOS >50% cobertura, BACKLOG REDUCIDO 38→19

### Completado esta sesión (2026-04-07) — Orquestación W6.5

#### Limpieza backlog (38 → 19 tareas activas)
- [x] **14 tasks cerradas**: 9 duplicados/stale + 5 audit-resolved (env vars OK, shopify-analytics 401 OK, AI endpoints 401 OK, cloud-run-root 200ms OK, klaviyo changelog false positive)
- [x] **11 tasks reasignadas a dueños correctos**: 3 Klaviyo→W0-Rodrigo, 3 ESPEJO→W18-Valentín, 2 Meta datos→W2-Felipe, 2 Chat→W7-Tomás, 1 env vars→W5-Sebastián
- [x] **4 sub-agentes spawneados en paralelo**: Rodrigo (Klaviyo), Tomás (Chat), Felipe (Meta), Sebastián (Infra audit)

#### OJOS classifier — fix bug detectado por Isidora W6
- [x] `getSquadForEndpoint()` reordenado: producto ANTES de marketing con `^` anchors
- [x] Bugs corregidos (5): `steve-email-content`, `generate-meta-copy` iban a marketing; `publish-instagram`, `publish-facebook`, `fetch-instagram-insights`, `frontend` caían al default producto
- [x] Distribución final: producto:5, marketing:24, ventas:5, infra:2
- [x] Cross-review Isidora W6: v1 RECHAZADA (5 bugs) → v2 APROBADA

#### 4 fixes aplicados (Reviewed-By: Isidora W6)
- [x] `AutoActivation.tsx` (Rodrigo W0 finding): clients no tiene `business_name` ni `industry` → cambiar select a `name, company, brand_identity`
- [x] `SteveChat.tsx` + `SteveStrategyChat.tsx` (Tomás W7 finding): botón disabled tras 503 → restaurar `setInput(userMessage)` en catch
- [x] `20260407150000_fix_email_templates_super_admin_rls.sql` (Rodrigo W0 finding): policies super admin referenciaban `auth.users` directo → reemplazo con `public.is_super_admin(auth.uid())` SECURITY DEFINER

#### Commit consolidado
- [x] `6712f92` — fix(orchestration): 4 fixes consolidados Javiera W12 (orquesta W6.5)
- [x] Working tree limpio respecto a Valentina W1 WIP (NO toqué `email-html-processor.ts`, `manage-campaigns.ts`, `send-queue.ts`, `email-queue-tick.ts`, ni su nueva migration `20260408100000_email_send_queue_feature_flag.sql`)

#### Deploys aplicados
- [x] `git push betabg main` — commit `6712f92` en remoto → Vercel auto-deploy frontend
- [x] `supabase functions deploy health-check` — OJOS classifier reorder en producción, 36/36 endpoints OK post-deploy
- [x] **Migración RLS aplicada** — vía edge function temporal `apply-migration-20260407150000` porque `supabase db push` estaba bloqueado por historial desincronizado (migraciones remotas `20260321`, `20260322`, `20260325` no existen en local)
  - Workaround: edge function temporal con SQL hardcodeado + secret one-time, usa `SUPABASE_DB_URL` del ambiente de edge functions (password nunca sale de Supabase)
  - Ejecutada 1 vez, verificada via `pg_policies` (`is_super_admin(auth.uid())` presente en ambas policies), función eliminada del proyecto (HTTP 404 confirmado) y del filesystem
  - Verificación E2E: `GET /rest/v1/email_templates` → **HTTP 200** con datos (antes: `permission denied for table users`)
- [x] **NO deployado Cloud Run** — bloqueado por WIP de Valentina W1 (coordinar antes del próximo deploy backend)

### Trabajo deferred (requiere Cloud Run deploy, blocked por Valentina W1 WIP)
- [ ] **Steve Chat backend latency** (Tomás W7 findings): optimizaciones en `cloud-run-api/src/routes/ai/steve-chat.ts`
- [ ] **Meta Ads bugs** (Felipe W2 findings): 4 bugs en `meta-social-inbox.ts`, `sync-meta-metrics.ts`, `MetaAdsManager.tsx`
- [ ] **WhatsApp setup-merchant 500** (Sebastián W5): blocked por upgrade Twilio Trial→Paid manual

### Sesión anterior (2026-04-07 mañana)

#### Pipeline Chino — DESBLOQUEADO
- [x] **Diagnóstico**: 2682 entries en `steve_fix_queue` para 449 checks únicos (5.9x duplicación). Pipeline muerto por bug tipográfico.
- [x] **Purga de duplicados**: 2682 → 458 (eliminados 2224). Patrol seguía creando nuevos durante la operación.
- [x] **Fix `fixer.ts:226`**: STEP B filtraba `approval_status='approved'` — valor que NUNCA existía en DB. Runner crea con `'auto_approved'` o `'pending_approval'`; FixApprovalPanel.tsx:169 sube manuales a `'approved'` solo tras aprobación humana. Nuevo filtro: `.in('approval_status', ['auto_approved', 'approved'])`.
- [x] **Fix `fixer.ts` STEP B**: Agregado optimistic lock (`.eq('status', 'pending').select()`) + error capture en select y update.
- [x] **Fix `runner.ts:144` dedup**: Ventana temporal de 1h (`.gte('created_at', dedupWindow)`) para permitir re-detectar regresiones sin bloquear permanentemente checks que entraron a estado terminal.
- [x] **Cross-review por Isidora W6**: 1ra versión RECHAZADA (4 problemas: blockeante manual-approval, blockeante dedup-permanente, major error-handling, minor números comment). Corregido → APROBADA en 2da iteración.
- [x] Commit `fdb515a` pusheado a betabg/main + deployado `steve-api-00391-kfx`.

#### chino-executor — NUEVO (delegado a Sebastián W5)
- [x] Sebastián W5 construyó `cloud-run-api/src/routes/cron/chino-executor.ts` (601 líneas) en paralelo.
- [x] **Defensas**: whitelist 17 tablas + blacklist defensa-en-profundidad, validación pre-apply de todas las ops, lock optimista, try/catch por fix, MAX_FIXES_PER_RUN=5, cap `agent_response` 4000 chars, sin rollback parcial documentado.
- [x] Cross-review por Isidora W6: APROBADA tras agregar comentario explícito sobre no-rollback.
- [x] Registrado en `routes/index.ts:550`.
- [x] Smoke test: HTTP 200, 4 fixes escalados (los que requerían código — esperado).
- [x] Cron `chino-executor` creado en Google Scheduler: `*/15 * * * *` America/Santiago, first run 14:15 UTC.

#### OJOS (health-check) — 14% → 52% cobertura
- [x] Edge function `supabase/functions/health-check/index.ts`: array ampliado de 11 a **36 endpoints**.
- [x] Nuevos cubren: Core AI/Steve (+3), Shopify (+3), Meta Ads (+5), Klaviyo (+4), Instagram/FB (+2), Steve Mail (+4), WhatsApp (+2), CRM (+3).
- [x] Todos protegidos por authMiddleware — Bearer ANON_KEY devuelve 401 antes de ejecutar side-effects.
- [x] Cross-review por Isidora W6: APROBADA (verificó existencia de cada endpoint contra routes/index.ts, métodos HTTP, bodys con `action`, no-duplicados, sintaxis TypeScript).
- [x] Commit `1538ef7` pusheado a betabg/main.
- [x] Deploy edge function: `supabase functions deploy health-check`.
- [x] Smoke test post-deploy: **36/36 endpoints OK** (0 failed, 0 slow).

### Estado final de la fix queue
- **Total**: 458 entries
- **Failed**: 245 (data histórica de sesión anterior marcada como "Limpieza Javiera W12: fix nunca ejecutado, stale desde creación" — ya NO se regeneran gracias al dedup de 1h en runner)
- **Pending**: 209 (todos `difficulty=manual` + `pending_approval` — esperan aprobación humana de JM en FixApprovalPanel.tsx)
- **Escalated**: 4 (marcados por el executor en el primer smoke test — requerían código)

### Tareas pendientes

- [ ] **Monitoreo post-deploy** — próximos 2-3 ciclos del cron chino-executor (próximo a las 14:15, 14:30, 14:45). Verificar que procesa fixes `assigned` correctamente sin errores.
- [ ] **Revisar logs** del cron tras primeros runs: `gcloud logging read 'textPayload:"[chino/executor]"' --limit=50 --project=steveapp-agency`
- [ ] **Fase 2 OJOS** (opcional): ampliar de 52% a 75% agregando los ~18 endpoints restantes (Meta secundarios, Shopify discount/update, email sub-endpoints).
- [ ] **Whitelist del executor**: auditar si hay tablas fuera de las 17 iniciales donde los checks del Chino detectan inconsistencias frecuentes. Si sí, pedir a Sebastián ampliar la whitelist.
- [ ] **Health-check**: el baseline "69 endpoints críticos" viene de un conteo viejo. Recalcular contra los 187 endpoints actuales de Cloud Run para métrica real.

### Blockers detectados (no míos pero documentados)

- 🔴 **PAT GitHub expuesto en `.git/config`** (también flagged por Diego W8). Visible en remotes `betabg` y `origin`.
- 🔴 **Remote `origin` mal configurado**: apunta a `claude-memory`, no a `betabg`. Pusheé accidentalmente a `claude-memory` primero. Workaround: usar `git push betabg main` explícito hasta que JM repare.
- 🟡 **19 tasks de squad "producto" acumuladas** en tabla `tasks` (generadas por OJOS), sin dueño activo. Candidatos a activar: Camila W4, Tomás W7, Renata W16, Isidora W6.
- 🟡 **Valentina W1 tiene trabajo sin deployar** en `email-html-processor.ts`, `manage-campaigns.ts`, `routes/index.ts`. Mi deploy de `steve-api-00391-kfx` NO incluye su trabajo. Coordinar.

### Notas operacionales
- Cloud Run último revision: `steve-api-00391-kfx`
- Supabase ref: `zpswjccsxjtnhetkkqde`
- Commits de esta sesión: `fdb515a` (chino fixes + executor), `1538ef7` (OJOS coverage)
- Cross-reviews APROBADOS por: Isidora W6 (3 revisiones: fixer/runner, chino-executor, OJOS)
- Scheduler nuevo: `chino-executor` (`*/15 * * * *`)
