-- P0-3: Agregar timezone al subscriber para quiet hours correctas.
--
-- Contexto: flow-engine.ts usa UTC para chequear quiet hours (L76-93).
-- Un subscriber chileno con quiet hours 22-08 recibe emails a las 19h local.
-- Esta columna permite calcular la hora local del subscriber antes de comparar.
--
-- Default 'America/Santiago' porque es donde están la mayoría de los clientes.
-- Los timezones de subscribers nuevos pueden venir de:
--   - Shopify customer address country
--   - Geolocalización IP al suscribirse
--   - Default del cliente
--
-- Autor: Valentina W1 — 2026-04-08

ALTER TABLE email_subscribers
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Santiago';

COMMENT ON COLUMN email_subscribers.timezone IS
  'IANA timezone name (ej. America/Santiago, America/Mexico_City). Usado por flow-engine para quiet hours locales.';

-- Index opcional: si más adelante se quieren consultas agrupadas por timezone.
CREATE INDEX IF NOT EXISTS idx_email_subscribers_timezone
  ON email_subscribers(timezone)
  WHERE status = 'subscribed';
