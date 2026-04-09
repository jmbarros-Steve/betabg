-- Bug #111 fix: atomic credit refund to prevent TOCTOU race condition.
-- Mirrors deduct_wa_credit but ADDS to balance and DECREMENTS total_used.
-- Used when a campaign pre-deducts credits and some messages fail to send.

CREATE OR REPLACE FUNCTION refund_wa_credit(
  p_client_id UUID,
  p_amount INTEGER,
  p_description TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance INTEGER;
  v_credit_id UUID;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'refund amount must be positive');
  END IF;

  -- Atomic UPDATE: balance = balance + p_amount, total_used = total_used - p_amount
  -- total_used cannot go below 0
  UPDATE wa_credits
  SET balance = balance + p_amount,
      total_used = GREATEST(total_used - p_amount, 0),
      updated_at = now()
  WHERE client_id = p_client_id
  RETURNING id, balance INTO v_credit_id, v_new_balance;

  IF v_credit_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'client_not_found');
  END IF;

  -- Insert transaction record (positive amount = refund)
  INSERT INTO wa_credit_transactions (client_id, type, amount, description, balance_after)
  VALUES (p_client_id, 'refund', p_amount, p_description, v_new_balance);

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;
