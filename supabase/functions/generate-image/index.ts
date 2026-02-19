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

    const FAL_API_KEY = Deno.env.get('FAL_API_KEY');
    if (!FAL_API_KEY) throw new Error('FAL_API_KEY not configured');

    // Check & deduct 2 credits
    const { data: credits } = await supabase
      .from('client_credits')
      .select('id, creditos_disponibles, creditos_usados')
      .eq('client_id', clientId)
      .maybeSingle();

    const available = credits?.creditos_disponibles ?? 99999;
    if (available < 2) {
      return new Response(JSON.stringify({ error: 'NO_CREDITS', message: 'Se necesitan 2 créditos para generar una imagen' }), {
        status: 402,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Call Fal.ai Flux Pro
    const falBody: Record<string, unknown> = {
      prompt: promptGeneracion,
      num_images: 1,
      image_size: 'square_hd',
      enable_safety_checker: true,
    };

    if (fotoBaseUrl) {
      falBody.image_url = fotoBaseUrl;
    }

    const falResponse = await fetch('https://fal.run/fal-ai/flux-pro', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(falBody),
    });

    if (!falResponse.ok) {
      const errText = await falResponse.text();
      throw new Error(`Fal.ai API error: ${falResponse.status} - ${errText}`);
    }

    const falResult = await falResponse.json();
    const imageUrl = falResult.images?.[0]?.url;

    if (!imageUrl) throw new Error('No image returned from Fal.ai');

    // Download image and save to Storage
    const imageResp = await fetch(imageUrl);
    const imageBlob = await imageResp.blob();
    const arrayBuffer = await imageBlob.arrayBuffer();
    const timestamp = Date.now();
    const storagePath = `assets/${clientId}/generated/${timestamp}.png`;

    const { error: storageErr } = await supabase.storage
      .from('client-assets')
      .upload(storagePath, new Uint8Array(arrayBuffer), {
        contentType: 'image/png',
        upsert: false,
      });

    if (storageErr) throw storageErr;

    const { data: { publicUrl } } = supabase.storage
      .from('client-assets')
      .getPublicUrl(storagePath);

    // Save image as a separate asset record (supports parallel generation)
    await supabase.from('ad_assets').insert({
      creative_id: creativeId || null,
      client_id: clientId,
      asset_url: publicUrl,
      tipo: 'imagen',
    });

    // Deduct credits
    await supabase.from('client_credits').update({
      creditos_disponibles: (credits?.creditos_disponibles || 99999) - 2,
      creditos_usados: (credits?.creditos_usados || 0) + 2,
    }).eq('client_id', clientId);

    await supabase.from('credit_transactions').insert({
      client_id: clientId,
      accion: 'Generar imagen — Fal.ai Flux Pro',
      creditos_usados: 2,
      costo_real_usd: 0.05,
    });

    return new Response(JSON.stringify({ asset_url: publicUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('generate-image error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
