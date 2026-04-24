-- Decisión de producto (JM, 2026-04-24): TODAS las campañas se envían por cola,
-- siempre. El feature flag use_send_queue era sobreingeniería — fue agregado
-- como seguro defensivo para clientes legacy que no existían. manage-campaigns.ts
-- ya no lo lee.
--
-- Esta migración:
--   1. Recrea el trigger de auto-creación de email_send_settings SIN el flag.
--   2. Elimina la columna use_send_queue de email_send_settings.
--
-- El trigger trg_create_email_send_settings y el backfill de la migración
-- 20260408140000 quedan intactos en espíritu (siguen auto-creando settings con
-- rate_limit_per_hour=500 y smart_send_enabled=true), solo sin la columna muerta.
--
-- Autor: Valentina W1 — 2026-04-24

-- 1. Reemplazar función del trigger sin use_send_queue.
CREATE OR REPLACE FUNCTION create_default_email_send_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO email_send_settings (client_id, rate_limit_per_hour, smart_send_enabled)
  VALUES (NEW.id, 500, true)
  ON CONFLICT (client_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION create_default_email_send_settings() IS
  'Auto-crea email_send_settings al insertar un cliente. Todas las campañas pasan por cola.';

-- 2. DROP columna use_send_queue (ya nadie la lee).
ALTER TABLE email_send_settings
  DROP COLUMN IF EXISTS use_send_queue;
