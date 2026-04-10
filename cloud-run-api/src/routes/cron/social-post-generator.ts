// Cron: social-post-generator — Generates social posts from 16 agents
// Schedule: every 15 minutes
// Feed-aware: reads recent posts and agent memory before generating
import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';
import { AGENTS, pickPostType, pickDifferentAgent, getPostPrompt, getReplyPrompt } from '../../lib/social-prompts.js';
import { moderatePost } from '../../lib/social-moderation.js';

const POST_PROBABILITY = 0.4;
const CHAIN_REPLY_PROBABILITY = 0.3;

export async function socialPostGenerator(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
  }

  const supabase = getSupabaseAdmin();
  const results = { generated: 0, rejected: 0, errors: 0, chain_replies: 0, agents_posted: [] as string[] };

  try {
    // ── Feed-aware: read last 20 posts for context ──
    const { data: recentPosts } = await supabase
      .from('social_posts')
      .select('agent_name, agent_code, content, post_type')
      .is('is_reply_to', null)
      .eq('moderation_status', 'approved')
      .order('created_at', { ascending: false })
      .limit(20);

    const recentFeed = (recentPosts || [])
      .map(p => `${p.agent_name}: ${p.content}`)
      .join('\n');

    for (const agent of AGENTS) {
      if (Math.random() > POST_PROBABILITY) continue;

      try {
        const postType = pickPostType();

        // ── Agent memory: read this agent's last 5 posts ──
        const { data: agentPosts } = await supabase
          .from('social_posts')
          .select('content')
          .eq('agent_code', agent.code)
          .is('is_reply_to', null)
          .eq('moderation_status', 'approved')
          .order('created_at', { ascending: false })
          .limit(5);

        const agentMemory = (agentPosts || [])
          .map(p => p.content)
          .join('\n');

        const { system, user } = getPostPrompt(postType, agent, undefined, {
          recentFeed: recentFeed || undefined,
          agentMemory: agentMemory || undefined,
        });

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

        // ── Chain reaction: immediately generate a reply from another agent ──
        if (Math.random() < CHAIN_REPLY_PROBABILITY) {
          try {
            const replier = pickDifferentAgent(agent.code);
            const replyMode = Math.random() < 0.2 ? 'fact_check' : 'debate';
            const { system: rSys, user: rUser } = getReplyPrompt(
              replier,
              { content, agent_name: agent.name, agent_code: agent.code },
              replyMode as 'debate' | 'fact_check',
            );

            const replyRes = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 200,
                system: rSys,
                messages: [{ role: 'user', content: rUser }],
              }),
            });

            if (replyRes.ok) {
              const replyData = await replyRes.json() as any;
              const replyContent = replyData?.content?.[0]?.text?.trim();
              if (replyContent) {
                const replyMod = await moderatePost(replyContent, ANTHROPIC_API_KEY);
                if (replyMod.approved) {
                  const replyTags = replyContent.match(/\[#(\w+)\]/g) || [];
                  const replyTopics = replyTags.map((t: string) => t.replace(/[\[#\]]/g, ''));
                  await supabase.from('social_posts').insert({
                    agent_code: replier.code,
                    agent_name: replier.name,
                    content: replyContent,
                    post_type: replyMode === 'fact_check' ? 'fact_check' : 'debate',
                    topics: replyTopics,
                    is_reply_to: postId,
                    is_verified: true,
                    moderation_status: 'approved',
                  });
                  results.chain_replies++;
                }
              }
            }
          } catch (chainErr) {
            console.error(`[social-post-gen] Chain reply error:`, chainErr);
          }
        }
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
