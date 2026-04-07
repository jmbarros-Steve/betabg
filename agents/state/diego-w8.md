# Diego W8 — Database & Data Pipeline
Squad: Infra | Última sesión: 2026-04-07

## Misión actual: FASE 1 — Alimentar las fuentes de datos

### Objetivo
Que la data fluya: las tablas de fuentes tienen datos, los crons no fallan silently, y hay un pipeline verificado end-to-end.

### Tareas pendientes

#### 1. Investigar 27 sources en cero (EN PROGRESO — diagnóstico en curso)
- [x] Instrumentar content-hunter con fail-point logging (2026-04-07, commit 1afb64c)
- [x] Fix bug: `last_content_id` solo avanza cuando `rulesExtracted > 0` (Isidora W6 catch)
- [x] Reset `last_content_id` + `last_checked_at = NULL` para las 27 sources en cero → fuerza re-proceso
- [ ] **ESPERANDO DATA**: próximos 1-2h el cron de 20min re-procesará las 27 y los fails quedarán en `qa_log` con `check_type='content_hunt_source_fail'` y `error_type` agrupable
- [ ] Correr query: `SELECT error_type, COUNT(*) FROM qa_log WHERE check_type='content_hunt_source_fail' AND checked_at > NOW() - INTERVAL '3 hours' GROUP BY error_type ORDER BY COUNT(*) DESC`
- [ ] Atacar cada causa (probablemente: YouTube sin transcripts, websites JS-rendered, Apify timeouts)

#### 2. ~~Poblar swarm_sources~~ ✅ COMPLETADO (2026-04-05)
- [x] 53 fuentes insertadas por categoría

#### 3. BLOQUE C — Verificación (PARCIAL)
- [x] C.4 (`src/lib/healing-locator.ts`): EXISTE — self-healing Playwright locators con fallback chain
- [x] C.5 (`cloud-run-api/src/routes/cron/auto-rule-generator.ts`): EXISTE + ruta registrada en `routes/index.ts:508`
- [x] C.6 (`cloud-run-api/src/routes/cron/rule-calibrator.ts`): EXISTE + ruta registrada en `routes/index.ts:507` + scheduler `rule-calibrator-sun-3am` ENABLED
- [ ] **🔴 FALTA**: C.5 NO tiene Cloud Scheduler job. Existe el código, existe la ruta, pero nadie lo llama. Crear scheduler
- [ ] Verificar que C.6 realmente está calibrando reglas (qa_log en 0 entries de `rule-calibrator`)

#### 4. Verificar integridad de crons (PENDIENTE)
- [ ] Crear query que revise los últimos 7 días de qa_log por cron
- [ ] Identificar crons que corren pero no hacen nada (silent failures)
- [ ] Verificar que swarm_runs debería tener ~84/semana pero solo tiene 40 total

#### 5. Verificar triggers y funciones DB (PENDIENTE)
- [ ] Listar todos los triggers activos en Supabase
- [ ] Verificar que el auth trigger funcione (handle_new_user)
- [ ] Verificar RLS policies no bloqueen los crons

### Completado esta sesión (2026-04-07)
- [x] Investigación: 59 enabled sources, **32 extraen reglas, 27 en cero** (NO era solo Future Commerce como decía el state viejo)
- [x] Fix content-hunter: agregado `logSourceFail()` helper, instrumentados 7 fail points (text_too_short, ai_http_NXX, ai_parse_error, ai_not_array, ai_returned_empty, content_exception, outer_exception)
- [x] Fix bug crítico: `last_content_id` solo avanza cuando `rulesExtracted > 0` (si no, sources fallando quedaban silently skipped forever)
- [x] Cross-review con Isidora W6: 1ra versión RECHAZADA (3 blockers), 2da APROBADA
- [x] Deploy Cloud Run: revision `steve-api-00391-kfx` 100% traffic, 23/20 env vars
- [x] Commit `1afb64c` pusheado a `betabg/main`
- [x] Reset de 27 sources en cero para habilitar diagnóstico real
- [x] Verificado BLOQUE C: C.4, C.5, C.6 código y rutas existen (pero C.5 sin scheduler)

### Completado sesiones previas
- [x] Poblar steve_sources — 59 fuentes (2026-04-04)
- [x] Poblar swarm_sources — 53 fuentes (2026-04-05)
- [x] swarm_runs funcionando — 40/40 completed (100%)

### Blockers (2026-04-07 post-sesión)
- ~~🔴 PAT GitHub expuesto en `.git/config`~~ → MOVIDO a macOS Keychain (`git credential-osxkeychain store`). El URL del remote `origin` ya no tiene el token en plain text. **AÚN ASÍ JM debe rotar el PAT en GitHub UI** — GitHub secret scanning lo detectó durante este mismo push y sigue válido
- ~~🟡 Remote `origin` mal apuntado a claude-memory~~ → FIXED. Eliminé el origin viejo, renombré `betabg` → `origin` apuntando a `jmbarros-Steve/betabg.git`
- **🟡 Archivos modificados ajenos** en working tree (Valentina W1: email routes, Javiera W12: state) — no los toqué, no son de Diego. 6 estaban pre-staged por sesiones previas, tuve que unstage-arlos para no arrastrarlos en mis commits

### Notas
- Supabase ref: zpswjccsxjtnhetkkqde
- Cloud Run: steve-api (project steveapp-agency, us-central1)
- Cloud Scheduler: `steve-content-hunter-20min` ENABLED (corre cada 20 min), `rule-calibrator-sun-3am` ENABLED (domingos 3am UTC)
- 975 knowledge rules existen, 493 criterio rules
- Top performers: Barry Hott (79), Foreplay (58), SEJ (51), Retail Dive (46), Future Commerce (42), Julian Shapiro (42), HubSpot Blog (42)
