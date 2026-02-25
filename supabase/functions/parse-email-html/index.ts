import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const systemPrompt = `Eres un parser de emails HTML. Tu trabajo es analizar el HTML de un email y convertirlo en un array de bloques JSON editables.

Los tipos de bloques disponibles son (usa EXACTAMENTE estos nombres de props):

- "text": Párrafos, títulos, texto. Props: { "content": "<p>texto con HTML</p>", "align": "left", "fontSize": 14, "color": "#333333" }
- "image": Imágenes. Props: { "src": "URL", "alt": "texto", "width": "100%", "align": "center", "link": "URL si clickeable" }
- "button": Botones/CTAs. Props: { "text": "texto", "url": "URL", "bgColor": "#hex", "textColor": "#hex", "borderRadius": 4, "align": "center", "width": "auto", "paddingV": 14, "paddingH": 32 }
- "divider": Líneas horizontales. Props: { "style": "solid", "color": "#e5e7eb", "thickness": 1, "width": "100%" }
- "spacer": Espacios. Props: { "height": 30 }
- "product": Producto. Props: { "name": "nombre", "imageUrl": "URL", "price": "$X", "description": "desc", "link": "URL", "buttonText": "Comprar", "layout": "image-top", "showPrice": true, "showDescription": true, "showButton": true }
- "coupon": Cupón. Props: { "code": "CODIGO", "description": "texto", "shopUrl": "URL", "buttonText": "Usar cupón" }
- "social_links": Redes sociales. Props: { "facebook": "URL", "instagram": "URL", "tiktok": "URL", "twitter": "URL", "iconStyle": "color", "iconSize": "medium", "align": "center" }
- "header_bar": Barra superior con texto. Props: { "text": "texto", "bgColor": "#000", "textColor": "#fff", "fontSize": 14 }
- "html": HTML genérico. Props: { "code": "HTML aquí" }

REGLAS:
1. Mantén TODO el contenido — no pierdas texto, imágenes ni links
2. El header del email (logo, barra de navegación superior) debe ser un bloque "html" con todo su HTML en props.code
3. El footer (unsubscribe, dirección, copyright) debe ser un bloque "html" con todo su HTML en props.code
4. Los botones con links de Shopify deben mantener las URLs exactas
5. Las variables de Klaviyo ({{ first_name }}, {% unsubscribe %}, etc.) deben mantenerse tal cual
6. Si hay productos con imagen + nombre + precio + botón, usar tipo "product"
7. Mantener los colores originales en los props
8. Para texto con formato (negritas, links), incluir tags HTML dentro del content
9. Cada bloque debe tener: { "id": "uuid-8chars", "type": "tipo", "props": { ... } }

Responde SOLO con el JSON array, sin explicación, sin markdown, sin backticks.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { html } = await req.json();

    if (!html || typeof html !== 'string') {
      return new Response(JSON.stringify({ error: 'html field required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Parsing email HTML: ${html.length} chars`);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Convierte este HTML de email en bloques JSON editables:\n\n${html}`
        }]
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic error:', response.status, errText);
      return new Response(JSON.stringify({ error: 'AI parsing failed', status: response.status }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '[]';

    console.log('Claude response length:', content.length);

    let blocks: any[];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      blocks = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr, 'Content:', content.substring(0, 500));
      return new Response(JSON.stringify({ error: 'Failed to parse AI response', raw: content.substring(0, 1000) }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Ensure each block has a proper id
    blocks = blocks.map((b: any) => ({
      ...b,
      id: b.id || crypto.randomUUID().split('-')[0],
      props: b.props || {},
    }));

    console.log(`Parsed ${blocks.length} blocks:`, blocks.map((b: any) => b.type));

    return new Response(JSON.stringify({ blocks, count: blocks.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('parse-email-html error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
