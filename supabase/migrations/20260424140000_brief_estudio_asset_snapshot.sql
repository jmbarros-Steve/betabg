-- Brief Estudio — Etapa 5: asset_snapshot en ad_creatives
-- Guarda una foto inmutable de los assets del Brief Estudio al momento de
-- crear el creative, para que el cliente pueda editar el Brief Estudio sin
-- romper anuncios ya publicados.
--
-- Shape esperado:
-- {
--   "actor_id": "uuid",
--   "actor_reference_image": "https://...",
--   "voice_id": "xtts_prediction_id",
--   "voice_source": "xtts_cloned" | "preset" | "none",
--   "product_id": "shopify_product_id",
--   "music_track_id": "warm_acoustic_morning",
--   "mood_key": "warm",
--   "snapshot_at": "2026-04-24T15:00:00Z"
-- }

ALTER TABLE public.ad_creatives
  ADD COLUMN IF NOT EXISTS asset_snapshot JSONB;

COMMENT ON COLUMN public.ad_creatives.asset_snapshot IS
  'Brief Estudio — snapshot inmutable de actor/voz/producto/música usados en la generación. Evita que editar el Brief rompa ads publicados.';
