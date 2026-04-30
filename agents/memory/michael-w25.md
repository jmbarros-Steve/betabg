# Michael W25 — Journal Acumulativo

## 2026-04-29 — Inventario completo del módulo Estrategia

**Contexto:** JM pidió revisar línea-por-línea todo el código de Estrategia. Auditoría exhaustiva de 5365 líneas en 5 archivos. Notion sesión: hub `34f9af51b58d81329355dc5b3997bc28`.

### Hallazgo crítico: state desactualizado
- `strategy-chat.ts` creció de ~870 → **2442 líneas** entre 2026-04-27 y 2026-04-29 sin que el state lo reflejara.
- Hubo 12+ commits en esos 2 días: drafts review flow, 5 agentes coordinados, ShopifyQL (revertido), customer intel, ROAS margen, regla privacidad, regla #1 anti-loop, etc.

### Mapa de capacidades (actual a 2026-04-29)

#### 3 endpoints backend
- `POST /api/strategy-chat` — chat persistente (2442 líneas), rate limit 10/min, persiste en `steve_conversations` + `steve_messages`
- `POST /api/strategy-report` — PDF premium 8-16 páginas con charts SVG + AI insights (1993 líneas)
- `POST /api/steve-strategy` — chat stateless alternativo (232 líneas, Sonnet 4.6, max_tokens=2048)

#### 20 tablas Supabase leídas en paralelo
`steve_messages`, `buyer_personas`, `brand_research`, `steve_knowledge`, `platform_connections`, `client_financial_config`, `steve_commitments`, `shopify_products`, `email_events`, `email_campaigns`, `email_subscribers`, `wa_messages`, `competitor_ads`, `competitor_tracking`, `campaign_recommendations`, `creative_history`, `criterio_results`, `steve_episodic_memory`, `shopify_pricing_history`, `shopify_abandoned_checkouts`

#### 6 APIs externas (timeouts ≤5s)
Google Trends Chile (3s), Klaviyo segments (4s), Meta Graph (pixel + audiencias), Shopify Admin (5s), DuckDuckGo HTML, YouTube Data API + transcripts

#### 13 tools agenticas
**Research:** `buscar_youtube`, `buscar_web`
**Knowledge:** `guardar_regla`
**Creativos:** `recomendar_formato_creativo`, `generar_creativo_imagen` (Gemini), `armar_dct_creativo`, `armar_carrusel_creativo`, `armar_dpa_catalogo`, `pedir_video_al_cliente`
**Meta Drafts:** `crear_draft_campana_meta`, `editar_draft_campana_meta`
**Reportes:** `generar_reporte_pdf`

#### 14 piezas de lógica de negocio
1. Categorización dinámica de intención (meta/google/seo/klaviyo/shopify/brief)
2. Smart rule selection con Haiku (top 5 reglas → Sonnet)
3. Calendario estacional Chile/LATAM (14 eventos)
4. Pixel health (PageView, ViewContent, AddToCart, InitiateCheckout, Purchase)
5. Audience overlap (canibalización Meta)
6. Bundle detection en Shopify orders
7. UTM attribution
8. Customer segmentation (VIP / dormant 60d / new 30d)
9. Inventory alerts (sin stock, sin imagen, capital atrapado, rotación rápida)
10. Pricing tracking (delta ≥1%)
11. ROAS margen real (usa `client_financial_config`)
12. Trending correlation (Google Trends)
13. Klaviyo gaps (VIP/Dormant/NewSub)
14. Commitments auto-detect (regex → follow_up +7d)

#### Reglas hardcoded del system prompt
- Bulldog francés, doctorado Stanford, brutal honesto
- Español LATAM neutro (NO voseo) · Moneda CLP siempre
- Anti-meta-referencia · Regla #1 anti-loop · Regla privacidad
- Objetivo siempre se pregunta, nunca se infiere
- Max 4-5 párrafos · Truncate first 5 + last 15

### Limitaciones vivas
- 🚫 ShopifyQL Analytics (revertido `44b61d4f` — necesita `read_reports` + L2 approval)
- 🚫 Industry filter TODO en L241 + L720 (pendiente `clients.industria`)
- ⚠️ Google Trends timeout silencioso a 3s
- ⚠️ `/api/steve-strategy` no persiste

### Lecciones aprendidas
1. **El state se desactualiza muy rápido** cuando hay sprints intensos — refrescar después de cada commit relevante, no semanal.
2. **Los TODO en código son la fuente más confiable** de pendientes técnicos vs el state file (que documenta intención, no realidad).
3. **Cross-módulo es más amplio de lo pensado** — Michael lee 20 tablas que pertenecen a 6 agentes distintos. Cualquier cambio de schema en knowledge/commitments/financial_config rompe estrategia.
