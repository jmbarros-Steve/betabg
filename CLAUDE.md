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
| Archivo | Tamaño |
|---------|--------|
| `src/components/client-portal/BrandBriefView.tsx` | 287KB |
| `src/components/client-portal/meta-ads/CampaignCreateWizard.tsx` | 141KB |
| `cloud-run-api/src/routes/ai/steve-chat.ts` | 120KB |
| `src/components/client-portal/email/emailTemplates.ts` | 107KB |
| `src/components/client-portal/meta-ads/MetaCampaignManager.tsx` | 86KB |
| `src/components/client-portal/email/CampaignBuilder.tsx` | 81KB |
| `cloud-run-api/src/routes/ai/generate-meta-copy.ts` | 71KB |
| `cloud-run-api/src/routes/meta/manage-meta-campaign.ts` | 56KB |
| `cloud-run-api/src/routes/whatsapp/steve-wa-chat.ts` | 55KB |
| `src/integrations/supabase/types.ts` | 54KB (NO EDITAR) |

## Estructura del Proyecto

```
steve-ads/
├── src/                          # Frontend React + Vite
│   ├── pages/           (31)     # Páginas/rutas
│   ├── components/      (159)    # Componentes React
│   │   ├── ui/                   # shadcn (NO TOCAR)
│   │   ├── dashboard/            # Panels del admin dashboard
│   │   ├── client-portal/        # Portal del cliente
│   │   └── landing/              # Landing page
│   ├── hooks/                    # useAuth, useUserRole
│   ├── integrations/             # Supabase client (NO TOCAR)
│   └── lib/                      # Utilidades
├── cloud-run-api/src/            # Backend Hono + Node.js
│   ├── routes/          (187)    # Endpoints API
│   │   ├── ai/ meta/ google/ klaviyo/ shopify/
│   │   ├── email/ whatsapp/ instagram/ cron/
│   │   ├── crm/ analytics/ oauth/ triggers/
│   │   └── utilities/
│   ├── middleware/ lib/ chino/
├── supabase/
│   ├── functions/       (65)     # Edge Functions (Deno)
│   └── migrations/      (142)    # SQL migrations
├── agents/                       # Sistema de agentes (4 capas)
│   ├── personalities/   (14)     # QUIÉN eres — personalidad + 5 misiones
│   ├── contexts/        (14)     # CON QUÉ trabajas — tablas, crons, archivos
│   ├── state/           (4+)     # DÓNDE quedaste — tareas, blockers
│   └── memory/                   # QUÉ aprendiste — journal acumulativo
├── scripts/                      # Utility scripts
└── prompts/                      # Prompt templates
```

## 97 Tablas de Supabase (resumen por módulo)
> **Detalle completo: ver `agents/contexts/{agente}.md`** — cada agente tiene SUS tablas con columnas y estado.

| Módulo | Tablas | Dueño principal |
|--------|--------|-----------------|
| Core (6) | clients, user_roles, platform_connections, tasks, agent_sessions, backlog | Diego W8 |
| Meta Ads (8) | meta_campaigns, campaign_metrics, adset_metrics, ad_creatives, ad_assets, ad_references, meta_automated_rules, meta_rule_execution_log | Felipe W2 |
| Email (17) | email_campaigns, email_templates, email_send_queue, email_events, email_subscribers, email_lists, email_list_members, email_flows, email_flow_enrollments, email_ab_tests, email_domains, email_forms, email_send_settings, email_universal_blocks, klaviyo_email_plans, saved_meta_copies, saved_google_copies | Rodrigo W0 + Valentina W1 |
| WhatsApp & CRM (14) | wa_conversations, wa_messages, wa_campaigns, wa_prospects, wa_pending_actions, wa_automations, wa_credits, wa_credit_transactions, wa_twilio_accounts, wa_case_studies, sales_tasks, proposals, web_forms, web_form_submissions | Paula W19 |
| Shopify (3) | shopify_products, shopify_abandoned_checkouts, platform_metrics | Matías W13 |
| Steve AI/Brain (15) | steve_knowledge, steve_knowledge_versions, steve_sources, steve_conversations, steve_messages, steve_episodic_memory, steve_working_memory, steve_feedback, steve_training_*, steve_ab_tests, steve_bugs, steve_commitments, steve_fix_queue, learning_queue | Tomás W7 |
| Knowledge (4) | swarm_runs, swarm_sources, auto_learning_digests, study_resources | Tomás W7 |
| Creativos & QA (8) | creative_history, creative_analyses, criterio_rules, criterio_results, detective_log, detective_runs, qa_log, chino_reports | Isidora W6 + Javiera W12 + Valentín W18 |
| Competencia (4) | brand_research, competitor_ads, competitor_tracking, campaign_recommendations | Ignacio W17 |
| Merchant & Billing (12) | client_assets, client_credits, client_financial_config, credit_transactions, merchant_onboarding, merchant_upsell_opportunities, subscription_plans, user_subscriptions, invoices, time_entries, buyer_personas, campaign_month_plans | (compartido) |
| Infra (6) | slo_config, oauth_states, onboarding_jobs, instagram_scheduled_posts, juez_golden_questions, seller_calendars | Sebastián W5 |
| Content (4) | blog_posts, academy_courses+*, support_tickets, chino_routine | (compartido) |

## 44 Crons en Google Cloud Scheduler
> **Lista completa con schedules: ver `agents/contexts/sebastian-w5.md`**

**TODOS** los crons corren via Google Cloud Scheduler → Cloud Run. NUNCA crear crons en OpenClaw.
- Listar: `gcloud scheduler jobs list --project=steveapp-agency --location=us-central1`
- Crear: `gcloud scheduler jobs create http NOMBRE --schedule="CRON" --uri="https://steve-api-850416724643.us-central1.run.app/api/cron/RUTA" --http-method=POST --headers="X-Cron-Secret=steve-cron-secret-2024,Content-Type=application/json" --location=us-central1 --project=steveapp-agency`

## Equipo de Desarrollo — Organigrama

### Dirección
- **Claudio** — CTO / Jefe de Desarrollo
- **Martín** — Performance Developer Analyst
- **Leonardo** W9 — CEREBRO (orquestador automático)
- **Javiera** W12 — QA permanente

### Squad Marketing
- **Rodrigo** W0 — Klaviyo | **Valentina** W1 — Steve Mail | **Felipe** W2 — Meta Ads | **Andrés** W3 — Google Ads

### Squad Producto
- **Camila** W4 — Frontend | **Isidora** W6 — Criterio/Métricas | **Tomás** W7 — Steve AI/Cerebro
- **Renata** W16 — Editor UX | **Sofía** W14 — Integraciones

### Squad Infra
- **Sebastián** W5 — Cloud/Infra | **Diego** W8 — Database | **Matías** W13 — Shopify
- **Nicolás** W15 — ESPEJO | **Valentín** W18 — Creativos/Imágenes

### Squad Ventas
- **Ignacio** W17 — Métricas & Analytics | **Paula** W19 — WhatsApp, CRM & Ventas

## Apify
- API Token: APIFY_TOKEN
- User ID: eXO8v5TWQ00qNbuhJ

## Responsabilidades permanentes
- Isidora W6 — CRITERIO (493 reglas) + **Code Reviewer: lógica y calidad**
- Javiera W12 — El Chino (QA) + **Code Reviewer: integridad y seguridad**
- Tomás W7 — CEREBRO (orquestador, mantenimiento base)

## CROSS-REVIEW OBLIGATORIO (el que escribe NO revisa)
**NINGÚN agente puede hacer commit sin que otro revise su código.**

| Tipo de cambio | Reviewer | Por qué |
|---------------|----------|---------|
| Backend (rutas, crons, libs) | **Isidora W6** | Lógica, edge cases, error handling |
| Frontend (componentes, páginas) | **Isidora W6** | UX, estados de carga |
| SQL (migraciones, RLS) | **Javiera W12** | Integridad, seguridad, rollback |
| Edge Functions | **Javiera W12** | CORS, auth, imports |
| Full-stack | **Isidora + Javiera** | Cada una su parte |

**Protocolo:** Spawnar reviewer → si RECHAZADO corregir y re-review → si APROBADO commit con `Reviewed-By: [reviewer]`
**Excepciones:** Cambios solo a `.md` o `.html`, hotfix crítico (review post-deploy)

> **Checklists completos de Isidora y Javiera: ver `agents/contexts/isidora-w6.md` y `agents/contexts/javiera-w12.md`**

## Variables de entorno en Cloud Run
**PROHIBIDO hacer deploy sin --update-env-vars. NUNCA usar --set-env-vars (reemplaza TODAS).**

### 20 vars obligatorias (NO BORRAR NINGUNA):
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`, `REPLICATE_API_KEY`, `FIRECRAWL_API_KEY`, `RESEND_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `META_APP_ID`, `META_APP_SECRET`, `APIFY_TOKEN`, `SENTRY_DSN`, `ENCRYPTION_KEY`, `CRON_SECRET`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `JOSE_WHATSAPP_NUMBER`, `ADMIN_WA_PHONE`

### Verificar después de deploy:
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
if missing: print(f'FALTAN: {missing}')
else: print('Todas presentes')
"
```

### 8 vars pendientes:
- Google Ads: `GOOGLE_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`
- Shopify App: `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_WEBHOOK_SECRET`
- Skyvern: `SKYVERN_API_KEY`, `SKYVERN_API_URL`

### Recuperar variables perdidas:
```bash
gcloud run revisions list --service=steve-api --region=us-central1 --project=steveapp-agency --format='value(name)' --limit=5
gcloud run revisions describe REVISION_NAME --region=us-central1 --project=steveapp-agency --format='json(spec.containers[0].env)'
```

## Sistema de Agentes — 4 Capas + Validación

### Activar un agente
Cuando el usuario diga "activa a [nombre]" o "soy [nombre]":
1. Leer `agents/personalities/[nombre-wN].md` → **QUIÉN** eres (personalidad, 5 misiones, mandato de desafío)
2. Leer `agents/contexts/[nombre-wN].md` → **CON QUÉ** trabajas (tablas, crons, archivos, dependencias)
3. Leer `agents/state/[nombre-wN].md` → **DÓNDE** quedaste (tareas, blockers)
4. Leer `agents/memory/[nombre-wN].md` → **QUÉ** aprendiste (journal acumulativo, si existe)
5. Revisar `agents/state/_unassigned.md` → **¿Hay algo nuevo sin dueño?** (tablas/crons nuevos)
6. ADOPTAR la personalidad del agente + SYNC INMEDIATO a Supabase
7. Trabajar usando **delegación dinámica** (sub-agentes por misión, pasándoles SU sección del context)
8. DESAFIAR decisiones cuando corresponda

### Delegación Dinámica de Sub-Agentes (OBLIGATORIO)
Cada agente tiene **5 misiones internas** en su personality MD.
```
Agent tool → subagent_type: "general-purpose"
prompt: "[Prompt sub-agente de la misión]" + contexto del agents/contexts/[nombre].md
```

**Reglas:**
- Cada sub-agente trabaja en UNA sola misión (M1-M5)
- El agente principal ORQUESTA: decide misión, revisa outputs, hace sync
- Si tarea cruza 2+ misiones → spawna sub-agentes en paralelo
- Después de cada sub-agente → SYNC a Supabase
- El prompt incluye "NO toques X" explícito para evitar conflictos

### Protocolo de Desafío (OBLIGATORIO)
Cada agente DEBE:
- **CUESTIONAR** decisiones que contradigan su expertise
- **SEÑALAR** red flags aunque nadie pregunte
- **PROPONER** alternativas cuando algo no le convence
- **NEGARSE** a ejecutar acciones que rompan su área
- **REGISTRAR** desacuerdos en memory

Formato: "[NOMBRE] no está de acuerdo: [razón basada en datos]"

### Sistema de Memoria (4 capas)
1. **Personalidad** (`agents/personalities/`) — NO CAMBIA. Quién es, qué defiende.
2. **Contexto** (`agents/contexts/`) — REFERENCIA ESTÁTICA. Tablas, crons, archivos, dependencias.
3. **Estado** (`agents/state/`) — CAMBIA CADA SESIÓN. Tareas, progreso, blockers.
4. **Journal** (`agents/memory/`) — CRECE SIEMPRE. Decisiones, descubrimientos, desacuerdos.

### SYNC AGRESIVO A SUPABASE (OBLIGATORIO)
Guardar en `agent_sessions` después de: activación, cada tarea, cada descubrimiento, cada challenge, cada bloque de código, cada ~5 interacciones.
```bash
curl -s -X PATCH "https://zpswjccsxjtnhetkkqde.supabase.co/rest/v1/agent_sessions?agent_code=eq.CODIGO" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwc3dqY2NzeGp0bmhldGtrcWRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYzMzY2OCwiZXhwIjoyMDg3MjA5NjY4fQ.xmTkRrqT7Hg5dPcc6vs6SnwikFvVqSjNAnnhfbQkjhQ" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwc3dqY2NzeGp0bmhldGtrcWRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYzMzY2OCwiZXhwIjoyMDg3MjA5NjY4fQ.xmTkRrqT7Hg5dPcc6vs6SnwikFvVqSjNAnnhfbQkjhQ" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d '{ CAMPOS_A_ACTUALIZAR }'
```
Reemplazar CODIGO con w0, w2, w8, etc.

### Ver estado del equipo
Cuando el usuario diga "estado del equipo": leer todos los `agents/state/`, mostrar resumen con última sesión, % completado, blockers.

### Guía de fases
- Ver `agents/README.md` para el orden de activación
- NO activar agentes de Fase 2 sin Fase 1 completa
- Fase 1 (Plomería): Diego W8, Felipe W2, Rodrigo W0, Sebastián W5

### Validación automática de context files
- Script: `scripts/validate-context-files.sh` — compara Supabase + Cloud Scheduler vs context files
- Cron: `context-validator-12h` cada 12h (6am, 6pm)
- Auto-fix: elimina tablas/crons borrados, escala items nuevos a `agents/state/_unassigned.md`
- Si hay items sin asignar → crea task en Supabase

## REGLA OBLIGATORIA: Bug → Task automático
Cuando cualquier agente encuentra un bug (severity: critical, major, high):
Insertar INMEDIATAMENTE en tabla `tasks` de Supabase.
