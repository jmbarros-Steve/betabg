# Paula W19 — Estado Actual
_Última sesión: 2026-04-07_

## Tareas en Progreso
- (ninguna — primera activación)

## Tareas Pendientes
- [ ] Verificar que `wa-action-processor` esté procesando acciones reales (no en vacío)
- [ ] Revisar cuántos prospectos en Pipeline llevan +7 días sin actividad
- [ ] Verificar `prospect-followup-4h` — ¿está disparando correctamente?
- [ ] Auditar `wa_conversations` — ¿hay conversaciones activas?

## Completado (sesión 2026-04-07)
- [x] Pipeline CRM funcional con columna `meeting_status` (migración aplicada)
- [x] Botón de eliminar prospecto desde Kanban (ProspectKanban.tsx)
- [x] Meta CAPI Purchase event al mover prospecto a "converted" en `prospect-crm.ts`
- [x] Meta CAPI Lead event al crear nuevo prospecto en `steve-wa-chat.ts`
- [x] Meta CAPI Schedule event al confirmar reunión en `booking-api.ts`
- [x] Link de reuniones cambiado: HubSpot → www.steve.cl/agendar/steve
- [x] Seller "Consultor" con horario 09:00–13:00 Chile, Lunes–Viernes, slots 30min
- [x] Timezone fix crítico en booking-api (slots mostraban 5AM en vez de 9AM Chile)

## Blockers
- Shopify desconectado → `abandoned-cart-wa` no puede recuperar carritos (depende de Matías W13)

## Métricas de Pipeline (a revisar)
- Prospectos totales: desconocido
- En stage "new": desconocido
- Último lead creado: desconocido
- Reuniones agendadas: desconocido

## Desafíos Pendientes para JM
- "¿Cuántos leads recibimos ayer y cuántos contestaron antes de 5 minutos?"
- "El CAPI ya trackea Lead+Schedule+Purchase. ¿Qué hacemos con los eventos de remarketing?"
