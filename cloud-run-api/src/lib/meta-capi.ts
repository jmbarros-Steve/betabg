/**
 * Meta Conversions API (CAPI) — server-side event tracking
 *
 * Sends Lead, Schedule, Purchase events to Meta from the backend.
 * User data is hashed with SHA-256 as required by Meta.
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
 */

import { createHash } from 'crypto';

const PIXEL_ID = process.env.META_PIXEL_ID || '';
const CAPI_TOKEN = process.env.META_CAPI_TOKEN || '';
const GRAPH_URL = `https://graph.facebook.com/v19.0/${PIXEL_ID}/events`;

function sha256(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

function hashPhone(phone: string): string {
  // Normalize: remove spaces, dashes, parentheses; keep leading +
  const normalized = phone.replace(/[\s\-().]/g, '').toLowerCase();
  return sha256(normalized);
}

export interface CAPIUserData {
  phone?: string;       // raw phone number
  name?: string;        // first name
  country?: string;     // ISO 2-letter, e.g. 'cl'
  email?: string;
  clientIp?: string;
  clientUserAgent?: string;
  fbp?: string;         // _fbp cookie value
  fbc?: string;         // _fbc cookie value
}

export interface CAPIEventData {
  eventName: 'Lead' | 'Schedule' | 'Purchase' | 'Contact';
  eventTime?: number;      // Unix timestamp (seconds), defaults to now
  eventId?: string;        // dedup key
  sourceUrl?: string;
  userData: CAPIUserData;
  customData?: {
    value?: number;
    currency?: string;    // e.g. 'CLP'
    content_name?: string;
    status?: string;
  };
}

export async function sendMetaCAPIEvent(event: CAPIEventData): Promise<void> {
  if (!PIXEL_ID || !CAPI_TOKEN) {
    console.warn('[meta-capi] META_PIXEL_ID or META_CAPI_TOKEN not set — skipping');
    return;
  }

  const { userData, eventName, eventTime, eventId, sourceUrl, customData } = event;

  // Build hashed user_data object
  const user_data: Record<string, any> = {
    country: [sha256(userData.country || 'cl')],
  };
  if (userData.phone) user_data.ph = [hashPhone(userData.phone)];
  if (userData.name)  user_data.fn = [sha256(userData.name)];
  if (userData.email) user_data.em = [sha256(userData.email)];
  if (userData.clientIp) user_data.client_ip_address = userData.clientIp;
  if (userData.clientUserAgent) user_data.client_user_agent = userData.clientUserAgent;
  if (userData.fbp) user_data.fbp = userData.fbp;
  if (userData.fbc) user_data.fbc = userData.fbc;

  const payload: Record<string, any> = {
    event_name: eventName,
    event_time: eventTime ?? Math.floor(Date.now() / 1000),
    action_source: 'system_generated',
    user_data,
  };

  if (eventId) payload.event_id = eventId;
  if (sourceUrl) payload.event_source_url = sourceUrl;
  if (customData && Object.keys(customData).length > 0) {
    payload.custom_data = {
      ...customData,
      currency: customData.currency || 'CLP',
    };
  }

  const body = {
    data: [payload],
    test_event_code: process.env.META_CAPI_TEST_CODE || undefined,
  };

  try {
    const res = await fetch(GRAPH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CAPI_TOKEN}`,
      },
      body: JSON.stringify(body),
    });

    const result = await res.json() as any;

    if (!res.ok || result.error) {
      console.error('[meta-capi] API error:', JSON.stringify(result.error || result));
    } else {
      console.log(`[meta-capi] ✓ ${eventName} sent — events_received: ${result.events_received}`);
    }
  } catch (err: any) {
    console.error('[meta-capi] fetch error:', err.message);
  }
}
