-- Knowledge Propagation: conectar steve_knowledge con CRITERIO, ESPEJO y JUEZ

-- Tracking de propagación en steve_knowledge
ALTER TABLE steve_knowledge
  ADD COLUMN IF NOT EXISTS propagated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS propagated_to TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS visual_relevant BOOLEAN DEFAULT false;

-- Preguntas golden suplementarias para JUEZ
CREATE TABLE IF NOT EXISTS juez_golden_questions (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  question TEXT NOT NULL,
  expected_behavior TEXT NOT NULL,
  source_knowledge_id UUID REFERENCES steve_knowledge(id),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: service_role only
ALTER TABLE juez_golden_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "juez_golden_questions_service_role"
  ON juez_golden_questions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Tracking de origen en criterio_rules
ALTER TABLE criterio_rules
  ADD COLUMN IF NOT EXISTS source_knowledge_id UUID,
  ADD COLUMN IF NOT EXISTS propagated_from TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_knowledge_not_propagated
  ON steve_knowledge(propagated_at)
  WHERE approval_status = 'approved' AND propagated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_juez_golden_active
  ON juez_golden_questions(active)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_knowledge_visual
  ON steve_knowledge(visual_relevant)
  WHERE visual_relevant = true;
