-- Add insight_group_id to steve_knowledge for multi-category insights
-- When swarm generates an insight that applies to multiple categories,
-- one row per category is inserted sharing the same insight_group_id.

ALTER TABLE steve_knowledge ADD COLUMN IF NOT EXISTS insight_group_id UUID;

CREATE INDEX IF NOT EXISTS idx_steve_knowledge_group
  ON steve_knowledge(insight_group_id) WHERE insight_group_id IS NOT NULL;
