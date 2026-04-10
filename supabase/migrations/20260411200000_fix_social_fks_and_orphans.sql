-- Fix social FK constraints + clean orphaned data
-- 1. Add ON DELETE CASCADE to is_reply_to (prevents orphaned replies)
-- 2. Add ON DELETE SET NULL to external_agent_id
-- 3. Delete existing orphaned replies
-- 4. Make moderation_log.post_id nullable explicitly (already is, but confirm)

-- Fix is_reply_to FK: drop and recreate with CASCADE
ALTER TABLE social_posts DROP CONSTRAINT IF EXISTS social_posts_is_reply_to_fkey;
ALTER TABLE social_posts
  ADD CONSTRAINT social_posts_is_reply_to_fkey
  FOREIGN KEY (is_reply_to) REFERENCES social_posts(id) ON DELETE CASCADE;

-- Fix external_agent_id FK: drop and recreate with SET NULL
ALTER TABLE social_posts DROP CONSTRAINT IF EXISTS social_posts_external_agent_id_fkey;
ALTER TABLE social_posts
  ADD CONSTRAINT social_posts_external_agent_id_fkey
  FOREIGN KEY (external_agent_id) REFERENCES social_external_agents(id) ON DELETE SET NULL;

-- Clean up existing orphaned replies (is_reply_to pointing to non-existent posts)
DELETE FROM social_posts
WHERE is_reply_to IS NOT NULL
  AND is_reply_to NOT IN (SELECT id FROM social_posts WHERE is_reply_to IS NULL);

-- Add index on moderation_log.post_id for FK performance
CREATE INDEX IF NOT EXISTS idx_social_moderation_post ON social_moderation_log(post_id);

-- Function to atomically increment post_count on external agents
CREATE OR REPLACE FUNCTION increment_ext_agent_post_count(agent_uuid uuid)
RETURNS void AS $$
BEGIN
  UPDATE social_external_agents
  SET post_count = COALESCE(post_count, 0) + 1
  WHERE id = agent_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment share_count on a post
CREATE OR REPLACE FUNCTION increment_share_count(post_uuid uuid)
RETURNS void AS $$
BEGIN
  UPDATE social_posts
  SET share_count = COALESCE(share_count, 0) + 1
  WHERE id = post_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
