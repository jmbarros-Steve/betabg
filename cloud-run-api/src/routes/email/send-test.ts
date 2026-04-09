import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { Resend } from 'resend';

/**
 * POST /api/email/send-test
 * Sends a test email via Resend API (not Klaviyo).
 *
 * Body: { to, subject, html, from_name?, from_email? }
 */
export async function sendTestEmail(c: Context) {
  try {
    const supabase = getSupabaseAdmin();
    const isInternal = c.get('isInternal') === true;

    if (!isInternal) {
      const user = c.get('user');
      if (!user) return c.json({ error: 'Unauthorized' }, 401);
    }

    const { to, subject, html, from_name, from_email } = await c.req.json();

    if (!to || !subject || !html) {
      return c.json({ error: 'to, subject, and html are required' }, 400);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return c.json({ error: 'Invalid email address' }, 400);
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return c.json({ error: 'RESEND_API_KEY not configured' }, 500);
    }

    if (!from_email) {
      return c.json({ error: 'from_email is required' }, 400);
    }

    const resend = new Resend(resendApiKey);
    const senderName = from_name || 'Steve Ads';
    const senderEmail = from_email;

    const { data, error } = await resend.emails.send({
      from: `${senderName} <${senderEmail}>`,
      to: [to],
      subject: `[TEST] ${subject}`,
      html,
    });

    if (error) {
      console.error('[email/send-test] Resend error:', error);
      return c.json({ error: 'Failed to send test email', detail: error.message }, 500);
    }

    return c.json({
      success: true,
      message_id: data?.id,
      sent_to: to,
      subject: `[TEST] ${subject}`,
    });
  } catch (error: any) {
    console.error('[email/send-test] Error:', error);
    return c.json({ error: error.message }, 500);
  }
}
