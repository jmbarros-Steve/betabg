
-- Drop the existing restrictive super admin policy and create a proper permissive one
DROP POLICY IF EXISTS "Super admins view all clients" ON public.clients;

CREATE POLICY "Super admins view all clients"
ON public.clients
FOR SELECT
USING (is_super_admin(auth.uid()));
