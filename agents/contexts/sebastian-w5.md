# Sebastián W5 — Contexto Operacional

## Tus Tablas
| Tabla | Columnas clave | Estado |
|-------|---------------|--------|
| `slo_config` | cuj_name, error_budget_pct, status (healthy/warning/critical/frozen) | 4 CUJs |
| `oauth_states` | state, redirect_uri, expires_at | Activa |
| `onboarding_jobs` | client_id, job_type, status | Activa |
| `instagram_scheduled_posts` | client_id, media_url, scheduled_at, status | Activa |
| `juez_golden_questions` | question, expected_answer, category | Activa |
| `seller_calendars` | seller_id, available_slots | Activa |

## Tablas que Lees (de otros agentes)
| Tabla | Dueño | Para qué la lees |
|-------|-------|-----------------|
| `qa_log` | Javiera W12 | Para health monitoring |
| `agent_sessions` | Diego W8 | Para verificar que agentes sincen |
| ALL tables indirectly | Varios | Infra supports everything |

## Tus Crons
| Job | Schedule | Endpoint | Estado conocido |
|-----|----------|----------|----------------|
| wa-action-processor-1min | `* * * * *` | /api/cron/wa-action-processor | Activo |
| skyvern-dispatcher-2min | `*/2 * * * *` | /api/cron/skyvern-dispatcher | Activo |
| chino-fixer | `*/10 * * * *` | /api/chino/fixer | Activo |
| steve-content-hunter-20min | `*/20 * * * *` | /api/cron/steve-content-hunter | Activo |
| chino-patrol | `*/30 * * * *` | /api/chino/run | Activo |
| abandoned-cart-wa-hourly | `0 * * * *` | /api/cron/abandoned-cart-wa | Activo |
| task-prioritizer-hourly | `0 */1 * * *` | /api/cron/task-prioritizer | Activo |
| steve-agent-loop-2h | `0 */2 * * *` | /api/cron/steve-agent-loop | Activo |
| swarm-research-2h | `0 */2 * * *` | /api/cron/swarm-research | Activo |
| prospect-followup-4h | `0 */4 * * *` | /api/cron/prospect-followup | Activo |
| error-budget-4h | `0 */4 * * *` | /api/cron/error-budget-calculator | Activo |
| onboarding-wa-4h | `0 */4 * * *` | /api/cron/onboarding-wa | Activo |
| sync-all-metrics-6h | `0 */6 * * *` | /api/cron/sync-all-metrics | Activo |
| predictive-alerts-6h | `0 */6 * * *` | /api/cron/predictive-alerts | Activo |
| reconciliation-6h | `0 */6 * * *` | /api/cron/reconciliation | Activo |
| chino-report | `0 0,6,12,18 * * *` | /api/chino/report/send | Activo |
| wolf-night-mode-3am | `0 3 * * *` | /api/cron/wolf-night-mode | Activo |
| auto-brief-generator-7am | `0 7 * * *` | /api/cron/auto-brief-generator | Activo |
| changelog-watcher-daily | `0 7 * * *` | /api/cron/changelog-watcher | Activo |
| performance-tracker-meta-8am | `0 8 * * *` | /api/cron/performance-tracker-meta | Activo |
| detective-visual-2h | `0 8,10,12,14,16,18,20 * * *` | /api/cron/detective-visual | Activo |
| auto-learning-digest-9am | `0 9 * * *` | /api/cron/auto-learning-digest | Activo |
| execute-meta-rules-9am | `0 9 * * *` | /api/cron/execute-meta-rules | Activo |
| wolf-morning-send-9am | `0 9 * * *` | /api/cron/wolf-morning-send | Activo |
| performance-evaluator-10am | `0 10 * * *` | /api/cron/performance-evaluator | Activo |
| fatigue-detector-11am | `0 11 * * *` | /api/cron/fatigue-detector | Activo |
| prospect-email-nurture-10am | `0 13 * * *` | /api/cron/prospect-email-nurture | Activo |
| churn-detector-daily | `0 14 * * *` | /api/cron/churn-detector | Activo |
| sales-learning-loop-8pm | `0 20 * * *` | /api/cron/sales-learning-loop | Activo |
| anomaly-detector-10pm | `0 22 * * *` | /api/cron/anomaly-detector | Activo |
| funnel-diagnosis-monday-5am | `0 5 * * 1` | /api/cron/funnel-diagnosis | Activo |
| competitor-spy-weekly | `0 6 * * 1` | /api/cron/competitor-spy | Activo |
| weekly-report-monday-8am | `0 11 * * 1` | /api/cron/weekly-report | Activo |
| root-cause-analysis-sun-2am | `0 2 * * 0` | /api/cron/root-cause-analysis | Activo |
| steve-discoverer-sun-2am | `0 2 * * 0` | /api/cron/steve-discoverer | Activo |
| rule-calibrator-sun-3am | `0 3 * * 0` | /api/cron/rule-calibrator | Activo |
| steve-prompt-evolver-sun-3am | `0 3 * * 0` | /api/cron/steve-prompt-evolver | Activo |
| revenue-attribution-sun-4am | `0 4 * * 0` | /api/cron/revenue-attribution | Activo |
| knowledge-quality-score-sun-5am | `0 5 * * 0` | /api/cron/knowledge-quality-score | Activo |
| merchant-upsell-sunday | `0 11 * * 0` | /api/cron/merchant-upsell | Activo |
| knowledge-dedup-monthly | `0 6 1 * *` | /api/cron/knowledge-dedup | Activo |
| cross-client-learning-monthly | `0 3 1 * *` | /api/cron/cross-client-learning | Activo |
| knowledge-decay-monthly | `0 4 1 * *` | /api/cron/knowledge-decay | Activo |
| knowledge-consolidator-monthly | `0 5 1 * *` | /api/cron/knowledge-consolidator | Activo |

## Tus Archivos
- Backend: `cloud-run-api/src/routes/cron/*.ts` (44 files), `cloud-run-api/src/routes/index.ts`
- Scripts: `scripts/restart-services.sh`, `scripts/verify-cloud-run-env.sh`, `scripts/restore-cloud-run-env.sh`, `scripts/setup-cloud-scheduler.sh`
- Edge Functions: ALL 65 (deployment responsibility)

## Tus Edge Functions
Todas las 65 edge functions son responsabilidad de deployment de Sebastián.

## Env Vars Obligatorias (20)
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, ANTHROPIC_API_KEY, REPLICATE_API_KEY, FIRECRAWL_API_KEY, RESEND_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, META_APP_ID, META_APP_SECRET, APIFY_TOKEN, SENTRY_DSN, ENCRYPTION_KEY, CRON_SECRET, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, JOSE_WHATSAPP_NUMBER, ADMIN_WA_PHONE

## Env Vars Faltantes (8)
GOOGLE_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, SHOPIFY_WEBHOOK_SECRET, SKYVERN_API_KEY, SKYVERN_API_URL

## Dependencias
- Necesitas de: nadie (eres la infra)
- Alimentas a: TODOS (infra que ejecuta todo)

## Problemas Conocidos
- 45 crons sin monitoreo real de output
- health-check cubre 14% endpoints (10/69)
- swarm_runs 95% failure rate
- 8 env vars faltantes
- Silent failures generalizados
