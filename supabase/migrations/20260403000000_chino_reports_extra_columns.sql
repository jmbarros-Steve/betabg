-- Add columns that runner.ts expects but migration 20260402950000 didn't create
ALTER TABLE chino_reports ADD COLUMN IF NOT EXISTS check_description TEXT;
ALTER TABLE chino_reports ADD COLUMN IF NOT EXISTS check_type TEXT;
ALTER TABLE chino_reports ADD COLUMN IF NOT EXISTS platform TEXT;
ALTER TABLE chino_reports ADD COLUMN IF NOT EXISTS severity TEXT;
ALTER TABLE chino_reports ADD COLUMN IF NOT EXISTS merchant_id TEXT;
ALTER TABLE chino_reports ADD COLUMN IF NOT EXISTS merchant_name TEXT;

-- Make check_id nullable — runner inserts reports without FK when check has no UUID context
ALTER TABLE chino_reports ALTER COLUMN check_id DROP NOT NULL;
