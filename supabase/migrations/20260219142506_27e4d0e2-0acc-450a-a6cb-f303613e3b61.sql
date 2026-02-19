
-- Fix: Make super admin SELECT policy PERMISSIVE (not restrictive)
-- Drop the current restrictive policy
DROP POLICY IF EXISTS "Super admins view all clients" ON public.clients;

-- Recreate as a PERMISSIVE policy (default in Postgres)
CREATE POLICY "Super admins view all clients"
ON public.clients
FOR SELECT
USING (is_super_admin(auth.uid()));
