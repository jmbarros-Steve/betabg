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
