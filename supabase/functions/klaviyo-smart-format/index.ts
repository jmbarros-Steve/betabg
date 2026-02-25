import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

const SYSTEM_PROMPT = `Eres un experto en email marketing con Klaviyo. Tu trabajo es tomar el contenido de un email en texto plano y convertirlo en HTML optimizado para Klaviyo, detectando automáticamente dónde deben ir:

1. **Variables de personalización** de Klaviyo:
   - Nombres: {{ first_name }}, {{ last_name }}
   - Email: {{ email }}
   - Organización: {{ organization.name }}, {{ organization.url }}
   
2. **Bloques de productos** (cuando se mencionan productos, catálogo, recomendaciones):
   - Usa el bloque estándar de Klaviyo con la sintaxis de template tags
   - {% for item in event.extra.line_items %} para carritos abandonados
   - Incluye imagen, título, precio y link del producto
   
3. **Botones CTA** (cuando detectes llamadas a la acción como "Comprar ahora", "Ver más", "Completar compra", etc.):
   - Usa botones HTML estilizados con links dinámicos
   - Para checkout: {{ event.extra.checkout_url }}
   - Para tienda: {{ organization.url }}
   
4. **Códigos de descuento** (cuando se mencionen cupones, descuentos, ofertas):
   - Usa {{ coupon_code }} o el código explícito mencionado
   - Estiliza el código como un bloque destacado
   
5. **Bloques condicionales** (cuando aplique):
   - {% if %} para contenido condicional
   - Filtros como |default:"Cliente"

6. **Imágenes de producto**:
   - {{ event.extra.line_items.0.product.images.0.src }} para carrito abandonado
   - Placeholder para imágenes de marca

REGLAS:
- Responde SOLO con el HTML resultante, sin explicaciones ni markdown
- El HTML debe ser compatible con clientes de email (inline styles, tablas para layout)
- Usa un diseño limpio, profesional y mobile-responsive
- Max width 600px centrado
- Incluye preheader oculto si hay preview text
- Los botones deben tener padding adecuado, border-radius, y color de fondo destacado
- Usa colores neutros profesionales (#333 texto, #007bff botones, #f8f9fa fondos)
- Si el contenido menciona productos genéricos, usa bloques de productos de Klaviyo
- Preserva todo el texto original, solo agrega la estructura HTML y los features de Klaviyo
- NO inventes contenido nuevo, solo formatea y enriquece lo existente`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { subject, preview_text, content, flow_type } = await req.json();

    if (!content) {
      return new Response(JSON.stringify({ error: 'content is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const flowContext = flow_type === 'abandoned_cart'
      ? '\nCONTEXTO: Este email es para un flujo de CARRITO ABANDONADO. Usa variables de evento de carrito como {{ event.extra.line_items }}, {{ event.extra.checkout_url }}, {{ event.extra.total_price }}.'
      : flow_type === 'welcome_series'
      ? '\nCONTEXTO: Este email es para una SERIE DE BIENVENIDA. Enfócate en presentar la marca y generar confianza.'
      : flow_type === 'customer_winback'
      ? '\nCONTEXTO: Este email es para REACTIVACIÓN DE CLIENTES inactivos. Usa urgencia y ofertas exclusivas.'
      : '\nCONTEXTO: Este es un email de CAMPAÑA PUNTUAL (promoción, lanzamiento, etc.).';

    const userMessage = `${flowContext}

Asunto: ${subject || '(sin asunto)'}
Preview: ${preview_text || '(sin preview)'}

Contenido del email:
${content}

Convierte esto en HTML optimizado para Klaviyo con todas las variables, bloques de productos, botones y features que detectes.`;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('Anthropic error:', anthropicRes.status, errText);
      return new Response(JSON.stringify({ error: 'AI processing failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await anthropicRes.json();
    const htmlContent = aiData.content?.[0]?.text || '';

    // Extract detected features for the UI summary
    const features: string[] = [];
    if (htmlContent.includes('{{ first_name }}') || htmlContent.includes('{{ last_name }}')) features.push('Variables de personalización');
    if (htmlContent.includes('line_items') || htmlContent.includes('{% for')) features.push('Bloques de productos');
    if (htmlContent.includes('checkout_url') || htmlContent.includes('organization.url')) features.push('Botones con links dinámicos');
    if (htmlContent.includes('coupon_code') || htmlContent.includes('discount')) features.push('Códigos de descuento');
    if (htmlContent.includes('{% if')) features.push('Contenido condicional');
    if (htmlContent.includes('<img')) features.push('Imágenes de producto');
    if (htmlContent.includes('<a') && htmlContent.includes('background-color')) features.push('Botones CTA estilizados');

    return new Response(JSON.stringify({
      html: htmlContent,
      features_detected: features,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error in klaviyo-smart-format:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
