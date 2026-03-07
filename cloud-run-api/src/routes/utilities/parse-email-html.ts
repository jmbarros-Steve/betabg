import { Context } from 'hono';
import { randomUUID } from 'node:crypto';

const systemPrompt = `Eres un parser experto de emails HTML. Tu trabajo es analizar el HTML de un email y convertirlo en bloques JSON editables.

REGLAS ESTRICTAS DE PARSING:

1. NUNCA uses tipo "html" a menos que sea absolutamente imposible clasificar el contenido.
   El tipo "html" es el ÚLTIMO RECURSO.

2. Para CADA sección del email, usa el tipo más específico posible:

   - Si ves un <img> solo → tipo "image" con props: { "src": "URL", "alt": "texto", "width": "100%", "align": "center", "link": "URL si clickeable" }
   - Si ves texto con <p>, <h1>, <h2>, <h3>, <span>, <b>, <strong> → tipo "text"
     Props: { "content": "<p>texto limpio</p>", "align": "left", "fontSize": 14, "color": "#333333" }
     Limpia el HTML y deja solo: <h1>, <h2>, <h3>, <p>, <b>, <strong>, <i>, <em>, <a href>, <br>, <ul>, <li>, <ol>
     Elimina: <table>, <tr>, <td>, <div>, atributos de estilo complejos
   - Si ves un <a> con estilo de botón (background-color, padding, border-radius) → tipo "button"
     Props: { "text": "texto del link", "url": "href", "bgColor": "#hex", "textColor": "#hex", "borderRadius": 4, "align": "center", "width": "auto", "paddingV": 14, "paddingH": 32 }
   - Si ves una tabla con imagen + nombre + precio + botón → tipo "product"
     Props: { "name": "nombre", "imageUrl": "URL", "price": "$X", "description": "desc", "link": "URL", "buttonText": "Comprar", "layout": "image-top", "showPrice": true, "showDescription": true, "showButton": true }
   - Si ves 2-3 productos lado a lado en columnas → tipo "product" para cada uno, envueltos en "split"
   - Si ves un <hr> o borde horizontal → tipo "divider"
     Props: { "style": "solid", "color": "#e5e7eb", "thickness": 1, "width": "100%" }
   - Si ves espacio vacío (td con solo height, o div vacío con height) → tipo "spacer"
     Props: { "height": 30 }
   - Si ves íconos de redes sociales con links → tipo "social_links"
     Props: { "facebook": "URL", "instagram": "URL", "tiktok": "URL", "twitter": "URL", "iconStyle": "color", "iconSize": "medium", "align": "center" }
   - Si ves una barra de color sólido con texto (como "OFERTA" o "ENVÍO GRATIS") → tipo "header_bar"
     Props: { "text": "texto", "bgColor": "#000", "textColor": "#fff", "fontSize": 14 }
   - Si ves un código de descuento con borde punteado → tipo "coupon"
     Props: { "code": "CODIGO", "description": "texto", "shopUrl": "URL", "buttonText": "Usar cupón" }
   - Si ves estrellas ★ con texto de review → tipo "review"
     Props: { "customerName": "nombre", "reviewText": "texto", "rating": 5 }

3. PRODUCTOS DINÁMICOS: Si ves {{ Title }}, {{ Price }}, o variables de Klaviyo de producto,
   es un bloque tipo "product" con modo dinámico:
   Props: { "name": "{{ item.title|safe }}", "price": "{{ item.price }}", "imageUrl": "URL o variable", "link": "URL o variable", "productMode": "dynamic", "dynamicType": "lastViewed", "buttonText": "Comprar", "showPrice": true, "showButton": true }

4. LIMPIEZA DE TEXTO: Para bloques tipo "text", NO incluyas todo el HTML de la tabla.
   Extrae SOLO el contenido legible.
   MAL:  { "content": "<table><tr><td style='font-family:Ubuntu...'><p>Hola</p></td></tr></table>" }
   BIEN: { "content": "<p>Hola</p>" }

5. LOGO ARRIBA: Si ves un logo centrado al inicio del email, hazlo tipo "image" con la URL del logo.

6. FOOTER: El pie de página con unsubscribe, dirección, copyright → tipo "html" con todo el HTML en props.code
   (este es un caso válido para usar "html" porque los footers son complejos).

7. HEADER COMPLEJO: Si el header tiene navegación compleja → tipo "html" con todo el HTML en props.code.
   Si es solo un logo → tipo "image".

8. Cada bloque DEBE tener: { "id": "uuid-8chars", "type": "tipo", "props": { ... } }

Responde SOLO con el JSON array, sin explicación, sin markdown, sin backticks.`;

export async function parseEmailHtml(c: Context) {
  const { html } = await c.req.json();

  if (!html || typeof html !== 'string') {
    return c.json({ error: 'html field required' }, 400);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
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
        content: `Convierte este HTML de email en bloques JSON editables. Recuerda: usa tipos específicos (text, image, button, product, etc.) y NUNCA "html" excepto para headers complejos y footers. Limpia el HTML de los textos.\n\n${html}`
      }]
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Anthropic error:', response.status, errText);
    return c.json({ error: 'AI parsing failed', status: response.status }, 500);
  }

  const data: any = await response.json();
  const content = data.content?.[0]?.text || '[]';

  console.log('Claude response length:', content.length);

  let blocks: any[];
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    blocks = JSON.parse(jsonMatch ? jsonMatch[0] : content);
  } catch (parseErr) {
    console.error('JSON parse error:', parseErr, 'Content:', content.substring(0, 500));
    return c.json({ error: 'Failed to parse AI response', raw: content.substring(0, 1000) }, 500);
  }

  blocks = blocks.map((b: any) => ({
    ...b,
    id: b.id || randomUUID().split('-')[0],
    props: b.props || {},
  }));

  console.log(`Parsed ${blocks.length} blocks:`, blocks.map((b: any) => b.type));

  return c.json({ blocks, count: blocks.length });
}
