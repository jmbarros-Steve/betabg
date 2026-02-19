
-- Super admin policies for client_credits
CREATE POLICY "Super admins manage all client credits"
ON public.client_credits
FOR ALL
USING (is_super_admin(auth.uid()));

-- Super admin policies for buyer_personas
CREATE POLICY "Super admins manage all buyer personas"
ON public.buyer_personas
FOR ALL
USING (is_super_admin(auth.uid()));

-- Super admin UPDATE policy for clients (needed to edit any client)
CREATE POLICY "Super admins update all clients"
ON public.clients
FOR UPDATE
USING (is_super_admin(auth.uid()));
