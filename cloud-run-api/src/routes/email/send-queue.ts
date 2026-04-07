import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { sendSingleEmail } from './send-email.js';

/**
 * Email Send Queue — throttled sending with priority and rate limiting.
 * POST /api/email-send-queue
 *
 * Actions:
 *   - enqueue: Add emails to the queue (used by campaign send)
 *   - process: Process queued emails respecting rate limits (called by cron/Cloud Task)
 *   - status: Get queue status for a campaign or client
 *   - cancel: Cancel all queued emails for a campaign
 */
export async function emailSendQueue(c: Context) {
  const body = await c.req.json();
  const { action, client_id } = body;

  if (!client_id) return c.json({ error: 'client_id is required' }, 400);

  const supabase = getSupabaseAdmin();

  switch (action) {
    case 'enqueue': {
      const { items } = body as {
        items: Array<{
          campaign_id?: string;
          flow_id?: string;
          subscriber_id: string;
          subject: string;
          html_content: string;
          from_email: string;
          from_name: string;
          reply_to?: string;
          ab_variant?: 'a' | 'b';
          priority?: number;
          scheduled_for?: string;
        }>;
      };

      if (!items || !Array.isArray(items) || items.length === 0) {
        return c.json({ error: 'items array is required' }, 400);
      }

      // Get smart send settings for this client
      const { data: settings } = await supabase
        .from('email_send_settings')
        .select('smart_send_enabled')
        .eq('client_id', client_id)
        .maybeSingle();

      const smartSendEnabled = settings?.smart_send_enabled ?? true;

      // If smart send is enabled, fetch subscriber send times
      let subscriberSendTimes: Record<string, number | null> = {};
      if (smartSendEnabled) {
        const subIds = [...new Set(items.map(i => i.subscriber_id))];
        // Batch fetch in chunks of 100
        for (let i = 0; i < subIds.length; i += 100) {
          const batch = subIds.slice(i, i + 100);
          const { data } = await supabase
            .from('email_subscribers')
            .select('id, send_time_hour')
            .in('id', batch);

          for (const sub of data || []) {
            subscriberSendTimes[sub.id] = sub.send_time_hour;
          }
        }
      }

      // Build queue entries
      const queueEntries = items.map(item => {
        let scheduledFor = item.scheduled_for ? new Date(item.scheduled_for) : new Date();

        // If smart send is enabled and subscriber has a preferred hour, adjust scheduled_for
        if (smartSendEnabled && !item.scheduled_for) {
          const preferredHour = subscriberSendTimes[item.subscriber_id];
          if (preferredHour != null) {
            scheduledFor = getNextOccurrenceOfHour(preferredHour);
          }
        }

        return {
          client_id,
          campaign_id: item.campaign_id || null,
          flow_id: item.flow_id || null,
          subscriber_id: item.subscriber_id,
          subject: item.subject,
          html_content: item.html_content,
          from_email: item.from_email,
          from_name: item.from_name || 'Steve',
          reply_to: item.reply_to || null,
          ab_variant: item.ab_variant || null,
          priority: item.priority ?? 5,
          status: 'queued' as const,
          scheduled_for: scheduledFor.toISOString(),
        };
      });

      // Insert in batches of 100
      let totalInserted = 0;
      for (let i = 0; i < queueEntries.length; i += 100) {
        const batch = queueEntries.slice(i, i + 100);
        const { error } = await supabase.from('email_send_queue').insert(batch);
        if (error) {
          console.error(`[send-queue] Batch insert error at ${i}:`, error.message);
        } else {
          totalInserted += batch.length;
        }
      }

      return c.json({
        success: true,
        queued: totalInserted,
        total: items.length,
        smart_send: smartSendEnabled,
      });
    }

    case 'process': {
      // Process queued emails respecting rate limits
      // This should be called by a cron job or Cloud Task every minute

      // Get rate limit setting
      const { data: settings } = await supabase
        .from('email_send_settings')
        .select('rate_limit_per_hour')
        .eq('client_id', client_id)
        .maybeSingle();

      const rateLimit = settings?.rate_limit_per_hour ?? 500;
      const batchLimit = Math.max(1, Math.floor(rateLimit / 60)); // Per-minute batch

      // Count emails sent in the last hour for rate limiting
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
      const { count: sentLastHour } = await supabase
        .from('email_send_queue')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', client_id)
        .eq('status', 'sent')
        .gte('processed_at', oneHourAgo);

      const remaining = rateLimit - (sentLastHour || 0);
      if (remaining <= 0) {
        return c.json({
          processed: 0,
          message: 'Rate limit reached, try again later',
          sent_last_hour: sentLastHour,
          rate_limit: rateLimit,
        });
      }

      const toProcess = Math.min(batchLimit, remaining);

      // Fetch queued emails ordered by priority then scheduled_for
      const { data: queueItems, error: fetchErr } = await supabase
        .from('email_send_queue')
        .select('*')
        .eq('client_id', client_id)
        .eq('status', 'queued')
        .lte('scheduled_for', new Date().toISOString())
        .order('priority', { ascending: true })
        .order('scheduled_for', { ascending: true })
        .limit(toProcess);

      if (fetchErr || !queueItems || queueItems.length === 0) {
        return c.json({ processed: 0, message: 'No emails to process' });
      }

      // Mark as processing (optimistic lock).
      // We set processed_at = now() here as a "last touched" marker so the
      // email-queue-tick sweeper can detect items stuck in 'processing' and
      // recover them. processed_at will be overwritten on success/failure.
      // It's safe for the rate-limit query because that query filters by
      // status='sent' (processing items won't count).
      const itemIds = queueItems.map(q => q.id);
      await supabase
        .from('email_send_queue')
        .update({ status: 'processing', processed_at: new Date().toISOString() })
        .in('id', itemIds);

      let sent = 0;
      let failed = 0;

      // Pre-fetch subscriber emails
      const subIds = [...new Set(queueItems.map(q => q.subscriber_id))];
      const { data: subs } = await supabase
        .from('email_subscribers')
        .select('id, email')
        .in('id', subIds);
      const emailMap: Record<string, string> = {};
      for (const s of subs || []) emailMap[s.id] = s.email;

      for (const item of queueItems) {
        const subscriberEmail = emailMap[item.subscriber_id];
        if (!subscriberEmail) {
          await supabase.from('email_send_queue').update({ status: 'failed', last_error: 'Subscriber not found' }).eq('id', item.id);
          failed++;
          continue;
        }
        try {
          const result = await sendSingleEmail({
            to: subscriberEmail,
            subject: item.subject,
            htmlContent: item.html_content,
            fromEmail: item.from_email,
            fromName: item.from_name,
            replyTo: item.reply_to || undefined,
            subscriberId: item.subscriber_id,
            clientId: item.client_id,
            campaignId: item.campaign_id || undefined,
            flowId: item.flow_id || undefined,
            abVariant: item.ab_variant || undefined,
          });

          if (result.success) {
            await supabase
              .from('email_send_queue')
              .update({
                status: 'sent',
                processed_at: new Date().toISOString(),
                attempts: item.attempts + 1,
              })
              .eq('id', item.id);
            sent++;
          } else {
            const newAttempts = item.attempts + 1;
            const newStatus = newAttempts >= item.max_attempts ? 'failed' : 'queued';
            await supabase
              .from('email_send_queue')
              .update({
                status: newStatus,
                attempts: newAttempts,
                last_error: result.error || 'Unknown error',
                ...(newStatus === 'failed' && { processed_at: new Date().toISOString() }),
              })
              .eq('id', item.id);
            failed++;
          }
        } catch (err: any) {
          const newAttempts = item.attempts + 1;
          await supabase
            .from('email_send_queue')
            .update({
              status: newAttempts >= item.max_attempts ? 'failed' : 'queued',
              attempts: newAttempts,
              last_error: err.message,
            })
            .eq('id', item.id);
          failed++;
        }
      }

      // Update campaign sent_count and status if applicable.
      // Collect all distinct campaign_ids in this batch (could be multiple if
      // several campaigns are being processed together).
      const campaignIds = [...new Set(queueItems.map((q) => q.campaign_id).filter(Boolean) as string[])];
      for (const campaignId of campaignIds) {
        const { count: totalSent } = await supabase
          .from('email_send_queue')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaignId)
          .eq('status', 'sent');

        // Check if there are still pending items (queued or processing) for this campaign.
        const { count: stillPending } = await supabase
          .from('email_send_queue')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaignId)
          .in('status', ['queued', 'processing']);

        const update: Record<string, any> = {
          sent_count: totalSent || 0,
          updated_at: new Date().toISOString(),
        };

        // Only transition to 'sent' when there is nothing left to process.
        if ((stillPending || 0) === 0) {
          update.status = 'sent';
        }

        await supabase
          .from('email_campaigns')
          .update(update)
          .eq('id', campaignId);
      }

      return c.json({ processed: queueItems.length, sent, failed, rate_limit: rateLimit });
    }

    case 'status': {
      const { campaign_id } = body;

      const filter = campaign_id
        ? supabase.from('email_send_queue').select('status', { count: 'exact' }).eq('campaign_id', campaign_id)
        : supabase.from('email_send_queue').select('status', { count: 'exact' }).eq('client_id', client_id);

      // Count by status
      const statuses = ['queued', 'processing', 'sent', 'failed', 'cancelled'] as const;
      const counts: Record<string, number> = {};

      for (const s of statuses) {
        const baseQuery = campaign_id
          ? supabase.from('email_send_queue').select('*', { count: 'exact', head: true }).eq('campaign_id', campaign_id).eq('status', s)
          : supabase.from('email_send_queue').select('*', { count: 'exact', head: true }).eq('client_id', client_id).eq('status', s);

        const { count } = await baseQuery;
        counts[s] = count || 0;
      }

      return c.json({ counts, total: Object.values(counts).reduce((a, b) => a + b, 0) });
    }

    case 'cancel': {
      const { campaign_id } = body;
      if (!campaign_id) return c.json({ error: 'campaign_id is required' }, 400);

      const { data: cancelled, error } = await supabase
        .from('email_send_queue')
        .update({ status: 'cancelled', processed_at: new Date().toISOString() })
        .eq('campaign_id', campaign_id)
        .eq('status', 'queued')
        .select('id');

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true, cancelled: cancelled?.length || 0 });
    }

    default:
      return c.json({ error: `Unknown action: ${action}` }, 400);
  }
}

/**
 * Get the next occurrence of a given UTC hour.
 * If the hour has already passed today, returns tomorrow at that hour.
 */
function getNextOccurrenceOfHour(hour: number): Date {
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(hour, 0, 0, 0);

  if (target <= now) {
    target.setUTCDate(target.getUTCDate() + 1);
  }

  return target;
}
