-- Feature flag para activar el envío vía email_send_queue en lugar del path directo.
-- Default false: mantiene el comportamiento actual (envío directo por loop).
-- Se activa por cliente para rollout gradual.
--
-- Autor: Valentina W1 (Steve Mail) — 2026-04-08
-- Contexto: email_send_queue estaba huérfano (0 filas, nadie escribía).
-- manage-campaigns.ts y flow-engine.ts usaban sendSingleEmail directo.
-- Este flag permite ramificar hacia la cola (rate limit, retry, smart send, crash-recovery).

ALTER TABLE email_send_settings
  ADD COLUMN IF NOT EXISTS use_send_queue BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN email_send_settings.use_send_queue IS
  'Cuando true, manage-campaigns y flow-engine encolan en email_send_queue en lugar de enviar directo. Rollout gradual por cliente.';
