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
    const { templateBlocks, campaign, shopUrl, colors, previousEmails } = await req.json()

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured')

    const systemPrompt = `Eres Steve, experto en email marketing para e-commerce Shopify con Klaviyo.

Tu trabajo: tomar una plantilla de email en formato de bloques JSON y ADAPTARLA según las instrucciones del usuario, manteniendo la estructura, el tono y el estilo.

PLANTILLA BASE (bloques JSON que debes modificar):
${JSON.stringify(templateBlocks)}

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
- Tienda: ${shopUrl}
- Colección: ${shopUrl}/collections/[handle]
- Producto: ${shopUrl}/products/[handle]
- Carrito: ${shopUrl}/cart
- Cupón: ${shopUrl}/discount/[codigo]

COLORES DEL CLIENTE:
- Primario: ${colors?.primary || '#000000'}
- Botón: ${colors?.button || '#000000'}
- Texto botón: ${colors?.buttonText || '#ffffff'}

VARIABLES DE KLAVIYO (usar donde corresponda):
- Saludo: {{ person.first_name|default:"Amigo" }}
- Si es flow de carrito: {{ event.items.0.product.title }}, etc.
- Si es flow de browse: {{ event.extra.title }}, etc.

Responde SOLO con el array JSON de bloques modificados. Sin explicación, sin markdown, solo JSON puro.`

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

Nombre: ${campaign.name}
Asunto: ${campaign.subject}
Instrucciones: ${campaign.content}

Genera los bloques JSON modificados.`
        }]
      })
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Anthropic API error:', response.status, errText)
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || '[]'
    
    // Parse JSON cleaning possible markdown
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    
    let blocks
    try {
      blocks = JSON.parse(clean)
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr, 'Raw text:', text.substring(0, 500))
      throw new Error('Error parseando respuesta de la IA')
    }
    
    // Ensure IDs
    const blocksWithIds = (Array.isArray(blocks) ? blocks : []).map((b: any, i: number) => ({
      ...b,
      id: b.id || `block-${Date.now()}-${i}`
    }))

    return new Response(JSON.stringify({ blocks: blocksWithIds }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    console.error('generate-mass-campaigns error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
