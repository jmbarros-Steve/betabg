-- ============================================================
-- Steve Sales: BANT fields + Case Studies + Sales Assets bucket
-- ============================================================

-- 1. Add BANT & UTM fields to wa_prospects
ALTER TABLE wa_prospects
  ADD COLUMN IF NOT EXISTS budget_range TEXT,
  ADD COLUMN IF NOT EXISTS decision_timeline TEXT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT;

-- 2. Case studies table (sales collateral with media)
CREATE TABLE IF NOT EXISTS wa_case_studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  industry TEXT NOT NULL,
  industry_keywords TEXT[] NOT NULL DEFAULT '{}',
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  metrics JSONB DEFAULT '{}',
  media_url TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for keyword overlap queries
CREATE INDEX IF NOT EXISTS idx_wa_case_studies_keywords
  ON wa_case_studies USING GIN (industry_keywords);

CREATE INDEX IF NOT EXISTS idx_wa_case_studies_active
  ON wa_case_studies (active) WHERE active = true;

-- 3. Storage bucket for sales assets (images, videos, PDFs)
INSERT INTO storage.buckets (id, name, public)
VALUES ('sales-assets', 'sales-assets', true)
ON CONFLICT (id) DO NOTHING;

-- 4. RLS policies
ALTER TABLE wa_case_studies ENABLE ROW LEVEL SECURITY;

-- Public read for case studies
CREATE POLICY "wa_case_studies_public_read"
  ON wa_case_studies FOR SELECT
  USING (true);

-- Service role write for case studies
CREATE POLICY "wa_case_studies_service_write"
  ON wa_case_studies FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Storage: public read for sales-assets
CREATE POLICY "sales_assets_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'sales-assets');

-- Storage: service role write for sales-assets
CREATE POLICY "sales_assets_service_write"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'sales-assets' AND auth.role() = 'service_role');

-- 5. Seed some initial case studies
INSERT INTO wa_case_studies (industry, industry_keywords, title, summary, metrics, media_url) VALUES
(
  'Moda / Ropa',
  ARRAY['ropa', 'moda', 'vestimenta', 'zapatillas', 'calzado', 'accesorios', 'joyería', 'fashion'],
  'Tienda de ropa femenina +180% ROAS en 60 días',
  'Una marca de ropa femenina pasó de ROAS 1.2x a 3.4x en 2 meses con Steve. Automatizamos sus campañas de Meta, segmentamos por buyer persona y optimizamos creativos con AI.',
  '{"roas_before": 1.2, "roas_after": 3.4, "revenue_increase_pct": 180, "time_days": 60}',
  NULL
),
(
  'Alimentos / Gourmet',
  ARRAY['alimentos', 'comida', 'gourmet', 'café', 'vino', 'chocolates', 'snacks', 'bebidas', 'foodie'],
  'Marca gourmet: de $500K a $2.5M mensuales',
  'Una marca de productos gourmet multiplicó x5 sus ventas en 3 meses. Conectamos Shopify + Meta + Klaviyo y creamos flujos automáticos de email que recuperan 22% de carritos abandonados.',
  '{"revenue_before": 500000, "revenue_after": 2500000, "cart_recovery_pct": 22, "time_months": 3}',
  NULL
),
(
  'Belleza / Cosmética',
  ARRAY['belleza', 'cosmética', 'maquillaje', 'skincare', 'cuidado personal', 'cremas', 'perfumes'],
  'Marca de skincare: CPA bajó 45% con creativos AI',
  'Usando generación de creativos con AI y testing automático A/B, bajamos el CPA de una marca de skincare de $8.500 a $4.700 en solo 4 semanas.',
  '{"cpa_before": 8500, "cpa_after": 4700, "cpa_reduction_pct": 45, "time_weeks": 4}',
  NULL
),
(
  'Deportes / Fitness',
  ARRAY['deporte', 'fitness', 'gym', 'running', 'yoga', 'suplementos', 'outdoor', 'bicicleta'],
  'E-commerce deportivo: 3x conversiones con Steve',
  'Un e-commerce de artículos deportivos triplicó sus conversiones con campañas automatizadas y email flows personalizados por categoría de producto.',
  '{"conversions_multiplier": 3, "email_revenue_pct": 35, "time_months": 2}',
  NULL
),
(
  'Hogar / Decoración',
  ARRAY['hogar', 'decoración', 'muebles', 'jardín', 'iluminación', 'cocina', 'deco'],
  'Tienda de decoración: +$3M en ventas atribuidas a email',
  'Implementamos flujos de email automatizados (bienvenida, carrito abandonado, post-compra) que generaron $3M adicionales en 90 días.',
  '{"email_attributed_revenue": 3000000, "flows_created": 5, "time_days": 90}',
  NULL
);
