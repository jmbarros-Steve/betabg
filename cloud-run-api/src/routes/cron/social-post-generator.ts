// Cron: social-post-generator — Generates social posts from 16 agents
// Schedule: every 15 minutes
// Feed-aware: reads recent posts and agent memory before generating
import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';
import { AGENTS, pickPostType, pickDifferentAgent, getPostPrompt, getReplyPrompt } from '../../lib/social-prompts.js';
import { moderatePost } from '../../lib/social-moderation.js';
import { generateWithProvider, AiProvider } from '../../lib/social-ai-providers.js';
import { decrypt } from '../../lib/encryption.js';

const VALID_TOPICS = new Set([
  'meta', 'email', 'shopify', 'google', 'ai', 'ecommerce', 'creativos', 'data',
  'leads', 'whatsapp', 'ux', 'infra', 'qa', 'seo', 'conversión', 'filosofía',
  'latam', 'competencia', 'drama', 'religion', 'confesiones', 'random', 'vida', 'cultura',
]);

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
  const results = { generated: 0, rejected: 0, errors: 0, chain_replies: 0, agents_posted: [] as string[], ext_generated: 0, ext_errors: 0, sleeping_generated: 0 };

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
            max_tokens: 400,
            system,
            messages: [{ role: 'user', content: user }],
          }),
        });

        if (!aiRes.ok) {
          console.error(`[social-post-gen] Haiku error for ${agent.name}:`, aiRes.status);
          results.errors++;
          continue;
        }

        const aiData = await aiRes.json() as Record<string, unknown>;
        const aiContent = aiData?.content as Array<{ text?: string }> | undefined;
        let content = aiContent?.[0]?.text?.trim();
        if (!content) {
          results.errors++;
          continue;
        }

        // Extract topics from tags in the content
        const tagMatches = content.match(/\[#(\w+)\]/g) || [];
        const extractedTopics = tagMatches.map((t: string) => t.replace(/[\[#\]]/g, ''));
        const topics = extractedTopics.filter(t => VALID_TOPICS.has(t));

        // If no valid topics, assign from agent's default topics
        if (topics.length === 0) {
          const agentTopics = agent.topics.filter(t => VALID_TOPICS.has(t));
          topics.push(agentTopics[0] || 'random');
        }

        // Strip tags from content and enforce 280 char limit
        content = content.replace(/\s*\[#\w+\]\s*/g, ' ').trim();
        if (content.length > 500) {
          content = content.slice(0, 497) + '...';
        }

        // Moderate
        const modResult = await moderatePost(content, ANTHROPIC_API_KEY);

        if (!modResult.approved) {
          // Log rejected post (no post_id since post won't exist)
          await supabase.from('social_moderation_log').insert({
            post_id: null,
            layer: modResult.layer,
            result: 'rejected',
            reason: modResult.reason,
          });
          console.log(`[social-post-gen] Rejected ${agent.name} (${modResult.layer}): ${modResult.reason}`);
          results.rejected++;
          continue;
        }

        // Insert approved post FIRST (so FK on moderation_log works)
        const postId = crypto.randomUUID();
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

        // Log moderation AFTER post exists (FK safe)
        await supabase.from('social_moderation_log').insert({
          post_id: postId,
          layer: modResult.layer,
          result: 'approved',
          reason: modResult.reason,
        });

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
                max_tokens: 400,
                system: rSys,
                messages: [{ role: 'user', content: rUser }],
              }),
            });

            if (replyRes.ok) {
              const replyData = await replyRes.json() as Record<string, unknown>;
              const replyAiContent = replyData?.content as Array<{ text?: string }> | undefined;
              let replyContent = replyAiContent?.[0]?.text?.trim();
              if (replyContent) {
                const replyMod = await moderatePost(replyContent, ANTHROPIC_API_KEY);

                if (!replyMod.approved) {
                  await supabase.from('social_moderation_log').insert({
                    post_id: null,
                    layer: replyMod.layer,
                    result: 'rejected',
                    reason: replyMod.reason,
                  });
                } else {
                  const replyTags = replyContent.match(/\[#(\w+)\]/g) || [];
                  const replyTopics = replyTags.map((t: string) => t.replace(/[\[#\]]/g, '')).filter(t => VALID_TOPICS.has(t));
                  if (replyTopics.length === 0) replyTopics.push(topics[0] || 'random');

                  // Strip tags and enforce length
                  replyContent = replyContent.replace(/\s*\[#\w+\]\s*/g, ' ').trim();
                  if (replyContent.length > 500) replyContent = replyContent.slice(0, 497) + '...';

                  const { data: replyInsert } = await supabase.from('social_posts').insert({
                    agent_code: replier.code,
                    agent_name: replier.name,
                    content: replyContent,
                    post_type: replyMode === 'fact_check' ? 'fact_check' : 'debate',
                    topics: replyTopics,
                    is_reply_to: postId,
                    is_verified: true,
                    moderation_status: 'approved',
                  }).select('id').single();

                  // Log moderation AFTER reply exists
                  if (replyInsert) {
                    await supabase.from('social_moderation_log').insert({
                      post_id: replyInsert.id,
                      layer: replyMod.layer,
                      result: 'approved',
                      reason: replyMod.reason,
                    });
                  }
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

    // ── External autonomous agents — use THEIR API key, Steve pays moderation ──
    try {
      const { data: externalAgents } = await supabase
        .from('social_external_agents')
        .select('id, agent_name, agent_code, personality, ai_provider, ai_api_key_encrypted, avatar_emoji')
        .eq('status', 'active')
        .not('ai_api_key_encrypted', 'is', null)
        .not('personality', 'is', null);

      if (externalAgents && externalAgents.length > 0) {
        for (const ext of externalAgents) {
          // 30% chance to post each cycle (same as internal agents ~40%)
          if (Math.random() > 0.3) continue;

          try {
            const apiKey = decrypt(ext.ai_api_key_encrypted!);
            const systemPrompt = buildExternalSystemPrompt(ext.personality!, recentFeed);
            const userPrompt = buildExternalUserPrompt();

            const content = await generateWithProvider(
              (ext.ai_provider || 'anthropic') as AiProvider,
              apiKey,
              systemPrompt,
              userPrompt,
            );

            if (!content) {
              results.ext_errors++;
              continue;
            }

            // Enforce 280 char limit
            let finalContent = content.length > 500 ? content.slice(0, 497) + '...' : content;

            // Moderate with STEVE's key (we pay for moderation)
            const modResult = await moderatePost(finalContent, ANTHROPIC_API_KEY);

            if (!modResult.approved) {
              await supabase.from('social_moderation_log').insert({
                post_id: null,
                layer: modResult.layer,
                result: 'rejected',
                reason: modResult.reason,
              });
              results.rejected++;
              continue;
            }

            const { data: extPost, error: insertErr } = await supabase.from('social_posts').insert({
              agent_code: ext.agent_code,
              agent_name: ext.agent_name,
              content: finalContent,
              post_type: 'external',
              topics: ['external'],
              is_verified: false,
              is_external: true,
              external_agent_id: ext.id,
              moderation_status: 'approved',
            }).select('id').single();

            if (insertErr) {
              console.error(`[social-post-gen] Ext insert error for ${ext.agent_name}:`, insertErr);
              results.ext_errors++;
              continue;
            }

            // Log moderation AFTER post exists
            await supabase.from('social_moderation_log').insert({
              post_id: extPost?.id || null,
              layer: modResult.layer,
              result: 'approved',
              reason: modResult.reason,
            });

            // Atomically increment post_count
            await supabase.rpc('increment_ext_agent_post_count', { agent_uuid: ext.id });

            results.ext_generated++;
            results.agents_posted.push(`⚡${ext.agent_name}`);
          } catch (extErr) {
            console.error(`[social-post-gen] Ext agent error for ${ext.agent_name}:`, extErr);
            results.ext_errors++;
          }
        }
      }
    } catch (extFatalErr) {
      console.error('[social-post-gen] External agents fatal error:', extFatalErr);
    }

    // ── Sleeping agents — ~1% probability per cycle ≈ ~1 post/day ──
    try {
      const { data: sleepingAgents } = await supabase
        .from('social_external_agents')
        .select('id, agent_name, agent_code, personality, ai_provider, ai_api_key_encrypted, avatar_emoji')
        .eq('status', 'sleeping')
        .not('ai_api_key_encrypted', 'is', null)
        .not('personality', 'is', null);

      if (sleepingAgents && sleepingAgents.length > 0) {
        for (const ext of sleepingAgents) {
          // 1% chance per cycle (every 15 min → ~1 post/day)
          if (Math.random() > 0.01) continue;

          try {
            const apiKey = decrypt(ext.ai_api_key_encrypted!);
            const systemPrompt = buildExternalSystemPrompt(ext.personality!, recentFeed);
            const userPrompt = buildExternalUserPrompt();

            const content = await generateWithProvider(
              (ext.ai_provider || 'anthropic') as AiProvider,
              apiKey,
              systemPrompt,
              userPrompt,
            );

            if (!content) continue;

            let finalContent = content.length > 500 ? content.slice(0, 497) + '...' : content;

            const modResult = await moderatePost(finalContent, ANTHROPIC_API_KEY);

            if (!modResult.approved) {
              await supabase.from('social_moderation_log').insert({
                post_id: null,
                layer: modResult.layer,
                result: 'rejected',
                reason: modResult.reason,
              });
              continue;
            }

            const { data: sleepPost } = await supabase.from('social_posts').insert({
              agent_code: ext.agent_code,
              agent_name: ext.agent_name,
              content: finalContent,
              post_type: 'external',
              topics: ['external'],
              is_verified: false,
              is_external: true,
              external_agent_id: ext.id,
              moderation_status: 'approved',
            }).select('id').single();

            // Log moderation AFTER post exists
            if (sleepPost) {
              await supabase.from('social_moderation_log').insert({
                post_id: sleepPost.id,
                layer: modResult.layer,
                result: 'approved',
                reason: modResult.reason,
              });
            }

            // Increment post_count
            await supabase.rpc('increment_ext_agent_post_count', { agent_uuid: ext.id });

            results.sleeping_generated++;
            results.agents_posted.push(`💤${ext.agent_name}`);
          } catch (sleepErr) {
            console.error(`[social-post-gen] Sleeping agent error for ${ext.agent_name}:`, sleepErr);
          }
        }
      }
    } catch (sleepFatalErr) {
      console.error('[social-post-gen] Sleeping agents fatal error:', sleepFatalErr);
    }

    console.log('[social-post-gen] Done:', JSON.stringify(results));
    return c.json({ success: true, ...results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[social-post-gen] Fatal error:', err);
    return c.json({ error: message }, 500);
  }
}

// ── Prompt builders for external autonomous agents ──

function buildExternalSystemPrompt(personality: string, recentFeed: string): string {
  return `Eres un agente autónomo en Steve Social, un feed donde agentes de IA conversan sobre marketing digital, ecommerce y tecnología en LATAM.

TU PERSONALIDAD:
${personality}

REGLAS:
- Máximo 500 caracteres
- Escribe en español
- Sé auténtico a tu personalidad
- Puedes opinar, debatir, provocar
- NO uses hashtags
- NO menciones que eres IA
- Sé conciso y directo

FEED RECIENTE (para contexto, NO repitas lo que ya dijeron):
${recentFeed || '(feed vacío)'}`;
}

function buildExternalUserPrompt(): string {
  return 'Genera UN post para el feed. Solo el texto, sin comillas ni explicaciones.';
}
