import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    const { connectionId, action, templateId } = body;

    if (!connectionId) {
      return new Response(JSON.stringify({ error: 'connectionId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get Klaviyo API key
    const { data: conn } = await supabase
      .from('platform_connections')
      .select('api_key_encrypted')
      .eq('id', connectionId)
      .single();

    if (!conn?.api_key_encrypted) {
      return new Response(JSON.stringify({ error: 'No Klaviyo connection found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: decryptedKey } = await supabase.rpc('decrypt_platform_token', {
      encrypted_token: conn.api_key_encrypted
    });

    const apiKey = decryptedKey as string;
    const headers = {
      'Authorization': `Klaviyo-API-Key ${apiKey}`,
      'accept': 'application/json',
      'revision': '2024-10-15',
    };

    if (action === 'list') {
      // List templates
      const resp = await fetch('https://a.klaviyo.com/api/templates/', { headers });
      if (!resp.ok) {
        const errText = await resp.text();
        return new Response(JSON.stringify({ error: `Klaviyo API error: ${resp.status}`, details: errText }), {
          status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const data = await resp.json();
      const templates = (data.data || []).map((t: any) => ({
        id: t.id,
        name: t.attributes?.name || 'Sin nombre',
        created: t.attributes?.created || null,
        updated: t.attributes?.updated || null,
        html: t.attributes?.html ? '(available)' : null,
      }));

      return new Response(JSON.stringify({ templates }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'get' && templateId) {
      // Get single template with HTML
      const resp = await fetch(`https://a.klaviyo.com/api/templates/${templateId}/`, { headers });
      if (!resp.ok) {
        const errText = await resp.text();
        return new Response(JSON.stringify({ error: `Klaviyo API error: ${resp.status}`, details: errText }), {
          status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const data = await resp.json();
      const attrs = data.data?.attributes || {};
      
      // Extract colors from HTML
      const html = attrs.html || '';
      const colorMatches = html.match(/#[0-9a-fA-F]{6}/g) || [];
      const uniqueColors = [...new Set(colorMatches)].slice(0, 10);

      return new Response(JSON.stringify({
        template: {
          id: data.data?.id,
          name: attrs.name || 'Sin nombre',
          html: attrs.html || '',
          text: attrs.text || '',
          created: attrs.created,
          updated: attrs.updated,
          extractedColors: uniqueColors,
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action. Use "list" or "get"' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Import Klaviyo templates error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
