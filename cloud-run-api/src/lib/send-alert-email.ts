import { getSupabaseAdmin } from './supabase.js';
import { safeQuerySingleOrDefault } from './safe-supabase.js';

/**
 * Send a system alert email to a merchant via Resend.
 * Used by fatigue-detector, performance-evaluator, and CPA alerts.
 * Falls back gracefully if RESEND_API_KEY is not configured.
 */
export async function sendAlertEmail(
  clientId: string,
  subject: string,
  bodyHtml: string
): Promise<boolean> {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.warn('[send-alert-email] RESEND_API_KEY not configured, skipping email');
    return false;
  }

  try {
    // Get merchant email from clients table
    const supabase = getSupabaseAdmin();
    const client = await safeQuerySingleOrDefault<{ name: string; company: string | null; client_user_id: string | null }>(
      supabase
        .from('clients')
        .select('name, company, client_user_id')
        .eq('id', clientId)
        .single(),
      null,
      'send-alert-email.fetchClient',
    );

    if (!client?.client_user_id) {
      console.warn(`[send-alert-email] No client_user_id for ${clientId}`);
      return false;
    }

    // Get email from auth.users via user_id
    const { data: userData } = await supabase.auth.admin.getUserById(client.client_user_id);
    const merchantEmail = userData?.user?.email;

    if (!merchantEmail) {
      console.warn(`[send-alert-email] No email for user ${client.client_user_id}`);
      return false;
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Steve Ads <alertas@steve.cl>',
        to: merchantEmail,
        subject,
        html: bodyHtml,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[send-alert-email] Resend error: ${res.status} ${err}`);
      return false;
    }

    console.log(`[send-alert-email] Sent to ${merchantEmail}: ${subject}`);
    return true;
  } catch (err: any) {
    console.error('[send-alert-email] Error:', err.message);
    return false;
  }
}
