import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/**
 * TEMPORARY: one-time admin setup utility.
 * Uses its own secret validation (no JWT/auth middleware).
 * Supports actions: setup_patricio, cleanup_patricio, fix_patricio,
 * diagnostic, set_shop_domain, reset_password.
 */
export async function adminCreateClient(c: Context) {
  const supabase = getSupabaseAdmin();
  const supabaseUrl = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const body = await c.req.json();
  const { secret, action } = body;

  if (secret !== 'setup-jardin-eva-2026') {
    return c.json({ error: 'Invalid secret' }, 403);
  }

  if (action === 'setup_patricio') {
    const userId = '9361e4eb-e94c-4248-adcf-5ac2457c5298';
    const results: Record<string, any> = {};

    // 1. Confirm email via GoTrue Admin REST API directly
    const confirmRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email_confirm: true }),
    });
    const confirmData = await confirmRes.json();
    if (!confirmRes.ok) {
      console.error('Confirm error:', confirmData);
      results.emailConfirmed = false;
      results.confirmError = confirmData;
    } else {
      console.log('Email confirmed successfully');
      results.emailConfirmed = true;
    }

    // 2. List users to find admin
    const listRes = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=50`, {
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
      },
    });
    const listData: any = await listRes.json();
    const users = listData.users || listData || [];
    const admin = Array.isArray(users) ? users.find((u: any) => u.email === 'jmbarros@bgconsult.cl') : null;
    const adminId = admin?.id;
    console.log('Admin user:', adminId, admin?.email);
    results.adminId = adminId;

    // 3. Assign client role (skip if already exists)
    const { error: roleErr } = await supabase
      .from('user_roles')
      .upsert({ user_id: userId, role: 'client' }, { onConflict: 'user_id,role' });
    if (roleErr) {
      console.error('Role error:', roleErr);
      results.roleAssigned = false;
      results.roleError = roleErr.message;
    } else {
      console.log('Role assigned');
      results.roleAssigned = true;
    }

    // 4. Create client record (without status column)
    const { data: clientData, error: clientErr } = await supabase
      .from('clients')
      .insert({
        user_id: adminId || userId,
        client_user_id: userId,
        name: 'Patricio Correa',
        company: 'Jardin de Eva',
      })
      .select('id')
      .single();

    if (clientErr) {
      console.error('Client error:', clientErr);
      return c.json({ ...results, error: clientErr.message, step: 'create_client' }, 500);
    }

    return c.json({
      success: true,
      clientId: clientData.id,
      ...results,
      message: 'Patricio Correa - Jardin de Eva creado exitosamente',
    });
  }

  if (action === 'cleanup_patricio') {
    const userId = '9361e4eb-e94c-4248-adcf-5ac2457c5298';
    const adminId = '3d195082-dccf-4d55-aacb-2782c9a62962';
    const results: Record<string, any> = {};

    // Delete the duplicate auto-created record (user_id = patricio, no company)
    const { error: delErr } = await supabase
      .from('clients')
      .delete()
      .eq('id', 'e76792aa-1c55-4296-a956-cc4fb906e7c8');
    results.deletedAutoCreated = !delErr;
    if (delErr) results.deleteError = delErr.message;

    // Update the correct record to have user_id = adminId (admin manages this client)
    const { data: updated, error: updErr } = await supabase
      .from('clients')
      .update({
        user_id: adminId,
        client_user_id: userId,
        name: 'Patricio Correa',
        company: 'Jardin de Eva',
        email: 'patricio.correa@jardindeeva.cl',
      })
      .eq('id', '9432e754-ad5a-4115-904c-d048de1d0e1e')
      .select('*')
      .single();

    results.updated = !updErr;
    if (updErr) results.updateError = updErr.message;
    results.clientRecord = updated;

    return c.json({ success: true, ...results });
  }

  if (action === 'fix_patricio') {
    const correctClientId = '9432e754-ad5a-4115-904c-d048de1d0e1e';
    const results: Record<string, any> = {};

    // 1. Find the active Shopify connection (most recent active one)
    const { data: shopifyConns } = await supabase
      .from('platform_connections')
      .select('id, client_id, is_active, shop_domain')
      .eq('platform', 'shopify')
      .eq('shop_domain', 'raicesdelalma.myshopify.com')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1);

    if (shopifyConns && shopifyConns.length > 0) {
      const conn = shopifyConns[0];
      // Move it to the correct client
      await supabase.from('platform_connections').update({ client_id: correctClientId }).eq('id', conn.id);
      results.shopifyMoved = { id: conn.id, from: conn.client_id, to: correctClientId };
    }

    // 2. Find Klaviyo connections
    const { data: klaviyoConns } = await supabase
      .from('platform_connections')
      .select('id, client_id, is_active')
      .eq('platform', 'klaviyo')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1);

    if (klaviyoConns && klaviyoConns.length > 0) {
      const conn = klaviyoConns[0];
      await supabase.from('platform_connections').update({ client_id: correctClientId }).eq('id', conn.id);
      results.klaviyoMoved = { id: conn.id, from: conn.client_id, to: correctClientId };
    }

    // 3. Delete ALL duplicate Shopify connections (inactive or pointing to wrong clients)
    const { data: dupeConns } = await supabase
      .from('platform_connections')
      .select('id')
      .eq('shop_domain', 'raicesdelalma.myshopify.com')
      .neq('client_id', correctClientId);

    if (dupeConns && dupeConns.length > 0) {
      for (const dc of dupeConns) {
        await supabase.from('platform_connections').delete().eq('id', dc.id);
      }
      results.deletedDupeConns = dupeConns.length;
    }

    // 4. Delete duplicate "Patricio Correa" clients (keep only 9432e754)
    const { data: dupeClients } = await supabase
      .from('clients')
      .select('id')
      .ilike('name', '%Patricio%')
      .neq('id', correctClientId);

    if (dupeClients && dupeClients.length > 0) {
      // First delete their platform_connections (cascade might handle this)
      for (const dc of dupeClients) {
        await supabase.from('platform_connections').delete().eq('client_id', dc.id);
        await supabase.from('clients').delete().eq('id', dc.id);
      }
      results.deletedDupeClients = dupeClients.length;
    }

    // 5. Verify final state
    const { data: finalClient } = await supabase.from('clients').select('*').eq('id', correctClientId).single();
    const { data: finalConns } = await supabase.from('platform_connections').select('id, platform, store_name, is_active').eq('client_id', correctClientId);

    return c.json({
      success: true,
      ...results,
      finalClient: { id: finalClient?.id, name: finalClient?.name, shop_domain: finalClient?.shop_domain },
      finalConnections: finalConns,
    });
  }

  if (action === 'diagnostic') {
    const { data: allClients } = await supabase.from('clients').select('id, name, email, company, shop_domain, client_user_id').order('created_at');
    const { data: allConns } = await supabase.from('platform_connections').select('id, client_id, platform, store_name, shop_domain, is_active').order('created_at');
    const { data: allRoles } = await supabase.from('user_roles').select('user_id, role, is_super_admin');
    return c.json({ clients: allClients, connections: allConns, roles: allRoles });
  }

  if (action === 'set_shop_domain') {
    const { client_id, shop_domain } = body;
    const { data, error } = await supabase
      .from('clients')
      .update({ shop_domain })
      .eq('id', client_id)
      .select('id, name, shop_domain')
      .single();

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({ success: true, client: data });
  }

  if (action === 'reset_password') {
    const userId = '9361e4eb-e94c-4248-adcf-5ac2457c5298';
    const newPassword = body.password || 'Jardin2026';

    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: newPassword, email_confirm: true }),
    });
    const data = await res.json();

    if (!res.ok) {
      return c.json({ error: data }, 500);
    }

    return c.json({
      success: true,
      email: 'patricio.correa@jardindeeva.cl',
      newPassword,
      message: 'Contraseña actualizada',
    });
  }

  return c.json({ error: 'Unknown action' }, 400);
}
