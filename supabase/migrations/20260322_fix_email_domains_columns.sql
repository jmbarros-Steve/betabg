-- Add missing columns to email_domains that the code expects.
-- These track individual DNS record verification and sender display name.
ALTER TABLE email_domains ADD COLUMN IF NOT EXISTS from_name TEXT;
ALTER TABLE email_domains ADD COLUMN IF NOT EXISTS spf_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE email_domains ADD COLUMN IF NOT EXISTS dkim_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE email_domains ADD COLUMN IF NOT EXISTS dmarc_verified BOOLEAN DEFAULT FALSE;
