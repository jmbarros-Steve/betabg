# Steve Platform - Instrucciones para todos los agentes

## Regla #1 - SIEMPRE antes de trabajar
cd ~/steve && git pull

## Stack
- Frontend: React + TypeScript + Vite → auto-deploy en Vercel al hacer push
- Backend: Hono + Node.js en Google Cloud Run (steve-api, us-central1)
- Base de datos: Supabase (ref: zpswjccsxjtnhetkkqde)
- Repo: ~/steve

## Deploy comandos
- Frontend: git add . && git commit -m "mensaje" && git push origin main
- Backend: cd ~/steve/cloud-run-api && gcloud run deploy steve-api --source . --project steveapp-agency --region us-central1
- Base de datos: cd ~/steve && npx supabase db push

## Agentes y responsabilidades
- Agente 0 Klaviyo: flows, emails, sincronización contactos
- Agente 1 Steve Mail: sistema de emails propio
- Agente 2 Meta: campañas, pixel, social inbox, OAuth Meta
- Agente 3 Google: Google Ads metrics, OAuth Google
- Agente 4 Frontend: landing, portal cliente, dashboard
- Agente 5 Nube: Cloud Run, infraestructura GCP
- Agente 6 Metricas: reportes, competencia, analytics
- Agente 7 Brief: Steve Chat, copies, análisis de marca
- Agente 8 Database: migraciones SQL, esquema, RLS

## Reglas
- Nunca tocar src/integrations/supabase/ (auto-generado)
- Nunca tocar src/components/ui/ (shadcn)
- Siempre git pull antes de empezar
- Siempre git push al terminar
- Super admin: jmbarros@bgconsult.cl

## Equipo de Desarrollo — Organigrama

### Dirección
- **Claudio** 🐾 — CTO / Jefe de Desarrollo (orquesta todo, recibe órdenes de JM)
- **Martín** — Performance Developer Analyst (monitor Haiku, reporta cada 5 min)
- **Leonardo** W9 — CEREBRO (orquestador automático de tareas)
- **Javiera** W12 — QA permanente (prueba siempre, corre regression en cada deploy)

### Squad Marketing
- **Rodrigo** W0 — Klaviyo, flows, emails, sincronización contactos
- **Valentina** W1 — Steve Mail, editor de emails, GrapeJS
- **Felipe** W2 — Meta Ads, campañas, pixel, social inbox
- **Andrés** W3 — Google Ads, métricas Google

### Squad Producto
- **Camila** W4 — Frontend, portal cliente, React, UI/UX
- **Isidora** W6 — Métricas, analytics, dashboard, reportes
- **Tomás** W7 — Steve AI, chat, brief, brand research
- **Renata** W16 — Editor UX, GrapeJS, componentes visuales
- **Sofía** W14 — Integraciones (Notion, Gmail, Drive, APIs nuevas)

### Squad Infra
- **Sebastián** W5 — Cloud Run, Edge Functions, deploy, infra GCP
- **Diego** W8 — Database, Supabase, SQL, RLS, migrations
- **Matías** W13 — Shopify, sync productos/órdenes/webhooks
- **Nicolás** W15 — ESPEJO (evaluación visual, holdout tests)
- **Valentín** W18 — Creativos e imágenes (generación AI, biblioteca, editor anuncios, templates Meta)

## Últimos commits

| Hash | Fecha | Mensaje | Archivos |
|------|-------|---------|----------|
| 196ca09 | %Y->- (HEAD -> main) 196ca09481833cffd47b3cb2c8633cf5965d521e:%M | feat: regla obligatoria bug→task automático para todos los agentes | CLAUDE.md |
| 7cf967b | %Y->- (HEAD -> main) 7cf967bd2264b9ec941ac8550b6e5477a4cc1678:%M | feat: C.1 task prioritizer with SLO freeze rule | cloud-run-api/src/routes/cron/task-prioritizer.ts,cloud-run-api/src/routes/index.ts |
| 98c0cfa | %Y->- (HEAD -> main) 98c0cfab5415728b15435e4ff447f1250c6f36db:%M | feat: D.3 creative-context — query history before generating new copy | src/lib/creative-context.ts |
| 4f328e1 | %Y->- (HEAD -> main) 4f328e1fc8a60b0ad0e3e988b0a77f54fb611e7d:%M | feat: D.1 performance-tracker-meta — measure Meta campaigns after 48hrs | cloud-run-api/src/routes/cron/performance-tracker-meta.ts,cloud-run-api/src/routes/index.ts,supabase/migrations/20260317300000_creative_history_perf_columns.sql |
| 83c9a91 | %Y->- (HEAD -> main) 83c9a91f09ec0ba6fbfd83f7856e31b2bcfcb924:%M | feat: D.5 creative fatigue detector — daily 11am cron | cloud-run-api/src/routes/cron/fatigue-detector.ts,cloud-run-api/src/routes/index.ts |
| d0fd39a | %Y->- (HEAD -> main) d0fd39aa79307076180a50fbe1c2192e03e7f758:%M | feat(D.2): performance-evaluator cron — analyze WHY creatives worked or not | cloud-run-api/src/routes/cron/performance-evaluator.ts,cloud-run-api/src/routes/index.ts |
| 3f71a02 | %Y->- (HEAD -> main) 3f71a02db79f6d0f51e4b99c4fb2a02d9a17ee8c:%M | feat(D.4): inject getCreativeContext into Edge Functions (steve-chat + generate-meta-copy) | supabase/functions/_shared/creative-context.ts,supabase/functions/generate-meta-copy/index.ts,supabase/functions/steve-chat/index.ts |
| ec680d0 | %Y->- (HEAD -> main) ec680d0ff32b43056aadb40d78ea81181e38afc4:%M | feat: C.4 healing-locator in src/lib/ per mission spec | src/lib/healing-locator.ts |
| a17806c | %Y->- (HEAD -> main) a17806c1fd6c078e8eb35ee18691df330220d919:%M | feat: auto-restart services on 2+ consecutive health-check failures | cloud-run-api/src/routes/cron/restart-service.ts,cloud-run-api/src/routes/index.ts,scripts/restart-services.sh,supabase/functions/health-check/index.ts |
| ce3aa1f | %Y->- (HEAD -> main) ce3aa1f161b51160d6e3815be05763b88f1072db:%M | feat: BLOQUE C — C.2 RCA semanal + C.3 postmortem automático | cloud-run-api/src/routes/cron/auto-postmortem.ts,cloud-run-api/src/routes/cron/root-cause-analysis.ts,cloud-run-api/src/routes/index.ts,prompts/active/mision-andres-w3.md,prompts/active/mision-diego-w8.md,prompts/active/mision-ignacio-w17.md,prompts/active/mision-paula-w19.md,prompts/active/mision-rodrigo-w0.md,prompts/active/mision-tomas-w7.md,prompts/active/mision-valentina-w1.md |
| c2104ea | %Y->- (HEAD -> main) c2104eaabe65afbc19097c97d18f74ee8456c62b:%M | feat(D.4): inject getCreativeContext into steve-chat, generate-meta-copy & generate-mass-campaigns | cloud-run-api/src/lib/creative-context.ts,cloud-run-api/src/routes/ai/generate-mass-campaigns.ts,cloud-run-api/src/routes/ai/steve-chat.ts |
| 95a2ac4 | %Y->- (HEAD -> main) 95a2ac483b723b96982a8a91f20958c911186c9d:%M | feat(D.6): angle-detector + creative_history on Meta copy & email creation | cloud-run-api/src/lib/angle-detector.ts,cloud-run-api/src/routes/ai/generate-meta-copy.ts,cloud-run-api/src/routes/email/manage-campaigns.ts |
| f335612 | %Y->- (HEAD -> main) f33561224d215700f6677566c966464e6a56cba8:%M | feat: C.4 healing-locator + C.5 auto-rule-generator (Bloque C) | cloud-run-api/src/routes/cron/auto-rule-generator.ts,e2e/lib/healing-locator.ts |
| 2b70676 | %Y->- (HEAD -> main) 2b70676bf0b818e6b35a7ad51aea3ee211bc818c:%M | feat: C.6 rule calibrator (Sun 3am) + D.7 weekly report with QA scorecard | cloud-run-api/src/routes/cron/rule-calibrator.ts,cloud-run-api/src/routes/cron/weekly-report.ts,cloud-run-api/src/routes/index.ts |
| da3ae17 | %Y->- (HEAD -> main) da3ae173ae0bfbedb594a338af71fdd2f378056e:%M | feat: QA skill auto-creates tasks for high/critical issues | .claude/skills/gstack |
| 2c007c3 | %Y->- (HEAD -> main) 2c007c396a029003e7bd69c4771e0819f4196bc8:%M | feat: Auto QA workflow — health check on every push to main | .github/workflows/auto-qa.yml,cloud-run-api/src/routes/index.ts |
| cac2e2b | %Y->- (HEAD -> main) cac2e2b33a76faeb87c18c659a7a9be2590390b0:%M | fix: sanitize messages for Anthropic API — prevent 502 on steve-chat | cloud-run-api/src/routes/ai/steve-chat.ts |
| 59a4909 | %Y->- (HEAD -> main) 59a49093b81805bb78996f7d67162f8e84446000:%M | fix: health-check pointed to dead Edge Functions — now hits Cloud Run | supabase/functions/health-check/index.ts |
| d4093b5 | %Y->- (HEAD -> main) d4093b58af680fb4d3dfb2aa3f22015f7bc42cdd:%M | fix: 3 QA r5 bugs + JUEZ→tasks integration | cloud-run-api/src/routes/ai/steve-chat.ts,cloud-run-api/src/routes/email/manage-campaigns.ts,src/components/client-portal/SteveEstrategia.tsx,src/components/client-portal/email/CampaignBuilder.tsx,supabase/functions/juez-nocturno/index.ts |
| 68212ba | %Y->- (HEAD -> main) 68212bad0ed3f44b2b4e8a90f1ad60d789cafc96:%M | feat: add CRITERIO alerts widget to metrics dashboard | src/components/dashboard/ClientMetricsPanel.tsx |
| fb1bbac | %Y->- (HEAD -> main) fb1bbace5405aa1fcc5f20ac272390574a9ed470:%M | feat(creatives): add /api/creative-preview endpoint — ad preview from copy text | cloud-run-api/src/routes/ai/creative-preview.ts,cloud-run-api/src/routes/index.ts |
| b56de9a | %Y->- (HEAD -> main) b56de9acab0e59425990d90e92f15472b3ef2d83:%M | feat(espejo): create task on visual rejection for emails and ads | cloud-run-api/src/lib/task-creator.ts,cloud-run-api/src/routes/ai/espejo.ts |
| 15a3f9d | %Y->- (HEAD -> main) 15a3f9d3483eda02b85968705c907cb063b7f53b:%M | feat: CRITERIO creates tasks on rejection — email and Meta campaigns | cloud-run-api/src/routes/ai/criterio-email.ts,cloud-run-api/src/routes/ai/criterio-meta.ts |
| 6617a7c | %Y->- (HEAD -> main) 6617a7c8389d1bfd030cb9839efd7ddd6c793854:%M | feat: OJOS health-check creates tasks on endpoint failure/slowness | supabase/functions/health-check/index.ts |
| ec0edb6 | %Y->- (HEAD -> main) ec0edb69f6ed630f744de24508baa1580485e863:%M | feat: add reconciliation cron (every 6h) — Fase 6 paso B.6 | cloud-run-api/src/routes/cron/reconciliation.ts,cloud-run-api/src/routes/index.ts |
| 94f06ec | %Y->- (HEAD -> main) 94f06ec01a288e46519c57e23214ffae1aaa3a9f:%M | feat: Error Budgets (Paso C.1) — slo_config table + calculator cron endpoint | cloud-run-api/src/routes/cron/error-budget-calculator.ts,supabase/migrations/20260317200000_slo_config.sql |
| 44c4308 | %Y->- (HEAD -> main) 44c430853468bbd53aa58f564d53d22325d077a6:%M | feat: Fase 5 A.4 changelog watcher + Fase 6 B.3 smoke tests with rollback | .github/workflows/smoke-test.yml,cloud-run-api/src/routes/index.ts,cloud-run-api/src/routes/triggers/api-changelog-watcher.ts |
| 529cfac | %Y->- (HEAD -> feat/error-budgets) 529cfac1663287d3a5d5463cea52216702ae05c8:%M | feat: Fase 5 A.4 changelog watcher + Fase 6 B.3 smoke tests with rollback | .github/workflows/smoke-test.yml,cloud-run-api/src/routes/index.ts,cloud-run-api/src/routes/triggers/api-changelog-watcher.ts |

## Apify
- API Token: APIFY_TOKEN
- User ID: eXO8v5TWQ00qNbuhJ

## Responsabilidades permanentes
- Isidora W6 — Dueña de CRITERIO (493 reglas, evaluación de campañas y emails)

## Nuevos agentes (17-19)
- Ignacio W17 — Métricas, analytics, dashboard, reportes (features)
- Valentín W18 — Creativos, imágenes AI, biblioteca de assets (features)
- Paula W19 — Steve AI features: nuevas capacidades, chat, contexto, memoria

## Roles actualizados
- Isidora W6 — SOLO CRITERIO (dueña de las 493 reglas, evaluación calidad)
- Nicolás W15 — SOLO ESPEJO + holdout tests (evaluación visual)
- Tomás W7 — SOLO CEREBRO (orquestador, mantenimiento base)

## Sync Métricas cada 6 horas (OpenClaw)
- Cron ID: `0293cfb4-9790-4921-a0dc-3cc1b9f0aa56`
- Nombre: `sync-all-metrics-6h`
- Cada 6 horas sincroniza métricas de Shopify, Meta, Google, Klaviyo
- Llama POST /api/cron/sync-all-metrics con X-Cron-Secret
- También se triggerea automáticamente al reconectar Shopify o Meta (OAuth callback)

## Reporte Semanal lunes 8am Chile (OpenClaw)
- Cron ID: `df73d262-bc8a-4bcf-a7b7-1f908b510750`
- Nombre: `weekly-report-monday`
- Lunes 11:00 UTC (8am Chile) → POST /api/cron/weekly-report
- Envía email a cada merchant via Resend con ventas, top campaña, CPA, acción recomendada
- Guarda reporte en qa_log como weekly_merchant_report para el dashboard

## QA Automático cada 4 horas (OpenClaw)
- Cron ID: `fb005468-3ddb-4e5e-a3c9-f19cb880063f`
- Nombre: `qa-automatico-4h`
- Horario: `0 9,13,17,21,1,5 * * *` (America/Santiago) — 9am, 1pm, 5pm, 9pm, 1am, 5am
- Sesión: main
- Acción: QA full regression con gstack en https://www.steve.cl
- Login: patricio.correa@jardindeeva.cl / Jardin2026
- Reportes: .gstack/qa-reports/ con fecha y hora
- Si hay bugs high/critical → insertar en tabla tasks automáticamente

## ADVERTENCIA: Variables de entorno en Cloud Run
Cada vez que se haga `gcloud run deploy steve-api`, verificar que estas env vars estén configuradas:
- `META_APP_ID`
- `META_APP_SECRET`
- `APIFY_TOKEN`
- `GEMINI_API_KEY`
- `SENTRY_DSN`

### Pendiente: Twilio (WhatsApp)
Cuando lleguen las credenciales, agregar a Cloud Run:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`

Si alguna falta después del deploy, correr:
```bash
gcloud run services update steve-api --region us-central1 --project steveapp-agency \
  --set-env-vars META_APP_ID=<valor>,META_APP_SECRET=<valor>,APIFY_TOKEN=<valor>,GEMINI_API_KEY=<valor>,SENTRY_DSN=<valor>
```
Los valores están en el Secret Manager del proyecto o en el historial de deploys anteriores.

### Verificación automática (OpenClaw)
- Cron ID: `dd801d66-325e-4ddb-b7d4-2835be4f341f`
- Nombre: `verify-cloud-run-env`
- Cada 30 minutos corre `scripts/verify-cloud-run-env.sh`
- Si falta alguna env var → inserta task crítica en Supabase

## REGLA OBLIGATORIA: Bug → Task automático
Cuando cualquier agente encuentra un bug (severity: critical, major, high):
1. Insertar INMEDIATAMENTE en tabla tasks de Supabase:
```bash
