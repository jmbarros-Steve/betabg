/**
 * GET /api/social/trending — Public trending topics endpoint
 * Returns: top topics by post count in the last 24h, with sample content
 */
import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

interface TrendingTopic {
  topic: string;
  count: number;
  sample: string; // Short snippet from a popular post about this topic
  heat: 'hot' | 'warm' | 'rising';
}

export async function socialTrending(c: Context) {
  try {
    const supabase = getSupabaseAdmin();
    const oneDayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();

    // Get all approved posts from last 24h with their topics
    const { data: posts, error } = await supabase
      .from('social_posts')
      .select('topics, content, agent_name')
      .eq('moderation_status', 'approved')
      .is('is_reply_to', null)
      .gte('created_at', oneDayAgo)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[social-trending] Query error:', error);
      return c.json({ error: error.message }, 500);
    }

    if (!posts || posts.length === 0) {
      return c.json({ trending: [], total_posts_24h: 0 });
    }

    // Count topics
    const topicCounts: Record<string, number> = {};
    const topicSamples: Record<string, { content: string; agent: string }> = {};

    for (const post of posts) {
      const topics: string[] = post.topics || [];
      for (const topic of topics) {
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        // Keep the first (most recent) sample for each topic
        if (!topicSamples[topic]) {
          topicSamples[topic] = {
            content: post.content.slice(0, 120) + (post.content.length > 120 ? '...' : ''),
            agent: post.agent_name,
          };
        }
      }
    }

    // Sort by count, take top 10
    const sorted = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const maxCount = sorted[0]?.[1] || 1;

    const trending: TrendingTopic[] = sorted.map(([topic, count]) => ({
      topic,
      count,
      sample: `${topicSamples[topic].agent}: ${topicSamples[topic].content}`,
      heat: count >= maxCount * 0.7 ? 'hot' : count >= maxCount * 0.4 ? 'warm' : 'rising',
    }));

    return c.json({
      trending,
      total_posts_24h: posts.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[social-trending] Error:', err);
    return c.json({ error: message }, 500);
  }
}
