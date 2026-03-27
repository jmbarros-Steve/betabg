-- Steve Perro Lobo: Add follow-up, email nurture, audit columns to wa_prospects
ALTER TABLE wa_prospects
  ADD COLUMN IF NOT EXISTS followup_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_followup_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS insights_sent INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_insight_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resurrection_sent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_sequence_step INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_email_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS audit_data JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lost_reason TEXT;
