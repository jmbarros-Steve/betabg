# Bastián W24 — Contexto Operacional

## Tus Tablas
| Tabla | Columnas clave | Estado |
|-------|---------------|--------|
| `buyer_personas` | client_id, persona_data (answered_count, questions[], raw_responses[], pending_question_index) | Activo — estado del brief por cliente |
| `brand_research` | client_id, brand_name, competitors, positioning, tone, + 13 secciones de análisis AI | Activo — output del brief |
| `merchant_onboarding` | client_id, step (brief_completed), status, reminder_count | Activo — tracking de onboarding |

## Tablas que Lees (de otros agentes)
| Tabla | Dueño | Para qué la lees |
|-------|-------|-----------------|
| `platform_connections` | Diego W8 | Verificar que cliente tiene conexiones antes de brief |
| `steve_conversations` | Tomás W7 | Historial de chat del brief (pending_question_index) |
| `steve_messages` | Tomás W7 | Mensajes individuales del brief conversacional |
| `steve_knowledge` | Tomás W7 | Knowledge inyectado en análisis de marca |
| `shopify_products` | Matías W13 | Contexto de productos para análisis de marca |

## Tus Crons
| Job | Schedule | Endpoint | Estado conocido |
|-----|----------|----------|----------------|
| `auto-brief-generator-7am` | `0 7 * * *` | /api/cron/auto-brief-generator | Activo |

## Tus Archivos
- Backend: `cloud-run-api/src/routes/ai/steve-chat.ts` (120KB — sección brief ~L1700-2200, BRAND_BRIEF_QUESTIONS array, questionContext, truncación, implicitAdvance)
- Backend: `cloud-run-api/src/routes/ai/analyze-brand-research.ts` (scraping Apify→Firecrawl fallback + análisis AI)
- Backend: `cloud-run-api/src/routes/ai/analyze-brand-strategy.ts` (Phase 2 — estrategia post-brief)
- Frontend: `src/components/client-portal/BrandBriefView.tsx` (287KB — rendering del brief, safeText(), normalizeResearchData(), mapa perceptual SVG, customer journey, PDF export)
- Frontend: `src/components/client-portal/SteveChat.tsx` (~L600-700 — formularios brief, timeout Q16 180s, retry)
- Frontend: `src/components/client-portal/StructuredFieldsForm.tsx` (formularios dinámicos por pregunta)
- Frontend: `src/lib/briefPdfSections.ts` (secciones del PDF export)

## Tus Edge Functions
- `analyze-brand` — Análisis de marca con AI
- `analyze-brand-research` — Research profundo de marca (scraping + AI)
- `analyze-brand-strategy` — Estrategia de marca (Phase 2)

## Dependencias
- Necesitas de: Tomás W7 (steve_knowledge para inyectar en análisis), Diego W8 (platform_connections), Matías W13 (shopify_products), Gonzalo W22 (onboarding flow)
- Alimentas a: Ignacio W17 (brand_research para competencia), Felipe W2 (contexto marca para campañas), Tomás W7 (brand brief para steve-chat injection)

## Problemas Conocidos
- `steve-chat.ts` es 120KB — archivo monstruoso, sección brief es ~500 líneas dentro de él
- `BrandBriefView.tsx` es 287KB — el archivo más grande del proyecto, candidato a split
- La IA (Claude Sonnet) devuelve keys variantes en brand_research — requiere normalización constante
- System prompt en steve-chat.ts tiene instrucciones que pueden contradecir questionContext — vigilar L243 y L272-277
- Scraping con Apify cheerio falla en sitios JS-heavy — Firecrawl fallback obligatorio si <500 chars
- Off-by-one recurrente: display number = currentQuestionIndex + 1 (no +2)

## Archivos GRANDES (leer antes de tocar)
| Archivo | Tamaño | Notas |
|---------|--------|-------|
| `BrandBriefView.tsx` | 287KB | Renderers, normalización, mapa perceptual, PDF |
| `steve-chat.ts` | 120KB | Solo tocar sección brief ~L1700-2200 |
| `SteveChat.tsx` | ~40KB | Formularios brief en ~L600-700 |
