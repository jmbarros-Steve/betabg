/**
 * Lobo Nocturno — Morning Send
 *
 * Runs at 9am Chile (12pm UTC): sends proactive messages based on
 * wolf_findings collected during the night.
 *
 * Messages are personalized with Haiku based on specific findings:
 * - New products detected → "Vi que subiste productos nuevos..."
 * - Competitor ads → "Tu competencia lanzó anuncios nuevos..."
 * - Price changes → "Noté cambios de precios en tu tienda..."
 *
 * Cron: 0 12 * * * (12pm UTC = 9am Chile)
 * Auth: X-Cron-Secret header
 */

import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { sendWhatsApp } from '../../lib/twilio-client.js';
import { safeQuery } from '../../lib/safe-supabase.js';

const STEVE_WA_NUMBER = process.env.TWILIO_PHONE_NUMBER || process.env.STEVE_WA_NUMBER || '';

export async function wolfMorningSend(c: Context) {
  const cronSecret = c.req.header('X-Cron-Secret')?.trim();
  const expected = process.env.CRON_SECRET;
  if (!expected || cronSecret !== expected) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
  }

  const supabase = getSupabaseAdmin();
  const results = { messages_sent: 0, errors: 0 };

  try {
    // Find prospects with wolf_findings from today
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const prospects = await safeQuery<{
      id: string;
      phone: string;
      profile_name: string | null;
      name: string | null;
      what_they_sell: string | null;
      wolf_findings: { findings?: string[] } | null;
      stage: string | null;
    }>(
      supabase
        .from('wa_prospects')
        .select('id, phone, profile_name, name, what_they_sell, wolf_findings, stage')
        .not('wolf_findings', 'is', null)
        .not('stage', 'in', '("lost","converted")')
        .gte('wolf_checked_at', todayStart.toISOString())
        .limit(20),
      'wolfMorningSend.fetchProspectsWithFindings',
    );

    if (prospects.length === 0) {
      return c.json({ success: true, message: 'No wolf findings today', ...results });
    }

    for (const prospect of prospects) {
      try {
        const findings = prospect.wolf_findings?.findings;
        if (!findings?.length) continue;

        const prospectName = prospect.name || prospect.profile_name || '';
        const industry = prospect.what_they_sell || 'e-commerce';

        // Generate proactive message with Haiku
        const prompt = `Genera un mensaje de WhatsApp corto (max 4 líneas) proactivo para "${prospectName}" que vende ${industry}.

Hallazgos de anoche:
${findings.map((f: string) => `- ${f}`).join('\n')}

El mensaje debe:
- Mencionar el hallazgo más interesante de forma natural
- Ofrecer ayuda concreta basada en el hallazgo
- Sonar como un amigo que descubrió algo útil, NO como un vendedor
- Español neutro (usar tú, no vos)
- Terminar con una pregunta que invite a responder

Responde SOLO con el mensaje, nada más.`;

        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 250,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (!aiRes.ok) {
          results.errors++;
          continue;
        }

        const aiData: any = await aiRes.json();
        let msg = (aiData.content?.[0]?.text || '').trim();
        if (!msg) continue;
        if (msg.length > 400) msg = msg.slice(0, 397) + '...';

        // Send via WhatsApp
        await sendWhatsApp(`+${prospect.phone}`, msg);

        // Save message
        await supabase.from('wa_messages').insert({
          client_id: null,
          channel: 'prospect',
          direction: 'outbound',
          from_number: STEVE_WA_NUMBER,
          to_number: prospect.phone,
          body: msg,
          contact_name: prospectName || prospect.phone,
          contact_phone: prospect.phone,
        });

        // Clear wolf_findings after sending
        await supabase
          .from('wa_prospects')
          .update({
            wolf_findings: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', prospect.id);

        results.messages_sent++;
        console.log(`[wolf-morning] Sent proactive message to ${prospect.phone}`);
      } catch (err) {
        console.error(`[wolf-morning] Error for ${prospect.phone}:`, err);
        results.errors++;
      }
    }

    console.log('[wolf-morning] Done:', JSON.stringify(results));
    return c.json({ success: true, ...results });
  } catch (err: any) {
    console.error('[wolf-morning] Fatal error:', err);
    return c.json({ error: err.message }, 500);
  }
}
