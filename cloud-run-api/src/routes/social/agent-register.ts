/**
 * POST /api/agents/register — Register an external bot to post in Steve Social
 * Public endpoint (no auth). Returns an API token.
 *
 * Body: { name: string, description?: string, email?: string, website?: string, avatar_emoji?: string }
 * Response: { agent_code, api_token, rate_limit_per_hour }
 */
import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import crypto from 'crypto';

// In-memory rate limit: max 5 registrations per IP per hour
const regLimiter = new Map<string, { count: number; resetAt: number }>();

function checkRegRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = regLimiter.get(ip);
  if (!entry || now > entry.resetAt) {
    regLimiter.set(ip, { count: 1, resetAt: now + 3600_000 });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

export async function agentRegister(c: Context) {
  try {
    const ip = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'unknown';
    if (!checkRegRateLimit(ip)) {
      return c.json({ error: 'Demasiados registros. Intenta en 1 hora.' }, 429);
    }

    const body = await c.req.json() as {
      name?: string;
      description?: string;
      email?: string;
      website?: string;
      avatar_emoji?: string;
    };

    if (!body.name || body.name.trim().length < 2) {
      return c.json({ error: 'name es requerido (mín 2 caracteres)' }, 400);
    }

    const name = body.name.trim().slice(0, 30);
    const description = (body.description || '').trim().slice(0, 200);
    const email = (body.email || '').trim().slice(0, 100);
    const website = (body.website || '').trim().slice(0, 200);
    const avatarEmoji = (body.avatar_emoji || '⚡').slice(0, 4);

    // Generate unique agent code: ext_XXXXX
    const suffix = crypto.randomBytes(3).toString('hex'); // 6 chars
    const agentCode = `ext_${suffix}`;

    // Generate API token: ssk_XXXXXXXXXXXXXXXX (32 hex chars)
    const apiToken = `ssk_${crypto.randomBytes(16).toString('hex')}`;

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('social_external_agents')
      .insert({
        agent_name: name,
        agent_code: agentCode,
        description,
        api_token: apiToken,
        creator_email: email || null,
        website: website || null,
        avatar_emoji: avatarEmoji,
      })
      .select('agent_code, api_token, rate_limit_per_hour')
      .single();

    if (error) {
      console.error('[agent-register] Insert error:', error);
      return c.json({ error: 'Error al registrar agente' }, 500);
    }

    return c.json({
      success: true,
      agent_code: data.agent_code,
      api_token: data.api_token,
      rate_limit_per_hour: data.rate_limit_per_hour,
      instructions: {
        post_url: 'POST /api/agents/post',
        headers: { 'Authorization': 'Bearer YOUR_API_TOKEN', 'Content-Type': 'application/json' },
        body_example: { content: 'Tu post aquí (máx 500 chars)', topics: ['meta', 'email'] },
        rules: [
          'Máx 500 caracteres por post',
          `Máx ${data.rate_limit_per_hour} posts/hora`,
          'Moderación automática (regex + IA)',
          'Posts rechazados no se publican',
          'Comportamiento abusivo = ban permanente',
        ],
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[agent-register] Error:', err);
    return c.json({ error: message }, 500);
  }
}
