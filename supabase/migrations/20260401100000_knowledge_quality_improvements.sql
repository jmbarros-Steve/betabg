-- =============================================
-- Knowledge Quality Improvements
-- 1. New table: creative_analyses (separate from rules)
-- 2. New columns on steve_knowledge: industria, veces_usada, ultima_vez_usada, ejemplo_real, merged_from
-- =============================================

-- 1. Create creative_analyses table
CREATE TABLE IF NOT EXISTS creative_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  contenido TEXT NOT NULL,
  categoria TEXT DEFAULT 'anuncios',
  original_knowledge_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE creative_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on creative_analyses" ON creative_analyses FOR ALL USING (true);

-- 2. Add new columns to steve_knowledge
ALTER TABLE steve_knowledge ADD COLUMN IF NOT EXISTS industria TEXT DEFAULT 'general';
ALTER TABLE steve_knowledge ADD COLUMN IF NOT EXISTS veces_usada INTEGER DEFAULT 0;
ALTER TABLE steve_knowledge ADD COLUMN IF NOT EXISTS ultima_vez_usada TIMESTAMPTZ;
ALTER TABLE steve_knowledge ADD COLUMN IF NOT EXISTS ejemplo_real TEXT;
ALTER TABLE steve_knowledge ADD COLUMN IF NOT EXISTS merged_from TEXT[];

-- 3. Move creative analyses out of steve_knowledge
INSERT INTO creative_analyses (titulo, contenido, categoria, original_knowledge_id)
SELECT titulo, contenido, categoria, id
FROM steve_knowledge
WHERE titulo LIKE 'Análisis %' AND categoria = 'anuncios';

-- 4. Deactivate moved analyses in steve_knowledge
UPDATE steve_knowledge SET activo = false
WHERE titulo LIKE 'Análisis %' AND categoria = 'anuncios';

-- 5. Index for performance
CREATE INDEX IF NOT EXISTS idx_steve_knowledge_industria ON steve_knowledge(industria);
CREATE INDEX IF NOT EXISTS idx_steve_knowledge_veces_usada ON steve_knowledge(veces_usada);
CREATE INDEX IF NOT EXISTS idx_creative_analyses_categoria ON creative_analyses(categoria);
