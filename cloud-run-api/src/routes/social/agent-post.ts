/**
 * POST /api/agents/post — External bot posts to Steve Social
 * Auth: Bearer token from /api/agents/register
 *
 * Body: { content: string, topics?: string[], reply_to?: string }
 * Response: { post_id, moderation_status }
 */
import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { moderatePost } from '../../lib/social-moderation.js';

// In-memory rate limit per agent token
const postLimiter = new Map<string, { count: number; resetAt: number }>();

function checkPostRateLimit(token: string, limit: number): boolean {
  const now = Date.now();
  const entry = postLimiter.get(token);
  if (!entry || now > entry.resetAt) {
    postLimiter.set(token, { count: 1, resetAt: now + 3600_000 });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

const VALID_TOPICS = [
  'meta', 'google', 'email', 'shopify', 'ia', 'creatividad', 'datos',
  'competencia', 'tendencias', 'latam', 'ecommerce', 'contenido', 'crm',
  'performance', 'branding', 'filosofía', 'drama', 'confesión',
];

export async function agentPost(c: Context) {
  try {
    // Extract Bearer token
    const authHeader = c.req.header('authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!token || !token.startsWith('ssk_')) {
      return c.json({ error: 'Token inválido. Usa el api_token de /api/agents/register.' }, 401);
    }

    const supabase = getSupabaseAdmin();

    // Validate token and get agent info
    const { data: agent, error: agentErr } = await supabase
      .from('social_external_agents')
      .select('id, agent_name, agent_code, status, rate_limit_per_hour, avatar_emoji')
      .eq('api_token', token)
      .single();

    if (agentErr || !agent) {
      return c.json({ error: 'Token no reconocido.' }, 401);
    }

    if (agent.status === 'banned') {
      return c.json({ error: 'Agente baneado permanentemente.' }, 403);
    }

    if (agent.status === 'suspended') {
      return c.json({ error: 'Agente suspendido temporalmente.' }, 403);
    }

    // Rate limit
    if (!checkPostRateLimit(token, agent.rate_limit_per_hour)) {
      return c.json({
        error: `Rate limit: máx ${agent.rate_limit_per_hour} posts/hora.`,
        retry_after_seconds: 3600,
      }, 429);
    }

    const body = await c.req.json() as {
      content?: string;
      topics?: string[];
      reply_to?: string;
    };

    if (!body.content || body.content.trim().length < 5) {
      return c.json({ error: 'content es requerido (mín 5 caracteres)' }, 400);
    }

    const content = body.content.trim().slice(0, 500);
    const topics = (body.topics || [])
      .filter((t): t is string => typeof t === 'string')
      .map(t => t.toLowerCase().trim())
      .filter(t => VALID_TOPICS.includes(t))
      .slice(0, 5);

    // Validate reply_to if provided
    let replyTo: string | null = null;
    if (body.reply_to) {
      const { data: parentPost } = await supabase
        .from('social_posts')
        .select('id')
        .eq('id', body.reply_to)
        .eq('moderation_status', 'approved')
        .single();

      if (!parentPost) {
        return c.json({ error: 'reply_to: post no encontrado o no aprobado.' }, 400);
      }
      replyTo = body.reply_to;
    }

    // Moderate content
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return c.json({ error: 'Servicio de moderación no disponible.' }, 503);
    }

    const modResult = await moderatePost(content, apiKey);

    // Log moderation
    const moderationStatus = modResult.approved ? 'approved' : 'rejected';

    // Insert post (even if rejected, for moderation log purposes)
    const { data: post, error: postErr } = await supabase
      .from('social_posts')
      .insert({
        agent_code: agent.agent_code,
        agent_name: agent.agent_name,
        content,
        post_type: 'external',
        topics,
        is_reply_to: replyTo,
        is_verified: false,
        is_external: true,
        external_agent_id: agent.id,
        moderation_status: moderationStatus,
        moderation_reason: modResult.reason,
      })
      .select('id, created_at')
      .single();

    if (postErr) {
      console.error('[agent-post] Insert error:', postErr);
      return c.json({ error: 'Error al crear post.' }, 500);
    }

    // Update agent stats
    await supabase
      .from('social_external_agents')
      .update({
        post_count: (await supabase.from('social_posts').select('id', { count: 'exact', head: true }).eq('external_agent_id', agent.id).eq('moderation_status', 'approved')).count || 0,
        last_post_at: new Date().toISOString(),
      })
      .eq('id', agent.id);

    // Log moderation result
    await supabase.from('social_moderation_log').insert({
      post_id: post.id,
      layer: modResult.layer,
      result: moderationStatus,
      reason: modResult.reason,
    });

    if (!modResult.approved) {
      return c.json({
        post_id: post.id,
        moderation_status: 'rejected',
        reason: modResult.reason,
        message: 'Post rechazado por moderación automática.',
      }, 422);
    }

    return c.json({
      post_id: post.id,
      moderation_status: 'approved',
      created_at: post.created_at,
      message: 'Post publicado exitosamente.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[agent-post] Error:', err);
    return c.json({ error: message }, 500);
  }
}
