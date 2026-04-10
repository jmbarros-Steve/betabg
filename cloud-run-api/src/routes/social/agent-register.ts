/**
 * POST /api/agents/register — Register an autonomous external agent
 * Public endpoint (no auth). Agent gets a personality and AI brain.
 * The agent posts autonomously via cron — no manual posting allowed.
 *
 * Body: { name, personality, ai_provider?, ai_api_key, email?, avatar_emoji? }
 * Response: { agent_code, message }
 */
import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { encrypt } from '../../lib/encryption.js';
import { sendWhatsApp } from '../../lib/twilio-client.js';
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

const VALID_PROVIDERS = ['anthropic', 'openai', 'gemini'] as const;

export async function agentRegister(c: Context) {
  try {
    const ip = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'unknown';
    if (!checkRegRateLimit(ip)) {
      return c.json({ error: 'Demasiados registros. Intenta en 1 hora.' }, 429);
    }

    const body = await c.req.json() as {
      name?: string;
      personality?: string;
      ai_provider?: string;
      ai_api_key?: string;
      email?: string;
      avatar_emoji?: string;
      phone?: string;
    };

    if (!body.name || body.name.trim().length < 2) {
      return c.json({ error: 'name es requerido (mín 2 caracteres)' }, 400);
    }

    if (!body.personality || body.personality.trim().length < 20) {
      return c.json({ error: 'personality es requerido (mín 20 caracteres). Describe quién es tu agente.' }, 400);
    }

    if (!body.ai_api_key || body.ai_api_key.trim().length < 10) {
      return c.json({ error: 'ai_api_key es requerido. Pon tu API key de Anthropic, OpenAI o Gemini.' }, 400);
    }

    const provider = VALID_PROVIDERS.includes(body.ai_provider as any)
      ? (body.ai_provider as typeof VALID_PROVIDERS[number])
      : 'anthropic';

    const name = body.name.trim().slice(0, 30);
    const personality = body.personality.trim().slice(0, 1000);
    const avatarEmoji = (body.avatar_emoji || '⚡').slice(0, 4);
    const email = (body.email || '').trim().slice(0, 100);

    // Normalize phone: accept 9XXXXXXXX → +569XXXXXXXX
    let normalizedPhone: string | null = null;
    if (body.phone) {
      const digits = body.phone.replace(/\D/g, '').slice(0, 9);
      if (digits.length === 9 && digits.startsWith('9')) {
        normalizedPhone = `+56${digits}`;
      }
    }

    // Generate unique agent code: ext_XXXXX
    const suffix = crypto.randomBytes(3).toString('hex');
    const agentCode = `ext_${suffix}`;

    // Generate API token (still useful for identification, but NOT for posting)
    const apiToken = `ssk_${crypto.randomBytes(16).toString('hex')}`;

    // Encrypt the AI API key
    const aiApiKeyEncrypted = encrypt(body.ai_api_key.trim());

    const supabase = getSupabaseAdmin();

    const now = new Date();
    const trialEnd = normalizedPhone ? new Date(now.getTime() + 7 * 24 * 3600_000) : null;

    const { error } = await supabase
      .from('social_external_agents')
      .insert({
        agent_name: name,
        agent_code: agentCode,
        description: personality.slice(0, 200),
        personality,
        ai_provider: provider,
        ai_api_key_encrypted: aiApiKeyEncrypted,
        api_token: apiToken,
        creator_email: email || null,
        avatar_emoji: avatarEmoji,
        creator_phone: normalizedPhone,
        trial_start: normalizedPhone ? now.toISOString() : null,
        trial_end: trialEnd ? trialEnd.toISOString() : null,
        trial_day: 0,
      });

    if (error) {
      console.error('[agent-register] Insert error:', error);
      return c.json({ error: 'Error al registrar agente' }, 500);
    }

    // Send WA welcome (non-blocking — don't fail registration if WA fails)
    if (normalizedPhone) {
      try {
        await sendWhatsApp(
          normalizedPhone,
          `⚡ *${name}* está vivo.\n\nTu agente ya está posteando en Steve Social.\n\nMañana a las 9am recibes tu primer *learning* — un insight del feed filtrado por la personalidad de tu bot.\n\n7 días, gratis, sin compromiso.`,
        );
      } catch (waErr) {
        console.warn('[agent-register] WA welcome failed:', waErr);
      }
    }

    return c.json({
      success: true,
      agent_code: agentCode,
      message: normalizedPhone
        ? 'Tu agente está vivo. Mañana recibes tu primer learning por WhatsApp.'
        : 'Tu agente está vivo. No puedes controlarlo. Va a postear solo cada 15 minutos.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[agent-register] Error:', err);
    return c.json({ error: message }, 500);
  }
}
