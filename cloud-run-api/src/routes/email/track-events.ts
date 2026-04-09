import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { TRACKING_PIXEL_GIF } from './send-email.js';
import { safeQueryOrDefault, safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

/**
 * Handle email open tracking via 1x1 transparent GIF.
 * GET /api/email-track/open?eid=EVENT_ID
 */
export async function trackOpen(c: Context) {
  const eventId = c.req.query('eid');

  if (eventId) {
    // Fire-and-forget: don't block the pixel response
    const supabase = getSupabaseAdmin();

    // Get the original event to find subscriber/campaign info
    (async () => {
      try {
        const data = await safeQuerySingleOrDefault<any>(
          supabase
            .from('email_events')
            .select('subscriber_id, client_id, campaign_id, flow_id')
            .eq('id', eventId)
            .eq('event_type', 'sent')
            .single(),
          null,
          'trackOpen.getSentEvent',
        );
        if (data) {
          const { error } = await supabase.from('email_events').insert({
            client_id: data.client_id,
            campaign_id: data.campaign_id,
            flow_id: data.flow_id,
            subscriber_id: data.subscriber_id,
            event_type: 'opened',
            metadata: {
              original_event_id: eventId,
              user_agent: c.req.header('user-agent') || null,
              ip: c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || null,
            },
          });
          if (error) console.error('Failed to record open event:', error);

          // Update last_engaged_at for smart send time & sunset detection
          await supabase
            .from('email_subscribers')
            .update({ last_engaged_at: new Date().toISOString() })
            .eq('id', data.subscriber_id);
        }
      } catch (err) {
        console.error('Open tracking error:', err);
      }
    })();
  }

  // Return 1x1 transparent GIF immediately
  return new Response(TRACKING_PIXEL_GIF, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(TRACKING_PIXEL_GIF.length),
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}

/**
 * Handle email click tracking via redirect.
 * GET /api/email-track/click?eid=EVENT_ID&url=ENCODED_URL
 */
export async function trackClick(c: Context) {
  const eventId = c.req.query('eid');
  const targetUrl = c.req.query('url');

  if (!targetUrl) {
    return c.text('Missing URL parameter', 400);
  }

  const decodedUrl = decodeURIComponent(targetUrl);

  // Validate redirect URL to prevent open redirect attacks
  try {
    const parsed = new URL(decodedUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return c.text('Invalid URL protocol', 400);
    }
  } catch {
    return c.text('Invalid URL', 400);
  }

  if (eventId) {
    // Fire-and-forget: record click then redirect
    const supabase = getSupabaseAdmin();

    (async () => {
      try {
        const data = await safeQuerySingleOrDefault<any>(
          supabase
            .from('email_events')
            .select('subscriber_id, client_id, campaign_id, flow_id')
            .eq('id', eventId)
            .eq('event_type', 'sent')
            .single(),
          null,
          'trackClick.getSentEvent',
        );
        if (data) {
          const { error } = await supabase.from('email_events').insert({
            client_id: data.client_id,
            campaign_id: data.campaign_id,
            flow_id: data.flow_id,
            subscriber_id: data.subscriber_id,
            event_type: 'clicked',
            metadata: {
              original_event_id: eventId,
              url: decodedUrl,
              user_agent: c.req.header('user-agent') || null,
              ip: c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || null,
            },
          });
          if (error) console.error('Failed to record click event:', error);

          // Update last_engaged_at for smart send time & sunset detection
          await supabase
            .from('email_subscribers')
            .update({ last_engaged_at: new Date().toISOString() })
            .eq('id', data.subscriber_id);
        }
      } catch (err) {
        console.error('Click tracking error:', err);
      }
    })();
  }

  // Redirect to target URL immediately
  return c.redirect(decodedUrl, 302);
}

/**
 * Handle SES webhook notifications (bounces, complaints, deliveries).
 * POST /api/email-ses-webhooks
 * SES sends SNS notifications to this endpoint.
 */
export async function sesWebhooks(c: Context) {
  const body = await c.req.json();
  const supabase = getSupabaseAdmin();

  // Handle SNS subscription confirmation
  if (body.Type === 'SubscriptionConfirmation') {
    console.log('SNS subscription confirmation received, confirming...');
    if (body.SubscribeURL) {
      // Validate that SubscribeURL is a legitimate AWS SNS endpoint to prevent SSRF
      const snsUrlPattern = /^https:\/\/sns\.[a-z0-9-]+\.amazonaws\.com\//;
      if (snsUrlPattern.test(body.SubscribeURL)) {
        await fetch(body.SubscribeURL);
      } else {
        console.error('[ses-webhooks] Rejected suspicious SubscribeURL:', body.SubscribeURL);
        return c.json({ error: 'Invalid SubscribeURL' }, 400);
      }
    }
    return c.json({ confirmed: true });
  }

  // Handle SNS notification
  if (body.Type === 'Notification') {
    let message: any;
    try {
      message = JSON.parse(body.Message);
    } catch {
      console.error('Failed to parse SNS message');
      return c.json({ error: 'Invalid message' }, 400);
    }

    const notificationType = message.notificationType || message.eventType;

    if (notificationType === 'Bounce') {
      const bounce = message.bounce;
      const isHardBounce = bounce.bounceType === 'Permanent';

      for (const recipient of bounce.bouncedRecipients || []) {
        const email = recipient.emailAddress?.toLowerCase();
        if (!email) continue;

        const subscribers = await safeQueryOrDefault<any>(
          supabase
            .from('email_subscribers')
            .select('id, client_id, bounce_count')
            .eq('email', email)
            .in('status', ['subscribed', 'bounced']),
          [],
          'sesWebhooks.getBounceSubscribers',
        );

        for (const sub of subscribers || []) {
          const currentBounceCount = (sub.bounce_count ?? 0) + 1;

          if (isHardBounce) {
            // Hard bounce: mark as bounced immediately, never send again
            await supabase
              .from('email_subscribers')
              .update({
                status: 'bounced',
                bounce_count: currentBounceCount,
                updated_at: new Date().toISOString(),
              })
              .eq('id', sub.id);
          } else {
            // Soft bounce: increment counter, mark as bounced after 3 attempts
            const newStatus = currentBounceCount >= 3 ? 'bounced' : 'subscribed';
            await supabase
              .from('email_subscribers')
              .update({
                status: newStatus,
                bounce_count: currentBounceCount,
                updated_at: new Date().toISOString(),
              })
              .eq('id', sub.id);
          }

          await supabase.from('email_events').insert({
            client_id: sub.client_id,
            subscriber_id: sub.id,
            event_type: 'bounced',
            metadata: {
              bounce_type: bounce.bounceType,
              bounce_sub_type: bounce.bounceSubType,
              is_hard_bounce: isHardBounce,
              bounce_count: currentBounceCount,
              diagnostic: recipient.diagnosticCode,
            },
          });
        }
      }
    }

    if (notificationType === 'Complaint') {
      const complaint = message.complaint;
      for (const recipient of complaint.complainedRecipients || []) {
        const email = recipient.emailAddress?.toLowerCase();
        if (!email) continue;

        const subscribers = await safeQueryOrDefault<any>(
          supabase
            .from('email_subscribers')
            .select('id, client_id')
            .eq('email', email),
          [],
          'sesWebhooks.getComplaintSubscribers',
        );

        for (const sub of subscribers || []) {
          await supabase
            .from('email_subscribers')
            .update({ status: 'complained', updated_at: new Date().toISOString() })
            .eq('id', sub.id);

          await supabase.from('email_events').insert({
            client_id: sub.client_id,
            subscriber_id: sub.id,
            event_type: 'complained',
            metadata: { feedback_type: complaint.complaintFeedbackType },
          });
        }
      }
    }

    if (notificationType === 'Delivery') {
      // Mark as delivered
      const delivery = message.delivery;
      for (const email of delivery.recipients || []) {
        // Find the most recent 'sent' event for this email
        const event = await safeQuerySingleOrDefault<any>(
          supabase
            .from('email_events')
            .select('id, client_id, subscriber_id, campaign_id, flow_id')
            .eq('event_type', 'sent')
            .eq('metadata->>to', email.toLowerCase())
            .order('created_at', { ascending: false })
            .limit(1)
            .single(),
          null,
          'sesWebhooks.getDeliveredSentEvent',
        );

        if (event) {
          await supabase.from('email_events').insert({
            client_id: event.client_id,
            campaign_id: event.campaign_id,
            flow_id: event.flow_id,
            subscriber_id: event.subscriber_id,
            event_type: 'delivered',
            metadata: { processing_time_ms: delivery.processingTimeMillis },
          });
        }
      }
    }
  }

  return c.json({ received: true });
}
