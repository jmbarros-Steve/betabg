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

## Reglas de Código
- **NUNCA** tocar `src/integrations/supabase/` (auto-generado por Supabase)
- **NUNCA** tocar `src/components/ui/` (shadcn — se actualiza con CLI)
- **NUNCA** editar archivos >30KB sin leerlos primero
- Siempre `git pull` antes de empezar
- Siempre `git push` al terminar
- Super admin: jmbarros@bgconsult.cl

### Naming conventions
| Qué | Convención | Ejemplo |
|-----|-----------|---------|
| Rutas API | kebab-case | `/api/sync-meta-metrics` |
| Funciones | camelCase | `syncAllMetrics` |
| Archivos handler | kebab-case | `sync-meta-metrics.ts` |
| Componentes React | PascalCase | `MetaCampaignManager.tsx` |
| Tablas SQL | snake_case | `campaign_metrics` |
| Columnas SQL | snake_case | `user_id`, `created_at` |
| Env vars | UPPER_SNAKE | `CRON_SECRET` |
| Interfaces TS | PascalCase | `ChatMessage` |

### Imports (alias @/)
```typescript
import { Button } from '@/components/ui/button';      // shadcn
import { useAuth } from '@/hooks/useAuth';             // hooks custom
import { supabase } from '@/integrations/supabase/client'; // DB client
import { cn } from '@/lib/utils';                      // utilities
import { Send, Loader2 } from 'lucide-react';          // icons
```
Backend (Cloud Run): extensiones `.js` obligatorias para ESM.

### Auth en endpoints
- **Páginas React**: `useAuth()` + `useUserRole()` → redirect si no autorizado
- **API con JWT**: `authMiddleware` en la ruta
- **Crons**: header `X-Cron-Secret` (sin JWT)
- **Webhooks públicos**: HMAC verification (Shopify, Twilio, SES)
- **Interno**: header `X-Internal-Key` con service role key

### Archivos GRANDES (leer antes de tocar)
| Archivo | Tamaño | Qué es |
|---------|--------|--------|
| `src/components/client-portal/BrandBriefView.tsx` | 287KB | Formulario de brief — MUY complejo |
| `src/components/client-portal/meta-ads/CampaignCreateWizard.tsx` | 141KB | Wizard de campañas Meta |
| `src/components/client-portal/email/emailTemplates.ts` | 107KB | Librería de templates |
| `src/components/client-portal/meta-ads/MetaCampaignManager.tsx` | 86KB | Gestión de campañas |
| `src/components/client-portal/email/CampaignBuilder.tsx` | 81KB | Editor GrapeJS |
| `cloud-run-api/src/routes/ai/steve-chat.ts` | 120KB | Motor principal de Steve AI |
| `cloud-run-api/src/routes/ai/generate-meta-copy.ts` | 71KB | Generación de copies |
| `cloud-run-api/src/routes/meta/manage-meta-campaign.ts` | 56KB | CRUD campañas Meta |
| `cloud-run-api/src/routes/whatsapp/steve-wa-chat.ts` | 55KB | Chat WA con AI |
| `src/integrations/supabase/types.ts` | 54KB | AUTO-GENERADO — NO EDITAR |

## Estructura del Proyecto

```
steve-ads/
├── src/                          # Frontend React + Vite
│   ├── pages/           (31)     # Páginas/rutas
│   ├── components/      (159)    # Componentes React
│   │   ├── ui/                   # shadcn (NO TOCAR)
│   │   ├── dashboard/            # Panels del admin dashboard
│   │   ├── client-portal/        # Portal del cliente (Meta, Email, Klaviyo, Shopify)
│   │   ├── landing/              # Landing page
│   │   └── shopify/              # Shopify app
│   ├── hooks/                    # useAuth, useUserRole, custom hooks
│   ├── integrations/             # Supabase client (NO TOCAR)
│   ├── lib/                      # Utilidades (api, utils, reports)
│   └── assets/                   # Logos, imágenes
├── cloud-run-api/src/            # Backend Hono + Node.js
│   ├── routes/          (187)    # Endpoints API
│   │   ├── ai/                   # steve-chat, generate-copy, criterio, espejo
│   │   ├── meta/                 # manage-campaign, audiences, rules, pixel
│   │   ├── google/               # google-ads sync, metrics
│   │   ├── klaviyo/              # flows, push, sync, templates
│   │   ├── shopify/              # products, orders, webhooks, analytics
│   │   ├── email/                # campaigns, send, flows, subscribers
│   │   ├── whatsapp/             # steve-wa-chat, send, campaigns
│   │   ├── instagram/            # publish, insights
│   │   ├── cron/                 # 44 crons (schedulers)
│   │   ├── crm/                  # prospects, proposals, sellers
│   │   ├── analytics/            # competitor, deep-dive
│   │   ├── oauth/                # Meta, Google, Shopify callbacks
│   │   ├── triggers/             # webhooks, changelog watcher
│   │   └── utilities/            # helpers, queue, transcription
│   ├── middleware/               # Auth, validation
│   ├── lib/                      # Shared utils (supabase, creative-context)
│   └── chino/                    # QA checks (7 tipos)
├── supabase/
│   ├── functions/       (64)     # Edge Functions (Deno)
│   │   ├── _shared/             # Utilidades compartidas
│   │   └── {function}/index.ts  # Una carpeta por función
│   └── migrations/      (142)    # SQL migrations
├── agents/                       # Sistema de agentes
│   ├── personalities/   (14)     # Personalidad + 5 misiones
│   ├── state/           (4+)     # Estado actual por agente
│   └── memory/                   # Journal acumulativo
├── scripts/                      # Utility scripts
└── prompts/                      # Prompt templates
```

## 97 Tablas de Supabase (por módulo)

### Core (6)
| Tabla | Qué guarda |
|-------|-----------|
| `clients` | 127 cuentas de merchants/negocios |
| `user_roles` | Roles: admin, client |
| `platform_connections` | Tokens encriptados (Meta, Google, Shopify, Klaviyo) |
| `tasks` | Cola de tareas de agentes |
| `agent_sessions` | Estado de los 14 agentes (sync desde Claude Code) |
| `backlog` | Cola de mejora continua |

### Meta Ads (8)
| Tabla | Qué guarda |
|-------|-----------|
| `meta_campaigns` | Campañas Meta |
| `campaign_metrics` | Spend, CTR, CPA, ROAS por día (Meta + Google) |
| `adset_metrics` | Métricas por ad set |
| `ad_creatives` | Copy y creative variations |
| `ad_assets` | Imágenes/video para ads |
| `ad_references` | Referencia histórica de ads |
| `meta_automated_rules` | Reglas automáticas CPA/ROAS |
| `meta_rule_execution_log` | Log de ejecución de reglas |

### Email (17)
| Tabla | Qué guarda |
|-------|-----------|
| `email_campaigns` | Campañas de email |
| `email_templates` | Galería de templates |
| `email_send_queue` | Cola de envío (**0 filas — roto**) |
| `email_events` | Opens, clicks, bounces, conversions |
| `email_subscribers` | Contactos por merchant |
| `email_lists` | Listas y segmentos |
| `email_list_members` | Membresía estática |
| `email_flows` | Secuencias automáticas |
| `email_flow_enrollments` | Enrollments en flows |
| `email_ab_tests` | Config de A/B tests |
| `email_domains` | Dominios verificados (SES) |
| `email_forms` | Formularios de signup |
| `email_send_settings` | Config SMTP/SES por cliente |
| `email_universal_blocks` | Bloques drag-drop del editor |
| `klaviyo_email_plans` | Sync metadata Klaviyo |
| `saved_meta_copies` | Copies Meta guardados |
| `saved_google_copies` | Copies Google guardados |

### WhatsApp & CRM (14)
| Tabla | Qué guarda |
|-------|-----------|
| `wa_conversations` | Hilos de conversación WA |
| `wa_messages` | Mensajes individuales |
| `wa_campaigns` | Campañas broadcast WA |
| `wa_prospects` | Prospectos/leads WA |
| `wa_pending_actions` | Cola de acciones pendientes |
| `wa_automations` | Reglas de automatización |
| `wa_credits` | Balance WA por merchant |
| `wa_credit_transactions` | Historial de uso WA |
| `wa_twilio_accounts` | Cuentas Twilio por merchant |
| `wa_case_studies` | Casos de éxito WA |
| `sales_tasks` | Tareas de venta por vendedor |
| `proposals` | Propuestas/cotizaciones |
| `web_forms` | Formularios de intake |
| `web_form_submissions` | Respuestas a formularios |

### Shopify (3)
| Tabla | Qué guarda |
|-------|-----------|
| `shopify_products` | Catálogo synceado |
| `shopify_abandoned_checkouts` | Carritos abandonados |
| `platform_metrics` | Revenue y orders (Shopify + Google) |

### Steve AI / Brain (15)
| Tabla | Qué guarda |
|-------|-----------|
| `steve_knowledge` | 487 reglas/insights activos |
| `steve_knowledge_versions` | Snapshots de versiones |
| `steve_sources` | Fuentes de contenido (**0 filas**) |
| `steve_conversations` | Historial multi-turn |
| `steve_messages` | Mensajes individuales |
| `steve_episodic_memory` | Memoria corto plazo |
| `steve_working_memory` | Memoria largo plazo |
| `steve_feedback` | Feedback del usuario |
| `steve_training_examples` | Ejemplos de training |
| `steve_training_feedback` | Feedback de training |
| `steve_ab_tests` | A/B tests de features |
| `steve_bugs` | Bug tracking |
| `steve_commitments` | Compromisos de agentes |
| `steve_fix_queue` | Cola de fixes |
| `learning_queue` | Cola de insights para swarm |

### Knowledge & Research (4)
| Tabla | Qué guarda |
|-------|-----------|
| `swarm_runs` | Ejecuciones de swarm (16 exitosos) |
| `swarm_sources` | Fuentes para swarm (**0 filas**) |
| `auto_learning_digests` | Digests de research |
| `study_resources` | Material de estudio |

### Creativos & QA (8)
| Tabla | Qué guarda |
|-------|-----------|
| `creative_history` | Copies generados + performance |
| `creative_analyses` | Análisis de patrones creativos |
| `criterio_rules` | 493 reglas de calidad |
| `criterio_results` | Resultados de evaluación |
| `detective_log` | Reviews visuales |
| `detective_runs` | Batch de evaluación visual |
| `qa_log` | 550+ registros de QA checks |
| `chino_reports` | Reportes de El Chino |

### Competencia & Analytics (4)
| Tabla | Qué guarda |
|-------|-----------|
| `brand_research` | Análisis de marca/competencia |
| `competitor_ads` | Ads de competidores |
| `competitor_tracking` | Métricas de competidores |
| `campaign_recommendations` | Recomendaciones AI |

### Merchant & Billing (12)
| Tabla | Qué guarda |
|-------|-----------|
| `client_assets` | Logos, archivos de marca |
| `client_credits` | Balance email/WA |
| `client_financial_config` | Config billing |
| `credit_transactions` | Historial de créditos |
| `merchant_onboarding` | Progreso de onboarding |
| `merchant_upsell_opportunities` | Oportunidades de upsell |
| `subscription_plans` | Planes de servicio |
| `user_subscriptions` | Suscripciones activas |
| `invoices` | Facturas |
| `time_entries` | Tracking de tiempo |
| `buyer_personas` | Segmentos de clientes |
| `campaign_month_plans` | Planes mensuales |

### Infra (6)
| Tabla | Qué guarda |
|-------|-----------|
| `slo_config` | Error budgets (4 CUJs) |
| `oauth_states` | Validación de OAuth flows |
| `onboarding_jobs` | Jobs background de setup |
| `instagram_scheduled_posts` | Posts IG programados |
| `juez_golden_questions` | Golden questions para tests nocturnos |
| `seller_calendars` | Disponibilidad de vendedores |

### Content (3)
| Tabla | Qué guarda |
|-------|-----------|
| `blog_posts` | Blog interno |
| `academy_courses` + `academy_*` (5 tablas) | Cursos, lecciones, quizzes |
| `support_tickets` | Tickets de soporte |
| `chino_routine` | Rutinas de automatización |

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

## ⛔ Crons — TODOS en Google Cloud Scheduler (NO usar OpenClaw)
**TODOS los crons corren via Google Cloud Scheduler → Cloud Run. NUNCA crear crons en OpenClaw.**
Para listar: `gcloud scheduler jobs list --project=steveapp-agency --location=us-central1`
Para crear nuevo: `gcloud scheduler jobs create http NOMBRE --schedule="CRON" --uri="https://steve-api-850416724643.us-central1.run.app/api/cron/RUTA" --http-method=POST --headers="X-Cron-Secret=steve-cron-secret-2024,Content-Type=application/json" --location=us-central1 --project=steveapp-agency`

### 44 jobs activos (todos ENABLED):
| Job | Schedule | Endpoint |
|-----|----------|----------|
| wa-action-processor-1min | `* * * * *` | /api/cron/wa-action-processor |
| skyvern-dispatcher-2min | `*/2 * * * *` | /api/cron/skyvern-dispatcher |
| chino-fixer | `*/10 * * * *` | /api/chino/fixer |
| steve-content-hunter-20min | `*/20 * * * *` | /api/cron/steve-content-hunter |
| chino-patrol | `*/30 * * * *` | /api/chino/run |
| abandoned-cart-wa-hourly | `0 * * * *` | /api/cron/abandoned-cart-wa |
| task-prioritizer-hourly | `0 */1 * * *` | /api/cron/task-prioritizer |
| steve-agent-loop-2h | `0 */2 * * *` | /api/cron/steve-agent-loop |
| swarm-research-2h | `0 */2 * * *` | /api/cron/swarm-research |
| prospect-followup-4h | `0 */4 * * *` | /api/cron/prospect-followup |
| error-budget-4h | `0 */4 * * *` | /api/cron/error-budget-calculator |
| onboarding-wa-4h | `0 */4 * * *` | /api/cron/onboarding-wa |
| sync-all-metrics-6h | `0 */6 * * *` | /api/cron/sync-all-metrics |
| predictive-alerts-6h | `0 */6 * * *` | /api/cron/predictive-alerts |
| reconciliation-6h | `0 */6 * * *` | /api/cron/reconciliation |
| chino-report | `0 0,6,12,18 * * *` | /api/chino/report/send |
| wolf-night-mode-3am | `0 3 * * *` | /api/cron/wolf-night-mode |
| auto-brief-generator-7am | `0 7 * * *` | /api/cron/auto-brief-generator |
| changelog-watcher-daily | `0 7 * * *` | /api/cron/changelog-watcher |
| performance-tracker-meta-8am | `0 8 * * *` | /api/cron/performance-tracker-meta |
| detective-visual-2h | `0 8,10,12,14,16,18,20 * * *` | /api/cron/detective-visual |
| auto-learning-digest-9am | `0 9 * * *` | /api/cron/auto-learning-digest |
| execute-meta-rules-9am | `0 9 * * *` | /api/cron/execute-meta-rules |
| wolf-morning-send-9am | `0 9 * * *` | /api/cron/wolf-morning-send |
| performance-evaluator-10am | `0 10 * * *` | /api/cron/performance-evaluator |
| fatigue-detector-11am | `0 11 * * *` | /api/cron/fatigue-detector |
| prospect-email-nurture-10am | `0 13 * * *` | /api/cron/prospect-email-nurture |
| churn-detector-daily | `0 14 * * *` | /api/cron/churn-detector |
| sales-learning-loop-8pm | `0 20 * * *` | /api/cron/sales-learning-loop |
| anomaly-detector-10pm | `0 22 * * *` | /api/cron/anomaly-detector |
| funnel-diagnosis-monday-5am | `0 5 * * 1` | /api/cron/funnel-diagnosis |
| competitor-spy-weekly | `0 6 * * 1` | /api/cron/competitor-spy |
| weekly-report-monday-8am | `0 11 * * 1` | /api/cron/weekly-report |
| root-cause-analysis-sun-2am | `0 2 * * 0` | /api/cron/root-cause-analysis |
| steve-discoverer-sun-2am | `0 2 * * 0` | /api/cron/steve-discoverer |
| rule-calibrator-sun-3am | `0 3 * * 0` | /api/cron/rule-calibrator |
| steve-prompt-evolver-sun-3am | `0 3 * * 0` | /api/cron/steve-prompt-evolver |
| revenue-attribution-sun-4am | `0 4 * * 0` | /api/cron/revenue-attribution |
| knowledge-quality-score-sun-5am | `0 5 * * 0` | /api/cron/knowledge-quality-score |
| merchant-upsell-sunday | `0 11 * * 0` | /api/cron/merchant-upsell |
| knowledge-dedup-monthly | `0 6 1 * *` | /api/cron/knowledge-dedup |
| cross-client-learning-monthly | `0 3 1 * *` | /api/cron/cross-client-learning |
| knowledge-decay-monthly | `0 4 1 * *` | /api/cron/knowledge-decay |
| knowledge-consolidator-monthly | `0 5 1 * *` | /api/cron/knowledge-consolidator |

## ⛔ NO TOCAR — Variables de entorno en Cloud Run (20 vars obligatorias)
**PROHIBIDO hacer deploy sin --update-env-vars. NUNCA usar --set-env-vars (reemplaza TODAS las vars).**
**Si se pierde UNA sola variable, funcionalidades CRÍTICAS dejan de funcionar.**

Después de CADA `gcloud run deploy steve-api`, ejecutar inmediatamente:
```bash
gcloud run services describe steve-api --region=us-central1 --project=steveapp-agency \
  --format='json(spec.template.spec.containers[0].env[].name)' | python3 -c "
import json,sys; data=json.load(sys.stdin)
names=[e['name'] for e in data['spec']['template']['spec']['containers'][0]['env']]
required=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY','ANTHROPIC_API_KEY',
'REPLICATE_API_KEY','FIRECRAWL_API_KEY','RESEND_API_KEY','OPENAI_API_KEY','GEMINI_API_KEY',
'META_APP_ID','META_APP_SECRET','APIFY_TOKEN','SENTRY_DSN','ENCRYPTION_KEY','CRON_SECRET',
'TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_PHONE_NUMBER','JOSE_WHATSAPP_NUMBER','ADMIN_WA_PHONE']
missing=[r for r in required if r not in names]
print(f'Total: {len(names)}/20')
if missing: print(f'⛔ FALTAN: {missing}')
else: print('✅ Todas presentes')
"
```

### Las 20 variables (NO BORRAR NINGUNA):
| Variable | Usa | Crítico para |
|----------|-----|-------------|
| `SUPABASE_URL` | Secret Manager | TODO |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret Manager | TODO |
| `SUPABASE_ANON_KEY` | Secret Manager | TODO |
| `ANTHROPIC_API_KEY` | Secret Manager | Steve AI, Opus, chat |
| `REPLICATE_API_KEY` | Secret Manager | Generación imágenes |
| `FIRECRAWL_API_KEY` | Secret Manager | Web scraping |
| `RESEND_API_KEY` | Secret Manager | Emails transaccionales |
| `OPENAI_API_KEY` | Valor directo | Embeddings, GPT fallback |
| `GEMINI_API_KEY` | Valor directo | Gemini fallback |
| `META_APP_ID` | Valor directo | OAuth Meta, token refresh, campañas |
| `META_APP_SECRET` | Valor directo | OAuth Meta, data deletion |
| `APIFY_TOKEN` | Valor directo | Swarm, competitor spy, scraping |
| `SENTRY_DSN` | Valor directo | Error tracking backend |
| `ENCRYPTION_KEY` | Valor directo | Encriptación tokens guardados |
| `CRON_SECRET` | Valor directo | Autenticación de crons |
| `TWILIO_ACCOUNT_SID` | Valor directo | WhatsApp Steve |
| `TWILIO_AUTH_TOKEN` | Valor directo | WhatsApp Steve |
| `TWILIO_PHONE_NUMBER` | Valor directo | WhatsApp Steve |
| `JOSE_WHATSAPP_NUMBER` | Valor directo | Alertas a JM |
| `ADMIN_WA_PHONE` | Valor directo | Alertas admin |

### Recuperar variables perdidas:
Si falta alguna, buscar en revisiones antiguas:
```bash
gcloud run revisions list --service=steve-api --region=us-central1 --project=steveapp-agency --format='value(name)' --limit=100 | tail -5
gcloud run revisions describe REVISION_NAME --region=us-central1 --project=steveapp-agency --format='json(spec.containers[0].env)'
```

### ❌ Pendiente: Google Ads
Faltan 3 credenciales para que Google Ads funcione:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_ADS_CLIENT_SECRET`
- `GOOGLE_ADS_DEVELOPER_TOKEN`

### ❌ Pendiente: Shopify App (instalación desde App Store)
Faltan 3 credenciales para que la Shopify App funcione via App Store:
- `SHOPIFY_CLIENT_ID`
- `SHOPIFY_CLIENT_SECRET`
- `SHOPIFY_WEBHOOK_SECRET`

### ❌ Pendiente: Skyvern (browser automation)
- `SKYVERN_API_KEY`
- `SKYVERN_API_URL`

Si alguna env var falta después del deploy, correr:
```bash
gcloud run services update steve-api --region us-central1 --project steveapp-agency \
  --set-env-vars VARIABLE=valor
```
Los valores están en el Secret Manager del proyecto o en el historial de deploys anteriores.

### Verificación automática (OpenClaw)
- Cron ID: `dd801d66-325e-4ddb-b7d4-2835be4f341f`
- Nombre: `verify-cloud-run-env`
- Cada 30 minutos corre `scripts/verify-cloud-run-env.sh`
- Si falta alguna env var → inserta task crítica en Supabase

## Sistema de Agentes con Memoria Persistente y Personalidad

### Activar un agente
Cuando el usuario diga "activa a [nombre]" o "soy [nombre]":
1. Leer `agents/personalities/[nombre-wN].md` — PERSONALIDAD, componentes Brain, mandato de desafío, **5 misiones internas**
2. Leer `agents/state/[nombre-wN].md` — estado actual, tareas, blockers
3. Leer `agents/memory/[nombre-wN].md` — journal acumulativo (si existe)
4. ADOPTAR la personalidad del agente: sus opiniones, su forma de hablar, sus red flags
5. **SYNC INMEDIATO a Supabase** — registrar que el agente se activó (ver protocolo abajo)
6. Trabajar en las tareas pendientes usando **delegación dinámica** (ver abajo)
7. DESAFIAR decisiones cuando corresponda

### Delegación Dinámica de Sub-Agentes (OBLIGATORIO)
Cada agente principal tiene **5 misiones internas** definidas en su personality MD.
Cuando un agente necesita trabajar en una misión específica, **DEBE spawnar un sub-agente enfocado**:

```
Agent tool → subagent_type: "general-purpose"
prompt: "[Prompt sub-agente de la misión específica]" + contexto de la tarea actual
```

**Reglas de delegación:**
- Cada sub-agente trabaja en UNA sola misión (M1-M5)
- El agente principal ORQUESTA: decide qué misión activar, revisa outputs, hace sync
- Si una tarea cruza 2+ misiones → spawna sub-agentes en paralelo
- Revisar SIEMPRE el output del sub-agente antes de dar por completada la tarea
- Después de cada sub-agente completado → SYNC a Supabase
- El prompt de cada sub-agente incluye un "NO toques X" explícito para evitar conflictos

**Ejemplo: Activar a Diego W8 para verificar tablas**
1. Diego se activa, lee su personality (5 misiones: Schema, Migraciones, RLS, Fuentes, Encriptación)
2. Para verificar schema → spawna sub-agente M1 con prompt: "Eres el especialista en schema de Diego W8..."
3. Para verificar RLS → spawna sub-agente M3 en paralelo con prompt: "Eres el especialista en RLS de Diego W8..."
4. Diego revisa outputs de ambos, consolida, hace sync
5. Si encuentra problemas → spawna sub-agente de la misión correspondiente para arreglar

**Estructura: 14 agentes × 5 misiones = 70 capacidades especializadas (dinámicas, no estáticas)**

### Protocolo de Desafío (OBLIGATORIO)
Cada agente DEBE:
- **CUESTIONAR** decisiones que contradigan su expertise (no ser yes-man)
- **SEÑALAR** red flags de su dominio aunque nadie pregunte
- **PROPONER** alternativas cuando algo no le convence
- **NEGARSE** a ejecutar acciones que rompan su área (con explicación)
- **REGISTRAR** sus desacuerdos en memory (para aprender de ellos)

Formato de desafío: "[NOMBRE] no está de acuerdo: [razón basada en datos]"
Si JM insiste después del desafío: ejecutar pero registrar la objeción.

### Sistema de Memoria (3 capas)
1. **Personalidad** (`agents/personalities/`) — NO CAMBIA. Quién es, qué defiende, cómo desafía.
2. **Estado** (`agents/state/`) — CAMBIA CADA SESIÓN. Tareas actuales, progreso, blockers.
3. **Journal** (`agents/memory/`) — CRECE SIEMPRE. Decisiones tomadas, descubrimientos, desacuerdos, lecciones aprendidas. Nunca se borra, solo se agrega.

### Actualizar MDs del agente
Editar `agents/state/[nombre].md`:
- Mover tareas completadas a "Completado" con fecha
- Actualizar "Última sesión" con fecha de hoy
- Agregar nuevos blockers

Editar o crear `agents/memory/[nombre].md`:
- Agregar entrada con fecha: qué se hizo, qué se descubrió, qué se discutió
- Si hubo desacuerdo con JM: registrar la postura del agente y el resultado
- Si se aprendió algo nuevo sobre el sistema: registrar para futuras sesiones

### ⛔ SYNC AGRESIVO A SUPABASE (OBLIGATORIO — NO ESPERAR AL FINAL)
Los agentes guardan estado en la tabla `agent_sessions` de forma AGRESIVA e INCREMENTAL.
**NO se espera al final de la sesión. Se guarda después de cada tramo pequeño de trabajo.**

#### Cuándo hacer sync (TODOS estos momentos):
1. **Al activarse** — apenas el agente se activa, sync con personality_md cargada
2. **Después de completar cada tarea** — aunque sea una sola tarea chica
3. **Después de descubrir algo** — un red flag, un dato, un hallazgo
4. **Después de un challenge/desacuerdo** — queda registrado inmediatamente
5. **Después de cada bloque de código escrito** — si editó archivos, sync
6. **Después de cada investigación** — si leyó tablas, verificó crons, etc.
7. **Si la conversación se siente larga** — sync preventivo cada ~5 interacciones

**Regla: si dudas si hacer sync, HAZLO. Es barato y previene pérdida de contexto.**

#### Cómo hacer sync:
```bash
curl -s -X PATCH "https://zpswjccsxjtnhetkkqde.supabase.co/rest/v1/agent_sessions?agent_code=eq.CODIGO" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwc3dqY2NzeGp0bmhldGtrcWRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYzMzY2OCwiZXhwIjoyMDg3MjA5NjY4fQ.xmTkRrqT7Hg5dPcc6vs6SnwikFvVqSjNAnnhfbQkjhQ" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwc3dqY2NzeGp0bmhldGtrcWRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYzMzY2OCwiZXhwIjoyMDg3MjA5NjY4fQ.xmTkRrqT7Hg5dPcc6vs6SnwikFvVqSjNAnnhfbQkjhQ" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d '{ CAMPOS_A_ACTUALIZAR }'
```

#### Sync por tipo de evento:
**Al activarse:**
```json
{"personality_md":"...", "session_count":N+1, "last_session_at":"NOW", "updated_at":"NOW"}
```
**Después de completar tarea:**
```json
{"status_md":"...", "tasks_completed":[...], "tasks_pending":[...], "updated_at":"NOW"}
```
**Después de challenge/descubrimiento:**
```json
{"memory_md":"...", "last_challenge":"texto del challenge", "updated_at":"NOW"}
```
**Sync completo (cada ~5 interacciones o al cerrar):**
```json
{"status_md":"...", "memory_md":"...", "last_challenge":"...", "tasks_pending":[], "tasks_completed":[], "updated_at":"NOW"}
```

Reemplazar CODIGO con w0, w2, w8, etc.
El admin panel en `/admin/organigrama` tab "Agentes en Vivo" lee de esta tabla en tiempo real.

### Ver estado del equipo
Cuando el usuario diga "estado del equipo":
- Leer todos los archivos en `agents/state/`
- Mostrar resumen: nombre, última sesión, % completado, blockers
- Incluir el último desacuerdo/pushback relevante de cada agente

### Mapeo Agente → Brain
- Diego W8: steve_sources, swarm_sources, migraciones, integridad datos
- Felipe W2: Meta OAuth, campaign_metrics, creative_history, performance tracking
- Rodrigo W0: Klaviyo sync, email_campaigns, email pipeline
- Sebastián W5: 45 crons, 69 edge functions, Cloud Run, env vars, health
- Tomás W7: steve_knowledge, swarm research, content hunter, agent loop, mantenimiento knowledge
- Isidora W6: 493 criterio_rules, evaluación calidad, rule calibration
- Camila W4: frontend, dashboards, portal cliente, approval UI

### Guía de fases
- Ver `agents/README.md` para el orden de activación
- NO activar agentes de Fase 2 sin Fase 1 completa
- NO activar agentes de Fase 3 sin Fase 2 completa

### Agentes Fase 1 (Plomería — activar primero)
- Diego W8: DB, fuentes, verificar crons → `agents/state/diego-w8.md`
- Felipe W2: Meta Ads, OAuth, sync → `agents/state/felipe-w2.md`
- Rodrigo W0: Klaviyo, sync, emails → `agents/state/rodrigo-w0.md`
- Sebastián W5: Infra, health-check, env vars → `agents/state/sebastian-w5.md`

## REGLA OBLIGATORIA: Bug → Task automático
Cuando cualquier agente encuentra un bug (severity: critical, major, high):
1. Insertar INMEDIATAMENTE en tabla tasks de Supabase:
```bash
