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
    const { templateBlocks, campaign, shopUrl, colors, previousEmails } = body

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
    console.log('Anthropic API key exists:', !!ANTHROPIC_API_KEY, 'length:', ANTHROPIC_API_KEY?.length)

    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Truncate template if too large
    const templateJson = JSON.stringify(templateBlocks || [])
    const truncatedTemplate = templateJson.length > 15000
      ? templateJson.substring(0, 15000) + '... (truncated)'
      : templateJson
    console.log('Template JSON length:', templateJson.length, 'truncated:', templateJson.length > 15000)

    const systemPrompt = `Eres Steve, experto en email marketing para e-commerce Shopify con Klaviyo.

Tu trabajo: tomar una plantilla de email en formato de bloques JSON y ADAPTARLA según las instrucciones del usuario, manteniendo la estructura, el tono y el estilo.

PLANTILLA BASE (bloques JSON que debes modificar):
${truncatedTemplate}

${previousEmails ? `MAILS ANTERIORES DEL CLIENTE (para mantener el mismo tono, firma y estilo):
${previousEmails}` : ''}

REGLAS OBLIGATORIAS:
1. MANTÉN la estructura del template — misma cantidad de secciones, mismo layout
2. MODIFICA solo el contenido según las instrucciones
3. MANTÉN el tono de los mails anteriores del cliente (formal/informal, tuteo/usted, emojis, etc.)
4. MANTÉN la firma exacta si aparece en los mails anteriores (nombre, cargo, teléfono, logo)
5. Los bloques de tipo "header" y "footer" NO se modifican (quedan igual del template)
6. Si las instrucciones dicen "productos cross-sell" o "productos recomendados" → usar bloque product con _mode: "dynamic" y _dynamicType: "recommended"
7. Si dicen "productos del carrito" → _dynamicType: "cart_item"
8. Si dicen "productos de colección X" → _mode: "collection" con collectionHandle
9. Si dicen "producto fijo X" → _mode: "fixed" con datos del producto
10. Cada bloque DEBE tener un id único (string)

URLS DE SHOPIFY:
- Tienda: ${shopUrl || 'https://tienda.com'}
- Colección: ${shopUrl || 'https://tienda.com'}/collections/[handle]
- Producto: ${shopUrl || 'https://tienda.com'}/products/[handle]
- Carrito: ${shopUrl || 'https://tienda.com'}/cart
- Cupón: ${shopUrl || 'https://tienda.com'}/discount/[codigo]

COLORES DEL CLIENTE:
- Primario: ${colors?.primary || '#000000'}
- Botón: ${colors?.button || '#000000'}
- Texto botón: ${colors?.buttonText || '#ffffff'}

VARIABLES DE KLAVIYO (usar donde corresponda):
- Saludo: {{ person.first_name|default:"Amigo" }}

Responde SOLO con el array JSON de bloques modificados. Sin explicación, sin markdown, solo JSON puro.`

    console.log('System prompt length:', systemPrompt.length)
    console.log('Calling Anthropic API with model claude-sonnet-4-20250514...')

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
        messages: [{
          role: 'user',
          content: `Adapta el template para esta campaña:

Nombre: ${campaign?.name || 'Sin nombre'}
Asunto: ${campaign?.subject || 'Sin asunto'}
Instrucciones: ${campaign?.content || campaign?.instructions || 'Sin instrucciones'}

Genera los bloques JSON modificados.`
        }]
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