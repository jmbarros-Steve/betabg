import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

/**
 * POST /api/whatsapp/status-callback
 * Twilio calls this when message status changes (sent → delivered → read → failed).
 * Body is form-encoded by Twilio.
 */
export async function waStatusCallback(c: Context) {
  try {
    const formData = await c.req.parseBody();
    const messageSid = formData['MessageSid'] as string;
    const status = formData['MessageStatus'] as string; // sent | delivered | read | failed | undelivered
    const errorCode = formData['ErrorCode'] as string | undefined;

    if (!messageSid || !status) {
      return c.text('OK'); // Don't error on malformed callbacks
    }

    const supabase = getSupabaseAdmin();

    // Update message status
    await supabase
      .from('wa_messages')
      .update({
        status,
        metadata: errorCode ? { error_code: errorCode } : undefined,
      })
      .eq('message_sid', messageSid);

    // Issue 5: Update campaign metrics if this message belongs to a campaign
    if (status === 'delivered' || status === 'read') {
      const msg = await safeQuerySingleOrDefault<any>(
        supabase
          .from('wa_messages')
          .select('metadata')
          .eq('message_sid', messageSid)
          .single(),
        null,
        'statusCallback.getMsg',
      );

      const campaignId = (msg?.metadata as any)?.campaign_id;
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
