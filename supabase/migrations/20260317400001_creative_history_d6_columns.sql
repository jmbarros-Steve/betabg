-- D.6: Additional columns for creative_history loop cerrado
-- Stores copy text, entity references, scores from Criterio/Espejo

ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS copy_text TEXT;
ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS entity_type TEXT;        -- 'meta_copy' | 'meta_campaign' | 'email_campaign'
ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS entity_id TEXT;
ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS product_name TEXT;
ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS criterio_score NUMERIC;
ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS espejo_score NUMERIC;
ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS sent_count INTEGER;
ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS image_url TEXT;
