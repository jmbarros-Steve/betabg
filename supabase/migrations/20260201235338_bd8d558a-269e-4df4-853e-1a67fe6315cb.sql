
-- =====================================================
-- DEEP RLS CLEANUP: Multitenancy Security Hardening
-- =====================================================

-- 1. UPDATE can_access_shop to be more strict
-- Only allows access if user is EXCLUSIVELY linked to that shop_domain
CREATE OR REPLACE FUNCTION public.can_access_shop(_user_id uuid, _shop_domain text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- User must have a client record with this exact shop_domain
    EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE (c.client_user_id = _user_id OR c.user_id = _user_id)
        AND c.shop_domain = _shop_domain
        AND c.shop_domain IS NOT NULL
    )
$$;

-- 2. DROP ALL REDUNDANT POLICIES on platform_connections
DROP POLICY IF EXISTS "Shop isolation for platform_connections" ON public.platform_connections;
DROP POLICY IF EXISTS "Clients can view their own connections" ON public.platform_connections;
DROP POLICY IF EXISTS "Clients can insert their own connections" ON public.platform_connections;
DROP POLICY IF EXISTS "Users can create connections for their clients" ON public.platform_connections;
DROP POLICY IF EXISTS "Users can view their clients connections" ON public.platform_connections;
DROP POLICY IF EXISTS "Users can update their clients connections" ON public.platform_connections;
DROP POLICY IF EXISTS "Users can delete their clients connections" ON public.platform_connections;

-- 3. CREATE CLEAN POLICIES for platform_connections
-- Shopify users: ONLY their shop_domain
CREATE POLICY "Shopify users access own shop connections"
ON public.platform_connections FOR SELECT
TO authenticated
USING (
  shop_domain IS NOT NULL 
  AND public.can_access_shop(auth.uid(), shop_domain)
);

-- Super admins: Separate explicit policy
CREATE POLICY "Super admins view all connections"
ON public.platform_connections FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

-- Non-Shopify clients (legacy): Access via client_id
CREATE POLICY "Legacy clients view own connections"
ON public.platform_connections FOR SELECT
TO authenticated
USING (
  shop_domain IS NULL
  AND client_id IN (
    SELECT id FROM public.clients 
    WHERE client_user_id = auth.uid() OR user_id = auth.uid()
  )
);

-- INSERT: Must match shop_domain or be super admin
CREATE POLICY "Insert connections with valid shop"
ON public.platform_connections FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR (shop_domain IS NULL AND client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  ))
);

-- UPDATE: Same restrictions
CREATE POLICY "Update own shop connections"
ON public.platform_connections FOR UPDATE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR (shop_domain IS NULL AND client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  ))
);

-- DELETE: Same restrictions
CREATE POLICY "Delete own shop connections"
ON public.platform_connections FOR DELETE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR (shop_domain IS NULL AND client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  ))
);

-- 4. DROP ALL REDUNDANT POLICIES on platform_metrics
DROP POLICY IF EXISTS "Shop isolation for platform_metrics" ON public.platform_metrics;
DROP POLICY IF EXISTS "Clients can view their own metrics" ON public.platform_metrics;
DROP POLICY IF EXISTS "Users can view their clients metrics" ON public.platform_metrics;
DROP POLICY IF EXISTS "Users can insert metrics for their clients" ON public.platform_metrics;
DROP POLICY IF EXISTS "Users can update metrics for their clients" ON public.platform_metrics;
DROP POLICY IF EXISTS "Users can delete metrics for their clients" ON public.platform_metrics;

-- 5. CREATE CLEAN POLICIES for platform_metrics
-- Shopify users: ONLY their shop_domain (NO admin fallback here)
CREATE POLICY "Shopify users view own shop metrics"
ON public.platform_metrics FOR SELECT
TO authenticated
USING (
  shop_domain IS NOT NULL 
  AND public.can_access_shop(auth.uid(), shop_domain)
);

-- Super admins: Separate policy
CREATE POLICY "Super admins view all metrics"
ON public.platform_metrics FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

-- Legacy (non-Shopify)
CREATE POLICY "Legacy clients view own metrics"
ON public.platform_metrics FOR SELECT
TO authenticated
USING (
  shop_domain IS NULL
  AND connection_id IN (
    SELECT pc.id FROM public.platform_connections pc
    JOIN public.clients c ON pc.client_id = c.id
    WHERE c.client_user_id = auth.uid() OR c.user_id = auth.uid()
  )
);

-- INSERT with shop_domain validation
CREATE POLICY "Insert metrics with valid shop"
ON public.platform_metrics FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR (shop_domain IS NULL AND connection_id IN (
    SELECT pc.id FROM public.platform_connections pc
    JOIN public.clients c ON pc.client_id = c.id
    WHERE c.user_id = auth.uid()
  ))
);

-- UPDATE
CREATE POLICY "Update own shop metrics"
ON public.platform_metrics FOR UPDATE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR (shop_domain IS NULL AND connection_id IN (
    SELECT pc.id FROM public.platform_connections pc
    JOIN public.clients c ON pc.client_id = c.id
    WHERE c.user_id = auth.uid()
  ))
);

-- DELETE
CREATE POLICY "Delete own shop metrics"
ON public.platform_metrics FOR DELETE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR (shop_domain IS NULL AND connection_id IN (
    SELECT pc.id FROM public.platform_connections pc
    JOIN public.clients c ON pc.client_id = c.id
    WHERE c.user_id = auth.uid()
  ))
);

-- 6. DROP ALL REDUNDANT POLICIES on campaign_metrics
DROP POLICY IF EXISTS "Shop isolation for campaign_metrics" ON public.campaign_metrics;
DROP POLICY IF EXISTS "Users can view their clients campaign metrics" ON public.campaign_metrics;
DROP POLICY IF EXISTS "Users can insert campaign metrics for their clients" ON public.campaign_metrics;
DROP POLICY IF EXISTS "Users can update campaign metrics for their clients" ON public.campaign_metrics;
DROP POLICY IF EXISTS "Users can delete campaign metrics for their clients" ON public.campaign_metrics;

-- 7. CREATE CLEAN POLICIES for campaign_metrics
CREATE POLICY "Shopify users view own campaign metrics"
ON public.campaign_metrics FOR SELECT
TO authenticated
USING (
  shop_domain IS NOT NULL 
  AND public.can_access_shop(auth.uid(), shop_domain)
);

CREATE POLICY "Super admins view all campaign metrics"
ON public.campaign_metrics FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Legacy clients view own campaign metrics"
ON public.campaign_metrics FOR SELECT
TO authenticated
USING (
  shop_domain IS NULL
  AND connection_id IN (
    SELECT pc.id FROM public.platform_connections pc
    JOIN public.clients c ON pc.client_id = c.id
    WHERE c.client_user_id = auth.uid() OR c.user_id = auth.uid()
  )
);

CREATE POLICY "Insert campaign metrics with valid shop"
ON public.campaign_metrics FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR (shop_domain IS NULL AND connection_id IN (
    SELECT pc.id FROM public.platform_connections pc
    JOIN public.clients c ON pc.client_id = c.id
    WHERE c.user_id = auth.uid()
  ))
);

CREATE POLICY "Update own campaign metrics"
ON public.campaign_metrics FOR UPDATE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR (shop_domain IS NULL AND connection_id IN (
    SELECT pc.id FROM public.platform_connections pc
    JOIN public.clients c ON pc.client_id = c.id
    WHERE c.user_id = auth.uid()
  ))
);

CREATE POLICY "Delete own campaign metrics"
ON public.campaign_metrics FOR DELETE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR (shop_domain IS NULL AND connection_id IN (
    SELECT pc.id FROM public.platform_connections pc
    JOIN public.clients c ON pc.client_id = c.id
    WHERE c.user_id = auth.uid()
  ))
);

-- 8. DROP REDUNDANT POLICIES on campaign_recommendations
DROP POLICY IF EXISTS "Shop isolation for campaign_recommendations" ON public.campaign_recommendations;
DROP POLICY IF EXISTS "Users can view their clients campaign recommendations" ON public.campaign_recommendations;
DROP POLICY IF EXISTS "Users can insert campaign recommendations for their clients" ON public.campaign_recommendations;
DROP POLICY IF EXISTS "Users can update campaign recommendations for their clients" ON public.campaign_recommendations;
DROP POLICY IF EXISTS "Users can delete campaign recommendations for their clients" ON public.campaign_recommendations;

-- 9. CREATE CLEAN POLICIES for campaign_recommendations
CREATE POLICY "Shopify users view own recommendations"
ON public.campaign_recommendations FOR SELECT
TO authenticated
USING (
  shop_domain IS NOT NULL 
  AND public.can_access_shop(auth.uid(), shop_domain)
);

CREATE POLICY "Super admins view all recommendations"
ON public.campaign_recommendations FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Legacy clients view own recommendations"
ON public.campaign_recommendations FOR SELECT
TO authenticated
USING (
  shop_domain IS NULL
  AND connection_id IN (
    SELECT pc.id FROM public.platform_connections pc
    JOIN public.clients c ON pc.client_id = c.id
    WHERE c.client_user_id = auth.uid() OR c.user_id = auth.uid()
  )
);

CREATE POLICY "Insert recommendations with valid shop"
ON public.campaign_recommendations FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR (shop_domain IS NULL AND connection_id IN (
    SELECT pc.id FROM public.platform_connections pc
    JOIN public.clients c ON pc.client_id = c.id
    WHERE c.user_id = auth.uid()
  ))
);

CREATE POLICY "Update own recommendations"
ON public.campaign_recommendations FOR UPDATE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR (shop_domain IS NULL AND connection_id IN (
    SELECT pc.id FROM public.platform_connections pc
    JOIN public.clients c ON pc.client_id = c.id
    WHERE c.user_id = auth.uid()
  ))
);

CREATE POLICY "Delete own recommendations"
ON public.campaign_recommendations FOR DELETE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR (shop_domain IS NULL AND connection_id IN (
    SELECT pc.id FROM public.platform_connections pc
    JOIN public.clients c ON pc.client_id = c.id
    WHERE c.user_id = auth.uid()
  ))
);

-- 10. CLEANUP clients table policies
DROP POLICY IF EXISTS "Shop isolation for clients" ON public.clients;

-- Shopify users see ONLY their shop
CREATE POLICY "Shopify users view own client record"
ON public.clients FOR SELECT
TO authenticated
USING (
  shop_domain IS NOT NULL 
  AND public.can_access_shop(auth.uid(), shop_domain)
);

-- Super admin separate policy
CREATE POLICY "Super admins view all clients"
ON public.clients FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));
