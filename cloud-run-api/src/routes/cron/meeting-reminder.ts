import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { sendWhatsApp } from '../../lib/twilio-client.js';
import { safeQuery } from '../../lib/safe-supabase.js';

/**
 * Meeting Reminder Cron — Mini CRM Pipeline
 *
 * Runs every 30 minutes. Handles:
 * 1. 24h reminder: meeting_at - now <= 24h, reminder_24h_sent = false
 * 2. 2h reminder: meeting_at - now <= 2h, reminder_2h_sent = false
 * 3. No-show: meeting_at < now and not confirmed/completed → auto-cancel
 *
 * Auth: X-Cron-Secret header
 * Cron: 0,30 * * * * (every 30 min)
 */
export async function meetingReminder(c: Context) {
  const cronSecret = c.req.header('X-Cron-Secret')?.trim();
  const expected = process.env.CRON_SECRET;
  if (!expected || cronSecret !== expected) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const results = { reminders_24h: 0, reminders_2h: 0, no_shows: 0, errors: 0 };

  try {
    // Fetch all prospects with scheduled meetings that need action
    const prospects = await safeQuery<{
      id: string;
      phone: string;
      profile_name: string | null;
      name: string | null;
      apellido: string | null;
      meeting_at: string;
      meeting_url: string | null;
      meeting_status: string | null;
      reminder_24h_sent: boolean | null;
      reminder_2h_sent: boolean | null;
      lead_score: number | null;
      stage: string | null;
    }>(
      supabase
        .from('wa_prospects')
        .select('id, phone, profile_name, name, apellido, meeting_at, meeting_url, meeting_status, reminder_24h_sent, reminder_2h_sent, lead_score, stage')
        .in('meeting_status', ['scheduled', 'reminded_24h', 'reminded_2h'])
        .not('meeting_at', 'is', null)
        .limit(50),
      'meetingReminder.fetchPendingMeetings',
    );

    if (prospects.length === 0) {
      return c.json({ success: true, message: 'No meetings to process', ...results });
    }

    const steveNumber = process.env.STEVE_WA_NUMBER || process.env.TWILIO_PHONE_NUMBER || '';

    for (const p of prospects) {
      try {
        const meetingAt = new Date(p.meeting_at);
        const hoursUntilMeeting = (meetingAt.getTime() - now.getTime()) / (1000 * 60 * 60);
        const prospectName = p.name || p.profile_name || '';
        const meetingTimeStr = meetingAt.toLocaleString('es-CL', {
          timeZone: 'America/Santiago',
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          hour: '2-digit',
          minute: '2-digit',
        });

        // ============================================================
        // Case 1: No-show — meeting time passed and not confirmed/completed
        // ============================================================
        if (hoursUntilMeeting < 0) {
          const msg = `Hey ${prospectName || 'amigo'}! Como no alcanzamos a confirmar, cancelé la reunión. Cuando quieras la reagendamos, sin problema 🐕`;

          await sendWhatsApp(`+${p.phone}`, msg);

          // Save outbound message
          await supabase.from('wa_messages').insert({
            client_id: null,
            channel: 'prospect',
            direction: 'outbound',
            from_number: steveNumber,
            to_number: p.phone,
            body: msg,
            contact_name: prospectName || p.phone,
            contact_phone: p.phone,
          });

          // Update prospect: cancel meeting, reduce score, back to qualifying
          const newScore = Math.max(0, (p.lead_score || 0) - 20);
          await supabase
            .from('wa_prospects')
            .update({
              meeting_status: 'no_show',
              lead_score: newScore,
              stage: 'qualifying',
              updated_at: now.toISOString(),
            })
            .eq('id', p.id);

          results.no_shows++;
          console.log(`[meeting-reminder] No-show: ${p.phone}, score ${p.lead_score} → ${newScore}`);
          continue;
        }

        // ============================================================
        // Case 2: 2h reminder (takes priority over 24h if both apply)
        // ============================================================
        if (hoursUntilMeeting <= 2 && !p.reminder_2h_sent) {
          const urlPart = p.meeting_url ? `\n\nLink: ${p.meeting_url}` : '';
          const msg = `${prospectName ? prospectName + ', en' : 'En'} 2 horas nos vemos! ${meetingTimeStr}.${urlPart}\n\n¿Confirmado? 🐕`;

          await sendWhatsApp(`+${p.phone}`, msg);

          await supabase.from('wa_messages').insert({
            client_id: null,
            channel: 'prospect',
            direction: 'outbound',
            from_number: steveNumber,
            to_number: p.phone,
            body: msg,
            contact_name: prospectName || p.phone,
            contact_phone: p.phone,
          });

          await supabase
            .from('wa_prospects')
            .update({
              reminder_2h_sent: true,
              meeting_status: 'reminded_2h',
              updated_at: now.toISOString(),
            })
            .eq('id', p.id);

          results.reminders_2h++;
          console.log(`[meeting-reminder] 2h reminder sent to ${p.phone}`);
          continue;
        }

        // ============================================================
        // Case 3: 24h reminder
        // ============================================================
        if (hoursUntilMeeting <= 24 && !p.reminder_24h_sent) {
          const msg = `Hey ${prospectName || 'amigo'}! Mañana tenemos nuestra llamada a las ${meetingTimeStr}. ¿Todo en pie? 🐕`;

          await sendWhatsApp(`+${p.phone}`, msg);

          await supabase.from('wa_messages').insert({
            client_id: null,
            channel: 'prospect',
            direction: 'outbound',
            from_number: steveNumber,
            to_number: p.phone,
            body: msg,
            contact_name: prospectName || p.phone,
            contact_phone: p.phone,
          });

          await supabase
            .from('wa_prospects')
            .update({
              reminder_24h_sent: true,
              meeting_status: 'reminded_24h',
              updated_at: now.toISOString(),
            })
            .eq('id', p.id);

          results.reminders_24h++;
          console.log(`[meeting-reminder] 24h reminder sent to ${p.phone}`);
        }

      } catch (err) {
        console.error(`[meeting-reminder] Error for ${p.phone}:`, err);
        results.errors++;
      }
    }

    console.log('[meeting-reminder] Done:', JSON.stringify(results));
    return c.json({ success: true, ...results });

  } catch (err: any) {
    console.error('[meeting-reminder] Fatal error:', err);
    return c.json({ error: err.message }, 500);
  }
}
