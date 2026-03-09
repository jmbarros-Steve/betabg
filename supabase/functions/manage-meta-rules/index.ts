import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Action = 'create' | 'update' | 'delete' | 'list' | 'toggle';

interface RequestBody {
  action: Action;
  client_id: string;
  connection_id: string;
  rule_id?: string;
  data?: Record<string, any>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: RequestBody = await req.json();
    const { action, client_id, connection_id, rule_id, data } = body;

    if (!action || !client_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: action, client_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user owns this client
    const { data: client, error: clientErr } = await supabase
      .from('clients')
      .select('id, user_id, client_user_id')
      .eq('id', client_id)
      .single();

    if (clientErr || !client) {
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (client.user_id !== user.id && client.client_user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[manage-meta-rules] Action: ${action}, Client: ${client_id}`);

    switch (action) {
      case 'list': {
        const { data: rules, error } = await supabase
          .from('meta_automated_rules')
          .select('*')
          .eq('client_id', client_id)
          .order('created_at', { ascending: false });

        if (error) {
          return new Response(
            JSON.stringify({ error: 'Failed to fetch rules', details: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Also fetch recent execution log
        const { data: logs } = await supabase
          .from('meta_rule_execution_log')
          .select('*')
          .eq('client_id', client_id)
          .order('executed_at', { ascending: false })
          .limit(50);

        return new Response(
          JSON.stringify({ success: true, rules: rules || [], logs: logs || [] }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'create': {
        if (!connection_id || !data) {
          return new Response(
            JSON.stringify({ error: 'Missing required fields: connection_id, data' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error } = await supabase
          .from('meta_automated_rules')
          .insert({
            client_id,
            connection_id,
            name: data.name,
            condition: data.condition,
            action: data.action,
            apply_to: data.apply_to || 'ALL_CAMPAIGNS',
            specific_campaign_ids: data.specific_campaign_ids || [],
            check_frequency: data.check_frequency || 'EVERY_1_HOUR',
            is_active: true,
          });

        if (error) {
          return new Response(
            JSON.stringify({ error: 'Failed to create rule', details: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update': {
        if (!rule_id || !data) {
          return new Response(
            JSON.stringify({ error: 'Missing required fields: rule_id, data' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() };
        if (data.name !== undefined) updatePayload.name = data.name;
        if (data.condition !== undefined) updatePayload.condition = data.condition;
        if (data.action !== undefined) updatePayload.action = data.action;
        if (data.apply_to !== undefined) updatePayload.apply_to = data.apply_to;
        if (data.specific_campaign_ids !== undefined) updatePayload.specific_campaign_ids = data.specific_campaign_ids;
        if (data.check_frequency !== undefined) updatePayload.check_frequency = data.check_frequency;
        if (data.is_active !== undefined) updatePayload.is_active = data.is_active;

        const { error } = await supabase
          .from('meta_automated_rules')
          .update(updatePayload)
          .eq('id', rule_id)
          .eq('client_id', client_id);

        if (error) {
          return new Response(
            JSON.stringify({ error: 'Failed to update rule', details: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'toggle': {
        if (!rule_id) {
          return new Response(
            JSON.stringify({ error: 'Missing required field: rule_id' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Fetch current state
        const { data: rule, error: fetchErr } = await supabase
          .from('meta_automated_rules')
          .select('is_active')
          .eq('id', rule_id)
          .eq('client_id', client_id)
          .single();

        if (fetchErr || !rule) {
          return new Response(
            JSON.stringify({ error: 'Rule not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error } = await supabase
          .from('meta_automated_rules')
          .update({ is_active: !rule.is_active, updated_at: new Date().toISOString() })
          .eq('id', rule_id)
          .eq('client_id', client_id);

        if (error) {
          return new Response(
            JSON.stringify({ error: 'Failed to toggle rule', details: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, is_active: !rule.is_active }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'delete': {
        if (!rule_id) {
          return new Response(
            JSON.stringify({ error: 'Missing required field: rule_id' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error } = await supabase
          .from('meta_automated_rules')
          .delete()
          .eq('id', rule_id)
          .eq('client_id', client_id);

        if (error) {
          return new Response(
            JSON.stringify({ error: 'Failed to delete rule', details: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: `Invalid action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('[manage-meta-rules] Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
