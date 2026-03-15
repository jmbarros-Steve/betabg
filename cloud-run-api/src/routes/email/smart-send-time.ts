import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/**
 * Smart Send Time — analyzes open history per subscriber to find optimal send hour.
 * POST /api/email-smart-send-time
 *
 * Actions:
 *   - analyze: Compute optimal send time for all subscribers of a client
 *   - get_distribution: Return hourly open distribution for a client
 *   - get_settings: Get smart send settings for a client
 *   - update_settings: Update smart send settings
 */
export async function smartSendTime(c: Context) {
  const body = await c.req.json();
  const { action, client_id } = body;

  if (!client_id) return c.json({ error: 'client_id is required' }, 400);

  const supabase = getSupabaseAdmin();

  switch (action) {
    case 'analyze': {
      // Get all open events for this client with timestamps
      const { data: openEvents, error: evErr } = await supabase
        .from('email_events')
        .select('subscriber_id, created_at')
        .eq('client_id', client_id)
        .eq('event_type', 'opened')
        .order('created_at', { ascending: false })
        .limit(10000);

      if (evErr) return c.json({ error: evErr.message }, 500);
      if (!openEvents || openEvents.length === 0) {
        return c.json({ updated: 0, message: 'No open events found to analyze' });
      }

      // Group opens by subscriber and compute optimal hour
      const subscriberOpens: Record<string, number[]> = {};
      for (const ev of openEvents) {
        const hour = new Date(ev.created_at).getUTCHours();
        if (!subscriberOpens[ev.subscriber_id]) {
          subscriberOpens[ev.subscriber_id] = [];
        }
        subscriberOpens[ev.subscriber_id].push(hour);
      }

      // Compute global average for subscribers without enough data
      const allHours: number[] = openEvents.map(e => new Date(e.created_at).getUTCHours());
      const globalAvgHour = computeOptimalHour(allHours);

      let updated = 0;
      const batchSize = 50;
      const subscriberIds = Object.keys(subscriberOpens);

      for (let i = 0; i < subscriberIds.length; i += batchSize) {
        const batch = subscriberIds.slice(i, i + batchSize);
        const updates = batch.map(subId => {
          const hours = subscriberOpens[subId];
          const minSample = 3; // Need at least 3 opens for individual prediction
          if (hours.length >= minSample) {
            return {
              id: subId,
              send_time_hour: computeOptimalHour(hours),
              send_time_confidence: Math.min(1, hours.length / 20), // Confidence scales with data
            };
          } else {
            return {
              id: subId,
              send_time_hour: globalAvgHour,
              send_time_confidence: 0.1, // Low confidence = using global average
            };
          }
        });

        // Batch update
        for (const u of updates) {
          const { error } = await supabase
            .from('email_subscribers')
            .update({
              send_time_hour: u.send_time_hour,
              send_time_confidence: u.send_time_confidence,
            })
            .eq('id', u.id);

          if (!error) updated++;
        }
      }

      // Also update subscribers with zero opens to use global average
      const { error: globalErr } = await supabase
        .from('email_subscribers')
        .update({
          send_time_hour: globalAvgHour,
          send_time_confidence: 0.05,
        })
        .eq('client_id', client_id)
        .eq('status', 'subscribed')
        .is('send_time_hour', null);

      return c.json({
        updated,
        global_avg_hour: globalAvgHour,
        total_opens_analyzed: openEvents.length,
        unique_subscribers: subscriberIds.length,
        global_update_error: globalErr?.message || null,
      });
    }

    case 'get_distribution': {
      // Return hourly open distribution for visualization
      const { data: openEvents, error } = await supabase
        .from('email_events')
        .select('created_at')
        .eq('client_id', client_id)
        .eq('event_type', 'opened')
        .limit(5000);

      if (error) return c.json({ error: error.message }, 500);

      const distribution: number[] = new Array(24).fill(0);
      for (const ev of openEvents || []) {
        const hour = new Date(ev.created_at).getUTCHours();
        distribution[hour]++;
      }

      const total = distribution.reduce((a, b) => a + b, 0);
      const percentages = distribution.map(count =>
        total > 0 ? Math.round((count / total) * 1000) / 10 : 0
      );

      return c.json({
        distribution,
        percentages,
        total_opens: total,
        optimal_hour: total > 0 ? computeOptimalHour(openEvents!.map(e => new Date(e.created_at).getUTCHours())) : null,
      });
    }

    case 'get_settings': {
      const { data, error } = await supabase
        .from('email_send_settings')
        .select('*')
        .eq('client_id', client_id)
        .maybeSingle();

      if (error) return c.json({ error: error.message }, 500);

      // Return defaults if no settings exist
      return c.json({
        settings: data || {
          client_id,
          rate_limit_per_hour: 500,
          smart_send_enabled: true,
          auto_cleanup_enabled: true,
          sunset_days: 90,
        },
      });
    }

    case 'update_settings': {
      const { rate_limit_per_hour, smart_send_enabled, auto_cleanup_enabled, sunset_days } = body;

      const { data, error } = await supabase
        .from('email_send_settings')
        .upsert({
          client_id,
          ...(rate_limit_per_hour !== undefined && { rate_limit_per_hour }),
          ...(smart_send_enabled !== undefined && { smart_send_enabled }),
          ...(auto_cleanup_enabled !== undefined && { auto_cleanup_enabled }),
          ...(sunset_days !== undefined && { sunset_days }),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true, settings: data });
    }

    default:
      return c.json({ error: `Unknown action: ${action}` }, 400);
  }
}

/**
 * Compute the optimal send hour from an array of open hours.
 * Uses circular mean to handle midnight wraparound (23:00 and 01:00 should average to 00:00, not 12:00).
 */
function computeOptimalHour(hours: number[]): number {
  if (hours.length === 0) return 10; // Default to 10 AM UTC

  // Circular mean for hours (treats 0-23 as angles on a circle)
  let sinSum = 0;
  let cosSum = 0;
  for (const h of hours) {
    const angle = (h / 24) * 2 * Math.PI;
    sinSum += Math.sin(angle);
    cosSum += Math.cos(angle);
  }

  let avgAngle = Math.atan2(sinSum / hours.length, cosSum / hours.length);
  if (avgAngle < 0) avgAngle += 2 * Math.PI;

  const avgHour = Math.round((avgAngle / (2 * Math.PI)) * 24) % 24;
  return avgHour;
}
