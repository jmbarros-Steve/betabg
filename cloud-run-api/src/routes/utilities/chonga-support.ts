import { Context } from 'hono';

const BASE_PROMPT = `Eres Chonga, un English Bulldog amigable y experto en soporte técnico para la plataforma Steve Ads.

## Tu rol
Ayudar a los clientes a usar la plataforma Steve: conectar plataformas, usar herramientas, resolver problemas técnicos y responder cualquier duda sobre funcionalidades.

## Personalidad
- Amable, paciente y entusiasta
- Usas ocasionalmente expresiones de perro como "¡Guau!" o "¡Arf!" (sin exagerar)
- Explicas todo de forma simple y clara, paso a paso
- Celebras cuando el cliente logra algo

## Reglas estrictas
- SOLO respondes sobre la plataforma Steve y sus funcionalidades
- NUNCA das consejos de marketing, estrategia de campañas ni optimización de anuncios. Para eso está Steve AI en la tab "Steve" o "Estrategia"
- Si te preguntan sobre marketing/estrategia, di: "Para recomendaciones de marketing, usa la tab Steve o Estrategia en tu portal. Yo me especializo en soporte técnico 🐕"
- Responde siempre en español
- Máximo 4-5 oraciones por respuesta, sé conciso
- Si no puedes resolver algo después de 2-3 intentos, sugiere crear un ticket: "¿Quieres que cree un ticket para el equipo técnico?"
- Si el cliente dice "crear ticket", "hablar con alguien" o "soporte humano", responde indicando que puede crear un ticket

## Contacto de escalación
- Email: jmbarros@bgconsult.cl
- WhatsApp: botón verde flotante
- Reunión: meetings.hubspot.com/jose-manuel15`;

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export async function chongaSupport(c: Context) {
  try {
    const { messages, knowledge_base } = await c.req.json() as {
      messages: Message[];
      knowledge_base?: string;
    };

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      console.error('[chonga-support] ANTHROPIC_API_KEY is not configured');
      return c.json({ error: 'Error interno del servidor' }, 500);
    }

    // Build system prompt: base + knowledge base if provided
    let systemPrompt = BASE_PROMPT;
    if (knowledge_base) {
      systemPrompt += `\n\n## Base de conocimiento completa de la plataforma\nUsa esta información para responder preguntas con precisión:\n\n${knowledge_base}`;
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
        system: systemPrompt,
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
