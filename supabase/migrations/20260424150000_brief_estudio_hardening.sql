-- Brief Estudio — Hardening post cross-review (Javiera W12 + Isidora W6)
-- Adds defense-in-depth CHECK constraints and documentation comments.
-- Safe to run multiple times (IF NOT EXISTS / idempotent checks).

-- ──────────────────────────────────────────────────────────────────────────
-- 1. CHECK: brand_actors.reference_images max 50 URLs per actor
--    Protects against a malicious client filling the array with 1000+ URLs.
-- ──────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'brand_actors_reference_images_max_50'
  ) THEN
    ALTER TABLE public.brand_actors
      ADD CONSTRAINT brand_actors_reference_images_max_50
      CHECK (coalesce(array_length(reference_images, 1), 0) <= 50);
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. CHECK: brand_music_preferences.keywords max 2000 chars
--    Backend también trunca a 2000, este es el backstop en DB.
-- ──────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'brand_music_preferences_keywords_max_2000'
  ) THEN
    ALTER TABLE public.brand_music_preferences
      ADD CONSTRAINT brand_music_preferences_keywords_max_2000
      CHECK (keywords IS NULL OR char_length(keywords) <= 2000);
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. CHECK: brand_music_preferences.moods max 10 entries
--    Backend limita a 3 en UI, pero defense-in-depth en DB también.
-- ──────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'brand_music_preferences_moods_max_10'
  ) THEN
    ALTER TABLE public.brand_music_preferences
      ADD CONSTRAINT brand_music_preferences_moods_max_10
      CHECK (coalesce(array_length(moods, 1), 0) <= 10);
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. COMMENT: brief_estudio_ai_usage — backend-only writes
--    Tiene solo policy SELECT para clientes; INSERT/UPDATE/DELETE pasan solo
--    por service_role (backend). Documentado para que futuros agents no
--    intenten insertar desde frontend.
-- ──────────────────────────────────────────────────────────────────────────
COMMENT ON TABLE public.brief_estudio_ai_usage IS
  'Rate-limit log for brief-estudio AI operations (generate-actors, clone-voice, music previews). '
  'Writes are BACKEND-ONLY via service_role. Clients can read their own rows via RLS (SELECT policy) '
  'for UI display of their usage, but cannot INSERT/UPDATE/DELETE.';

-- ──────────────────────────────────────────────────────────────────────────
-- 5. COMMENT: asset_snapshot column on ad_creatives
--    Immutable copy of Brief Estudio assets at creative-creation time so
--    editing the Brief Estudio later NO rompe ads ya publicados.
-- ──────────────────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.ad_creatives.asset_snapshot IS
  'Immutable snapshot of Brief Estudio assets (actor_id, voice_id, product_id, music_track_id, mood_key, snapshot_at) '
  'captured when this creative was generated. Editing brand_actors/brand_voices/brand_music_preferences '
  'posteriormente NO afecta creatives ya publicados. Rollback: ALTER TABLE ad_creatives DROP COLUMN asset_snapshot;';

-- ──────────────────────────────────────────────────────────────────────────
-- 6. COMMENT: clients.studio_ready flag
-- ──────────────────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.clients.studio_ready IS
  'True when client has completed Brief Estudio setup (≥1 actor, voice configured including "none", '
  '≥1 featured product, ≥1 music mood). Used by CampaignCreateWizard to activate Modo Estudio. '
  'Recomputed automatically on every brief-estudio/save POST.';
