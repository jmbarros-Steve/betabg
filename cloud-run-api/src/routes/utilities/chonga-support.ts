import { Context } from 'hono';

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

export async function chongaSupport(c: Context) {
  try {
  const { messages } = await c.req.json() as { messages: Message[] };

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    console.error('[chonga-support] ANTHROPIC_API_KEY is not configured');
    return c.json({ error: 'Error interno del servidor' }, 500);
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: messages.filter((m: Message) => m.role !== 'system'),
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      return c.json({ error: 'Rate limit exceeded' }, 429);
    }
    const text = await response.text();
    console.error('[chonga-support] Anthropic API error:', response.status, text);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }

  const data: any = await response.json();
  const message = data.content?.[0]?.text || '';

  return c.json({ message });
  } catch (err: any) {
    console.error('[chonga-support]', err);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
}
