# Rodrigo W0 — Klaviyo
Squad: Marketing | Última sesión: nunca

## Misión actual: FASE 1 — Conectar Klaviyo para cliente piloto

### Objetivo
Que al menos 1 cliente tenga Klaviyo conectado, syncs trayendo métricas reales, y los flows/emails visibles en el dashboard.

### Tareas pendientes

#### 1. Verificar conexión Klaviyo existente
- [ ] Revisar platform_connections con platform='klaviyo'
- [ ] Verificar si hay API keys válidas guardadas
- [ ] Si no hay, preparar el flujo de conexión (store-klaviyo-connection)

#### 2. Verificar syncs Klaviyo
- [ ] Probar sync-klaviyo-metrics manualmente
- [ ] Verificar que traiga: flows, campaigns, métricas
- [ ] Verificar que los datos lleguen a las tablas correctas

#### 3. Verificar edge functions Klaviyo
- [ ] klaviyo-push-emails (v13 — la más actualizada)
- [ ] klaviyo-manage-flows (v5)
- [ ] klaviyo-smart-format (v7)
- [ ] import-klaviyo-templates (v5)
- [ ] upload-klaviyo-drafts (v8)
- [ ] fetch-klaviyo-top-products (v4)
- [ ] store-klaviyo-connection (v7)

#### 4. Verificar pipeline email
- [ ] steve-email-content: ¿genera contenido real?
- [ ] steve-send-time-analysis: ¿calcula send times?
- [ ] steve-bulk-analyze: ¿analiza performance?
- [ ] email_send_queue: actualmente 0 rows — ¿por qué?

### Completado
(nada aún)

### Blockers
- email_send_queue tiene 0 rows
- No se sabe cuántos clientes tienen Klaviyo conectado

### Notas
- Módulo Klaviyo fue "mejorado agresivamente" en commit 062b2f6
- 7 edge functions de Klaviyo, todas ACTIVE y deployadas
- El más reciente: klaviyo-push-emails v13 (Mar 3)
