import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

/**
 * POST /api/whatsapp/status-callback
 * Twilio calls this when message status changes (sent -> delivered -> read -> failed).
 * Body is form-encoded by Twilio.
 */
export async function waStatusCallback(c: Context) {
  try {
    // Bug #62 fix: Validate Twilio signature to reject forged webhooks.
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    if (!twilioAuthToken) {
      console.error('[wa-status-callback] TWILIO_AUTH_TOKEN not configured — rejecting webhook');
      return c.text('Forbidden', 403);
    }

    const formData = await c.req.parseBody();

    {
      const sig = c.req.header('X-Twilio-Signature') || '';
      if (!sig) {
        console.warn('[wa-status-callback] Missing X-Twilio-Signature header — rejecting');
        return c.text('Forbidden', 403);
      }
      const proto = c.req.header('x-forwarded-proto') || 'https';
      const host = c.req.header('host') || '';
      const reqUrl = c.req.url;
      const rawUrl = host
        ? `${proto}://${host}${new URL(reqUrl).pathname}`
        : reqUrl.replace(/^http:\/\//i, 'https://');
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(formData)) params[k] = String(v ?? '');
      const twilioMod = await import('twilio');
      const validateRequest = (twilioMod.default as any)?.validateRequest ?? (twilioMod as any).validateRequest;
      if (typeof validateRequest !== 'function') {
        console.error('[wa-status-callback] validateRequest not found in twilio module — skipping validation');
      } else if (!validateRequest(twilioAuthToken, sig, rawUrl, params)) {
        console.warn(`[wa-status-callback] Invalid Twilio signature — rejecting request from ${rawUrl}`);
        return c.text('Forbidden', 403);
      }
    }

    const messageSid = formData['MessageSid'] as string;
    const status = formData['MessageStatus'] as string; // sent | delivered | read | failed | undelivered
    const errorCode = formData['ErrorCode'] as string | undefined;

    if (!messageSid || !status) {
      return c.text('OK'); // Don't error on malformed callbacks
    }

    const supabase = getSupabaseAdmin();

    // Bug #67 fix: READ the current message BEFORE updating, so we can detect
    // whether the status actually changed (prevents idempotency guard from always
    // matching due to update-then-read race).
    const existingMsg = await safeQuerySingleOrDefault<any>(
      supabase
        .from('wa_messages')
        .select('metadata, status')
        .eq('message_sid', messageSid)
        .single(),
      null,
      'statusCallback.getMsg',
    );

    const previousStatus = existingMsg?.status;
    const existingMetadata = (existingMsg?.metadata as Record<string, any>) || {};

    // Bug #82 fix: MERGE error_code into existing metadata instead of replacing.
    // Previously, setting metadata = { error_code } destroyed campaign_id and other fields.
    const updatePayload: Record<string, any> = { status };
    if (errorCode) {
      updatePayload.metadata = { ...existingMetadata, error_code: errorCode };
    }

    await supabase
      .from('wa_messages')
      .update(updatePayload)
      .eq('message_sid', messageSid);

    // Bug #51 fix: check current message status to prevent duplicate increments on Twilio retries
    // Only increment campaign counters if the status is actually changing
    if (status === 'delivered' || status === 'read') {
      // Bug #67: previousStatus is now read BEFORE the update, so this check is accurate
      if (previousStatus === status) {
        // Duplicate callback — skip counter increment
        return c.text('OK');
      }

      const campaignId = existingMetadata?.campaign_id;
      if (campaignId) {
        const column = status === 'delivered' ? 'delivered_count' : 'read_count';
        await supabase.rpc('increment_campaign_counter', {
          p_campaign_id: campaignId,
          p_column: column,
        });
      }
    }

    return c.text('OK');
  } catch (err) {
    console.error('[wa-status-callback] Error:', err);
    return c.text('OK'); // Always return 200 to Twilio
  }
}
