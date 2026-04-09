-- P0-1: Activar cola de envío para todos los clientes existentes + default true.
--
-- Contexto: el cron email-queue-tick-1m existe y funciona, pero email_send_settings
-- estaba vacía (0 filas) y use_send_queue tenía default=false. Resultado: toda la
-- lógica de retry/smart send time/crash recovery estaba muerta porque nadie la usaba.
--
-- Este migration:
--   1. Inserta settings para TODOS los clientes existentes con use_send_queue=true
--   2. Cambia el default de la columna a true
--   3. Crea trigger para auto-crear settings cuando nace un cliente nuevo
--
-- Autor: Valentina W1 — 2026-04-08

-- 1. Backfill: activar cola para todos los clientes existentes que no tengan settings.
INSERT INTO email_send_settings (client_id, use_send_queue, rate_limit_per_hour, smart_send_enabled)
SELECT id, true, 500, true
FROM clients
WHERE NOT EXISTS (
  SELECT 1 FROM email_send_settings WHERE email_send_settings.client_id = clients.id
);

-- 2. Cambiar default a true (aplica a clientes futuros que usen insert parcial).
ALTER TABLE email_send_settings
  ALTER COLUMN use_send_queue SET DEFAULT true;

-- 3. Trigger: auto-crear settings cuando se crea un cliente.
CREATE OR REPLACE FUNCTION create_default_email_send_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO email_send_settings (client_id, use_send_queue, rate_limit_per_hour, smart_send_enabled)
  VALUES (NEW.id, true, 500, true)
  ON CONFLICT (client_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_create_email_send_settings ON clients;
CREATE TRIGGER trg_create_email_send_settings
  AFTER INSERT ON clients
  FOR EACH ROW
  EXECUTE FUNCTION create_default_email_send_settings();

COMMENT ON FUNCTION create_default_email_send_settings() IS
  'Auto-crea email_send_settings con use_send_queue=true al insertar un cliente.';
