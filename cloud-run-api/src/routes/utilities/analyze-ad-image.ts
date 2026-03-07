import { Context } from 'hono';

export async function analyzeAdImage(c: Context) {
  const { imageBase64, mediaType, performance, context } = await c.req.json();

  if (!imageBase64) {
    return c.json({ error: 'imageBase64 is required' }, 400);
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
  }

  const perfLabel = performance === 'funciono'
    ? '✅ ANUNCIO QUE SÍ FUNCIONÓ'
    : performance === 'no_funciono'
    ? '❌ ANUNCIO QUE NO FUNCIONÓ'
    : '🤷 RENDIMIENTO DESCONOCIDO';

  const contextBlock = context
    ? `\nMétricas / contexto real proporcionado:\n${context}\n`
    : '';

  const focusInstruction = performance === 'funciono'
    ? 'Este anuncio SÍ funcionó. Enfoca el análisis en qué elementos lo hicieron exitoso y por qué funciona bien.'
    : performance === 'no_funciono'
    ? 'Este anuncio NO funcionó. Enfoca el análisis en identificar qué falló: qué elementos debilitaron el anuncio, qué errores cometió y cómo corregirlos.'
    : 'No se sabe si funcionó. Analiza objetivamente fortalezas y debilidades.';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType || 'image/jpeg',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: `Eres un experto en performance marketing y creativos de alta conversión.

CONTEXTO: ${perfLabel}
${contextBlock}
${focusInstruction}

Analiza este anuncio y extrae:

1. POR QUÉ FUNCIONA (o por qué falló):
   - Composición visual
   - Uso del color
   - Jerarquía de texto
   - Elemento principal que captura (o pierde) atención

2. PATRÓN DE COPY:
   - Hook utilizado
   - Estructura del mensaje
   - CTA y su efectividad

3. ÁNGULO CREATIVO:
   - Qué tipo de ángulo usa (beneficio, dolor, social proof, etc)
   - Por qué este ángulo funciona o falla para esta audiencia

4. LO QUE STEVE DEBE APRENDER:
   - 3 reglas concretas extraídas de este anuncio
   - En formato: "Cuando hagas X, siempre Y porque Z"

Responde en español, de forma concreta y accionable.`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Anthropic error:', errorText);
    return c.json({ error: 'Anthropic API error', details: errorText }, 500);
  }

  const data: any = await response.json();
  const analysis = data.content?.[0]?.text ?? '';

  return c.json({ analysis });
}
