-- Atomic credit deduction to prevent race conditions (Issue 1)
-- and atomic campaign counter increment (Issue 5)

-- 1) deduct_wa_credit: atomically deducts credits, inserts transaction, returns result
CREATE OR REPLACE FUNCTION deduct_wa_credit(
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
  -- Atomic UPDATE with RETURNING — prevents race conditions
  UPDATE wa_credits
  SET balance = balance - p_amount,
      total_used = total_used + p_amount,
      updated_at = now()
  WHERE client_id = p_client_id
    AND balance >= p_amount
  RETURNING id, balance INTO v_credit_id, v_new_balance;

  IF v_credit_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_credits');
  END IF;

  -- Insert transaction record
  INSERT INTO wa_credit_transactions (client_id, type, amount, description, balance_after)
  VALUES (p_client_id, 'usage', -p_amount, p_description, v_new_balance);

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;

-- 2) increment_campaign_counter: atomically increments a metric column on wa_campaigns
CREATE OR REPLACE FUNCTION increment_campaign_counter(
  p_campaign_id UUID,
  p_column TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Whitelist columns to prevent SQL injection
  IF p_column NOT IN ('delivered_count', 'read_count', 'replied_count') THEN
    RAISE EXCEPTION 'Invalid column: %', p_column;
  END IF;

  EXECUTE format(
    'UPDATE wa_campaigns SET %I = %I + 1 WHERE id = $1',
    p_column, p_column
  ) USING p_campaign_id;
END;
$$;
