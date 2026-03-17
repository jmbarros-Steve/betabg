import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/**
 * Performs actions on Meta Ad Sets:
 * - pause: Sets status to PAUSED
 * - scale: Increases daily_budget by scale_percent%
 */
export async function metaAdsetAction(c: Context) {
  const supabase = getSupabaseAdmin();

  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  const { connection_id, adset_id, action, scale_percent } = await c.req.json();

  if (!connection_id || !adset_id || !action) {
    return c.json({ error: 'Missing required parameters: connection_id, adset_id, action' }, 400);
  }

  if (!['pause', 'scale'].includes(action)) {
    return c.json({ error: 'Invalid action. Must be "pause" or "scale"' }, 400);
  }

  console.log(`Meta adset action: ${action} on adset ${adset_id}`);

  // Fetch connection details
  const { data: connection, error: connError } = await supabase
    .from('platform_connections')
    .select(`
      id,
      platform,
      account_id,
      access_token_encrypted,
      client_id,
      clients!inner(user_id, client_user_id)
    `)
    .eq('id', connection_id)
    .eq('platform', 'meta')
    .single();

  if (connError || !connection) {
    return c.json({ error: 'Meta connection not found' }, 404);
  }

  // Verify ownership
  const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null };
  if (clientData.user_id !== user.id && clientData.client_user_id !== user.id) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  // Decrypt access token
  if (!connection.access_token_encrypted) {
    console.error('[meta-adset-action] No encrypted token for connection:', connection.id);
    return c.json({ error: 'No encrypted token found for this connection' }, 500);
  }
  const { data: decryptedToken, error: decryptError } = await supabase
    .rpc('decrypt_platform_token', { encrypted_token: connection.access_token_encrypted });

  if (decryptError || !decryptedToken) {
    console.error('[meta-adset-action] decrypt_platform_token failed:', decryptError?.message, decryptError?.code);
    return c.json({ error: 'Failed to decrypt token' }, 500);
  }

  try {
    if (action === 'pause') {
      // Pause the ad set
      const url = new URL(`https://graph.facebook.com/v21.0/${adset_id}`);
      

      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'PAUSED' }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Meta pause error:', errorText);
        return c.json({ error: 'Failed to pause ad set', details: errorText }, 502);
      }

      const result = await res.json();
      console.log(`Ad set ${adset_id} paused successfully:`, result);

      return c.json({
        success: true,
        action: 'pause',
        adset_id,
        message: `Ad Set ${adset_id} paused successfully`,
      });

    } else if (action === 'scale') {
      const percent = scale_percent || 20;

      // First, fetch current budget
      const getUrl = new URL(`https://graph.facebook.com/v21.0/${adset_id}`);
      
      getUrl.searchParams.set('fields', 'daily_budget,lifetime_budget,name,status');

      const getRes = await fetch(getUrl.toString());
      if (!getRes.ok) {
        const errorText = await getRes.text();
        console.error('Meta get adset error:', errorText);
        return c.json({ error: 'Failed to fetch ad set details', details: errorText }, 502);
      }

      const adsetData: any = await getRes.json();
      const currentDailyBudget = parseInt(adsetData.daily_budget || '0', 10);
      const currentLifetimeBudget = parseInt(adsetData.lifetime_budget || '0', 10);

      // Determine which budget type to scale
      const budgetField = currentDailyBudget > 0 ? 'daily_budget' : 'lifetime_budget';
      const currentBudget = currentDailyBudget > 0 ? currentDailyBudget : currentLifetimeBudget;

      if (currentBudget === 0) {
        return c.json({ error: 'Ad set has no budget set. Cannot scale.' }, 400);
      }

      const newBudget = Math.round(currentBudget * (1 + percent / 100));

      console.log(`Scaling ${budgetField} from ${currentBudget} to ${newBudget} (${percent}% increase)`);

      // Update the budget
      const updateUrl = new URL(`https://graph.facebook.com/v21.0/${adset_id}`);
      

      const updateRes = await fetch(updateUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [budgetField]: newBudget.toString() }),
      });

      if (!updateRes.ok) {
        const errorText = await updateRes.text();
        console.error('Meta scale error:', errorText);
        return c.json({ error: 'Failed to scale ad set budget', details: errorText }, 502);
      }

      const result = await updateRes.json();
      console.log(`Ad set ${adset_id} scaled successfully:`, result);

      // Meta budgets are in cents, convert for display
      const currentBudgetDisplay = currentBudget / 100;
      const newBudgetDisplay = newBudget / 100;

      return c.json({
        success: true,
        action: 'scale',
        adset_id,
        previous_budget: currentBudgetDisplay,
        new_budget: newBudgetDisplay,
        budget_field: budgetField,
        percent_increase: percent,
        message: `Ad Set budget scaled from $${currentBudgetDisplay} to $${newBudgetDisplay} USD (${percent}% increase)`,
      });
    }
  } catch (err: any) {
    console.error('Meta adset action error:', err);
    return c.json({ error: `Meta API error: ${err.message}` }, 500);
  }

  return c.json({ error: 'Unknown action' }, 400);
}
