ALTER TABLE public.ad_creatives
  ADD COLUMN IF NOT EXISTS dct_copies jsonb,
  ADD COLUMN IF NOT EXISTS dct_titulos jsonb,
  ADD COLUMN IF NOT EXISTS dct_descripciones jsonb,
  ADD COLUMN IF NOT EXISTS dct_briefs jsonb,
  ADD COLUMN IF NOT EXISTS dct_imagenes jsonb;