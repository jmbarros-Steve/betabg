-- ============================================================
-- Fix wa_case_studies: Replace fake case studies with honest ones
-- based on real Jardin de Eva data (anonimized) + real capabilities
-- ============================================================

-- 1. Delete all existing fake case studies
DELETE FROM wa_case_studies;

-- 2. Insert honest case studies based on real data

-- Case 1: Anonimized Jardin de Eva (real client, cosmética natural)
INSERT INTO wa_case_studies (
  industry, title, summary, industry_keywords, metrics, media_url, active
) VALUES (
  'cosmetica',
  'Marca de cosmética natural centraliza su marketing',
  'Una marca de cosmética natural con tienda Shopify conectó todas sus plataformas en Steve: Meta Ads, Shopify Analytics, email marketing y WhatsApp. Ahora ven todas sus métricas en un solo dashboard, generan copies para ads con IA y tienen flujos de email automatizados para carrito abandonado y bienvenida. Antes usaban 4 herramientas separadas y no tenían visibilidad cruzada de datos.',
  ARRAY['cosmética', 'cosmetica', 'skincare', 'belleza', 'crema', 'natural', 'beauty', 'cuidado', 'piel'],
  '{"highlight": "Centralización de 4 plataformas en 1 dashboard"}',
  NULL,
  true
);

-- Case 2: Moda / Ropa (capabilities-based, no fake metrics)
INSERT INTO wa_case_studies (
  industry, title, summary, industry_keywords, metrics, media_url, active
) VALUES (
  'moda',
  'Cómo Steve ayuda a marcas de moda',
  'Marcas de ropa y moda usan Steve para centralizar Shopify + Meta Ads + email en un solo lugar. Steve genera copies de anuncios adaptados a temporada, analiza qué productos tienen mejor margen para ads, y automatiza emails de carrito abandonado. El CPA promedio en moda para Meta Ads en LATAM es $2.500-$5.000 dependiendo del ticket.',
  ARRAY['ropa', 'moda', 'fashion', 'vestido', 'zapato', 'zapatilla', 'polera', 'jeans', 'accesorios', 'textil'],
  '{"highlight": "CPA referencia industria: $2.500-$5.000 CLP"}',
  NULL,
  true
);

-- Case 3: Alimentos / Food (capabilities-based)
INSERT INTO wa_case_studies (
  industry, title, summary, industry_keywords, metrics, media_url, active
) VALUES (
  'alimentos',
  'Cómo Steve ayuda a marcas de alimentos',
  'Marcas de alimentos y snacks usan Steve para manejar campañas de Meta Ads con audiencias geográficas, monitorear ventas por producto en Shopify y automatizar comunicación por WhatsApp y email. Steve analiza qué productos son best-sellers y sugiere copies y creativos orientados a esos productos.',
  ARRAY['alimento', 'comida', 'snack', 'chocolate', 'café', 'cafe', 'mate', 'bebida', 'gourmet', 'food', 'organic'],
  '{"highlight": "Foco en best-sellers y audiencias geográficas"}',
  NULL,
  true
);

-- Case 4: Suplementos / Wellness (capabilities-based)
INSERT INTO wa_case_studies (
  industry, title, summary, industry_keywords, metrics, media_url, active
) VALUES (
  'wellness',
  'Cómo Steve ayuda a marcas de wellness',
  'Marcas de suplementos y wellness usan Steve para automatizar flujos de recompra por email (los suplementos se acaban cada 30-60 días), generar copies que destacan beneficios sin hacer claims médicos, y crear audiencias lookalike de compradores recurrentes en Meta. Steve también audita la tienda para mejorar la tasa de conversión.',
  ARRAY['suplemento', 'vitamina', 'proteína', 'proteina', 'wellness', 'salud', 'fitness', 'deporte', 'gym'],
  '{"highlight": "Flujos de recompra automatizados cada 30-60 días"}',
  NULL,
  true
);

-- Case 5: General e-commerce (fallback)
INSERT INTO wa_case_studies (
  industry, title, summary, industry_keywords, metrics, media_url, active
) VALUES (
  'ecommerce',
  'Steve para e-commerce general',
  'Steve centraliza todas las herramientas de marketing en una sola plataforma: Shopify Analytics, Meta Ads, Google Ads, email marketing y WhatsApp. Genera copies con IA, automatiza emails de carrito abandonado, analiza competencia y entrega reportes semanales. Todo desde un solo dashboard o por WhatsApp.',
  ARRAY['tienda', 'ecommerce', 'e-commerce', 'online', 'venta', 'producto', 'dropshipping', 'marketplace'],
  '{"highlight": "Todo centralizado en 1 plataforma"}',
  NULL,
  true
);
