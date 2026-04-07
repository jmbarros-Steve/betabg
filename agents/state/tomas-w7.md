# Tomás W7 — Steve AI / Cerebro
Squad: Producto | Última sesión: 2026-04-07

## Estado actual: Bugs críticos del Brain ARREGLADOS y validados E2E

### Sesión 2026-04-07 (activación por Javiera W12)

#### Bugs resueltos en `knowledge-quality-score.ts`
- [x] **Bug #1**: el SELECT línea 18 NO traía `quality_score`, así que el reduce final con operator precedence siempre evaluaba a NaN→0. Reemplazado por `totalScore` local incrementado dentro del loop.
- [x] **Bug #2**: tras auto-rewrite con Haiku, hardcodeaba `quality_score: 60`. Ahora re-evalúa con `computeQualityScore` sobre el `improvedContent`.
- [x] **Refactor**: extraída la fórmula scoring (5 criterios × 20pts) a función pura `computeQualityScore(contenido, ejemploReal, vecesUsada, createdAt, now)`.
- [x] **Cross-review Isidora W6**: APROBADO 10/10 puntos checklist. 3 minor non-blocking observations registradas para PRs futuros.
- [x] **Commit `0423c57`** pusheado a `origin/main` (Vercel auto-deploy frontend, no aplica porque solo es backend).
- [x] **Deploy Cloud Run**: revision `steve-api-00398-gdx` sirviendo 100% tráfico.
- [x] **Validación E2E**: invocación manual del cron retornó `{"totalScored":1000,"avgScore":53,"improved":0,"deactivated":0}`. Histórico:
  - 2026-04-05: avg_score=0 ❌
  - 2026-04-06: avg_score=0 ❌
  - 2026-04-07 (post-fix): **avg_score=53** ✅

#### Plan purga zombis (RECHAZADO por Javiera W12)
- [x] Diseñé SQL `DELETE FROM steve_knowledge WHERE activo=false AND veces_usada=0 AND ultima_vez_usada IS NULL` (688 filas candidatas según count REST).
- [x] Cross-review Javiera W12: **RECHAZADO** con 1 BLOCKER + 2 MAJOR + 2 MINOR.
  - **BLOCKER**: FK `juez_golden_questions.source_knowledge_id → steve_knowledge.id` SIN `ON DELETE CASCADE`. El DELETE bulk abortaría toda la transacción si alguna zombi tiene golden_question apuntándola.
  - **MAJOR #2**: el filtro captura zombis "recuperables" del cron `knowledge-decay` (180d sin update → desactiva). Política actual = desactivar reversible, no borrar irreversible.
  - **MAJOR #3**: dedup conserva `merged_from` como strings (titulos), no ids. Borrar destruye trazabilidad.
  - **MINOR #4**: RLS `steve_knowledge` exige `is_super_admin` o service_role.
  - **MINOR #5**: `criterio_rules.source_knowledge_id` y `creative_analyses.original_knowledge_id` quedarían huérfanos (UUIDs sin FK).
- [x] **Plan aprobado por Javiera**: **SOFT-DELETE en 2 fases**:
  1. **Fase 1**: `ALTER TABLE steve_knowledge ADD COLUMN purged_at TIMESTAMPTZ` + `UPDATE` marcando con filtro restrictivo (`approval_status IN (rejected, pending) AND created_at < NOW()-30d AND NOT EXISTS golden_questions`).
  2. **Fase 2** (cron mensual nuevo): hard-delete reglas con `purged_at < NOW()-30d`, con rescate posible durante esa ventana.
- [ ] **Aplicar Fase 1**: requiere autorización explícita de JM (task #19).

### Trabajo deferred a próximas sesiones (priorizado)

#### Task #19: Aplicar soft-delete fase 1
- Requiere: aprobación JM + migration formal `20260407XXXXXX_steve_knowledge_purged_at.sql`
- Cross-review: Javiera W12 (SQL/integridad)
- Modificar `knowledge-loader.ts` (línea 25-34) para excluir `purged_at IS NOT NULL` (cross-review Isidora W6)
- Crear cron `knowledge-hard-purge-monthly` para fase 2

#### Task #18: Plan batch approval 1041 pending rules
**Estrategia diseñada (no implementada):**
- Edge function `steve-batch-approve-knowledge` con Claude Haiku (`claude-haiku-4-5-20251001`)
- Procesa lotes de 50 reglas via prompt:
  ```
  Para cada regla, evalúa:
  1. Formato: ¿tiene CUANDO/HAZ/PORQUE? (sí/no)
  2. Especificidad: ¿incluye números, %, días o thresholds? (sí/no)
  3. Accionabilidad: ¿cambia una decisión concreta? (sí/no)
  4. Categoría: ¿coincide con `categoria` declarada? (sí/no)
  Output JSON: { id, decision: 'approve'|'reject'|'human_review', reason }
  ```
- Reglas con 4/4 sí → auto-approve
- Reglas con 3/4 sí → human_review
- Reglas con ≤2/4 sí → auto-reject
- Cross-review: Isidora W6 (lógica del prompt + edge cases) + Javiera W12 (UPDATE bulk seguro)
- Costo estimado: 1041 reglas × ~500 tokens prompt + 200 tokens response = ~730k tokens Haiku ≈ $0.80 USD

#### Otras tareas pendientes (orden de prioridad)
- [ ] **Popular `ejemplo_real`** desde `steve_messages` históricos. Sube ceiling de quality_score de 75 a 95. Estrategia: cron mensual que mappea conversaciones donde una regla se inyectó → guarda primer mensaje user/assistant exitoso como ejemplo.
- [ ] **Reactivar feedback loop**: `steve_feedback` tiene 0 filas. Verificar UI thumbs up/down en `SteveChat.tsx` → POST a `/api/steve-feedback`. Cron que use feedback para ajustar `effectiveness_score`.
- [ ] **Investigar `steve_working_memory = 0`**: identificar qué cron debía poblarla, está dead?
- [ ] **Investigar por qué `improved: 0` en mi run**: el cron procesó 1000 reglas con 391 active <20, esperaba que Haiku mejorara varias. Posibles causas: ANTHROPIC_API_KEY no seteada en steve-api-00398-gdx, o `try{}catch{}` traga errores. Verificar Sentry.

### Estado actual del Brain (post-fix)
- **Total reglas**: 2096
  - 1400 activas (66.8%)
  - 696 inactivas (33.2%)
- **Activas**: 391 con score <20 (28%), 257 con score >=60 (18%)
- **Pending approval**: 1041 (50% de TODO el knowledge sin revisar)
- **Tablas vacías**: `steve_working_memory=0`, `steve_feedback=0`
- **Quality score promedio (cron real, no DB stale)**: **53/100**
- **Cloud Run revision**: `steve-api-00398-gdx`

### Notas operacionales
- Reviewers obligatorios: Isidora W6 (backend/frontend logic), Javiera W12 (SQL/edge functions/seguridad)
- Cross-reviews APROBADOS esta sesión: Isidora W6 (knowledge-quality-score fixes)
- Cross-reviews RECHAZADOS esta sesión: Javiera W12 (purga DELETE pura)
- Commits propios: `0423c57` (fix knowledge-quality-score)
