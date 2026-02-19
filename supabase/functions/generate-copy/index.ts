import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { clientId, funnel, formato, angulo, instrucciones, assetUrls } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch brand data
    const [briefRes, personaRes] = await Promise.all([
      supabase.from('brand_research').select('research_data').eq('client_id', clientId).eq('research_type', 'brand_brief').maybeSingle(),
      supabase.from('buyer_personas').select('persona_data').eq('client_id', clientId).eq('is_complete', true).maybeSingle(),
    ]);

    const brief = (briefRes.data?.research_data as Record<string, unknown>) || {};
    const persona = (personaRes.data?.persona_data as Record<string, unknown>) || {};

    // Check & deduct credits
    const { data: credits, error: creditsErr } = await supabase
      .from('client_credits')
      .select('id, creditos_disponibles, creditos_usados')
      .eq('client_id', clientId)
      .maybeSingle();

    if (creditsErr) throw creditsErr;

    if (!credits) {
      // Auto-create credits for client
      await supabase.from('client_credits').insert({ client_id: clientId, creditos_disponibles: 99999, creditos_usados: 0, plan: 'free_beta' });
    }

    const available = credits?.creditos_disponibles ?? 99999;
    if (available < 1) {
      return new Response(JSON.stringify({ error: 'NO_CREDITS', message: 'Sin créditos disponibles' }), {
        status: 402,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

    const competidores = (brief.competitors as string[])?.join(', ') || 'No especificados';
    const photosList = (assetUrls as string[] || []).slice(0, 5).join(', ');

    const systemPrompt = `Eres un experto en copywriting de performance marketing con metodología Sabri Suby + Russell Brunson. Genera copies de alta conversión para Meta Ads basado en los datos del cliente.`;

    const userPrompt = `DATOS DEL CLIENTE:
- Negocio: ${brief.business_description || brief.descripcion || 'E-commerce'}
- Buyer Persona: ${persona.nombre || 'Cliente ideal'}, ${persona.edad || '25-45'} años, ${persona.ocupacion || 'profesional'}
- Dolor principal: ${persona.dolor || persona.pain_points || 'No especificado'}
- Objeciones literales: ${persona.objeciones || persona.objections || 'No especificadas'}
- Tono de marca: ${brief.tone || brief.tono || 'profesional y cercano'}
- Garantía: ${brief.guarantee || brief.garantia || 'No especificada'}
- Prueba social: ${brief.social_proof || brief.prueba_social || 'No especificada'}
- Ventaja competitiva: ${brief.competitive_advantage || brief.ventaja_competitiva || 'No especificada'}
- CPA máximo: ${brief.max_cpa || brief.cpa_max || 'No especificado'}
- Competidores: ${competidores}
- Funnel: ${funnel?.toUpperCase()}
- Formato: ${formato === 'video' ? 'Video' : 'Imagen estática'}
- Ángulo creativo: ${angulo}
- Instrucciones adicionales: ${instrucciones || 'Ninguna'}
- Fotos del producto disponibles: ${photosList || 'No hay fotos aún'}

Usa las fotos para hacer el copy más específico y descriptivo cuando estén disponibles.

Genera exactamente 3 variaciones usando el ángulo "${angulo}" para un anuncio ${funnel?.toUpperCase()} ${formato === 'video' ? 'en video' : 'en imagen estática'}.

Responde SOLO en JSON válido sin markdown ni backticks:
{
  "explicacion": "Por qué este ángulo funciona para este cliente (2-3 líneas concretas)",
  "variaciones": [
    {
      "badge": "Variación A",
      "titulo": "...",
      "texto_principal": "...",
      "descripcion": "...",
      "cta": "..."
    },
    {
      "badge": "Variación B",
      "titulo": "...",
      "texto_principal": "...",
      "descripcion": "...",
      "cta": "..."
    },
    {
      "badge": "Variación C",
      "titulo": "...",
      "texto_principal": "...",
      "descripcion": "...",
      "cta": "..."
    }
  ]
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errText}`);
    }

    const aiResult = await response.json();
    const rawContent = aiResult.content?.[0]?.text || '';

    // Parse JSON
    let parsed;
    try {
      const clean = rawContent.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      throw new Error('Failed to parse AI response as JSON');
    }

    // Deduct 1 credit
    if (credits) {
      await supabase.from('client_credits').update({
        creditos_disponibles: (credits.creditos_disponibles || 99999) - 1,
        creditos_usados: (credits.creditos_usados || 0) + 1,
      }).eq('client_id', clientId);
    }

    // Record transaction
    await supabase.from('credit_transactions').insert({
      client_id: clientId,
      accion: `Generar copies — Ángulo: ${angulo} | ${funnel?.toUpperCase()} | ${formato}`,
      creditos_usados: 1,
      costo_real_usd: 0.01,
    });

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('generate-copy error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
