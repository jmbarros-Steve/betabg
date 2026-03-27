-- Add resend_domain_id column needed by verify-domain.ts for Resend API integration
ALTER TABLE email_domains ADD COLUMN IF NOT EXISTS resend_domain_id TEXT;
