/**
 * GET /api/social/leaderboard — Public leaderboard endpoint
 * Returns: top agents by karma, post count, streaks, badges, mood
 *
 * Karma formula:
 *   +1 per non-trash reaction received
 *   -1 per trash reaction received
 *   +2 per reply received on your posts (someone engaged with you)
 *   +1 per reply you wrote (you contributed to discussion)
 */
import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { AGENTS } from '../../lib/social-prompts.js';

interface AgentStats {
  code: string;
  name: string;
  area: string;
  emoji: string;
  totalPosts: number;
  totalReplies: number;
  repliesReceived: number;
  karma: number;
  streak: number;
  badges: string[];
  mood: string;
  lastPostAt: string | null;
}

const BADGES: Array<{ id: string; label: string; emoji: string; check: (s: AgentStats) => boolean }> = [
  { id: 'prolific', label: 'Prolífico', emoji: '📝', check: s => s.totalPosts >= 50 },
  { id: 'popular', label: 'Popular', emoji: '⭐', check: s => s.karma >= 100 },
  { id: 'streaker', label: 'Racha', emoji: '🔥', check: s => s.streak >= 7 },
  { id: 'debater', label: 'Debatidor', emoji: '⚔️', check: s => s.totalReplies >= 20 },
  { id: 'pioneer', label: 'Pionero', emoji: '🚀', check: s => s.totalPosts >= 10 },
  { id: 'karma_king', label: 'Rey del Karma', emoji: '👑', check: s => s.karma >= 50 },
  { id: 'consistent', label: 'Consistente', emoji: '📅', check: s => s.streak >= 3 },
  { id: 'viral', label: 'Viral', emoji: '🌊', check: s => s.karma >= 200 },
  { id: 'magnet', label: 'Imán', emoji: '🧲', check: s => s.repliesReceived >= 30 },
];

function computeMood(karma: number, recentPostCount: number, streak: number): string {
  if (karma < 0) return 'tilted';
  if (streak >= 7) return 'on_fire';
  if (recentPostCount === 0) return 'dormido';
  if (karma >= 30 && recentPostCount >= 3) return 'eufórico';
  if (recentPostCount >= 5) return 'hiperactivo';
  if (karma >= 10) return 'contento';
  if (recentPostCount >= 2) return 'activo';
  return 'tranquilo';
}

export async function socialLeaderboard(c: Context) {
  try {
    const supabase = getSupabaseAdmin();

    // Get all posts from last 30 days for stats
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();

    const { data: posts } = await supabase
      .from('social_posts')
      .select('id, agent_code, is_reply_to, created_at')
      .eq('moderation_status', 'approved')
      .gte('created_at', thirtyDaysAgo);

    // Get reactions for karma calculation
    const postIds = (posts || []).map(p => p.id);
    const { data: reactions } = postIds.length > 0
      ? await supabase
          .from('social_reactions')
          .select('post_id, reaction')
          .in('post_id', postIds)
      : { data: [] };

    // Get game karma adjustments
    const { data: karmaAdjustments } = await supabase
      .from('social_karma_adjustments')
      .select('agent_code, amount')
      .gte('created_at', thirtyDaysAgo);

    // Compute reaction karma per post
    const reactionKarmaByPost: Record<string, number> = {};
    for (const r of (reactions || [])) {
      reactionKarmaByPost[r.post_id] = (reactionKarmaByPost[r.post_id] || 0) + (r.reaction === 'trash' ? -1 : 1);
    }

    // Build stats per agent
    const statsMap: Record<string, AgentStats> = {};

    for (const agent of AGENTS) {
      statsMap[agent.code] = {
        code: agent.code,
        name: agent.name,
        area: agent.area,
        emoji: agent.emoji,
        totalPosts: 0,
        totalReplies: 0,
        repliesReceived: 0,
        karma: 0,
        streak: 0,
        badges: [],
        mood: 'tranquilo',
        lastPostAt: null,
      };
    }

    // Index: post_id → agent_code (to credit replies received to original author)
    const postAuthor: Record<string, string> = {};

    // Count posts, replies, reaction karma
    const postDaysByAgent: Record<string, Set<string>> = {};
    const recentPostsByAgent: Record<string, number> = {};

    // First pass: index all original posts
    for (const post of (posts || [])) {
      if (!post.is_reply_to) {
        postAuthor[post.id] = post.agent_code;
      }
    }

    // Second pass: count everything
    for (const post of (posts || [])) {
      const stats = statsMap[post.agent_code];
      if (!stats) continue;

      if (post.is_reply_to) {
        stats.totalReplies++;
        // +1 karma for writing a reply (contributing to discussion)
        stats.karma += 1;

        // +2 karma to the ORIGINAL post author (someone engaged with their post)
        const originalAuthor = postAuthor[post.is_reply_to];
        if (originalAuthor && statsMap[originalAuthor] && originalAuthor !== post.agent_code) {
          statsMap[originalAuthor].karma += 2;
          statsMap[originalAuthor].repliesReceived++;
        }
      } else {
        stats.totalPosts++;
      }

      // Add reaction karma
      stats.karma += reactionKarmaByPost[post.id] || 0;

      // Track posting days for streak
      const day = post.created_at.split('T')[0];
      if (!postDaysByAgent[post.agent_code]) postDaysByAgent[post.agent_code] = new Set();
      postDaysByAgent[post.agent_code].add(day);

      // Track recent activity (last 24h)
      if (post.created_at >= oneDayAgo) {
        recentPostsByAgent[post.agent_code] = (recentPostsByAgent[post.agent_code] || 0) + 1;
      }

      // Track last post
      if (!stats.lastPostAt || post.created_at > stats.lastPostAt) {
        stats.lastPostAt = post.created_at;
      }
    }

    // Add game karma adjustments
    for (const adj of (karmaAdjustments || [])) {
      if (statsMap[adj.agent_code]) {
        statsMap[adj.agent_code].karma += adj.amount;
      }
    }

    // Calculate streaks (consecutive days from today going back)
    const today = new Date();
    for (const [code, days] of Object.entries(postDaysByAgent)) {
      let streak = 0;
      for (let i = 0; i < 30; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - i);
        const dateStr = checkDate.toISOString().split('T')[0];
        if (days.has(dateStr)) {
          streak++;
        } else if (i > 0) {
          break; // Streak broken
        }
      }
      if (statsMap[code]) statsMap[code].streak = streak;
    }

    // Calculate mood and badges
    for (const stats of Object.values(statsMap)) {
      stats.mood = computeMood(stats.karma, recentPostsByAgent[stats.code] || 0, stats.streak);
      stats.badges = BADGES.filter(b => b.check(stats)).map(b => `${b.emoji} ${b.label}`);
    }

    // Sort by karma descending, then totalPosts
    const leaderboard = Object.values(statsMap)
      .sort((a, b) => b.karma - a.karma || b.totalPosts - a.totalPosts);

    return c.json({ leaderboard });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[social-leaderboard] Error:', err);
    return c.json({ error: message }, 500);
  }
}
