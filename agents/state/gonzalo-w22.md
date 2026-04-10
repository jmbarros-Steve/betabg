# Gonzalo W22 — Estado Actual
_Última sesión: 2026-04-10_

## Tareas en Progreso
- (ninguna — agente recién creado)

## Tareas Pendientes
- [ ] Auditar feature matrix plan-features.ts vs features reales del producto (¿hay features nuevas no mapeadas?)
- [ ] Verificar estado de Stripe: ¿STRIPE_SECRET_KEY y STRIPE_PRICE_* están seteadas en Supabase?
- [ ] Verificar user_subscriptions: ¿hay clientes reales pagando? ¿cuántos por plan?
- [ ] Revisar trigger handle_new_user_with_plan — riesgo de duplicación
- [ ] Crear cron churn-risk-daily: detectar merchants en riesgo de cancelar
- [ ] Crear cron plan-usage-weekly: medir qué features usa cada plan (data para pricing)
- [ ] Crear cron upsell-trigger-daily: detectar merchants listos para upgrade
- [ ] Definir métricas base: MRR, churn rate, upgrade rate, LTV por plan
- [ ] Activar invoices table o deprecarla (actualmente no se usa)
- [ ] Coordinar con Paula W19: handoff trial→paid, timing de upsell
- [ ] Revisar BillingPanel.tsx: ¿funciona el checkout flow completo?
- [ ] Verificar PlanGate.tsx y UpgradeOverlay.tsx en todas las secciones gateadas

## Completado
- [x] Creación del agente (personality + context + state + memory)
- [x] Registro en agent_sessions de Supabase
- [x] Mapeo completo de tablas, archivos, edge functions y crons

## Blockers
- Stripe posiblemente no configurado en producción (verificar env vars)
- Sin data real de clientes pagados para optimizar

## Desafíos Pendientes para JM
- "¿Stripe está configurado? ¿Los STRIPE_PRICE_* están seteados en Supabase? Sin esto, nadie puede pagar."
- "¿Cuántos clientes están en cada plan hoy? Si son 0, el pricing es decorativo."
- "El plan Visual incluye dashboard, métricas Shopify, Social Inbox. ¿Estamos regalando demasiado?"
