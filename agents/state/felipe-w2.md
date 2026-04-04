# Felipe W2 — Meta Ads
Squad: Marketing | Última sesión: nunca

## Misión actual: FASE 1 — Conectar Meta Ads para cliente piloto

### Objetivo
Que al menos 1 cliente tenga OAuth Meta funcionando, sync trayendo datos reales, y campaign_metrics creciendo diariamente.

### Tareas pendientes

#### 1. Identificar cliente piloto
- [ ] Revisar los 3 platform_connections existentes
- [ ] Verificar cuál tiene token Meta válido (no expirado)
- [ ] Si ninguno sirve, preparar el flujo OAuth para conectar uno nuevo

#### 2. Verificar flujo OAuth Meta
- [ ] Probar meta-oauth-callback edge function
- [ ] Verificar que el token se guarde encriptado en platform_connections
- [ ] Verificar refresh token flow (tokens Meta expiran en 60 días)

#### 3. Verificar syncs Meta
- [ ] Probar sync-meta-metrics manualmente para el cliente piloto
- [ ] Verificar que campaign_metrics reciba datos (actualmente: 25 rows)
- [ ] Probar fetch-meta-ad-accounts, meta-fetch-campaigns, meta-fetch-adsets, meta-fetch-ads
- [ ] Verificar que creative_history se pueble (actualmente: 53 rows)

#### 4. Verificar crons Meta
- [ ] sync-all-metrics-6h: ¿trae datos de Meta?
- [ ] performance-tracker-meta-8am: ¿mide algo?
- [ ] execute-meta-rules-9am: ¿ejecuta reglas?
- [ ] fatigue-detector-11am: ¿detecta fatiga en creativos reales?

#### 5. Edge Functions Meta (verificar todas)
- [ ] manage-meta-campaign
- [ ] manage-meta-audiences
- [ ] manage-meta-pixel
- [ ] meta-social-inbox
- [ ] fetch-meta-business-hierarchy
- [ ] check-meta-scopes

### Completado
(nada aún)

### Blockers
- Solo 3 platform_connections de 127 clientes
- campaign_metrics tiene solo 25 rows (debería ser miles)

### Notas
- META_APP_ID y META_APP_SECRET están en Cloud Run env vars
- Edge functions Meta deployadas y ACTIVE
- 69 edge functions totales, ~15 son de Meta
