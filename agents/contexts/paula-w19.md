# Paula W19 — Contexto Operacional

## Tus Tablas
| Tabla | Columnas clave | Estado |
|-------|---------------|--------|
| `wa_conversations` | client_id, prospect_id, status, created_at | Posiblemente vacias |
| `wa_messages` | conversation_id, direction (in/out), content, status, created_at | Posiblemente vacias |
| `wa_campaigns` | client_id, name, template, audience, status | Desconocido |
| `wa_prospects` | client_id, name, phone, email, stage, deal_value | Desconocido |
| `wa_pending_actions` | conversation_id, action_type, scheduled_at, status | Desconocido |
| `wa_automations` | client_id, trigger, action, active | Desconocido |
| `wa_credits` | client_id, balance, last_updated | Desconocido |
| `wa_credit_transactions` | client_id, amount, type (credit/debit), reason | Desconocido |
| `wa_twilio_accounts` | client_id, account_sid, phone_number | Desconocido |
| `wa_case_studies` | client_id, title, results, published | Desconocido |
| `sales_tasks` | seller_id, prospect_id, task_type, due_date, status | Desconocido |
| `proposals` | client_id, prospect_id, amount, status, created_at | Desconocido |
| `web_forms` | name, fields, redirect_url, active | Desconocido |
| `web_form_submissions` | form_id, data, created_at | Desconocido |

## Tablas que Lees (de otros agentes)
| Tabla | Dueno | Para que la lees |
|-------|-------|-----------------|
| `shopify_abandoned_checkouts` | Matias W13 | Carritos abandonados para WA recovery |
| `platform_connections` | Diego W8 | Config Twilio |
| `clients` | Diego W8 | Merchant data |

## Tus Crons
| Job | Schedule | Endpoint | Estado conocido |
|-----|----------|----------|----------------|
| `wa-action-processor-1min` | `* * * * *` | /api/cron/wa-action-processor | Activo |
| `prospect-followup-4h` | `0 */4 * * *` | /api/cron/prospect-followup | Activo |
| `abandoned-cart-wa-hourly` | `0 * * * *` | /api/cron/abandoned-cart-wa | Activo |
| `onboarding-wa-4h` | `0 */4 * * *` | /api/cron/onboarding-wa | Activo |
| `prospect-email-nurture-10am` | `0 13 * * *` | /api/cron/prospect-email-nurture | Activo |
| `sales-learning-loop-8pm` | `0 20 * * *` | /api/cron/sales-learning-loop | Activo |
| `churn-detector-daily` | `0 14 * * *` | /api/cron/churn-detector | Activo |
| `merchant-upsell-sunday` | `0 11 * * 0` | /api/cron/merchant-upsell | Activo |

## Tus Archivos
- Backend: `cloud-run-api/src/routes/whatsapp/steve-wa-chat.ts` (55KB), `send-message.ts`, `send-campaign.ts`, `status-callback.ts`
- Backend CRM: `prospect-crm.ts`, `sales-tasks.ts`, `sellers.ts`, `proposals.ts`, `web-forms.ts`, `prospect-trial.ts`
- Backend crons: `wa-action-processor.ts`, `prospect-followup.ts`, `abandoned-cart-wa.ts`, `onboarding-wa.ts`, `prospect-email-nurture.ts`, `sales-learning-loop.ts`, `churn-detector.ts`, `merchant-upsell.ts`
- Libs: `prospect-event-logger.ts`, `steve-sales-deck.ts`
- Edge Functions: (ninguna especifica)
- Frontend: WhatsApp & CRM panels

## Tus Edge Functions
- (Ninguna especifica — toda la logica WA/CRM esta en Cloud Run)

## APIs Externas
- Twilio (WhatsApp Business API)
- Anthropic (AI chat en steve-wa-chat)

## Dependencias
- Necesitas de: Matias W13 (Shopify para carritos abandonados — DESCONECTADO), Twilio env vars (presentes), Diego W8 (clients, platform_connections)
- Alimentas a: Ignacio W17 (pipeline data), Tomas W7 (sales learning)

## Problemas Conocidos
- `wa_conversations` posiblemente vacias — nadie usa WA Steve todavia?
- Prospects sin followup efectivo
- `abandoned-cart-wa` depende de Shopify (desconectado via Matias W13)
- `steve-wa-chat.ts` es >55KB — LEER ANTES DE TOCAR, archivo gigante
- `wa-action-processor` corre cada minuto — verificar que no este quemando recursos en vacio
- 14 tablas propias — modulo mas grande del sistema en schema
- 8 crons activos — modulo mas activo en scheduling
