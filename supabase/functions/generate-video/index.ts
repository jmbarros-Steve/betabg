import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { clientId, creativeId, promptGeneracion, fotoBaseUrl } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE_API_KEY) throw new Error('REPLICATE_API_KEY not configured');

    // Check & deduct 10 credits
    const { data: credits } = await supabase
      .from('client_credits')
      .select('id, creditos_disponibles, creditos_usados')
      .eq('client_id', clientId)
      .maybeSingle();

    const available = credits?.creditos_disponibles ?? 99999;
    if (available < 10) {
      return new Response(JSON.stringify({ error: 'NO_CREDITS', message: 'Se necesitan 10 créditos para generar un video' }), {
        status: 402,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Call Replicate Kling
    const replicateBody: Record<string, unknown> = {
      version: "kling-v1.5",
      input: {
        prompt: promptGeneracion,
        duration: 5,
        aspect_ratio: "9:16",
        cfg_scale: 0.5,
      },
    };

    if (fotoBaseUrl) {
      (replicateBody.input as Record<string, unknown>).image = fotoBaseUrl;
    }

    const replicateResp = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${REPLICATE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(replicateBody),
    });

    if (!replicateResp.ok) {
      const errText = await replicateResp.text();
      throw new Error(`Replicate API error: ${replicateResp.status} - ${errText}`);
    }

    const prediction = await replicateResp.json();

    if (!prediction.id) throw new Error('No prediction ID returned from Replicate');

    // Update creative with prediction ID and estado = generando
    if (creativeId) {
      await supabase.from('ad_creatives').update({
        prediction_id: prediction.id,
        estado: 'generando',
      }).eq('id', creativeId);
    }

    // Deduct credits immediately
    await supabase.from('client_credits').update({
      creditos_disponibles: (credits?.creditos_disponibles || 99999) - 10,
      creditos_usados: (credits?.creditos_usados || 0) + 10,
    }).eq('client_id', clientId);

    await supabase.from('credit_transactions').insert({
      client_id: clientId,
      accion: 'Generar video — Replicate Kling AI',
      creditos_usados: 10,
      costo_real_usd: 0.50,
    });

    return new Response(JSON.stringify({ prediction_id: prediction.id, status: 'generando' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('generate-video error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
