import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Google Ads specific methodology
const GOOGLE_ADS_METHODOLOGY = `
═══════════════════════════════════════════════════════════════════════════════
METODOLOGÍA PARA GOOGLE ADS - Responsive Search Ads (RSA)
═══════════════════════════════════════════════════════════════════════════════

ESTRUCTURA DE UN RSA:
- 15 Headlines (máximo 30 caracteres cada uno)
- 4 Descripciones (máximo 90 caracteres cada una)
- Títulos largos opcionales (máximo 90 caracteres)
- Sitelinks con título y descripción

PRINCIPIOS DE SABRI SUBY PARA SEARCH ADS:
1. La persona está BUSCANDO activamente - ya tiene intención
2. Responde directamente a su búsqueda/problema
3. Usa las palabras que ELLOS usarían
4. Destaca la DIFERENCIACIÓN inmediatamente
5. Incluye prueba social comprimida

PRINCIPIOS DE RUSSELL BRUNSON PARA SEARCH ADS:
1. Hook en el headline - captura con curiosidad o beneficio directo
2. Story condensada en descripción - micro-narrativa
3. Offer claro - qué obtienen si hacen clic

TIPOS DE HEADLINES A INCLUIR:
1. Headline con keyword principal (intención directa)
2. Headline con beneficio primario
3. Headline con diferenciador único
4. Headline con prueba social (números, testimonios cortos)
5. Headline con urgencia/escasez
6. Headline con pregunta que genera curiosidad
7. Headline con el "villano" (problema que resuelves)
8. Headline con la transformación
9. Headline con precio/oferta si aplica
10. Headlines con variaciones de la keyword

SITELINKS ESTRATÉGICOS:
- Link a testimonios/casos de éxito
- Link a oferta principal o descuento
- Link a página de servicios/productos
- Link a contacto/demo/consulta gratuita
`;

const CAMPAIGN_TYPES = {
  search: {
    name: 'Búsqueda (Search)',
    focus: 'Responder a la intención de búsqueda activa del usuario',
    tips: 'Headlines con keywords, beneficios directos y diferenciadores',
  },
  display: {
    name: 'Display/GDN',
    focus: 'Captar atención visual y generar awareness',
    tips: 'Headlines más llamativos, enfocados en problema/solución',
  },
  performance_max: {
    name: 'Performance Max',
    focus: 'Variedad para que el algoritmo optimice',
    tips: 'Mix de headlines emocionales, racionales y de acción',
  },
  remarketing: {
    name: 'Remarketing',
    focus: 'Reconectar con visitantes anteriores',
    tips: 'Headlines que recuerden el valor, urgencia y ofertas especiales',
  },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { clientId, campaignType, customPrompt } = await req.json();
    
    if (!clientId) {
      return new Response(
        JSON.stringify({ error: 'clientId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch brand brief
    const { data: briefData, error: briefError } = await supabase
      .from('buyer_personas')
      .select('persona_data, is_complete')
      .eq('client_id', clientId)
      .eq('is_complete', true)
      .maybeSingle();

    if (briefError || !briefData) {
      return new Response(
        JSON.stringify({ error: 'Brief de marca no encontrado o incompleto' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEVE'S LEARNING ENGINE: Dual-layer learning from ALL clients + this client
    // ═══════════════════════════════════════════════════════════════════════════

    // 1. GLOBAL LEARNING: Patterns from ALL clients
    const { data: globalFeedback } = await supabase
      .from('steve_feedback')
      .select('rating, feedback_text, content_type')
      .eq('content_type', 'google_copy')
      .order('created_at', { ascending: false })
      .limit(50);

    // 2. CLIENT-SPECIFIC LEARNING: This client's preferences
    const { data: clientFeedback } = await supabase
      .from('steve_feedback')
      .select('rating, feedback_text, content_type, improvement_notes')
      .eq('client_id', clientId)
      .eq('content_type', 'google_copy')
      .order('created_at', { ascending: false })
      .limit(10);

    // Build Steve's learning context
    let learningContext = '';
    
    // Global patterns analysis
    if (globalFeedback && globalFeedback.length > 0) {
      const globalAvgRating = globalFeedback.reduce((sum, f) => sum + (f.rating || 0), 0) / globalFeedback.length;
      const globalNegative = globalFeedback.filter(f => (f.rating || 0) <= 2 && f.feedback_text);
      const globalPositive = globalFeedback.filter(f => (f.rating || 0) >= 4 && f.feedback_text);
      
      learningContext += `
═══════════════════════════════════════════════════════════════════════════════
🧠 STEVE'S GLOBAL LEARNING - Google Ads (${globalFeedback.length} generaciones)
═══════════════════════════════════════════════════════════════════════════════
Rating promedio global: ${globalAvgRating.toFixed(1)}/5

${globalPositive.length > 0 ? `
✅ PATRONES EXITOSOS EN GOOGLE ADS:
${globalPositive.slice(0, 5).map(f => `- "${f.feedback_text}"`).join('\n')}
` : ''}

${globalNegative.length > 0 ? `
⚠️ ERRORES COMUNES A EVITAR:
${globalNegative.slice(0, 5).map(f => `- "${f.feedback_text}"`).join('\n')}
` : ''}
`;
    }

    // Client-specific preferences
    if (clientFeedback && clientFeedback.length > 0) {
      const clientAvgRating = clientFeedback.reduce((sum, f) => sum + (f.rating || 0), 0) / clientFeedback.length;
      const clientNegative = clientFeedback.filter(f => (f.rating || 0) <= 2 && f.feedback_text);
      const clientPositive = clientFeedback.filter(f => (f.rating || 0) >= 4 && f.feedback_text);
      
      learningContext += `
═══════════════════════════════════════════════════════════════════════════════
🎯 PREFERENCIAS DE ESTE CLIENTE
═══════════════════════════════════════════════════════════════════════════════
Rating del cliente: ${clientAvgRating.toFixed(1)}/5

${clientPositive.length > 0 ? `
✅ LO QUE PREFIERE (PRIORIDAD):
${clientPositive.map(f => `- "${f.feedback_text}"`).join('\n')}
` : ''}

${clientNegative.length > 0 ? `
⛔ LO QUE RECHAZA:
${clientNegative.map(f => `- "${f.feedback_text}"`).join('\n')}
` : ''}
`;
    }

    const campaign = CAMPAIGN_TYPES[campaignType as keyof typeof CAMPAIGN_TYPES] || CAMPAIGN_TYPES.search;

    const systemPrompt = `Eres un experto en Google Ads y copywriting, entrenado en las metodologías de Sabri Suby y Russell Brunson.

${GOOGLE_ADS_METHODOLOGY}

═══════════════════════════════════════════════════════════════════════════════
BRIEF DE MARCA DEL CLIENTE
═══════════════════════════════════════════════════════════════════════════════
${JSON.stringify(briefData.persona_data, null, 2)}

═══════════════════════════════════════════════════════════════════════════════
TIPO DE CAMPAÑA: ${campaign.name}
═══════════════════════════════════════════════════════════════════════════════
Enfoque: ${campaign.focus}
Tips: ${campaign.tips}

${customPrompt ? `INSTRUCCIONES ADICIONALES: ${customPrompt}` : ''}

${learningContext}

═══════════════════════════════════════════════════════════════════════════════
FORMATO DE RESPUESTA
═══════════════════════════════════════════════════════════════════════════════

Responde ÚNICAMENTE con un JSON válido:
{
  "headlines": [
    "15 headlines de máximo 30 caracteres cada uno",
    "Variedad: keywords, beneficios, diferenciadores, prueba social",
    "Incluye el nombre de la marca en al menos 2"
  ],
  "longHeadlines": [
    "3 títulos largos de máximo 90 caracteres",
    "Más contexto y propuesta de valor completa"
  ],
  "descriptions": [
    "4 descripciones de máximo 90 caracteres",
    "Hook + micro-historia + CTA",
    "Diferentes ángulos: problema, solución, beneficio, urgencia"
  ],
  "sitelinks": [
    {
      "title": "Título del sitelink (máx 25 chars)",
      "description": "Descripción del sitelink (máx 35 chars)",
      "suggestedUrl": "/ruta-sugerida"
    }
  ]
}

REGLAS:
- Cada headline: máximo 30 caracteres
- Cada título largo: máximo 90 caracteres  
- Cada descripción: máximo 90 caracteres
- Cada título de sitelink: máximo 25 caracteres
- Cada descripción de sitelink: máximo 35 caracteres
- USA el tono y vocabulario del buyer persona
- INCLUYE números y prueba social donde sea posible
- NO uses signos de exclamación excesivos
- APLICA las preferencias del cliente del feedback de Steve`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Genera copies para una campaña de ${campaign.name} basándote en el brief de marca proporcionado.` },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error('AI gateway error');
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid JSON response from AI');
    }

    const generatedCopy = JSON.parse(jsonMatch[0]);

    return new Response(
      JSON.stringify(generatedCopy),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Generate Google copy error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
