-- Mini CRM Pipeline: Meeting fields for wa_prospects
-- Enables Steve to schedule meetings, send reminders, and track meeting lifecycle.

ALTER TABLE wa_prospects
  ADD COLUMN IF NOT EXISTS apellido TEXT,
  ADD COLUMN IF NOT EXISTS meeting_url TEXT,
  ADD COLUMN IF NOT EXISTS meeting_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS meeting_status TEXT DEFAULT 'none'
    CHECK (meeting_status IN ('none','proposed','scheduled','reminded_24h','reminded_2h','confirmed','cancelled','no_show','completed')),
  ADD COLUMN IF NOT EXISTS meeting_notes TEXT,
  ADD COLUMN IF NOT EXISTS reminder_24h_sent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reminder_2h_sent BOOLEAN DEFAULT FALSE;

-- Index for cron queries: find scheduled meetings needing reminders
CREATE INDEX IF NOT EXISTS idx_wa_prospects_meeting_cron
  ON wa_prospects (meeting_status, meeting_at)
  WHERE meeting_status IN ('scheduled', 'reminded_24h', 'reminded_2h')
    AND meeting_at IS NOT NULL;
