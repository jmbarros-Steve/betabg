-- Swarm preferred sources: authors, channels, blogs, newsletters
-- The swarm prioritizes searching these sources for research questions

CREATE TABLE IF NOT EXISTS swarm_sources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,              -- "Sabri Suby", "HubSpot Blog"
  url TEXT NOT NULL,               -- "https://youtube.com/@SabriSuby"
  category TEXT NOT NULL,          -- "meta_ads", "klaviyo", "shopify", etc.
  active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,        -- last time the swarm used this source
  hits INTEGER DEFAULT 0,          -- how many times it generated useful insights
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE swarm_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "swarm_sources_service_role" ON swarm_sources
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Index for swarm queries filtering by active + category
CREATE INDEX idx_swarm_sources_active_category ON swarm_sources(category) WHERE active = true;
