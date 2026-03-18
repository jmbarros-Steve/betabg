import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getTwilioMasterClient, getTwilioSubClient } from '../../lib/twilio-client.js';
import { createHmac } from 'node:crypto';

const API_BASE_URL = () =>
  process.env.API_BASE_URL || 'https://steve-api-850416724643.us-central1.run.app';

/**
 * Simple reversible encryption for storing sub-account auth tokens.
 * Uses HMAC-derived key with AES-like XOR (lightweight for non-critical secrets
 * since the real security boundary is Supabase RLS + service role).
 */
function encryptToken(plaintext: string): string {
  const secret = process.env.TWILIO_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback';
  const key = createHmac('sha256', secret).update('twilio-token-key').digest();
  const buf = Buffer.from(plaintext, 'utf-8');
  const encrypted = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    encrypted[i] = buf[i] ^ key[i % key.length];
  }
  return encrypted.toString('base64url');
}

export function decryptToken(ciphertext: string): string {
  const secret = process.env.TWILIO_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback';
  const key = createHmac('sha256', secret).update('twilio-token-key').digest();
  const buf = Buffer.from(ciphertext, 'base64url');
  const decrypted = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    decrypted[i] = buf[i] ^ key[i % key.length];
  }
  return decrypted.toString('utf-8');
}

// ─── Create Twilio sub-account for a merchant ──────────────────────────────

async function createSubAccount(businessName: string) {
  const client = getTwilioMasterClient();
  const friendlyName = `steve-ads-${businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}`;

  try {
    const subAccount = await client.api.accounts.create({ friendlyName });
    console.log(`[wa-setup] Created sub-account ${subAccount.sid} for "${businessName}"`);
    return {
      sid: subAccount.sid,
      authToken: subAccount.authToken,
    };
  } catch (err: any) {
    // Trial accounts can't create sub-accounts
    if (err.code === 20003 || err.message?.includes('upgrade') || err.message?.includes('trial')) {
      throw new Error(
        'La cuenta Twilio es Trial y no puede crear sub-cuentas. ' +
        'Acción requerida: Ir a twilio.com/console → Billing → Upgrade para activar la cuenta completa.'
      );
    }
    throw err;
  }
}

// ─── Buy a Chilean mobile number in the sub-account ────────────────────────

async function buyChileanNumber(subAccountSid: string, subAuthToken: string, businessName: string) {
  const subClient = getTwilioSubClient(subAccountSid, subAuthToken);

  // Try mobile first, then local — wrapped in try/catch because
  // CL may not have a mobile endpoint at all (Twilio 20404)
  let available: any[] = [];
  let numberType = 'mobile';

  try {
    available = await subClient.availablePhoneNumbers('CL').mobile.list({ limit: 5 });
  } catch (e: any) {
    console.log(`[wa-setup] No mobile numbers for CL (${e.message}), trying local...`);
  }

  if (available.length === 0) {
    numberType = 'local';
    try {
      available = await subClient.availablePhoneNumbers('CL').local.list({ limit: 5 });
    } catch (e: any) {
      console.log(`[wa-setup] No local numbers for CL either (${e.message}), trying US...`);
    }
  }

  // Final fallback: US number (WhatsApp works with any country)
  if (available.length === 0) {
    numberType = 'us-local';
    try {
      available = await subClient.availablePhoneNumbers('US').local.list({
        limit: 5,
        smsEnabled: true,
      });
    } catch (e: any) {
      throw new Error('No hay números disponibles en Twilio (CL mobile, CL local, US). Verifica que la cuenta Twilio esté activa y tenga billing configurado.');
    }
  }

  if (available.length === 0) {
    throw new Error('No hay números disponibles. Verifica billing en Twilio Console.');
  }

  const number = await subClient.incomingPhoneNumbers.create({
    phoneNumber: available[0].phoneNumber,
    friendlyName: businessName,
  });

  console.log(`[wa-setup] Bought ${numberType} number ${number.phoneNumber} (${number.sid})`);
  return { phoneNumber: number.phoneNumber, phoneNumberSid: number.sid };
}

// ─── Configure webhooks on the purchased number ────────────────────────────

async function configureWebhooks(
  subAccountSid: string,
  subAuthToken: string,
  phoneNumberSid: string,
  clientId: string,
) {
  const subClient = getTwilioSubClient(subAccountSid, subAuthToken);
  const baseUrl = API_BASE_URL();

  // SMS/WhatsApp incoming webhook
  const smsUrl = `${baseUrl}/api/whatsapp/merchant-wa/${clientId}`;
  // Status callback for delivery/read receipts
  const statusUrl = `${baseUrl}/api/whatsapp/status-callback`;

  await subClient.incomingPhoneNumbers(phoneNumberSid).update({
    smsUrl,
    smsMethod: 'POST',
    statusCallback: statusUrl,
    statusCallbackMethod: 'POST',
  });

  console.log(`[wa-setup] Configured webhooks for ${phoneNumberSid}: sms=${smsUrl}`);
}

// ─── Full setup orchestrator ───────────────────────────────────────────────

async function provisionMerchant(clientId: string, businessName: string) {
  // 1. Create sub-account
  const subAccount = await createSubAccount(businessName);

  // 2. Buy Chilean number
  const number = await buyChileanNumber(subAccount.sid, subAccount.authToken, businessName);

  // 3. Configure webhooks
  await configureWebhooks(subAccount.sid, subAccount.authToken, number.phoneNumberSid, clientId);

  // 4. Save to database
  const supabase = getSupabaseAdmin();

  await supabase.from('wa_twilio_accounts').insert({
    client_id: clientId,
    twilio_account_sid: subAccount.sid,
    twilio_auth_token: encryptToken(subAccount.authToken),
    phone_number: number.phoneNumber,
    phone_number_sid: number.phoneNumberSid,
    display_name: businessName,
    status: 'active',
    whatsapp_approved: false, // Needs Meta approval for WA Business
  });

  // 5. Create welcome credits (100 free)
  const { data: existingCredits } = await supabase
    .from('wa_credits')
    .select('id')
    .eq('client_id', clientId)
    .single();

  if (!existingCredits) {
    await supabase.from('wa_credits').insert({
      client_id: clientId,
      balance: 100,
      total_purchased: 100,
      total_used: 0,
    });

    await supabase.from('wa_credit_transactions').insert({
      client_id: clientId,
      type: 'bonus',
      amount: 100,
      description: 'Créditos de bienvenida WhatsApp',
      balance_after: 100,
    });
  }

  return {
    phoneNumber: number.phoneNumber,
    subAccountSid: subAccount.sid,
    phoneNumberSid: number.phoneNumberSid,
  };
}

// ─── HTTP handler ──────────────────────────────────────────────────────────

/**
 * POST /api/whatsapp/setup-merchant
 * Body: { action: 'provision' | 'status', client_id?, business_name? }
 *
 * Actions:
 * - provision: Create sub-account, buy number, configure webhooks
 * - status: Check if merchant has WA configured
 */
export async function setupMerchantHandler(c: Context) {
  try {
    const body = await c.req.json();
    const { action } = body;
    const supabase = getSupabaseAdmin();

    switch (action) {
      case 'provision': {
        const { client_id, business_name } = body;
        if (!client_id || !business_name) {
          return c.json({ error: 'Missing client_id or business_name' }, 400);
        }

        // Check if already provisioned
        const { data: existing } = await supabase
          .from('wa_twilio_accounts')
          .select('phone_number, status')
          .eq('client_id', client_id)
          .eq('status', 'active')
          .single();

        if (existing) {
          return c.json({
            already_provisioned: true,
            phone_number: existing.phone_number,
          });
        }

        const result = await provisionMerchant(client_id, business_name);
        return c.json({
          success: true,
          phone_number: result.phoneNumber,
          sub_account_sid: result.subAccountSid,
          note: 'Número provisionado. Para WhatsApp Business, se requiere aprobación de Meta (proceso manual en Twilio Console).',
        });
      }

      case 'status': {
        const { client_id } = body;
        if (!client_id) return c.json({ error: 'Missing client_id' }, 400);

        const { data: account } = await supabase
          .from('wa_twilio_accounts')
          .select('phone_number, whatsapp_approved, display_name, status, created_at')
          .eq('client_id', client_id)
          .eq('status', 'active')
          .single();

        const { data: credits } = await supabase
          .from('wa_credits')
          .select('balance, total_purchased, total_used')
          .eq('client_id', client_id)
          .single();

        return c.json({
          configured: !!account,
          account: account || null,
          credits: credits || null,
        });
      }

      default:
        return c.json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err: any) {
    console.error('[wa-setup] Error:', err);
    return c.json({ error: 'WhatsApp setup failed', details: err.message }, 500);
  }
}
