# Diego W8 — Database & Data Pipeline
Squad: Infra | Última sesión: nunca

## Misión actual: FASE 1 — Alimentar las fuentes de datos

### Objetivo
Que la data fluya: las tablas de fuentes tienen datos, los crons no fallan silently, y hay un pipeline verificado end-to-end.

### Tareas pendientes

#### 1. Poblar steve_sources (actualmente: 0 rows)
- [ ] Insertar 20+ fuentes de marketing digital (blogs, newsletters)
  - HubSpot Blog, Neil Patel, Search Engine Journal, Moz Blog
  - Meta Business Help Center, Google Ads Blog
  - Shopify Blog, Klaviyo Blog
  - Marketing Brew, Morning Brew
- [ ] Categorizar por tipo: blog, newsletter, youtube_channel, rss
- [ ] Configurar check_interval_min para cada una

#### 2. Poblar swarm_sources (actualmente: 0 rows)
- [ ] Insertar fuentes específicas para Swarm Research
  - Canales YouTube de marketing digital
  - RSS feeds de industria e-commerce
  - Blogs de estrategia publicitaria
- [ ] Verificar que content-hunter las pueda leer

#### 3. Verificar integridad de crons
- [ ] Crear query que revise los últimos 7 días de qa_log por cron
- [ ] Identificar crons que corren pero no hacen nada (silent failures)
- [ ] Verificar que swarm_runs debería tener ~84/semana pero solo tiene 16 total

#### 4. Verificar triggers y funciones DB
- [ ] Listar todos los triggers activos en Supabase
- [ ] Verificar que el auth trigger funcione (handle_new_user)
- [ ] Verificar RLS policies no bloqueen los crons

### Completado
(nada aún)

### Blockers
(ninguno conocido)

### Notas
- Supabase ref: zpswjccsxjtnhetkkqde
- Service key disponible en CLAUDE.md global
- 487 knowledge rules existen, pero sin fuentes no crecen
