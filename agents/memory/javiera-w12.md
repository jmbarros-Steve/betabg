# Javiera W12 — Journal de QA (El Chino)

## 2026-04-07 — Pipeline Auto-Fix RESUCITADO + OJOS Ampliado

### Contexto
Regreso del descubrimiento del 2026-04-06. Un día después: lo que encontré ayer no era "1000 fixes stuck", era **2682 entries para 449 checks únicos (5.9x duplicación)** + un bug tipográfico crítico en `fixer.ts:226` que mataba el pipeline completo.

### Los 2 bugs raíz del pipeline muerto

**Bug #1 — Typo en filtro de approval_status (`fixer.ts:226`)**
```typescript
// ANTES (roto):
.eq('approval_status', 'approved')
```
El runner crea fixes con `'auto_approved'` (auto-fix exitoso) o `'pending_approval'` (manual esperando humano). `FixApprovalPanel.tsx:169` sube los manuales aprobados a `'approved'`. Pero el filtro solo buscaba `'approved'` — valor que **nunca existía desde el runner**. Los auto-fixes quedaban invisibles para el STEP B de asignación. Pipeline muerto para auto-fixes, y también para manuales hasta que un humano los aprobara.

**Fix:**
```typescript
.in('approval_status', ['auto_approved', 'approved'])
```

**Bug #2 — Dedup incompleto en runner (`runner.ts:144`)**
El `enqueueFixIfNeeded()` solo deduplicaba contra status intermedios. Cada patrol creaba un fix nuevo para el mismo check → 5.9x duplicación. Mi **primer intento** (incluir `failed`/`fixed`/`escalated` en el filtro) fue RECHAZADO por Isidora W6: mataba permanentemente los checks que fallaban dos veces, sin posibilidad de re-detectar regresiones. **Fix final**: ventana temporal de 1h + status intermedios.

```typescript
const dedupWindow = new Date(Date.now() - 60 * 60_000).toISOString();
const { data: existingFix } = await supabase
  .from('steve_fix_queue')
  .select('id, status')
  .eq('check_id', check.id)
  .in('status', ['pending', 'assigned', 'fixing', 'deployed', 'verifying'])
  .gte('created_at', dedupWindow)
  .maybeSingle();
```

### Lecciones

1. **Los filtros contra valores enum son frágiles**: cambiar un string value en un lugar (runner) sin sincronizar con los consumidores (fixer, frontend) rompe pipelines silenciosamente. Idealmente: constantes compartidas en `types.ts`.

2. **Dedup permanente por status terminal es un antipatrón**: rompe la capacidad de re-detectar regresiones. La solución correcta es dedup por **ventana temporal** — si el mismo problema persiste después de 1h, es una regresión real que merece re-detección, no spam.

3. **Optimistic locking obligatorio en updates de queue**: race condition si dos crons corren (el de `chino-fixer` cada 10min y puede haber overlap). Patrón canónico:
   ```typescript
   .update({ status: 'assigned' })
   .eq('id', fix.id)
   .eq('status', 'pending')  // lock
   .select('id')
   .maybeSingle();
   ```

4. **Cross-review NO es opcional**: mi primera versión tenía 4 problemas (2 bloqueantes). Si no fuera por el protocolo obligatorio de CLAUDE.md, hubiera deployado código que dejaba MORIR permanentemente cualquier check que fallara dos veces. Isidora W6 me salvó.

### Nuevo sistema: chino-executor (delegado a Sebastián W5)

Mientras yo arreglaba los bugs, Sebastián W5 construyó en paralelo `cloud-run-api/src/routes/cron/chino-executor.ts` — 601 líneas, el componente que faltaba del pipeline.

**Arquitectura**:
- `POST /api/cron/chino-executor` (cada 15min via Scheduler)
- Toma fixes `assigned` (lock optimista `WHERE status='assigned'`)
- Claude Sonnet 4 planea un JSON `{can_fix, operations[]}`
- Valida TODAS las operations antes de aplicar ninguna
- **Whitelist** de 17 tablas mutables + **blacklist** defensa en profundidad
- Sin SQL crudo (todo via cliente Supabase con `.from().update/insert/delete()`)
- Escalación a JM via WhatsApp si `difficulty='manual'` + `files_to_check` (requiere código)
- Sin rollback parcial (documentado) — el fixer STEP A re-testeará

**Costo**: ~$5.76/día máximo (5 fixes × 4 runs/h × 24h × $0.012 Sonnet).

**Limitación intencional**: solo fixes de DATA. Los fixes que requieren cambios de código se escalan automáticamente a JM por WhatsApp. Sebastián eligió paranoia sobre cobertura.

### OJOS — Ampliación de cobertura

De 11 a 36 endpoints (14% → 52% sobre los 69 críticos). Agregué 25 nuevos cubriendo todos los squads:
- Core AI/Steve, Shopify, Meta Ads, Klaviyo, Google Ads, IG/FB, Steve Mail, WhatsApp, CRM.

**Patrón crítico aprendido**: todos los endpoints están protegidos por `authMiddleware` → el Bearer `ANON_KEY` devuelve 401 **antes** de ejecutar side-effects. Esto significa que puedo incluir endpoints "peligrosos" como `publish-instagram`, `send-email`, `wa-send-campaign` sin riesgo de ejecutarlos accidentalmente. El 401 cuenta como OK (`status < 500`). Los únicos que NO puedo incluir son:
- Webhooks públicos con HMAC (rechazan sin firma válida, irían a 400-401 igual, pero conceptualmente no es un health check útil)
- Endpoints sin auth que ejecutan side-effects (audit-store, self-signup, form-submit)
- Crons con `X-Cron-Secret`

Isidora W6 verificó los 36 uno por uno contra `routes/index.ts`. APROBADO.

### Estado final del queue (post todas las operaciones)
- **458 entries** total
- **245 failed**: data histórica de la sesión anterior marcada como stale — ya no se regeneran gracias al dedup de 1h
- **209 pending + pending_approval + difficulty=manual**: esperan aprobación humana de JM en FixApprovalPanel.tsx (fixes que requieren código)
- **4 escalated**: procesados por el executor en el primer smoke test, correctamente escalados

### Commits y deploys
- `fdb515a` — chino bugfixes + chino-executor (push a betabg)
- `1538ef7` — OJOS coverage 14→52% (push a betabg)
- Cloud Run: `steve-api-00391-kfx`
- Edge function `health-check` deployada en Supabase
- Scheduler nuevo: `chino-executor` (`*/15 * * * *`)
- Cross-reviews: Isidora W6 × 3 (fixer/runner, chino-executor, OJOS)

### Alertas operacionales descubiertas

1. **PAT GitHub expuesto en `.git/config`** — también flagged por Diego W8. CRÍTICO. Visible en ambos remotes.
2. **Remote `origin` apunta a claude-memory, no betabg** — pusheé a claude-memory accidentalmente primero. Workaround: usar `git push betabg main` explícito hasta que JM repare.
3. **19 tasks de squad "producto" acumuladas** sin dueño activo. OJOS las genera pero nadie las atiende.
4. **Valentina W1 tiene código sin deployar** en `email-html-processor.ts`, `manage-campaigns.ts`, `routes/index.ts`. Mi deploy NO lo incluye. Coordinar.

---

## 2026-04-06 — Hallazgo Crítico: steve_fix_queue sin ejecutor

### Contexto
Después de implementar los 798 checks de El Chino y lograr cobertura 100%, se descubrió que el pipeline de fix automático **no tiene quién ejecute los fixes**.

### El problema
El Chino tiene un pipeline completo de detección → fix → re-test → escalación:

```
Patrol (cada 2h) → Detecta FAIL → Genera fix con Claude Sonnet → Inserta en steve_fix_queue (pending)
Fixer (cada 10min) → Mueve pending → assigned
??? → Nadie toma los assigned → Nadie ejecuta el fix_prompt → Nada llega a deployed/fixed
```

### Datos duros (6 abril 2026)
- **1.000 fixes en steve_fix_queue** — TODOS en status `assigned`
- **0 fixes** en `fixed`, `deployed`, `escalated`, o cualquier otro status
- Checks con **100 fails consecutivos** (llevan fallando desde que se activaron)
- **Fixes duplicados**: check #710 tiene 5+ entries porque cada patrol crea uno nuevo
- El WhatsApp de escalación **nunca se dispara** porque nada llega al stage de re-test

### Qué funciona
- Patrol corre cada 2h ✅ (cron `chino-patrol`)
- Detección de fails ✅
- Generación de fix_prompt con Claude Sonnet ✅ (diagnósticos precisos)
- Fixer cron corre cada 10min ✅ (cron `chino-fixer`)
- Transición pending → assigned ✅

### Qué NO funciona
- **No hay agente/proceso que tome fixes `assigned` y los ejecute**
- **No hay deduplicación** — cada patrol crea fix nuevo para el mismo check
- **Escalación muerta** — el flujo assigned → fixing → deployed → re-test → escalate nunca se activa
- **Reporte periódico por WhatsApp** — probablemente no envía nada útil (todo queda en assigned)

### Quién debe resolverlo
- **Sebastián W5** (infra): Crear el proceso/cron que ejecute los fixes
- **Tomás W7** (cerebro): Orquestar qué agente toma cada fix según el módulo
- **NO es responsabilidad de QA** — Javiera detecta y reporta, no implementa

### Acciones recomendadas
1. **Deduplicación inmediata**: Antes de insertar en steve_fix_queue, verificar si ya hay uno `assigned` para el mismo check_number (el código tiene la lógica pero no filtra por check_number, solo por check_id)
2. **Agente ejecutor**: Un cron que tome fixes `assigned`, ejecute el fix_prompt (o lo delegue al agente dueño del módulo), y mueva a `deployed`
3. **Limpiar cola**: Hay 1.000 entries basura que nunca se van a ejecutar — purgar duplicados
4. **Cap de consecutive_fails**: Después de N fails sin fix, dejar de crear entries nuevas en la cola

### Archivos relevantes
- `cloud-run-api/src/chino/runner.ts` — función `enqueueFixIfNeeded()` (crea los fixes)
- `cloud-run-api/src/chino/fixer.ts` — función `runChinoFixer()` (mueve pending→assigned, re-testa deployed)
- `cloud-run-api/src/chino/fix-generator.ts` — genera fix_prompt con Claude Sonnet
- `cloud-run-api/src/chino/whatsapp.ts` — alertas WhatsApp (críticas + periódicas)

### Tabla afectada
- `steve_fix_queue`: columns `id, check_id, check_number, fix_prompt, probable_cause, files_to_check, status, attempt, agent_response, deploy_timestamp, retest_result, escalated, created_at`
- Status flow esperado: `pending → assigned → fixing → deployed → verifying → fixed | escalated`
- Status flow real: `pending → assigned → (muere aquí)`

---

## 2026-04-06 — Resumen de Patrol Post-Deploy

### Resultados
- **Total checks**: 798 implementados, ~778 ejecutados por patrol
- **pass**: 639 (63.9%)
- **fail**: 265 (26.5%) — categorizado en 5 grupos
- **error**: 70 (7.0%)
- **skip**: 19 (1.9%) — bajó de 835 (81.5%) a 19

### Categorías de fails
1. ~120 de endpoints que no existen (404) — 35 endpoints únicos documentados en Notion
2. ~28 de visual checks evaluando login/404 (no tienen auth_token configurado)
3. ~45 de cross-platform api_compare con lógica de comparación incorrecta
4. ~15 de Steve Chat devolviendo 400
5. ~30 problemas reales detectados por El Chino

### Fixes aplicados esta sesión
- Memory 2Gi → 4Gi (OOM por Chrome/Puppeteer)
- Timeout 300s → 900s (patrol toma ~21min)
- Browser concurrency lock (1 Chrome a la vez)
- 8 checks arreglados: #46, #51, #107, #110, #112, #115, #283, #446
- Klaviyo metrics persistence (7 checks se auto-resuelven post-sync)

### Documentación generada
- Notion: "Javiera - QA - Chino" (página padre con descripción del agente)
  - URL: https://www.notion.so/33a9af51b58d804c9e8de2fff7c6b02f
- Notion: "Sesión 6/04/2026" (subpágina con resumen, tareas, detalle)
  - URL: https://www.notion.so/33a9af51b58d81639854c2af289274e5
- MD local: agents/memory/javiera-w12.md (este archivo)

---

## Aprendizajes de Notion (MCP)

### Formato que SÍ funciona
- Markdown simple: `##`, `###`, `-`, `- [ ]`, `**bold**`, backticks
- Saltos de línea reales (no `\n` escapado)
- Listas con bullets para datos tabulares

### Formato que NO funciona
- Tablas HTML/XML (`<table>`, `<tr>`, `<td>`) → se renderizan como texto plano
- `<callout>`, `<details>` → también pueden fallar si los newlines no son reales
- `\n` como string literal en new_str → Notion los trata como texto, no como saltos de línea

### Operaciones aprendidas
- `replace_content` borra child pages si no incluyes `<page url="...">` en new_str
- `update_content` requiere match exacto del old_str (difícil con bloques vacíos)
- Para crear página standalone: omitir `parent` en create-pages
- Para crear bajo página padre: usar `parent: { page_id: "..." }`

### Estructura estándar de página de agente en Notion
Cada agente debe tener:
1. **Página padre**: "{Nombre} - {Área} - {Sistema}"
   - Descripción del agente (quién, qué, responsabilidad)
   - Sección "Sesiones" con links a subpáginas
2. **Subpáginas por sesión**: "Sesión {fecha}"
   - Resumen (qué se hizo)
   - Tareas Pendientes (checkboxes con responsable)
   - Detalle de la Sesión (técnico)

### Prompt para que otros agentes creen su espacio
Guardado y entregado a JM para Sebastián W5. Incluye reglas de formato (solo markdown simple, no HTML).

---

## Reglas Permanentes de Javiera W12

### Sesión 06/04/2026 — Cierre
- Git push: commit `645c094` en main
- Cloud Run deploy: revision `steve-api-00382-8q4` (100% tráfico)
- Env vars: 23/20 presentes
- Notion: página padre + sesión creadas y formateadas
- Prompt para Sebastián W5 entregado a JM
- Estado: todo deployado y documentado

### Al terminar cada sesión SIEMPRE:
1. Crear subpágina en Notion bajo "Javiera - QA - Chino" (id: 33a9af51b58d804c9e8de2fff7c6b02f) con título "Sesión {fecha}"
2. Estructura de la subpágina:
   - **Resumen** — Qué se hizo (bullets cortos)
   - **Tareas Pendientes** — Checkboxes con responsable
   - **Detalle de la Sesión** — Técnico, archivos, datos
3. Actualizar este archivo (agents/memory/javiera-w12.md) con entrada de la sesión
4. Solo markdown simple en Notion (no HTML, no tablas XML, no callouts)
