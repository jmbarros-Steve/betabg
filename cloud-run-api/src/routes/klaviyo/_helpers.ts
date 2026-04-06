import { getSupabaseAdmin } from '../../lib/supabase.js';

// Constants
export const KLAVIYO_BASE = 'https://a.klaviyo.com/api';
export const KLAVIYO_REVISION = '2025-01-15';

// Headers
export function makeKlaviyoGetHeaders(apiKey: string) {
  return {
    'Authorization': `Klaviyo-API-Key ${apiKey}`,
    'accept': 'application/json',
    'revision': KLAVIYO_REVISION,
  };
}

export function makeKlaviyoPostHeaders(apiKey: string) {
  return {
    'Authorization': `Klaviyo-API-Key ${apiKey}`,
    'accept': 'application/json',
    'content-type': 'application/vnd.api+json',
    'revision': KLAVIYO_REVISION,
  };
}

// API wrappers
export async function klaviyoGet(url: string, apiKey: string): Promise<any> {
  const res = await fetch(url, { headers: makeKlaviyoGetHeaders(apiKey) });
  if (!res.ok) {
    const text = await res.text();
    console.error(`Klaviyo GET error [${res.status}] ${url}:`, text);
    throw new Error(`Klaviyo API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function klaviyoPost(url: string, apiKey: string, body: any): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: makeKlaviyoPostHeaders(apiKey),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Klaviyo POST error [${res.status}] ${url}:`, text);
    throw new Error(`Klaviyo API error ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

// Find "Placed Order" metric ID — used by sync-klaviyo-metrics, flow-metrics, klaviyo-manage-flows
export async function findConversionMetricId(apiKey: string): Promise<string | null> {
  try {
    const data: any = await klaviyoGet(`${KLAVIYO_BASE}/metrics/`, apiKey);
    const metrics = data.data || [];
    const placed = metrics.find((m: any) => (m.attributes?.name || '').toLowerCase() === 'placed order');
    if (placed) return placed.id;
    const fallback = metrics.find((m: any) => {
      const name = (m.attributes?.name || '').toLowerCase();
      return name.includes('order') || name.includes('purchase');
    });
    return fallback?.id || null;
  } catch {
    return null;
  }
}

// Fetch logo using Klaviyo /images/ API (fast — single request)
export async function fetchLogoFromKlaviyo(apiKey: string): Promise<string> {
  try {
    const res = await fetch(`${KLAVIYO_BASE}/images/?page[size]=5&sort=-updated`, {
      headers: makeKlaviyoGetHeaders(apiKey),
    });
    if (!res.ok) return '';
    const data: any = await res.json();
    const logo = (data.data || []).find(
      (img: any) => /logo/i.test(img.attributes?.name || '') && img.attributes?.image_url
    );
    return logo?.attributes?.image_url || '';
  } catch {
    return '';
  }
}

// PATCH wrapper (for flow activation, campaign updates)
export async function klaviyoPatch(url: string, apiKey: string, body: any): Promise<any> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: makeKlaviyoPostHeaders(apiKey),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Klaviyo PATCH error [${res.status}] ${url}:`, text);
    throw new Error(`Klaviyo API error ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

// Send a campaign immediately via Klaviyo Campaign Send Jobs API
export async function sendCampaignJob(apiKey: string, campaignId: string): Promise<void> {
  await klaviyoPost(`${KLAVIYO_BASE}/campaign-send-jobs/`, apiKey, {
    data: {
      type: 'campaign-send-job',
      id: campaignId,
    },
  });
  console.log(`[sendCampaignJob] Campaign ${campaignId} send job created`);
}

// Delete a Klaviyo template (for cleanup on failure)
export async function deleteKlaviyoTemplate(apiKey: string, templateId: string): Promise<void> {
  try {
    const res = await fetch(`${KLAVIYO_BASE}/templates/${templateId}/`, {
      method: 'DELETE',
      headers: makeKlaviyoGetHeaders(apiKey),
    });
    if (!res.ok) {
      console.error(`[deleteKlaviyoTemplate] Failed to delete template ${templateId}: ${res.status}`);
    } else {
      console.log(`[deleteKlaviyoTemplate] Cleaned up template ${templateId}`);
    }
  } catch (e: any) {
    console.error(`[deleteKlaviyoTemplate] Error deleting template ${templateId}:`, e.message);
  }
}

// Decrypt Klaviyo API key from connection
export async function decryptKlaviyoApiKey(supabase: any, connectionId: string): Promise<string> {
  const { data: connection, error } = await supabase
    .from('platform_connections')
    .select('api_key_encrypted')
    .eq('id', connectionId)
    .eq('platform', 'klaviyo')
    .single();

  if (error || !connection?.api_key_encrypted) {
    throw new Error('Klaviyo connection not found or missing API key');
  }

  const { data: apiKey, error: decryptError } = await supabase
    .rpc('decrypt_platform_token', { encrypted_token: connection.api_key_encrypted });

  if (decryptError || !apiKey) {
    throw new Error('Failed to decrypt Klaviyo API key');
  }

  return apiKey;
}

// Escape HTML for use in <title> and other text contexts
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Brand data interface (shared)
export interface BrandData {
  name: string;
  logoUrl: string;
  storeUrl: string;
}

// Fetch client brand data with logo from Klaviyo
export async function fetchClientBrand(
  serviceClient: any,
  clientId: string,
  apiKey: string,
  storeName?: string,
): Promise<BrandData> {
  const { data: client } = await serviceClient
    .from('clients')
    .select('name, logo_url, website_url')
    .eq('id', clientId)
    .single();

  const storeUrl = client?.website_url || '';
  const brandName = storeName || client?.name || 'Tu Tienda';

  let logoUrl = '';
  if (client?.logo_url && !client.logo_url.includes('supabase.co/storage')) {
    logoUrl = client.logo_url;
  }
  if (!logoUrl) {
    logoUrl = await fetchLogoFromKlaviyo(apiKey);
  }

  return {
    name: brandName,
    logoUrl,
    storeUrl: storeUrl.startsWith('http') ? storeUrl : storeUrl ? `https://${storeUrl}` : '#',
  };
}
