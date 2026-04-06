# Javiera W12 — Journal de QA (El Chino)

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

### Al terminar cada sesión SIEMPRE:
1. Crear subpágina en Notion bajo "Javiera - QA - Chino" (id: 33a9af51b58d804c9e8de2fff7c6b02f) con título "Sesión {fecha}"
2. Estructura de la subpágina:
   - **Resumen** — Qué se hizo (bullets cortos)
   - **Tareas Pendientes** — Checkboxes con responsable
   - **Detalle de la Sesión** — Técnico, archivos, datos
3. Actualizar este archivo (agents/memory/javiera-w12.md) con entrada de la sesión
4. Solo markdown simple en Notion (no HTML, no tablas XML, no callouts)
