import { Context } from 'hono';
import { randomBytes } from 'node:crypto';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { sendWhatsApp } from '../../lib/twilio-client.js';
import { safeMutateSingle } from '../../lib/safe-supabase.js';

/**
 * Activate trial for a prospect — creates Supabase Auth user, client record,
 * seeds onboarding steps, and sends welcome WA message.
 *
 * Triggered by [ACTIVATE_TRIAL:email] tag in Steve's sales conversation.
 *
 * Route: POST /api/whatsapp/prospect-trial
 * Auth: X-Internal-Key (service role key) — called internally
 */
export async function prospectTrial(c: Context) {
  const internalKey = c.req.header('X-Internal-Key')?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!internalKey || internalKey !== serviceKey) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const { email, phone, prospect_id, name } = await c.req.json();

  if (!email || !phone) {
    return c.json({ error: 'email and phone required' }, 400);
  }

  const supabase = getSupabaseAdmin();

  try {
    // 1. Create user in Supabase Auth (auto-confirmed)
    const tempPassword = `Steve${randomBytes(8).toString('hex')}!`;
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });

    if (createError) {
      if (createError.message.includes('already been registered')) {
        return c.json({ error: 'User already exists', exists: true }, 409);
      }
      throw createError;
    }

    const userId = newUser.user.id;
    console.log(`[prospect-trial] User created: ${userId} (${email})`);

    // 2. Assign client role
    await supabase.from('user_roles').upsert(
      { user_id: userId, role: 'client' },
      { onConflict: 'user_id,role' },
    );

    // 3. Create client record with Visual plan (trial)
    const newClient = await safeMutateSingle<any>(
      supabase.from('clients').insert({
        user_id: userId,
        client_user_id: userId,
        name: name || email.split('@')[0],
        email,
        whatsapp_phone: phone,
        plan: 'visual',
        onboarding_wa_started: true,
      }).select('id').single(),
      'prospectTrial.createClient',
    );

    if (!newClient) {
      throw new Error('Failed to create client record');
    }

    console.log(`[prospect-trial] Client created: ${newClient.id}`);

    // 4. Mark prospect as converted
    if (prospect_id) {
      await supabase
        .from('wa_prospects')
        .update({
          stage: 'converted',
          converted_client_id: newClient.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', prospect_id);
    }

    // 5. Seed onboarding steps
    const onboardingSteps = [
      { client_id: newClient.id, step: 'welcome', status: 'completed', completed_at: new Date().toISOString() },
      { client_id: newClient.id, step: 'shopify_connected', status: 'pending' },
      { client_id: newClient.id, step: 'meta_connected', status: 'pending' },
      { client_id: newClient.id, step: 'brief_completed', status: 'pending' },
      { client_id: newClient.id, step: 'first_campaign', status: 'pending' },
    ];

    await supabase.from('merchant_onboarding').insert(onboardingSteps);

    // 6. Send welcome WA message
    const welcomeMsg = `🎉 ¡Bienvenido a Steve!\n\nTu cuenta está lista. Entra a steve.cl con tu email (${email}) y esta clave temporal:\n\n🔑 ${tempPassword}\n\nCámbiala apenas entres.\n\nPróximo paso: conectar tu Shopify para que empiece la magia 🚀\n\n¿Necesitas ayuda? Solo escríbeme aquí.`;

    await sendWhatsApp(`+${phone}`, welcomeMsg);

    // Save welcome message
    await supabase.from('wa_messages').insert({
      client_id: newClient.id,
      channel: 'steve_chat',
      direction: 'outbound',
      from_number: process.env.STEVE_WA_NUMBER || process.env.TWILIO_PHONE_NUMBER || '',
      to_number: phone,
      body: welcomeMsg,
      contact_name: name || email,
      contact_phone: phone,
    });

    console.log(`[prospect-trial] Trial activated: ${email} → client ${newClient.id}`);

    return c.json({
      success: true,
      client_id: newClient.id,
      user_id: userId,
    });

  } catch (err: any) {
    console.error('[prospect-trial] Error:', err);
    return c.json({ error: err.message }, 500);
  }
}
