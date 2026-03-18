-- ============================================================
-- CRITERIO: Sistema de 493 reglas de calidad
-- ============================================================

-- Tabla de reglas
CREATE TABLE IF NOT EXISTS criterio_rules (
  id TEXT PRIMARY KEY,                   -- "R-001"
  category TEXT NOT NULL,                -- "META COPY"
  name TEXT NOT NULL,                    -- "Largo copy primario"
  check_rule TEXT NOT NULL,              -- "primary_text.length entre 80-300"
  pass_example TEXT,
  fail_example TEXT,
  on_fail TEXT NOT NULL,                 -- "Rechazar. 'Copy tiene X chars'"
  severity TEXT NOT NULL,                -- "Rechazar" | "Advertencia" | "BLOQUEAR" | "ALERTA"
  weight INTEGER DEFAULT 1,             -- 1-3
  auto BOOLEAN DEFAULT true,
  organ TEXT NOT NULL,                   -- "CRITERIO" | "OJOS" | "JUEZ" | "ESPEJO" | "CEREBRO" | "OIDOS"
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_criterio_organ ON criterio_rules(organ) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_criterio_category ON criterio_rules(category) WHERE active = true;

ALTER TABLE criterio_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agentes pueden leer reglas" ON criterio_rules;
CREATE POLICY "Agentes pueden leer reglas" ON criterio_rules FOR SELECT USING (true);

DROP POLICY IF EXISTS "Solo admin puede editar" ON criterio_rules;
CREATE POLICY "Solo admin puede editar" ON criterio_rules FOR ALL USING (auth.role() = 'service_role');

-- Tabla de resultados
CREATE TABLE IF NOT EXISTS criterio_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_id TEXT REFERENCES criterio_rules(id),
  shop_id UUID REFERENCES clients(id),
  entity_type TEXT NOT NULL,            -- "meta_campaign" | "email" | "steve_response" | "product"
  entity_id TEXT,
  passed BOOLEAN NOT NULL,
  actual_value TEXT,
  expected_value TEXT,
  details TEXT,
  evaluated_at TIMESTAMPTZ DEFAULT now(),
  evaluated_by TEXT                     -- "ojos" | "criterio" | "juez" | "espejo"
);

CREATE INDEX IF NOT EXISTS idx_results_shop ON criterio_results(shop_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_results_failed ON criterio_results(passed) WHERE passed = false;

ALTER TABLE criterio_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shop access criterio_results" ON criterio_results;
CREATE POLICY "Shop access criterio_results" ON criterio_results 
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role full access criterio_results" ON criterio_results;
CREATE POLICY "Service role full access criterio_results" ON criterio_results 
  FOR ALL USING (auth.role() = 'service_role');
