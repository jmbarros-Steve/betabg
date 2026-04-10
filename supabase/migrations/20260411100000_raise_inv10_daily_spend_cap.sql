-- Raise INV-10 daily spend cap from 500,000 to 100,000,000 CLP
-- The old cap was too low for real clients (e.g. RazasPet exceeds 500k on peak days).
-- campaign_metrics is a REPORTING table (records historical spend), not a budget-authorization table.
-- The cap is kept as a safety net against obviously corrupted data (bad currency conversions).

CREATE OR REPLACE FUNCTION fn_inv10_daily_spend_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_client_id UUID;
  v_total_spend NUMERIC;
  v_cap NUMERIC := 100000000;  -- 100M CLP (~$100k USD) — safety net only
BEGIN
  SELECT client_id INTO v_client_id
  FROM platform_connections
  WHERE id = NEW.connection_id;

  IF v_client_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(cm.spend), 0) INTO v_total_spend
  FROM campaign_metrics cm
  JOIN platform_connections pc ON pc.id = cm.connection_id
  WHERE pc.client_id = v_client_id
    AND cm.metric_date = NEW.metric_date
    AND cm.id IS DISTINCT FROM NEW.id;

  v_total_spend := v_total_spend + COALESCE(NEW.spend, 0);

  IF v_total_spend > v_cap THEN
    RAISE EXCEPTION '[INV-10] Gasto diario total (%) excede el límite de 100,000,000 CLP para client_id %. Fecha: %',
      v_total_spend, v_client_id, NEW.metric_date;
  END IF;

  RETURN NEW;
END;
$$;
