# Valentin W18 — Contexto Operacional

## Tus Tablas
| Tabla | Columnas clave | Estado |
|-------|---------------|--------|
| `creative_history` | client_id, copy_text, angle, score, verdict (excelente/bueno/malo), created_at | 53 registros |
| `creative_assets` | client_id, type (image/video), url, prompt_used, created_at | Activo |
| `ad_creatives` | client_id, headline, body, image_url, status | Shared con Felipe W2 |

## Tablas que Lees (de otros agentes)
| Tabla | Dueno | Para que la lees |
|-------|-------|-----------------|
| `campaign_metrics` | Felipe W2 | Performance para evaluar creativos |
| `brand_research` | Ignacio W17 | Contexto de marca |
| `criterio_rules` | Isidora W6 | Reglas a inyectar en generacion |

## Tus Crons
| Job | Schedule | Endpoint | Estado conocido |
|-----|----------|----------|----------------|
| `fatigue-detector-11am` | `0 11 * * *` | /api/cron/fatigue-detector | Activo |
| `performance-evaluator-10am` | `0 10 * * *` | /api/cron/performance-evaluator | Activo |
| `detective-visual-2h` | `0 8,10,12,14,16,18,20 * * *` | /api/cron/detective-visual | Activo (7x/dia) |

## Tus Archivos
- Backend: `cloud-run-api/src/routes/ai/generate-meta-copy.ts` (71KB), `creative-preview.ts`, `generate-mass-campaigns.ts`
- Backend crons: `fatigue-detector.ts`, `performance-evaluator.ts`, `performance-tracker-meta.ts`, `detective-visual.ts`
- Edge Functions: `generate-copy`, `generate-image`, `generate-video`
- Libs: `cloud-run-api/src/lib/angle-detector.ts`, `cloud-run-api/src/lib/creative-context.ts`, `src/lib/creative-context.ts`
- Frontend: Creative panels in CampaignStudio

## Tus Edge Functions
- `generate-copy` — Genera copy publicitario con AI (Anthropic)
- `generate-image` — Genera imagenes con AI (Fal.ai / Replicate)
- `generate-video` — Genera video con AI (Replicate)

## Dependencias
- Necesitas de: Felipe W2 (campaign data), Isidora W6 (CRITERIO rules), APIs: Fal.ai, Replicate, Anthropic
- Alimentas a: Felipe W2 (creativos para campanas), Isidora W6 (creative_history para calibrar), Brain (creative context)

## Problemas Conocidos
- `creative_history` solo 53 registros para 127 clientes — cobertura minima
- fatigue-detector posiblemente sin datos suficientes para funcionar bien
- Angulos repetidos — falta variedad en generacion
- `generate-meta-copy.ts` es >70KB — LEER ANTES DE TOCAR, archivo gigante
- `creative-context.ts` existe en 2 rutas distintas — posible duplicacion/inconsistencia

## Steve Tools (consumidas por Michael W25)
Patrón en `_shared.md`. Doc del contrato en `docs/STEVE-PROPOSALS-CONTRACT.md`.

### 🟦 Acción Directa
| Tool name | Endpoint subyacente | Inputs | Confirmación |
|-----------|---------------------|--------|--------------|
| `generar_imagen_ia` | POST /api/ai/generate-image | `{ prompt, style, brand_colors, aspect_ratio }` | No |
| `editar_imagen_ia` | POST /api/ai/edit-image-gemini | `{ image_url, instructions }` | No |
| `generar_video_ia` | POST /api/ai/generate-video | `{ script, duration, music_style, aspect_ratio }` | Sí (costo alto) |
| `generar_script_video` | POST /api/ai/generate-video-script | `{ product, tone, duration }` | No |
| `narracion_ia` | POST /api/brief-estudio/narration | `{ text, voice_type }` | No |

### 🟪 Propuesta + Wizard precargable
| proposal_type | Wizard | Endpoint status | Schema |
|---------------|--------|-----------------|--------|
| `creative_brief` | Brief Estudio canvas (acepta `?proposal=<id>`) | POST /api/proposals/:id/status | [contract](../../docs/STEVE-PROPOSALS-CONTRACT.md#creative_brief) |

**Pendientes para Valentín:**
- [ ] Habilitar parser `?proposal=<id>` en canvas de Brief Estudio
- [ ] Validación previa: si producto referenciado, `shopify_products` debe tener al menos 1 imagen disponible
- [ ] La generación pesada (video) siempre pasa por confirmación, costo significativo
