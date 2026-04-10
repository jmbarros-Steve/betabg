import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

import { decryptToken } from './setup-merchant.js';

/**
 * Bug #135 fix: Status order map to prevent out-of-order callbacks
 * from regressing a message status (e.g. overwriting "failed" with "delivered").
 * Terminal states (failed/undelivered) have the highest priority (99)
 * so they can always override, but nothing can override them.
 */
const STATUS_ORDER: Record<string, number> = {
  queued: 0,
  sending: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: 99,
  undelivered: 99,
};

/**
 * POST /api/whatsapp/status-callback
 * Twilio calls this when message status changes (sent -> delivered -> read -> failed).
 * Body is form-encoded by Twilio.
 */
export async function waStatusCallback(c: Context) {
  try {
    // Bug #62 fix: Validate Twilio signature to reject forged webhooks.
    const masterAuthToken = process.env.TWILIO_AUTH_TOKEN;
    if (!masterAuthToken) {
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

      // Bug #151 fix: Sub-account callbacks are signed with the sub-account's auth token,
      // not the master token. Look up the correct token based on AccountSid.
      const accountSid = String(formData['AccountSid'] || '');
      let authToken = masterAuthToken;
      if (accountSid && accountSid !== process.env.TWILIO_ACCOUNT_SID) {
        try {
          const supabaseForLookup = getSupabaseAdmin();
          const { data: subAcct } = await supabaseForLookup
            .from('wa_twilio_accounts')
            .select('twilio_auth_token')
            .eq('twilio_account_sid', accountSid)
            .single();
          if (subAcct?.twilio_auth_token) {
            authToken = decryptToken(subAcct.twilio_auth_token);
          } else {
            console.warn(`[wa-status-callback] Bug #151: No sub-account found for AccountSid ${accountSid}, falling back to master token`);
          }
        } catch (lookupErr) {
          console.error(`[wa-status-callback] Bug #151: Failed to lookup sub-account token for ${accountSid}:`, lookupErr);
          // Fall back to master token — will fail validation if it's truly a sub-account
        }
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
      } else if (!validateRequest(authToken, sig, rawUrl, params)) {
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
    // Bug #199 fix: Use .limit(1) instead of .single() to handle duplicate message_sid
    // gracefully. .single() throws PGRST116 when multiple rows match (e.g. from Twilio
    // retries that both got inserted before the idempotency check). Using .limit(1)
    // returns at most one row without throwing on duplicates.
    const { data: existingMsgRows } = await supabase
      .from('wa_messages')
      .select('metadata, status')
      .eq('message_sid', messageSid)
      .limit(1);
    const existingMsg = existingMsgRows?.[0] || null;

    const previousStatus = existingMsg?.status;
    const existingMetadata = (existingMsg?.metadata as Record<string, any>) || {};

    // Bug #135 fix: Prevent out-of-order callbacks from regressing status.
    // Twilio may deliver callbacks out of order (e.g. "delivered" arrives after "failed").
    // Terminal states (failed=99, undelivered=99) always override, but lower states
    // cannot overwrite higher ones.
    const currentOrder = STATUS_ORDER[previousStatus] ?? 0;
    const newOrder = STATUS_ORDER[status] ?? 0;
    if (previousStatus && newOrder <= currentOrder && newOrder < 99) {
      console.log(`[wa-status-callback] Bug #135: Skipping status regression ${previousStatus}(${currentOrder}) -> ${status}(${newOrder}) for ${messageSid}`);
      return c.text('OK');
    }

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
