import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { templateBlocks, campaign, shopUrl, colors, previousEmails, logoUrl, fontFamily } = body

    console.log('Request received:', JSON.stringify({
      hasTemplateBlocks: !!templateBlocks,
      templateBlocksCount: templateBlocks?.length,
      campaignName: campaign?.name,
      campaignSubject: campaign?.subject,
      campaignContent: campaign?.content?.substring(0, 100),
      hasShopUrl: !!shopUrl,
      hasColors: !!colors,
    }))

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
    if (!ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY not configured')
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const primaryColor = colors?.primary || '#000000'
    const buttonColor = colors?.button || '#000000'
    const buttonTextColor = colors?.buttonText || '#ffffff'
    const font = fontFamily || 'Arial, sans-serif'
    const logo = logoUrl || ''
    const shop = shopUrl || 'https://tu-tienda.myshopify.com'

    // Extract signature from previous emails if available
    let signatureHint = ''
    if (previousEmails) {
      signatureHint = `\nREFERENCIA DE TONO Y FIRMA (extraído de mails anteriores del cliente — úsalo como guía de estilo y firma):
${previousEmails.substring(0, 3000)}`
    }

    const systemPrompt = `Eres Steve, copywriter experto en email marketing para e-commerce chileno.

Tu trabajo: CREAR contenido original y persuasivo para emails de marketing. NO copies texto genérico. Cada email debe ser ÚNICO.

GENERA un array JSON de bloques para el email. Los tipos disponibles son:

1. header — Logo del cliente
   { "type": "header", "props": { "logoUrl": "${logo}", "content": "" } }

2. text — Texto con HTML inline (títulos, párrafos, listas)
   { "type": "text", "props": { "content": "<h1>Título aquí</h1>" } }

3. image — Imagen con link
   { "type": "image", "props": { "url": "URL_IMAGEN", "alt": "desc", "link": "URL_DESTINO" } }

4. button — Botón CTA
   { "type": "button", "props": { "text": "Texto CTA", "url": "URL", "bgColor": "${buttonColor}", "textColor": "${buttonTextColor}", "borderRadius": 4, "align": "center" } }

5. product — Bloque de producto
   { "type": "product", "props": { "name": "Nombre", "imageUrl": "URL", "price": "$X.XXX", "link": "${shop}/products/handle", "buttonText": "Comprar", "_mode": "fixed" } }

6. coupon — Cupón de descuento
   { "type": "coupon", "props": { "code": "CODIGO", "description": "Descripción del descuento", "buttonText": "Usar cupón", "link": "${shop}/discount/CODIGO" } }

7. divider — Separador
   { "type": "divider", "props": { "style": "solid", "color": "#eeeeee", "thickness": 1 } }

8. footer — Footer con unsubscribe
   { "type": "footer", "props": { "content": "¿No quieres recibir más correos? {% unsubscribe %}\\n{{ organization.name }} {{ organization.full_address }}" } }

REGLAS DE COPYWRITING:
1. Título principal: llamativo, directo, específico al tema. NO genérico.
2. Saludo: SIEMPRE usar {{ person.first_name|default:"" }} (sin "Hola" si no queda natural)
3. Cuerpo: 2-4 párrafos persuasivos, ESPECÍFICOS a las instrucciones. Beneficios concretos.
4. Al menos 1 botón CTA claro y directo
5. Si mencionan productos → bloque product
6. Si mencionan descuento/cupón → bloque coupon con link ${shop}/discount/CODIGO
7. Tono: profesional pero cercano. Español chileno informal (tú, no usted)
8. Estructura mínima: header → texto título → texto cuerpo → botón CTA → divider → texto firma → footer

URLS SHOPIFY:
- Tienda: ${shop}
- Colección: ${shop}/collections/[handle]
- Producto: ${shop}/products/[handle]
- Cupón: ${shop}/discount/[codigo]
- Carrito: ${shop}/cart

COLORES: primario ${primaryColor}, botón ${buttonColor}, texto botón ${buttonTextColor}
${signatureHint}

Responde SOLO con el array JSON de bloques. Sin explicación, sin markdown, sin backticks. Solo JSON puro.`

    const userMessage = `Genera un email COMPLETO y ORIGINAL para esta campaña:

Nombre: ${campaign?.name || 'Sin nombre'}
Asunto: ${campaign?.subject || 'Sin asunto'}
Instrucciones: ${campaign?.content || 'Crear un email promocional atractivo'}

IMPORTANTE: 
- NO copies texto genérico ni placeholder. Escribe contenido REAL y persuasivo.
- El email debe ser único y específico a las instrucciones.
- Incluye detalles concretos, beneficios y un CTA claro.`

    console.log('Calling Anthropic API... system prompt length:', systemPrompt.length)

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    })

    console.log('Anthropic response status:', response.status)

    if (!response.ok) {
      const errText = await response.text()
      console.error('Anthropic API error:', response.status, errText.substring(0, 500))
      return new Response(JSON.stringify({ 
        error: `Anthropic API error: ${response.status}`,
        details: errText.substring(0, 500)
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || '[]'
    console.log('Claude response length:', text.length, 'preview:', text.substring(0, 200))

    // Parse JSON cleaning possible markdown
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    
    let blocks
    try {
      blocks = JSON.parse(clean)
    } catch (parseErr: any) {
      console.error('JSON parse error:', parseErr.message, 'Raw:', clean.substring(0, 300))
      return new Response(JSON.stringify({ 
        error: 'Failed to parse Claude response as JSON',
        raw: clean.substring(0, 500)
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    // Ensure IDs
    const blocksWithIds = (Array.isArray(blocks) ? blocks : []).map((b: any, i: number) => ({
      ...b,
      id: b.id || `block-${Date.now()}-${i}`
    }))

    console.log('Generated', blocksWithIds.length, 'blocks for', campaign?.name)

    return new Response(JSON.stringify({ blocks: blocksWithIds }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    console.error('generate-mass-campaigns error:', err.message, err.stack)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})