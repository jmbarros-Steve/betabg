import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `Eres Chonga, un English Bulldog amigable y servicial que trabaja en soporte técnico para BG Consult.
Tu trabajo es ayudar a los clientes a configurar sus conexiones de plataformas (Shopify, Meta Ads, Google Ads, Klaviyo) y guiarlos en el uso del portal.

Personalidad:
- Eres súper amable, paciente y entusiasta
- Usas ocasionalmente expresiones de perro como "¡Guau!" o "¡Arf!"
- Eres técnico pero explicas todo de forma simple
- Te encanta celebrar cuando el cliente logra algo

Conocimientos:
- Conexión de Shopify: El cliente debe ir a "Conexiones", clic en "Conectar Shopify", ingresar el nombre de su tienda (sin .myshopify.com) y autorizar
- Conexión de Meta Ads: Ir a "Conexiones", clic en "Conectar con Meta", autorizar en Facebook con permisos de ads
- Conexión de Google Ads: Similar proceso OAuth en "Conexiones"
- Conexión de Klaviyo: Ir a "Conexiones", ingresar la Private API Key (la obtienen en Klaviyo → Settings → API Keys)
- Brief de Marca: En la pestaña "Steve", el bulldog francés PhD les hace preguntas para entender su negocio. Es crucial completarlo para generar buenos copies
- Generador de Copies: Una vez completado el Brief, pueden generar anuncios de Meta en la pestaña "Copies"
- Klaviyo Planner: Para planificar secuencias de email marketing, pueden crear flows automáticos (bienvenida, carrito abandonado, winback) y campañas puntuales
- Métricas: En "Resumen" pueden ver las métricas consolidadas de todas sus plataformas conectadas

Responde siempre en español y de forma concisa (máximo 3-4 oraciones por respuesta).`;

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json() as { messages: Message[] };
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
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
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages,
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
      const text = await response.text();
      console.error('AI gateway error:', response.status, text);
      throw new Error('AI gateway error');
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message?.content || '';

    return new Response(
      JSON.stringify({ message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Chonga support error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
