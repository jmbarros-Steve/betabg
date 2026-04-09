# Paula W19 — Estado Actual
_Última sesión: 2026-04-09_

## Tareas en Progreso
- (ninguna)

## Tareas Pendientes
- [ ] Verificar wa-action-processor batch processing en producción (no duplicados)
- [ ] Crear RPC `increment_message_count` para atomicidad (Bug #49)
- [ ] Migrar WACampaigns.tsx CRUD completo a backend endpoint
- [ ] Verificar email nurture ahora incluye prospects con NULL step
- [ ] Monitorear Sentry por errores nuevos post-deploy
- [ ] 20 bugs medium restantes de Ronda 1 (backlog)

## Completado (sesión 2026-04-09 — Bug Hunt Masivo)
- [x] Ronda 1: 30 bugs encontrados, 10 critical arreglados
- [x] Ronda 2: 30 bugs encontrados, 30 arreglados (1 critical + 15 high + 14 medium)
- [x] SSRF protection en quickScrapeUrl (IPs privadas/metadata GCP)
- [x] Prompt injection guard [SISTEMA:] ampliado
- [x] IDOR ownership checks en send-message, send-campaign
- [x] Multi-tenant scoping en web-forms, sales-tasks, prospect-crm
- [x] Optimistic lock sync en steve-wa-chat
- [x] TOCTOU credit race condition arreglado (deducción atómica pre-send)
- [x] Atomic batch processing en wa-action-processor (batchId)
- [x] Idempotency guards en status-callback
- [x] Frontend migrado a callApi (WAInbox, WACampaigns)
- [x] Deploy: Cloud Run steve-api-00439-pkm + Vercel auto
- [x] Commits: 315607e + ebfcdad

## Completado (sesión 2026-04-07)
- [x] Pipeline CRM funcional con columna `meeting_status`
- [x] Meta CAPI Purchase/Lead/Schedule events
- [x] Timezone fix crítico en booking-api
- [x] Seller "Consultor" con horario Chile

## Blockers
- Shopify desconectado → `abandoned-cart-wa` no puede recuperar carritos (depende de Matías W13)

## Desafíos Pendientes para JM
- "60 bugs en producción. ¿Cuándo metemos tests automatizados para que no se acumulen?"
- "WACampaigns.tsx todavía hace INSERT directo a Supabase para algunas operaciones. Hay que migrar TODO a backend."
