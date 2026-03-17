-- Backlog: permanent queue of continuous improvement items
-- When no pending tasks exist and agents are idle, the prioritizer
-- promotes the highest-priority backlog item into a task.
CREATE TABLE IF NOT EXISTS backlog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'media',          -- critica | alta | media | baja
  type TEXT NOT NULL DEFAULT 'mejora',             -- mejora | feature | refactor | test | docs
  assigned_squad TEXT,                              -- marketing | producto | infra
  assigned_agent TEXT,                              -- W0-klaviyo, W7-brief, etc.
  source TEXT DEFAULT 'manual',                     -- manual | cerebro | rca | postmortem
  tags TEXT[] DEFAULT '{}',                         -- for filtering: ['meta', 'email', 'ui']
  promoted_to_task_id UUID,                         -- set when promoted to tasks table
  status TEXT NOT NULL DEFAULT 'queued',            -- queued | promoted | dismissed
  created_at TIMESTAMPTZ DEFAULT now(),
  promoted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_backlog_status ON backlog(status);
CREATE INDEX IF NOT EXISTS idx_backlog_priority ON backlog(priority);

ALTER TABLE backlog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access backlog"
  ON backlog FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Authenticated read backlog"
  ON backlog FOR SELECT
  USING (auth.role() = 'authenticated');

-- Seed with initial improvement items
INSERT INTO backlog (title, description, priority, type, assigned_squad, source, tags) VALUES
  ('Optimizar queries de dashboard: lazy load métricas', 'Las queries de métricas cargan todo al abrir dashboard. Implementar lazy load por sección visible.', 'media', 'mejora', 'producto', 'manual', '{"frontend","performance"}'),
  ('Agregar retry con backoff en llamadas a Meta API', 'Las llamadas a Meta API fallan silenciosamente en rate limit. Agregar exponential backoff.', 'alta', 'mejora', 'infra', 'manual', '{"meta","reliability"}'),
  ('Tests E2E para flujo de email completo', 'Falta test end-to-end que cubra: crear email → preview → send test → verificar entrega.', 'media', 'test', 'infra', 'manual', '{"email","testing"}'),
  ('Cache de productos Shopify en frontend', 'ProductPicker hace fetch cada vez que se abre. Cachear en React Query con staleTime 5min.', 'baja', 'mejora', 'producto', 'manual', '{"shopify","performance"}'),
  ('Mejorar prompts de Steve para respuestas más cortas', 'Steve a veces da respuestas de 500+ palabras cuando el merchant pregunta algo simple. Ajustar system prompt.', 'media', 'mejora', 'producto', 'manual', '{"steve-ai","ux"}'),
  ('Dashboard mobile: ajustar KPI cards a 1 columna', 'En móvil las KPI cards se ven apretadas en 2 columnas. Cambiar a 1 columna bajo 640px.', 'baja', 'mejora', 'producto', 'manual', '{"frontend","mobile"}'),
  ('Agregar rate limiter a endpoints públicos', 'Los endpoints públicos (signup forms, tracking) no tienen rate limit. Agregar middleware.', 'alta', 'seguridad', 'infra', 'manual', '{"security","api"}'),
  ('Limpiar creative_history sin métricas después de 90 días', 'creative_history crece sin límite. Agregar cleanup cron para entries > 90 días sin measured_at.', 'baja', 'mejora', 'infra', 'manual', '{"database","maintenance"}')
ON CONFLICT DO NOTHING;
