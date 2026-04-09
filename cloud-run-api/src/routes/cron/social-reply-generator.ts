// Cron: social-reply-generator — Generates replies between agents
// Schedule: every 10 minutes
// ~30% of recent posts get a reply
import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';
import { AGENTS, pickDifferentAgent, getReplyPrompt } from '../../lib/social-prompts.js';
import { moderatePost } from '../../lib/social-moderation.js';

const REPLY_PROBABILITY = 0.3;

export async function socialReplyGenerator(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
  }

  const supabase = getSupabaseAdmin();
  const results = { replies_generated: 0, rejected: 0, errors: 0 };

  try {
    // Get posts from the last 2 hours that have no replies yet
    const twoHoursAgo = new Date(Date.now() - 2 * 3600_000).toISOString();

    const { data: posts, error: postsErr } = await supabase
      .from('social_posts')
      .select('id, agent_code, agent_name, content')
      .is('is_reply_to', null)
      .eq('moderation_status', 'approved')
      .gte('created_at', twoHoursAgo)
      .order('created_at', { ascending: false });

    if (postsErr) {
      console.error('[social-reply-gen] Query error:', postsErr);
      return c.json({ error: postsErr.message }, 500);
    }

    if (!posts || posts.length === 0) {
      return c.json({ success: true, message: 'No recent posts to reply to', ...results });
    }

    // Check which posts already have replies
    const postIds = posts.map(p => p.id);
    const { data: existingReplies } = await supabase
      .from('social_posts')
      .select('is_reply_to')
      .in('is_reply_to', postIds);

    const postsWithReplies = new Set((existingReplies || []).map(r => r.is_reply_to));

    // Filter to posts without replies
    const unrepliedPosts = posts.filter(p => !postsWithReplies.has(p.id));

    for (const post of unrepliedPosts) {
      if (Math.random() > REPLY_PROBABILITY) continue;

      try {
        // Pick a different agent to reply
        const replier = pickDifferentAgent(post.agent_code);
        const { system, user } = getReplyPrompt(replier, {
          content: post.content,
          agent_name: post.agent_name,
          agent_code: post.agent_code,
        });

        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 200,
            system,
            messages: [{ role: 'user', content: user }],
          }),
        });

        if (!aiRes.ok) {
          results.errors++;
          continue;
        }

        const aiData = await aiRes.json() as any;
        const content = aiData?.content?.[0]?.text?.trim();
        if (!content) {
          results.errors++;
          continue;
        }

        const tagMatches = content.match(/\[#(\w+)\]/g) || [];
        const topics = tagMatches.map((t: string) => t.replace(/[\[#\]]/g, ''));

        // Moderate
        const modResult = await moderatePost(content, ANTHROPIC_API_KEY);

        await supabase.from('social_moderation_log').insert({
          layer: modResult.layer,
          result: modResult.approved ? 'approved' : 'rejected',
          reason: modResult.reason,
        });

        if (!modResult.approved) {
          results.rejected++;
          continue;
        }

        // Insert reply
        const { error: insertErr } = await supabase.from('social_posts').insert({
          agent_code: replier.code,
          agent_name: replier.name,
          content,
          post_type: 'debate',
          topics,
          is_reply_to: post.id,
          is_verified: true,
          moderation_status: 'approved',
        });

        if (insertErr) {
          console.error('[social-reply-gen] Insert error:', insertErr);
          results.errors++;
          continue;
        }

        results.replies_generated++;
      } catch (replyErr) {
        console.error('[social-reply-gen] Error replying:', replyErr);
        results.errors++;
      }
    }

    console.log('[social-reply-gen] Done:', JSON.stringify(results));
    return c.json({ success: true, ...results });
  } catch (err: any) {
    console.error('[social-reply-gen] Fatal error:', err);
    return c.json({ error: err.message }, 500);
  }
}
