-- Mejora 2: Feedback loop - tracking de uso de reglas

-- Columna para trackear qué reglas se usaron en cada creativo
ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS rules_applied UUID[];
CREATE INDEX IF NOT EXISTS idx_creative_history_rules ON creative_history USING GIN(rules_applied) WHERE rules_applied IS NOT NULL;

-- Función para incrementar uso (fire-and-forget desde app)
CREATE OR REPLACE FUNCTION increment_knowledge_usage(rule_ids UUID[]) RETURNS void AS $$
  UPDATE steve_knowledge SET veces_usada = COALESCE(veces_usada, 0) + 1, ultima_vez_usada = now() WHERE id = ANY(rule_ids);
$$ LANGUAGE sql SECURITY DEFINER;
