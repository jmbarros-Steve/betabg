import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { predictionId, creativeId, clientId } = await req.json();

    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE_API_KEY) throw new Error('REPLICATE_API_KEY not configured');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Check prediction status on Replicate
    const replicateResp = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { 'Authorization': `Token ${REPLICATE_API_KEY}` },
    });

    if (!replicateResp.ok) {
      throw new Error(`Replicate check error: ${replicateResp.status}`);
    }

    const prediction = await replicateResp.json();
    const status = prediction.status; // starting | processing | succeeded | failed | canceled

    if (status === 'succeeded') {
      // Get the video URL from output
      const videoUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;

      if (!videoUrl) throw new Error('No video URL in completed prediction');

      // Download video and save to Storage
      const videoResp = await fetch(videoUrl);
      const videoBuffer = await videoResp.arrayBuffer();
      const timestamp = Date.now();
      const storagePath = `assets/${clientId}/generated/${timestamp}.mp4`;

      const { error: storageErr } = await supabase.storage
        .from('client-assets')
        .upload(storagePath, new Uint8Array(videoBuffer), {
          contentType: 'video/mp4',
          upsert: false,
        });

      if (storageErr) {
        console.error('Storage upload error:', storageErr);
        // Still update creative with original URL if storage fails
      }

      const { data: { publicUrl } } = supabase.storage
        .from('client-assets')
        .getPublicUrl(storagePath);

      const finalUrl = storageErr ? videoUrl : publicUrl;

      if (creativeId) {
        await supabase.from('ad_creatives').update({
          asset_url: finalUrl,
          estado: 'aprobado',
        }).eq('id', creativeId);
      }

      return new Response(JSON.stringify({ status: 'succeeded', asset_url: finalUrl }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (status === 'failed' || status === 'canceled') {
      if (creativeId) {
        await supabase.from('ad_creatives').update({ estado: 'borrador' }).eq('id', creativeId);
      }
      return new Response(JSON.stringify({ status: 'failed', error: prediction.error || 'Video generation failed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Still processing
    return new Response(JSON.stringify({ status, progress: prediction.metrics?.predict_time || null }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('check-video-status error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
