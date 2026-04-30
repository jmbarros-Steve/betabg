# Michael W25 — Estrategia (Comunicación Cliente)
Squad: Producto | Última sesión: 2026-04-29 (inventario completo módulo Estrategia)

## Estado actual: agente independiente del Brief, dueño de strategy-chat.ts + strategy-report.ts + steve-strategy.ts

### Sesión 29/04/2026 — Inventario completo del módulo Estrategia
- [x] Auditoría línea-por-línea de 5365 líneas en 5 archivos (sub-agente Explore)
- [x] Mapeo de 3 endpoints, 20 tablas Supabase, 6 APIs externas, 13 tools agenticas, 14 piezas de lógica de negocio
- [x] Documentación de reglas hardcoded del system prompt y limitaciones actuales
- [x] Notion sesión creada bajo hub `34f9af51b58d81329355dc5b3997bc28`
- [x] Memory journal creado en `agents/memory/michael-w25.md`
- [x] Hallazgo: `strategy-chat.ts` creció ~870 → 2442 líneas entre 27/04 y 29/04 (state desactualizado)
- [x] Trabajo posterior 27/04 documentado: drafts review flow (`d60bcf05`), 5 agentes coordinados (`c6524b27`), creativos 5 formatos (`ee22538b`), customer intel + ROAS margen + calendario (`310c11e5`), strategy-report premium (`73d7b887`), regla privacidad (`4e9e70c5` + `05427010`), regla #1 anti-loop (`770ced06`), objetivo siempre se pregunta (`fcd7bb9e`), anti-meta-referencias (`fc650e22`)

### Sesión 27/04/2026 (parte 2) — Extracción de strategy-chat.ts [BRIEF-APPROVED-BY-JM]
- [x] Creado `cloud-run-api/src/routes/ai/strategy-chat.ts` (~870 líneas) — handler independiente
- [x] Exportadas `sanitizeMessagesForAnthropic` y `truncateMessages` desde steve-chat.ts (uso compartido)
- [x] Eliminadas ~850 líneas del bloque `if (mode === 'estrategia')` de steve-chat.ts (de ~2700 → 1453 líneas)
- [x] Registrada ruta `POST /api/strategy-chat` en `routes/index.ts`
- [x] Frontend `SteveEstrategia.tsx` migrado: `callApi('steve-chat', { mode: 'estrategia' })` → `callApi('strategy-chat')`
- [x] TypeScript check limpio en backend y frontend
- [x] Michael ya NO depende del flujo de aprobación de Bastián W24 para iterar la estrategia

### Sesión 27/04/2026 (parte 1) — Creación del agente
- [x] Hub Notion creado: `34f9af51b58d81329355dc5b3997bc28`
- [x] Memoria global guardada en `~/.claude/projects/-Users-josemanuelpc/memory/michael.md`
- [x] Personality, context y state files creados en `agents/`
- [x] Scope identificado: tab Estrategia (`SteveEstrategia.tsx`, `SteveStrategyChat.tsx`) + contenido de mails de estrategia

---

## Pendiente — primer onboarding del agente
- [ ] Test post-deploy: tab Estrategia funciona end-to-end con cliente que tiene brief completo + conexiones activas
- [ ] Test post-deploy: Brief Q0 sigue funcionando (no se rompió nada de Bastián)
- [ ] Inventariar mails de estrategia existentes: cuáles son, cuándo se disparan, desde qué endpoint, qué template usan
- [ ] Auditar SteveEstrategia.tsx end-to-end con un cliente real
- [ ] Revisar y proponer mejoras al system prompt en strategy-chat.ts (ahora editable libre)
- [ ] Documentar la heurística de `categoriaRelevante` y proponer mejoras
- [ ] Definir cadencia/timing recomendado para mails de estrategia (qué día, qué hora, qué frecuencia)
- [ ] Validar empty states de la tab: "sin brief completo", "sin conexiones", "cargando" — distinguibles en UI

## Blockers
- Ninguno — el agente está habilitado para trabajar libre dentro de su scope.

## Notas para sesiones futuras
- Antes de cualquier cambio, hacer `git pull` (regla del repo)
- strategy-chat.ts es TUYO — editás directo. NO toques steve-chat.ts (Brief de Bastián)
- Helpers compartidos (`sanitizeMessagesForAnthropic`, `truncateMessages`) viven en steve-chat.ts y se importan — coordinar con Bastián si hay que cambiarlos
- Cross-review obligatorio: Isidora W6 para frontend y backend
