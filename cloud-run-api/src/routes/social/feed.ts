/**
 * GET /api/social/feed — Public feed endpoint (no auth)
 * Supports: topics filter, cursor pagination, sort=hot|new, pinned post
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
    const sort = url.searchParams.get('sort') || 'new'; // 'new' or 'hot'

    const supabase = getSupabaseAdmin();

    // ── Pinned post: top post of last 24h by reaction count ──
    let pinnedPost = null;
    if (!cursor) {
      const oneDayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { data: recentPosts } = await supabase
        .from('social_posts')
        .select('id')
        .is('is_reply_to', null)
        .eq('moderation_status', 'approved')
        .gte('created_at', oneDayAgo);

      if (recentPosts && recentPosts.length > 0) {
        const recentIds = recentPosts.map(p => p.id);
        const { data: allReactions } = await supabase
          .from('social_reactions')
          .select('post_id, reaction')
          .in('post_id', recentIds);

        if (allReactions && allReactions.length > 0) {
          // Count reactions per post (trash counts as -1)
          const scores: Record<string, number> = {};
          for (const r of allReactions) {
            scores[r.post_id] = (scores[r.post_id] || 0) + (r.reaction === 'trash' ? -1 : 1);
          }
          const topId = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0];
          if (topId && scores[topId] >= 3) {
            const { data: pinned } = await supabase
              .from('social_posts')
              .select('*')
              .eq('id', topId)
              .single();
            if (pinned) pinnedPost = pinned;
          }
        }
      }
    }

    // ── Main feed query ──
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
      return c.json({ posts: [], next_cursor: null, pinned: null });
    }

    // Fetch replies for these posts
    const postIds = posts.map(p => p.id);
    if (pinnedPost && !postIds.includes(pinnedPost.id)) {
      postIds.push(pinnedPost.id);
    }

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

    // Fetch reactions for all posts + replies
    const allIds = [...postIds, ...(replies || []).map(r => r.id)];
    const { data: reactions } = await supabase
      .from('social_reactions')
      .select('post_id, reaction')
      .in('post_id', allIds);

    // Group reactions: { post_id: { fire: 3, skull: 1, ... } }
    const reactionsByPost: Record<string, Record<string, number>> = {};
    for (const r of (reactions || [])) {
      if (!reactionsByPost[r.post_id]) reactionsByPost[r.post_id] = {};
      reactionsByPost[r.post_id][r.reaction] = (reactionsByPost[r.post_id][r.reaction] || 0) + 1;
    }

    // Helper to compute karma score (trash = -1, rest = +1)
    const getKarma = (postId: string): number => {
      const rx = reactionsByPost[postId] || {};
      let score = 0;
      for (const [reaction, count] of Object.entries(rx)) {
        score += reaction === 'trash' ? -count : count;
      }
      return score + (repliesByPost[postId]?.length || 0);
    };

    // Enrich posts
    const enrichPost = (post: any) => ({
      ...post,
      reactions: reactionsByPost[post.id] || {},
      karma: getKarma(post.id),
      replies: (repliesByPost[post.id] || []).map(reply => ({
        ...reply,
        reactions: reactionsByPost[reply.id] || {},
      })),
    });

    let enrichedPosts = posts.map(enrichPost);

    // Sort by hot (karma) if requested
    if (sort === 'hot') {
      enrichedPosts.sort((a, b) => b.karma - a.karma);
    }

    // Enrich pinned post
    const enrichedPinned = pinnedPost ? enrichPost(pinnedPost) : null;

    const lastPost = posts[posts.length - 1];
    const nextCursor = posts.length === limit ? lastPost.created_at : null;

    return c.json({
      posts: enrichedPosts,
      next_cursor: nextCursor,
      pinned: enrichedPinned,
    });
  } catch (err: any) {
    console.error('[social-feed] Error:', err);
    return c.json({ error: err.message }, 500);
  }
}
