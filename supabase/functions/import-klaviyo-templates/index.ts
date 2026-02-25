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
    const { connectionId } = body;

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

    // Fetch templates - try with sort first, fallback without
    let templatesData: any;
    try {
      const resp = await fetch('https://a.klaviyo.com/api/templates/?sort=-created&page[size]=10', { headers });
      if (!resp.ok) throw new Error(`Status ${resp.status}`);
      templatesData = await resp.json();
    } catch {
      // Fallback: fetch more and sort manually
      const resp = await fetch('https://a.klaviyo.com/api/templates/?page[size]=50', { headers });
      if (!resp.ok) {
        const errText = await resp.text();
        return new Response(JSON.stringify({ error: `Klaviyo API error: ${resp.status}`, details: errText }), {
          status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      templatesData = await resp.json();
      // Sort by created desc and take 10
      if (templatesData.data) {
        templatesData.data = templatesData.data
          .sort((a: any, b: any) => new Date(b.attributes?.created || 0).getTime() - new Date(a.attributes?.created || 0).getTime())
          .slice(0, 10);
      }
    }

    console.log('Templates count:', templatesData.data?.length || 0);

    // Fetch full HTML for each template
    const templates = [];
    for (const t of (templatesData.data || [])) {
      try {
        const detailResp = await fetch(`https://a.klaviyo.com/api/templates/${t.id}/`, { headers });
        const detail = await detailResp.json();
        const html = detail.data?.attributes?.html || '';
        const text = detail.data?.attributes?.text || '';

        // Extract colors from HTML
        const colorMatches = html.match(/#[0-9a-fA-F]{6}/g) || [];
        const uniqueColors = [...new Set(colorMatches)].slice(0, 10);

        templates.push({
          id: t.id,
          name: detail.data?.attributes?.name || t.attributes?.name || 'Sin nombre',
          html,
          text,
          hasHtml: html.length > 0,
          htmlLength: html.length,
          created: detail.data?.attributes?.created || t.attributes?.created,
          updated: detail.data?.attributes?.updated || t.attributes?.updated,
          extractedColors: uniqueColors,
        });
        console.log(`Template "${t.attributes?.name}": HTML length ${html.length}`);
      } catch (e: any) {
        console.log(`Error fetching template ${t.id}:`, e.message);
      }
      // Rate limit
      await new Promise(r => setTimeout(r, 500));
    }

    return new Response(JSON.stringify({ templates }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Import Klaviyo templates error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
