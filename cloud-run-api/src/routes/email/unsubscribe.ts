import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { verifyUnsubscribeToken } from './send-email.js';

/**
 * Handle email unsubscribe.
 * GET /api/email-unsubscribe?token=TOKEN
 *
 * Verifies the HMAC-signed token, marks subscriber as unsubscribed,
 * and shows a confirmation page.
 */
export async function emailUnsubscribe(c: Context) {
  const token = c.req.query('token');

  if (!token) {
    return c.html(renderPage('Error', 'Invalid unsubscribe link. No token provided.'));
  }

  const verified = verifyUnsubscribeToken(token);
  if (!verified) {
    return c.html(renderPage('Error', 'This unsubscribe link is invalid or has expired.'));
  }

  const { subscriberId, clientId } = verified;
  const supabase = getSupabaseAdmin();

  // Check if subscriber exists
  const { data: subscriber, error: fetchErr } = await supabase
    .from('email_subscribers')
    .select('id, email, status, first_name')
    .eq('id', subscriberId)
    .eq('client_id', clientId)
    .single();

  if (fetchErr || !subscriber) {
    return c.html(renderPage('Error', 'Subscriber not found.'));
  }

  if (subscriber.status === 'unsubscribed') {
    return c.html(renderPage(
      'Already Unsubscribed',
      `${subscriber.email} is already unsubscribed. You won't receive any more emails from us.`
    ));
  }

  // Mark as unsubscribed
  const { error: updateErr } = await supabase
    .from('email_subscribers')
    .update({
      status: 'unsubscribed',
      unsubscribed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', subscriberId)
    .eq('client_id', clientId);

  if (updateErr) {
    console.error('Failed to unsubscribe:', updateErr);
    return c.html(renderPage('Error', 'Something went wrong. Please try again later.'));
  }

  // Record unsubscribe event
  await supabase.from('email_events').insert({
    client_id: clientId,
    subscriber_id: subscriberId,
    event_type: 'unsubscribed',
    metadata: {
      method: 'link_click',
      user_agent: c.req.header('user-agent') || null,
    },
  });

  // Cancel any active flow enrollments for this subscriber
  await supabase
    .from('email_flow_enrollments')
    .update({ status: 'cancelled', completed_at: new Date().toISOString() })
    .eq('subscriber_id', subscriberId)
    .eq('client_id', clientId)
    .eq('status', 'active');

  const name = subscriber.first_name || subscriber.email;
  return c.html(renderPage(
    'Unsubscribed',
    `${name}, you have been successfully unsubscribed. You will no longer receive marketing emails from us.`
  ));
}

/**
 * Escape HTML special characters to prevent XSS.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render a simple branded HTML page.
 */
function renderPage(title: string, message: string): string {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle} - Steve Mail</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8f9fa;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 12px;
      padding: 40px;
      max-width: 480px;
      width: 100%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      text-align: center;
    }
    .icon {
      font-size: 48px;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 24px;
      color: #1a1a1a;
      margin-bottom: 12px;
    }
    p {
      font-size: 16px;
      color: #666;
      line-height: 1.5;
    }
    .footer {
      margin-top: 24px;
      font-size: 13px;
      color: #999;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${title === 'Error' ? '&#9888;&#65039;' : '&#9993;&#65039;'}</div>
    <h1>${safeTitle}</h1>
    <p>${safeMessage}</p>
    <p class="footer">Powered by Steve Mail</p>
  </div>
</body>
</html>`;
}
