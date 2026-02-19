
-- Drop ALL SELECT policies on clients and recreate them correctly
-- The root cause: all policies were RESTRICTIVE (AS RESTRICTIVE), which means
-- PostgreSQL requires ALL of them to pass simultaneously — impossible for super admin.
-- We need at least one PERMISSIVE policy per user type.

DROP POLICY IF EXISTS "Super admins view all clients" ON public.clients;
DROP POLICY IF EXISTS "Users can view their own clients" ON public.clients;
DROP POLICY IF EXISTS "Clients can view their own client record" ON public.clients;
DROP POLICY IF EXISTS "Shopify users view own client record" ON public.clients;

-- Recreate as PERMISSIVE (default in Postgres — no AS RESTRICTIVE keyword)
-- These will be ORed together, so any one passing = row is visible

CREATE POLICY "Super admins view all clients"
ON public.clients
FOR SELECT
TO authenticated
USING (is_super_admin(auth.uid()));

CREATE POLICY "Users can view their own clients"
ON public.clients
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Clients can view their own client record"
ON public.clients
FOR SELECT
TO authenticated
USING (auth.uid() = client_user_id);

CREATE POLICY "Shopify users view own client record"
ON public.clients
FOR SELECT
TO authenticated
USING ((shop_domain IS NOT NULL) AND can_access_shop(auth.uid(), shop_domain));
