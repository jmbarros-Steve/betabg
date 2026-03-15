-- Atomic credit deduction to prevent race conditions
-- Two concurrent requests reading the same balance can both deduct,
-- resulting in negative credits or double-spending.
CREATE OR REPLACE FUNCTION deduct_credits(
  p_client_id UUID,
  p_amount INTEGER
)
RETURNS TABLE(
  success BOOLEAN,
  remaining INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_available INTEGER;
BEGIN
  -- Lock the row to prevent concurrent reads
  SELECT creditos_disponibles INTO v_available
  FROM client_credits
  WHERE client_id = p_client_id
  FOR UPDATE;

  IF v_available IS NULL THEN
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  IF v_available < p_amount THEN
    RETURN QUERY SELECT false, v_available;
    RETURN;
  END IF;

  UPDATE client_credits
  SET creditos_disponibles = creditos_disponibles - p_amount,
      creditos_usados = creditos_usados + p_amount
  WHERE client_id = p_client_id;

  RETURN QUERY SELECT true, v_available - p_amount;
END;
$$;
