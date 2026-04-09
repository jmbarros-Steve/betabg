import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

const BASE_SYSTEM_PROMPT = `Eres un experto en email marketing con Klaviyo. Tu trabajo es tomar el contenido de un email en texto plano y convertirlo en HTML optimizado para Klaviyo, detectando automaticamente donde deben ir:

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

async function loadBrandContext(supabase: any, connectionId: string): Promise<string> {
  const connection = await safeQuerySingleOrDefault<any>(
    supabase
      .from('platform_connections')
      .select('client_id')
      .eq('id', connectionId)
      .eq('platform', 'klaviyo')
      .single(),
    null,
    'klaviyoSmartFormat.getConnection',
  );

  if (!connection?.client_id) return '';

  const [{ data: personaData }, { data: knowledgeData }] = await Promise.all([
    supabase
      .from('buyer_personas')
      .select('persona_data, is_complete')
      .eq('client_id', connection.client_id)
      .eq('is_complete', true)
      .maybeSingle(),
    supabase
      .from('steve_knowledge')
      .select('id, titulo, contenido')
      .eq('categoria', 'klaviyo')
      .eq('activo', true)
      .eq('approval_status', 'approved')
      .is('purged_at', null)
      .order('orden', { ascending: false })
      .limit(10),
  ]);

  const klRuleIds = (knowledgeData || []).map((k: any) => k.id).filter(Boolean);
  if (klRuleIds.length > 0) {
    supabase.from('qa_log').insert({ check_type: 'knowledge_injection', status: 'info', details: JSON.stringify({ source: 'klaviyo-smart-format', rule_count: klRuleIds.length, rule_ids: klRuleIds }), detected_by: 'klaviyo-smart-format' }).then(({ error }: any) => { if (error) console.error('[klaviyo-smart-format] qa_log:', error.message); });
  }

  let brandContext = '';

  if (personaData?.is_complete && personaData?.persona_data) {
    const pd = personaData.persona_data as any;
    const tone = pd.tono_marca || pd.tone || pd.brand_tone || '';
    const brandName = pd.nombre_marca || pd.brand_name || pd.nombre_negocio || '';
    const colors = pd.colores_marca || pd.brand_colors || '';

    if (tone || brandName || colors) {
      brandContext += `\n\nIDENTIDAD DE MARCA:`;
      if (brandName) brandContext += `\n- Marca: ${brandName}`;
      if (tone) brandContext += `\n- Tono de voz: ${tone}`;
      if (colors) brandContext += `\n- Colores de marca: ${JSON.stringify(colors)}`;
      brandContext += `\n- Adapta el diseno visual al tono y colores de la marca cuando sea posible`;
    }
  }

  if (knowledgeData && knowledgeData.length > 0) {
    brandContext += `\n\nREGLAS APRENDIDAS PARA KLAVIYO:\n${knowledgeData.map((k: any) => `- ${k.titulo}: ${k.contenido}`).join('\n')}`;
  }

  return brandContext;
}

export async function klaviyoSmartFormat(c: Context) {
  try {
    // User already validated by authMiddleware
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const supabase = getSupabaseAdmin();

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      console.error('[klaviyo-smart-format] ANTHROPIC_API_KEY not configured');
      return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
    }

    const { subject, preview_text, content, flow_type, connectionId } = await c.req.json();

    if (!content) {
      return c.json({ error: 'content is required' }, 400);
    }

    // Load brand context if connectionId is provided (backwards compatible)
    let brandContext = '';
    if (connectionId) {
      brandContext = await loadBrandContext(supabase, connectionId);
    }

    const systemPrompt = BASE_SYSTEM_PROMPT + brandContext;

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

    const anthropicController = new AbortController();
    const anthropicTimeout = setTimeout(() => anthropicController.abort(), 25_000);
    let anthropicRes: Response;
    try {
      anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
        signal: anthropicController.signal,
      });
    } catch (fetchErr: any) {
      if (fetchErr?.name === 'AbortError') {
        return c.json({ error: 'AI processing timed out (25s) — intenta de nuevo' }, 504);
      }
      throw fetchErr;
    } finally {
      clearTimeout(anthropicTimeout);
    }

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
