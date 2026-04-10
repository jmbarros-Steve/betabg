-- Make handle_new_user trigger fault-tolerant:
-- If any step fails, log a warning but still allow user creation.
-- Edge functions (admin-create-user, create-client-user, self-signup) handle the rest.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_name TEXT;
  user_email TEXT;
  visual_plan_id UUID;
BEGIN
  user_email := NEW.email;
  user_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(user_email, '@', 1)
  );

  -- Create client record if none exists
  BEGIN
    INSERT INTO clients (user_id, client_user_id, name, email)
    SELECT NEW.id, NEW.id, user_name, user_email
    WHERE NOT EXISTS (SELECT 1 FROM clients WHERE user_id = NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: client insert failed: %', SQLERRM;
  END;

  -- Assign client role
  BEGIN
    INSERT INTO user_roles (user_id, role, is_super_admin)
    VALUES (NEW.id, 'client', false)
    ON CONFLICT (user_id, role) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: role insert failed: %', SQLERRM;
  END;

  -- Assign default Visual plan
  BEGIN
    SELECT id INTO visual_plan_id FROM subscription_plans WHERE slug = 'visual' AND is_active = true LIMIT 1;
    IF visual_plan_id IS NOT NULL THEN
      INSERT INTO user_subscriptions (id, user_id, plan_id, status, credits_used, credits_reset_at)
      SELECT gen_random_uuid(), NEW.id, visual_plan_id, 'active', 0, now()
      WHERE NOT EXISTS (SELECT 1 FROM user_subscriptions WHERE user_id = NEW.id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: subscription insert failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;
