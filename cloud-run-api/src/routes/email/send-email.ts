import { Context } from 'hono';
import { Resend } from 'resend';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

// Lazy-init Resend client
let resendClient: Resend | null = null;
function getResendClient(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY!);
  }
  return resendClient;
}

const API_BASE_URL = () => process.env.API_BASE_URL || 'https://steve-api-850416724643.us-central1.run.app';
const UNSUBSCRIBE_SECRET = () => {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret) {
    throw new Error('UNSUBSCRIBE_SECRET not configured');
  }
  return secret;
};

// 1x1 transparent GIF
export const TRACKING_PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

/**
 * Generate HMAC-signed unsubscribe token.
 */
export function generateUnsubscribeToken(subscriberId: string, clientId: string): string {
  const payload = `${subscriberId}:${clientId}`;
  const hmac = createHmac('sha256', UNSUBSCRIBE_SECRET()).update(payload).digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64url');
}

/**
 * Verify unsubscribe token. Returns { subscriberId, clientId } or null.
 */
export function verifyUnsubscribeToken(token: string): { subscriberId: string; clientId: string } | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const parts = decoded.split(':');
    if (parts.length !== 3) return null;
    const [subscriberId, clientId, providedHmac] = parts;
    const expectedHmac = createHmac('sha256', UNSUBSCRIBE_SECRET())
      .update(`${subscriberId}:${clientId}`)
      .digest('hex');
    // Use timingSafeEqual to prevent timing attacks on HMAC comparison
    const providedBuffer = Buffer.from(providedHmac);
    const expectedBuffer = Buffer.from(expectedHmac);
    const isValid = providedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(providedBuffer, expectedBuffer);
    if (!isValid) return null;
    return { subscriberId, clientId };
  } catch (err) {
    console.error('[send-email] verifyUnsubscribeToken failed:', err);
    return null;
  }
}

/**
 * Inject tracking pixel before </body> in HTML.
 */
function injectTrackingPixel(html: string, eventId: string): string {
  const pixelUrl = `${API_BASE_URL()}/api/email-track/open?eid=${eventId}`;
  const pixel = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />`;
  if (html.includes('</body>')) {
    return html.replace('</body>', `${pixel}</body>`);
  }
  return html + pixel;
}

/**
 * Wrap all links with click tracking redirect.
 * Adds UTM parameters to the destination URL.
 */
function wrapLinksForTracking(
  html: string,
  eventId: string,
  campaignId: string | null,
  flowId: string | null,
): string {
  const baseUrl = API_BASE_URL();
  // Match href="..." but skip mailto:, tel:, and # links, and the unsubscribe link
  return html.replace(
    /href="(https?:\/\/[^"]+)"/gi,
    (match, url) => {
      if (url.includes('/api/email-unsubscribe') || url.includes('/api/email-track/')) {
        return match; // Don't wrap tracking/unsubscribe links
      }
      // Add UTM params to destination
      const separator = url.includes('?') ? '&' : '?';
      const utmSource = 'steve';
      const utmMedium = flowId ? 'flow' : 'email';
      const utmCampaign = campaignId || flowId || 'unknown';
      const destUrl = `${url}${separator}utm_source=${utmSource}&utm_medium=${utmMedium}&utm_campaign=${utmCampaign}`;
      const encodedUrl = encodeURIComponent(destUrl);
      const trackUrl = `${baseUrl}/api/email-track/click?eid=${eventId}&url=${encodedUrl}`;
      return `href="${trackUrl}"`;
    }
  );
}

/**
 * Add unsubscribe footer to HTML email.
 */
function addUnsubscribeFooter(html: string, subscriberId: string, clientId: string): string {
  const token = generateUnsubscribeToken(subscriberId, clientId);
  const unsubUrl = `${API_BASE_URL()}/api/email-unsubscribe?token=${token}`;
  const footer = `
    <div style="text-align:center;padding:20px 0 10px;font-size:12px;color:#999;font-family:Arial,sans-serif;">
      <p style="margin:0;">Recibiste este correo porque estás suscrito a nuestra lista.</p>
      <p style="margin:5px 0 0;"><a href="${unsubUrl}" style="color:#999;text-decoration:underline;">Cancelar suscripción</a></p>
    </div>`;
  if (html.includes('</body>')) {
    return html.replace('</body>', `${footer}</body>`);
  }
  return html + footer;
}

/**
 * Core function to send a single email via Resend.
 * Used by campaigns and flows.
 *
 * Nota histórica: el proyecto originalmente usaba AWS SES. Se migró a Resend pero
 * quedan algunos archivos/endpoints con "ses" en el nombre por retrocompatibilidad
 * con health checks de El Chino (ver track-events.ts sesWebhooks).
 */
export async function sendSingleEmail(params: {
  to: string;
  subject: string;
  htmlContent: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
  subscriberId: string;
  clientId: string;
  campaignId?: string;
  flowId?: string;
  abVariant?: 'a' | 'b';
}): Promise<{ success: boolean; messageId?: string; eventId?: string; error?: string }> {
  const supabase = getSupabaseAdmin();

  // Create event record first to get the event ID for tracking
  const { data: event, error: eventErr } = await supabase
    .from('email_events')
    .insert({
      client_id: params.clientId,
      campaign_id: params.campaignId || null,
      flow_id: params.flowId || null,
      subscriber_id: params.subscriberId,
      event_type: 'sent',
      ab_variant: params.abVariant || null,
      metadata: { to: params.to, subject: params.subject },
    })
    .select('id')
    .single();

  if (eventErr || !event) {
    console.error('Failed to create sent event:', eventErr);
    return { success: false, error: 'Failed to create tracking event' };
  }

  const eventId = event.id;

  // Guard against undefined/empty HTML content
  if (!params.htmlContent) {
    console.error('sendSingleEmail called with empty htmlContent for subscriber:', params.subscriberId);
    return { success: false, error: 'Empty HTML content' };
  }

  // Process HTML: add unsubscribe footer → wrap links → inject pixel
  let processedHtml = addUnsubscribeFooter(params.htmlContent, params.subscriberId, params.clientId);
  processedHtml = wrapLinksForTracking(processedHtml, eventId, params.campaignId || null, params.flowId || null);
  processedHtml = injectTrackingPixel(processedHtml, eventId);

  // Build unsubscribe URL for List-Unsubscribe header
  const unsubToken = generateUnsubscribeToken(params.subscriberId, params.clientId);
  const unsubUrl = `${API_BASE_URL()}/api/email-unsubscribe?token=${unsubToken}`;

  try {
    const fromHeader = params.fromName ? `${params.fromName} <${params.fromEmail}>` : params.fromEmail;

    const { data: result, error: sendErr } = await getResendClient().emails.send({
      from: fromHeader,
      to: [params.to],
      subject: params.subject,
      html: processedHtml,
      replyTo: params.replyTo || undefined,
      headers: {
        'List-Unsubscribe': `<${unsubUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Steve-Event-Id': eventId,
        ...(params.campaignId ? { 'X-Steve-Campaign-Id': params.campaignId } : {}),
        ...(params.flowId ? { 'X-Steve-Flow-Id': params.flowId } : {}),
      },
    });

    if (sendErr) {
      throw new Error(sendErr.message);
    }

    const messageId = result?.id;

    // Update event with Resend message ID
    await supabase
      .from('email_events')
      .update({ message_id: messageId })
      .eq('id', eventId);

    return { success: true, messageId, eventId };
  } catch (err: any) {
    console.error('[BUG-7] ERROR envío email:', {
      message: err.message,
      statusCode: err.statusCode || err.status,
      name: err.name,
      response: err.response?.body || err.response || null,
      from: params.fromEmail,
      to: params.to,
    });
    // Update event to reflect failure
    await supabase
      .from('email_events')
      .update({ event_type: 'bounced', metadata: { error: err.message, to: params.to } })
      .eq('id', eventId);
    return { success: false, error: err.message, eventId };
  }
}

/**
 * Route handler for ad-hoc email sending (test emails, single sends).
 * Auth: protected by authMiddleware at the router level (routes/index.ts).
 */
export async function sendEmailHandler(c: Context) {
  const body = await c.req.json();
  const { action } = body;

  switch (action) {
    case 'send-test': {
      // Send a test email to a specific address
      const { to, subject, html_content, from_email, from_name, client_id } = body;
      if (!to || !subject || !html_content || !client_id) {
        return c.json({ error: 'Missing required fields: to, subject, html_content, client_id' }, 400);
      }

      const supabase = getSupabaseAdmin();

      // Get or create a test subscriber
      const subscriber = await safeQuerySingleOrDefault<any>(
        supabase
          .from('email_subscribers')
          .select('id')
          .eq('client_id', client_id)
          .eq('email', to)
          .single(),
        null,
        'sendEmailHandler.getTestSubscriber',
      );

      const subscriberId = subscriber?.id || 'test-' + Date.now();

      const result = await sendSingleEmail({
        to,
        subject,
        htmlContent: html_content,
        fromEmail: from_email || `noreply@${process.env.DEFAULT_FROM_DOMAIN || 'steve.cl'}`,
        fromName: from_name || 'Steve',
        subscriberId,
        clientId: client_id,
      });

      return c.json(result);
    }

    default:
      return c.json({ error: `Unknown action: ${action}` }, 400);
  }
}
