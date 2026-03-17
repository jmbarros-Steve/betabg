import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

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

    // Future: update campaign metrics via RPC if needed

    return c.text('OK');
  } catch (err) {
    console.error('[wa-status-callback] Error:', err);
    return c.text('OK'); // Always return 200 to Twilio
  }
}
