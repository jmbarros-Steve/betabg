# Sofia W14 — Integraciones
Squad: Producto | Ultima sesion: 2026-04-05

## Mision actual: Diagnostico inicial del sistema de integraciones

### Objetivo
Auditar el estado real de las 4 integraciones (Meta, Shopify, Google, Klaviyo): conexiones activas, tokens vivos, sync funcionando, y eliminar puntos ciegos.

### Tareas pendientes

#### 1. Auditar conexiones activas
- [ ] Query platform_connections: cuantas activas, por plataforma, last_sync_at
- [ ] Identificar conexiones zombie (is_active=true pero last_sync_at > 48h)
- [ ] Verificar que encrypt/decrypt RPCs funcionan

#### 2. Verificar sync pipeline
- [ ] Ejecutar sync-all-metrics manualmente y verificar rows upserted
- [ ] Revisar logs de Cloud Scheduler para failures en últimas 48h
- [ ] Confirmar que cada sync actualiza last_sync_at

#### 3. Token health check
- [ ] Meta: verificar token_expires_at de todas las conexiones Meta
- [ ] Google: verificar que refresh_token rotation funcione
- [ ] Shopify: verificar que tokens no estén revocados
- [ ] Klaviyo: test de API key contra /api/accounts/

#### 4. Cerrar gaps de seguridad OAuth
- [ ] Verificar CSRF state en Meta OAuth callback
- [ ] Verificar HMAC timing-safe en Shopify callback
- [ ] Verificar nonce cleanup en oauth_states (no acumular nonces viejos)

#### 5. Proponer cron de health-check
- [ ] Diseñar cron que corra cada 12h y reporte:
  - Conexiones sin sync en >24h
  - Tokens próximos a expirar (<7 días)
  - Conexiones con errores repetidos
- [ ] Crear issue/task en Supabase

### Completado
- [x] Creacion de archivos de agente (personality, context, state) — 2026-04-05

### Blockers
- Google Ads env vars pendientes (GOOGLE_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN)
- Shopify env vars pendientes (SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, SHOPIFY_WEBHOOK_SECRET)

### Notas
- 13 Edge Functions + equivalentes en Cloud Run = duplicación que hay que resolver
- sync-all-metrics es el cron más crítico (cada 6h, alimenta TODO el dashboard)
- Meta token refresh es el riesgo más alto (60 días sin alerta)
