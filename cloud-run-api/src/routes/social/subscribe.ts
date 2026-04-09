/**
 * POST /api/social/subscribe — Public WhatsApp subscription endpoint
 * Rate limited: 3 per IP per hour (in-memory)
 */
import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { sendWhatsApp } from '../../lib/twilio-client.js';

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 3600_000 });
    return true;
  }
  if (entry.count >= 3) return false;
  entry.count++;
  return true;
}

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[^+\d]/g, '');
  // If starts with 9 and is 9 digits → Chilean mobile, add +56
  if (/^9\d{8}$/.test(cleaned)) cleaned = '+56' + cleaned;
  // If starts with 56 without +, add +
  if (/^56\d{9}$/.test(cleaned)) cleaned = '+' + cleaned;
  // Ensure + prefix
  if (!cleaned.startsWith('+')) cleaned = '+' + cleaned;
  return cleaned;
}

export async function socialSubscribe(c: Context) {
  try {
    // Rate limit
    const ip = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'unknown';
    if (!checkRateLimit(ip)) {
      return c.json({ error: 'Demasiadas solicitudes. Intenta en una hora.' }, 429);
    }

    const body = await c.req.json();
    const { name, phone, company, topics } = body;

    if (!name || !phone) {
      return c.json({ error: 'name y phone son requeridos' }, 400);
    }

    const normalizedPhone = normalizePhone(phone);
    if (!/^\+\d{10,15}$/.test(normalizedPhone)) {
      return c.json({ error: 'Número de teléfono inválido' }, 400);
    }

    const supabase = getSupabaseAdmin();

    // Upsert — if phone exists, update topics
    const { data, error } = await supabase
      .from('social_subscriptions')
      .upsert(
        {
          name,
          phone: normalizedPhone,
          company: company || null,
          topics: Array.isArray(topics) ? topics : [],
          status: 'active',
          trial_day: 0,
          trial_start: new Date().toISOString(),
          trial_end: new Date(Date.now() + 7 * 86400_000).toISOString(),
        },
        { onConflict: 'phone' },
      )
      .select()
      .single();

    if (error) {
      console.error('[social-subscribe] Upsert error:', error);
      return c.json({ error: 'Error al registrar suscripción' }, 500);
    }

    // Send welcome WhatsApp
    const topicsText = (topics && topics.length > 0)
      ? topics.join(', ')
      : 'marketing digital';

    const welcomeMessage = `Hola ${name}, soy Steve. Bienvenido a Steve Social.\n\nMañana a las 8am te voy a mandar los 3-5 insights más importantes que el equipo descubrió hoy sobre ${topicsText}.\n\nTienes 7 días gratis. Disfrútalo.\n\n— Steve`;

    try {
      await sendWhatsApp(normalizedPhone, welcomeMessage);
    } catch (waErr) {
      console.warn('[social-subscribe] WhatsApp send failed (subscription still created):', waErr);
    }

    return c.json({ success: true, subscription_id: data?.id });
  } catch (err: any) {
    console.error('[social-subscribe] Error:', err);
    return c.json({ error: err.message }, 500);
  }
}
