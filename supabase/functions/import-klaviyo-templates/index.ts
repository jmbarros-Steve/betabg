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

    // Fetch ONLY the first page — API already returns most recent first
    const resp = await fetch('https://a.klaviyo.com/api/templates/', { headers });
    if (!resp.ok) {
      const errText = await resp.text();
      return new Response(JSON.stringify({ error: `Klaviyo API error: ${resp.status}`, details: errText }), {
        status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const templatesData = await resp.json();
    const allTemplates = templatesData.data || [];
    console.log('Templates in first page:', allTemplates.length);

    // Take the FIRST 10 (already most recent)
    const top10 = allTemplates.slice(0, 10);
    console.log('Top 10 (most recent):');
    top10.forEach((t: any) => console.log(`  "${t.attributes?.name}" - ${t.attributes?.updated || t.attributes?.created}`));

    // Fetch full HTML for each
    const templates = [];
    for (const t of top10) {
      try {
        const detailResp = await fetch(`https://a.klaviyo.com/api/templates/${t.id}/`, { headers });
        if (detailResp.ok) {
          const detail = await detailResp.json();
          const html = detail.data?.attributes?.html || '';
          const colorMatches = html.match(/#[0-9a-fA-F]{6}/g) || [];
          const uniqueColors = [...new Set(colorMatches)].slice(0, 10);

          templates.push({
            id: t.id,
            name: detail.data?.attributes?.name || t.attributes?.name || 'Sin nombre',
            html,
            text: detail.data?.attributes?.text || '',
            hasHtml: html.length > 0,
            htmlLength: html.length,
            created: t.attributes?.created,
            updated: t.attributes?.updated,
            extractedColors: uniqueColors,
          });
          console.log(`Template "${t.attributes?.name}": HTML ${html.length} chars`);
        } else {
          const errText = await detailResp.text();
          console.log(`Template ${t.id} detail error: ${detailResp.status}`, errText);
        }
      } catch (e: any) {
        console.log(`Error fetching template ${t.id}:`, e.message);
      }
      await new Promise(r => setTimeout(r, 500));
    }

    return new Response(JSON.stringify({
      templates,
      total: allTemplates.length,
      showing: templates.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Import Klaviyo templates error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
