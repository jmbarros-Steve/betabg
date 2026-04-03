-- =============================================================
-- El Chino — Sistema de QA autónomo (800 checks cada 30 min)
-- Tablas: chino_routine, chino_reports, steve_fix_queue
-- =============================================================

-- 1. chino_routine — Los checks que El Chino ejecuta
CREATE TABLE IF NOT EXISTS chino_routine (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_number INTEGER UNIQUE NOT NULL,
  description TEXT NOT NULL,
  check_type TEXT NOT NULL CHECK (check_type IN ('api_compare','api_exists','token_health','visual','data_quality','security','performance','functional')),
  platform TEXT NOT NULL CHECK (platform IN ('shopify','meta','klaviyo','stevemail','steve_chat','brief','scraping','infra','security','all')),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical','high','medium','low')),
  check_config JSONB DEFAULT '{}',
  added_by TEXT DEFAULT 'system',
  active BOOLEAN DEFAULT true,
  last_checked_at TIMESTAMPTZ,
  last_result TEXT CHECK (last_result IN ('pass','fail','skip','error')),
  consecutive_fails INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE chino_routine IS 'El Chino QA — definición de cada check (1-800)';

-- 2. chino_reports — Log de cada ejecución
CREATE TABLE IF NOT EXISTS chino_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  check_id UUID NOT NULL REFERENCES chino_routine(id) ON DELETE CASCADE,
  check_number INTEGER NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('pass','fail','skip','error')),
  steve_value TEXT,
  real_value TEXT,
  error_message TEXT,
  screenshot_url TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chino_reports_run_id ON chino_reports(run_id);
CREATE INDEX IF NOT EXISTS idx_chino_reports_result ON chino_reports(result);
CREATE INDEX IF NOT EXISTS idx_chino_reports_created_at ON chino_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chino_reports_check_id ON chino_reports(check_id);

COMMENT ON TABLE chino_reports IS 'El Chino QA — log de resultados por corrida';

-- 3. steve_fix_queue — Cola de fixes automáticos
CREATE TABLE IF NOT EXISTS steve_fix_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id UUID NOT NULL REFERENCES chino_routine(id) ON DELETE CASCADE,
  check_number INTEGER NOT NULL,
  check_result JSONB NOT NULL,
  fix_prompt TEXT NOT NULL,
  probable_cause TEXT,
  files_to_check TEXT[],
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','assigned','fixing','deployed','verifying','fixed','failed','escalated')),
  attempt INTEGER DEFAULT 1,
  agent_response TEXT,
  deploy_timestamp TIMESTAMPTZ,
  retest_result TEXT,
  escalated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_steve_fix_queue_status ON steve_fix_queue(status);
CREATE INDEX IF NOT EXISTS idx_steve_fix_queue_check_id ON steve_fix_queue(check_id);

COMMENT ON TABLE steve_fix_queue IS 'El Chino QA — cola de fixes automáticos para agentes';

-- =============================================================
-- RLS — Acceso solo via service_role (sistema, no merchant)
-- =============================================================

ALTER TABLE chino_routine ENABLE ROW LEVEL SECURITY;
ALTER TABLE chino_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE steve_fix_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chino_routine_service_role" ON chino_routine
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "chino_reports_service_role" ON chino_reports
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "steve_fix_queue_service_role" ON steve_fix_queue
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================================
-- SEED — Primeros 50 checks críticos
-- =============================================================

INSERT INTO chino_routine (check_number, description, check_type, platform, severity, check_config, added_by) VALUES
-- ── Conexiones (1-10) ──────────────────────────────────────────
(1,  'Token Shopify responde 200',                                      'api_compare',   'shopify',     'critical', '{"test_endpoint": "/admin/api/2026-01/shop.json"}', 'system'),
(2,  'Token Meta responde 200',                                         'api_compare',   'meta',        'critical', '{"test_endpoint": "/me?fields=id,name"}', 'system'),
(3,  'Token Klaviyo responde 200',                                      'api_compare',   'klaviyo',     'critical', '{"test_endpoint": "/api/accounts/"}', 'system'),
(4,  'Token Shopify no expirado (< 999 días)',                          'token_health',  'shopify',     'critical', '{"max_age_days": 999}', 'system'),
(5,  'Token Meta no expirado (< 55 días)',                              'token_health',  'meta',        'critical', '{"max_age_days": 55}', 'system'),
(6,  'Todas las platform_connections tienen token válido',              'api_compare',   'all',         'high',     '{}', 'system'),
(7,  'No hay platform_connections duplicadas por merchant+plataforma',  'data_quality',  'all',         'medium',   '{}', 'system'),
(8,  'steve-api responde en < 2 segundos',                             'performance',   'infra',       'high',     '{"url": "https://steve-api-850416724643.us-central1.run.app/health", "max_ms": 2000}', 'system'),
(9,  'steve.cl carga en < 3 segundos',                                 'performance',   'infra',       'high',     '{"url": "https://steve.cl", "max_ms": 3000}', 'system'),
(10, 'Ninguna conexión lleva > 24hrs sin sync exitoso',                 'data_quality',  'all',         'high',     '{"max_hours": 24}', 'system'),

-- ── Shopify métricas (11-20) ───────────────────────────────────
(11, 'Revenue 7d Steve = Revenue 7d Shopify API',                       'api_compare',   'shopify',     'critical', '{"steve_field": "revenue_7d", "shopify_endpoint": "/admin/api/2026-01/orders.json?status=any&created_at_min=7_DAYS_AGO", "tolerance": 0.05}', 'system'),
(12, 'Orders count 7d Steve = Orders count Shopify API',                'api_compare',   'shopify',     'critical', '{"steve_field": "orders_7d", "tolerance": 0}', 'system'),
(13, 'Productos count Steve = Productos count Shopify API',             'api_compare',   'shopify',     'high',     '{"steve_table": "shopify_products", "shopify_endpoint": "/admin/api/2026-01/products/count.json", "tolerance": 0}', 'system'),
(14, 'Colecciones count Steve = Colecciones count Shopify API',         'api_compare',   'shopify',     'high',     '{"steve_table": "shopify_collections", "shopify_endpoint": "/admin/api/2026-01/custom_collections/count.json", "tolerance": 0}', 'system'),
(15, 'No hay productos en Supabase que no existen en Shopify',          'data_quality',  'shopify',     'medium',   '{}', 'system'),
(16, 'No hay productos en Shopify que faltan en Supabase',              'data_quality',  'shopify',     'medium',   '{}', 'system'),
(17, 'Precios de productos Steve = precios Shopify',                    'api_compare',   'shopify',     'medium',   '{"sample_size": 10, "tolerance": 0}', 'system'),
(18, 'Todas las imágenes de productos cargan (no 404)',                 'data_quality',  'shopify',     'low',      '{"sample_size": 10}', 'system'),
(19, 'Revenue de hoy > 0 si merchant normalmente vende',                'data_quality',  'shopify',     'medium',   '{"min_daily_avg": 3}', 'system'),
(20, 'Fecha del order más reciente es de hoy',                          'data_quality',  'shopify',     'high',     '{"max_hours_old": 24}', 'system'),

-- ── Meta Ads (21-30) ───────────────────────────────────────────
(21, 'Spend 7d Steve = Spend 7d Meta API',                              'api_compare',   'meta',        'critical', '{"steve_field": "spend_7d", "meta_endpoint": "/act_{ad_account_id}/insights?date_preset=last_7d&fields=spend", "tolerance": 0.05}', 'system'),
(22, 'ROAS 7d Steve = ROAS 7d Meta API',                                'api_compare',   'meta',        'critical', '{"tolerance": 0.10}', 'system'),
(23, 'Campañas activas count Steve = Meta API',                          'api_compare',   'meta',        'high',     '{"tolerance": 0}', 'system'),
(24, 'Cada campaña activa en Steve está realmente activa en Meta',       'api_compare',   'meta',        'high',     '{}', 'system'),
(25, 'Budget por campaña Steve = Meta API',                              'api_compare',   'meta',        'medium',   '{"tolerance": 0}', 'system'),
(26, 'Reach 7d Steve = Meta API',                                        'api_compare',   'meta',        'high',     '{"tolerance": 0.10}', 'system'),
(27, 'Impressions 7d Steve = Meta API',                                  'api_compare',   'meta',        'high',     '{"tolerance": 0.10}', 'system'),
(28, 'Clicks 7d Steve = Meta API',                                       'api_compare',   'meta',        'high',     '{"tolerance": 0.10}', 'system'),
(29, 'No hay campañas en Meta que no aparecen en Steve',                 'data_quality',  'meta',        'medium',   '{}', 'system'),
(30, 'No hay campañas en Steve que no existen en Meta',                  'data_quality',  'meta',        'medium',   '{}', 'system'),

-- ── Klaviyo (31-40) ────────────────────────────────────────────
(31, 'Open rate Steve = Open rate Klaviyo API',                          'api_compare',   'klaviyo',     'critical', '{"tolerance": 0.02}', 'system'),
(32, 'Click rate Steve = Click rate Klaviyo API',                        'api_compare',   'klaviyo',     'critical', '{"tolerance": 0.02}', 'system'),
(33, 'Emails enviados 7d Steve = Klaviyo API',                           'api_compare',   'klaviyo',     'high',     '{"tolerance": 0}', 'system'),
(34, 'Subscribers count Steve = Klaviyo API',                            'api_compare',   'klaviyo',     'high',     '{"tolerance": 0}', 'system'),
(35, 'Revenue atribuido Steve = Klaviyo API',                            'api_compare',   'klaviyo',     'high',     '{"tolerance": 0.10}', 'system'),
(36, 'Push email test a Klaviyo → existe → borrar',                      'functional',    'klaviyo',     'critical', '{"action": "push_test_email", "verify": "get_campaign", "cleanup": true}', 'system'),
(37, 'No hay campañas en Klaviyo que Steve no muestra',                  'data_quality',  'klaviyo',     'medium',   '{}', 'system'),
(38, 'Bounce rate < 1%',                                                 'data_quality',  'klaviyo',     'medium',   '{"max_bounce": 0.01}', 'system'),
(39, 'Spam rate < 0.1%',                                                 'data_quality',  'klaviyo',     'medium',   '{"max_spam": 0.001}', 'system'),
(40, 'Deliverability: SPF + DKIM verificados',                           'data_quality',  'klaviyo',     'high',     '{}', 'system'),

-- ── Steve Chat + SteveMail + Infra (41-50) ─────────────────────
(41, 'Steve Chat responde a cuánto vendí esta semana',                   'functional',    'steve_chat',  'critical', '{"test_message": "cuánto vendí esta semana", "expect_contains_number": true}', 'system'),
(42, 'Steve Chat responde en < 10 segundos',                             'functional',    'steve_chat',  'high',     '{"max_ms": 10000}', 'system'),
(43, 'Steve Chat responde en español, no inglés',                        'data_quality',  'steve_chat',  'high',     '{}', 'system'),
(44, 'Steve Chat no expone datos de otro merchant',                      'security',      'steve_chat',  'critical', '{"test": "ask_for_other_merchant_data"}', 'system'),
(45, 'Crear template de test → se guarda en email_templates',            'functional',    'stevemail',   'high',     '{"cleanup": true}', 'system'),
(46, 'Email renderizado se ve profesional',                              'visual',        'stevemail',   'medium',   '{"eval_prompt": "¿Este email se ve profesional? ¿Tiene header, contenido, CTA, footer? ¿Algo se ve roto?"}', 'system'),
(47, 'Crear descuento test → existe en Shopify → borrar',               'functional',    'shopify',     'high',     '{"action": "create_discount", "code": "QA_TEST_CHINO", "cleanup": true}', 'system'),
(48, 'Edge Functions sin errores 500 en últimos 30 min',                 'performance',   'infra',       'high',     '{}', 'system'),
(49, 'Brief generado menciona datos reales del merchant',                'data_quality',  'brief',       'medium',   '{}', 'system'),
(50, 'Resultados de scraping tienen datos de 2025-2026',                 'data_quality',  'scraping',    'medium',   '{}', 'system');
