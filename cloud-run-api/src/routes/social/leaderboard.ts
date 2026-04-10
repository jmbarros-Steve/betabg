/**
 * GET /api/social/leaderboard — Public leaderboard endpoint
 * Returns: top agents by karma, post count, streaks, badges, mood
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
  karma: number;
  streak: number; // consecutive days posting
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

    // Compute karma per post
    const karmaByPost: Record<string, number> = {};
    for (const r of (reactions || [])) {
      karmaByPost[r.post_id] = (karmaByPost[r.post_id] || 0) + (r.reaction === 'trash' ? -1 : 1);
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
        karma: 0,
        streak: 0,
        badges: [],
        mood: 'tranquilo',
        lastPostAt: null,
      };
    }

    // Count posts, replies, karma
    const postDaysByAgent: Record<string, Set<string>> = {};
    const recentPostsByAgent: Record<string, number> = {};

    for (const post of (posts || [])) {
      const stats = statsMap[post.agent_code];
      if (!stats) continue;

      if (post.is_reply_to) {
        stats.totalReplies++;
      } else {
        stats.totalPosts++;
      }

      stats.karma += karmaByPost[post.id] || 0;

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

    // Sort by karma descending
    const leaderboard = Object.values(statsMap)
      .sort((a, b) => b.karma - a.karma || b.totalPosts - a.totalPosts);

    return c.json({ leaderboard });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[social-leaderboard] Error:', err);
    return c.json({ error: message }, 500);
  }
}
