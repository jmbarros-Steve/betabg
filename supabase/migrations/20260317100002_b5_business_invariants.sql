-- ============================================================
-- FASE 6 B.5: 4 invariantes de negocio (triggers)
-- INV-1:  Campaña no puede activarse sin CRITERIO aprobado
-- INV-3:  Token debe tener >100 chars (encriptado)
-- INV-8:  Budget no puede ser negativo ni >10,000,000
-- INV-10: Gasto diario total no puede exceder 500,000 CLP por merchant
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- INV-1: Campaña no se activa sin criterio_approved = true
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_inv1_require_criterio_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Solo aplica cuando se cambia a ACTIVE
  IF NEW.status = 'ACTIVE' AND (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'ACTIVE') THEN
    IF NEW.criterio_approved IS NOT TRUE THEN
      RAISE EXCEPTION '[INV-1] Campaña "%" no puede activarse sin aprobación de CRITERIO. criterio_approved debe ser TRUE.',
        NEW.meta_campaign_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inv1_criterio_approval ON meta_campaigns;
CREATE TRIGGER trg_inv1_criterio_approval
  BEFORE UPDATE ON meta_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION fn_inv1_require_criterio_approval();

-- ────────────────────────────────────────────────────────────
-- INV-3: Token encriptado debe tener >100 chars
-- Aplica a platform_connections en INSERT y UPDATE
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_inv3_validate_token_length()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Validar access_token_encrypted
  IF NEW.access_token_encrypted IS NOT NULL
     AND length(NEW.access_token_encrypted) <= 100 THEN
    RAISE EXCEPTION '[INV-3] access_token_encrypted tiene % chars (mínimo 101). Token no parece estar encriptado correctamente.',
      length(NEW.access_token_encrypted);
  END IF;

  -- Validar refresh_token_encrypted
  IF NEW.refresh_token_encrypted IS NOT NULL
     AND length(NEW.refresh_token_encrypted) <= 100 THEN
    RAISE EXCEPTION '[INV-3] refresh_token_encrypted tiene % chars (mínimo 101). Token no parece estar encriptado correctamente.',
      length(NEW.refresh_token_encrypted);
  END IF;

  -- Validar api_key_encrypted
  IF NEW.api_key_encrypted IS NOT NULL
     AND length(NEW.api_key_encrypted) <= 100 THEN
    RAISE EXCEPTION '[INV-3] api_key_encrypted tiene % chars (mínimo 101). Token no parece estar encriptado correctamente.',
      length(NEW.api_key_encrypted);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inv3_token_length ON platform_connections;
CREATE TRIGGER trg_inv3_token_length
  BEFORE INSERT OR UPDATE ON platform_connections
  FOR EACH ROW
  EXECUTE FUNCTION fn_inv3_validate_token_length();

-- ────────────────────────────────────────────────────────────
-- INV-8: Budget no puede ser negativo ni >10,000,000
-- Aplica a meta_campaigns en INSERT y UPDATE
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_inv8_validate_budget()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.daily_budget IS NOT NULL THEN
    IF NEW.daily_budget < 0 THEN
      RAISE EXCEPTION '[INV-8] daily_budget no puede ser negativo: %. Campaña: %',
        NEW.daily_budget, NEW.meta_campaign_id;
    END IF;
    IF NEW.daily_budget > 10000000 THEN
      RAISE EXCEPTION '[INV-8] daily_budget excede límite de 10,000,000: %. Campaña: %',
        NEW.daily_budget, NEW.meta_campaign_id;
    END IF;
  END IF;

  IF NEW.lifetime_budget IS NOT NULL THEN
    IF NEW.lifetime_budget < 0 THEN
      RAISE EXCEPTION '[INV-8] lifetime_budget no puede ser negativo: %. Campaña: %',
        NEW.lifetime_budget, NEW.meta_campaign_id;
    END IF;
    IF NEW.lifetime_budget > 10000000 THEN
      RAISE EXCEPTION '[INV-8] lifetime_budget excede límite de 10,000,000: %. Campaña: %',
        NEW.lifetime_budget, NEW.meta_campaign_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inv8_budget_limits ON meta_campaigns;
CREATE TRIGGER trg_inv8_budget_limits
  BEFORE INSERT OR UPDATE ON meta_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION fn_inv8_validate_budget();

-- ────────────────────────────────────────────────────────────
-- INV-10: Gasto diario total no puede exceder 500,000 CLP por merchant
-- Aplica a campaign_metrics en INSERT y UPDATE
-- Suma el spend de todas las campañas del mismo client en el mismo día
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_inv10_daily_spend_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_client_id UUID;
  v_total_spend NUMERIC;
  v_cap NUMERIC := 500000;
BEGIN
  -- Obtener el client_id desde la conexión
  SELECT client_id INTO v_client_id
  FROM platform_connections
  WHERE id = NEW.connection_id;

  IF v_client_id IS NULL THEN
    RETURN NEW;  -- conexión no encontrada, dejar pasar (RLS/FK lo atrapará)
  END IF;

  -- Sumar gasto del día para TODAS las conexiones del mismo cliente
  SELECT COALESCE(SUM(cm.spend), 0) INTO v_total_spend
  FROM campaign_metrics cm
  JOIN platform_connections pc ON pc.id = cm.connection_id
  WHERE pc.client_id = v_client_id
    AND cm.metric_date = NEW.metric_date
    AND cm.id IS DISTINCT FROM NEW.id;  -- excluir el registro actual (para UPDATEs)

  -- Sumar el nuevo spend
  v_total_spend := v_total_spend + COALESCE(NEW.spend, 0);

  IF v_total_spend > v_cap THEN
    RAISE EXCEPTION '[INV-10] Gasto diario total (%) excede el límite de 500,000 CLP para client_id %. Fecha: %',
      v_total_spend, v_client_id, NEW.metric_date;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inv10_daily_spend_cap ON campaign_metrics;
CREATE TRIGGER trg_inv10_daily_spend_cap
  BEFORE INSERT OR UPDATE ON campaign_metrics
  FOR EACH ROW
  EXECUTE FUNCTION fn_inv10_daily_spend_cap();
