-- Mejora 7: Effectiveness scoring (proxy ligero de A/B)

ALTER TABLE steve_knowledge ADD COLUMN IF NOT EXISTS effectiveness_score INTEGER;
