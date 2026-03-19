import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const {
      clientId,
      creativeId,
      promptGeneracion,
      fotoBaseUrl,
      formato,
      rechazoTexto,
      engine = 'gpt4o',
    } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

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

    // Adjust prompt if there's rejection text
    const promptBase = rechazoTexto
      ? `${promptGeneracion}. IMPORTANTE: Corregir esto: ${rechazoTexto}. No repetir el error anterior.`
      : promptGeneracion;

    const promptFinal = `${promptBase}, shot on Canon EOS R5, 85mm f/1.4 lens, natural window lighting, editorial style`;

    let imageBytes: Uint8Array | null = null;

    // Gemini only (no Fal/OpenAI fallbacks)
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');

    const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    };

    const base64ToBytes = (b64: string): Uint8Array => {
      const binaryStr = atob(b64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      return bytes;
    };

    const parts: any[] = [];

    if (fotoBaseUrl) {
      const refResp = await fetch(fotoBaseUrl);
      if (!refResp.ok) {
        parts.push({ text: promptFinal });
      } else {
        const refBuffer = await refResp.arrayBuffer();
        const refB64 = arrayBufferToBase64(refBuffer);
        const mimeType = refResp.headers.get('content-type') || 'image/jpeg';

        parts.push({ inlineData: { mimeType, data: refB64 } });
        parts.push({
          text: `CRITICAL: This is the REAL product photo. The product in the generated image MUST look EXACTLY like this. Place this exact real product into the advertising scene described below.\n\n${promptFinal}`,
        });
      }
    } else {
      parts.push({ text: promptFinal });
    }

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseModalities: ['IMAGE'] },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      throw new Error(`Gemini API error: ${geminiResponse.status} - ${errText}`);
    }

    const geminiResult: any = await geminiResponse.json();
    const responseParts = geminiResult.candidates?.[0]?.content?.parts || [];

    for (const part of responseParts) {
      if (part.inlineData?.data) {
        imageBytes = base64ToBytes(part.inlineData.data);
        break;
      }
    }

    if (!imageBytes) throw new Error('No image data obtained');

    // Save to Storage
    const timestamp = Date.now();
    const storagePath = `assets/${clientId}/generated/${timestamp}.png`;

    const { error: storageErr } = await supabase.storage
      .from('client-assets')
      .upload(storagePath, imageBytes, {
        contentType: 'image/png',
        upsert: false,
      });

    if (storageErr) throw storageErr;

    const { data: { publicUrl } } = supabase.storage
      .from('client-assets')
      .getPublicUrl(storagePath);

    // Save image as a separate asset record
    await supabase.from('ad_assets').insert({
      creative_id: creativeId || null,
      client_id: clientId,
      asset_url: publicUrl,
      tipo: 'imagen',
    });

    // Deduct credits
    const engineLabel = 'Gemini Flash';
    await supabase.from('client_credits').update({
      creditos_disponibles: (credits?.creditos_disponibles || 99999) - 2,
      creditos_usados: (credits?.creditos_usados || 0) + 2,
    }).eq('client_id', clientId);

    await supabase.from('credit_transactions').insert({
      client_id: clientId,
      accion: `Generar imagen — ${engineLabel}`,
      creditos_usados: 2,
      costo_real_usd: 0.02,
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
