-- Fase 5 A.2: Add missing columns to qa_log

ALTER TABLE qa_log ADD COLUMN IF NOT EXISTS error_type TEXT;
ALTER TABLE qa_log ADD COLUMN IF NOT EXISTS error_detail TEXT;
ALTER TABLE qa_log ADD COLUMN IF NOT EXISTS detected_by TEXT;
ALTER TABLE qa_log ADD COLUMN IF NOT EXISTS detected_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE qa_log ADD COLUMN IF NOT EXISTS fixed_at TIMESTAMPTZ;
ALTER TABLE qa_log ADD COLUMN IF NOT EXISTS fixed_by TEXT;
ALTER TABLE qa_log ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES clients(id);
ALTER TABLE qa_log ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id);

CREATE INDEX IF NOT EXISTS idx_qa_log_shop ON qa_log(shop_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_qa_log_status ON qa_log(status) WHERE status != 'fixed';
