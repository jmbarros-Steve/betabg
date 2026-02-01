-- =====================================================
-- MULTITENANCY SECURITY FIX: Shop-domain based isolation
-- =====================================================

-- 1. Add shop_domain column to clients table for tenant isolation
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS shop_domain TEXT;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_clients_shop_domain ON public.clients(shop_domain);

-- 2. Add is_super_admin flag to user_roles (only manually set by DB admin)
ALTER TABLE public.user_roles 
ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE;

-- 3. Create a function to get shop_domain for current user
CREATE OR REPLACE FUNCTION public.get_user_shop_domain(_user_id uuid)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.shop_domain
  FROM public.clients c
  WHERE c.client_user_id = _user_id
     OR c.user_id = _user_id
  LIMIT 1
$$;

-- 4. Create a function to check if user is a super admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'admin'
      AND is_super_admin = TRUE
  )
$$;

-- 5. Create function to check if user is a Shopify user (has shop_domain)
CREATE OR REPLACE FUNCTION public.is_shopify_user(_user_id uuid)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE (c.client_user_id = _user_id OR c.user_id = _user_id)
      AND c.shop_domain IS NOT NULL
  )
$$;

-- 6. Function to check if user can access a specific shop's data
CREATE OR REPLACE FUNCTION public.can_access_shop(_user_id uuid, _shop_domain text)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- Super admins can access everything
    public.is_super_admin(_user_id)
    OR
    -- Regular users can only access their own shop
    EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE (c.client_user_id = _user_id OR c.user_id = _user_id)
        AND c.shop_domain = _shop_domain
    )
$$;

-- 7. Update platform_connections with shop_domain column
ALTER TABLE public.platform_connections 
ADD COLUMN IF NOT EXISTS shop_domain TEXT;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_platform_connections_shop_domain ON public.platform_connections(shop_domain);

-- 8. Update platform_metrics with shop_domain for RLS
ALTER TABLE public.platform_metrics 
ADD COLUMN IF NOT EXISTS shop_domain TEXT;

-- Create index
CREATE INDEX IF NOT EXISTS idx_platform_metrics_shop_domain ON public.platform_metrics(shop_domain);

-- 9. Update campaign_metrics with shop_domain
ALTER TABLE public.campaign_metrics 
ADD COLUMN IF NOT EXISTS shop_domain TEXT;

CREATE INDEX IF NOT EXISTS idx_campaign_metrics_shop_domain ON public.campaign_metrics(shop_domain);

-- 10. Update campaign_recommendations with shop_domain
ALTER TABLE public.campaign_recommendations 
ADD COLUMN IF NOT EXISTS shop_domain TEXT;

CREATE INDEX IF NOT EXISTS idx_campaign_recommendations_shop_domain ON public.campaign_recommendations(shop_domain);

-- =====================================================
-- NEW RLS POLICIES FOR SHOP-DOMAIN ISOLATION
-- =====================================================

-- Platform Connections: Add shop_domain based policy
DROP POLICY IF EXISTS "Shop isolation for platform_connections" ON public.platform_connections;
CREATE POLICY "Shop isolation for platform_connections"
ON public.platform_connections
FOR ALL
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR 
  (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR
  -- Fallback for existing data without shop_domain
  (shop_domain IS NULL AND client_id IN (
    SELECT id FROM clients WHERE client_user_id = auth.uid() OR user_id = auth.uid()
  ))
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR 
  (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR
  (shop_domain IS NULL AND client_id IN (
    SELECT id FROM clients WHERE client_user_id = auth.uid() OR user_id = auth.uid()
  ))
);

-- Platform Metrics: Add shop_domain based policy  
DROP POLICY IF EXISTS "Shop isolation for platform_metrics" ON public.platform_metrics;
CREATE POLICY "Shop isolation for platform_metrics"
ON public.platform_metrics
FOR ALL
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR 
  (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR
  -- Fallback for existing data
  (shop_domain IS NULL AND connection_id IN (
    SELECT pc.id FROM platform_connections pc
    JOIN clients c ON pc.client_id = c.id
    WHERE c.client_user_id = auth.uid() OR c.user_id = auth.uid()
  ))
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR 
  (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR
  (shop_domain IS NULL AND connection_id IN (
    SELECT pc.id FROM platform_connections pc
    JOIN clients c ON pc.client_id = c.id
    WHERE c.client_user_id = auth.uid() OR c.user_id = auth.uid()
  ))
);

-- Campaign Metrics: Add shop_domain based policy
DROP POLICY IF EXISTS "Shop isolation for campaign_metrics" ON public.campaign_metrics;
CREATE POLICY "Shop isolation for campaign_metrics"
ON public.campaign_metrics
FOR ALL
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR 
  (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR
  -- Fallback for existing data
  (shop_domain IS NULL AND connection_id IN (
    SELECT pc.id FROM platform_connections pc
    JOIN clients c ON pc.client_id = c.id
    WHERE c.client_user_id = auth.uid() OR c.user_id = auth.uid()
  ))
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR 
  (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR
  (shop_domain IS NULL AND connection_id IN (
    SELECT pc.id FROM platform_connections pc
    JOIN clients c ON pc.client_id = c.id
    WHERE c.client_user_id = auth.uid() OR c.user_id = auth.uid()
  ))
);

-- Campaign Recommendations: Add shop_domain based policy
DROP POLICY IF EXISTS "Shop isolation for campaign_recommendations" ON public.campaign_recommendations;
CREATE POLICY "Shop isolation for campaign_recommendations"
ON public.campaign_recommendations
FOR ALL
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR 
  (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR
  -- Fallback
  (shop_domain IS NULL AND connection_id IN (
    SELECT pc.id FROM platform_connections pc
    JOIN clients c ON pc.client_id = c.id
    WHERE c.client_user_id = auth.uid() OR c.user_id = auth.uid()
  ))
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR 
  (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
  OR
  (shop_domain IS NULL AND connection_id IN (
    SELECT pc.id FROM platform_connections pc
    JOIN clients c ON pc.client_id = c.id
    WHERE c.client_user_id = auth.uid() OR c.user_id = auth.uid()
  ))
);

-- Clients table: Add shop_domain based policy
DROP POLICY IF EXISTS "Shop isolation for clients" ON public.clients;
CREATE POLICY "Shop isolation for clients"
ON public.clients
FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR client_user_id = auth.uid()
  OR user_id = auth.uid()
  OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
);