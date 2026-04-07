import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuery, safeQueryOrDefault } from '../../lib/safe-supabase.js';

/**
 * Prospect Email Nurture — Steve Perro Lobo Paso 16
 *
 * Sends nurture emails to qualified prospects (email + score >= 30).
 *
 * Sequence:
 * - Step 0→1 (Day 0, immediate): Summary of conversation + 1 industry insight
 * - Step 1→2 (Day 3): Industry case study with numbers
 * - Step 2→3 (Day 7): "I prepared something for your brand" + HubSpot meeting link
 *
 * Cron: 0 13 * * * (1pm UTC = 10am Chile)
 * Auth: X-Cron-Secret header
 */

const STEP_DELAYS: Record<number, number> = {
  0: 0, // Immediate
  1: 3, // 3 days after step 1
  2: 7, // 7 days after step 1 (4 more days)
};

const MEETING_LINK = 'https://meetings.hubspot.com/jose-manuel15';

// ---------------------------------------------------------------------------
// Premium email template — Steve Ads branding
// ---------------------------------------------------------------------------

const SIGNATURE = `
<table cellpadding="0" cellspacing="0" style="margin-top:32px; border-top: 1px solid #e5e7eb; padding-top:20px;">
  <tr>
    <td style="padding-right:16px; vertical-align:top;">
      <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:24px;text-align:center;line-height:48px;">🐕</div>
    </td>
    <td style="vertical-align:top;">
      <p style="margin:0;font-weight:700;font-size:15px;color:#111827;">Steve</p>
      <p style="margin:2px 0 0;font-size:13px;color:#6b7280;">CMO &bull; Steve Ads</p>
      <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;">Tu director de marketing AI &bull; <a href="https://steve.cl" style="color:#6366f1;text-decoration:none;">steve.cl</a></p>
    </td>
  </tr>
</table>`;

function wrapEmail(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="padding:24px 32px 16px;text-align:left;">
          <span style="font-size:20px;font-weight:800;color:#111827;">Steve</span><span style="font-size:20px;color:#6366f1;font-weight:800;">Ads</span>
        </td></tr>
        <tr><td>
          <div style="background:#ffffff;border-radius:12px;padding:36px 32px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
            ${bodyHtml}
            ${SIGNATURE}
          </div>
        </td></tr>
        <tr><td style="padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">Steve Ads — Marketing AI que vende por ti</p>
          <p style="margin:4px 0 0;font-size:11px;color:#d1d5db;">Este email fue enviado porque conversamos por WhatsApp. Si no quieres más emails, responde "no más emails".</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Design instructions for Haiku — consistent premium look
// ---------------------------------------------------------------------------

const DESIGN_INSTRUCTIONS = `
DISEÑO DEL CUERPO (respeta este formato exacto):
- NO incluyas wrapper, header ni footer — solo el contenido interno del email
- Usa <p> con style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;"
- Negritas: <strong style="color:#111827;">texto</strong>
- Bullets: <ul style="margin:12px 0 16px;padding-left:20px;"> con <li style="margin:0 0 8px;font-size:15px;color:#374151;">
- Para highlight/estadística importante usa: <div style="background:#f0f0ff;border-left:4px solid #6366f1;padding:16px 20px;border-radius:8px;margin:20px 0;"><p style="margin:0;font-size:15px;color:#374151;"><strong style="color:#6366f1;">dato</strong> — explicación</p></div>
- Para números o KPIs destacados usa: <span style="font-size:24px;font-weight:800;color:#6366f1;">número</span>
- NO incluyas firma — ya viene en el template
- NO uses <html>, <body>, <head>, <table> de wrapper
- NUNCA pongas "BG Consult" — la marca es "Steve Ads"
- Steve es el CMO de Steve Ads, una plataforma de marketing AI.

Responde SOLO con JSON válido sin markdown fences: {"subject":"asunto max 50 chars","body":"html del cuerpo"}
`;

export async function prospectEmailNurture(c: Context) {
  const cronSecret = c.req.header('X-Cron-Secret');
  if (cronSecret !== process.env.CRON_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!ANTHROPIC_API_KEY || !RESEND_API_KEY) {
    return c.json({ error: 'Missing ANTHROPIC_API_KEY or RESEND_API_KEY' }, 500);
  }

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const results = { emails_sent: 0, errors: 0 };

  try {
    // Find prospects eligible for email nurture
    const prospects = await safeQuery<any>(
      supabase
        .from('wa_prospects')
        .select('id, phone, name, profile_name, email, what_they_sell, company, lead_score, email_sequence_step, last_email_at, stage')
        .not('email', 'is', null)
        .gte('lead_score', 30)
        .not('stage', 'in', '("lost","converted")')
        .lt('email_sequence_step', 3)
        .order('email_sequence_step', { ascending: true })
        .limit(30),
      'prospectEmailNurture.fetchEligibleProspects',
    );

    if (prospects.length === 0) {
      return c.json({ success: true, message: 'No prospects eligible', ...results });
    }

    for (const prospect of prospects) {
      try {
        const currentStep = prospect.email_sequence_step || 0;

        // Check if enough time has passed since last email
        if (currentStep > 0 && prospect.last_email_at) {
          const daysSinceLastEmail = (now.getTime() - new Date(prospect.last_email_at).getTime()) / (1000 * 60 * 60 * 24);
          const requiredDelay = STEP_DELAYS[currentStep] || 3;
          if (daysSinceLastEmail < requiredDelay) continue;
        }

        // Load conversation history for context
        const messages = await safeQueryOrDefault<{ direction: string; body: string }>(
          supabase
            .from('wa_messages')
            .select('direction, body')
            .eq('contact_phone', prospect.phone)
            .eq('channel', 'prospect')
            .is('client_id', null)
            .order('created_at', { ascending: false })
            .limit(20),
          [],
          'prospectEmailNurture.fetchConversationHistory',
        );

        const conversationSummary = messages
          .reverse()
          .map((m: any) => `${m.direction === 'inbound' ? 'Prospecto' : 'Steve'}: ${m.body}`)
          .join('\n')
          .slice(0, 3000);

        const prospectName = prospect.name || prospect.profile_name || 'ahí';
        const industry = prospect.what_they_sell || 'e-commerce';
        const company = prospect.company || '';

        // Generate email content with Haiku
        const emailPrompts: Record<number, string> = {
          0: `Genera el contenido HTML del cuerpo de un email de nurture para ${prospectName}${company ? ` de ${company}` : ''} que vende ${industry}.

CONTEXTO: Primer email después de conversación WhatsApp.

CONVERSACIÓN PREVIA:
${conversationSummary}

OBJETIVO: Resumir lo conversado + dar un insight potente de su industria.
Tono: Colega senior de marketing, natural, directo, con datos.
Largo: 150-200 palabras max.

${DESIGN_INSTRUCTIONS}`,

          1: `Genera el contenido HTML del cuerpo de un email de nurture (paso 2/3) para ${prospectName}${company ? ` de ${company}` : ''} que vende ${industry}.

OBJETIVO: Caso de éxito de una marca de ${industry} que optimizó su marketing con IA. Números concretos (ROAS, CPA, revenue). Que sienta que se pierde algo.
Tono: Informativo con datos duros, no vendedor.
Largo: 180-250 palabras max.
Usa el highlight box para el dato más impactante.

${DESIGN_INSTRUCTIONS}`,

          2: `Genera el contenido HTML del cuerpo de un email de nurture FINAL (paso 3/3) para ${prospectName}${company ? ` de ${company}` : ''} que vende ${industry}.

OBJETIVO: Que agende llamada de 15 min. Dile que revisaste su negocio y encontraste oportunidades concretas. Menciona 2-3 cosas específicas que podrías mejorar.

CTA: Incluye este botón después del texto:
<table cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background:linear-gradient(135deg,#6366f1,#7c3aed);border-radius:8px;padding:14px 28px;"><a href="${MEETING_LINK}" style="color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">Agendar 15 min</a></td></tr></table>

Tono: Personal, directo. Urgencia suave.
Largo: 120-160 palabras max.

${DESIGN_INSTRUCTIONS}`,
        };

        const prompt = emailPrompts[currentStep];
        if (!prompt) continue;

        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1200,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (!aiRes.ok) {
          results.errors++;
          continue;
        }

        const aiData: any = await aiRes.json();
        const rawText = (aiData.content?.[0]?.text || '').trim();
        const jsonStr = rawText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();

        let emailContent: { subject: string; body: string };
        try {
          emailContent = JSON.parse(jsonStr);
        } catch {
          console.error(`[email-nurture] Failed to parse AI response for ${prospect.phone}`);
          results.errors++;
          continue;
        }

        if (!emailContent.subject || !emailContent.body) continue;

        // Wrap body in premium template
        const fullHtml = wrapEmail(emailContent.body);

        // Send via Resend
        const sendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Steve de Steve Ads <steve@steve.cl>',
            to: prospect.email,
            subject: emailContent.subject,
            html: fullHtml,
          }),
        });

        if (!sendRes.ok) {
          const errText = await sendRes.text();
          console.error(`[email-nurture] Resend error for ${prospect.email}: ${sendRes.status} ${errText}`);
          results.errors++;
          continue;
        }

        // Update prospect
        await supabase
          .from('wa_prospects')
          .update({
            email_sequence_step: currentStep + 1,
            last_email_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq('id', prospect.id);

        results.emails_sent++;
        console.log(`[email-nurture] Step ${currentStep + 1} sent to ${prospect.email} (${prospect.phone})`);

      } catch (err) {
        console.error(`[email-nurture] Error for ${prospect.phone}:`, err);
        results.errors++;
      }
    }

    console.log('[email-nurture] Done:', JSON.stringify(results));
    return c.json({ success: true, ...results });

  } catch (err: any) {
    console.error('[email-nurture] Fatal error:', err);
    return c.json({ error: err.message }, 500);
  }
}
