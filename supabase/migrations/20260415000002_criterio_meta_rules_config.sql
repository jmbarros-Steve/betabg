-- Migration: Configure check_type + check_config for all META rules
-- This enables config-driven evaluation for the 83 previously unimplemented META rules + 8 PERF META

-- =============================================
-- META COPY — Rules R-001 to R-030
-- =============================================

-- R-001: Already implemented in legacy code, add config for future migration
UPDATE criterio_rules SET check_type = 'length', implemented = true,
  check_config = '{"field": "primary_text", "min": 80, "max": 300}'::jsonb
WHERE id = 'R-001';

-- R-002: Already implemented
UPDATE criterio_rules SET check_type = 'length', implemented = true,
  check_config = '{"field": "headline", "min": 20, "max": 80}'::jsonb
WHERE id = 'R-002';

-- R-003: Already implemented
UPDATE criterio_rules SET check_type = 'forbidden', implemented = true,
  check_config = '{"field": "primary_text", "words": [], "source": "cta_verbs", "should_contain_any": true}'::jsonb
WHERE id = 'R-003';

-- R-004: LanguageTool — external
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "languagetool", "field": "primary_text", "language": "es"}'::jsonb
WHERE id = 'R-004';

-- R-005: Already implemented (legacy price check)
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "shopify_products", "match_field": "id", "match_value_field": "product_ids[0]", "check": "value_matches", "value_field": "price"}'::jsonb
WHERE id = 'R-005';

-- R-006: Discount is real — compare_price vs price
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "shopify_products", "match_field": "id", "match_value_field": "product_ids[0]", "check": "value_matches", "value_field": "compare_at_price"}'::jsonb
WHERE id = 'R-006';

-- R-007: Already implemented (stock check)
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "shopify_products", "match_field": "id", "match_value_field": "product_ids[0]", "check": "exists"}'::jsonb
WHERE id = 'R-007';

-- R-008: Already implemented (angle dedup)
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "angle", "field_b": "_history_angles", "operator": "different", "description": "Ángulo no debe repetir últimos 5"}'::jsonb
WHERE id = 'R-008';

-- R-009: Already implemented (medical claims)
UPDATE criterio_rules SET check_type = 'forbidden', implemented = true,
  check_config = '{"field": "primary_text", "words": ["cura", "sana", "elimina", "garantizado", "100% efectivo", "milagroso", "medicina", "medicamento", "tratamiento médico"]}'::jsonb
WHERE id = 'R-009';

-- R-010: Already implemented (emoji max)
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "primary_text", "pattern": "[\\u{1F600}-\\u{1F64F}\\u{1F300}-\\u{1F5FF}\\u{1F680}-\\u{1F6FF}\\u{1F1E0}-\\u{1F1FF}\\u{2600}-\\u{26FF}\\u{2700}-\\u{27BF}]", "flags": "gu", "max_matches": 3}'::jsonb
WHERE id = 'R-010';

-- R-011: Already implemented (caps)
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "primary_text", "pattern": "[A-ZÁÉÍÓÚÑ]", "flags": "g", "max_pct": 30}'::jsonb
WHERE id = 'R-011';

-- R-012: Already implemented (tone via AI)
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "primary_text", "prompt": "Evalúa si el tono del copy es coherente con el tono de marca indicado en el contexto.", "context_fields": ["tone", "brand_voice"], "threshold": 0.7}'::jsonb
WHERE id = 'R-012';

-- R-013: Already implemented (URL check)
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "url_check", "field": "link_url"}'::jsonb
WHERE id = 'R-013';

-- R-014: Sin mencionar competidores — forbidden with dynamic source
UPDATE criterio_rules SET check_type = 'forbidden', implemented = true,
  check_config = '{"field": "primary_text", "words": [], "source": "brand_research.competitors"}'::jsonb
WHERE id = 'R-014';

-- R-015: Largo descripción
UPDATE criterio_rules SET check_type = 'length', implemented = true,
  check_config = '{"field": "description", "min": 50, "max": 200}'::jsonb
WHERE id = 'R-015';

-- R-016: Sin hashtags
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "primary_text", "pattern": "#\\w+", "flags": "g", "should_match": false}'::jsonb
WHERE id = 'R-016';

-- R-017: Sin links en copy text
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "primary_text", "pattern": "https?://\\S+", "flags": "gi", "should_match": false}'::jsonb
WHERE id = 'R-017';

-- R-018: Beneficio claro (AI)
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "primary_text", "prompt": "Evalúa si las primeras 125 caracteres del copy contienen un beneficio claro o propuesta de valor para el lector. No basta con describir el producto, debe comunicar QUÉ gana el usuario.", "threshold": 0.6}'::jsonb
WHERE id = 'R-018';

-- R-019: Sin teléfono
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "primary_text", "pattern": "(\\+?56|\\b09)\\s*\\d[\\d\\s-]{5,}", "flags": "g", "should_match": false}'::jsonb
WHERE id = 'R-019';

-- R-020: Nombre marca presente
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "primary_text", "source": "brand_research.brand_name"}'::jsonb
WHERE id = 'R-020';

-- R-021: Sin fecha pasada
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "primary_text", "pattern": "\\d{1,2}[/\\-]\\d{1,2}[/\\-]\\d{2,4}", "flags": "g", "should_match": false, "custom_check": "date_not_past"}'::jsonb
WHERE id = 'R-021';

-- R-022: Sin promesa envío gratis falsa
UPDATE criterio_rules SET check_type = 'forbidden', implemented = true,
  check_config = '{"field": "primary_text", "words": ["envío gratis", "despacho gratis", "envío gratuito", "free shipping"], "conditional": true, "verify_source": "shopify_shipping"}'::jsonb
WHERE id = 'R-022';

-- R-023: A/B tiene diferencia real
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "variant_a", "field_b": "variant_b", "operator": "different", "min_diff_pct": 30, "description": "Variantes A/B deben diferir en >30% del texto"}'::jsonb
WHERE id = 'R-023';

-- R-024: Sin repetir texto entre campos
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "headline", "field_b": "primary_text_first_line", "operator": "different", "description": "Headline no debe ser igual a primera línea del copy"}'::jsonb
WHERE id = 'R-024';

-- R-025: Copy tiene social proof (AI)
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "primary_text", "prompt": "Evalúa si el copy incluye algún tipo de social proof: testimonio, cifra de ventas/clientes, review, mención de autoridad, o evidencia social. Es un NICE-TO-HAVE, no obligatorio.", "threshold": 0.5}'::jsonb
WHERE id = 'R-025';

-- R-026: Sin abreviaciones confusas
UPDATE criterio_rules SET check_type = 'forbidden', implemented = true,
  check_config = '{"field": "primary_text", "words": ["xq", "pq", "tb", "tmb", "xfa", "dps", "q", "pa", "k", "msj", "info", "x", "dnd"], "case_sensitive": false}'::jsonb
WHERE id = 'R-026';

-- R-027: Producto nombrado específicamente (AI)
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "primary_text", "prompt": "Si el copy promueve un producto específico, ¿menciona el nombre completo del producto? Si es una promo general de la tienda sin producto específico, dar PASS.", "context_fields": ["product_name"], "threshold": 0.6}'::jsonb
WHERE id = 'R-027';

-- R-028: Sin caracteres especiales extraños
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "primary_text", "pattern": "[★☆♥♦►◄●○■□▲△▼▽◆◇※†‡§¶]", "flags": "g", "should_match": false}'::jsonb
WHERE id = 'R-028';

-- R-029: Coherencia singular/plural (AI)
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "primary_text", "prompt": "Evalúa si el copy mantiene coherencia gramatical en singular/plural. Si habla de 1 producto usa singular, si es colección usa plural. Busca errores como un producto con verbo plural.", "threshold": 0.7}'::jsonb
WHERE id = 'R-029';

-- R-030: Sin doble espacio
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "primary_text", "pattern": "  +", "flags": "g", "should_match": false}'::jsonb
WHERE id = 'R-030';

-- =============================================
-- META TARGET — Rules R-031 to R-053
-- =============================================

-- R-031: Already implemented (age)
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "targeting.age_min", "min": 18, "max": 65, "unit": "años"}'::jsonb
WHERE id = 'R-031';

-- R-032: Already implemented (gender)
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "targeting.genders", "field_b": "_brief.target_gender", "operator": "eq"}'::jsonb
WHERE id = 'R-032';

-- R-033: Already implemented (interests)
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "targeting.interests.length", "min": 2}'::jsonb
WHERE id = 'R-033';

-- R-034: Already implemented (Chile)
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "targeting.countries", "contains": "CL"}'::jsonb
WHERE id = 'R-034';

-- R-035: Sin excluir ciudades principales
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "targeting.cities", "contains": "Santiago", "description": "Si segmentas por ciudad, incluye Santiago"}'::jsonb
WHERE id = 'R-035';

-- R-036: Audiencia min 10K
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "targeting.estimated_reach", "min": 10000, "unit": "personas"}'::jsonb
WHERE id = 'R-036';

-- R-037: Lookalike fuente min 100
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "targeting.lookalike_source_size", "min": 100, "unit": "fuente"}'::jsonb
WHERE id = 'R-037';

-- R-038: Already implemented (no menores)
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "targeting.age_min", "min": 18}'::jsonb
WHERE id = 'R-038';

-- R-039: Already implemented (idioma)
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "targeting.locales", "contains": "es"}'::jsonb
WHERE id = 'R-039';

-- R-040: No excluir compradores
UPDATE criterio_rules SET check_type = 'forbidden', implemented = true,
  check_config = '{"field": "targeting.exclusions", "words": ["purchasers", "buyers", "compradores"], "conditional_field": "campaign_type", "conditional_value": "prospecting"}'::jsonb
WHERE id = 'R-040';

-- R-041: Custom audience tiene tamaño
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "targeting.custom_audience_size", "min": 1, "unit": "personas"}'::jsonb
WHERE id = 'R-041';

-- R-042: Retargeting ventana max 180 días
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "targeting.retarget_lookback_days", "max": 180, "unit": "días"}'::jsonb
WHERE id = 'R-042';

-- R-043: Intereses relevantes (AI)
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "targeting.interests", "prompt": "Evalúa si los intereses de targeting de Facebook Ads son relevantes para el producto/marca. Contexto de la marca:", "context_fields": ["industry", "product_type", "target_audience"], "threshold": 0.6}'::jsonb
WHERE id = 'R-043';

-- R-044: No duplicate audiences
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "targeting_hash", "field_b": "_active_adsets_targeting_hash", "operator": "different", "description": "Targeting no debe duplicar otro adset activo"}'::jsonb
WHERE id = 'R-044';

-- R-045: Behavior targeting coherente (AI)
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "targeting.behaviors", "prompt": "Evalúa si los behaviors de targeting son relevantes para el objetivo de la campaña.", "context_fields": ["campaign_objective", "product_type"], "threshold": 0.6}'::jsonb
WHERE id = 'R-045';

-- R-046: Geo-fencing coherente con envío
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "targeting.geo_locations", "field_b": "_brief.shipping_zones", "operator": "contains", "description": "Geo-targeting debe coincidir con zonas de envío"}'::jsonb
WHERE id = 'R-046';

-- R-047: No excluir todas las conexiones
UPDATE criterio_rules SET check_type = 'forbidden', implemented = true,
  check_config = '{"field": "targeting.exclusions_type", "words": ["all_connections"], "description": "No excluir fans + friends + lookalike simultáneamente"}'::jsonb
WHERE id = 'R-047';

-- R-048: Detailed targeting expansion coherente
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "targeting.expansion", "field_b": "campaign_objective", "operator": "eq", "description": "Expansion solo con conversiones o reach"}'::jsonb
WHERE id = 'R-048';

-- R-049: Placement+targeting coherente
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "targeting.device_platforms", "field_b": "creative_format", "operator": "eq", "description": "Mobile-only targeting requiere creative mobile-first"}'::jsonb
WHERE id = 'R-049';

-- R-050: Sin targeting demasiado nicho
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "targeting.estimated_reach", "min": 1000, "unit": "personas"}'::jsonb
WHERE id = 'R-050';

-- R-051: Saved audience actualizada
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "targeting.saved_audience_age_days", "max": 90, "unit": "días"}'::jsonb
WHERE id = 'R-051';

-- R-052: No mezclar warm y cold
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "targeting.audience_type_warm", "field_b": "targeting.audience_type_cold", "operator": "different", "description": "No mezclar warm y cold audiences en mismo adset"}'::jsonb
WHERE id = 'R-052';

-- R-053: Frequency cap definido
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "frequency_cap", "description": "Debe tener frequency cap definido"}'::jsonb
WHERE id = 'R-053';

-- =============================================
-- META BUDGET — Rules R-054 to R-071
-- =============================================

-- R-054: Already implemented (budget min)
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "daily_budget", "min": 3000, "unit": "CLP"}'::jsonb
WHERE id = 'R-054';

-- R-055: Already implemented (10% ventas)
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "_monthly_budget_pct_of_revenue", "max": 10, "unit": "%"}'::jsonb
WHERE id = 'R-055';

-- R-056: Already implemented (centavos)
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "daily_budget_api", "field_b": "daily_budget_display_x100", "operator": "eq", "description": "Budget API = display * 100"}'::jsonb
WHERE id = 'R-056';

-- R-057: Already implemented (lifetime fecha)
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "end_date", "conditional_field": "budget_type", "conditional_value": "lifetime"}'::jsonb
WHERE id = 'R-057';

-- R-058: Budget coherente objetivo
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "daily_budget", "min": 5000, "conditional_field": "campaign_objective", "conditional_value": "CONVERSIONS", "unit": "CLP"}'::jsonb
WHERE id = 'R-058';

-- R-059: Sin cambio brusco
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "_budget_change_pct", "max": 30, "unit": "%", "description": "Cambio de budget no debe exceder 30% vs día anterior"}'::jsonb
WHERE id = 'R-059';

-- R-060: Already implemented (moneda CLP)
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "currency", "field_b": "_const_CLP", "operator": "eq"}'::jsonb
WHERE id = 'R-060';

-- R-061: CPA objetivo realista
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "target_cpa", "min": 500, "max": 50000, "unit": "CLP"}'::jsonb
WHERE id = 'R-061';

-- R-062: Budget total campaña realista
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "_total_campaign_budget", "min": 30000, "unit": "CLP"}'::jsonb
WHERE id = 'R-062';

-- R-063: Bid strategy coherente
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "bid_strategy", "field_b": "campaign_objective", "operator": "eq", "description": "Bid strategy debe coincidir con objetivo"}'::jsonb
WHERE id = 'R-063';

-- R-064: Min spend >= learning phase
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "_weekly_budget", "min": 50000, "unit": "CLP", "description": "Budget semanal debe cubrir learning phase (~50 conversiones)"}'::jsonb
WHERE id = 'R-064';

-- R-065: No budget $0 en adset activo
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "daily_budget", "min": 1, "unit": "CLP"}'::jsonb
WHERE id = 'R-065';

-- R-066: Split entre adsets equilibrado
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "_max_adset_budget_pct", "max": 80, "unit": "%", "description": "Ningún adset debe tener >80% del budget total"}'::jsonb
WHERE id = 'R-066';

-- R-067: Budget de testing separado
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "testing_budget", "conditional_field": "is_test", "conditional_value": "true"}'::jsonb
WHERE id = 'R-067';

-- R-068: Accelerated delivery justificado
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "delivery_type", "field_b": "_const_accelerated", "operator": "neq", "description": "Accelerated delivery solo en casos justificados"}'::jsonb
WHERE id = 'R-068';

-- R-069: Budget escala gradualmente
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "_budget_increase_pct", "max": 20, "unit": "%", "description": "Budget no debe subir más de 20% por día"}'::jsonb
WHERE id = 'R-069';

-- R-070: No duplicar budget por error
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "daily_budget", "field_b": "_previous_budget", "operator": "lte", "max_ratio": 2, "description": "Budget no debe duplicarse accidentalmente"}'::jsonb
WHERE id = 'R-070';

-- R-071: Alerta si gasto > 120% budget
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "_spend_vs_budget_pct", "max": 120, "unit": "%"}'::jsonb
WHERE id = 'R-071';

-- =============================================
-- META PLACE — Rules R-072 to R-086
-- =============================================

-- R-072: Already implemented (AN solo)
UPDATE criterio_rules SET check_type = 'forbidden', implemented = true,
  check_config = '{"field": "placements", "words": ["audience_network_only"], "description": "No solo Audience Network"}'::jsonb
WHERE id = 'R-072';

-- R-073: Already implemented (feed)
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "placements", "contains": "feed"}'::jsonb
WHERE id = 'R-073';

-- R-074: Already implemented (stories vertical)
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "creative_ratio", "field_b": "_const_vertical", "operator": "eq", "conditional_field": "placements", "conditional_contains": "stories"}'::jsonb
WHERE id = 'R-074';

-- R-075: Reels tiene video
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "creative_type", "contains": "video", "conditional_field": "placements", "conditional_contains": "reels"}'::jsonb
WHERE id = 'R-075';

-- R-076: No mezclar awareness+conversions
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "campaign_objective", "field_b": "placement_optimization", "operator": "eq", "description": "Objetivo debe ser coherente con placement"}'::jsonb
WHERE id = 'R-076';

-- R-077: Marketplace coherente
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "product_catalog_id", "conditional_field": "placements", "conditional_contains": "marketplace"}'::jsonb
WHERE id = 'R-077';

-- R-078: Right column solo desktop
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "device_platforms", "field_b": "_const_desktop", "operator": "contains", "conditional_field": "placements", "conditional_contains": "right_column"}'::jsonb
WHERE id = 'R-078';

-- R-079: In-stream video tiene video >15s
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "video_duration", "min": 15, "unit": "s", "conditional_field": "placements", "conditional_contains": "in_stream"}'::jsonb
WHERE id = 'R-079';

-- R-080: Search placement keywords
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "search_keywords", "conditional_field": "placements", "conditional_contains": "search"}'::jsonb
WHERE id = 'R-080';

-- R-081: Explore visual atractivo (AI)
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "creative_url", "prompt": "Evalúa si este creative es visualmente atractivo para el placement Explore de Instagram.", "threshold": 0.5}'::jsonb
WHERE id = 'R-081';

-- R-082: Profile feed coherente
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "creative_type", "conditional_field": "placements", "conditional_contains": "profile_feed"}'::jsonb
WHERE id = 'R-082';

-- R-083: Multi-placement tiene multi-creative
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "creative_count", "min": 2, "conditional_field": "placement_count", "conditional_min": 3}'::jsonb
WHERE id = 'R-083';

-- R-084: Advantage+ justificado
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "advantage_plus_justification", "conditional_field": "advantage_plus", "conditional_value": "true"}'::jsonb
WHERE id = 'R-084';

-- R-085: No todos los placements activos
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "placement_count", "max": 8, "description": "No activar todos los placements sin estrategia"}'::jsonb
WHERE id = 'R-085';

-- R-086: IG exclusivo tiene cuenta
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "instagram_account_id", "conditional_field": "placements", "conditional_contains": "instagram"}'::jsonb
WHERE id = 'R-086';

-- =============================================
-- META CREATIVE — Rules R-087 to R-111
-- =============================================

-- R-087: Already implemented (resolution)
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "creative_width", "min": 1080, "unit": "px"}'::jsonb
WHERE id = 'R-087';

-- R-088: Already implemented (format)
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "creative_format", "pattern": "^(jpg|jpeg|png|webp|mp4|mov)$", "flags": "i", "should_match": true}'::jsonb
WHERE id = 'R-088';

-- R-089: Regla 20% texto (vision AI)
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "vision", "field": "creative_url", "check": "text_ratio_20pct"}'::jsonb
WHERE id = 'R-089';

-- R-090: Video duración
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "video_duration", "min": 5, "max": 60, "unit": "s"}'::jsonb
WHERE id = 'R-090';

-- R-091: Ratio aspecto
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "creative_ratio", "pattern": "^(1:1|4:5|9:16|16:9)$", "flags": "", "should_match": true}'::jsonb
WHERE id = 'R-091';

-- R-092: Imagen no borrosa (vision)
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "vision", "field": "creative_url", "check": "blur"}'::jsonb
WHERE id = 'R-092';

-- R-093: Logo visible (vision)
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "vision", "field": "creative_url", "check": "logo"}'::jsonb
WHERE id = 'R-093';

-- R-094: Producto visible (vision)
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "vision", "field": "creative_url", "check": "product_visible"}'::jsonb
WHERE id = 'R-094';

-- R-095: Imagen del banco aprobado
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "image_source", "description": "Imagen debe ser propia o de banco aprobado"}'::jsonb
WHERE id = 'R-095';

-- R-096: Video tiene subtítulos
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "has_subtitles", "conditional_field": "creative_type", "conditional_value": "video"}'::jsonb
WHERE id = 'R-096';

-- R-097: Video hook en 3s (AI)
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "video_script", "prompt": "Evalúa si los primeros 3 segundos del video script tienen un hook atractivo que capture la atención.", "threshold": 0.6}'::jsonb
WHERE id = 'R-097';

-- R-098: Tamaño archivo max
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "file_size_mb", "max": 30, "unit": "MB"}'::jsonb
WHERE id = 'R-098';

-- R-099: Sin marca de agua (vision)
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "vision", "field": "creative_url", "check": "no_watermark"}'::jsonb
WHERE id = 'R-099';

-- R-100: Colores de marca (vision)
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "vision", "field": "creative_url", "check": "brand_colors"}'::jsonb
WHERE id = 'R-100';

-- R-101: Sin texto cortado (vision)
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "vision", "field": "creative_url", "check": "text_overlay"}'::jsonb
WHERE id = 'R-101';

-- R-102: Carousel min 3
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "carousel_items_count", "min": 3, "conditional_field": "creative_type", "conditional_value": "carousel"}'::jsonb
WHERE id = 'R-102';

-- R-103: Carousel max 10
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "carousel_items_count", "max": 10, "conditional_field": "creative_type", "conditional_value": "carousel"}'::jsonb
WHERE id = 'R-103';

-- R-104: Carousel items coherentes (AI)
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "carousel_items", "prompt": "Evalúa si los items del carousel son visualmente coherentes entre sí y cuentan una historia o muestran productos relacionados.", "threshold": 0.6}'::jsonb
WHERE id = 'R-104';

-- R-105: Video aspect ratio estable
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "video_aspect_ratio", "field_b": "declared_aspect_ratio", "operator": "eq", "description": "Aspect ratio real debe coincidir con declarado"}'::jsonb
WHERE id = 'R-105';

-- R-106: Thumbnail atractivo (AI)
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "thumbnail_url", "prompt": "Evalúa si el thumbnail del video es atractivo y representa bien el contenido.", "threshold": 0.5}'::jsonb
WHERE id = 'R-106';

-- R-107: Collection ad tiene hero
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "hero_image_url", "conditional_field": "creative_type", "conditional_value": "collection"}'::jsonb
WHERE id = 'R-107';

-- R-108: DPA template limpio (BLOQUEAR)
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "dpa_template_valid", "conditional_field": "creative_type", "conditional_value": "dpa"}'::jsonb
WHERE id = 'R-108';

-- R-109: Imagen sin menores (BLOQUEAR - vision)
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "vision", "field": "creative_url", "check": "no_minors"}'::jsonb
WHERE id = 'R-109';

-- R-110: GIF bajo 8MB
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "file_size_mb", "max": 8, "unit": "MB", "conditional_field": "creative_format", "conditional_value": "gif"}'::jsonb
WHERE id = 'R-110';

-- R-111: Sin contenido sexual/violento (BLOQUEAR - vision)
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "vision", "field": "creative_url", "check": "inappropriate"}'::jsonb
WHERE id = 'R-111';

-- =============================================
-- PERF META — Rules R-438 to R-445
-- =============================================

-- R-438: CPA < 2x benchmark
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "cpa", "max_multiplier": 2, "benchmark_source": "campaign_metrics.avg_cpa", "unit": "CLP"}'::jsonb
WHERE id = 'R-438';

-- R-439: CTR > 1%
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "ctr", "min": 1, "unit": "%"}'::jsonb
WHERE id = 'R-439';

-- R-440: Frequency < 4
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "frequency", "max": 4}'::jsonb
WHERE id = 'R-440';

-- R-441: ROAS > breakeven
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "roas", "min": 1, "unit": "x"}'::jsonb
WHERE id = 'R-441';

-- R-442: CPM razonable
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "cpm", "max": 15000, "unit": "CLP"}'::jsonb
WHERE id = 'R-442';

-- R-443: Learning phase completada
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "learning_phase_completed", "description": "Campaña debe haber completado learning phase"}'::jsonb
WHERE id = 'R-443';

-- R-444: Spend delivery uniforme
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "_spend_variance_pct", "max": 40, "unit": "%", "description": "Gasto diario no debe variar >40% del promedio"}'::jsonb
WHERE id = 'R-444';

-- R-445: No fatiga creativa
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "frequency", "max": 6, "description": "Frequency >6 indica fatiga creativa"}'::jsonb
WHERE id = 'R-445';
