# Tomás W7 — Steve AI / Cerebro
Squad: Producto | Última sesión: 2026-04-07

## Estado actual: Activado por Javiera W12 para arreglar el Brain (~30% quality score)

### Diagnóstico recibido (Javiera W12, 2026-04-07)
**Brain tables:**
- `steve_knowledge`: 2060 reglas (1055 approved, 1034 pending)
- `swarm_runs`: 62 (todos completed, 0 failed) — ya NO falla 95%
- `swarm_sources`: 53 (ya NO está en 0)
- `steve_sources`: 59
- `steve_messages`: 644, `steve_conversations`: 320
- `steve_episodic_memory`: 60
- `steve_working_memory`: **0** (VACÍO)
- `steve_feedback`: **0** (VACÍO)
- `learning_queue`: 9
- `steve_fix_queue`: 458 (post-purga Javiera)

**Quality scores:**
- avg total: 37.1/100
- avg active: 25.2/100
- Distribución: 0-19=27.4%, 20-39=1.6%, 40-59=58.7%, 60-79=12.3%, **80-100=0%**
- Hard ceiling de 75 pts porque `ejemplo_real` no se popula

### 7 fixes identificados (priorizados)

1. **[CRÍTICO] Fix `knowledge-quality-score.ts:126`** — el SELECT línea 18 no trae `quality_score`, el reduce reporta avg=0 siempre. Acumular `score` calculado dentro del loop.
2. **[CRÍTICO] Fix `knowledge-quality-score.ts:91`** — hardcodea `quality_score: 60` post-rewrite. Re-evaluar con la fórmula sobre el `improvedContent`.
3. **[ALTO] Purgar reglas inactivas/zombi** — 696 reglas inactivas + 274 con score <20. Borrar las que tienen `veces_usada=0` y >90d sin uso.
4. **[ALTO] Aprobar/rechazar 1034 pending knowledge rules** — batch con Claude Haiku, validar formato CUANDO/HAZ/PORQUE, especificidad.
5. **[MEDIO] Popular `ejemplo_real`** desde `steve_messages` históricos — sube ceiling de 75 a 95.
6. **[MEDIO] Reactivar feedback loop** — `steve_feedback` tiene 0 filas. Verificar UI thumbs up/down en Steve chat.
7. **[BAJO] Investigar `steve_working_memory = 0`** — qué cron debía poblarlo, está dead?

### Tareas en curso (esta sesión)
- [ ] Fix bug #1 (avg_score) — M1 Knowledge Base
- [ ] Fix bug #2 (hardcoded 60) — M1 Knowledge Base
- [ ] Cross-review con Isidora W6 (backend logic)
- [ ] Commit + push + deploy Cloud Run (coordinar con Valentina W1 — su WIP YA fue commiteado en `312a8d5`)
- [ ] Purga SQL de reglas zombi (con review de Javiera W12)
- [ ] Plan batch approval de 1034 pending (delegar a sub-agente con Haiku)

### Notas operacionales
- Cloud Run actual: `steve-api-00391-kfx` (deploy de Javiera W12 con chino fixes)
- Cloud Run desbloqueado: Valentina W1 commiteó su WIP en `312a8d5` (email_send_queue)
- Reviewers obligatorios: Isidora W6 (backend/frontend), Javiera W12 (SQL/edge functions)
