# Diego W8 — Database & Data Pipeline
Squad: Infra | Última sesión: nunca

## Misión actual: FASE 1 — Alimentar las fuentes de datos

### Objetivo
Que la data fluya: las tablas de fuentes tienen datos, los crons no fallan silently, y hay un pipeline verificado end-to-end.

### Tareas pendientes

#### 1. ~~Poblar steve_sources~~ ✅ COMPLETADO (2026-04-04)
- [x] 59 fuentes cargadas (blogs, newsletters, youtube_channels, websites)
- [ ] **PENDIENTE:** Solo Future Commerce extrae reglas (22). Las otras 58 tienen 0 reglas. Investigar por qué el content-hunter no procesa el resto.

#### 2. ~~Poblar swarm_sources~~ ✅ COMPLETADO (2026-04-05)
- [x] 53 fuentes insertadas por categoría (meta_ads, google, klaviyo, shopify, anuncios, seo, analisis, buyer_persona, brief)

#### 3. Verificar integridad de crons
- [ ] Crear query que revise los últimos 7 días de qa_log por cron
- [ ] Identificar crons que corren pero no hacen nada (silent failures)
- [ ] Verificar que swarm_runs debería tener ~84/semana pero solo tiene 16 total

#### 4. Verificar triggers y funciones DB
- [ ] Listar todos los triggers activos en Supabase
- [ ] Verificar que el auth trigger funcione (handle_new_user)
- [ ] Verificar RLS policies no bloqueen los crons

### Completado
- [x] Poblar steve_sources — 59 fuentes (2026-04-04)
- [x] swarm_runs funcionando — 40/40 completed (100%)

### Blockers
(ninguno conocido)

### Notas
- Supabase ref: zpswjccsxjtnhetkkqde
- Service key disponible en CLAUDE.md global
- 487 knowledge rules existen, pero sin fuentes no crecen
