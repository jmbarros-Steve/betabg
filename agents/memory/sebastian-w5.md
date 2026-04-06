# Sebastián W5 — Journal / Memory

## Protocolo de cierre de sesión (OBLIGATORIO)

Al terminar cada sesión:
1. Actualizar `agents/state/sebastian-w5.md` (completado, pendientes, blockers)
2. Crear página en Notion bajo https://www.notion.so/33a9af51b58d81649825c7323af6f4b9 con estructura:
   - Título: "Sesión DD/MM/AAAA"
   - Icono: 🗓️
   - Secciones: Resumen | Tareas Pendientes (checkboxes) | Detalle de la Sesión
3. Guardar en este journal con el mismo detalle

---

## Sesión 06/04/2026

### Resumen
Sesión de infra enfocada en auditoría y estabilización del sistema. Se detectaron y corrigieron múltiples problemas críticos: sub-router de crons (211 rutas excedían el límite de Hono), conteo erróneo de errores en weekly-report, falsos positivos en health-check slow_endpoint, y token de Apify vencido. Se desplegaron 10 edge functions faltantes, se eliminó integración Skyvern sin uso, y se activó el health-check cada 5 minutos via Cloud Scheduler.

### Tareas Pendientes al cierre

- [ ] M4: Variables de entorno pendientes (GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, SHOPIFY_WEBHOOK_SECRET) — esperando credenciales del usuario
- [ ] learning_queue: 4 items stuck >48h (IDs: f496b327, acd26a34, 0da5e133, 0649f9e0) — investigar y limpiar
- [ ] root-cause-analysis: falla al parsear JSON de Claude — el query a DB ya funciona, falla el paso AI
- [ ] Crear agente para steve_fix_queue (tarea delegada de Javiera W12)
- [ ] Limpiar ~1000 entradas duplicadas en criterio_results (deduplicación por check_number)

### Detalle de la Sesión

#### M1 — Cron Sub-Router (404 silencioso)
El app Hono tenía 211 rutas, superando el límite del RegExpRouter (~200). Los crons como `prospect-rotting-detector` retornaban 404 sin error visible. Fix: mover todos los crons a un sub-router `const cron = new Hono()` registrado como `app.route('/api/cron', cron)`.

#### M2 — Weekly-Report (414 errores falsos)
El query contaba TODOS los registros de `qa_log` sin filtrar por status. Fix: `.in('status', ['fail', 'warn', 'error', 'auto_fixed'])`. Resultado: 414 → 12 errores reales.

**Desglose real de errores:**
- circuit-breaker ×3 (Meta rate limit 01/04, auto-recuperado)
- funnel_diagnosis ×1 (conversión baja legítima)
- competitor_spy ×1 (APIFY_TOKEN vencido — corregido)
- changelog_watcher ×4 (mismo token — corregido)
- reconciliation:stuck_tasks ×2 (learning_queue)
- slow_endpoint ×1 (cold start falso positivo — corregido)

#### M3 — Edge Functions Audit
70 desplegadas vs 62 locales. Se encontraron:
- 15 funciones Meta legacy (migradas a Cloud Run — ignorar)
- 3 funciones de LogisticSteve (proyecto distinto — ELIMINADAS: ml-search-categories, ml-create-item, publish-to-channels)
- 10 funciones locales sin desplegar → DESPLEGADAS

#### M4 — APIFY_TOKEN vencido
Token anterior expirado. Nuevo token actualizado en Cloud Run via `--update-env-vars`. Verificado con competitor-spy y changelog-watcher.

#### M5 — Health-Check activado
Edge function `health-check` desplegada. Cron `health-check-5min` creado en Cloud Scheduler (cada 5 min). Monitorea 11 endpoints, crea tasks en fallos, auto-restart en 2+ fallos consecutivos.

**Fix slow_endpoint:** Los 401 de cold start se marcaban como lentos. Fix: agregar `r.status < 400` al filtro slow.

#### Skyvern — Eliminado
Integración de automatización de browser AI. 0 tasks activas, nunca usado en producción. Eliminado: cron job, route, import, archivo handler.

#### Commits de la sesión
- `9ccc7d1` — fix: cron sub-router, approve-knowledge, column names, TS errors
- `85be220` — fix: weekly-report errors_this_week only counts non-pass entries
- `381434a` — fix: weekly-report errors exclude info status
- `82873c2` — fix: health-check slow_endpoint ignores 4xx responses
- `796e4a1` — fix: deploy 10 missing edge functions + chino QA improvements
- `0c5b0ff` — remove: Skyvern integration (not in use, no active tasks)

---

## Aprendizajes técnicos

### Hono RegExpRouter limit
- Límite: ~200 rutas en el router principal
- Síntoma: rutas silenciosamente 404 sin error en logs
- Fix estándar: sub-routers `const cron = new Hono()` → `app.route('/api/cron', cron)`

### health-check slow_endpoint
- 4xx en cold start son esperados (auth no configurada en test) — NO son lentos
- Solo marcar slow si `r.ok && r.status < 400 && r.time_ms > 3000`

### Supabase CLI local
- No está instalado globalmente — usar `/tmp/supabase` (descargado de GitHub releases)
- Deploy: `/tmp/supabase functions deploy <name> --no-verify-jwt --project-ref zpswjccsxjtnhetkkqde`

### Cloud Run env vars
- NUNCA usar `--set-env-vars` (reemplaza todas)
- SIEMPRE usar `--update-env-vars`
- Verificar post-deploy con el script del CLAUDE.md

### qa_log status types
- Válidos: `pass`, `info`, `warn`, `fail`, `auto_fixed`, `error`
- "Errores reales" = solo `fail`, `warn`, `error`, `auto_fixed`
- `pass` e `info` son operacionales normales, NO errores
