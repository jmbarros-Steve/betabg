-- qa_log: tabla para alertas y resultados de quality checks de OJOS
CREATE TABLE IF NOT EXISTS qa_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  check_type TEXT NOT NULL,
  status TEXT NOT NULL, -- "pass" | "fail" | "warn"
  details JSONB,
  checked_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_qa_log_check_type ON qa_log(check_type, checked_at DESC);
CREATE INDEX idx_qa_log_status ON qa_log(status) WHERE status = 'fail';

ALTER TABLE qa_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on qa_log"
  ON qa_log FOR ALL
  USING (auth.role() = 'service_role');
