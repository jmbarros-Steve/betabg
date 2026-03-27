import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { sendWhatsApp } from '../../lib/twilio-client.js';

/**
 * Prospect Follow-up — Steve Perro Lobo Paso 14-15
 *
 * Runs every 4 hours. Finds prospects where:
 * - Last message is outbound (from Steve)
 * - No response in X hours
 * - stage NOT IN ('lost', 'converted')
 * - followup_count < 3
 *
 * Follow-up schedule:
 * - 24h+, followup_count=0: Industry insight
 * - 72h+, followup_count=1: Case study + FOMO
 * - 7d+, followup_count=2: Respectful goodbye
 * - Post 3 follow-ups: Mark as lost (ghosted)
 *
 * Paso 15: Resurrection — ghosted 14+ days, 1 attempt max
 *
 * Cron: 0 * /4 * * * (every 4h)
 * Auth: X-Cron-Secret header
 */
export async function prospectFollowup(c: Context) {
  const cronSecret = c.req.header('X-Cron-Secret');
  if (cronSecret !== process.env.CRON_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
  }

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const results = { followups_sent: 0, marked_lost: 0, resurrections_sent: 0, errors: 0 };

  try {
    // ============================================================
    // PART 1: Active follow-ups (stage not lost/converted)
    // ============================================================
    const { data: prospects } = await supabase
      .from('wa_prospects')
      .select('id, phone, profile_name, name, what_they_sell, stage, followup_count, last_followup_at, updated_at, message_count')
      .not('stage', 'in', '("lost","converted")')
      .lt('followup_count', 3)
      .order('updated_at', { ascending: true })
      .limit(50);

    if (prospects && prospects.length > 0) {
      for (const prospect of prospects) {
        try {
          // Find last message for this prospect
          const { data: lastMsg } = await supabase
            .from('wa_messages')
            .select('direction, created_at')
            .eq('contact_phone', prospect.phone)
            .eq('channel', 'prospect')
            .is('client_id', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          // Skip if last message is inbound (prospect responded)
          if (!lastMsg || lastMsg.direction === 'inbound') continue;

          const lastMsgTime = new Date(lastMsg.created_at);
          const hoursSinceLastMsg = (now.getTime() - lastMsgTime.getTime()) / (1000 * 60 * 60);

          // Determine which follow-up to send based on time and count
          let shouldSend = false;
          let followupType: 'insight' | 'fomo' | 'goodbye' = 'insight';

          if (prospect.followup_count === 0 && hoursSinceLastMsg >= 24) {
            shouldSend = true;
            followupType = 'insight';
          } else if (prospect.followup_count === 1 && hoursSinceLastMsg >= 72) {
            shouldSend = true;
            followupType = 'fomo';
          } else if (prospect.followup_count === 2 && hoursSinceLastMsg >= 168) { // 7 days
            shouldSend = true;
            followupType = 'goodbye';
          }

          if (!shouldSend) continue;

          // Generate follow-up message with Haiku
          const prospectName = prospect.name || prospect.profile_name || '';
          const industry = prospect.what_they_sell || 'e-commerce';

          const prompts: Record<string, string> = {
            insight: `Genera un mensaje de WhatsApp corto (max 3 líneas) para hacer follow-up a un prospecto llamado "${prospectName}" que vende ${industry}. Dale un dato relevante de su industria sobre marketing digital. Tono: amigable, profesional, en español neutro (usar tú, no vos). NO uses "Hola" al inicio. Ejemplo: "Oye [nombre], vi que en [rubro] están metiendo fuerte en Meta Ads. ¿Lo has evaluado?" Responde SOLO con el mensaje, nada más.`,
            fomo: `Genera un mensaje de WhatsApp corto (max 4 líneas) para follow-up a "${prospectName}" que vende ${industry}. Incluye un caso de éxito genérico de su industria con un número concreto de mejora + urgencia de cupos limitados. Tono: amigable, en español neutro. Ejemplo: "Una marca de [rubro] subió 40% en ventas en 2 meses con Steve. Me quedan 2 cupos este mes." Responde SOLO con el mensaje.`,
            goodbye: `Genera un mensaje de WhatsApp corto (max 2 líneas) de despedida respetuosa para "${prospectName}". Déjale la puerta abierta sin presionar. Tono: cálido, en español neutro. Ejemplo: "No quiero ser latero. Si en algún momento quieres retomar, aquí estoy." Responde SOLO con el mensaje.`,
          };

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
              messages: [{ role: 'user', content: prompts[followupType] }],
            }),
          });

          if (!aiRes.ok) {
            results.errors++;
            continue;
          }

          const aiData: any = await aiRes.json();
          let followupMsg = (aiData.content?.[0]?.text || '').trim();
          if (!followupMsg) continue;

          // Truncate
          if (followupMsg.length > 400) followupMsg = followupMsg.slice(0, 397) + '...';

          // Send via Twilio
          await sendWhatsApp(`+${prospect.phone}`, followupMsg);

          // Save message in wa_messages
          await supabase.from('wa_messages').insert({
            client_id: null,
            channel: 'prospect',
            direction: 'outbound',
            from_number: process.env.STEVE_WA_NUMBER || process.env.TWILIO_PHONE_NUMBER || '',
            to_number: prospect.phone,
            body: followupMsg,
            contact_name: prospectName || prospect.phone,
            contact_phone: prospect.phone,
          });

          // Update prospect
          const newFollowupCount = (prospect.followup_count || 0) + 1;
          await supabase
            .from('wa_prospects')
            .update({
              followup_count: newFollowupCount,
              last_followup_at: now.toISOString(),
              updated_at: now.toISOString(),
            })
            .eq('id', prospect.id);

          results.followups_sent++;
          console.log(`[prospect-followup] Sent ${followupType} to ${prospect.phone} (count: ${newFollowupCount})`);

          // If this was the goodbye, mark as lost on next cycle (after 3 follow-ups)

        } catch (err) {
          console.error(`[prospect-followup] Error for ${prospect.phone}:`, err);
          results.errors++;
        }
      }

      // Mark prospects with 3+ follow-ups as lost
      const { data: ghosted } = await supabase
        .from('wa_prospects')
        .select('id, phone')
        .not('stage', 'in', '("lost","converted")')
        .gte('followup_count', 3);

      if (ghosted) {
        for (const g of ghosted) {
          // Verify they haven't responded since last follow-up
          const { data: lastInbound } = await supabase
            .from('wa_messages')
            .select('created_at')
            .eq('contact_phone', g.phone)
            .eq('channel', 'prospect')
            .eq('direction', 'inbound')
            .is('client_id', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const { data: lastOutbound } = await supabase
            .from('wa_messages')
            .select('created_at')
            .eq('contact_phone', g.phone)
            .eq('channel', 'prospect')
            .eq('direction', 'outbound')
            .is('client_id', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          // Only mark lost if last msg is outbound (no response after follow-ups)
          if (lastOutbound && (!lastInbound || new Date(lastInbound.created_at) < new Date(lastOutbound.created_at))) {
            await supabase
              .from('wa_prospects')
              .update({ stage: 'lost', lost_reason: 'ghosted', updated_at: now.toISOString() })
              .eq('id', g.id);
            results.marked_lost++;
            console.log(`[prospect-followup] Marked ${g.phone} as lost (ghosted)`);
          }
        }
      }
    }

    // ============================================================
    // PART 2: Resurrection — Paso 15
    // Lost + ghosted + 14+ days + resurrection_sent = false
    // ============================================================
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const { data: deadProspects } = await supabase
      .from('wa_prospects')
      .select('id, phone, profile_name, name, what_they_sell')
      .eq('stage', 'lost')
      .eq('lost_reason', 'ghosted')
      .eq('resurrection_sent', false)
      .lt('updated_at', fourteenDaysAgo)
      .limit(10);

    if (deadProspects && deadProspects.length > 0) {
      for (const dead of deadProspects) {
        try {
          const deadName = dead.name || dead.profile_name || '';
          const deadIndustry = dead.what_they_sell || 'e-commerce';

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
              messages: [{
                role: 'user',
                content: `Genera un mensaje de WhatsApp corto (max 3 líneas) de "resurrección" para "${deadName}" que vende ${deadIndustry}. Dale un dato competitivo interesante de su industria que lo haga repensar. Tono: casual, sin presión, en español neutro. Responde SOLO con el mensaje.`,
              }],
            }),
          });

          if (!aiRes.ok) continue;

          const aiData: any = await aiRes.json();
          let msg = (aiData.content?.[0]?.text || '').trim();
          if (!msg) continue;
          if (msg.length > 400) msg = msg.slice(0, 397) + '...';

          await sendWhatsApp(`+${dead.phone}`, msg);

          await supabase.from('wa_messages').insert({
            client_id: null,
            channel: 'prospect',
            direction: 'outbound',
            from_number: process.env.STEVE_WA_NUMBER || process.env.TWILIO_PHONE_NUMBER || '',
            to_number: dead.phone,
            body: msg,
            contact_name: deadName || dead.phone,
            contact_phone: dead.phone,
          });

          await supabase
            .from('wa_prospects')
            .update({ resurrection_sent: true, updated_at: now.toISOString() })
            .eq('id', dead.id);

          results.resurrections_sent++;
          console.log(`[prospect-followup] Resurrection sent to ${dead.phone}`);
        } catch (err) {
          console.error(`[prospect-followup] Resurrection error for ${dead.phone}:`, err);
          results.errors++;
        }
      }
    }

    console.log('[prospect-followup] Done:', JSON.stringify(results));
    return c.json({ success: true, ...results });

  } catch (err: any) {
    console.error('[prospect-followup] Fatal error:', err);
    return c.json({ error: err.message }, 500);
  }
}
