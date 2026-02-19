import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { clientId, formato, angulo, variacionElegida, assetUrls } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const [briefRes, personaRes] = await Promise.all([
      supabase.from('brand_research').select('research_data').eq('client_id', clientId).eq('research_type', 'brand_brief').maybeSingle(),
      supabase.from('buyer_personas').select('persona_data').eq('client_id', clientId).eq('is_complete', true).maybeSingle(),
    ]);

    const brief = (briefRes.data?.research_data as Record<string, unknown>) || {};
    const persona = (personaRes.data?.persona_data as Record<string, unknown>) || {};

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

    const photosList = (assetUrls as string[] || []).slice(0, 5).join(', ');
    const copyText = `Título: ${variacionElegida?.titulo}\nTexto: ${variacionElegida?.texto_principal}\nDescripción: ${variacionElegida?.descripcion}\nCTA: ${variacionElegida?.cta}`;

    const userPrompt = `Basándote en el copy aprobado y las fotos reales del producto, genera el brief visual para producción.

Copy aprobado:
${copyText}

Formato: ${formato === 'video' ? 'Video' : 'Imagen estática'}
Ángulo: ${angulo}
Buyer Persona: ${persona.nombre || 'Cliente ideal'}, ${persona.edad || '25-45'} años
Colores de marca: ${brief.brand_colors || brief.colores || 'A definir'}
Estilo visual: ${brief.visual_style || brief.estilo || 'moderno y limpio'}
Fotos disponibles del producto: ${photosList || 'No hay fotos'}

${formato === 'video' ? `Responde en JSON para VIDEO:
{
  "tipo": "video",
  "duracion": "15s",
  "escena_1": {"tiempo": "0-3s", "descripcion": "...", "texto_overlay": "..."},
  "escena_2": {"tiempo": "3-12s", "descripcion": "...", "texto_overlay": "..."},
  "escena_3": {"tiempo": "12-15s", "descripcion": "...", "texto_overlay": "..."},
  "musica_sugerida": "...",
  "tono": "...",
  "foto_recomendada": "URL de la foto más adecuada y por qué (o 'Sin foto disponible')",
  "instruccion_foto": "animar / usar como base / cambiar fondo",
  "prompt_generacion": "prompt detallado en inglés para Kling AI"
}` : `Responde en JSON para IMAGEN:
{
  "tipo": "imagen",
  "concepto": "...",
  "plano_principal": "...",
  "texto_overlay": "...",
  "estilo_fotografico": "lifestyle/ugc/editorial/clean",
  "iluminacion": "...",
  "colores": "...",
  "foto_recomendada": "URL de la foto más adecuada y por qué (o 'Sin foto disponible')",
  "instruccion_foto": "usarla tal cual / cambiar fondo / agregar texto / animar",
  "prompt_generacion": "prompt detallado en inglés para Fal.ai Flux Pro"
}`}

Responde SOLO el JSON sin markdown ni backticks.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1500,
        system: 'Eres un director creativo experto en producción de anuncios para Meta Ads. Generas briefs visuales detallados y accionables para equipos de producción.',
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errText}`);
    }

    const aiResult = await response.json();
    const rawContent = aiResult.content?.[0]?.text || '';

    let parsed;
    try {
      const clean = rawContent.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      throw new Error('Failed to parse AI response as JSON');
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('generate-brief-visual error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
