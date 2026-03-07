import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

const SYSTEM_PROMPT = `Eres un experto en email marketing con Klaviyo. Tu trabajo es tomar el contenido de un email en texto plano y convertirlo en HTML optimizado para Klaviyo, detectando automaticamente donde deben ir:

1. **Variables de personalizacion** de Klaviyo:
   - Nombres: {{ first_name }}, {{ last_name }}
   - Email: {{ email }}
   - Organizacion: {{ organization.name }}, {{ organization.url }}

2. **Bloques de productos** (cuando se mencionan productos, catalogo, recomendaciones):
   - Usa el bloque estandar de Klaviyo con la sintaxis de template tags
   - {% for item in event.extra.line_items %} para carritos abandonados
   - Incluye imagen, titulo, precio y link del producto

3. **Botones CTA** (cuando detectes llamadas a la accion como "Comprar ahora", "Ver mas", "Completar compra", etc.):
   - Usa botones HTML estilizados con links dinamicos
   - Para checkout: {{ event.extra.checkout_url }}
   - Para tienda: {{ organization.url }}

4. **Codigos de descuento** (cuando se mencionen cupones, descuentos, ofertas):
   - Usa {{ coupon_code }} o el codigo explicito mencionado
   - Estiliza el codigo como un bloque destacado

5. **Bloques condicionales** (cuando aplique):
   - {% if %} para contenido condicional
   - Filtros como |default:"Cliente"

6. **Imagenes de producto**:
   - {{ event.extra.line_items.0.product.images.0.src }} para carrito abandonado
   - Placeholder para imagenes de marca

REGLAS:
- Responde SOLO con el HTML resultante, sin explicaciones ni markdown
- El HTML debe ser compatible con clientes de email (inline styles, tablas para layout)
- Usa un diseno limpio, profesional y mobile-responsive
- Max width 600px centrado
- Incluye preheader oculto si hay preview text
- Los botones deben tener padding adecuado, border-radius, y color de fondo destacado
- Usa colores neutros profesionales (#333 texto, #007bff botones, #f8f9fa fondos)
- Si el contenido menciona productos genericos, usa bloques de productos de Klaviyo
- Preserva todo el texto original, solo agrega la estructura HTML y los features de Klaviyo
- NO inventes contenido nuevo, solo formatea y enriquece lo existente`;

export async function klaviyoSmartFormat(c: Context) {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const supabase = getSupabaseAdmin();

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
    }

    const { subject, preview_text, content, flow_type } = await c.req.json();

    if (!content) {
      return c.json({ error: 'content is required' }, 400);
    }

    const flowContext = flow_type === 'abandoned_cart'
      ? '\nCONTEXTO: Este email es para un flujo de CARRITO ABANDONADO. Usa variables de evento de carrito como {{ event.extra.line_items }}, {{ event.extra.checkout_url }}, {{ event.extra.total_price }}.'
      : flow_type === 'welcome_series'
      ? '\nCONTEXTO: Este email es para una SERIE DE BIENVENIDA. Enfocate en presentar la marca y generar confianza.'
      : flow_type === 'customer_winback'
      ? '\nCONTEXTO: Este email es para REACTIVACION DE CLIENTES inactivos. Usa urgencia y ofertas exclusivas.'
      : '\nCONTEXTO: Este es un email de CAMPANA PUNTUAL (promocion, lanzamiento, etc.).';

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
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('Anthropic error:', anthropicRes.status, errText);
      return c.json({ error: 'AI processing failed', detail: `Anthropic API ${anthropicRes.status}`, anthropic_error: errText.substring(0, 500) }, 500);
    }

    const aiData: any = await anthropicRes.json();
    const htmlContent = aiData.content?.[0]?.text || '';

    // Extract detected features for the UI summary
    const features: string[] = [];
    if (htmlContent.includes('{{ first_name }}') || htmlContent.includes('{{ last_name }}')) features.push('Variables de personalizacion');
    if (htmlContent.includes('line_items') || htmlContent.includes('{% for')) features.push('Bloques de productos');
    if (htmlContent.includes('checkout_url') || htmlContent.includes('organization.url')) features.push('Botones con links dinamicos');
    if (htmlContent.includes('coupon_code') || htmlContent.includes('discount')) features.push('Codigos de descuento');
    if (htmlContent.includes('{% if')) features.push('Contenido condicional');
    if (htmlContent.includes('<img')) features.push('Imagenes de producto');
    if (htmlContent.includes('<a') && htmlContent.includes('background-color')) features.push('Botones CTA estilizados');

    return c.json({
      html: htmlContent,
      features_detected: features,
    });
  } catch (error: unknown) {
    console.error('Error in klaviyo-smart-format:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return c.json({ error: message }, 500);
  }
}
