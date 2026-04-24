-- Migration: Configure check_type + check_config for all EMAIL + VISUAL EMAIL + PERF EMAIL rules

-- =============================================
-- EMAIL SUBJECT — Rules R-112 to R-131
-- =============================================

-- R-112: Already implemented (max 50)
UPDATE criterio_rules SET check_type = 'length', implemented = true,
  check_config = '{"field": "subject", "max": 50}'::jsonb
WHERE id = 'R-112';

-- R-113: Already implemented (preview text)
UPDATE criterio_rules SET check_type = 'length', implemented = true,
  check_config = '{"field": "preview_text", "min": 40, "max": 130}'::jsonb
WHERE id = 'R-113';

-- R-114: Already implemented (spam words)
UPDATE criterio_rules SET check_type = 'forbidden', implemented = true,
  check_config = '{"field": "subject", "words": ["gratis", "free", "ganador", "urgente", "$$$", "100%", "winner", "premio", "gana", "oferta exclusiva", "no te lo pierdas", "últimas horas", "compra ya"]}'::jsonb
WHERE id = 'R-114';

-- R-115: Personalización
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "subject", "pattern": "\\{\\{.*?\\}\\}", "flags": "g", "should_match": true}'::jsonb
WHERE id = 'R-115';

-- R-116: Already implemented (distinto últimos)
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "subject", "field_b": "_recent_subjects", "operator": "different", "description": "Subject distinto a últimos 5"}'::jsonb
WHERE id = 'R-116';

-- R-117: Already implemented (max 2 emojis)
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "subject", "pattern": "[\\u{1F600}-\\u{1F64F}\\u{1F300}-\\u{1F5FF}\\u{1F680}-\\u{1F6FF}\\u{1F1E0}-\\u{1F1FF}\\u{2600}-\\u{26FF}\\u{2700}-\\u{27BF}]", "flags": "gu", "max_matches": 2}'::jsonb
WHERE id = 'R-117';

-- R-118: Already implemented (ALL CAPS)
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "subject", "pattern": "[A-ZÁÉÍÓÚÑ]", "flags": "g", "max_pct": 40}'::jsonb
WHERE id = 'R-118';

-- R-119: Tiene hook (AI)
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "subject", "prompt": "Evalúa si el subject del email tiene un hook que genere curiosidad o urgencia legítima. No debe ser spam, pero sí atractivo.", "threshold": 0.5}'::jsonb
WHERE id = 'R-119';

-- R-120: Sin ortografía (LanguageTool)
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "languagetool", "field": "subject", "language": "es"}'::jsonb
WHERE id = 'R-120';

-- R-121: Sin RE: o FW: falso
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "subject", "pattern": "^(RE:|FW:|RV:|Re:|Fw:)", "flags": "i", "should_match": false}'::jsonb
WHERE id = 'R-121';

-- R-122: Sin exclamaciones excesivas
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "subject", "pattern": "!{2,}", "flags": "g", "should_match": false}'::jsonb
WHERE id = 'R-122';

-- R-123: Coherente con body (AI)
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "subject", "prompt": "Evalúa si el subject del email es coherente con el contenido del body. No debe ser clickbait ni prometer algo que el body no entrega.", "context_fields": ["html_summary"], "threshold": 0.7}'::jsonb
WHERE id = 'R-123';

-- R-124: Sin fecha pasada
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "subject", "pattern": "\\d{1,2}[/\\-]\\d{1,2}[/\\-]\\d{2,4}", "flags": "g", "should_match": false, "custom_check": "date_not_past"}'::jsonb
WHERE id = 'R-124';

-- R-125: Already implemented (min 15)
UPDATE criterio_rules SET check_type = 'length', implemented = true,
  check_config = '{"field": "subject", "min": 15}'::jsonb
WHERE id = 'R-125';

-- R-126: Sin caracteres raros
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "subject", "pattern": "[★☆♥♦►◄●○■□▲△▼▽◆◇※†‡§¶]", "flags": "g", "should_match": false}'::jsonb
WHERE id = 'R-126';

-- R-127: Testeable en A/B
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "subject", "prompt": "Evalúa si este subject tiene un elemento claro que se pueda testear en A/B (ej: con vs sin emoji, pregunta vs statement, con vs sin número).", "threshold": 0.4}'::jsonb
WHERE id = 'R-127';

-- R-128: Sin número teléfono
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "subject", "pattern": "(\\+?56|\\b09)\\s*\\d[\\d\\s-]{5,}", "flags": "g", "should_match": false}'::jsonb
WHERE id = 'R-128';

-- R-129: Temporal coherente
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "subject", "prompt": "Si el subject menciona temporalidad (hoy, esta semana, este mes), ¿es coherente con la fecha de envío?", "threshold": 0.7}'::jsonb
WHERE id = 'R-129';

-- R-130: Nombre marca opcionalmente
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "subject", "source": "brand_research.brand_name", "optional": true}'::jsonb
WHERE id = 'R-130';

-- R-131: Sin subject idéntico al sender
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "subject", "field_b": "from_name", "operator": "different", "description": "Subject no debe ser idéntico al nombre del sender"}'::jsonb
WHERE id = 'R-131';

-- =============================================
-- EMAIL BODY — Rules R-132 to R-166
-- =============================================

-- R-132: Already implemented (CTA)
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "html", "pattern": "<a[^>]+href[^>]+>|<button[^>]*>", "flags": "i", "should_match": true}'::jsonb
WHERE id = 'R-132';

-- R-133: Link CTA funciona
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "url_check", "field": "_cta_urls"}'::jsonb
WHERE id = 'R-133';

-- R-134: Productos con stock
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "shopify_products", "match_field": "id", "match_value_field": "product_ids", "check": "exists"}'::jsonb
WHERE id = 'R-134';

-- R-135: Precios Shopify
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "shopify_products", "match_field": "id", "match_value_field": "product_ids[0]", "check": "value_matches", "value_field": "price"}'::jsonb
WHERE id = 'R-135';

-- R-136: Already implemented (unsubscribe - BLOQUEAR)
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "html", "pattern": "unsubscribe|desuscri|\\{\\{\\s*unsubscribe_url\\s*\\}\\}", "flags": "i", "should_match": true}'::jsonb
WHERE id = 'R-136';

-- R-137: Sin ortografía (LanguageTool)
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "languagetool", "field": "html", "language": "es"}'::jsonb
WHERE id = 'R-137';

-- R-138: Already implemented (largo 50-500 palabras)
UPDATE criterio_rules SET check_type = 'length', implemented = true,
  check_config = '{"field": "_html_word_count", "min": 50, "max": 500}'::jsonb
WHERE id = 'R-138';

-- R-139: Already implemented (alt text)
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "html", "pattern": "<img(?![^>]*alt=[\"'\''][^\"'\'']+[\"'\''])[^>]*>", "flags": "gi", "should_match": false}'::jsonb
WHERE id = 'R-139';

-- R-140: Tono marca (AI)
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "html", "prompt": "Evalúa si el tono del email es coherente con la voz de marca.", "context_fields": ["tone", "brand_voice"], "threshold": 0.6}'::jsonb
WHERE id = 'R-140';

-- R-141: Sin imágenes rotas
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "html", "pattern": "<img[^>]+src=[\"'\''][^\"'\'']+[\"'\'']", "flags": "gi", "should_match": true, "check_urls": true}'::jsonb
WHERE id = 'R-141';

-- R-142: Header visible sin scroll
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "html", "prompt": "Evalúa si el header/título principal del email es visible sin hacer scroll (above the fold, primeros ~500px).", "threshold": 0.6}'::jsonb
WHERE id = 'R-142';

-- R-143: Max 1 CTA principal
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "html", "pattern": "<a[^>]+class=[\"'\''][^\"'\'']*cta[^\"'\'']*[\"'\''][^>]*>|<button[^>]*>", "flags": "gi", "max_matches": 3}'::jsonb
WHERE id = 'R-143';

-- R-144: Color CTA contrasta
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "html", "prompt": "Evalúa si el botón CTA del email tiene un color que contraste con el fondo y sea fácil de identificar.", "threshold": 0.6}'::jsonb
WHERE id = 'R-144';

-- R-145: Texto legible sobre fondo
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "html", "prompt": "Evalúa si el texto del email es legible contra su fondo. Busca texto claro sobre fondo claro o texto oscuro sobre fondo oscuro.", "threshold": 0.7}'::jsonb
WHERE id = 'R-145';

-- R-146: Footer tiene dirección
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "html", "pattern": "\\d+\\s+\\w+.*?(street|st|ave|calle|av|pasaje|avenida)", "flags": "gi", "should_match": true}'::jsonb
WHERE id = 'R-146';

-- R-147: No más de 3 fonts
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "html", "pattern": "font-family:\\s*[\"'\'']?([^;\"'\'']+)", "flags": "gi", "max_unique_matches": 3}'::jsonb
WHERE id = 'R-147';

-- R-148: Links de producto funcionan
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "url_check", "field": "_product_urls"}'::jsonb
WHERE id = 'R-148';

-- R-149: Already implemented (HTTPS)
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "html", "pattern": "href=[\"'\'']http://(?!localhost)", "flags": "gi", "should_match": false}'::jsonb
WHERE id = 'R-149';

-- R-150: Already implemented (UTMs)
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "html", "pattern": "utm_source=", "flags": "gi", "should_match": true}'::jsonb
WHERE id = 'R-150';

-- R-151: Already implemented (JavaScript)
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "html", "pattern": "<script", "flags": "gi", "should_match": false}'::jsonb
WHERE id = 'R-151';

-- R-152: Sin formularios
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "html", "pattern": "<form[^>]*>", "flags": "gi", "should_match": false}'::jsonb
WHERE id = 'R-152';

-- R-153: CSS inline
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "html", "pattern": "<link[^>]+stylesheet[^>]*>", "flags": "gi", "should_match": false}'::jsonb
WHERE id = 'R-153';

-- R-154: Already implemented (ancho max 600)
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "html", "pattern": "width[=:]\\s*[\"'\''\\s]*(\\d+)", "flags": "i", "max_value": 600}'::jsonb
WHERE id = 'R-154';

-- R-155: Ratio imagen/texto
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "_image_to_text_ratio", "max": 60, "unit": "%", "description": "Imágenes no deben ser >60% del contenido"}'::jsonb
WHERE id = 'R-155';

-- R-156: Sin link preview roto
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "html", "pattern": "og:image|og:title", "flags": "gi", "should_match": true}'::jsonb
WHERE id = 'R-156';

-- R-157: Descuento code funciona
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "shopify_products", "match_field": "discount_code", "match_value_field": "_discount_codes_in_html", "check": "exists"}'::jsonb
WHERE id = 'R-157';

-- R-158: Productos en orden de relevancia (AI)
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "html", "prompt": "Evalúa si los productos mostrados están ordenados por relevancia (bestsellers primero, o coherente con el tema del email).", "threshold": 0.5}'::jsonb
WHERE id = 'R-158';

-- R-159: Sin contenido duplicado
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "_html_blocks", "field_b": "_html_blocks_unique", "operator": "eq", "description": "No debe haber bloques de contenido duplicados"}'::jsonb
WHERE id = 'R-159';

-- R-160: Animated GIF bajo 1MB
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "_gif_sizes_kb", "max": 1024, "unit": "KB"}'::jsonb
WHERE id = 'R-160';

-- R-161: Sin video embebido
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "html", "pattern": "<video|<iframe[^>]+youtube|<iframe[^>]+vimeo", "flags": "gi", "should_match": false}'::jsonb
WHERE id = 'R-161';

-- R-162: Header preheader no revela contenido
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "preview_text", "field_b": "_html_first_line", "operator": "different", "description": "Preview text no debe ser igual a primera línea del body"}'::jsonb
WHERE id = 'R-162';

-- R-163: Sin background image en body
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "html", "pattern": "background-image:\\s*url", "flags": "gi", "should_match": false}'::jsonb
WHERE id = 'R-163';

-- R-164: Tamaño fuente min 14px
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "html", "pattern": "font-size:\\s*(\\d+)px", "flags": "gi", "min_value": 14}'::jsonb
WHERE id = 'R-164';

-- R-165: Botón min 44x44px
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "_button_min_dimension", "min": 44, "unit": "px"}'::jsonb
WHERE id = 'R-165';

-- R-166: Espaciado entre links
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "_link_spacing_px", "min": 8, "unit": "px"}'::jsonb
WHERE id = 'R-166';

-- =============================================
-- EMAIL TIMING — Rules R-167 to R-183
-- =============================================

-- R-167: Already implemented (hora 8-21)
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "send_hour", "min": 8, "max": 21, "unit": "hrs"}'::jsonb
WHERE id = 'R-167';

-- R-168: Already implemented (min 3 días)
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "_days_since_last_email", "min": 3, "unit": "días"}'::jsonb
WHERE id = 'R-168';

-- R-169: Max 3/semana
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "_emails_this_week", "max": 3, "unit": "emails"}'::jsonb
WHERE id = 'R-169';

-- R-170: Fecha coherente contenido
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "html", "prompt": "Si el email menciona una fecha, evento o temporada, ¿es coherente con la fecha de envío?", "threshold": 0.7}'::jsonb
WHERE id = 'R-170';

-- R-171: Temporada coherente
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "html", "prompt": "Si el email tiene temática estacional (navidad, verano, etc.), ¿es coherente con la temporada actual?", "threshold": 0.7}'::jsonb
WHERE id = 'R-171';

-- R-172: No enviar hora almuerzo
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "send_hour", "min": 13, "max": 14, "invert": true, "description": "Evitar envío entre 13-14hrs"}'::jsonb
WHERE id = 'R-172';

-- R-173: Mejor día según historial
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "email_events", "match_field": "shop_id", "match_value_field": "shop_id", "check": "best_day"}'::jsonb
WHERE id = 'R-173';

-- R-174: Welcome email inmediato
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "_delay_minutes", "max": 5, "unit": "min", "conditional_field": "email_type", "conditional_value": "welcome"}'::jsonb
WHERE id = 'R-174';

-- R-175: Abandoned cart 1-4hrs
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "_delay_hours", "min": 1, "max": 4, "unit": "hrs", "conditional_field": "email_type", "conditional_value": "abandoned_cart"}'::jsonb
WHERE id = 'R-175';

-- R-176: Post-purchase 3-7 días
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "_delay_days", "min": 3, "max": 7, "unit": "días", "conditional_field": "email_type", "conditional_value": "post_purchase"}'::jsonb
WHERE id = 'R-176';

-- R-177: Win-back 30-60 días
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "_delay_days", "min": 30, "max": 60, "unit": "días", "conditional_field": "email_type", "conditional_value": "win_back"}'::jsonb
WHERE id = 'R-177';

-- R-178: Already implemented (timezone Chile)
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "timezone", "field_b": "_const_AmericaSantiago", "operator": "eq"}'::jsonb
WHERE id = 'R-178';

-- R-179: No enviar durante deploy
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "_no_active_deploy", "description": "No enviar durante deploy activo"}'::jsonb
WHERE id = 'R-179';

-- R-180: Series espaciadas
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "_series_interval_hours", "min": 24, "unit": "hrs", "conditional_field": "is_series", "conditional_value": "true"}'::jsonb
WHERE id = 'R-180';

-- R-181: Reenvío a no-openers >48hrs
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "_hours_since_original", "min": 48, "unit": "hrs", "conditional_field": "is_resend", "conditional_value": "true"}'::jsonb
WHERE id = 'R-181';

-- R-182: Cadencia mensual máxima
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "_emails_this_month", "max": 12, "unit": "emails"}'::jsonb
WHERE id = 'R-182';

-- R-183: No enviar viernes PM
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "send_hour", "max": 14, "conditional_field": "_send_day_of_week", "conditional_value": "5"}'::jsonb
WHERE id = 'R-183';

-- =============================================
-- EMAIL SEG — Rules R-184 to R-203
-- =============================================

-- R-184: No toda la lista
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "segment_size", "field_b": "_total_list_size", "operator": "lt", "description": "Segmento no debe ser toda la lista"}'::jsonb
WHERE id = 'R-184';

-- R-185: Already implemented (min 100)
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "segment_size", "min": 100, "unit": "personas"}'::jsonb
WHERE id = 'R-185';

-- R-186: Contenido relevante (AI)
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "html", "prompt": "Evalúa si el contenido del email es relevante para el segmento objetivo descrito.", "context_fields": ["segment_description"], "threshold": 0.6}'::jsonb
WHERE id = 'R-186';

-- R-187: Already implemented (no unsubscribed - BLOQUEAR)
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "segment_excludes_unsubscribed", "description": "BLOQUEAR: Must exclude unsubscribed"}'::jsonb
WHERE id = 'R-187';

-- R-188: No bounced
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "segment_excludes_bounced", "description": "Must exclude bounced emails"}'::jsonb
WHERE id = 'R-188';

-- R-189: Segmento actualizado
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "_segment_age_days", "max": 30, "unit": "días"}'::jsonb
WHERE id = 'R-189';

-- R-190: No overlap con otro envío
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "_segment_hash", "field_b": "_active_sends_segment_hashes", "operator": "different"}'::jsonb
WHERE id = 'R-190';

-- R-191: Segmento tiene condiciones
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "_segment_condition_count", "min": 1}'::jsonb
WHERE id = 'R-191';

-- R-192: No enviar a nuevos sin welcome
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "_new_subs_received_welcome", "conditional_field": "_has_new_subscribers", "conditional_value": "true"}'::jsonb
WHERE id = 'R-192';

-- R-193: VIP tratamiento especial
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "_vip_segment_excluded_or_special", "conditional_field": "_has_vip_subscribers", "conditional_value": "true"}'::jsonb
WHERE id = 'R-193';

-- R-194: Engagement reciente
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "_segment_avg_engagement_days", "max": 90, "unit": "días"}'::jsonb
WHERE id = 'R-194';

-- R-195: Sin duplicados
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "segment_size", "field_b": "_segment_unique_size", "operator": "eq"}'::jsonb
WHERE id = 'R-195';

-- R-196: Exclusiones aplicadas (BLOQUEAR)
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "segment_has_exclusions", "description": "BLOQUEAR: Segmento debe tener exclusiones aplicadas"}'::jsonb
WHERE id = 'R-196';

-- R-197: Tag de campaña
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "campaign_tag"}'::jsonb
WHERE id = 'R-197';

-- R-198: Consent verificado (BLOQUEAR)
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "segment_consent_verified", "description": "BLOQUEAR: Must have verified consent"}'::jsonb
WHERE id = 'R-198';

-- R-199: Región geográfica coherente
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "_segment_geo", "field_b": "_content_geo", "operator": "eq"}'::jsonb
WHERE id = 'R-199';

-- R-200: No re-enviar a quienes compraron
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "_excludes_recent_purchasers", "conditional_field": "email_type", "conditional_value": "promotion"}'::jsonb
WHERE id = 'R-200';

-- R-201: Segmento documentado
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "segment_description"}'::jsonb
WHERE id = 'R-201';

-- R-202: No más de 5 condiciones AND
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "_segment_and_conditions", "max": 5}'::jsonb
WHERE id = 'R-202';

-- R-203: Split test min 1000
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "segment_size", "min": 1000, "conditional_field": "is_ab_test", "conditional_value": "true"}'::jsonb
WHERE id = 'R-203';

-- =============================================
-- EMAIL TECH — Rules R-204 to R-218
-- =============================================

-- R-204: Peso < 102KB
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "_html_size_kb", "max": 102, "unit": "KB"}'::jsonb
WHERE id = 'R-204';

-- R-205: Responsive 375px
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "html", "pattern": "@media|max-width|min-width", "flags": "gi", "should_match": true}'::jsonb
WHERE id = 'R-205';

-- R-206: Texto plano
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "text_plain", "description": "Debe tener versión texto plano"}'::jsonb
WHERE id = 'R-206';

-- R-207: DKIM configurado
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "email_domains", "match_field": "domain", "match_value_field": "_from_domain", "check": "value_matches", "value_field": "dkim_verified"}'::jsonb
WHERE id = 'R-207';

-- R-208: SPF configurado
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "email_domains", "match_field": "domain", "match_value_field": "_from_domain", "check": "value_matches", "value_field": "spf_verified"}'::jsonb
WHERE id = 'R-208';

-- R-209: DMARC configurado
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "email_domains", "match_field": "domain", "match_value_field": "_from_domain", "check": "value_matches", "value_field": "dmarc_configured"}'::jsonb
WHERE id = 'R-209';

-- R-210: From address correcto
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "from_email", "pattern": "^[^@]+@[^@]+\\.[^@]+$", "flags": "", "should_match": true}'::jsonb
WHERE id = 'R-210';

-- R-211: Reply-to funcional
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "reply_to", "pattern": "^[^@]+@[^@]+\\.[^@]+$", "flags": "", "should_match": true}'::jsonb
WHERE id = 'R-211';

-- R-212: Sin CSS externo
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "html", "pattern": "<link[^>]+rel=[\"'\'']stylesheet[\"'\'']", "flags": "gi", "should_match": false}'::jsonb
WHERE id = 'R-212';

-- R-213: Sin iframes
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "html", "pattern": "<iframe", "flags": "gi", "should_match": false}'::jsonb
WHERE id = 'R-213';

-- R-214: HTML válido
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "html", "pattern": "<!DOCTYPE|<html|<head|<body", "flags": "gi", "should_match": true}'::jsonb
WHERE id = 'R-214';

-- R-215: Sin tracking pixel doble
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "html", "pattern": "width=[\"'\'']1[\"'\''].*?height=[\"'\'']1[\"'\'']", "flags": "gi", "max_matches": 1}'::jsonb
WHERE id = 'R-215';

-- R-216: Encoding UTF-8
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "html", "pattern": "charset=[\"'\'']?utf-8", "flags": "gi", "should_match": true}'::jsonb
WHERE id = 'R-216';

-- R-217: Sin attachments
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "_no_attachments", "description": "Emails no deben tener attachments"}'::jsonb
WHERE id = 'R-217';

-- R-218: Rendering cross-client
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "html", "pattern": "mso-|<!--\\[if", "flags": "gi", "should_match": true, "description": "Must have Outlook-compatible conditional comments"}'::jsonb
WHERE id = 'R-218';

-- =============================================
-- VISUAL EMAIL — Rules R-309 to R-318
-- =============================================

-- R-309: CTA visible sin scroll
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "html", "prompt": "Evalúa si el CTA principal del email es visible sin hacer scroll (above the fold).", "threshold": 0.6}'::jsonb
WHERE id = 'R-309';

-- R-310: Imágenes completas 375px
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "html", "pattern": "max-width:\\s*100%|width:\\s*100%", "flags": "gi", "should_match": true}'::jsonb
WHERE id = 'R-310';

-- R-311: Texto legible 375px
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "_min_font_size_mobile", "min": 14, "unit": "px"}'::jsonb
WHERE id = 'R-311';

-- R-312: Botón clickeable 375px
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "_button_touch_target", "min": 44, "unit": "px"}'::jsonb
WHERE id = 'R-312';

-- R-313: Layout no roto
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "html", "pattern": "<table|display:\\s*flex|display:\\s*grid", "flags": "gi", "should_match": true}'::jsonb
WHERE id = 'R-313';

-- R-314: Header coherente
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "html", "prompt": "Evalúa si el header del email es coherente visualmente con la marca.", "context_fields": ["brand_colors", "logo_url"], "threshold": 0.5}'::jsonb
WHERE id = 'R-314';

-- R-315: Footer completo
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "html", "pattern": "unsubscribe.*?(copyright|©|dirección|address)", "flags": "gis", "should_match": true}'::jsonb
WHERE id = 'R-315';

-- R-316: Espaciado entre bloques
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "_block_spacing_px", "min": 10, "unit": "px"}'::jsonb
WHERE id = 'R-316';

-- R-317: Jerarquía visual clara (AI)
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "html", "prompt": "Evalúa si el email tiene una jerarquía visual clara: título, subtítulo, cuerpo, CTA en orden lógico.", "threshold": 0.5}'::jsonb
WHERE id = 'R-317';

-- R-318: Alineación consistente
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "html", "pattern": "text-align:\\s*(left|center|right)", "flags": "gi", "max_unique_matches": 2}'::jsonb
WHERE id = 'R-318';

-- =============================================
-- PERF EMAIL — Rules R-446 to R-452
-- =============================================

-- R-446: Open rate > 15%
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "open_rate", "min": 15, "unit": "%"}'::jsonb
WHERE id = 'R-446';

-- R-447: Click rate > 1%
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "click_rate", "min": 1, "unit": "%"}'::jsonb
WHERE id = 'R-447';

-- R-448: Unsubscribe < 1%
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "unsubscribe_rate", "max": 1, "unit": "%"}'::jsonb
WHERE id = 'R-448';

-- R-449: Bounce rate < 3%
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "bounce_rate", "max": 3, "unit": "%"}'::jsonb
WHERE id = 'R-449';

-- R-450: Spam complaints < 0.1%
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "spam_rate", "max": 0.1, "unit": "%"}'::jsonb
WHERE id = 'R-450';

-- R-451: Revenue per email > $0
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "revenue_per_email", "min": 0.01, "unit": "CLP"}'::jsonb
WHERE id = 'R-451';

-- R-452: Deliverability > 95%
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "deliverability_rate", "min": 95, "unit": "%"}'::jsonb
WHERE id = 'R-452';
