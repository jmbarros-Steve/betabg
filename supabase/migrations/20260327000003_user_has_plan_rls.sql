-- RLS helper: check if the current user has a plan at or above the required level
CREATE OR REPLACE FUNCTION user_has_plan(required_plan TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_subscriptions us
    JOIN subscription_plans sp ON us.plan_id = sp.id
    WHERE us.user_id = auth.uid()
      AND us.status = 'active'
      AND (sp.features->>'tier')::int >= (
        SELECT (features->>'tier')::int FROM subscription_plans WHERE slug = required_plan
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION user_has_plan(TEXT) TO authenticated;
