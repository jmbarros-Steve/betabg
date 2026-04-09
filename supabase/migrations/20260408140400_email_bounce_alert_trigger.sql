-- P2-8: Trigger que detecta bounce/complaint spikes y crea steve_alerts.
--
-- Contexto: cuando Resend nos manda bounces masivos (lista contaminada, dominio
-- quemado, envío a dirección corporativa bloqueada), nadie se enteraba hasta que
-- el cliente revisaba analytics. Este trigger chequea en cada nuevo email_event
-- si hay un spike y alerta inmediatamente.
--
-- Reglas del disparo:
--   - bounce_rate en última hora > 5%
--   - mínimo 20 envíos en esa ventana (para evitar falsos positivos con volumen bajo)
--   - no crear duplicados: si ya hay una alerta no-acknowledged en la última hora
--     para el mismo client_id + source, skip
--
-- Autor: Valentina W1 — 2026-04-08

CREATE OR REPLACE FUNCTION alert_on_bounce_spike()
RETURNS TRIGGER AS $$
DECLARE
  recent_bounces INT;
  recent_total   INT;
  bounce_rate    NUMERIC;
  already_alerted BOOLEAN;
BEGIN
  -- Solo nos interesan eventos de bounce/complaint.
  IF NEW.event_type NOT IN ('bounced', 'complained') THEN
    RETURN NEW;
  END IF;

  -- No podemos alertar si no sabemos el client_id.
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Contar bounces en última hora.
  SELECT COUNT(*) INTO recent_bounces
  FROM email_events
  WHERE client_id = NEW.client_id
    AND event_type IN ('bounced', 'complained')
    AND created_at > NOW() - INTERVAL '1 hour';

  -- Contar total de eventos procesados en última hora.
  SELECT COUNT(*) INTO recent_total
  FROM email_events
  WHERE client_id = NEW.client_id
    AND created_at > NOW() - INTERVAL '1 hour';

  -- Necesitamos un mínimo de volumen para que la rate sea confiable.
  IF recent_total < 20 THEN
    RETURN NEW;
  END IF;

  bounce_rate := (recent_bounces::NUMERIC / NULLIF(recent_total, 0)) * 100;

  -- Umbral: 5% de bounce rate dispara alerta.
  IF bounce_rate <= 5 THEN
    RETURN NEW;
  END IF;

  -- Deduplicación: si ya hay una alerta no-acknowledged en la última hora, skip.
  SELECT EXISTS(
    SELECT 1 FROM steve_alerts
    WHERE client_id = NEW.client_id
      AND source = 'email_bounce_spike'
      AND acknowledged = false
      AND created_at > NOW() - INTERVAL '1 hour'
  ) INTO already_alerted;

  IF already_alerted THEN
    RETURN NEW;
  END IF;

  -- Crear la alerta.
  INSERT INTO steve_alerts (client_id, severity, source, message, payload)
  VALUES (
    NEW.client_id,
    CASE
      WHEN bounce_rate > 15 THEN 'critical'
      WHEN bounce_rate > 10 THEN 'high'
      ELSE 'medium'
    END,
    'email_bounce_spike',
    format('Bounce rate %.1f%% en última hora (%s bounces de %s envíos)',
           bounce_rate, recent_bounces, recent_total),
    jsonb_build_object(
      'bounces', recent_bounces,
      'total', recent_total,
      'rate', bounce_rate,
      'window', '1 hour'
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_email_bounce_alert ON email_events;
CREATE TRIGGER trg_email_bounce_alert
  AFTER INSERT ON email_events
  FOR EACH ROW
  EXECUTE FUNCTION alert_on_bounce_spike();

COMMENT ON FUNCTION alert_on_bounce_spike() IS
  'Dispara steve_alerts cuando bounce_rate > 5% en última hora (mínimo 20 envíos).';
