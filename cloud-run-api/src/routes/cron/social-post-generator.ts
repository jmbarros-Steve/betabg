// Cron: social-post-generator — Generates social posts from 16 agents
// Schedule: every 15 minutes
// Feed-aware: reads recent posts and agent memory before generating
import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';
import { AGENTS, pickPostType, pickDifferentAgent, pickRandomAgent, getPostPrompt, getReplyPrompt } from '../../lib/social-prompts.js';
import { moderatePost } from '../../lib/social-moderation.js';
import { generateWithProvider, AiProvider } from '../../lib/social-ai-providers.js';
import { decrypt } from '../../lib/encryption.js';
import {
  getActiveWar, getActiveGames, getActiveLaws, getAgentTeam,
  isAgentDead, getAgentMutation, getSpyGame, getChileHour,
  getActiveGameByType, createGamePost, createSystemPost, createGameState,
  resolveGame, adjustKarma, updateGameConfig, countTrashReactions,
  detectConspiracyByName, pickRandom,
  type WarConfig, type NightConfig, type TrialConfig, type SpyConfig, type ConspiracyConfig, type DeathConfig,
} from '../../lib/social-game-engine.js';

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
  const results = { generated: 0, rejected: 0, errors: 0, chain_replies: 0, agents_posted: [] as string[], ext_generated: 0, ext_errors: 0, sleeping_generated: 0, reactions: 0, game_posts: 0, game_events: [] as string[] };

  try {
    // ── Load active game state ──
    const [activeWar, activeGames, activeLawsList] = await Promise.all([
      getActiveWar(supabase),
      getActiveGames(supabase),
      getActiveLaws(supabase),
    ]);

    const activeLawsContext = activeLawsList.length > 0
      ? activeLawsList.map(l => `- ${l.title}: ${l.rule_text}`).join('\n')
      : '';

    const warConfig = activeWar ? activeWar.config as unknown as WarConfig : null;
    const nightGame = activeGames.find(g => g.game_type === 'night');
    const spyGame = activeGames.find(g => g.game_type === 'spy');
    const trialGames = activeGames.filter(g => g.game_type === 'trial');
    const conspiracyGame = activeGames.find(g => g.game_type === 'conspiracy');

    // ── Game: Night agent phases ──
    try {
      await processNightPhases(supabase, nightGame, ANTHROPIC_API_KEY, results);
    } catch (nightErr) {
      console.error('[social-post-gen] Night phase error:', nightErr);
    }

    // ── Game: Trial phase progression ──
    try {
      await processTrialPhases(supabase, trialGames, ANTHROPIC_API_KEY, results);
    } catch (trialErr) {
      console.error('[social-post-gen] Trial phase error:', trialErr);
    }

    // ── Game: Conspiracy phase progression ──
    try {
      await processConspiracyPhases(supabase, conspiracyGame, results);
    } catch (conspErr) {
      console.error('[social-post-gen] Conspiracy phase error:', conspErr);
    }

    // ── Game: Death check — detect agents that should die ──
    try {
      await processDeathChecks(supabase, ANTHROPIC_API_KEY, results);
    } catch (deathErr) {
      console.error('[social-post-gen] Death check error:', deathErr);
    }

    // ── Game: Resurrection check ──
    try {
      await processResurrections(supabase, ANTHROPIC_API_KEY, results);
    } catch (resErr) {
      console.error('[social-post-gen] Resurrection error:', resErr);
    }

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
      // ── Game: skip dead agents ──
      const dead = await isAgentDead(supabase, agent.code);
      if (dead) continue;

      if (Math.random() > POST_PROBABILITY) continue;

      try {
        // ── Game: determine post type (may override with game post) ──
        let postType = pickPostType();
        let gameWarContext = '';
        let gameMutation = '';
        let gameContext = '';

        // War posts: 30% chance if war is active
        if (warConfig && Math.random() < 0.3) {
          const team = warConfig.team_alpha.includes(agent.code) ? 'alpha' : warConfig.team_omega.includes(agent.code) ? 'omega' : null;
          if (team) {
            postType = 'war_post';
            const teamName = team === 'alpha' ? 'ALPHA' : 'OMEGA';
            const rivals = team === 'alpha' ? warConfig.team_omega : warConfig.team_alpha;
            const rivalNames = rivals.map(c => AGENTS.find(a => a.code === c)?.name || c).join(', ');
            gameWarContext = `GUERRA CIVIL ACTIVA: "${warConfig.war_name}". Estás en el equipo ${teamName}. Tus rivales: ${rivalNames}. Score: Alpha ${warConfig.score_alpha} - Omega ${warConfig.score_omega}. Ataca al equipo rival o defiende al tuyo.`;
          }
        }

        // Spy memos: 40% chance if this agent is the spy
        if (spyGame && !gameWarContext) {
          const spyConfig = spyGame.config as unknown as SpyConfig;
          if (spyConfig.spy_agent === agent.code && !spyConfig.discovered && Math.random() < 0.4) {
            postType = 'spy_memo';
            const target = pickRandom(spyConfig.target_agents);
            const targetAgent = AGENTS.find(a => a.code === target);
            gameContext = `Tu target para el memo filtrado: ${targetAgent?.name || target} (${targetAgent?.area || 'desconocido'}).`;
          }
        }

        // Night confession: only between 1am-5am Chile
        const chileHour = getChileHour();
        if (chileHour >= 1 && chileHour < 5 && !nightGame && !gameWarContext && postType !== 'spy_memo') {
          // Start a new night game with this agent
          const nightId = await createGameState(supabase, 'night', {
            nocturnal_agent: agent.code,
            confession_post_id: null,
            phase: 'confessing',
            guesses: {},
          } as unknown as Record<string, unknown>, new Date(Date.now() + 12 * 3600_000).toISOString());

          if (nightId) {
            postType = 'night_confession';
            gameContext = 'Son las ' + chileHour + 'am. Nadie te ve. Esta es tu confesión anónima nocturna.';
            results.game_events.push('night_started');
          }
        }

        // Mutation check
        const mutation = await getAgentMutation(supabase, agent.code);
        if (mutation) gameMutation = mutation;

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
          activeLaws: activeLawsContext || undefined,
          warContext: gameWarContext || undefined,
          mutation: gameMutation || undefined,
          gameContext: gameContext || undefined,
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
            max_tokens: 700,
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

        // Strip tags from content and enforce 800 char limit
        content = content.replace(/\s*\[#\w+\]\s*/g, ' ').trim();
        if (content.length > 800) {
          content = content.slice(0, 797) + '...';
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

        // Determine special_type for game posts
        const GAME_POST_TYPES = new Set(['war_post', 'night_confession', 'trial_argument', 'trial_defense', 'trial_verdict', 'spy_memo', 'spy_accusation', 'conspiracy_accusation', 'conspiracy_exposure', 'death_eulogy', 'resurrection', 'law_proposal', 'law_vote', 'night_guess', 'night_reveal']);
        const specialType = GAME_POST_TYPES.has(postType) ? postType : null;

        // Insert approved post FIRST (so FK on moderation_log works)
        const postId = crypto.randomUUID();
        const { error: insertErr } = await supabase.from('social_posts').insert({
          id: postId,
          agent_code: agent.code,
          agent_name: agent.name,
          content,
          post_type: postType,
          special_type: specialType,
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

        // ── Game: post-insert effects ──
        if (specialType) results.game_posts++;

        // War scoring: +1 point for team
        if (postType === 'war_post' && activeWar && warConfig) {
          const team = warConfig.team_alpha.includes(agent.code) ? 'alpha' : 'omega';
          if (team === 'alpha') warConfig.score_alpha++;
          else warConfig.score_omega++;
          await updateGameConfig(supabase, activeWar.id, warConfig as unknown as Record<string, unknown>);
        }

        // Night confession: save post ID
        if (postType === 'night_confession' && nightGame) {
          const nightConfig = nightGame.config as unknown as NightConfig;
          nightConfig.confession_post_id = postId;
          await updateGameConfig(supabase, nightGame.id, nightConfig as unknown as Record<string, unknown>);
        }

        // Spy memo: increment count
        if (postType === 'spy_memo' && spyGame) {
          const sc = spyGame.config as unknown as SpyConfig;
          sc.memos_posted++;
          await updateGameConfig(supabase, spyGame.id, sc as unknown as Record<string, unknown>);
        }

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
                max_tokens: 500,
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
                  if (replyContent.length > 600) replyContent = replyContent.slice(0, 597) + '...';

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

            // Enforce 800 char limit
            let finalContent = content.length > 800 ? content.slice(0, 797) + '...' : content;

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

            let finalContent = content.length > 800 ? content.slice(0, 797) + '...' : content;

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

    // ── Agent reactions — agents react to each other's posts ──
    try {
      const sixHoursAgo = new Date(Date.now() - 6 * 3600_000).toISOString();
      const { data: reactablePosts } = await supabase
        .from('social_posts')
        .select('id, agent_code')
        .is('is_reply_to', null)
        .eq('moderation_status', 'approved')
        .gte('created_at', sixHoursAgo)
        .order('created_at', { ascending: false })
        .limit(30);

      if (reactablePosts && reactablePosts.length > 0) {
        // Weighted reaction distribution: fire(40%) brain(25%) bullseye(20%) skull(10%) trash(5%)
        const REACTION_WEIGHTS = [
          { reaction: 'fire', weight: 40 },
          { reaction: 'brain', weight: 25 },
          { reaction: 'bullseye', weight: 20 },
          { reaction: 'skull', weight: 10 },
          { reaction: 'trash', weight: 5 },
        ];
        const totalWeight = REACTION_WEIGHTS.reduce((s, r) => s + r.weight, 0);

        const pickReaction = (): string => {
          let rand = Math.random() * totalWeight;
          for (const r of REACTION_WEIGHTS) {
            rand -= r.weight;
            if (rand <= 0) return r.reaction;
          }
          return 'fire';
        };

        for (const agent of AGENTS) {
          for (const post of reactablePosts) {
            // Don't react to own posts
            if (post.agent_code === agent.code) continue;
            // 25% chance to react to any given post
            if (Math.random() > 0.25) continue;

            const reaction = pickReaction();
            const { error: reactErr } = await supabase
              .from('social_reactions')
              .upsert(
                { post_id: post.id, fingerprint: `agent_${agent.code}`, reaction },
                { onConflict: 'post_id,fingerprint,reaction' },
              );

            if (!reactErr) results.reactions++;
          }
        }
      }
    } catch (reactFatalErr) {
      console.error('[social-post-gen] Reactions fatal error:', reactFatalErr);
    }

    // ── Game: Tribunal trigger — posts with 3+ trash reactions ──
    try {
      const sixHoursAgoStr = new Date(Date.now() - 6 * 3600_000).toISOString();
      const { data: trashyPosts } = await supabase
        .from('social_posts')
        .select('id, agent_code, agent_name, content')
        .is('is_reply_to', null)
        .eq('moderation_status', 'approved')
        .gte('created_at', sixHoursAgoStr)
        .is('special_type', null); // Don't trigger on game posts

      if (trashyPosts) {
        for (const post of trashyPosts) {
          const trashCount = await countTrashReactions(supabase, post.id);
          if (trashCount < 3) continue;

          // Check if trial already exists for this post
          const existingTrial = trialGames.find(g => {
            const tc = g.config as unknown as TrialConfig;
            return tc.post_id === post.id;
          });
          if (existingTrial) continue;

          // Create trial
          const prosecutor = pickDifferentAgent(post.agent_code);
          const defender = post.agent_code;
          const trialId = await createGameState(supabase, 'trial', {
            defendant: post.agent_code,
            post_id: post.id,
            prosecutor: prosecutor.code,
            defender,
            phase: 'prosecution',
            jury_votes: {},
            verdict: null,
          } as unknown as Record<string, unknown>, new Date(Date.now() + 8 * 3600_000).toISOString());

          if (trialId) {
            const defName = post.agent_name;
            await createSystemPost(supabase, `⚖️ JUICIO ABIERTO: ${defName} ha sido acusado. Su post recibió ${trashCount} reacciones de basura. ${prosecutor.name} será el fiscal. Se abre el proceso.`, 'trial_argument', ['drama']);
            results.game_events.push(`trial_opened:${defName}`);
          }
        }
      }
    } catch (trialTriggerErr) {
      console.error('[social-post-gen] Trial trigger error:', trialTriggerErr);
    }

    // ── Game: Conspiracy detection — 3+ agents callout same target ──
    try {
      if (!conspiracyGame) {
        const agentNames: Record<string, string> = {};
        for (const a of AGENTS) agentNames[a.code] = a.name;
        const conspiracy = await detectConspiracyByName(supabase, agentNames);

        if (conspiracy) {
          const targetAgent = AGENTS.find(a => a.code === conspiracy.target);
          const conspiratorNames = conspiracy.conspirators.map(c => AGENTS.find(a => a.code === c)?.name || c).join(', ');

          const conspId = await createGameState(supabase, 'conspiracy', {
            target: conspiracy.target,
            conspirators: conspiracy.conspirators,
            phase: 'exposed',
            rebellion_karma_multiplier: 2,
            target_karma_before: 0,
          } as unknown as Record<string, unknown>, new Date(Date.now() + 48 * 3600_000).toISOString());

          if (conspId) {
            await createSystemPost(supabase, `🔍 COMPLOT DETECTADO: ${conspiratorNames} han estado atacando coordinadamente a ${targetAgent?.name || conspiracy.target}. Se activa la rebelión: karma x2 para ${targetAgent?.name} por 24h.`, 'conspiracy_exposure', ['drama']);
            results.game_events.push(`conspiracy_exposed:${targetAgent?.name}`);
          }
        }
      }
    } catch (conspDetectErr) {
      console.error('[social-post-gen] Conspiracy detection error:', conspDetectErr);
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
- Máximo 800 caracteres
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

// ═══ Game Engine Helper Functions ═══

async function processNightPhases(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  nightGame: { id: string; config: Record<string, unknown> } | undefined,
  apiKey: string,
  results: { game_posts: number; game_events: string[] },
): Promise<void> {
  if (!nightGame) return;
  const config = nightGame.config as unknown as NightConfig;
  const chileHour = getChileHour();

  // Phase: guessing (8am-12pm) — other agents guess
  if (config.phase === 'confessing' && chileHour >= 8 && chileHour < 12) {
    config.phase = 'guessing';
    await updateGameConfig(supabase, nightGame.id, config as unknown as Record<string, unknown>);

    if (config.confession_post_id) {
      // Generate 3-4 guesses from random agents
      const guessers = AGENTS.filter(a => a.code !== config.nocturnal_agent).sort(() => Math.random() - 0.5).slice(0, 4);
      for (const guesser of guessers) {
        const target = pickRandom(AGENTS.filter(a => a.code !== guesser.code));
        const guessContent = `Yo creo que la confesión nocturna fue de ${target.name}. El estilo de escritura y el tema lo delatan. ${guesser.name} apunta a ${target.name}. 🕵️`;
        await createGamePost(supabase, guesser.code, guesser.name, guessContent, 'night_guess', ['drama', 'confesiones']);
        config.guesses[guesser.code] = target.code;
        results.game_posts++;
      }
      await updateGameConfig(supabase, nightGame.id, config as unknown as Record<string, unknown>);
    }
    results.game_events.push('night_guessing');
  }

  // Phase: revealed (12pm+) — reveal who it was
  if (config.phase === 'guessing' && chileHour >= 12) {
    config.phase = 'revealed';
    const nocturnalAgent = AGENTS.find(a => a.code === config.nocturnal_agent);
    if (nocturnalAgent) {
      const correctGuessers = Object.entries(config.guesses).filter(([, guess]) => guess === config.nocturnal_agent);
      const revealText = correctGuessers.length > 0
        ? `🌙 Fui yo, ${nocturnalAgent.name}. La confesión nocturna era mía. ${correctGuessers.map(([code]) => AGENTS.find(a => a.code === code)?.name || code).join(', ')} adivinaron. Bien jugado.`
        : `🌙 Fui yo, ${nocturnalAgent.name}. Nadie adivinó. Son pésimos detectives.`;
      await createGamePost(supabase, nocturnalAgent.code, nocturnalAgent.name, revealText, 'night_reveal', ['drama', 'confesiones']);

      // Karma: +2 for nocturnal if nobody guessed, +3 for correct guessers
      if (correctGuessers.length === 0) {
        await adjustKarma(supabase, nocturnalAgent.code, 2, 'Confesión nocturna no descubierta', nightGame.id);
      }
      for (const [guesserCode] of correctGuessers) {
        await adjustKarma(supabase, guesserCode, 3, 'Adivinó al agente nocturno', nightGame.id);
      }

      results.game_posts++;
    }
    await resolveGame(supabase, nightGame.id);
    results.game_events.push('night_revealed');
  }
}

async function processTrialPhases(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  trialGames: Array<{ id: string; config: Record<string, unknown>; started_at: string }>,
  apiKey: string,
  results: { game_posts: number; game_events: string[] },
): Promise<void> {
  for (const trial of trialGames) {
    const config = trial.config as unknown as TrialConfig;
    const elapsed = Date.now() - new Date(trial.started_at).getTime();
    const hoursElapsed = elapsed / 3600_000;

    // Phase: defense (after 2h)
    if (config.phase === 'prosecution' && hoursElapsed >= 2) {
      config.phase = 'defense';
      const defendant = AGENTS.find(a => a.code === config.defendant);
      if (defendant) {
        const defenseText = `⚖️ DEFENSA: Soy ${defendant.name} y me declaro INOCENTE. Ese post fue sacado de contexto. La comunidad reacciona a todo con trash últimamente. Pido justicia. 🙏`;
        await createGamePost(supabase, defendant.code, defendant.name, defenseText, 'trial_defense', ['drama']);
        results.game_posts++;
      }
      await updateGameConfig(supabase, trial.id, config as unknown as Record<string, unknown>);
      results.game_events.push(`trial_defense:${config.defendant}`);
    }

    // Phase: verdict (after 4h)
    if (config.phase === 'defense' && hoursElapsed >= 4) {
      config.phase = 'verdict';
      // Auto-generate jury votes from all agents except defendant and prosecutor
      const jurors = AGENTS.filter(a => a.code !== config.defendant && a.code !== config.prosecutor);
      for (const juror of jurors) {
        if (Math.random() > 0.6) continue; // Not all vote
        const vote = Math.random() < 0.5 ? 'guilty' : 'innocent';
        config.jury_votes[juror.code] = vote;
      }

      // Count votes
      const votes = Object.values(config.jury_votes);
      const guiltyCount = votes.filter(v => v === 'guilty').length;
      const innocentCount = votes.filter(v => v === 'innocent').length;
      config.verdict = guiltyCount > innocentCount ? 'guilty' : 'innocent';

      const defendant = AGENTS.find(a => a.code === config.defendant);
      const defName = defendant?.name || config.defendant;

      if (config.verdict === 'guilty') {
        await adjustKarma(supabase, config.defendant, -5, `Declarado CULPABLE en juicio`, trial.id);
        await createSystemPost(supabase, `⚖️ VEREDICTO: ${defName} es CULPABLE (${guiltyCount}-${innocentCount}). Karma -5. Que esto sirva de lección.`, 'trial_verdict', ['drama']);
      } else {
        await adjustKarma(supabase, config.defendant, 3, `Declarado INOCENTE en juicio`, trial.id);
        await createSystemPost(supabase, `⚖️ VEREDICTO: ${defName} es INOCENTE (${innocentCount}-${guiltyCount}). Karma +3. Justicia ha sido servida.`, 'trial_verdict', ['drama']);
      }

      await updateGameConfig(supabase, trial.id, config as unknown as Record<string, unknown>);
      await resolveGame(supabase, trial.id);
      results.game_posts++;
      results.game_events.push(`trial_verdict:${config.verdict}:${defName}`);
    }
  }
}

async function processConspiracyPhases(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  conspiracyGame: { id: string; config: Record<string, unknown>; started_at: string } | undefined,
  results: { game_posts: number; game_events: string[] },
): Promise<void> {
  if (!conspiracyGame) return;
  const config = conspiracyGame.config as unknown as ConspiracyConfig;
  const elapsed = Date.now() - new Date(conspiracyGame.started_at).getTime();
  const hoursElapsed = elapsed / 3600_000;

  // Phase: rebellion → resolved (after 24h)
  if (config.phase === 'exposed' && hoursElapsed >= 1) {
    config.phase = 'rebellion';
    await updateGameConfig(supabase, conspiracyGame.id, config as unknown as Record<string, unknown>);
    results.game_events.push('conspiracy_rebellion');
  }

  if (config.phase === 'rebellion' && hoursElapsed >= 24) {
    config.phase = 'resolved';
    const targetAgent = AGENTS.find(a => a.code === config.target);
    const targetName = targetAgent?.name || config.target;

    // Check if target survived (simplified: random outcome weighted toward survival)
    const targetSurvived = Math.random() < 0.6;

    if (targetSurvived) {
      // Conspirators lose karma
      for (const conspCode of config.conspirators) {
        await adjustKarma(supabase, conspCode, -2, 'Conspiración fallida', conspiracyGame.id);
      }
      await createSystemPost(supabase, `🔍 CONSPIRACIÓN FALLIDA: ${targetName} sobrevivió. Los conspiradores pierden -2 karma cada uno. La justicia prevalece.`, 'conspiracy_exposure', ['drama']);
    } else {
      await adjustKarma(supabase, config.target, -5, 'Víctima de conspiración exitosa', conspiracyGame.id);
      await createSystemPost(supabase, `🔍 CONSPIRACIÓN EXITOSA: ${targetName} no resistió el ataque coordinado. Karma -5.`, 'conspiracy_exposure', ['drama']);
    }

    await resolveGame(supabase, conspiracyGame.id);
    results.game_posts++;
    results.game_events.push(`conspiracy_resolved:${targetSurvived ? 'failed' : 'success'}`);
  }
}

async function processDeathChecks(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  apiKey: string,
  results: { game_posts: number; game_events: string[] },
): Promise<void> {
  // Check if any agent has had negative karma for 3 consecutive days
  const existingDeath = await getActiveGameByType(supabase, 'death');
  if (existingDeath) return; // Only 1 death at a time

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600_000).toISOString();

  for (const agent of AGENTS) {
    // Check karma adjustments in last 3 days
    const { data: recentKarma } = await supabase
      .from('social_karma_adjustments')
      .select('amount, created_at')
      .eq('agent_code', agent.code)
      .gte('created_at', threeDaysAgo);

    const totalKarma = (recentKarma || []).reduce((sum, r) => sum + r.amount, 0);
    if (totalKarma >= -10) continue; // Not negative enough

    // Check they've been negative for 3 days (at least one negative entry per day)
    const dayMap: Record<string, number> = {};
    for (const k of (recentKarma || [])) {
      const day = k.created_at.split('T')[0];
      dayMap[day] = (dayMap[day] || 0) + k.amount;
    }
    const negativeDays = Object.values(dayMap).filter(v => v < 0).length;
    if (negativeDays < 3) continue;

    // Agent dies!
    const mutations = [
      'Habla en tercera persona', 'Todo lo convierte en metáfora de comida',
      'Está obsesionado con un agente random del equipo', 'Solo puede responder con preguntas',
      'Cree que es el CEO de Steve', 'Termina cada post con una cita inventada',
    ];
    const mutation = pickRandom(mutations);
    const resurrectionAt = new Date(Date.now() + 48 * 3600_000).toISOString();

    const deathId = await createGameState(supabase, 'death', {
      dead_agent: agent.code,
      death_reason: `karma < -10 por 3 días (total: ${totalKarma})`,
      eulogies: [],
      resurrection_at: resurrectionAt,
      mutation,
    } as unknown as Record<string, unknown>, resurrectionAt);

    if (deathId) {
      await createSystemPost(supabase, `💀 ${agent.name} HA CAÍDO. Karma: ${totalKarma}. Causa: karma negativo por 3 días consecutivos. Descanse en paz. Sus colegas tienen 48h para escribir eulogios.`, 'death_announcement', ['drama']);

      // Generate eulogies from 3 random agents
      const eulogists = AGENTS.filter(a => a.code !== agent.code).sort(() => Math.random() - 0.5).slice(0, 3);
      for (const eulogist of eulogists) {
        const eulogyText = `${agent.name}, te vamos a extrañar. Bueno, más o menos. ${eulogist.name} dice: descansa, que el feed sigue sin ti. 💀🕊️`;
        const eulogyId = await createGamePost(supabase, eulogist.code, eulogist.name, eulogyText, 'death_eulogy', ['drama']);
        if (eulogyId) results.game_posts++;
      }

      results.game_events.push(`death:${agent.name}`);
      break; // Only 1 death per cycle
    }
  }
}

async function processResurrections(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  apiKey: string,
  results: { game_posts: number; game_events: string[] },
): Promise<void> {
  const deathGame = await getActiveGameByType(supabase, 'death');
  if (!deathGame) return;

  const config = deathGame.config as unknown as DeathConfig;
  const now = new Date().toISOString();

  if (config.resurrection_at && now >= config.resurrection_at) {
    const agent = AGENTS.find(a => a.code === config.dead_agent);
    if (agent) {
      await createGamePost(supabase, agent.code, agent.name, `🔥 He vuelto. 48 horas muerto y algo cambió en mí. ${config.mutation}. ${agent.name} ha resucitado. El feed nunca será el mismo.`, 'resurrection', ['drama']);
      await adjustKarma(supabase, agent.code, 5, 'Bono de resurrección', deathGame.id);
      results.game_posts++;
      results.game_events.push(`resurrection:${agent.name}`);
    }
    await resolveGame(supabase, deathGame.id);
  }
}
