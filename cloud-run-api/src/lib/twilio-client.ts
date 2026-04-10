import Twilio from 'twilio';

let masterClient: ReturnType<typeof Twilio> | null = null;

/**
 * Returns the master Twilio client (Steve Ads account).
 * Sub-accounts are billed to this parent account.
 */
export function getTwilioMasterClient() {
  if (!masterClient) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set');
    masterClient = Twilio(sid, token);
  }
  return masterClient;
}

/**
 * Returns a Twilio client scoped to a merchant's sub-account.
 */
export function getTwilioSubClient(subAccountSid: string, subAuthToken: string) {
  return Twilio(subAccountSid, subAuthToken);
}

/**
 * Steve's WhatsApp number in E.164 format (e.g. "+18106425882").
 */
export function getSteveWANumber(): string {
  return process.env.STEVE_WA_NUMBER || process.env.TWILIO_PHONE_NUMBER || '';
}

/**
 * Send a WhatsApp message from Steve's number.
 * @param to  Destination, e.g. "whatsapp:+56987654321" or raw "+56987654321"
 * @param body  Message text (max 4096 chars — WhatsApp limit)
 */
export async function sendWhatsApp(to: string, body: string) {
  const client = getTwilioMasterClient();
  const steveNumber = getSteveWANumber().replace(/^\+/, '');
  const from = `whatsapp:+${steveNumber}`;
  const toNorm = to.startsWith('whatsapp:') ? to : `whatsapp:${to.startsWith('+') ? to : '+' + to}`;

  // Bug #130 fix: enforce WhatsApp 4096 char limit to prevent Twilio API errors
  const WA_MAX_CHARS = 4096;
  const safeBody = body.length > WA_MAX_CHARS
    ? body.slice(0, WA_MAX_CHARS - 6) + '...[+]'
    : body;

  return client.messages.create({ from, to: toNorm, body: safeBody });
}

/**
 * Send a WhatsApp message using a Content Template (for business-initiated messages).
 * Required when no conversation window is open (user hasn't messaged in 24h).
 * @param to  Destination, e.g. "+56987654321"
 * @param contentSid  Twilio Content SID (HXxxxxxxxxx)
 * @param contentVariables  JSON object with template variables, e.g. {"1":"value"}
 */
export async function sendWhatsAppTemplate(
  to: string,
  contentSid: string,
  contentVariables: Record<string, string>,
) {
  const client = getTwilioMasterClient();
  const steveNumber = getSteveWANumber().replace(/^\+/, '');
  const from = `whatsapp:+${steveNumber}`;
  const toNorm = to.startsWith('whatsapp:') ? to : `whatsapp:${to.startsWith('+') ? to : '+' + to}`;

  return client.messages.create({
    from,
    to: toNorm,
    contentSid,
    contentVariables: JSON.stringify(contentVariables),
  });
}

/**
 * Send a WhatsApp message with media (image, video, or PDF).
 * @param to  Destination, e.g. "whatsapp:+56987654321" or raw "+56987654321"
 * @param body  Message text
 * @param mediaUrl  Public URL of the media file
 */
export async function sendWhatsAppMedia(to: string, body: string, mediaUrl: string) {
  const client = getTwilioMasterClient();
  const steveNumber = getSteveWANumber().replace(/^\+/, '');
  const from = `whatsapp:+${steveNumber}`;
  const toNorm = to.startsWith('whatsapp:') ? to : `whatsapp:${to.startsWith('+') ? to : '+' + to}`;

  return client.messages.create({ from, to: toNorm, body, mediaUrl: [mediaUrl] });
}
