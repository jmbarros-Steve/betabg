# Felipe W2 — Meta Ads
Squad: Marketing | Última sesión: 2026-04-06

## Estado actual: BM Partner migración completa, pendiente activación

### Completado (sesión 06/04/2026)

#### Token Migration — getTokenForConnection
- [x] Crear `cloud-run-api/src/lib/resolve-meta-token.ts` (getTokenForConnection + resolveMetaToken)
- [x] Migrar 11 rutas Meta críticas a getTokenForConnection
- [x] Migrar 13 rutas Meta secundarias a getTokenForConnection
- [x] Verificar TypeScript compila sin errores
- [x] Deploy Cloud Run: revisión `steve-api-00390-2kt`

#### BM Partner Backend
- [x] `discover-client-assets.ts` — enumera activos compartidos con BM via SUAT
- [x] `leadsie-webhook.ts` — webhook Admatic auto-crea conexión bm_partner
- [x] Rutas registradas en `routes/index.ts`
- [x] `sync-all-metrics.ts` incluye filtro bm_partner
- [x] Migración `connection_type` aplicada en Supabase

#### BM Partner Frontend
- [x] `MetaPartnerSetup.tsx` — wizard 3 estados (leadsie→waiting→connected)
- [x] Integrado en `ClientPortalConnections.tsx` via Dialog

#### Social Hub
- [x] `SocialHub.tsx` — 5 tabs: Publicar, Calendario, Métricas, Bandeja, Mejor Hora
- [x] `SocialPublisher.tsx` — publicar en IG + FB
- [x] `SocialCalendar.tsx` — calendario semanal drag-drop
- [x] `SocialMetrics.tsx` — toggle IG/FB
- [x] `FBMetricsDashboard.tsx` — insights Facebook

#### Facebook Routes
- [x] `publish-facebook.ts` — publicar post/foto/video/link
- [x] `fetch-facebook-insights.ts` — métricas page

### Pendiente

#### BM Partner — Activación (requiere JM)
- [ ] Crear cuenta Admatic plan Agency ($79/mes)
- [ ] Configurar Connect Profile en Admatic con BM ID de Steve
- [ ] Obtener URL Connect Profile → `VITE_LEADSIE_REQUEST_URL`
- [ ] Configurar webhook en Admatic → URL: `steve-api.../api/webhooks/leadsie`
- [ ] Obtener webhook secret → `LEADSIE_WEBHOOK_SECRET`
- [ ] Setear env vars Cloud Run: `META_SYSTEM_TOKEN`, `STEVE_BM_ID`, `LEADSIE_WEBHOOK_SECRET`

#### Testing
- [ ] Adaptar webhook handler si payload Admatic difiere de Leadsie
- [ ] Test E2E: simular webhook → verificar conexión creada → sync métricas

#### Supabase
- [ ] Reparar migration history (mismatch con remoto: `supabase migration repair --status reverted 20260321 20260322 20260325`)

### Notas
- 24 rutas Meta total usan getTokenForConnection (0 usan decrypt inline para Meta tokens)
- SUAT del BM de Steve nunca expira — no necesita refresh
- check-meta-scopes retorna all scopes granted para bm_partner
- Page Token para inbox/publishing: SUAT genera via `GET /{page_id}?fields=access_token`
- Instagram DMs bloqueado: Meta App no tiene Instagram Messaging API habilitado
