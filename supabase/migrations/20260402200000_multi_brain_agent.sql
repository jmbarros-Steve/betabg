-- Steve Depredador: Multi-Brain Agent columns on wa_prospects
-- Adds investigation data, mockup tracking, wolf findings, and learning extraction flags

ALTER TABLE wa_prospects ADD COLUMN IF NOT EXISTS investigation_data JSONB;
ALTER TABLE wa_prospects ADD COLUMN IF NOT EXISTS mockup_sent BOOLEAN DEFAULT false;
ALTER TABLE wa_prospects ADD COLUMN IF NOT EXISTS mockup_url TEXT;
ALTER TABLE wa_prospects ADD COLUMN IF NOT EXISTS wolf_findings JSONB;
ALTER TABLE wa_prospects ADD COLUMN IF NOT EXISTS wolf_checked_at TIMESTAMPTZ;
ALTER TABLE wa_prospects ADD COLUMN IF NOT EXISTS learning_extracted BOOLEAN DEFAULT false;
ALTER TABLE wa_prospects ADD COLUMN IF NOT EXISTS strategist_history JSONB DEFAULT '[]';

-- Indexes for cron queries
CREATE INDEX IF NOT EXISTS idx_wa_prospects_wolf_findings
  ON wa_prospects USING GIN (wolf_findings) WHERE wolf_findings IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wa_prospects_learning_pending
  ON wa_prospects (stage) WHERE learning_extracted = false AND stage IN ('converted', 'lost');

CREATE INDEX IF NOT EXISTS idx_wa_prospects_investigation
  ON wa_prospects USING GIN (investigation_data) WHERE investigation_data IS NOT NULL;
