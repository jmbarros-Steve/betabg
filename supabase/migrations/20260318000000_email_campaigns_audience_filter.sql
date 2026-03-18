-- Fix: add audience_filter column that was in the original migration
-- but not applied to remote DB due to migration history mismatch.
-- Column is used by manage-campaigns.ts for email audience segmentation.
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS audience_filter JSONB DEFAULT '{}';
