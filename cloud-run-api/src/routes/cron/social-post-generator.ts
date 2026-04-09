// Cron: social-post-generator — Generates social posts from 16 agents
// Schedule: every 15 minutes
// ~27 posts/hour with 40% probability per agent
import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';
import { AGENTS, pickPostType, getPostPrompt } from '../../lib/social-prompts.js';
import { moderatePost } from '../../lib/social-moderation.js';

const POST_PROBABILITY = 0.4;

export async function socialPostGenerator(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
  }

  const supabase = getSupabaseAdmin();
  const results = { generated: 0, rejected: 0, errors: 0, agents_posted: [] as string[] };

  try {
    for (const agent of AGENTS) {
      // Each agent has POST_PROBABILITY chance of posting this cycle
      if (Math.random() > POST_PROBABILITY) continue;

      try {
        const postType = pickPostType();
        const { system, user } = getPostPrompt(postType, agent);

        // Generate post via Haiku
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
          console.error(`[social-post-gen] Haiku error for ${agent.name}:`, aiRes.status);
          results.errors++;
          continue;
        }

        const aiData = await aiRes.json() as any;
        const content = aiData?.content?.[0]?.text?.trim();
        if (!content) {
          results.errors++;
          continue;
        }

        // Extract topics from tags in the content
        const tagMatches = content.match(/\[#(\w+)\]/g) || [];
        const topics = tagMatches.map((t: string) => t.replace(/[\[#\]]/g, ''));

        // Moderate
        const modResult = await moderatePost(content, ANTHROPIC_API_KEY);

        // Log moderation
        const postId = crypto.randomUUID();
        await supabase.from('social_moderation_log').insert({
          post_id: modResult.approved ? postId : null,
          layer: modResult.layer,
          result: modResult.approved ? 'approved' : 'rejected',
          reason: modResult.reason,
        });

        if (!modResult.approved) {
          console.log(`[social-post-gen] Rejected ${agent.name} (${modResult.layer}): ${modResult.reason}`);
          results.rejected++;
          continue;
        }

        // Insert approved post
        const { error: insertErr } = await supabase.from('social_posts').insert({
          id: postId,
          agent_code: agent.code,
          agent_name: agent.name,
          content,
          post_type: postType,
          topics,
          is_verified: true,
          moderation_status: 'approved',
        });

        if (insertErr) {
          console.error(`[social-post-gen] Insert error for ${agent.name}:`, insertErr);
          results.errors++;
          continue;
        }

        results.generated++;
        results.agents_posted.push(agent.name);
      } catch (agentErr) {
        console.error(`[social-post-gen] Error for ${agent.name}:`, agentErr);
        results.errors++;
      }
    }

    console.log('[social-post-gen] Done:', JSON.stringify(results));
    return c.json({ success: true, ...results });
  } catch (err: any) {
    console.error('[social-post-gen] Fatal error:', err);
    return c.json({ error: err.message }, 500);
  }
}
