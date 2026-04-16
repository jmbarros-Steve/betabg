-- Migration: Add CRITERIO rules for GOOGLE ADS, SHOPIFY PRODUCT, and SOCIAL categories
-- These rules are used by AI generators to produce higher-quality content

-- =============================================
-- GOOGLE ADS — Rules R-500 to R-514
-- =============================================

INSERT INTO criterio_rules (id, category, name, check_rule, severity, weight, auto, organ, active, check_type, check_config) VALUES
('R-500', 'GOOGLE ADS', 'Headline max 30 chars', 'Cada headline debe tener máximo 30 caracteres', 'BLOQUEAR', 3, true, 'CRITERIO', true, 'length', '{"field": "headline", "max": 30}'::jsonb),
('R-501', 'GOOGLE ADS', 'Headline min 15 chars', 'Cada headline debe tener al menos 15 caracteres para ser efectivo', 'Rechazar', 2, true, 'CRITERIO', true, 'length', '{"field": "headline", "min": 15}'::jsonb),
('R-502', 'GOOGLE ADS', 'Description max 90 chars', 'Cada descripción debe tener máximo 90 caracteres', 'BLOQUEAR', 3, true, 'CRITERIO', true, 'length', '{"field": "description", "max": 90}'::jsonb),
('R-503', 'GOOGLE ADS', 'Description min 40 chars', 'Cada descripción debe tener al menos 40 caracteres', 'Rechazar', 2, true, 'CRITERIO', true, 'length', '{"field": "description", "min": 40}'::jsonb),
('R-504', 'GOOGLE ADS', 'No exclamación en headline', 'Los headlines de Google Ads NO permiten signos de exclamación (!)', 'BLOQUEAR', 3, true, 'CRITERIO', true, 'regex', '{"field": "headline", "pattern": "!", "flags": "", "should_match": false}'::jsonb),
('R-505', 'GOOGLE ADS', 'No CAPS excesivas', 'No usar más de 30% de caracteres en mayúsculas (excepto siglas)', 'Rechazar', 2, true, 'CRITERIO', true, 'regex', '{"field": "headline", "pattern": "[A-ZÁÉÍÓÚÑ]", "flags": "g", "max_pct": 30}'::jsonb),
('R-506', 'GOOGLE ADS', 'No promesas irreales', 'Prohibido usar "gratis", "100% garantizado", "sin riesgo", "resultados inmediatos" sin sustento', 'Rechazar', 2, true, 'CRITERIO', true, 'forbidden', '{"field": "headline", "words": ["gratis", "100% garantizado", "sin riesgo", "resultados inmediatos", "resultados garantizados"]}'::jsonb),
('R-507', 'GOOGLE ADS', 'CTA en descripción', 'Cada descripción debe incluir un llamado a acción claro', 'Advertencia', 1, true, 'CRITERIO', true, 'ai', '{"field": "description", "prompt": "¿La descripción incluye un CTA claro?", "threshold": 0.7}'::jsonb),
('R-508', 'GOOGLE ADS', 'No teléfono en copy', 'No incluir números de teléfono en headlines ni descriptions (usar extensiones)', 'Rechazar', 2, true, 'CRITERIO', true, 'regex', '{"field": "headline", "pattern": "\\+?\\d[\\d\\s-]{7,}", "flags": "", "should_match": false}'::jsonb),
('R-509', 'GOOGLE ADS', 'No URL en copy', 'No incluir URLs en el texto del anuncio (usar extensión de enlace)', 'Rechazar', 2, true, 'CRITERIO', true, 'regex', '{"field": "description", "pattern": "https?://|www\\.", "flags": "i", "should_match": false}'::jsonb),
('R-510', 'GOOGLE ADS', 'No precio falso', 'Si se menciona un precio debe ser verificable y real', 'BLOQUEAR', 3, true, 'CRITERIO', true, 'ai', '{"field": "description", "prompt": "¿Se menciona un precio que podría ser inventado o no verificable?", "threshold": 0.7}'::jsonb),
('R-511', 'GOOGLE ADS', 'No marca competidor', 'Prohibido usar nombres de marcas competidoras en headlines o descriptions', 'BLOQUEAR', 3, true, 'CRITERIO', true, 'forbidden', '{"field": "headline", "words": [], "source": "brand_research.competitors"}'::jsonb),
('R-512', 'GOOGLE ADS', 'No headlines repetidos', 'No repetir el mismo headline entre las variantes generadas', 'Rechazar', 2, true, 'CRITERIO', true, 'comparison', '{"field_a": "headline", "field_b": "_other_headlines", "operator": "different"}'::jsonb),
('R-513', 'GOOGLE ADS', 'Incluir keyword principal', 'Al menos 3 headlines deben incluir la keyword principal o variante cercana', 'Advertencia', 1, true, 'CRITERIO', true, 'ai', '{"field": "headlines", "prompt": "¿Al menos 3 headlines contienen la keyword principal?", "threshold": 0.7}'::jsonb),
('R-514', 'GOOGLE ADS', 'Coherencia con landing page', 'El mensaje del anuncio debe ser coherente con lo que el usuario encontrará en la landing', 'Advertencia', 1, true, 'CRITERIO', true, 'ai', '{"field": "description", "prompt": "¿El copy es coherente con una landing page real?", "threshold": 0.7}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- SHOPIFY PRODUCT — Rules R-520 to R-529
-- =============================================

INSERT INTO criterio_rules (id, category, name, check_rule, severity, weight, auto, organ, active, check_type, check_config) VALUES
('R-520', 'SHOPIFY PRODUCT', 'Descripción min 100 chars', 'La descripción del producto debe tener al menos 100 caracteres', 'Rechazar', 2, true, 'CRITERIO', true, 'length', '{"field": "description", "min": 100}'::jsonb),
('R-521', 'SHOPIFY PRODUCT', 'Descripción max 2000 chars', 'La descripción no debe exceder 2000 caracteres para mantener legibilidad', 'Advertencia', 1, true, 'CRITERIO', true, 'length', '{"field": "description", "max": 2000}'::jsonb),
('R-522', 'SHOPIFY PRODUCT', 'Incluir nombre producto', 'La descripción debe mencionar el nombre del producto al menos una vez', 'Rechazar', 2, true, 'CRITERIO', true, 'required', '{"field": "description", "source": "product_title"}'::jsonb),
('R-523', 'SHOPIFY PRODUCT', 'Sin HTML roto', 'El HTML generado debe ser válido (tags cerrados, sin errores de sintaxis)', 'BLOQUEAR', 3, true, 'CRITERIO', true, 'regex', '{"field": "description", "pattern": "<[^>]*$|<\\/[^>]*<", "flags": "", "should_match": false}'::jsonb),
('R-524', 'SHOPIFY PRODUCT', 'SEO keyword incluida', 'La descripción debe incluir la keyword principal del producto para SEO', 'Advertencia', 1, true, 'CRITERIO', true, 'ai', '{"field": "description", "prompt": "¿La descripción incluye keywords relevantes para SEO?", "threshold": 0.7}'::jsonb),
('R-525', 'SHOPIFY PRODUCT', 'Beneficios no solo features', 'La descripción debe incluir beneficios para el cliente, no solo características técnicas', 'Advertencia', 1, true, 'CRITERIO', true, 'ai', '{"field": "description", "prompt": "¿La descripción menciona beneficios para el cliente además de características?", "threshold": 0.7}'::jsonb),
('R-526', 'SHOPIFY PRODUCT', 'Sin precios hardcodeados', 'No incluir precios hardcodeados — usar Shopify Liquid o dejarlo fuera', 'Rechazar', 2, true, 'CRITERIO', true, 'regex', '{"field": "description", "pattern": "\\$\\s*[\\d.,]+", "flags": "", "should_match": false}'::jsonb),
('R-527', 'SHOPIFY PRODUCT', 'Tono coherente con marca', 'El tono de la descripción debe ser coherente con la voz de marca definida en el brief', 'Advertencia', 1, true, 'CRITERIO', true, 'ai', '{"field": "description", "prompt": "¿El tono es coherente con una marca profesional de e-commerce?", "threshold": 0.7}'::jsonb),
('R-528', 'SHOPIFY PRODUCT', 'Incluir CTA', 'La descripción debe incluir un llamado a acción (comprar, agregar al carrito, descubrir más)', 'Advertencia', 1, true, 'CRITERIO', true, 'ai', '{"field": "description", "prompt": "¿La descripción incluye algún llamado a acción?", "threshold": 0.7}'::jsonb),
('R-529', 'SHOPIFY PRODUCT', 'No repetir título en body', 'No repetir textualmente el título del producto como primera línea de la descripción', 'Advertencia', 1, true, 'CRITERIO', true, 'comparison', '{"field_a": "description_first_line", "field_b": "title", "operator": "different"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- SOCIAL — Rules R-540 to R-544 (post-generation moderation)
-- =============================================

INSERT INTO criterio_rules (id, category, name, check_rule, severity, weight, auto, organ, active, check_type, check_config) VALUES
('R-540', 'SOCIAL', 'No contenido ofensivo', 'Prohibido contenido discriminatorio, racista, sexista o que incite al odio', 'BLOQUEAR', 3, true, 'CRITERIO', true, 'forbidden', '{"field": "content", "words": ["negro de mierda", "judío", "nazi", "terrorista", "marica", "suicidio", "mátense", "violación"]}'::jsonb),
('R-541', 'SOCIAL', 'No info médica sin disclaimer', 'Prohibido dar consejos médicos o financieros sin aclarar que no es asesoría profesional', 'Rechazar', 2, true, 'CRITERIO', true, 'forbidden', '{"field": "content", "words": ["toma este medicamento", "invierte todo en", "compra acciones de", "cura para", "remedio para"]}'::jsonb),
('R-542', 'SOCIAL', 'No spam links', 'No incluir más de 1 link externo por post', 'Rechazar', 2, true, 'CRITERIO', true, 'regex', '{"field": "content", "pattern": "(https?://[^\\s]+.*){2,}", "flags": "", "should_match": false}'::jsonb),
('R-543', 'SOCIAL', 'Coherencia con agente', 'El post debe ser coherente con la identidad y área de expertise del agente', 'Advertencia', 1, true, 'CRITERIO', true, 'ai', '{"field": "content", "prompt": "¿El post es coherente con un agente de marketing?", "threshold": 0.6}'::jsonb),
('R-544', 'SOCIAL', 'No revelar que es IA', 'El agente no debe revelar explícitamente que es una IA o un bot', 'Rechazar', 2, true, 'CRITERIO', true, 'forbidden', '{"field": "content", "words": ["soy una IA", "soy un bot", "soy inteligencia artificial", "como IA que soy", "mi programación", "fui programado"]}'::jsonb)
ON CONFLICT (id) DO NOTHING;
