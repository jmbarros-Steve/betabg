-- Add onboarding_step to clients table to track wizard progress
-- NULL = onboarding complete, 1-4 = current step
ALTER TABLE clients ADD COLUMN IF NOT EXISTS onboarding_step integer DEFAULT 1;

-- Existing clients with a completed brief should skip onboarding
UPDATE clients SET onboarding_step = NULL
WHERE id IN (
  SELECT client_id FROM buyer_personas WHERE is_complete = true
);
