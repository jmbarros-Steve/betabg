-- Mejora 6: Versionado de reglas

CREATE TABLE IF NOT EXISTS steve_knowledge_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  knowledge_id UUID NOT NULL REFERENCES steve_knowledge(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  contenido TEXT NOT NULL,
  categoria TEXT NOT NULL,
  orden INTEGER,
  version_number INTEGER NOT NULL,
  changed_by TEXT,
  change_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_kv_kid ON steve_knowledge_versions(knowledge_id, version_number DESC);

ALTER TABLE steve_knowledge_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_versions" ON steve_knowledge_versions FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

ALTER TABLE steve_knowledge ADD COLUMN IF NOT EXISTS version_number INTEGER DEFAULT 1;
