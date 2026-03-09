-- Ad Set level metrics for 3:2:2 testing analysis
CREATE TABLE IF NOT EXISTS public.adset_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.platform_connections(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL DEFAULT '',
  adset_id TEXT NOT NULL,
  adset_name TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT 'meta',
  metric_date DATE NOT NULL,
  impressions BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  spend NUMERIC DEFAULT 0,
  conversions NUMERIC DEFAULT 0,
  conversion_value NUMERIC DEFAULT 0,
  ctr NUMERIC DEFAULT 0,
  cpc NUMERIC DEFAULT 0,
  cpm NUMERIC DEFAULT 0,
  roas NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'CLP',
  shop_domain TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(connection_id, campaign_id, adset_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_adset_metrics_connection ON public.adset_metrics(connection_id);
CREATE INDEX IF NOT EXISTS idx_adset_metrics_campaign ON public.adset_metrics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_adset_metrics_date ON public.adset_metrics(metric_date);
CREATE INDEX IF NOT EXISTS idx_adset_metrics_shop_domain ON public.adset_metrics(shop_domain);

ALTER TABLE public.adset_metrics ENABLE ROW LEVEL SECURITY;

-- Super admins can see all
CREATE POLICY "Super admins view all adset metrics"
  ON public.adset_metrics FOR SELECT
  USING (public.is_super_admin(auth.uid()));

-- Shopify users see own
CREATE POLICY "Shopify users view own adset metrics"
  ON public.adset_metrics FOR SELECT
  USING (
    shop_domain IS NOT NULL
    AND public.can_access_shop(auth.uid(), shop_domain)
  );

-- Legacy clients see own
CREATE POLICY "Legacy clients view own adset metrics"
  ON public.adset_metrics FOR SELECT
  USING (
    shop_domain IS NULL
    AND connection_id IN (
      SELECT pc.id FROM public.platform_connections pc
      JOIN public.clients c ON pc.client_id = c.id
      WHERE c.client_user_id = auth.uid() OR c.user_id = auth.uid()
    )
  );

-- Insert policy
CREATE POLICY "Insert adset metrics"
  ON public.adset_metrics FOR INSERT
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
    OR (shop_domain IS NULL AND connection_id IN (
      SELECT pc.id FROM public.platform_connections pc
      JOIN public.clients c ON pc.client_id = c.id
      WHERE c.user_id = auth.uid()
    ))
  );

-- Delete policy
CREATE POLICY "Delete own adset metrics"
  ON public.adset_metrics FOR DELETE
  USING (
    public.is_super_admin(auth.uid())
    OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
    OR (shop_domain IS NULL AND connection_id IN (
      SELECT pc.id FROM public.platform_connections pc
      JOIN public.clients c ON pc.client_id = c.id
      WHERE c.user_id = auth.uid()
    ))
  );

-- Update policy
CREATE POLICY "Update own adset metrics"
  ON public.adset_metrics FOR UPDATE
  USING (
    public.is_super_admin(auth.uid())
    OR (shop_domain IS NOT NULL AND public.can_access_shop(auth.uid(), shop_domain))
    OR (shop_domain IS NULL AND connection_id IN (
      SELECT pc.id FROM public.platform_connections pc
      JOIN public.clients c ON pc.client_id = c.id
      WHERE c.user_id = auth.uid()
    ))
  );
