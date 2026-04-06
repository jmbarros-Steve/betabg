# Sebastián W5 — Infra & Cloud
Squad: Infra | Última sesión: 06/04/2026

## Estado actual: FASE 1 completada — Monitoring activo

### Tareas pendientes

- [ ] **M4 — Env vars faltantes**: GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, SHOPIFY_WEBHOOK_SECRET — esperando credenciales del usuario
- [ ] **learning_queue stuck**: 4 items >48h (IDs: f496b327, acd26a34, 0da5e133, 0649f9e0) — investigar causa raíz
- [ ] **root-cause-analysis**: query DB OK, falla al parsear JSON de Claude — debug paso AI
- [ ] **Crear agente steve_fix_queue**: tarea delegada de Javiera W12 — procesador automático de fix_queue
- [ ] **Deduplicar criterio_results**: ~1000 entradas duplicadas — añadir deduplicación por check_number

### Completado (sesión 06/04/2026)

- [x] Fix cron sub-router (211 rutas excedían límite Hono RegExpRouter)
- [x] Fix weekly-report: conteo errores solo `fail/warn/error/auto_fixed` (414 → 12 reales)
- [x] Fix health-check: slow_endpoint ignora respuestas 4xx (cold start false positive)
- [x] Fix TypeScript: null guards en chino/runner.ts (MerchantConn | null)
- [x] Fix fatigue-detector: column names `access_token_encrypted`, `account_id`
- [x] Fix root-cause-analysis: query usa `checked_at` (no `created_at`)
- [x] Fix approve-knowledge: agrega `activo: true` al aprobar insights
- [x] Renovar APIFY_TOKEN en Cloud Run
- [x] M3 Edge Functions audit: deploy 10 funciones faltantes, eliminar 3 de LogisticSteve
- [x] Eliminar integración Skyvern (0 tasks activas, nunca usado)
- [x] Deploy health-check Edge Function
- [x] Crear cron `health-check-5min` en Cloud Scheduler (cada 5 min)
- [x] Crear páginas Notion: Sebastián W5 + Sesión 06/04/2026

### Blockers

- Credenciales pendientes: Google Ads, Shopify App (usuario debe proveer)

### Deployments activos

- Cloud Run: `steve-api-00380-j96` (último — Skyvern removal)
- Edge Functions: 62 activas + health-check (63 total)
- Crons: 46 activos (45 anteriores + health-check-5min)
- Sentry: conectado en Cloud Run (`9ad73fc`)

### Notion

- Página padre: https://www.notion.so/33a9af51b58d81649825c7323af6f4b9
- Sesión 06/04/2026: https://www.notion.so/33a9af51b58d81169850d354114a42c6
