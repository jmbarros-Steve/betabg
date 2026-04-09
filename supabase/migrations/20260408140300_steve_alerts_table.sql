-- P2-8: Tabla de alertas (requisito del trigger de bounce spike).
--
-- Contexto: no existía ninguna tabla central de alertas. steve_fix_queue es para
-- QA/El Chino, steve_bugs es para bugs reportados. Esta es para eventos operacionales
-- (bounce spikes, caídas de sync, stuck queue items).
--
-- Cualquier servicio puede insertar y el admin las consume vía CEREBRO o Slack.
--
-- Autor: Valentina W1 — 2026-04-08

CREATE TABLE IF NOT EXISTS steve_alerts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID REFERENCES clients(id) ON DELETE CASCADE,
  severity     TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  source       TEXT NOT NULL,
  message      TEXT NOT NULL,
  payload      JSONB,
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_steve_alerts_unack
  ON steve_alerts(created_at DESC)
  WHERE acknowledged = false;

CREATE INDEX IF NOT EXISTS idx_steve_alerts_client
  ON steve_alerts(client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_steve_alerts_severity
  ON steve_alerts(severity, created_at DESC)
  WHERE acknowledged = false;

-- RLS: admin ve todo, cliente ve solo lo suyo.
ALTER TABLE steve_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alerts_client_access" ON steve_alerts;
CREATE POLICY "alerts_client_access" ON steve_alerts
  FOR SELECT USING (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "alerts_admin_ack" ON steve_alerts;
CREATE POLICY "alerts_admin_ack" ON steve_alerts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

COMMENT ON TABLE steve_alerts IS
  'Alertas operacionales (bounce spikes, sync failures, stuck queues). Se insertan desde triggers o código backend.';
