# Rodrigo W0 — Contexto Operacional

## Tus Tablas
| Tabla | Columnas clave | Estado |
|-------|---------------|--------|
| `email_campaigns` | client_id, name, subject, status, scheduled_at, sent_count | OK |
| `email_send_queue` | campaign_id, subscriber_id, status, sent_at | **0 filas (ROTO)** |
| `email_events` | campaign_id, subscriber_id, event_type (open/click/bounce), created_at | OK |
| `email_templates` | client_id, name, html, source (klaviyo/custom) | OK |
| `klaviyo_email_plans` | client_id, plan_data, synced_at | OK |

## Tablas que Lees (de otros agentes)
| Tabla | Dueno | Para que la lees |
|-------|-------|-----------------|
| `platform_connections` | Diego W8 | Tokens Klaviyo |
| `email_subscribers` | Valentina W1 | Contactos para sync a Klaviyo |

## Tus Crons
| Job | Schedule | Endpoint | Estado conocido |
|-----|----------|----------|----------------|
| (ninguno) | — | — | Rodrigo no tiene crons directos en Cloud Scheduler |

## Tus Archivos
- Backend: (ninguno en cloud-run-api)
- Frontend: `ImportKlaviyoDialog` + 8 componentes mas (9 total), `KlaviyoMetricsPanel`
- Edge Functions: `klaviyo-push-emails`, `klaviyo-manage-flows` (54KB), `klaviyo-smart-format`, `import-klaviyo-templates`, `upload-klaviyo-drafts`, `fetch-klaviyo-top-products`, `store-klaviyo-connection`, `sync-klaviyo-metrics`
- Libs: (ninguna)

## Tus Edge Functions
- `klaviyo-push-emails` — envia emails via Klaviyo API
- `klaviyo-manage-flows` (54KB) — gestion completa de flows Klaviyo
- `klaviyo-smart-format` — formateo inteligente de contenido para Klaviyo
- `import-klaviyo-templates` — importa templates desde Klaviyo
- `upload-klaviyo-drafts` — sube borradores a Klaviyo
- `fetch-klaviyo-top-products` — obtiene top productos desde Klaviyo
- `store-klaviyo-connection` — almacena conexion Klaviyo
- `sync-klaviyo-metrics` — sincroniza metricas de Klaviyo

## Dependencias
- Necesitas de: Diego W8 (tokens), Valentina W1 (templates Steve Mail)
- Alimentas a: Felipe W2 (audiencias Klaviyo -> Meta), Ignacio W17 (email metrics)

## Problemas Conocidos
- `email_send_queue` = 0 filas — pipeline de envio completamente roto
- API keys Klaviyo no verificadas — no se sabe si las keys actuales funcionan
- `klaviyo-manage-flows` es 54KB — archivo enorme, dificil de mantener
- Sin crons propios: la sincronizacion depende de llamadas manuales o triggers externos

## Steve Tools (consumidas por Michael W25)
Patrón en `_shared.md`. Doc del contrato en `docs/STEVE-PROPOSALS-CONTRACT.md`.

### 🟦 Acción Directa
| Tool name | Endpoint subyacente | Inputs | Confirmación |
|-----------|---------------------|--------|--------------|
| `enviar_test_klaviyo` | POST /api/email/send-test | `{ email_address, template_ref }` | No |
| `sync_segment_klaviyo_to_meta` | POST /api/sync-klaviyo-to-meta-audience | `{ segment_id }` | No |
| `lanzar_campania_klaviyo_simple` | POST /api/klaviyo/send-campaign | `{ campaign_id }` (campaña ya creada) | Sí (revisión final) |

### 🟪 Propuesta + Wizard precargable
| proposal_type | Wizard | Endpoint status | Schema |
|---------------|--------|-----------------|--------|
| `klaviyo_flow` | flow canvas en `src/components/client-portal/email/` (acepta `?proposal=<id>`) | POST /api/proposals/:id/status | [contract](../../docs/STEVE-PROPOSALS-CONTRACT.md#klaviyo_flow) |
| `klaviyo_campaign` | `CampaignBuilder.tsx` (acepta `?proposal=<id>`) | POST /api/proposals/:id/status | [contract](../../docs/STEVE-PROPOSALS-CONTRACT.md#klaviyo_campaign) |

**Pendientes para Rodrigo:**
- [ ] Habilitar parser `?proposal=<id>` en flow canvas y CampaignBuilder
- [ ] Validación previa: requiere `platform_connections.klaviyo` activa
