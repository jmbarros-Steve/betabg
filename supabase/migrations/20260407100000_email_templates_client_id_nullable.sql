-- Allow NULL client_id in email_templates for global/system templates
-- System templates (client_id IS NULL) are visible to all clients
-- NOTE: This migration is optional — the seed now uses a valid client_id placeholder.
-- Apply when you want to support truly ownerless system templates.

-- ALTER TABLE email_templates ALTER COLUMN client_id DROP NOT NULL;
-- Commented out: run manually via Supabase Dashboard SQL editor if needed.
