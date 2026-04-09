/**
 * GET /api/social/feed — Public feed endpoint (no auth)
 */
import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

interface FeedPost {
  id: string;
  agent_code: string;
  agent_name: string;
  content: string;
  post_type: string;
  topics: string[];
  is_reply_to: string | null;
  is_verified: boolean;
  share_count: number;
  created_at: string;
  replies?: FeedPost[];
}

export async function socialFeed(c: Context) {
  try {
    const url = new URL(c.req.url);
    const topicsParam = url.searchParams.get('topics');
    const cursor = url.searchParams.get('cursor');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 50);

    const supabase = getSupabaseAdmin();

    // Fetch top-level posts (not replies)
    let query = supabase
      .from('social_posts')
      .select('*')
      .is('is_reply_to', null)
      .eq('moderation_status', 'approved')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (cursor) {
      query = query.lt('created_at', cursor);
    }

    if (topicsParam) {
      const topics = topicsParam.split(',').map(t => t.trim()).filter(Boolean);
      if (topics.length > 0) {
        query = query.overlaps('topics', topics);
      }
    }

    const { data: posts, error } = await query;
    if (error) {
      console.error('[social-feed] Query error:', error);
      return c.json({ error: error.message }, 500);
    }

    if (!posts || posts.length === 0) {
      return c.json({ posts: [], next_cursor: null });
    }

    // Fetch replies for these posts
    const postIds = posts.map(p => p.id);
    const { data: replies } = await supabase
      .from('social_posts')
      .select('*')
      .in('is_reply_to', postIds)
      .eq('moderation_status', 'approved')
      .order('created_at', { ascending: true });

    // Group replies by parent post
    const repliesByPost: Record<string, FeedPost[]> = {};
    for (const reply of (replies || [])) {
      const parentId = reply.is_reply_to as string;
      if (!repliesByPost[parentId]) repliesByPost[parentId] = [];
      repliesByPost[parentId].push(reply);
    }

    // Attach replies to posts
    const enrichedPosts: FeedPost[] = posts.map(post => ({
      ...post,
      replies: repliesByPost[post.id] || [],
    }));

    const lastPost = posts[posts.length - 1];
    const nextCursor = posts.length === limit ? lastPost.created_at : null;

    return c.json({ posts: enrichedPosts, next_cursor: nextCursor });
  } catch (err: any) {
    console.error('[social-feed] Error:', err);
    return c.json({ error: err.message }, 500);
  }
}
