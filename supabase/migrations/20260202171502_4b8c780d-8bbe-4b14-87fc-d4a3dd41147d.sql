-- Trigger function: auto-assign 'client' role and create client record on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_name text;
  user_email text;
BEGIN
  -- Extract name and email from the new user
  user_email := NEW.email;
  user_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(user_email, '@', 1)
  );

  -- Create client record (user_id and client_user_id both point to the new user)
  INSERT INTO public.clients (user_id, client_user_id, name, email)
  VALUES (NEW.id, NEW.id, user_name, user_email)
  ON CONFLICT DO NOTHING;

  -- Assign 'client' role
  INSERT INTO public.user_roles (user_id, role, is_super_admin)
  VALUES (NEW.id, 'client', false)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Create trigger on auth.users (runs after insert)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();