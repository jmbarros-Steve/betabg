-- Fix: UPDATE, DELETE, INSERT policies on platform_connections only checked user_id,
-- not client_user_id. This blocked client users from modifying their own connections.

-- UPDATE
DROP POLICY IF EXISTS "Update own shop connections" ON public.platform_connections;
CREATE POLICY "Update own shop connections"
ON public.platform_connections FOR UPDATE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR (shop_domain IS NULL AND client_id IN (
    SELECT id FROM public.clients WHERE client_user_id = auth.uid() OR user_id = auth.uid()
  ))
);

-- DELETE
DROP POLICY IF EXISTS "Delete own shop connections" ON public.platform_connections;
CREATE POLICY "Delete own shop connections"
ON public.platform_connections FOR DELETE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR (shop_domain IS NULL AND client_id IN (
    SELECT id FROM public.clients WHERE client_user_id = auth.uid() OR user_id = auth.uid()
  ))
);

-- INSERT
DROP POLICY IF EXISTS "Insert connections with valid shop" ON public.platform_connections;
CREATE POLICY "Insert connections with valid shop"
ON public.platform_connections FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR (shop_domain IS NULL AND client_id IN (
    SELECT id FROM public.clients WHERE client_user_id = auth.uid() OR user_id = auth.uid()
  ))
);
