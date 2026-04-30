# Contrato `steve_proposals` — Formato JSON por tipo

**Tabla**: `public.steve_proposals` (migration `20260430130000_steve_proposals.sql`)
**Modelo**: Steve propone, merchant ejecuta. Steve genera el JSON, lo persiste, manda link al wizard. El wizard lee `?proposal=<id>`, precarga campos, el merchant publica.

## Quién define qué

| Actor | Responsabilidad |
|---|---|
| **Michael W25** | Genera el JSON desde `strategy-chat.ts` vía proposal-builders. Respeta los formatos de abajo. |
| **Dueño de canal** (Felipe/Andrés/Rodrigo/Valentina/Matías/Valentín/Ignacio/Paula) | Define y mantiene el formato del JSON para SU `proposal_type`. Mantiene el wizard que lo consume. |
| **Diego W8** | Schema de la tabla, índices, migrations. |
| **Javiera W12** | RLS, integridad. |
| **Tomás W7** | Lee `status='discarded'` + `reasoning` para feedback loop. |

## Estructura común a todos los tipos

```typescript
{
  id: uuid,
  client_id: uuid,
  proposal_type: string,           // ver tabla abajo
  proposal_data: object,           // ⬅️ formato específico por tipo
  summary: string,                 // 1-2 líneas, lo que Steve dice al merchant en el chat
  reasoning: string,               // por qué Steve propone esto (audit + learning)
  status: 'pending' | 'opened' | 'edited' | 'published' | 'discarded' | 'expired',
  steve_conversation_id?: uuid,
  steve_message_id?: uuid,
  channel?: 'in_app' | 'wa_cmo',
  execution_result?: object,       // IDs de la entidad creada al publicar
  created_at, opened_at, published_at, discarded_at, expires_at
}
```

## Tipos definidos

### `meta_campaign` — Felipe W2
Wizard: `src/components/client-portal/meta-ads/CampaignCreateWizard.tsx`

```typescript
{
  campaign_name: string,
  objective: 'OUTCOME_SALES' | 'OUTCOME_TRAFFIC' | 'OUTCOME_LEADS' | 'OUTCOME_AWARENESS' | 'OUTCOME_ENGAGEMENT' | 'OUTCOME_APP_PROMOTION',
  daily_budget_clp: number,
  duration_days: number,
  start_date: string,              // ISO YYYY-MM-DD
  ad_account_id: string,           // act_xxxxx
  pixel_id?: string,
  ad_sets: [
    {
      name: string,
      audience: {
        type: 'lookalike' | 'custom' | 'interests' | 'broad',
        spec: object,              // según type — ver schema Felipe
        estimated_size?: number
      },
      placements: ('FB_FEED' | 'IG_FEED' | 'IG_STORIES' | 'IG_REELS' | 'AUDIENCE_NETWORK')[],
      optimization_goal: string,
      bid_strategy: string
    }
  ],
  ads: [
    {
      ad_set_index: number,        // referencia al ad_set por índice
      creative: {
        headline: string,
        primary_text: string,
        description?: string,
        cta: 'SHOP_NOW' | 'LEARN_MORE' | 'SIGN_UP' | 'CONTACT_US',
        media: { type: 'image' | 'video' | 'carousel', url: string | string[] }
      },
      destination_url: string
    }
  ],
  notes_for_merchant?: string
}
```

### `meta_audience` — Felipe W2
Wizard: `src/components/client-portal/meta-ads/MetaAudienceManager.tsx`

```typescript
{
  audience_name: string,
  type: 'lookalike' | 'custom_engagement' | 'custom_purchase' | 'website_visitors',
  source: {
    // si lookalike: { seed_audience_id, country, similarity: 0.01 }
    // si custom_engagement: { event_source, days, event_types }
    // si custom_purchase: { pixel_id, days, value_min, value_max }
    // si website_visitors: { pixel_id, urls, days }
  },
  estimated_size_range: [number, number]
}
```

### `google_campaign` — Andrés W3
Wizard: TBD (Andrés define ubicación)

```typescript
{
  campaign_name: string,
  campaign_type: 'SEARCH' | 'PERFORMANCE_MAX' | 'SHOPPING' | 'DISPLAY',
  daily_budget_clp: number,
  bidding_strategy: 'MAXIMIZE_CONVERSIONS' | 'TARGET_CPA' | 'TARGET_ROAS' | 'MAXIMIZE_CLICKS',
  target_value?: number,           // si TARGET_CPA o TARGET_ROAS
  ad_groups: [
    {
      name: string,
      keywords?: { text: string, match_type: 'EXACT' | 'PHRASE' | 'BROAD' }[],
      // o assets para PMax
      headlines?: string[],
      descriptions?: string[]
    }
  ],
  geo_targets: string[],           // códigos país/región
  start_date: string,
  end_date?: string
}
```

### `google_pmax` — Andrés W3
Subset de `google_campaign` con `campaign_type='PERFORMANCE_MAX'` + asset_groups (audience signals, themes, etc.). Ver `pmax-api-v23-shapes.md` para shapes Google API.

### `klaviyo_flow` — Rodrigo W0
Wizard: canvas de flow en `src/components/client-portal/email/`

```typescript
{
  flow_name: string,
  trigger: {
    type: 'list_subscribed' | 'metric' | 'segment_entered' | 'date_property',
    spec: object                   // según type
  },
  steps: [
    {
      id: string,
      type: 'email' | 'sms' | 'wait' | 'split' | 'webhook',
      // si email:
      subject?: string,
      preview_text?: string,
      template_ref?: string,       // id de email_template existente
      template_inline?: object,    // o inline JSON del builder
      // si wait:
      wait_duration_hours?: number,
      // si split:
      condition?: { property: string, operator: string, value: any },
      next_yes?: string,           // step.id si verdadero
      next_no?: string             // step.id si falso
    }
  ],
  exit_conditions: { type: string, spec: object }[]
}
```

### `klaviyo_campaign` — Rodrigo W0

```typescript
{
  campaign_name: string,
  list_or_segment_id: string,
  subject: string,
  preview_text: string,
  template_ref?: string,
  template_inline?: object,
  send_at: string,                 // ISO datetime, o 'smart_send_time'
  utm_params?: object
}
```

### `email_ab_test` — Valentina W1

```typescript
{
  test_name: string,
  base_campaign_ref?: string,      // si se basa en una campaña existente
  variants: [
    {
      label: 'A' | 'B' | 'C' | 'D',
      changes: {
        subject?: string,
        from_name?: string,
        send_time?: string,
        body_html?: string,
        cta_text?: string
      }
    }
  ],
  split_strategy: { type: 'equal' | 'weighted', weights?: number[] },
  audience_id: string,
  winning_metric: 'open_rate' | 'click_rate' | 'conversion_rate' | 'revenue_per_email',
  test_duration_hours: number
}
```

### `email_template` — Valentina W1

```typescript
{
  template_name: string,
  category: 'welcome' | 'abandoned_cart' | 'post_purchase' | 'newsletter' | 'promo' | 'winback',
  subject: string,
  preview_text: string,
  blocks: [                        // bloques universales del builder
    { type: 'header' | 'hero' | 'product_grid' | 'text' | 'cta' | 'footer', spec: object }
  ]
}
```

### `shopify_promotion` — Matías W13

```typescript
{
  promotion_name: string,
  discount: {
    type: 'percentage' | 'fixed_amount' | 'free_shipping',
    value: number,
    code: string,
    min_purchase_clp?: number,
    usage_limit?: number,
    starts_at: string,
    ends_at: string
  },
  target: { type: 'all' | 'collections' | 'products', ids?: string[] },
  paired_creative?: {              // opcional: imagen IA + copy para empujar la promo
    image_url: string,
    headline: string,
    body: string
  }
}
```

### `creative_brief` — Valentín W18 (Brief Estudio)

```typescript
{
  brief_name: string,
  product_ref?: string,            // shopify_product_id
  format: 'image' | 'video' | 'carousel',
  duration_seconds?: number,       // si video
  aspect_ratio: '1:1' | '4:5' | '9:16' | '16:9',
  mood: string,                    // descripción libre
  brand_colors: string[],          // hex
  font_style?: string,
  copy_hooks: string[],            // 3-5 ideas de gancho
  music_mood?: string,             // si video
  voice_style?: string,            // si tiene narración
  reference_images?: string[]      // URLs de inspiración
}
```

### `wa_merchant_campaign` — Paula W19
Capacidad #27 Steve CMO: Steve propone que el merchant lance una campaña WA a sus clientes finales.

```typescript
{
  campaign_name: string,
  segment_filter: {
    // criterios de wa_prospects: tags, last_message_age_days, total_purchases, etc.
    spec: object
  },
  template_ref?: string,           // id de wa template aprobado por Meta
  template_inline?: { body: string, media_url?: string },
  send_at: string,                 // ISO o 'now'
  utm_params?: object
}
```

## Flujo del status

```
pending  ── merchant abre link ──▶  opened
opened   ── ajusta campos      ──▶  edited
opened   ── publica            ──▶  published   (+ execution_result)
edited   ── publica            ──▶  published
opened   ── descarta           ──▶  discarded   (+ discarded_reason)
pending  ── 14 días sin acción ──▶  expired     (cron diario)
```

## Reglas para Michael W25 al generar

1. **`summary` es lo que Steve dice en el chat** — máx 280 chars en `wa_cmo`, sin restricción en `in_app`
2. **`reasoning` es para Tomás** — explicá la cadena de razonamiento + qué data del cliente usaste
3. **`expires_at` por defecto 14 días** — para tipos perecibles (ej: campaña con fecha) reducí a la fecha de inicio menos 1 día
4. **Antes de generar, confirmar viabilidad**: chequear que el cliente tenga las conexiones necesarias (ej: `meta_campaign` requiere `platform_connections.meta` activa). Si falta → no proponer, sugerí conectar primero.
5. **Steve nunca publica directo desde el chat** para los `proposal_type` listados acá. Para acciones simples (pausar, ajustar presupuesto, editar precio) usar tools de acción directa, NO `steve_proposals`.

## Reglas para dueños de canal al consumir

1. **Cuando el wizard lee `?proposal=<id>`**: PATCH `status='opened'`, `opened_at=now()` (Cloud Run endpoint dedicado, no desde frontend directo)
2. **Si merchant ajusta campos**: PATCH `status='edited'` (opcional snapshot del diff)
3. **Al publicar exitosamente**: PATCH `status='published'`, `published_at=now()`, `execution_result={ ...IDs }`
4. **Si descarta (botón "no me sirve")**: pedí razón, PATCH `status='discarded'`, `discarded_reason=<texto>`
5. **Validá `expires_at`** — si ya expiró, mostrar mensaje "esta propuesta venció, pedile a Steve una nueva"

## Para evolucionar el contrato

Cambios al **schema de la tabla** → migration + Diego W8 + Javiera W12.
Cambios al **formato JSON de un tipo** → dueño de canal lo define en SU `agents/contexts/{nombre}.md` y avisa a Michael W25 para actualizar el proposal-builder correspondiente.
Agregar **nuevo `proposal_type`** → ALTER del CHECK constraint + entrada en este doc + builder en Michael + wizard en el dueño de canal.
