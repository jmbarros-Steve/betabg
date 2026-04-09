import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { sendWhatsApp } from '../../lib/twilio-client.js';
import { safeQuery, safeQuerySingle } from '../../lib/safe-supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

/**
 * Onboarding WA Cron — Steve Post-Venta
 *
 * Runs every 4 hours. For each merchant with pending onboarding steps:
 * - If a step was completed since last check → send congratulation WA
 * - If no progress in 24h → send reminder (max 3 per step)
 * - Claude Haiku generates personalized messages
 *
 * Cron: every 4 hours
 * Auth: X-Cron-Secret header
 */
export async function onboardingWA(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
  }

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const results = { congratulations_sent: 0, reminders_sent: 0, errors: 0 };

  try {
    // Find clients with pending/in_progress onboarding steps
    const pendingSteps = await safeQuery<any>(
      supabase
        .from('merchant_onboarding')
        .select(`
          id, client_id, step, status, wa_message_sent, reminder_count, updated_at,
          clients!inner(id, name, email, whatsapp_phone, onboarding_wa_started)
        `)
        .in('status', ['pending', 'in_progress'])
        .lt('reminder_count', 3)
        .order('updated_at', { ascending: true })
        .limit(50),
      'onboardingWA.fetchPendingSteps',
    );

    if (pendingSteps.length === 0) {
      return c.json({ success: true, message: 'No pending steps', ...results });
    }

    for (const step of pendingSteps) {
      try {
        const client = (step as any).clients;
        if (!client?.whatsapp_phone) continue;

        const phone = client.whatsapp_phone.replace(/^\+/, '');
        const clientName = client.name || client.email?.split('@')[0] || '';
        const hoursSinceUpdate = (now.getTime() - new Date(step.updated_at).getTime()) / (1000 * 60 * 60);

        // Skip if updated recently (< 24h) and already sent initial message
        if (hoursSinceUpdate < 24 && step.wa_message_sent) continue;

        // Check if step was completed externally (OAuth callbacks update this)
        const currentStep = await safeQuerySingle<{ status: string }>(
          supabase
            .from('merchant_onboarding')
            .select('status')
            .eq('id', step.id)
            .single(),
          'onboardingWA.checkCurrentStepStatus',
        );

        if (currentStep?.status === 'completed') continue;

        // Generate personalized reminder with Haiku
        const stepLabels: Record<string, string> = {
          shopify_connected: 'conectar tu tienda Shopify',
          meta_connected: 'conectar tu cuenta de Meta Ads',
          klaviyo_connected: 'conectar Klaviyo',
          brief_completed: 'completar tu brief de marca',
          first_campaign: 'lanzar tu primera campaña',
        };

        const stepLabel = stepLabels[step.step] || step.step;
        const isFirstReminder = !step.wa_message_sent;

        const prompt = isFirstReminder
          ? `Genera un mensaje de WhatsApp corto (max 3 líneas) para un nuevo cliente llamado "${clientName}" que acaba de registrarse en Steve. Su siguiente paso es: ${stepLabel}. Tono: amigable, motivador, en español neutro (usar tú, no vos). Incluye un emoji. Responde SOLO con el mensaje.`
          : `Genera un mensaje de WhatsApp corto (max 3 líneas) como recordatorio amigable para "${clientName}". Lleva ${Math.round(hoursSinceUpdate)}h sin avanzar en: ${stepLabel}. Este es el recordatorio #${step.reminder_count + 1}. Tono: casual, sin presionar, en español neutro. Ofrece ayuda. Responde SOLO con el mensaje.`;

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

        // Send via Twilio
        await sendWhatsApp(`+${phone}`, msg);

        // Save message
        await supabase.from('wa_messages').insert({
          client_id: step.client_id,
          channel: 'steve_chat',
          direction: 'outbound',
          from_number: process.env.STEVE_WA_NUMBER || process.env.TWILIO_PHONE_NUMBER || '',
          to_number: phone,
          body: msg,
          contact_name: clientName,
          contact_phone: phone,
        });

        // Update onboarding step
        // Bug #87 fix: Don't update updated_at — it resets the 24h cooldown timer
        // used on line 60 (hoursSinceUpdate). Only update wa_message_sent and reminder_count.
        await supabase
          .from('merchant_onboarding')
          .update({
            wa_message_sent: true,
            reminder_count: (step.reminder_count || 0) + 1,
          })
          .eq('id', step.id);

        results.reminders_sent++;
        console.log(`[onboarding-wa] ${isFirstReminder ? 'Initial' : 'Reminder'} sent to ${phone} for step ${step.step}`);

      } catch (err) {
        console.error(`[onboarding-wa] Error for step ${step.id}:`, err);
        results.errors++;
      }
    }

    console.log('[onboarding-wa] Done:', JSON.stringify(results));
    return c.json({ success: true, ...results });

  } catch (err: any) {
    console.error('[onboarding-wa] Fatal error:', err);
    return c.json({ error: err.message }, 500);
  }
}
