-- P1-5: Benchmarks de industria a tabla (en vez de hardcoded en React).
--
-- Contexto: EmailAnalytics.tsx:91-96 tenía los benchmarks como constantes.
-- Cualquier ajuste requería rebuildear frontend. Con esta tabla se editan vía UPDATE.
--
-- Como clients.industry NO existe en esta DB, usamos una fila 'default' que
-- aplica a todos los clientes. Si se agrega clients.industry en el futuro,
-- solo hay que insertar más filas y el frontend ya las lee.
--
-- Autor: Valentina W1 — 2026-04-08

CREATE TABLE IF NOT EXISTS email_industry_benchmarks (
  industry          TEXT PRIMARY KEY,
  open_rate         NUMERIC(5,2) NOT NULL,
  click_rate        NUMERIC(5,2) NOT NULL,
  bounce_rate       NUMERIC(5,2) NOT NULL,
  unsubscribe_rate  NUMERIC(5,2) NOT NULL,
  source            TEXT,
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- Seed inicial: los mismos valores que estaban hardcoded en el frontend,
-- más algunas industrias adicionales para cuando se agregue clients.industry.
INSERT INTO email_industry_benchmarks (industry, open_rate, click_rate, bounce_rate, unsubscribe_rate, source) VALUES
  ('default',   20.0, 2.5, 0.4, 0.2, 'Promedio general ecommerce 2025'),
  ('ecommerce', 18.5, 2.1, 0.4, 0.2, 'Shopify benchmarks 2025'),
  ('saas',      21.3, 2.8, 0.3, 0.15, 'SaaS benchmarks 2025'),
  ('b2b',       15.1, 3.2, 0.5, 0.18, 'B2B benchmarks 2025'),
  ('retail',    19.2, 2.3, 0.4, 0.2, 'Retail benchmarks 2025'),
  ('services',  22.1, 2.9, 0.35, 0.17, 'Professional services 2025')
ON CONFLICT (industry) DO NOTHING;

-- RLS: lectura pública (es referencia), escritura solo service_role.
ALTER TABLE email_industry_benchmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "benchmarks_public_read" ON email_industry_benchmarks;
CREATE POLICY "benchmarks_public_read" ON email_industry_benchmarks
  FOR SELECT USING (true);

COMMENT ON TABLE email_industry_benchmarks IS
  'Benchmarks por industria para EmailAnalytics. Se lee con fallback a industry=default.';
