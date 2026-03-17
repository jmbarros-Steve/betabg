-- Error Budgets: SLO config for 4 Critical User Journeys (CUJs)
CREATE TABLE IF NOT EXISTS slo_config (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  slo_target DECIMAL NOT NULL,           -- 0.995 = 99.5%
  window_days INTEGER DEFAULT 30,
  current_success_rate DECIMAL,          -- e.g. 99.2
  error_budget_remaining DECIMAL,        -- percentage 0-100
  status TEXT DEFAULT 'healthy',         -- healthy | warning | critical | frozen
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO slo_config (id, name, description, slo_target, window_days, status) VALUES
  ('CUJ-1', 'Login → Dashboard',    'Merchant entra y ve ventas reales',    0.995, 30, 'healthy'),
  ('CUJ-2', 'Steve responde',       'Steve da respuesta correcta en <30s',  0.95,  30, 'healthy'),
  ('CUJ-3', 'Crear campaña Meta',   'Campaña llega a Meta como PAUSED',     0.90,  30, 'healthy'),
  ('CUJ-4', 'Crear email',          'Email llega a Klaviyo como draft',     0.90,  30, 'healthy')
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_slo_config_status ON slo_config(status);

ALTER TABLE slo_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access slo_config"
  ON slo_config FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Authenticated read slo_config"
  ON slo_config FOR SELECT
  USING (auth.role() = 'authenticated');
