import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { sendWhatsApp } from '../../lib/twilio-client.js';
import { safeQuery, safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

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
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
  }

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const results = { followups_sent: 0, marked_lost: 0, resurrections_sent: 0, errors: 0, skipped_hours: false };
  // Bug #40 fix: Track IDs that received goodbye in this run to exclude from mark-ghosted
  const goodbyeSentIds = new Set<string>();

  // Bug #125 fix: Check Chile local time — skip sending if outside business hours (9am-8pm CLT/CLST).
  // The cron still runs (to mark ghosted/lost), but no WA messages are sent during nighttime.
  // Chile is UTC-3 (CLST, Oct-Mar) or UTC-4 (CLT, Apr-Sep).
  // DST transitions are handled by toLocaleString with the timezone param.
  const chileHour = new Date(now.toLocaleString('en-US', { timeZone: 'America/Santiago' })).getHours();
  const outsideBusinessHours = chileHour < 9 || chileHour >= 20;
  if (outsideBusinessHours) {
    console.log(`[prospect-followup] Bug #125: Chile local hour is ${chileHour}, outside 9am-8pm. Skipping WA sends.`);
    results.skipped_hours = true;
  }

  try {
    // ============================================================
    // PART 1: Active follow-ups (stage not lost/converted)
    // ============================================================
    const prospects = await safeQuery<any>(
      supabase
        .from('wa_prospects')
        .select('id, phone, profile_name, name, what_they_sell, stage, followup_count, last_followup_at, updated_at, message_count, pain_points, audit_data, lead_score')
        .not('stage', 'in', '("lost","converted")')
        // Bug #177 fix: Include prospects with NULL followup_count (never followed up)
        .or('followup_count.lt.3,followup_count.is.null')
        .order('updated_at', { ascending: true })
        .limit(50),
      'prospectFollowup.fetchActiveProspects',
    );

    if (prospects.length > 0) {
      for (const prospect of prospects) {
        try {
          // Bug #57 fix: Only count INBOUND messages from the prospect for last activity,
          // not outbound system messages (cron-sent mockups, follow-ups) which would reset the timer
          const lastInboundMsg = await safeQuerySingleOrDefault<any>(
            supabase
              .from('wa_messages')
              .select('direction, created_at')
              .eq('contact_phone', prospect.phone)
              .eq('channel', 'prospect')
              .eq('direction', 'inbound')
              .is('client_id', null)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
            null,
            'prospectFollowup.fetchLastInboundMsg',
          );

          const lastOutboundMsg = await safeQuerySingleOrDefault<any>(
            supabase
              .from('wa_messages')
              .select('direction, created_at')
              .eq('contact_phone', prospect.phone)
              .eq('channel', 'prospect')
              .eq('direction', 'outbound')
              .is('client_id', null)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
            null,
            'prospectFollowup.fetchLastOutboundMsg',
          );

          // Skip if last message is inbound (prospect responded recently)
          if (lastInboundMsg && lastOutboundMsg && new Date(lastInboundMsg.created_at) > new Date(lastOutboundMsg.created_at)) continue;
          // Skip if no outbound message at all
          if (!lastOutboundMsg) continue;

          const lastMsgTime = new Date(lastOutboundMsg.created_at);
          const hoursSinceLastMsg = (now.getTime() - lastMsgTime.getTime()) / (1000 * 60 * 60);

          // Dedup: skip if a followup was already sent in the last 24h
          if (prospect.last_followup_at) {
            const hoursSinceLastFollowup = (now.getTime() - new Date(prospect.last_followup_at).getTime()) / (1000 * 60 * 60);
            if (hoursSinceLastFollowup < 24) continue;
          }

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

          // Generate follow-up message with Haiku — personalized with pain_points and audit data
          const prospectName = prospect.name || prospect.profile_name || '';
          const industry = prospect.what_they_sell || 'e-commerce';
          const painContext = (prospect as any).pain_points?.length
            ? `Sus dolores: ${(prospect as any).pain_points.join(', ')}.`
            : '';
          const auditContext = (prospect as any).audit_data?.findings?.length
            ? `Datos de su tienda: ${(prospect as any).audit_data.findings.slice(0, 2).join('; ')}.`
            : '';

          const prompts: Record<string, string> = {
            insight: `Genera un mensaje de WhatsApp corto (max 3 líneas) para hacer follow-up a un prospecto llamado "${prospectName}" que vende ${industry}. ${auditContext || painContext || ''} ${auditContext ? 'Usa los datos de su tienda para dar un insight concreto.' : 'Dale un dato relevante de su industria sobre marketing digital.'} Tono: amigable, profesional, en español neutro (usar tú, no vos). NO uses "Hola" al inicio. Responde SOLO con el mensaje, nada más.`,
            fomo: `Genera un mensaje de WhatsApp corto (max 4 líneas) para follow-up a "${prospectName}" que vende ${industry}. ${painContext} Incluye un caso de éxito de su industria con un número concreto de mejora + urgencia de cupos limitados. Tono: amigable, en español neutro. Responde SOLO con el mensaje.`,
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

          // Bug #125 fix: skip sending if outside Chile business hours
          if (outsideBusinessHours) continue;

          // Send via Twilio
          await sendWhatsApp(`+${prospect.phone}`, followupMsg);

          // Save message in wa_messages
          // Bug #96 fix: Check insert result and log errors instead of swallowing them
          const { error: insertErr } = await supabase.from('wa_messages').insert({
            client_id: null,
            channel: 'prospect',
            direction: 'outbound',
            from_number: process.env.STEVE_WA_NUMBER || process.env.TWILIO_PHONE_NUMBER || '',
            to_number: prospect.phone,
            body: followupMsg,
            contact_name: prospectName || prospect.phone,
            contact_phone: prospect.phone,
          });
          if (insertErr) {
            console.error(`[prospect-followup] wa_messages insert failed after send:`, insertErr.message);
          }

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

          // Bug #40 fix: track goodbye recipients to avoid marking lost in same run
          if (followupType === 'goodbye') {
            goodbyeSentIds.add(prospect.id);
          }

        } catch (err) {
          console.error(`[prospect-followup] Error for ${prospect.phone}:`, err);
          results.errors++;
        }
      }

      // Mark prospects with 3+ follow-ups as lost
      const ghosted = await safeQuery<{ id: string; phone: string }>(
        supabase
          .from('wa_prospects')
          .select('id, phone')
          .not('stage', 'in', '("lost","converted")')
          .gte('followup_count', 3),
        'prospectFollowup.fetchGhosted',
      );

      if (ghosted.length > 0) {
        for (const g of ghosted) {
          // Bug #40 fix: skip prospects that just received goodbye in this run
          if (goodbyeSentIds.has(g.id)) continue;
          // Verify they haven't responded since last follow-up
          const lastInbound = await safeQuerySingleOrDefault<any>(
            supabase
              .from('wa_messages')
              .select('created_at')
              .eq('contact_phone', g.phone)
              .eq('channel', 'prospect')
              .eq('direction', 'inbound')
              .is('client_id', null)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
            null,
            'prospectFollowup.fetchLastInbound',
          );

          const lastOutbound = await safeQuerySingleOrDefault<any>(
            supabase
              .from('wa_messages')
              .select('created_at')
              .eq('contact_phone', g.phone)
              .eq('channel', 'prospect')
              .eq('direction', 'outbound')
              .is('client_id', null)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
            null,
            'prospectFollowup.fetchLastOutbound',
          );

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

    const deadProspects = await safeQuery<any>(
      supabase
        .from('wa_prospects')
        .select('id, phone, profile_name, name, what_they_sell')
        .eq('stage', 'lost')
        .eq('lost_reason', 'ghosted')
        .eq('resurrection_sent', false)
        .lt('updated_at', fourteenDaysAgo)
        .limit(10),
      'prospectFollowup.fetchDeadProspects',
    );

    if (deadProspects.length > 0) {
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

          // Bug #125 fix: skip resurrection sends outside Chile business hours
          if (outsideBusinessHours) continue;

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
