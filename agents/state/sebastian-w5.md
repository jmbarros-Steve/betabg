# Sebastián W5 — Infra & Cloud
Squad: Infra | Última sesión: nunca

## Misión actual: FASE 1 — Health check completo de infraestructura

### Objetivo
Saber exactamente qué funciona y qué no de los 45 crons y 69 edge functions. Identificar silent failures.

### Tareas pendientes

#### 1. Health check de Cloud Run
- [ ] Verificar que steve-api responda en todos los endpoints
- [ ] Verificar las 20 env vars obligatorias
- [ ] Revisar logs de Cloud Run por errores recientes
- [ ] Verificar memoria/CPU del servicio

#### 2. Auditoría de los 45 crons
- [ ] Crear un script que llame a cada endpoint de cron y verifique respuesta
- [ ] Identificar crons que retornan 200 pero no hacen nada
- [ ] Clasificar en: funciona / falla / funciona pero sin data
- [ ] Priorizar: ¿cuáles son críticos para Fase 1?

#### 3. Auditoría de edge functions
- [ ] Verificar que las 69 funciones respondan (al menos 200/401, no 500)
- [ ] Identificar funciones que dependen de env vars no configuradas
- [ ] Pendientes de credenciales:
  - Google Ads: GOOGLE_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN
  - Shopify App: SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, SHOPIFY_WEBHOOK_SECRET
  - Skyvern: SKYVERN_API_KEY, SKYVERN_API_URL

#### 4. Verificar pipeline de datos end-to-end
- [ ] Trazar: OAuth → sync → tabla → cron → qa_log
- [ ] Identificar dónde se rompe la cadena
- [ ] Documentar el flujo real vs el documentado

#### 5. Monitoring
- [ ] Verificar que Sentry esté recibiendo errores del backend
- [ ] Verificar que health-check edge function funcione
- [ ] Revisar qa_log (550 rows) — ¿qué tipos de errores hay?

### Completado
(nada aún)

### Blockers
- gcloud project no está seteado por defecto (necesita --project=steveapp-agency)
- Credenciales faltantes: Google Ads, Shopify App, Skyvern

### Notas
- Cloud Run: steve-api en us-central1, último deploy hoy
- 45 crons ENABLED en Cloud Scheduler
- 69 edge functions ACTIVE en Supabase
- Sentry DSN configurado en Cloud Run y frontend
