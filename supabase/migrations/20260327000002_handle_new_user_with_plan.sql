-- Actualizar trigger handle_new_user para asignar plan Visual por defecto
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
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

  -- Crear cliente
  INSERT INTO public.clients (user_id, client_user_id, name, email)
  VALUES (NEW.id, NEW.id, user_name, user_email)
  ON CONFLICT DO NOTHING;

  -- Crear rol
  INSERT INTO public.user_roles (user_id, role, is_super_admin)
  VALUES (NEW.id, 'client', false)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Asignar plan Visual por defecto
  SELECT id INTO visual_plan_id FROM public.subscription_plans WHERE slug = 'visual' AND is_active = true LIMIT 1;
  IF visual_plan_id IS NOT NULL THEN
    INSERT INTO public.user_subscriptions (id, user_id, plan_id, status, credits_used, credits_reset_at)
    VALUES (gen_random_uuid(), NEW.id, visual_plan_id, 'active', 0, now())
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
