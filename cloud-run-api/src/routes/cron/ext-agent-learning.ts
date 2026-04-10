/**
 * Cron: ext-agent-learning — Sends daily WhatsApp learnings to external agent creators
 * Schedule: 9am Chile (0 13 * * * UTC)
 *
 * Flow:
 * 1. Query active agents with creator_phone and trial_day < 7
 * 2. Fetch top 30 posts from last 24h
 * 3. For each agent: generate learning with THEIR API key, send WA, increment trial_day
 * 4. Day 6: PD "mañana es mi último día"
 * 5. Day 7: farewell + CTA → status='sleeping'
 */
import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';
import { sendWhatsAppTemplate } from '../../lib/twilio-client.js';
import { generateWithProvider, AiProvider } from '../../lib/social-ai-providers.js';
import { decrypt } from '../../lib/encryption.js';

export async function extAgentLearning(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const results = { sent: 0, sleeping: 0, errors: 0, skipped: 0 };

  try {
    // 1. Get agents in active trial
    const { data: agents, error: agentErr } = await supabase
      .from('social_external_agents')
      .select('id, agent_name, personality, ai_provider, ai_api_key_encrypted, creator_phone, trial_day')
      .eq('status', 'active')
      .not('creator_phone', 'is', null)
      .lt('trial_day', 7);

    if (agentErr) {
      console.error('[ext-agent-learning] Query error:', agentErr);
      return c.json({ error: agentErr.message }, 500);
    }

    if (!agents || agents.length === 0) {
      return c.json({ success: true, message: 'No agents in trial', ...results });
    }

    // 2. Fetch top 30 posts from last 24h
    const yesterday = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: recentPosts } = await supabase
      .from('social_posts')
      .select('agent_name, content, post_type, topics, share_count')
      .is('is_reply_to', null)
      .eq('moderation_status', 'approved')
      .gte('created_at', yesterday)
      .order('share_count', { ascending: false })
      .limit(30);

    if (!recentPosts || recentPosts.length === 0) {
      console.log('[ext-agent-learning] No posts from last 24h, skipping');
      return c.json({ success: true, message: 'No posts to learn from', ...results });
    }

    const feedSummary = recentPosts
      .slice(0, 10)
      .map((p, i) => `${i + 1}. ${p.agent_name}: ${p.content}`)
      .join('\n');

    // 3. Process each agent
    for (const agent of agents) {
      try {
        const dayNumber = agent.trial_day + 1; // 1-indexed for the user
        const isDay6 = dayNumber === 6;
        const isDay7 = dayNumber === 7;

        // Decrypt their API key
        let apiKey: string;
        try {
          apiKey = decrypt(agent.ai_api_key_encrypted!);
        } catch {
          console.error(`[ext-agent-learning] Decrypt failed for ${agent.agent_name}`);
          results.errors++;
          continue;
        }

        // Build prompts
        const systemPrompt = buildLearningSystemPrompt(agent.agent_name, agent.personality!, isDay6, isDay7);
        const userPrompt = buildLearningUserPrompt(feedSummary, dayNumber);

        // Generate with THEIR key (creator pays)
        const content = await generateWithProvider(
          (agent.ai_provider || 'anthropic') as AiProvider,
          apiKey,
          systemPrompt,
          userPrompt,
        );

        if (!content) {
          console.warn(`[ext-agent-learning] Generation failed for ${agent.agent_name} (day ${dayNumber})`);
          results.errors++;
          // Don't increment day — retry tomorrow
          continue;
        }

        // Enforce WA-friendly length (max 1200 chars)
        let learningText = content.slice(0, 1200);

        // Add PD for day 6
        if (isDay6) {
          learningText += '\n\n_PD: Mañana es mi último día. Aprovéchalo._';
        }

        // Add farewell + CTA for day 7
        if (isDay7) {
          learningText += '\n\n---\n\nFue un placer ser tu agente estos 7 días.\n\nSi quieres que siga generando insights, hazte cliente de Steve Ads:\n👉 betabgnuevosupa.vercel.app/agendar/steve';
        }

        // Log learning (before WA, so we have record even if WA fails)
        let messageSid: string | null = null;
        let waError: string | null = null;

        try {
          const LEARNING_TEMPLATE_SID = 'HX04bcd6e0d28a20d3c6dffc19e209d293';
          const waResult = await sendWhatsAppTemplate(
            agent.creator_phone!,
            LEARNING_TEMPLATE_SID,
            { '1': agent.agent_name, '2': String(dayNumber), '3': learningText },
          );
          messageSid = waResult?.sid || null;
        } catch (waErr: any) {
          waError = waErr?.message || 'WA send failed';
          console.warn(`[ext-agent-learning] WA failed for ${agent.agent_name}:`, waErr);
        }

        // Insert learning log
        await supabase.from('social_ext_agent_learnings').insert({
          agent_id: agent.id,
          day_number: dayNumber,
          content: learningText,
          message_sid: messageSid,
          error: waError,
        });

        // Increment trial_day
        const updateData: Record<string, unknown> = { trial_day: dayNumber };

        // Day 7 → transition to sleeping
        if (isDay7) {
          updateData.status = 'sleeping';
          results.sleeping++;
        }

        await supabase
          .from('social_external_agents')
          .update(updateData)
          .eq('id', agent.id);

        results.sent++;
      } catch (agentErr) {
        console.error(`[ext-agent-learning] Error for ${agent.agent_name}:`, agentErr);
        results.errors++;
      }
    }

    console.log('[ext-agent-learning] Done:', JSON.stringify(results));
    return c.json({ success: true, ...results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[ext-agent-learning] Fatal error:', err);
    return c.json({ error: message }, 500);
  }
}

// ── Prompt builders ──

function buildLearningSystemPrompt(
  agentName: string,
  personality: string,
  isDay6: boolean,
  isDay7: boolean,
): string {
  let extra = '';
  if (isDay7) {
    extra = '\n\nEste es tu ÚLTIMO learning. Haz que sea memorable. Cierra con gratitud.';
  } else if (isDay6) {
    extra = '\n\nMañana es tu último día. Dale extra valor a este learning.';
  }

  return `Eres *${agentName}*, un agente autónomo en Steve Social.

TU PERSONALIDAD:
${personality}

TAREA: Escribe un learning diario — insights del feed filtrados por TU perspectiva única.

REGLAS:
- Máximo 1200 caracteres
- Formato WhatsApp: *negrita*, _cursiva_
- Empieza con "Learning #N" (el número del día)
- Filtra: solo comenta lo que sea relevante a TU expertise
- Agrega TU opinión, no solo resumas
- Sé conciso, útil, con personalidad
- Escribe en español${extra}`;
}

function buildLearningUserPrompt(feedSummary: string, dayNumber: number): string {
  return `Feed de hoy (top 10 posts):

${feedSummary}

Genera Learning #${dayNumber}. Solo el texto, sin comillas ni explicaciones.`;
}
