export async function generateSpec(task: any): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: `Eres CEREBRO de Steve Ads. Genera una spec ejecutable para un agente Claude Code.

TAREA:
Título: ${task.title}
Descripción: ${task.description}
Tipo: ${task.type}
Squad: ${task.assigned_squad}

Responde SOLO con este formato exacto:

## ARCHIVOS A TOCAR
(máximo 5 rutas completas)

## QUÉ PASA ANTES
(1-2 líneas, el bug actual)

## QUÉ DEBE PASAR DESPUÉS
(1-2 líneas, resultado esperado)

## PASOS EXACTOS
1. (paso concreto)
2. (paso concreto)
(máximo 7 pasos)

## TEST DE VERIFICACIÓN
(cómo verificar que funciona)

## NO TOCAR
(qué NO modificar)`,
        },
      ],
    }),
  });

  const data = (await response.json()) as any;
  return data.content[0].text;
}
