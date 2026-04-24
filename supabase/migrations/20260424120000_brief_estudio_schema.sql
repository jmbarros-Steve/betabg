-- Brief Estudio — Etapa 1: schema base
-- Unifica actores IA, voces clonadas, productos destacados de Shopify y
-- preferencias musicales por cuenta (clients). Estas tablas alimentan el
-- estudio creativo de Steve Ads (video, reels, imagen) con los activos que
-- el cliente aprobó en la fase de brief. Ningun endpoint persiste aquí sin
-- ownership por client_id.

-- ============================================================================
-- 1) brand_actors — actores/personas visuales de la marca
-- ============================================================================
CREATE TABLE IF NOT EXISTS brand_actors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('ai_generated', 'user_upload', 'real_model')),
  name text,
  reference_images text[] NOT NULL DEFAULT '{}',
  persona_tags text[] NOT NULL DEFAULT '{}',
  is_primary boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2) brand_voices — voces clonadas (XTTS) o presets elegidos
-- ============================================================================
CREATE TABLE IF NOT EXISTS brand_voices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('xtts_cloned', 'preset', 'none')),
  voice_id text,
  sample_url text,
  preset_key text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 3) brand_featured_products — selección curada de productos Shopify del cliente
-- ============================================================================
CREATE TABLE IF NOT EXISTS brand_featured_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  shopify_product_id text NOT NULL,
  is_featured boolean NOT NULL DEFAULT true,
  priority int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, shopify_product_id)
);

-- ============================================================================
-- 4) brand_music_preferences — moods y keywords por cliente (1:1)
-- ============================================================================
CREATE TABLE IF NOT EXISTS brand_music_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  moods text[] NOT NULL DEFAULT '{}',
  keywords text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 5) clients.studio_ready — flag que marca brief estudio completo
-- ============================================================================
ALTER TABLE clients ADD COLUMN IF NOT EXISTS studio_ready boolean NOT NULL DEFAULT false;

-- ============================================================================
-- 6) Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_brand_actors_client
  ON brand_actors (client_id, is_primary DESC, sort_order);

CREATE INDEX IF NOT EXISTS idx_brand_voices_client
  ON brand_voices (client_id, is_primary DESC);

CREATE INDEX IF NOT EXISTS idx_brand_featured_products_client
  ON brand_featured_products (client_id)
  WHERE is_featured = true;

-- ============================================================================
-- 7) RLS — misma convención que el resto del proyecto:
--    super_admin pasa siempre; sino, el client_id debe pertenecer al user.
--    Helper `is_super_admin(auth.uid())` ya existe en el schema.
-- ============================================================================
ALTER TABLE brand_actors ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_voices ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_featured_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_music_preferences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- brand_actors
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'brand_actors_select_owner' AND tablename = 'brand_actors') THEN
    CREATE POLICY brand_actors_select_owner ON brand_actors
      FOR SELECT USING (
        is_super_admin(auth.uid()) OR
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid())
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'brand_actors_insert_owner' AND tablename = 'brand_actors') THEN
    CREATE POLICY brand_actors_insert_owner ON brand_actors
      FOR INSERT WITH CHECK (
        is_super_admin(auth.uid()) OR
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid())
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'brand_actors_update_owner' AND tablename = 'brand_actors') THEN
    CREATE POLICY brand_actors_update_owner ON brand_actors
      FOR UPDATE USING (
        is_super_admin(auth.uid()) OR
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid())
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'brand_actors_delete_owner' AND tablename = 'brand_actors') THEN
    CREATE POLICY brand_actors_delete_owner ON brand_actors
      FOR DELETE USING (
        is_super_admin(auth.uid()) OR
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid())
      );
  END IF;

  -- brand_voices
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'brand_voices_select_owner' AND tablename = 'brand_voices') THEN
    CREATE POLICY brand_voices_select_owner ON brand_voices
      FOR SELECT USING (
        is_super_admin(auth.uid()) OR
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid())
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'brand_voices_insert_owner' AND tablename = 'brand_voices') THEN
    CREATE POLICY brand_voices_insert_owner ON brand_voices
      FOR INSERT WITH CHECK (
        is_super_admin(auth.uid()) OR
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid())
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'brand_voices_update_owner' AND tablename = 'brand_voices') THEN
    CREATE POLICY brand_voices_update_owner ON brand_voices
      FOR UPDATE USING (
        is_super_admin(auth.uid()) OR
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid())
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'brand_voices_delete_owner' AND tablename = 'brand_voices') THEN
    CREATE POLICY brand_voices_delete_owner ON brand_voices
      FOR DELETE USING (
        is_super_admin(auth.uid()) OR
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid())
      );
  END IF;

  -- brand_featured_products
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'brand_featured_products_select_owner' AND tablename = 'brand_featured_products') THEN
    CREATE POLICY brand_featured_products_select_owner ON brand_featured_products
      FOR SELECT USING (
        is_super_admin(auth.uid()) OR
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid())
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'brand_featured_products_insert_owner' AND tablename = 'brand_featured_products') THEN
    CREATE POLICY brand_featured_products_insert_owner ON brand_featured_products
      FOR INSERT WITH CHECK (
        is_super_admin(auth.uid()) OR
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid())
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'brand_featured_products_update_owner' AND tablename = 'brand_featured_products') THEN
    CREATE POLICY brand_featured_products_update_owner ON brand_featured_products
      FOR UPDATE USING (
        is_super_admin(auth.uid()) OR
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid())
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'brand_featured_products_delete_owner' AND tablename = 'brand_featured_products') THEN
    CREATE POLICY brand_featured_products_delete_owner ON brand_featured_products
      FOR DELETE USING (
        is_super_admin(auth.uid()) OR
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid())
      );
  END IF;

  -- brand_music_preferences
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'brand_music_preferences_select_owner' AND tablename = 'brand_music_preferences') THEN
    CREATE POLICY brand_music_preferences_select_owner ON brand_music_preferences
      FOR SELECT USING (
        is_super_admin(auth.uid()) OR
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid())
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'brand_music_preferences_insert_owner' AND tablename = 'brand_music_preferences') THEN
    CREATE POLICY brand_music_preferences_insert_owner ON brand_music_preferences
      FOR INSERT WITH CHECK (
        is_super_admin(auth.uid()) OR
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid())
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'brand_music_preferences_update_owner' AND tablename = 'brand_music_preferences') THEN
    CREATE POLICY brand_music_preferences_update_owner ON brand_music_preferences
      FOR UPDATE USING (
        is_super_admin(auth.uid()) OR
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid())
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'brand_music_preferences_delete_owner' AND tablename = 'brand_music_preferences') THEN
    CREATE POLICY brand_music_preferences_delete_owner ON brand_music_preferences
      FOR DELETE USING (
        is_super_admin(auth.uid()) OR
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid())
      );
  END IF;
END $$;

-- ============================================================================
-- 8) Trigger updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_brief_estudio_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_brand_actors_updated_at ON brand_actors;
CREATE TRIGGER trg_brand_actors_updated_at
  BEFORE UPDATE ON brand_actors
  FOR EACH ROW EXECUTE FUNCTION update_brief_estudio_updated_at();

DROP TRIGGER IF EXISTS trg_brand_voices_updated_at ON brand_voices;
CREATE TRIGGER trg_brand_voices_updated_at
  BEFORE UPDATE ON brand_voices
  FOR EACH ROW EXECUTE FUNCTION update_brief_estudio_updated_at();

DROP TRIGGER IF EXISTS trg_brand_music_preferences_updated_at ON brand_music_preferences;
CREATE TRIGGER trg_brand_music_preferences_updated_at
  BEFORE UPDATE ON brand_music_preferences
  FOR EACH ROW EXECUTE FUNCTION update_brief_estudio_updated_at();

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON TABLE brand_actors IS 'Brief Estudio — actores visuales de la marca (IA, uploads, modelos reales)';
COMMENT ON TABLE brand_voices IS 'Brief Estudio — voces clonadas XTTS o presets por cliente';
COMMENT ON TABLE brand_featured_products IS 'Brief Estudio — productos Shopify destacados para creatividades';
COMMENT ON TABLE brand_music_preferences IS 'Brief Estudio — moods + keywords de música por cliente';
COMMENT ON COLUMN clients.studio_ready IS 'true cuando el Brief Estudio (actores+voz+producto+musica) está completo';
