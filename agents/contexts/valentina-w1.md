# Valentina W1 — Contexto Operacional

## Tus Tablas
| Tabla | Columnas clave | Estado |
|-------|---------------|--------|
| `email_campaigns` | client_id, name, subject, status, scheduled_at | Compartida con Rodrigo W0 |
| `email_send_queue` | campaign_id, subscriber_id, status | **0 filas (ROTO)** — Compartida con Rodrigo W0 |
| `email_templates` | client_id, name, html, category | Compartida con Rodrigo W0 |
| `email_subscribers` | client_id, email, first_name, status, tags | OK |
| `email_lists` | client_id, name, type (static/dynamic) | OK |
| `email_list_members` | list_id, subscriber_id | OK |
| `email_flows` | client_id, name, trigger_type, status | OK |
| `email_flow_enrollments` | flow_id, subscriber_id, current_step | OK |
| `email_ab_tests` | campaign_id, variant_a, variant_b, winner | OK |
| `email_domains` | client_id, domain, verified (SES) | OK |
| `email_forms` | client_id, name, fields, redirect_url | OK |
| `email_send_settings` | client_id, provider (ses/resend), config | OK |
| `email_universal_blocks` | name, html, category | OK |
| `saved_meta_copies` | client_id, copy_text, angle | OK |
| `saved_google_copies` | client_id, copy_text | OK |

## Tablas que Lees (de otros agentes)
| Tabla | Dueno | Para que la lees |
|-------|-------|-----------------|
| `platform_connections` | Diego W8 | Config SMTP / provider |
| `brand_research` | Ignacio W17 | Contexto de marca para emails |

## Tus Crons
| Job | Schedule | Endpoint | Estado conocido |
|-----|----------|----------|----------------|
| `wolf-morning-send-9am` | `0 9 * * *` | /api/cron/wolf-morning-send | Activo |
| `wolf-night-mode-3am` | `0 3 * * *` | /api/cron/wolf-night-mode | Activo |

## Tus Archivos
- Backend: `manage-campaigns.ts` (29KB), `send-email.ts`, `send-queue.ts`, `flow-engine.ts` (31KB), `flow-webhooks.ts` (32KB), `generate-email-content.ts`, `sync-subscribers.ts`, `query-subscribers.ts`, `manage-email-lists.ts`, `list-cleanup.ts`, `campaign-analytics.ts` (20KB), `ab-testing.ts` (12KB), `revenue-attribution.ts` (16KB), `smart-send-time.ts`
- Frontend: `CampaignBuilder.tsx` (81KB), `GrapesEmailEditor.tsx`, `EmailTemplateGallery`, `FlowBuilder`, `FlowCanvas`, `SubscribersList`, `SegmentBuilder`, `ClickHeatmapPanel`, `ABTestResultsPanel`, `GlobalStylesPanel`
- Edge Functions: `steve-email-content`, `steve-send-time-analysis`, `parse-email-html`
- Libs: `email-html-processor.ts` (25KB), `grapes-steve-blocks.ts`

## Tus Edge Functions
- `steve-email-content` — genera contenido de email con AI
- `steve-send-time-analysis` — analiza mejor horario de envio por suscriptor
- `parse-email-html` — parsea y procesa HTML de emails

## Dependencias
- Necesitas de: Diego W8 (schema), Rodrigo W0 (Klaviyo sync)
- Alimentas a: Rodrigo W0 (templates para Klaviyo), Isidora W6 (evaluacion email)

## Problemas Conocidos
- `email_send_queue` = 0 filas — pipeline de envio completamente roto (compartido con Rodrigo)
- Editor GrapeJS tiene bugs conocidos — comportamiento inconsistente
- `flow-engine.ts` (31KB) y `flow-webhooks.ts` (32KB) son archivos enormes, candidatos a refactor
- `CampaignBuilder.tsx` es 81KB — componente frontend monstruoso
- `email-html-processor.ts` es 25KB — lib compleja
- Tablas compartidas con Rodrigo W0 (`email_campaigns`, `email_send_queue`, `email_templates`) — riesgo de conflictos de ownership

## Steve Tools (consumidas por Michael W25)
Patrón en `_shared.md`. Doc del contrato en `docs/STEVE-PROPOSALS-CONTRACT.md`.

### 🟦 Acción Directa
| Tool name | Endpoint subyacente | Inputs | Confirmación |
|-----------|---------------------|--------|--------------|
| `generar_contenido_email` | POST /api/email/generate-email-content | `{ target_audience, subject_type, tone }` | No |
| `enviar_test_email` | POST /api/email/send-test | `{ email, template_ref }` | No |
| `gestionar_lista_email` | POST /api/email/manage-email-lists | `{ action: 'create'\|'rename'\|'delete', list_id?, name? }` | No |

### 🟪 Propuesta + Wizard precargable
| proposal_type | Wizard | Endpoint status | Schema |
|---------------|--------|-----------------|--------|
| `email_ab_test` | `CampaignBuilder.tsx` modo A/B (acepta `?proposal=<id>`) | POST /api/proposals/:id/status | [contract](../../docs/STEVE-PROPOSALS-CONTRACT.md#email_ab_test) |
| `email_template` | builder visual (acepta `?proposal=<id>`) | POST /api/proposals/:id/status | [contract](../../docs/STEVE-PROPOSALS-CONTRACT.md#email_template) |

**Pendientes para Valentina:**
- [ ] Habilitar parser `?proposal=<id>` en CampaignBuilder y builder visual
- [ ] Coordinar con Rodrigo W0 cuando proposal afecta tablas compartidas (`email_campaigns`, `email_templates`)
- [ ] Boundary clara: Valentina = templates/A-B/builder. Rodrigo = flows/segmentos/Klaviyo nativo
