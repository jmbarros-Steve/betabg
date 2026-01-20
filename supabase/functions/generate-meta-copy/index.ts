import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateRequest {
  clientId: string;
  adType: 'static' | 'video';
  funnelStage: 'tofu' | 'mofu' | 'bofu';
  customPrompt?: string;
}

const FUNNEL_CONTEXT = {
  tofu: {
    name: 'Top of Funnel (TOFU)',
    audience: 'Audiencia FRÍA - No te conocen, no saben que tienen un problema',
    goal: 'Llamar la atención, educar, generar curiosidad',
    focus: 'El PROBLEMA, no el producto. Interrumpir el scroll con algo que resuene.',
    approach: `
- Habla del dolor de las 3 AM del cliente
- Usa las palabras exactas que el cliente usa para describir su problema
- No vendas aún, educa y genera curiosidad
- Pregunta que haga pensar "¿Cómo saben lo que estoy pensando?"
- Estadísticas impactantes relacionadas con el problema
- El villano de la historia
`,
  },
  mofu: {
    name: 'Middle of Funnel (MOFU)',
    audience: 'Audiencia TIBIA - Te conocen, están evaluando opciones',
    goal: 'Construir confianza, diferenciarte, posicionar tu solución',
    focus: 'Tu SOLUCIÓN y por qué eres diferente. Credenciales y prueba social.',
    approach: `
- Muestra tu "Vaca Púrpura" - qué te hace diferente
- Comparte tu secreto del insider
- Testimonios y prueba social irrefutable
- Por qué elegirte a ti sobre la competencia
- Educa sobre la solución correcta al problema
- Tu proceso único o metodología
`,
  },
  bofu: {
    name: 'Bottom of Funnel (BOFU)',
    audience: 'Audiencia CALIENTE - Listos para comprar, solo necesitan el empujón',
    goal: 'Cerrar la venta con oferta irresistible',
    focus: 'La OFERTA del Padrino. Urgencia real, garantía absurda, bonos.',
    approach: `
- La oferta irresistible que sería tonto rechazar
- Garantía absurda que elimina todo riesgo
- Bonos que aumentan el valor percibido
- Urgencia REAL (no fake)
- Call to action directo y claro
- Recordatorio de lo que pierden si no actúan
`,
  },
};

const buildSystemPrompt = (briefData: any, adType: string, funnelStage: keyof typeof FUNNEL_CONTEXT, customPrompt?: string) => {
  const funnel = FUNNEL_CONTEXT[funnelStage];
  
  return `Eres un copywriter experto en Meta Ads con la metodología de Sabri Suby (Sell Like Crazy).

BRIEF DE MARCA DEL CLIENTE:
${JSON.stringify(briefData, null, 2)}

ETAPA DEL FUNNEL: ${funnel.name}
- Audiencia: ${funnel.audience}
- Objetivo: ${funnel.goal}
- Enfoque: ${funnel.focus}
- Approach:
${funnel.approach}

TIPO DE ANUNCIO: ${adType === 'static' ? 'Estático (imagen)' : 'Video'}

${customPrompt ? `INSTRUCCIONES ADICIONALES DEL CLIENTE: ${customPrompt}` : ''}

REGLAS DE SABRI SUBY PARA COPIES:
1. El 80% de la efectividad está en el HEADLINE
2. Llama a tu audiencia específica en el principio
3. Hazlos vivir su problema - usa sus palabras exactas
4. A más largo el copy, más confianza. No tengas miedo de escribir
5. Beneficios emocionales primero, lógicos después
6. Siempre termina con un CTA claro

ESTRUCTURA DE RESPUESTA (JSON válido):
{
  "headlines": ["3-5 headlines potentes y diferentes"],
  "primaryText": "Texto principal del anuncio (150-300 palabras para estático, puede ser más corto para BOFU)",
  "description": "Descripción corta de 1-2 líneas para debajo del headline"${adType === 'video' ? `,
  "hooks": ["5 hooks diferentes para los primeros 3 segundos del video"],
  "script": "Guión completo del video estructurado con timestamps y descripciones visuales"` : ''}
}

IMPORTANTE:
- Usa el tono de voz que el cliente definió en su brief
- Incorpora las palabras exactas que usa su buyer persona
- Para TOFU: NO vendas, genera curiosidad
- Para MOFU: Construye confianza, diferénciate
- Para BOFU: Oferta irresistible, urgencia, garantía
- Responde SOLO con el JSON, sin texto adicional`;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { clientId, adType, funnelStage, customPrompt } = await req.json() as GenerateRequest;

    if (!clientId || !adType || !funnelStage) {
      throw new Error('Missing required parameters');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch the completed brand brief
    const { data: briefData, error: briefError } = await supabase
      .from('buyer_personas')
      .select('*')
      .eq('client_id', clientId)
      .eq('is_complete', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (briefError || !briefData) {
      console.error('Brief error:', briefError);
      throw new Error('No completed brand brief found. Please complete the brief with Steve first.');
    }

    // Extract the answers from raw_data
    const rawData = briefData.raw_data || {};
    const executiveSummary = briefData.executive_summary || '';

    // Build the brief context
    const briefContext = {
      ...rawData,
      executiveSummary,
      personaName: briefData.name,
      personaAge: briefData.age_range,
      personaGender: briefData.gender,
      personaLocation: briefData.location,
      personaOccupation: briefData.occupation,
      personaPains: briefData.main_pains,
      personaDesires: briefData.main_desires,
      personaFears: briefData.main_fears,
      personaObjections: briefData.main_objections,
    };

    const systemPrompt = buildSystemPrompt(briefContext, adType, funnelStage, customPrompt);

    console.log('Generating copy for:', { clientId, adType, funnelStage });

    // Call Lovable AI
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { 
            role: 'user', 
            content: `Genera copies para un anuncio ${adType === 'static' ? 'estático' : 'de video'} de Meta Ads para la etapa ${funnelStage.toUpperCase()} del funnel. Usa toda la información del brief para crear copies que resuenen con el buyer persona.` 
          },
        ],
        temperature: 0.8,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limits exceeded. Please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: 'Payment required. Please add credits to your workspace.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      throw new Error('AI Gateway error');
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    // Parse the JSON response
    let parsedContent;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedContent = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Parse error:', parseError);
      console.log('Raw content:', content);
      throw new Error('Failed to parse AI response');
    }

    console.log('Successfully generated copy');

    return new Response(JSON.stringify(parsedContent), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-meta-copy:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
