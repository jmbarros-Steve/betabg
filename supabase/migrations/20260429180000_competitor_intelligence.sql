-- ============================================================
-- Competitor Intelligence — Deep Dive
-- ============================================================
-- 11 tablas para análisis profundo de competidores:
--   1. competitor_intelligence       (master record por client × competitor_url)
--   2. competitor_paid_ads           (ads pagados detectados, multi-platform)
--   3. competitor_seo_keywords       (keywords ranqueadas)
--   4. competitor_seo_backlinks      (backlinks top)
--   5. competitor_seo_pages          (top páginas por tráfico)
--   6. competitor_social_metrics     (métricas social por plataforma)
--   7. competitor_catalog            (productos detectados)
--   8. competitor_reviews            (reviews agregados por fuente)
--   9. competitor_email_marketing    (estado captura email spy)
--  10. competitor_scorecards         (output Opus, snapshot por análisis)
--  11. competitor_action_plans       (output Opus, plan 30/60/90)
--
-- RLS pattern: tenant isolation por client_id (user_id OR client_user_id) +
--              super_admin bypass. Service role bypass es estándar en Supabase
--              y no requiere policy adicional (RLS no aplica al service_role).
--
-- NOTA: Las tablas legacy `competitor_tracking` y `competitor_ads` siguen existiendo
-- y son ortogonales a este módulo (no chocan en nombre con `competitor_paid_ads`).
-- ============================================================


-- ============================================================
-- 1. competitor_intelligence
-- ============================================================
CREATE TABLE IF NOT EXISTS public.competitor_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  competitor_name TEXT NOT NULL,
  competitor_url TEXT NOT NULL,
  ig_handle TEXT,
  industry TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_analyzed_at TIMESTAMP WITH TIME ZONE,
  analysis_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT competitor_intel_status_chk
    CHECK (analysis_status IN ('pending', 'running', 'completed', 'failed')),
  CONSTRAINT competitor_intel_unique UNIQUE (client_id, competitor_url)
);

CREATE INDEX IF NOT EXISTS idx_competitor_intel_client_created
  ON public.competitor_intelligence(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_competitor_intel_status
  ON public.competitor_intelligence(analysis_status)
  WHERE analysis_status IN ('pending', 'running');

ALTER TABLE public.competitor_intelligence ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_intelligence'
      AND policyname = 'competitor_intel_select'
  ) THEN
    CREATE POLICY competitor_intel_select ON public.competitor_intelligence
      FOR SELECT
      USING (
        client_id IN (
          SELECT id FROM public.clients
          WHERE user_id = auth.uid() OR client_user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_intelligence'
      AND policyname = 'competitor_intel_insert'
  ) THEN
    CREATE POLICY competitor_intel_insert ON public.competitor_intelligence
      FOR INSERT
      WITH CHECK (
        client_id IN (
          SELECT id FROM public.clients
          WHERE user_id = auth.uid() OR client_user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_intelligence'
      AND policyname = 'competitor_intel_update'
  ) THEN
    CREATE POLICY competitor_intel_update ON public.competitor_intelligence
      FOR UPDATE
      USING (
        client_id IN (
          SELECT id FROM public.clients
          WHERE user_id = auth.uid() OR client_user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_intelligence'
      AND policyname = 'competitor_intel_delete'
  ) THEN
    CREATE POLICY competitor_intel_delete ON public.competitor_intelligence
      FOR DELETE
      USING (
        client_id IN (
          SELECT id FROM public.clients
          WHERE user_id = auth.uid() OR client_user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;
END $$;

COMMENT ON TABLE public.competitor_intelligence IS
  'Master record por (client_id, competitor_url). Una fila por competidor que se está monitoreando para deep dive.';


-- ============================================================
-- 2. competitor_paid_ads
-- ============================================================
CREATE TABLE IF NOT EXISTS public.competitor_paid_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intelligence_id UUID NOT NULL REFERENCES public.competitor_intelligence(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  ad_id TEXT,
  ad_url TEXT,
  creative_url TEXT,
  creative_type TEXT,
  copy_text TEXT,
  cta TEXT,
  days_running INT,
  first_seen_at TIMESTAMP WITH TIME ZONE,
  last_seen_at TIMESTAMP WITH TIME ZONE,
  countries TEXT[] NOT NULL DEFAULT '{}',
  formats TEXT[] NOT NULL DEFAULT '{}',
  landing_url TEXT,
  raw_data JSONB,
  captured_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT competitor_paid_ads_platform_chk
    CHECK (platform IN ('meta', 'google', 'tiktok', 'linkedin')),
  CONSTRAINT competitor_paid_ads_creative_type_chk
    CHECK (creative_type IS NULL OR creative_type IN ('image', 'video', 'carousel'))
);

CREATE INDEX IF NOT EXISTS idx_competitor_paid_ads_intel_captured
  ON public.competitor_paid_ads(intelligence_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_competitor_paid_ads_intel_platform_lastseen
  ON public.competitor_paid_ads(intelligence_id, platform, last_seen_at DESC);

ALTER TABLE public.competitor_paid_ads ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_paid_ads'
      AND policyname = 'competitor_paid_ads_select'
  ) THEN
    CREATE POLICY competitor_paid_ads_select ON public.competitor_paid_ads
      FOR SELECT
      USING (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_paid_ads'
      AND policyname = 'competitor_paid_ads_insert'
  ) THEN
    CREATE POLICY competitor_paid_ads_insert ON public.competitor_paid_ads
      FOR INSERT
      WITH CHECK (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_paid_ads'
      AND policyname = 'competitor_paid_ads_update'
  ) THEN
    CREATE POLICY competitor_paid_ads_update ON public.competitor_paid_ads
      FOR UPDATE
      USING (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_paid_ads'
      AND policyname = 'competitor_paid_ads_delete'
  ) THEN
    CREATE POLICY competitor_paid_ads_delete ON public.competitor_paid_ads
      FOR DELETE
      USING (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;
END $$;

COMMENT ON TABLE public.competitor_paid_ads IS
  'Ads pagados detectados (Meta/Google/TikTok/LinkedIn). Una fila por ad. Distinto de la legacy competitor_ads.';


-- ============================================================
-- 3. competitor_seo_keywords
-- ============================================================
CREATE TABLE IF NOT EXISTS public.competitor_seo_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intelligence_id UUID NOT NULL REFERENCES public.competitor_intelligence(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  position INT,
  search_volume INT,
  keyword_difficulty INT,
  traffic_estimate INT,
  url_ranking TEXT,
  serp_features TEXT[] NOT NULL DEFAULT '{}',
  is_new BOOLEAN NOT NULL DEFAULT FALSE,
  is_lost BOOLEAN NOT NULL DEFAULT FALSE,
  captured_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitor_seo_kw_intel_captured
  ON public.competitor_seo_keywords(intelligence_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_competitor_seo_kw_intel_position
  ON public.competitor_seo_keywords(intelligence_id, position);

ALTER TABLE public.competitor_seo_keywords ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_seo_keywords'
      AND policyname = 'competitor_seo_kw_select'
  ) THEN
    CREATE POLICY competitor_seo_kw_select ON public.competitor_seo_keywords
      FOR SELECT
      USING (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_seo_keywords'
      AND policyname = 'competitor_seo_kw_insert'
  ) THEN
    CREATE POLICY competitor_seo_kw_insert ON public.competitor_seo_keywords
      FOR INSERT
      WITH CHECK (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_seo_keywords'
      AND policyname = 'competitor_seo_kw_update'
  ) THEN
    CREATE POLICY competitor_seo_kw_update ON public.competitor_seo_keywords
      FOR UPDATE
      USING (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_seo_keywords'
      AND policyname = 'competitor_seo_kw_delete'
  ) THEN
    CREATE POLICY competitor_seo_kw_delete ON public.competitor_seo_keywords
      FOR DELETE
      USING (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;
END $$;

COMMENT ON TABLE public.competitor_seo_keywords IS
  'Keywords ranqueadas por el competidor. Una fila por keyword × snapshot.';


-- ============================================================
-- 4. competitor_seo_backlinks
-- ============================================================
CREATE TABLE IF NOT EXISTS public.competitor_seo_backlinks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intelligence_id UUID NOT NULL REFERENCES public.competitor_intelligence(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  source_domain TEXT,
  domain_rank INT,
  anchor_text TEXT,
  link_type TEXT,
  first_seen DATE,
  is_lost BOOLEAN NOT NULL DEFAULT FALSE,
  captured_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitor_seo_bl_intel_captured
  ON public.competitor_seo_backlinks(intelligence_id, captured_at DESC);

ALTER TABLE public.competitor_seo_backlinks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_seo_backlinks'
      AND policyname = 'competitor_seo_bl_select'
  ) THEN
    CREATE POLICY competitor_seo_bl_select ON public.competitor_seo_backlinks
      FOR SELECT
      USING (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_seo_backlinks'
      AND policyname = 'competitor_seo_bl_insert'
  ) THEN
    CREATE POLICY competitor_seo_bl_insert ON public.competitor_seo_backlinks
      FOR INSERT
      WITH CHECK (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_seo_backlinks'
      AND policyname = 'competitor_seo_bl_update'
  ) THEN
    CREATE POLICY competitor_seo_bl_update ON public.competitor_seo_backlinks
      FOR UPDATE
      USING (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_seo_backlinks'
      AND policyname = 'competitor_seo_bl_delete'
  ) THEN
    CREATE POLICY competitor_seo_bl_delete ON public.competitor_seo_backlinks
      FOR DELETE
      USING (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;
END $$;

COMMENT ON TABLE public.competitor_seo_backlinks IS
  'Backlinks top del competidor. Una fila por (source_url × snapshot).';


-- ============================================================
-- 5. competitor_seo_pages
-- ============================================================
CREATE TABLE IF NOT EXISTS public.competitor_seo_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intelligence_id UUID NOT NULL REFERENCES public.competitor_intelligence(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  traffic_estimate INT,
  keywords_count INT,
  top_keyword TEXT,
  captured_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitor_seo_pages_intel_captured
  ON public.competitor_seo_pages(intelligence_id, captured_at DESC);

ALTER TABLE public.competitor_seo_pages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_seo_pages'
      AND policyname = 'competitor_seo_pages_select'
  ) THEN
    CREATE POLICY competitor_seo_pages_select ON public.competitor_seo_pages
      FOR SELECT
      USING (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_seo_pages'
      AND policyname = 'competitor_seo_pages_insert'
  ) THEN
    CREATE POLICY competitor_seo_pages_insert ON public.competitor_seo_pages
      FOR INSERT
      WITH CHECK (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_seo_pages'
      AND policyname = 'competitor_seo_pages_update'
  ) THEN
    CREATE POLICY competitor_seo_pages_update ON public.competitor_seo_pages
      FOR UPDATE
      USING (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_seo_pages'
      AND policyname = 'competitor_seo_pages_delete'
  ) THEN
    CREATE POLICY competitor_seo_pages_delete ON public.competitor_seo_pages
      FOR DELETE
      USING (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;
END $$;

COMMENT ON TABLE public.competitor_seo_pages IS
  'Top páginas del competidor por tráfico estimado.';


-- ============================================================
-- 6. competitor_social_metrics
-- ============================================================
CREATE TABLE IF NOT EXISTS public.competitor_social_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intelligence_id UUID NOT NULL REFERENCES public.competitor_intelligence(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  handle TEXT,
  followers INT,
  following INT,
  posts_count INT,
  avg_engagement_rate NUMERIC,
  posts_per_month INT,
  top_posts JSONB,
  top_hashtags TEXT[] NOT NULL DEFAULT '{}',
  bio TEXT,
  captured_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT competitor_social_platform_chk
    CHECK (platform IN ('instagram', 'tiktok', 'youtube', 'facebook', 'linkedin', 'twitter'))
);

CREATE INDEX IF NOT EXISTS idx_competitor_social_intel_captured
  ON public.competitor_social_metrics(intelligence_id, captured_at DESC);

ALTER TABLE public.competitor_social_metrics ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_social_metrics'
      AND policyname = 'competitor_social_select'
  ) THEN
    CREATE POLICY competitor_social_select ON public.competitor_social_metrics
      FOR SELECT
      USING (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_social_metrics'
      AND policyname = 'competitor_social_insert'
  ) THEN
    CREATE POLICY competitor_social_insert ON public.competitor_social_metrics
      FOR INSERT
      WITH CHECK (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_social_metrics'
      AND policyname = 'competitor_social_update'
  ) THEN
    CREATE POLICY competitor_social_update ON public.competitor_social_metrics
      FOR UPDATE
      USING (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_social_metrics'
      AND policyname = 'competitor_social_delete'
  ) THEN
    CREATE POLICY competitor_social_delete ON public.competitor_social_metrics
      FOR DELETE
      USING (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;
END $$;

COMMENT ON TABLE public.competitor_social_metrics IS
  'Métricas social por plataforma. Una fila por (intelligence_id × platform × snapshot).';


-- ============================================================
-- 7. competitor_catalog
-- ============================================================
CREATE TABLE IF NOT EXISTS public.competitor_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intelligence_id UUID NOT NULL REFERENCES public.competitor_intelligence(id) ON DELETE CASCADE,
  product_name TEXT,
  product_url TEXT,
  price_cents INT,
  compare_price_cents INT,
  currency TEXT NOT NULL DEFAULT 'CLP',
  image_url TEXT,
  variants_count INT,
  in_stock BOOLEAN,
  is_bestseller BOOLEAN NOT NULL DEFAULT FALSE,
  tags TEXT[] NOT NULL DEFAULT '{}',
  raw_data JSONB,
  captured_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitor_catalog_intel_captured
  ON public.competitor_catalog(intelligence_id, captured_at DESC);

ALTER TABLE public.competitor_catalog ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_catalog'
      AND policyname = 'competitor_catalog_select'
  ) THEN
    CREATE POLICY competitor_catalog_select ON public.competitor_catalog
      FOR SELECT
      USING (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_catalog'
      AND policyname = 'competitor_catalog_insert'
  ) THEN
    CREATE POLICY competitor_catalog_insert ON public.competitor_catalog
      FOR INSERT
      WITH CHECK (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_catalog'
      AND policyname = 'competitor_catalog_update'
  ) THEN
    CREATE POLICY competitor_catalog_update ON public.competitor_catalog
      FOR UPDATE
      USING (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_catalog'
      AND policyname = 'competitor_catalog_delete'
  ) THEN
    CREATE POLICY competitor_catalog_delete ON public.competitor_catalog
      FOR DELETE
      USING (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;
END $$;

COMMENT ON TABLE public.competitor_catalog IS
  'Productos detectados en el catálogo del competidor. Una fila por (producto × snapshot).';


-- ============================================================
-- 8. competitor_reviews
-- ============================================================
CREATE TABLE IF NOT EXISTS public.competitor_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intelligence_id UUID NOT NULL REFERENCES public.competitor_intelligence(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  total_reviews INT,
  avg_rating NUMERIC,
  distribution JSONB,
  top_positive_words TEXT[] NOT NULL DEFAULT '{}',
  top_negative_words TEXT[] NOT NULL DEFAULT '{}',
  recurring_complaints TEXT[] NOT NULL DEFAULT '{}',
  recent_reviews_sample JSONB,
  captured_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT competitor_reviews_source_chk
    CHECK (source IN ('trustpilot', 'google', 'app_store', 'play_store', 'site'))
);

CREATE INDEX IF NOT EXISTS idx_competitor_reviews_intel_captured
  ON public.competitor_reviews(intelligence_id, captured_at DESC);

ALTER TABLE public.competitor_reviews ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_reviews'
      AND policyname = 'competitor_reviews_select'
  ) THEN
    CREATE POLICY competitor_reviews_select ON public.competitor_reviews
      FOR SELECT
      USING (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_reviews'
      AND policyname = 'competitor_reviews_insert'
  ) THEN
    CREATE POLICY competitor_reviews_insert ON public.competitor_reviews
      FOR INSERT
      WITH CHECK (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_reviews'
      AND policyname = 'competitor_reviews_update'
  ) THEN
    CREATE POLICY competitor_reviews_update ON public.competitor_reviews
      FOR UPDATE
      USING (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_reviews'
      AND policyname = 'competitor_reviews_delete'
  ) THEN
    CREATE POLICY competitor_reviews_delete ON public.competitor_reviews
      FOR DELETE
      USING (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;
END $$;

COMMENT ON TABLE public.competitor_reviews IS
  'Reviews agregadas por fuente (trustpilot/google/app_store/play_store/site).';


-- ============================================================
-- 9. competitor_email_marketing
-- ============================================================
CREATE TABLE IF NOT EXISTS public.competitor_email_marketing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intelligence_id UUID NOT NULL REFERENCES public.competitor_intelligence(id) ON DELETE CASCADE,
  subscribed_email TEXT,
  subscribed_at TIMESTAMP WITH TIME ZONE,
  welcome_series JSONB,
  campaign_frequency_per_week NUMERIC,
  captured_emails_count INT,
  avg_subject_length INT,
  top_hooks TEXT[] NOT NULL DEFAULT '{}',
  design_analysis JSONB,
  last_email_received_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitor_email_intel_created
  ON public.competitor_email_marketing(intelligence_id, created_at DESC);

ALTER TABLE public.competitor_email_marketing ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_email_marketing'
      AND policyname = 'competitor_email_select'
  ) THEN
    CREATE POLICY competitor_email_select ON public.competitor_email_marketing
      FOR SELECT
      USING (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_email_marketing'
      AND policyname = 'competitor_email_insert'
  ) THEN
    CREATE POLICY competitor_email_insert ON public.competitor_email_marketing
      FOR INSERT
      WITH CHECK (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_email_marketing'
      AND policyname = 'competitor_email_update'
  ) THEN
    CREATE POLICY competitor_email_update ON public.competitor_email_marketing
      FOR UPDATE
      USING (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_email_marketing'
      AND policyname = 'competitor_email_delete'
  ) THEN
    CREATE POLICY competitor_email_delete ON public.competitor_email_marketing
      FOR DELETE
      USING (
        intelligence_id IN (
          SELECT id FROM public.competitor_intelligence
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;
END $$;

COMMENT ON TABLE public.competitor_email_marketing IS
  'Estado captura email spy: email subscrito, frecuencia, hooks, design analysis.';


-- ============================================================
-- 10. competitor_scorecards
-- ============================================================
CREATE TABLE IF NOT EXISTS public.competitor_scorecards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  scorecard_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  insights JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitor_scorecards_client_created
  ON public.competitor_scorecards(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_competitor_scorecards_client_generated
  ON public.competitor_scorecards(client_id, generated_at DESC);

ALTER TABLE public.competitor_scorecards ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_scorecards'
      AND policyname = 'competitor_scorecards_select'
  ) THEN
    CREATE POLICY competitor_scorecards_select ON public.competitor_scorecards
      FOR SELECT
      USING (
        client_id IN (
          SELECT id FROM public.clients
          WHERE user_id = auth.uid() OR client_user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_scorecards'
      AND policyname = 'competitor_scorecards_insert'
  ) THEN
    CREATE POLICY competitor_scorecards_insert ON public.competitor_scorecards
      FOR INSERT
      WITH CHECK (
        client_id IN (
          SELECT id FROM public.clients
          WHERE user_id = auth.uid() OR client_user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_scorecards'
      AND policyname = 'competitor_scorecards_update'
  ) THEN
    CREATE POLICY competitor_scorecards_update ON public.competitor_scorecards
      FOR UPDATE
      USING (
        client_id IN (
          SELECT id FROM public.clients
          WHERE user_id = auth.uid() OR client_user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_scorecards'
      AND policyname = 'competitor_scorecards_delete'
  ) THEN
    CREATE POLICY competitor_scorecards_delete ON public.competitor_scorecards
      FOR DELETE
      USING (
        client_id IN (
          SELECT id FROM public.clients
          WHERE user_id = auth.uid() OR client_user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;
END $$;

COMMENT ON TABLE public.competitor_scorecards IS
  'Output Opus: snapshot por análisis. scorecard_data = tabla cliente vs competidores. insights = top 10 insights.';


-- ============================================================
-- 11. competitor_action_plans
-- ============================================================
CREATE TABLE IF NOT EXISTS public.competitor_action_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scorecard_id UUID NOT NULL REFERENCES public.competitor_scorecards(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  action_title TEXT NOT NULL,
  action_description TEXT,
  priority INT,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT competitor_action_plans_period_chk
    CHECK (period IN ('30d', '60d', '90d')),
  CONSTRAINT competitor_action_plans_status_chk
    CHECK (status IN ('pending', 'in_progress', 'done'))
);

CREATE INDEX IF NOT EXISTS idx_competitor_action_plans_scorecard_created
  ON public.competitor_action_plans(scorecard_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_competitor_action_plans_status
  ON public.competitor_action_plans(status)
  WHERE status IN ('pending', 'in_progress');

ALTER TABLE public.competitor_action_plans ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_action_plans'
      AND policyname = 'competitor_action_plans_select'
  ) THEN
    CREATE POLICY competitor_action_plans_select ON public.competitor_action_plans
      FOR SELECT
      USING (
        scorecard_id IN (
          SELECT id FROM public.competitor_scorecards
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_action_plans'
      AND policyname = 'competitor_action_plans_insert'
  ) THEN
    CREATE POLICY competitor_action_plans_insert ON public.competitor_action_plans
      FOR INSERT
      WITH CHECK (
        scorecard_id IN (
          SELECT id FROM public.competitor_scorecards
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_action_plans'
      AND policyname = 'competitor_action_plans_update'
  ) THEN
    CREATE POLICY competitor_action_plans_update ON public.competitor_action_plans
      FOR UPDATE
      USING (
        scorecard_id IN (
          SELECT id FROM public.competitor_scorecards
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'competitor_action_plans'
      AND policyname = 'competitor_action_plans_delete'
  ) THEN
    CREATE POLICY competitor_action_plans_delete ON public.competitor_action_plans
      FOR DELETE
      USING (
        scorecard_id IN (
          SELECT id FROM public.competitor_scorecards
          WHERE client_id IN (
            SELECT id FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;
END $$;

COMMENT ON TABLE public.competitor_action_plans IS
  'Output Opus: plan 30/60/90. Una fila por acción. Linkeable a tasks.id.';


-- ============================================================
-- updated_at trigger function (compartida)
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_competitor_intel_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'competitor_intelligence',
      'competitor_paid_ads',
      'competitor_seo_keywords',
      'competitor_seo_backlinks',
      'competitor_seo_pages',
      'competitor_social_metrics',
      'competitor_catalog',
      'competitor_reviews',
      'competitor_email_marketing',
      'competitor_scorecards',
      'competitor_action_plans'
    ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I;', t, t
    );
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.set_competitor_intel_updated_at();',
       t, t
    );
  END LOOP;
END $$;
