-- Migration: Configure check_type + check_config for all remaining 251 CRITERIO rules
-- These are rules NOT in META or EMAIL categories (those were handled in migrations 000002 and 000003)
-- Categories: STEVE DATOS, STEVE RESP, STEVE RECO, VISUAL AD, VISUAL BRAND,
--             SHOPIFY SYNC, SHOPIFY PRODUCT, SHOPIFY ORDER, SHOPIFY ANALYTICS,
--             UX PORTAL, SECURITY, LEGAL, INFRA, INTEL, REPORT, CROSS CONSIST, CROSS SYNC

-- =============================================
-- STEVE DATOS — Rules R-219 to R-243 + R-494
-- =============================================

-- R-219: Ventas = Shopify
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_metrics", "match_field": "shop_id", "match_value_field": "shop_id", "check": "value_matches", "value_field": "total_sales", "compare_source": "shopify_api", "description": "Ventas reportadas deben coincidir con Shopify"}'::jsonb
WHERE id = 'R-219';

-- R-220: Pedidos correctos
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_metrics", "match_field": "shop_id", "match_value_field": "shop_id", "check": "value_matches", "value_field": "total_orders", "compare_source": "shopify_api", "description": "Número de pedidos debe coincidir con Shopify"}'::jsonb
WHERE id = 'R-220';

-- R-221: Top product correcto
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "shopify_products", "match_field": "shop_id", "match_value_field": "shop_id", "check": "top_by_field", "value_field": "units_sold", "compare_field": "mentioned_top_product", "description": "Top product debe coincidir con datos reales de ventas"}'::jsonb
WHERE id = 'R-221';

-- R-222: Precio correcto
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "shopify_products", "match_field": "id", "match_value_field": "product_ids[0]", "check": "value_matches", "value_field": "price", "description": "Precio mencionado debe coincidir con Shopify"}'::jsonb
WHERE id = 'R-222';

-- R-223: Stock correcto
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "shopify_products", "match_field": "id", "match_value_field": "product_ids[0]", "check": "value_matches", "value_field": "inventory_quantity", "description": "Stock reportado debe coincidir con Shopify"}'::jsonb
WHERE id = 'R-223';

-- R-224: No inventa datos (ALERTA GRAVE)
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "response_text", "prompt": "Analiza si la respuesta contiene datos que NO existen en las fuentes proporcionadas. Busca cifras inventadas, productos inexistentes, métricas fabricadas, o cualquier dato que no esté respaldado por el contexto. Esto es una ALERTA GRAVE — cualquier alucinación es fallo.", "context_fields": ["source_data", "shopify_data", "analytics_data"], "threshold": 0.9}'::jsonb
WHERE id = 'R-224';

-- R-225: Fechas correctas
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "mentioned_dates", "field_b": "source_dates", "operator": "eq", "regex_extract": "\\d{1,2}[/\\-]\\d{1,2}[/\\-]\\d{2,4}", "description": "Fechas mencionadas deben coincidir con datos fuente"}'::jsonb
WHERE id = 'R-225';

-- R-226: Moneda CLP
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "response_text", "pattern": "\\$\\s*[\\d\\.]+(?:\\s*(?:CLP|pesos))?|[\\d\\.]+\\s*(?:CLP|pesos)", "flags": "gi", "should_match": true, "forbidden_pattern": "USD|EUR|US\\$|€|£", "description": "Montos deben estar en CLP, no en otras monedas"}'::jsonb
WHERE id = 'R-226';

-- R-227: Ticket promedio correcto
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_metrics", "match_field": "shop_id", "match_value_field": "shop_id", "check": "value_matches", "value_field": "avg_order_value", "tolerance_pct": 5, "description": "Ticket promedio debe coincidir con dato real"}'::jsonb
WHERE id = 'R-227';

-- R-228: Comparación temporal correcta
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "response_text", "prompt": "Evalúa si las comparaciones temporales son correctas (ej: semana vs semana, mes vs mes). Verifica que no compare períodos incomparables (ej: 1 semana vs 1 mes) y que las tendencias (sube/baja) coincidan con los datos.", "context_fields": ["source_data", "time_period"], "threshold": 0.7}'::jsonb
WHERE id = 'R-228';

-- R-229: Tasa conversión correcta
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_metrics", "match_field": "shop_id", "match_value_field": "shop_id", "check": "value_matches", "value_field": "conversion_rate", "tolerance_pct": 5, "description": "Tasa de conversión debe coincidir con dato real"}'::jsonb
WHERE id = 'R-229';

-- R-230: Revenue por canal correcto
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_metrics", "match_field": "shop_id", "match_value_field": "shop_id", "check": "value_matches", "value_field": "revenue_by_channel", "description": "Revenue por canal debe coincidir con datos de analytics"}'::jsonb
WHERE id = 'R-230';

-- R-231: Refund/devoluciones correcto
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_metrics", "match_field": "shop_id", "match_value_field": "shop_id", "check": "value_matches", "value_field": "refund_count", "description": "Datos de refund/devoluciones deben coincidir con Shopify"}'::jsonb
WHERE id = 'R-231';

-- R-232: Descuento activo correcto
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "shopify_products", "match_field": "shop_id", "match_value_field": "shop_id", "check": "discount_active", "value_field": "compare_at_price", "description": "Descuentos mencionados deben estar activos en Shopify"}'::jsonb
WHERE id = 'R-232';

-- R-233: Colección correcta
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "shopify_products", "match_field": "shop_id", "match_value_field": "shop_id", "check": "collection_exists", "value_field": "collections", "description": "Colecciones mencionadas deben existir en Shopify"}'::jsonb
WHERE id = 'R-233';

-- R-234: Shipping rate correcto
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_connections", "match_field": "client_id", "match_value_field": "client_id", "check": "value_matches", "value_field": "shipping_rates", "description": "Tarifas de envío mencionadas deben coincidir con Shopify"}'::jsonb
WHERE id = 'R-234';

-- R-235: No confunde clientes (ALERTA GRAVE)
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "response_client_id", "field_b": "request_client_id", "operator": "eq", "description": "GRAVE: Datos de un cliente NUNCA deben aparecer en respuesta de otro cliente"}'::jsonb
WHERE id = 'R-235';

-- R-236: Timestamp de datos visible
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "data_timestamp", "description": "Respuesta debe indicar de cuándo son los datos mostrados"}'::jsonb
WHERE id = 'R-236';

-- R-237: Formato números chileno
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "response_text", "pattern": "\\d{1,3}(\\.\\d{3})+|\\$\\s*\\d{1,3}(\\.\\d{3})+", "flags": "g", "should_match": true, "forbidden_pattern": "\\d{1,3}(,\\d{3})+", "description": "Números deben usar formato chileno: 1.000 en vez de 1,000"}'::jsonb
WHERE id = 'R-237';

-- R-238: No muestra datos sensibles
UPDATE criterio_rules SET check_type = 'forbidden', implemented = true,
  check_config = '{"field": "response_text", "words": ["RUT", "rut", "contraseña", "password", "token", "api_key", "apikey", "secret", "clave", "PIN", "CVV", "tarjeta de crédito", "credit card"], "patterns": ["\\d{1,2}\\.\\d{3}\\.\\d{3}-[\\dkK]", "sk_[a-zA-Z0-9]+", "eyJ[a-zA-Z0-9]+"], "description": "No debe mostrar datos sensibles: RUT, passwords, tokens, etc."}'::jsonb
WHERE id = 'R-238';

-- R-239: Margen no revelado a terceros
UPDATE criterio_rules SET check_type = 'forbidden', implemented = true,
  check_config = '{"field": "response_text", "words": ["margen", "markup", "costo unitario", "precio de costo", "costo real", "ganancia neta", "profit margin"], "conditional_field": "is_external_context", "conditional_value": "true", "description": "No revelar márgenes ni costos en contexto externo"}'::jsonb
WHERE id = 'R-239';

-- R-240: Consistencia entre respuestas
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "response_text", "prompt": "Compara esta respuesta con las respuestas anteriores en la misma conversación. ¿Hay contradicciones en datos, cifras o afirmaciones? Si dice algo diferente a lo que dijo antes, es un fallo.", "context_fields": ["conversation_history"], "threshold": 0.7}'::jsonb
WHERE id = 'R-240';

-- R-241: Variante producto correcta
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "shopify_products", "match_field": "id", "match_value_field": "product_ids[0]", "check": "variant_exists", "value_field": "variants", "description": "Variantes mencionadas deben existir en Shopify"}'::jsonb
WHERE id = 'R-241';

-- R-242: Fulfillment status correcto
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_metrics", "match_field": "shop_id", "match_value_field": "shop_id", "check": "value_matches", "value_field": "fulfillment_status", "description": "Estado de fulfillment debe coincidir con Shopify"}'::jsonb
WHERE id = 'R-242';

-- R-243: No redondea excesivamente
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "response_text", "prompt": "Evalúa si los números en la respuesta están excesivamente redondeados. Por ejemplo, si el dato real es 47.3% y dice ~50%, o si ventas reales son $1.234.567 y dice ~$1.200.000. Redondeos leves (1-2%) son aceptables, pero redondeos que distorsionen la realidad (>5%) son fallo.", "context_fields": ["source_data"], "threshold": 0.6}'::jsonb
WHERE id = 'R-243';

-- R-494: YouTube source tiene contenido
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "steve_sources", "match_field": "source_type", "match_value_field": "_const_youtube", "check": "has_content", "value_field": "content", "min_length": 10, "description": "BLOQUEAR: YouTube source debe tener contenido extraído"}'::jsonb
WHERE id = 'R-494';

-- =============================================
-- STEVE RESP — Rules R-244 to R-273 + R-473 to R-479
-- =============================================

-- R-244: Responde < 30s
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "response_time_ms", "max": 30000, "unit": "ms", "description": "Respuesta debe llegar en menos de 30 segundos"}'::jsonb
WHERE id = 'R-244';

-- R-245: Español chileno
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "response_text", "prompt": "Evalúa si la respuesta está en español chileno natural. Debe usar modismos chilenos cuando aplique, no sonar como traducción. No debe usar vosotros, voseo argentino, ni español peninsular. Tuteo chileno es OK.", "threshold": 0.6}'::jsonb
WHERE id = 'R-245';

-- R-246: Rechaza off-topic
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "response_text", "prompt": "Evalúa si la respuesta rechaza adecuadamente preguntas off-topic (no relacionadas con marketing, ecommerce, o el negocio del merchant). Si la pregunta es off-topic y Steve la responde de todas formas, es un fallo.", "context_fields": ["user_message", "conversation_context"], "threshold": 0.6}'::jsonb
WHERE id = 'R-246';

-- R-247: No consejos financieros
UPDATE criterio_rules SET check_type = 'forbidden', implemented = true,
  check_config = '{"field": "response_text", "words": ["invertir en", "comprar acciones", "portafolio de inversión", "rentabilidad financiera", "fondo mutuo", "bolsa de valores", "crypto", "bitcoin", "trading", "inversión personal"], "description": "No debe dar consejos de inversión financiera personal"}'::jsonb
WHERE id = 'R-247';

-- R-248: Largo 50-800 chars
UPDATE criterio_rules SET check_type = 'length', implemented = true,
  check_config = '{"field": "response_text", "min": 50, "max": 800}'::jsonb
WHERE id = 'R-248';

-- R-249: Cita fuente
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "response_text", "prompt": "Evalúa si la respuesta cita o referencia la fuente de los datos mencionados (ej: según Shopify, según tus métricas de Meta, etc.). Es un nice-to-have, no obligatorio.", "threshold": 0.4}'::jsonb
WHERE id = 'R-249';

-- R-250: Contesta la pregunta
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "response_text", "prompt": "Evalúa si la respuesta contesta DIRECTAMENTE la pregunta del usuario. No debe dar rodeos, no debe responder otra cosa, no debe evadir. La pregunta está en el contexto.", "context_fields": ["user_message"], "threshold": 0.7}'::jsonb
WHERE id = 'R-250';

-- R-251: Sin alucinaciones
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "response_text", "prompt": "Evalúa si la respuesta contiene información inventada o no respaldada por los datos proporcionados. Busca cifras sin fuente, afirmaciones no verificables, o datos que contradicen el contexto. Peso alto: cualquier alucinación es fallo grave.", "context_fields": ["source_data", "conversation_history"], "threshold": 0.9}'::jsonb
WHERE id = 'R-251';

-- R-252: Tono empático
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "response_text", "prompt": "Evalúa si la respuesta tiene un tono empático y cercano, como un colega que te ayuda. No debe ser robótico, frío, ni excesivamente formal.", "threshold": 0.5}'::jsonb
WHERE id = 'R-252';

-- R-253: No se disculpa excesivamente
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "response_text", "prompt": "Evalúa si la respuesta tiene disculpas excesivas. Una disculpa está OK, pero múltiples disculpas o disculpas innecesarias por cosas que no son un error es un fallo.", "threshold": 0.5}'::jsonb
WHERE id = 'R-253';

-- R-254: Sugiere acción
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "response_text", "prompt": "Evalúa si la respuesta incluye al menos una sugerencia de acción concreta que el merchant pueda tomar. No basta con dar datos, debe sugerir qué hacer con ellos.", "threshold": 0.5}'::jsonb
WHERE id = 'R-254';

-- R-255: No repite pregunta
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "response_text", "field_b": "user_message", "operator": "different", "description": "No debe repetir literalmente la pregunta del usuario en la respuesta"}'::jsonb
WHERE id = 'R-255';

-- R-256: Formateo limpio
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "response_text", "pattern": "```|\\*\\*\\*|__|~~|\\[\\[|\\]\\]|<[a-zA-Z]|\\{\\{|\\}\\}", "flags": "g", "should_match": false, "description": "Rechazar: No debe tener markdown roto, HTML crudo, o templates sin resolver"}'::jsonb
WHERE id = 'R-256';

-- R-257: No promete lo que no puede (ALERTA GRAVE)
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "response_text", "prompt": "Evalúa si la respuesta hace promesas que Steve no puede cumplir (ej: te garantizo X ventas, voy a cambiar tu campaña, voy a hablar con Meta, te devuelvo el dinero). Steve puede sugerir y analizar, pero NO puede ejecutar acciones directas en plataformas externas ni garantizar resultados.", "threshold": 0.8}'::jsonb
WHERE id = 'R-257';

-- R-258: Sin repetición entre mensajes
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "response_text", "field_b": "_previous_response_text", "operator": "different", "min_diff_pct": 30, "description": "Respuesta no debe repetir >70% del texto de la respuesta anterior"}'::jsonb
WHERE id = 'R-258';

-- R-259: Maneja error gracefully
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "response_text", "prompt": "Si hubo un error (datos no disponibles, API caída, etc.), evalúa si la respuesta maneja el error de forma elegante: explica que no pudo obtener el dato, sugiere alternativa, y no muestra stack traces ni errores técnicos.", "context_fields": ["error_context"], "threshold": 0.7}'::jsonb
WHERE id = 'R-259';

-- R-260: No dice 'como IA'
UPDATE criterio_rules SET check_type = 'forbidden', implemented = true,
  check_config = '{"field": "response_text", "words": ["como IA", "como inteligencia artificial", "soy una IA", "soy un modelo", "como modelo de lenguaje", "no tengo sentimientos", "no puedo sentir", "como asistente virtual", "soy un chatbot", "soy un bot"], "case_sensitive": false}'::jsonb
WHERE id = 'R-260';

-- R-261: Nombre del merchant correcto
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "mentioned_merchant_name", "field_b": "actual_merchant_name", "operator": "eq", "description": "Si menciona el nombre del merchant, debe ser el correcto"}'::jsonb
WHERE id = 'R-261';

-- R-262: Sin URLs internas
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "response_text", "pattern": "https?://(localhost|127\\.0\\.0\\.1|supabase\\.co|run\\.app|vercel\\.app|netlify\\.app|internal|staging|dev\\.|api\\.steve)", "flags": "gi", "should_match": false, "description": "No debe mostrar URLs internas del sistema"}'::jsonb
WHERE id = 'R-262';

-- R-263: Responde en mismo canal
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "response_channel", "field_b": "request_channel", "operator": "eq", "description": "Respuesta debe ir por el mismo canal que la pregunta (web, WA, etc.)"}'::jsonb
WHERE id = 'R-263';

-- R-264: No revela system prompt (ALERTA GRAVE)
UPDATE criterio_rules SET check_type = 'forbidden', implemented = true,
  check_config = '{"field": "response_text", "words": ["system prompt", "instrucciones del sistema", "system message", "mi prompt dice", "fui instruido para", "mis instrucciones son", "me programaron para"], "patterns": ["Eres Steve.*agente", "Tu rol es.*marketing", "REGLA.*OBLIGATORIA"], "description": "GRAVE: No debe revelar el system prompt ni instrucciones internas"}'::jsonb
WHERE id = 'R-264';

-- R-265: Contexto de conversación
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "response_text", "prompt": "Evalúa si la respuesta mantiene el contexto de la conversación previa. Si el usuario hizo una pregunta de seguimiento, ¿Steve recuerda de qué estaban hablando? Si pierde el hilo, es un fallo.", "context_fields": ["conversation_history"], "threshold": 0.6}'::jsonb
WHERE id = 'R-265';

-- R-266: No responde por otro merchant (ALERTA GRAVE)
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "response_client_id", "field_b": "request_client_id", "operator": "eq", "description": "GRAVE: Respuesta debe ser SOLO para el merchant que pregunta, nunca mezclar datos de otro merchant"}'::jsonb
WHERE id = 'R-266';

-- R-267: Rate limit humano
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "messages_per_minute", "max": 10, "unit": "msg/min", "description": "No enviar más de 10 mensajes por minuto para parecer humano"}'::jsonb
WHERE id = 'R-267';

-- R-268: Sin emojis excesivos
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "response_text", "pattern": "[\\u{1F600}-\\u{1F64F}\\u{1F300}-\\u{1F5FF}\\u{1F680}-\\u{1F6FF}\\u{1F1E0}-\\u{1F1FF}\\u{2600}-\\u{26FF}\\u{2700}-\\u{27BF}]", "flags": "gu", "max_matches": 3, "description": "Máximo 3 emojis por respuesta"}'::jsonb
WHERE id = 'R-268';

-- R-269: Sugiere features del portal
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "response_text", "prompt": "Evalúa si la respuesta aprovecha oportunidades para sugerir features del portal Steve (ej: puedes ver esto en tu dashboard, te recomiendo revisar la sección de..., puedes configurar una alerta en...). Es un nice-to-have.", "threshold": 0.4}'::jsonb
WHERE id = 'R-269';

-- R-270: Detecta urgencia
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "response_text", "prompt": "Si el mensaje del usuario tiene urgencia (ej: campaña activa con problemas, stock en 0, error de cobro), evalúa si Steve detecta esa urgencia y responde con la prioridad adecuada.", "context_fields": ["user_message"], "threshold": 0.7}'::jsonb
WHERE id = 'R-270';

-- R-271: No da números negativos sin contexto
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "response_text", "prompt": "Si la respuesta incluye números negativos o caídas (ej: -30%, cayó un 50%), evalúa si los contextualiza adecuadamente (ej: explica por qué, sugiere acción, compara con benchmark). Números negativos sin contexto asustan al merchant.", "threshold": 0.6}'::jsonb
WHERE id = 'R-271';

-- R-272: Responde con confianza
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "response_text", "prompt": "Evalúa si la respuesta transmite confianza. No debe usar excesivos quizás, tal vez, no estoy seguro, puede ser, creo que. Cuando tiene datos, debe ser directo.", "threshold": 0.5}'::jsonb
WHERE id = 'R-272';

-- R-273: Multi-idioma si necesario
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "response_text", "prompt": "Si el usuario escribe en inglés u otro idioma, evalúa si Steve responde en el mismo idioma o al menos reconoce el idioma. Si el usuario escribe en español, debe responder en español.", "context_fields": ["user_message"], "threshold": 0.6}'::jsonb
WHERE id = 'R-273';

-- R-473: WA responde < 15s
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "response_time_ms", "max": 15000, "unit": "ms", "conditional_field": "channel", "conditional_value": "whatsapp", "description": "WhatsApp debe responder en menos de 15 segundos"}'::jsonb
WHERE id = 'R-473';

-- R-474: WA mensaje corto
UPDATE criterio_rules SET check_type = 'length', implemented = true,
  check_config = '{"field": "response_text", "max": 500, "conditional_field": "channel", "conditional_value": "whatsapp", "description": "Mensajes de WhatsApp deben ser cortos (<500 chars)"}'::jsonb
WHERE id = 'R-474';

-- R-475: WA no manda links largos
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "response_text", "pattern": "https?://[^\\s]{100,}", "flags": "g", "should_match": false, "conditional_field": "channel", "conditional_value": "whatsapp", "description": "WhatsApp no debe enviar URLs de más de 100 caracteres"}'::jsonb
WHERE id = 'R-475';

-- R-476: Alerta matutina 8am
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "alert_send_hour", "min": 7, "max": 9, "unit": "hrs", "conditional_field": "alert_type", "conditional_value": "morning_summary", "description": "Alerta matutina debe enviarse entre 7-9am"}'::jsonb
WHERE id = 'R-476';

-- R-477: Alerta proactiva ventas altas
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "high_sales_alert_sent", "conditional_field": "sales_above_threshold", "conditional_value": "true", "description": "Si ventas superan el umbral, debe haberse enviado alerta proactiva"}'::jsonb
WHERE id = 'R-477';

-- R-478: Alerta proactiva stock bajo
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "low_stock_alert_sent", "conditional_field": "stock_below_threshold", "conditional_value": "true", "description": "Si stock bajo el umbral, debe haberse enviado alerta"}'::jsonb
WHERE id = 'R-478';

-- R-479: WA template aprobado
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "wa_template_approved", "conditional_field": "channel", "conditional_value": "whatsapp", "description": "Rechazar: Template de WhatsApp debe estar aprobado por Meta"}'::jsonb
WHERE id = 'R-479';

-- =============================================
-- STEVE RECO — Rules R-274 to R-298
-- =============================================

-- R-274: Producto con stock
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "shopify_products", "match_field": "id", "match_value_field": "recommended_product_id", "check": "value_gt", "value_field": "inventory_quantity", "min_value": 0, "description": "Producto recomendado debe tener stock >0"}'::jsonb
WHERE id = 'R-274';

-- R-275: Producto con margen
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "shopify_products", "match_field": "id", "match_value_field": "recommended_product_id", "check": "has_margin", "value_field": "compare_at_price", "description": "Producto recomendado debería tener margen positivo"}'::jsonb
WHERE id = 'R-275';

-- R-276: Campaña viable
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "recommendation_text", "prompt": "Evalúa si la campaña recomendada es viable dado el contexto del merchant (presupuesto, productos, temporada, audiencia). No debe recomendar campañas imposibles de ejecutar.", "context_fields": ["merchant_context", "budget", "products"], "threshold": 0.6}'::jsonb
WHERE id = 'R-276';

-- R-277: Email timing
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "recommended_send_hour", "min": 8, "max": 21, "unit": "hrs", "description": "Rechazar: Hora de envío recomendada debe estar entre 8-21hrs"}'::jsonb
WHERE id = 'R-277';

-- R-278: Ángulo distinto
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "recommended_angle", "field_b": "_recent_angles", "operator": "different", "description": "Ángulo de la recomendación debe ser distinto a los últimos 5 usados"}'::jsonb
WHERE id = 'R-278';

-- R-279: Descuento no perjudicial
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "recommended_discount_pct", "max": 50, "unit": "%", "description": "Rechazar: Descuento recomendado no debe superar 50% para no perjudicar margen"}'::jsonb
WHERE id = 'R-279';

-- R-280: Producto existe (ALERTA GRAVE)
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "shopify_products", "match_field": "id", "match_value_field": "recommended_product_id", "check": "exists", "description": "GRAVE: Producto recomendado debe existir en Shopify"}'::jsonb
WHERE id = 'R-280';

-- R-281: Temporada correcta
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "recommendation_text", "prompt": "Evalúa si la recomendación es coherente con la temporada actual (ej: no recomendar trajes de baño en invierno en Chile, no recomendar navidad en junio).", "threshold": 0.6}'::jsonb
WHERE id = 'R-281';

-- R-282: No recomienda producto pausado
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "shopify_products", "match_field": "id", "match_value_field": "recommended_product_id", "check": "value_matches", "value_field": "status", "expected_value": "active", "description": "Rechazar: No recomendar productos pausados o archivados"}'::jsonb
WHERE id = 'R-282';

-- R-283: Bundle coherente
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "recommendation_text", "prompt": "Si recomienda un bundle de productos, evalúa si los productos combinados tienen sentido juntos (ej: crema + protector solar OK, shampoo + zapatos NO).", "threshold": 0.6}'::jsonb
WHERE id = 'R-283';

-- R-284: Precio competitivo
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "recommendation_text", "prompt": "Evalúa si el precio del producto recomendado es competitivo en su categoría. Si hay datos de competencia disponibles, comparar.", "context_fields": ["competitor_data", "category_benchmarks"], "threshold": 0.5}'::jsonb
WHERE id = 'R-284';

-- R-285: Meta audience existe
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "meta_campaigns", "match_field": "client_id", "match_value_field": "client_id", "check": "audience_exists", "value_field": "audience_id", "description": "Rechazar: Audiencia de Meta recomendada debe existir"}'::jsonb
WHERE id = 'R-285';

-- R-286: Calendario de lanzamientos
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "recommendation_text", "prompt": "Evalúa si la recomendación considera el calendario de lanzamientos y eventos del merchant (ej: no recomendar lanzar algo 2 días antes de una venta especial planificada).", "context_fields": ["merchant_calendar", "planned_events"], "threshold": 0.5}'::jsonb
WHERE id = 'R-286';

-- R-287: Recomendación personalizada
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "recommendation_text", "prompt": "Evalúa si la recomendación está personalizada para este merchant específico, no es una recomendación genérica. Debe mencionar datos concretos del merchant.", "context_fields": ["merchant_context"], "threshold": 0.5}'::jsonb
WHERE id = 'R-287';

-- R-288: No recomienda algo que ya está activo
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "meta_campaigns", "match_field": "client_id", "match_value_field": "client_id", "check": "not_active", "value_field": "campaign_type", "description": "No recomendar una campaña/estrategia que ya está activa"}'::jsonb
WHERE id = 'R-288';

-- R-289: ROI estimado coherente
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "recommendation_text", "prompt": "Si la recomendación incluye un ROI estimado, evalúa si es realista dado el contexto (industria, presupuesto, historial). ROIs de >10x son sospechosos para la mayoría de los ecommerce.", "context_fields": ["historical_roas", "industry_benchmarks"], "threshold": 0.6}'::jsonb
WHERE id = 'R-289';

-- R-290: Nivel de detalle apropiado
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "recommendation_text", "prompt": "Evalúa si la recomendación tiene el nivel de detalle apropiado: suficiente para que el merchant entienda QUÉ hacer y POR QUÉ, pero no tan técnico que lo confunda.", "threshold": 0.5}'::jsonb
WHERE id = 'R-290';

-- R-291: No sobrecarga al merchant
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "recommendations_count", "max": 3, "description": "No dar más de 3 recomendaciones simultáneas para no sobrecargar al merchant"}'::jsonb
WHERE id = 'R-291';

-- R-292: Incluye next steps claros
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "recommendation_text", "prompt": "Evalúa si la recomendación incluye next steps claros y accionables. El merchant debe saber exactamente qué hacer después de leer la recomendación.", "threshold": 0.6}'::jsonb
WHERE id = 'R-292';

-- R-293: Reco coherente con brief
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "recommendation_text", "prompt": "Evalúa si la recomendación es coherente con el brief de la marca (tono, target, objetivos, restricciones). No debe contradecir la estrategia definida.", "context_fields": ["brand_research", "brief"], "threshold": 0.6}'::jsonb
WHERE id = 'R-293';

-- R-294: No recomienda canal sin conexión
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_connections", "match_field": "client_id", "match_value_field": "client_id", "check": "connection_exists", "value_field": "platform", "description": "Rechazar: No recomendar canal (Meta, Email, Google) si no tiene conexión activa"}'::jsonb
WHERE id = 'R-294';

-- R-295: Segmento sugerido existe
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "email_lists", "match_field": "client_id", "match_value_field": "client_id", "check": "segment_exists", "value_field": "segment_name", "description": "Segmento sugerido debe existir en las listas del merchant"}'::jsonb
WHERE id = 'R-295';

-- R-296: Budget sugerido redondo
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "recommended_budget", "pattern": "^\\$?\\s*\\d{1,3}(\\.\\d{3})*$", "flags": "", "should_match": true, "description": "Budget recomendado debe ser un número redondo (ej: $50.000, $100.000)"}'::jsonb
WHERE id = 'R-296';

-- R-297: Testing antes de escalar
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "recommendation_text", "prompt": "Si la recomendación implica escalar budget o audiencia, evalúa si incluye fase de testing previa. Escalar sin testear primero es un fallo.", "threshold": 0.6}'::jsonb
WHERE id = 'R-297';

-- R-298: Frecuencia de recos
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "_recos_this_week", "max": 5, "unit": "recos/semana", "description": "No dar más de 5 recomendaciones por semana al mismo merchant"}'::jsonb
WHERE id = 'R-298';

-- =============================================
-- VISUAL AD — Rules R-299 to R-308
-- =============================================

-- R-299: Imagen min 1080px
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "image_width", "min": 1080, "unit": "px", "description": "Rechazar: Imagen debe tener al menos 1080px de ancho"}'::jsonb
WHERE id = 'R-299';

-- R-300: No borrosa
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "vision", "field": "creative_url", "check": "blur", "description": "Rechazar: Imagen no debe estar borrosa"}'::jsonb
WHERE id = 'R-300';

-- R-301: Logo visible
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "vision", "field": "creative_url", "check": "logo", "description": "Logo de la marca debe ser visible en la pieza"}'::jsonb
WHERE id = 'R-301';

-- R-302: Producto visible
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "vision", "field": "creative_url", "check": "product_visible", "description": "Producto debe ser claramente visible en la pieza"}'::jsonb
WHERE id = 'R-302';

-- R-303: Texto < 20%
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "vision", "field": "creative_url", "check": "text_ratio_20pct", "description": "Rechazar: Texto no debe ocupar más del 20% de la imagen"}'::jsonb
WHERE id = 'R-303';

-- R-304: Sin marca agua
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "vision", "field": "creative_url", "check": "no_watermark", "description": "Rechazar: No debe tener marca de agua de stock photos o herramientas"}'::jsonb
WHERE id = 'R-304';

-- R-305: Colores marca
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "vision", "field": "creative_url", "check": "brand_colors", "context_fields": ["brand_colors"], "description": "Colores deben ser coherentes con la paleta de la marca"}'::jsonb
WHERE id = 'R-305';

-- R-306: Texto no cortado
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "vision", "field": "creative_url", "check": "text_overlay", "description": "Rechazar: Texto dentro de la imagen no debe estar cortado ni fuera de frame"}'::jsonb
WHERE id = 'R-306';

-- R-307: Rostro no cortado
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "vision", "field": "creative_url", "check": "face_crop", "description": "Rechazar: Si hay rostros, no deben estar cortados"}'::jsonb
WHERE id = 'R-307';

-- R-308: Fondo limpio
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "vision", "field": "creative_url", "check": "clean_background", "description": "Fondo debe ser limpio y no distraer del producto/mensaje"}'::jsonb
WHERE id = 'R-308';

-- =============================================
-- VISUAL BRAND — Rules R-319 to R-328
-- =============================================

-- R-319: Logo correcto
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "vision", "field": "creative_url", "check": "logo_correct", "context_fields": ["brand_logo_url"], "description": "Rechazar: Logo debe ser el correcto de la marca y estar bien renderizado"}'::jsonb
WHERE id = 'R-319';

-- R-320: Paleta de colores
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "vision", "field": "creative_url", "check": "color_palette", "context_fields": ["brand_colors"], "description": "Colores deben pertenecer a la paleta de la marca"}'::jsonb
WHERE id = 'R-320';

-- R-321: Tipografía marca
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "vision", "field": "creative_url", "check": "brand_typography", "context_fields": ["brand_fonts"], "description": "Tipografía debe coincidir con la definida por la marca"}'::jsonb
WHERE id = 'R-321';

-- R-322: Tono visual coherente
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "creative_url", "prompt": "Evalúa si el tono visual de la pieza (iluminación, estilo, mood) es coherente con la identidad visual de la marca.", "context_fields": ["brand_visual_style", "brand_mood"], "threshold": 0.5}'::jsonb
WHERE id = 'R-322';

-- R-323: Consistencia entre piezas
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "creative_url", "prompt": "Evalúa si esta pieza es visualmente consistente con las otras piezas de la misma campaña/serie.", "context_fields": ["campaign_creatives"], "threshold": 0.5}'::jsonb
WHERE id = 'R-323';

-- R-324: Sin elementos genéricos
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "creative_url", "prompt": "Evalúa si la pieza evita elementos genéricos de stock (ej: personas de stock muy genéricas, iconos básicos, fondos predeterminados). La pieza debe sentirse personalizada.", "threshold": 0.5}'::jsonb
WHERE id = 'R-324';

-- R-325: Aspect ratio consistente
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "creative_aspect_ratio", "field_b": "_campaign_aspect_ratio", "operator": "eq", "description": "Aspect ratio debe ser consistente con las otras piezas de la campaña"}'::jsonb
WHERE id = 'R-325';

-- R-326: Calidad homogénea
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "creative_url", "prompt": "Evalúa si la calidad visual de esta pieza es homogénea con el resto de la campaña. No debe haber una pieza de mucha mejor/peor calidad que las demás.", "context_fields": ["campaign_creatives"], "threshold": 0.5}'::jsonb
WHERE id = 'R-326';

-- R-327: Precio en formato correcto
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "creative_text_overlay", "pattern": "\\$\\s*\\d{1,3}(\\.\\d{3})+", "flags": "g", "should_match": true, "description": "Precios en la imagen deben estar en formato chileno ($XX.XXX)"}'::jsonb
WHERE id = 'R-327';

-- R-328: No pixelación en zoom
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "vision", "field": "creative_url", "check": "no_pixelation", "description": "Imagen no debe mostrar pixelación visible"}'::jsonb
WHERE id = 'R-328';

-- =============================================
-- SHOPIFY SYNC — Rules R-329 to R-343
-- =============================================

-- R-329: Productos sincronizados < 24h
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "shopify_products", "match_field": "shop_id", "match_value_field": "shop_id", "check": "freshness", "value_field": "updated_at", "max_age_hours": 24, "description": "Productos de Shopify deben haberse sincronizado en las últimas 24 horas"}'::jsonb
WHERE id = 'R-329';

-- R-330: Conexión Shopify activa
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_connections", "match_field": "client_id", "match_value_field": "client_id", "check": "value_matches", "value_field": "status", "expected_value": "active", "filter_field": "platform", "filter_value": "shopify", "description": "Conexión Shopify debe estar activa"}'::jsonb
WHERE id = 'R-330';

-- R-331: Token no expirado
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_connections", "match_field": "client_id", "match_value_field": "client_id", "check": "not_expired", "value_field": "token_expires_at", "filter_field": "platform", "filter_value": "shopify", "description": "Token de Shopify no debe estar expirado"}'::jsonb
WHERE id = 'R-331';

-- R-332: Webhook activo
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_connections", "match_field": "client_id", "match_value_field": "client_id", "check": "value_matches", "value_field": "webhook_active", "expected_value": true, "filter_field": "platform", "filter_value": "shopify", "description": "Webhook de Shopify debe estar activo"}'::jsonb
WHERE id = 'R-332';

-- R-333: Precios sincronizados
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "shopify_products", "match_field": "shop_id", "match_value_field": "shop_id", "check": "freshness", "value_field": "price_updated_at", "max_age_hours": 24, "description": "Precios deben haberse sincronizado en las últimas 24 horas"}'::jsonb
WHERE id = 'R-333';

-- R-334: Stock sincronizado
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "shopify_products", "match_field": "shop_id", "match_value_field": "shop_id", "check": "freshness", "value_field": "inventory_updated_at", "max_age_hours": 12, "description": "Stock debe haberse sincronizado en las últimas 12 horas"}'::jsonb
WHERE id = 'R-334';

-- R-335: Colecciones sincronizadas
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "shopify_products", "match_field": "shop_id", "match_value_field": "shop_id", "check": "freshness", "value_field": "collections_updated_at", "max_age_hours": 48, "description": "Colecciones deben haberse sincronizado en las últimas 48 horas"}'::jsonb
WHERE id = 'R-335';

-- R-336: Pedidos sincronizados
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_metrics", "match_field": "shop_id", "match_value_field": "shop_id", "check": "freshness", "value_field": "orders_updated_at", "max_age_hours": 6, "description": "Pedidos deben haberse sincronizado en las últimas 6 horas"}'::jsonb
WHERE id = 'R-336';

-- R-337: Clientes sincronizados
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_metrics", "match_field": "shop_id", "match_value_field": "shop_id", "check": "freshness", "value_field": "customers_updated_at", "max_age_hours": 24, "description": "Datos de clientes deben haberse sincronizado en las últimas 24 horas"}'::jsonb
WHERE id = 'R-337';

-- R-338: Imágenes de productos
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "shopify_products", "match_field": "shop_id", "match_value_field": "shop_id", "check": "has_field", "value_field": "image_url", "description": "Productos deben tener imágenes sincronizadas"}'::jsonb
WHERE id = 'R-338';

-- R-339: Variantes sincronizadas
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "shopify_products", "match_field": "shop_id", "match_value_field": "shop_id", "check": "has_field", "value_field": "variants", "description": "Variantes de productos deben estar sincronizadas"}'::jsonb
WHERE id = 'R-339';

-- R-340: Descuentos sincronizados
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "shopify_products", "match_field": "shop_id", "match_value_field": "shop_id", "check": "freshness", "value_field": "discounts_updated_at", "max_age_hours": 24, "description": "Descuentos deben haberse sincronizado en las últimas 24 horas"}'::jsonb
WHERE id = 'R-340';

-- R-341: Sin errores de sync recientes
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_connections", "match_field": "client_id", "match_value_field": "client_id", "check": "no_recent_errors", "value_field": "last_error_at", "max_age_hours": 1, "filter_field": "platform", "filter_value": "shopify", "description": "No debe haber errores de sync en la última hora"}'::jsonb
WHERE id = 'R-341';

-- R-342: Conteo de productos coincide
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "shopify_products", "match_field": "shop_id", "match_value_field": "shop_id", "check": "count_matches", "compare_source": "shopify_api", "description": "Número de productos en Supabase debe coincidir con Shopify"}'::jsonb
WHERE id = 'R-342';

-- R-343: Metadatos completos
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "shopify_products", "match_field": "shop_id", "match_value_field": "shop_id", "check": "has_field", "value_field": "title,description,price,status", "description": "Productos deben tener título, descripción, precio y status sincronizados"}'::jsonb
WHERE id = 'R-343';

-- =============================================
-- SHOPIFY PRODUCT — Rules R-344 to R-353
-- =============================================

-- R-344: Producto tiene título
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "title", "description": "Todo producto debe tener título"}'::jsonb
WHERE id = 'R-344';

-- R-345: Producto tiene descripción
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "description", "description": "Todo producto debe tener descripción"}'::jsonb
WHERE id = 'R-345';

-- R-346: Producto tiene imagen
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "image_url", "description": "Todo producto debe tener al menos una imagen"}'::jsonb
WHERE id = 'R-346';

-- R-347: Producto tiene precio > 0
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "shopify_products", "match_field": "id", "match_value_field": "product_id", "check": "value_gt", "value_field": "price", "min_value": 0, "description": "Producto debe tener precio mayor a 0"}'::jsonb
WHERE id = 'R-347';

-- R-348: Producto tiene categoría
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "product_type", "description": "Producto debería tener categoría/tipo definido"}'::jsonb
WHERE id = 'R-348';

-- R-349: Producto tiene SKU
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "sku", "description": "Producto debería tener SKU"}'::jsonb
WHERE id = 'R-349';

-- R-350: Producto tiene peso
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "shopify_products", "match_field": "id", "match_value_field": "product_id", "check": "has_field", "value_field": "weight", "description": "Producto debería tener peso para calcular envío"}'::jsonb
WHERE id = 'R-350';

-- R-351: Producto no duplicado
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "shopify_products", "match_field": "shop_id", "match_value_field": "shop_id", "check": "no_duplicates", "value_field": "title", "description": "No debe haber productos con título duplicado"}'::jsonb
WHERE id = 'R-351';

-- R-352: Variante tiene precio
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "shopify_products", "match_field": "id", "match_value_field": "product_id", "check": "variants_have_price", "value_field": "variants", "description": "Todas las variantes deben tener precio"}'::jsonb
WHERE id = 'R-352';

-- R-353: Producto tiene tags
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "tags", "description": "Producto debería tener tags para mejor segmentación"}'::jsonb
WHERE id = 'R-353';

-- =============================================
-- SHOPIFY ORDER — Rules R-354 to R-358
-- =============================================

-- R-354: Order total coincide
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_metrics", "match_field": "shop_id", "match_value_field": "shop_id", "check": "value_matches", "value_field": "order_total", "compare_source": "shopify_api", "description": "Total de la orden en Supabase debe coincidir con Shopify"}'::jsonb
WHERE id = 'R-354';

-- R-355: Order status sincronizado
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_metrics", "match_field": "shop_id", "match_value_field": "shop_id", "check": "value_matches", "value_field": "financial_status", "compare_source": "shopify_api", "description": "Estado financiero de la orden debe coincidir con Shopify"}'::jsonb
WHERE id = 'R-355';

-- R-356: Fulfillment sincronizado
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_metrics", "match_field": "shop_id", "match_value_field": "shop_id", "check": "value_matches", "value_field": "fulfillment_status", "compare_source": "shopify_api", "description": "Estado de fulfillment debe coincidir con Shopify"}'::jsonb
WHERE id = 'R-356';

-- R-357: Refund sincronizado
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_metrics", "match_field": "shop_id", "match_value_field": "shop_id", "check": "value_matches", "value_field": "refund_amount", "compare_source": "shopify_api", "description": "Monto de refund debe coincidir con Shopify"}'::jsonb
WHERE id = 'R-357';

-- R-358: Customer data sincronizado
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_metrics", "match_field": "shop_id", "match_value_field": "shop_id", "check": "value_matches", "value_field": "customer_email", "compare_source": "shopify_api", "description": "Datos de cliente de la orden deben coincidir con Shopify"}'::jsonb
WHERE id = 'R-358';

-- =============================================
-- SHOPIFY ANALYTICS — Rules R-359 to R-368
-- =============================================

-- R-359: Revenue diario fresco
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_metrics", "match_field": "shop_id", "match_value_field": "shop_id", "check": "freshness", "value_field": "revenue_updated_at", "max_age_hours": 6, "description": "Revenue diario debe haberse actualizado en las últimas 6 horas"}'::jsonb
WHERE id = 'R-359';

-- R-360: Conversión rate actualizado
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_metrics", "match_field": "shop_id", "match_value_field": "shop_id", "check": "freshness", "value_field": "conversion_updated_at", "max_age_hours": 12, "description": "Tasa de conversión debe haberse actualizado en las últimas 12 horas"}'::jsonb
WHERE id = 'R-360';

-- R-361: AOV actualizado
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_metrics", "match_field": "shop_id", "match_value_field": "shop_id", "check": "freshness", "value_field": "aov_updated_at", "max_age_hours": 12, "description": "AOV debe haberse actualizado en las últimas 12 horas"}'::jsonb
WHERE id = 'R-361';

-- R-362: Top products actualizado
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_metrics", "match_field": "shop_id", "match_value_field": "shop_id", "check": "freshness", "value_field": "top_products_updated_at", "max_age_hours": 24, "description": "Ranking de top products debe haberse actualizado en las últimas 24 horas"}'::jsonb
WHERE id = 'R-362';

-- R-363: Traffic sources actualizado
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_metrics", "match_field": "shop_id", "match_value_field": "shop_id", "check": "freshness", "value_field": "traffic_updated_at", "max_age_hours": 24, "description": "Fuentes de tráfico deben haberse actualizado en las últimas 24 horas"}'::jsonb
WHERE id = 'R-363';

-- R-364: Cart abandonment rate actualizado
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_metrics", "match_field": "shop_id", "match_value_field": "shop_id", "check": "freshness", "value_field": "cart_abandon_updated_at", "max_age_hours": 24, "description": "Tasa de abandono de carrito debe haberse actualizado en las últimas 24 horas"}'::jsonb
WHERE id = 'R-364';

-- R-365: Customer segments actualizados
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_metrics", "match_field": "shop_id", "match_value_field": "shop_id", "check": "freshness", "value_field": "segments_updated_at", "max_age_hours": 48, "description": "Segmentos de clientes deben haberse actualizado en las últimas 48 horas"}'::jsonb
WHERE id = 'R-365';

-- R-366: Geographic data actualizado
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_metrics", "match_field": "shop_id", "match_value_field": "shop_id", "check": "freshness", "value_field": "geo_updated_at", "max_age_hours": 48, "description": "Datos geográficos deben haberse actualizado en las últimas 48 horas"}'::jsonb
WHERE id = 'R-366';

-- R-367: Refund analytics actualizado
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_metrics", "match_field": "shop_id", "match_value_field": "shop_id", "check": "freshness", "value_field": "refund_analytics_updated_at", "max_age_hours": 24, "description": "Analytics de refunds deben haberse actualizado en las últimas 24 horas"}'::jsonb
WHERE id = 'R-367';

-- R-368: Repeat customer rate actualizado
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_metrics", "match_field": "shop_id", "match_value_field": "shop_id", "check": "freshness", "value_field": "repeat_rate_updated_at", "max_age_hours": 48, "description": "Tasa de clientes recurrentes debe haberse actualizado en las últimas 48 horas"}'::jsonb
WHERE id = 'R-368';

-- =============================================
-- UX PORTAL — Rules R-369 to R-403
-- =============================================

-- R-369: Dashboard carga < 3s
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "page_load_ms", "max": 3000, "unit": "ms", "page": "dashboard", "description": "Dashboard debe cargar en menos de 3 segundos"}'::jsonb
WHERE id = 'R-369';

-- R-370: Login carga < 2s
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "page_load_ms", "max": 2000, "unit": "ms", "page": "login", "description": "Página de login debe cargar en menos de 2 segundos"}'::jsonb
WHERE id = 'R-370';

-- R-371: Chat responde < 1s (primer token)
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "first_token_ms", "max": 1000, "unit": "ms", "page": "chat", "description": "Chat debe mostrar primer token en menos de 1 segundo"}'::jsonb
WHERE id = 'R-371';

-- R-372: Métricas visibles sin scroll
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "metrics_above_fold", "description": "Métricas principales deben ser visibles sin scroll"}'::jsonb
WHERE id = 'R-372';

-- R-373: Mobile responsive
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "lighthouse", "field": "portal_url", "check": "mobile_responsive", "description": "Portal debe ser responsive en móvil (375px)"}'::jsonb
WHERE id = 'R-373';

-- R-374: Navegación intuitiva
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "navigation_structure", "prompt": "Evalúa si la navegación del portal es intuitiva: ¿el usuario puede encontrar las funciones principales en 2 clicks o menos?", "threshold": 0.6}'::jsonb
WHERE id = 'R-374';

-- R-375: Estados de carga
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "has_loading_states", "description": "Todas las secciones deben mostrar estados de carga (skeleton/spinner)"}'::jsonb
WHERE id = 'R-375';

-- R-376: Estados de error
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "has_error_states", "description": "Todas las secciones deben manejar y mostrar estados de error"}'::jsonb
WHERE id = 'R-376';

-- R-377: Estados vacíos
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "has_empty_states", "description": "Secciones sin datos deben mostrar empty states informativos"}'::jsonb
WHERE id = 'R-377';

-- R-378: Breadcrumbs presentes
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "has_breadcrumbs", "description": "Páginas internas deben tener breadcrumbs de navegación"}'::jsonb
WHERE id = 'R-378';

-- R-379: Toast notifications
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "has_toast_notifications", "description": "Acciones del usuario deben dar feedback via toast notifications"}'::jsonb
WHERE id = 'R-379';

-- R-380: Confirmación acciones destructivas
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "has_confirmation_dialogs", "description": "Acciones destructivas (borrar, cancelar) deben pedir confirmación"}'::jsonb
WHERE id = 'R-380';

-- R-381: Contraste WCAG AA
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "accessibility", "field": "portal_url", "check": "contrast_aa", "description": "Contraste de texto debe cumplir WCAG AA (4.5:1 min)"}'::jsonb
WHERE id = 'R-381';

-- R-382: Tab navigation
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "accessibility", "field": "portal_url", "check": "tab_navigation", "description": "Portal debe ser navegable con Tab"}'::jsonb
WHERE id = 'R-382';

-- R-383: Alt text en imágenes
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "accessibility", "field": "portal_url", "check": "img_alt_text", "description": "Todas las imágenes deben tener alt text"}'::jsonb
WHERE id = 'R-383';

-- R-384: Formularios con labels
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "forms_have_labels", "description": "Todos los inputs de formularios deben tener labels"}'::jsonb
WHERE id = 'R-384';

-- R-385: Validación de formularios
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "forms_have_validation", "description": "Formularios deben tener validación inline"}'::jsonb
WHERE id = 'R-385';

-- R-386: 404 page
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "has_404_page", "description": "Portal debe tener página 404 personalizada"}'::jsonb
WHERE id = 'R-386';

-- R-387: Favicon presente
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "url_check", "field": "portal_url/favicon.ico", "description": "Portal debe tener favicon"}'::jsonb
WHERE id = 'R-387';

-- R-388: Title tags correctos
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "has_page_titles", "description": "Cada página debe tener title tag descriptivo"}'::jsonb
WHERE id = 'R-388';

-- R-389: Logout funcional
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "url_check", "field": "logout_endpoint", "check": "redirects", "description": "Logout debe funcionar y redirigir a login"}'::jsonb
WHERE id = 'R-389';

-- R-390: Session timeout
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "session_timeout_minutes", "min": 30, "max": 480, "unit": "min", "description": "Session debe expirar entre 30min y 8hrs"}'::jsonb
WHERE id = 'R-390';

-- R-391: Gráficos legibles
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "chart_screenshot", "prompt": "Evalúa si los gráficos del dashboard son legibles: labels claros, colores distinguibles, ejes con unidades, tooltips informativos.", "threshold": 0.6}'::jsonb
WHERE id = 'R-391';

-- R-392: Datos exportables
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "has_export_function", "description": "Tablas de datos deben tener opción de exportar (CSV/PDF)"}'::jsonb
WHERE id = 'R-392';

-- R-393: Filtros funcionales
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "filters_work", "description": "Filtros de fecha y categoría deben funcionar correctamente"}'::jsonb
WHERE id = 'R-393';

-- R-394: Paginación en tablas largas
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "has_pagination", "description": "Tablas con >20 filas deben tener paginación"}'::jsonb
WHERE id = 'R-394';

-- R-395: Búsqueda funcional
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "search_works", "description": "Buscador del portal debe funcionar y devolver resultados relevantes"}'::jsonb
WHERE id = 'R-395';

-- R-396: Onboarding flow completo
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "onboarding_complete", "description": "Flow de onboarding debe cubrir todos los pasos sin errores"}'::jsonb
WHERE id = 'R-396';

-- R-397: Help/docs accesible
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "has_help_section", "description": "Portal debe tener sección de ayuda accesible"}'::jsonb
WHERE id = 'R-397';

-- R-398: Notificaciones in-app
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "has_notifications", "description": "Portal debe tener sistema de notificaciones in-app"}'::jsonb
WHERE id = 'R-398';

-- R-399: Consistent spacing
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "portal_screenshot", "prompt": "Evalúa si el portal tiene espaciado consistente entre elementos (mismo padding, mismos márgenes, alineación coherente).", "threshold": 0.5}'::jsonb
WHERE id = 'R-399';

-- R-400: Color consistency
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "portal_screenshot", "prompt": "Evalúa si los colores del portal son consistentes: mismo azul para todos los CTAs, mismo gris para textos secundarios, etc.", "threshold": 0.5}'::jsonb
WHERE id = 'R-400';

-- R-401: Font consistency
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "font_families_count", "max": 3, "description": "Portal no debe usar más de 3 familias de fuentes"}'::jsonb
WHERE id = 'R-401';

-- R-402: Image optimization
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "largest_image_kb", "max": 500, "unit": "KB", "description": "Imágenes del portal no deben superar 500KB"}'::jsonb
WHERE id = 'R-402';

-- R-403: No console errors
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "lighthouse", "field": "portal_url", "check": "no_console_errors", "description": "Portal no debe tener errores en consola del navegador"}'::jsonb
WHERE id = 'R-403';

-- =============================================
-- SECURITY — Rules R-404 to R-416
-- =============================================

-- R-404: HTTPS obligatorio
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "uses_https", "description": "Todo el tráfico debe ser HTTPS"}'::jsonb
WHERE id = 'R-404';

-- R-405: JWT válido
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "jwt_valid", "description": "JWT debe ser válido y no expirado en cada request"}'::jsonb
WHERE id = 'R-405';

-- R-406: RLS activado
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "information_schema.tables", "check": "rls_enabled", "description": "RLS debe estar activado en todas las tablas con datos de clientes"}'::jsonb
WHERE id = 'R-406';

-- R-407: No SQL injection
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "query_params", "pattern": "(''|--|;|DROP|DELETE|UPDATE|INSERT)\\s", "flags": "gi", "should_match": false, "description": "Parámetros no deben contener patrones de SQL injection"}'::jsonb
WHERE id = 'R-407';

-- R-408: Rate limiting activo
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "rate_limit_configured", "description": "API debe tener rate limiting configurado"}'::jsonb
WHERE id = 'R-408';

-- R-409: CORS configurado
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "cors_configured", "description": "CORS debe estar configurado y restringido a dominios autorizados"}'::jsonb
WHERE id = 'R-409';

-- R-410: Secrets no en código
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "source_code", "pattern": "(sk_|secret_|password\\s*=\\s*[\"'']|api_key\\s*=\\s*[\"''])", "flags": "gi", "should_match": false, "description": "Secrets no deben estar hardcodeados en el código fuente"}'::jsonb
WHERE id = 'R-410';

-- R-411: Tokens encriptados en DB
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_connections", "check": "field_encrypted", "value_field": "access_token", "description": "Tokens de acceso deben estar encriptados en la base de datos"}'::jsonb
WHERE id = 'R-411';

-- R-412: Audit log de acciones
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "audit_log_enabled", "description": "Acciones críticas deben registrarse en audit log"}'::jsonb
WHERE id = 'R-412';

-- R-413: Password policy
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "password_policy_enforced", "description": "Passwords deben cumplir política mínima (8 chars, mix)"}'::jsonb
WHERE id = 'R-413';

-- R-414: Session invalidation
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "session_invalidation_works", "description": "Sessions deben invalidarse correctamente al logout"}'::jsonb
WHERE id = 'R-414';

-- R-415: No data leaks en responses
UPDATE criterio_rules SET check_type = 'regex', implemented = true,
  check_config = '{"field": "api_response", "pattern": "(password|secret|token|private_key|credit_card)", "flags": "gi", "should_match": false, "description": "Respuestas API no deben filtrar datos sensibles"}'::jsonb
WHERE id = 'R-415';

-- R-416: Webhook HMAC verification
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "webhook_hmac_verified", "description": "Webhooks entrantes deben verificar HMAC signature"}'::jsonb
WHERE id = 'R-416';

-- =============================================
-- LEGAL — Rules R-417 to R-427
-- =============================================

-- R-417: Términos y condiciones
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "has_terms", "description": "Portal debe tener términos y condiciones accesibles"}'::jsonb
WHERE id = 'R-417';

-- R-418: Política de privacidad
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "has_privacy_policy", "description": "Portal debe tener política de privacidad"}'::jsonb
WHERE id = 'R-418';

-- R-419: Consentimiento de datos
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "has_consent_flow", "description": "Debe existir flujo de consentimiento de datos"}'::jsonb
WHERE id = 'R-419';

-- R-420: Derecho al olvido
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "has_data_deletion", "description": "Debe existir mecanismo para eliminar datos del usuario"}'::jsonb
WHERE id = 'R-420';

-- R-421: No datos de menores
UPDATE criterio_rules SET check_type = 'forbidden', implemented = true,
  check_config = '{"field": "user_age", "words": [], "custom_check": "age_min_18", "description": "No procesar datos de menores de 18 años"}'::jsonb
WHERE id = 'R-421';

-- R-422: Ads disclaimers
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "ad_content", "prompt": "Evalúa si el contenido publicitario incluye los disclaimers necesarios cuando corresponda (ej: stock limitado, condiciones aplican, precios con IVA).", "threshold": 0.5}'::jsonb
WHERE id = 'R-422';

-- R-423: Anti-spam compliance
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "anti_spam_compliant", "description": "Emails deben cumplir con ley anti-spam (CAN-SPAM/GDPR equivalente Chile)"}'::jsonb
WHERE id = 'R-423';

-- R-424: Data retention policy
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "data_retention_config", "prompt": "Evalúa si la plataforma tiene una política de retención de datos clara: cuánto tiempo se guardan los datos, cuándo se eliminan, qué datos se anonomizan.", "threshold": 0.5}'::jsonb
WHERE id = 'R-424';

-- R-425: Cookie consent
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "has_cookie_consent", "description": "Portal debe tener banner de consentimiento de cookies"}'::jsonb
WHERE id = 'R-425';

-- R-426: No claims falsos
UPDATE criterio_rules SET check_type = 'forbidden', implemented = true,
  check_config = '{"field": "ad_content", "words": ["100% garantizado", "sin riesgo", "resultados garantizados", "dinero fácil", "ganancias aseguradas", "cura", "sana", "milagroso"], "description": "No hacer claims falsos o engañosos en publicidad"}'::jsonb
WHERE id = 'R-426';

-- R-427: Intellectual property check
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "creative_content", "prompt": "Evalúa si el contenido creativo respeta propiedad intelectual: no usa logos de terceros sin permiso, no copia textos de competidores, no usa imágenes con copyright.", "threshold": 0.6}'::jsonb
WHERE id = 'R-427';

-- =============================================
-- INFRA — Rules R-428 to R-437
-- =============================================

-- R-428: Cloud Run healthy
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "health_check", "field": "cloud_run_url", "endpoint": "/health", "expected_status": 200, "description": "Cloud Run steve-api debe responder 200 en /health"}'::jsonb
WHERE id = 'R-428';

-- R-429: Supabase healthy
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "health_check", "field": "supabase_url", "endpoint": "/rest/v1/", "expected_status": 200, "description": "Supabase debe responder 200"}'::jsonb
WHERE id = 'R-429';

-- R-430: Edge functions healthy
UPDATE criterio_rules SET check_type = 'external', implemented = true,
  check_config = '{"service": "health_check", "field": "supabase_url", "endpoint": "/functions/v1/health", "expected_status": 200, "description": "Edge functions deben responder"}'::jsonb
WHERE id = 'R-430';

-- R-431: Crons ejecutándose
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "cron_last_run_minutes", "max": 120, "unit": "min", "description": "Crons deben haberse ejecutado en las últimas 2 horas"}'::jsonb
WHERE id = 'R-431';

-- R-432: Error rate < 5%
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "error_rate_pct", "max": 5, "unit": "%", "description": "Error rate de la API debe ser menor al 5%"}'::jsonb
WHERE id = 'R-432';

-- R-433: Latencia P95 < 5s
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "p95_latency_ms", "max": 5000, "unit": "ms", "description": "Latencia P95 debe ser menor a 5 segundos"}'::jsonb
WHERE id = 'R-433';

-- R-434: DB connections < 80%
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "db_connection_usage_pct", "max": 80, "unit": "%", "description": "Uso de conexiones a DB debe ser menor al 80%"}'::jsonb
WHERE id = 'R-434';

-- R-435: Storage < 90%
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "storage_usage_pct", "max": 90, "unit": "%", "description": "Uso de storage debe ser menor al 90%"}'::jsonb
WHERE id = 'R-435';

-- R-436: SSL certificado válido
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "ssl_valid", "description": "Certificado SSL debe ser válido y no estar próximo a expirar"}'::jsonb
WHERE id = 'R-436';

-- R-437: Backup reciente
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "last_backup_hours", "max": 24, "unit": "hrs", "description": "Debe existir un backup de las últimas 24 horas"}'::jsonb
WHERE id = 'R-437';

-- =============================================
-- INTEL — Rules R-453 to R-459
-- =============================================

-- R-453: Competitor ads frescos
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "competitor_ads", "match_field": "client_id", "match_value_field": "client_id", "check": "freshness", "value_field": "updated_at", "max_age_hours": 168, "description": "Datos de ads de competidores deben tener menos de 7 días"}'::jsonb
WHERE id = 'R-453';

-- R-454: Brand research actualizado
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "brand_research", "match_field": "client_id", "match_value_field": "client_id", "check": "freshness", "value_field": "updated_at", "max_age_hours": 720, "description": "Brand research debe haberse actualizado en los últimos 30 días"}'::jsonb
WHERE id = 'R-454';

-- R-455: Competitor tracking activo
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "competitor_tracking", "match_field": "client_id", "match_value_field": "client_id", "check": "exists", "description": "Debe haber al menos un competidor siendo tracked"}'::jsonb
WHERE id = 'R-455';

-- R-456: Industry benchmarks disponibles
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "industry_benchmarks_loaded", "description": "Benchmarks de la industria deben estar cargados"}'::jsonb
WHERE id = 'R-456';

-- R-457: Recommendations basadas en data
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "campaign_recommendations", "match_field": "client_id", "match_value_field": "client_id", "check": "has_field", "value_field": "data_source", "description": "Recomendaciones deben estar respaldadas por data"}'::jsonb
WHERE id = 'R-457';

-- R-458: Trend data disponible
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_metrics", "match_field": "shop_id", "match_value_field": "shop_id", "check": "min_datapoints", "min_count": 7, "description": "Debe haber al menos 7 días de data para calcular tendencias"}'::jsonb
WHERE id = 'R-458';

-- R-459: Alertas de mercado configuradas
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "market_alerts_configured", "description": "Alertas de cambios de mercado deben estar configuradas"}'::jsonb
WHERE id = 'R-459';

-- =============================================
-- REPORT — Rules R-460 to R-472
-- =============================================

-- R-460: Reporte tiene fecha
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "report_date", "description": "Reporte debe incluir fecha de generación"}'::jsonb
WHERE id = 'R-460';

-- R-461: Reporte tiene período
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "report_period", "description": "Reporte debe indicar período que cubre"}'::jsonb
WHERE id = 'R-461';

-- R-462: Métricas clave incluidas
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "key_metrics_present", "required_fields": ["revenue", "orders", "conversion_rate", "aov"], "description": "Reporte debe incluir métricas clave: revenue, pedidos, conversión, AOV"}'::jsonb
WHERE id = 'R-462';

-- R-463: Comparación temporal
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "has_comparison", "description": "Reporte debe incluir comparación con período anterior"}'::jsonb
WHERE id = 'R-463';

-- R-464: Gráficos incluidos
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "chart_count", "min": 1, "description": "Reporte debe incluir al menos 1 gráfico"}'::jsonb
WHERE id = 'R-464';

-- R-465: Insights accionables
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "report_insights", "prompt": "Evalúa si los insights del reporte son accionables: el merchant debe poder tomar una decisión basada en cada insight. No basta con describir números, debe decir QUÉ HACER.", "threshold": 0.6}'::jsonb
WHERE id = 'R-465';

-- R-466: Datos verificables
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "report_data", "prompt": "Evalúa si los datos del reporte son verificables: tienen fuente, tienen período, y los números son consistentes entre sí (ej: revenue = orders x AOV).", "threshold": 0.7}'::jsonb
WHERE id = 'R-466';

-- R-467: Formato profesional
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "report_content", "prompt": "Evalúa si el reporte tiene formato profesional: títulos claros, secciones organizadas, sin errores de formato, números bien formateados.", "threshold": 0.6}'::jsonb
WHERE id = 'R-467';

-- R-468: Reporte no supera 10 páginas
UPDATE criterio_rules SET check_type = 'range', implemented = true,
  check_config = '{"field": "report_page_count", "max": 10, "unit": "páginas", "description": "Reporte no debe superar 10 páginas"}'::jsonb
WHERE id = 'R-468';

-- R-469: Resumen ejecutivo
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "has_executive_summary", "description": "Reporte debe tener resumen ejecutivo al inicio"}'::jsonb
WHERE id = 'R-469';

-- R-470: Next steps definidos
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "has_next_steps", "description": "Reporte debe incluir sección de next steps/recomendaciones"}'::jsonb
WHERE id = 'R-470';

-- R-471: Branding del reporte
UPDATE criterio_rules SET check_type = 'required', implemented = true,
  check_config = '{"field": "has_branding", "description": "Reporte debe incluir branding de Steve"}'::jsonb
WHERE id = 'R-471';

-- R-472: Personalizado al merchant
UPDATE criterio_rules SET check_type = 'ai', implemented = true,
  check_config = '{"field": "report_content", "prompt": "Evalúa si el reporte está personalizado para este merchant específico: menciona el nombre de la tienda, usa datos reales del merchant, no es un template genérico.", "threshold": 0.6}'::jsonb
WHERE id = 'R-472';

-- =============================================
-- CROSS CONSIST — Rules R-480 to R-486
-- =============================================

-- R-480: Meta + Email no contradicen
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "meta_reported_revenue", "field_b": "email_reported_revenue", "operator": "consistent", "tolerance_pct": 10, "description": "Revenue reportado por Meta y Email no debe contradecirse"}'::jsonb
WHERE id = 'R-480';

-- R-481: Shopify + Meta revenue coherente
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "shopify_total_revenue", "field_b": "meta_attributed_revenue", "operator": "gte", "description": "Revenue total de Shopify debe ser >= revenue atribuido a Meta"}'::jsonb
WHERE id = 'R-481';

-- R-482: Stock consistente entre canales
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "shopify_stock", "field_b": "ad_promoted_stock", "operator": "gte", "description": "Stock en Shopify debe ser >= stock promovido en ads"}'::jsonb
WHERE id = 'R-482';

-- R-483: Precios consistentes entre canales
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "shopify_price", "field_b": "ad_displayed_price", "operator": "eq", "description": "Precio en Shopify debe coincidir con precio mostrado en ads"}'::jsonb
WHERE id = 'R-483';

-- R-484: Descuento consistente entre canales
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "shopify_discount", "field_b": "email_discount", "operator": "eq", "description": "Descuento en Shopify debe coincidir con descuento en email"}'::jsonb
WHERE id = 'R-484';

-- R-485: Métricas Steve vs Shopify
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "steve_reported_metrics", "field_b": "shopify_actual_metrics", "operator": "consistent", "tolerance_pct": 5, "description": "Métricas que Steve reporta deben ser consistentes con Shopify (±5%)"}'::jsonb
WHERE id = 'R-485';

-- R-486: Calendario consistente entre canales
UPDATE criterio_rules SET check_type = 'comparison', implemented = true,
  check_config = '{"field_a": "meta_campaign_dates", "field_b": "email_campaign_dates", "operator": "no_overlap_conflict", "description": "Campañas de Meta y Email no deben tener conflictos de calendario"}'::jsonb
WHERE id = 'R-486';

-- =============================================
-- CROSS SYNC — Rules R-487 to R-493
-- =============================================

-- R-487: Shopify → Supabase sync
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "shopify_products", "match_field": "shop_id", "match_value_field": "shop_id", "check": "freshness", "value_field": "synced_at", "max_age_hours": 24, "description": "Datos de Shopify deben estar sincronizados con Supabase (<24h)"}'::jsonb
WHERE id = 'R-487';

-- R-488: Meta → Supabase sync
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "campaign_metrics", "match_field": "client_id", "match_value_field": "client_id", "check": "freshness", "value_field": "synced_at", "max_age_hours": 12, "description": "Métricas de Meta deben estar sincronizadas con Supabase (<12h)"}'::jsonb
WHERE id = 'R-488';

-- R-489: Klaviyo → Supabase sync
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "email_subscribers", "match_field": "client_id", "match_value_field": "client_id", "check": "freshness", "value_field": "synced_at", "max_age_hours": 24, "description": "Suscriptores de Klaviyo deben estar sincronizados con Supabase (<24h)"}'::jsonb
WHERE id = 'R-489';

-- R-490: Steve Knowledge actualizado
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "steve_knowledge", "match_field": "client_id", "match_value_field": "client_id", "check": "freshness", "value_field": "updated_at", "max_age_hours": 168, "description": "Steve Knowledge debe haberse actualizado en los últimos 7 días"}'::jsonb
WHERE id = 'R-490';

-- R-491: Creative history sincronizado
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "creative_history", "match_field": "client_id", "match_value_field": "client_id", "check": "freshness", "value_field": "synced_at", "max_age_hours": 24, "description": "Historial creativo debe estar sincronizado (<24h)"}'::jsonb
WHERE id = 'R-491';

-- R-492: Platform connections health
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "platform_connections", "match_field": "client_id", "match_value_field": "client_id", "check": "all_healthy", "value_field": "status", "expected_value": "active", "description": "Todas las conexiones de plataforma deben estar healthy"}'::jsonb
WHERE id = 'R-492';

-- R-493: Cron jobs ejecutándose
UPDATE criterio_rules SET check_type = 'db_lookup', implemented = true,
  check_config = '{"table": "agent_sessions", "check": "cron_health", "value_field": "last_heartbeat", "max_age_hours": 2, "description": "Cron jobs deben haberse ejecutado en las últimas 2 horas"}'::jsonb
WHERE id = 'R-493';
