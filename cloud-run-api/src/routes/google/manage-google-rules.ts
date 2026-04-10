import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

type Action = 'list' | 'create' | 'update' | 'delete' | 'toggle';

interface RequestBody {
  action: Action;
  client_id: string;
  connection_id: string;
  rule_id?: string;
  data?: Record<string, any>;
}

// --- Main handler ---

export async function manageGoogleRules(c: Context) {
  try {
    const supabase = getSupabaseAdmin();

    // User already validated by authMiddleware
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const body: RequestBody = await c.req.json();
    const { action, client_id, connection_id, rule_id, data } = body;

    if (!action) return c.json({ error: 'Missing action' }, 400);
    if (!client_id) return c.json({ error: 'Missing client_id' }, 400);
    if (!connection_id) return c.json({ error: 'Missing connection_id' }, 400);

    const validActions: Action[] = ['list', 'create', 'update', 'delete', 'toggle'];
    if (!validActions.includes(action)) {
      return c.json({ error: `Invalid action: ${action}` }, 400);
    }

    // Verify ownership OR admin
    const { data: connCheck, error: connCheckErr } = await supabase
      .from('platform_connections')
      .select('id, clients!inner(user_id, client_user_id)')
      .eq('id', connection_id)
      .eq('client_id', client_id)
      .maybeSingle();

    if (connCheckErr || !connCheck) {
      return c.json({ error: 'Connection not found' }, 404);
    }

    const ownerData = connCheck.clients as unknown as { user_id: string; client_user_id: string | null };
    const isOwner = ownerData.user_id === user.id || ownerData.client_user_id === user.id;
    if (!isOwner) {
      const adminRole = await safeQuerySingleOrDefault<any>(
        supabase
          .from('user_roles').select('role').eq('user_id', user.id)
          .in('role', ['admin', 'super_admin']).limit(1).maybeSingle(),
        null,
        'manageGoogleRules.getAdminRole',
      );
      if (!adminRole) return c.json({ error: 'Unauthorized' }, 403);
    }

    console.log(`[manage-google-rules] Action: ${action}, Client: ${client_id}, Connection: ${connection_id}`);

    // --- LIST ---
    if (action === 'list') {
      const { data: rules, error: rulesError } = await supabase
        .from('google_automated_rules')
        .select('*')
        .eq('client_id', client_id)
        .eq('connection_id', connection_id)
        .order('created_at', { ascending: false })
        .limit(500);

      if (rulesError) {
        console.error('[manage-google-rules] List error:', rulesError);
        return c.json({ error: 'Failed to fetch rules' }, 500);
      }

      const { data: logs } = await supabase
        .from('google_rule_execution_log')
        .select('*')
        .eq('client_id', client_id)
        .order('executed_at', { ascending: false })
        .limit(50);

      return c.json({ success: true, rules: rules || [], logs: logs || [] });
    }

    // --- CREATE ---
    if (action === 'create') {
      if (!data) return c.json({ error: 'Missing data' }, 400);

      const { data: newRule, error: createError } = await supabase
        .from('google_automated_rules')
        .insert({
          client_id,
          connection_id,
          name: data.name,
          condition: data.condition,
          action: data.action,
          apply_to: data.apply_to || 'ALL_CAMPAIGNS',
          specific_campaign_ids: data.specific_campaign_ids || [],
          is_active: true,
        })
        .select()
        .single();

      if (createError) {
        console.error('[manage-google-rules] Create error:', createError);
        return c.json({ error: 'Failed to create rule' }, 500);
      }
      return c.json({ success: true, rule: newRule });
    }

    // --- UPDATE ---
    if (action === 'update') {
      if (!rule_id) return c.json({ error: 'Missing rule_id' }, 400);
      if (!data) return c.json({ error: 'Missing data' }, 400);

      const updateFields: Record<string, any> = {};
      if (data.name !== undefined) updateFields.name = data.name;
      if (data.condition !== undefined) updateFields.condition = data.condition;
      if (data.action !== undefined) updateFields.action = data.action;
      if (data.apply_to !== undefined) updateFields.apply_to = data.apply_to;
      if (data.specific_campaign_ids !== undefined) updateFields.specific_campaign_ids = data.specific_campaign_ids;

      const { error: updateError } = await supabase
        .from('google_automated_rules')
        .update(updateFields)
        .eq('id', rule_id)
        .eq('client_id', client_id);

      if (updateError) {
        console.error('[manage-google-rules] Update error:', updateError);
        return c.json({ error: 'Failed to update rule' }, 500);
      }
      return c.json({ success: true });
    }

    // --- DELETE ---
    if (action === 'delete') {
      if (!rule_id) return c.json({ error: 'Missing rule_id' }, 400);

      const { error: deleteError } = await supabase
        .from('google_automated_rules')
        .delete()
        .eq('id', rule_id)
        .eq('client_id', client_id);

      if (deleteError) {
        console.error('[manage-google-rules] Delete error:', deleteError);
        return c.json({ error: 'Failed to delete rule' }, 500);
      }
      return c.json({ success: true });
    }

    // --- TOGGLE ---
    if (action === 'toggle') {
      if (!rule_id) return c.json({ error: 'Missing rule_id' }, 400);

      const currentRule = await safeQuerySingleOrDefault<any>(
        supabase
          .from('google_automated_rules')
          .select('is_active')
          .eq('id', rule_id)
          .eq('client_id', client_id)
          .single(),
        null,
        'manageGoogleRules.getCurrentRule',
      );

      if (!currentRule) return c.json({ error: 'Rule not found' }, 404);

      const { error: toggleError } = await supabase
        .from('google_automated_rules')
        .update({ is_active: !currentRule.is_active })
        .eq('id', rule_id)
        .eq('client_id', client_id);

      if (toggleError) {
        console.error('[manage-google-rules] Toggle error:', toggleError);
        return c.json({ error: 'Failed to toggle rule' }, 500);
      }
      return c.json({ success: true, is_active: !currentRule.is_active });
    }

    return c.json({ error: 'Unhandled action' }, 400);

  } catch (error: any) {
    console.error('[manage-google-rules] Error:', error);
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
}
