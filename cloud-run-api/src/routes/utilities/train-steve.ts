import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { detectKnowledgeConflicts } from '../../lib/knowledge-conflict-detector.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

export async function trainSteve(c: Context) {
  try {
  const supabase = getSupabaseAdmin();

  // Admin role check
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const userRole = await safeQuerySingleOrDefault<any>(
    supabase
      .from('user_roles')
      .select('is_super_admin, role')
      .eq('user_id', user.id)
      .maybeSingle(),
    null,
    'trainSteve.getUserRole',
  );

  if (!userRole?.is_super_admin && userRole?.role !== 'admin') {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const { contenido, categoriaHint } = await c.req.json();

  if (!contenido?.trim()) {
    return c.json({ error: 'Contenido vacío' }, 400);
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    console.error('[train-steve] ANTHROPIC_API_KEY no configurada');
    return c.json({ error: 'Error interno del servidor' }, 500);
  }

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `Eres un extractor de conocimiento para Steve,
consultor de performance marketing para e-commerce latinoamericano.

Procesa este contenido y estructúralo en entradas para el knowledge base.

Categorías disponibles:
- meta_ads
- google_ads
- seo
- keywords
- klaviyo
- shopify
- brief
- anuncios
- buyer_persona
- analisis
- prospecting (reglas de venta por WhatsApp: stages, pitch, objeciones, técnicas de cierre)
- sales_learning (aprendizajes extraídos de conversaciones reales con prospectos)
- sales_strategy (meta-patrones de ventas que aplican a múltiples conversaciones)

${categoriaHint ? `Categoría sugerida: ${categoriaHint}` : 'Detecta la categoría automáticamente'}

Por cada concepto importante genera una entrada. Si el contenido tiene varios temas distintos, crea múltiples entradas.

Por cada concepto genera:
{
  "categoria": "categoria_detectada",
  "titulo": "título corto y descriptivo (máximo 60 caracteres)",
  "contenido": "CUANDO: [situación]. HAZ: 1. [paso]. 2. [paso]. PORQUE: [razón]. Máximo 600 caracteres.",
  "bugs": [
    {
      "descripcion": "error que Steve debe evitar (máximo 100 caracteres)",
      "ejemplo_malo": "comportamiento incorrecto concreto",
      "ejemplo_bueno": "comportamiento correcto concreto"
    }
  ]
}

IMPORTANTE: Responde SOLO con JSON válido, sin texto adicional, sin markdown, sin bloques de código.
El JSON debe tener exactamente esta estructura:
{
  "entradas": [...],
  "resumen": "En 1 línea qué aprendió Steve"
}

Contenido a procesar:
${contenido}`,
      }],
    }),
  });

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text();
    console.error('[train-steve] Anthropic error:', errText);
    return c.json({ error: 'Error procesando el contenido. Intenta de nuevo.' }, 500);
  }

  const anthropicData: any = await anthropicRes.json();
  const rawText = anthropicData.content[0].text.trim();

  const jsonText = rawText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
  const resultado = JSON.parse(jsonText);

  if (!resultado.entradas || !Array.isArray(resultado.entradas)) {
    return c.json({ error: 'Error en el formato de respuesta. Intenta de nuevo.' }, 500);
  }

  let savedKnowledge = 0;
  let savedBugs = 0;
  let conflictsDetected = 0;

  // Extract rules for conflict detection
  const newRules = resultado.entradas.map((e: any) => ({
    categoria: e.categoria,
    titulo: e.titulo,
    contenido: e.contenido,
  }));

  // Detect conflicts before inserting
  const conflictCheck = await detectKnowledgeConflicts(supabase, newRules, ANTHROPIC_API_KEY!);
  conflictsDetected = conflictCheck.conflicts.length;

  // Only insert safe (non-conflicting) rules
  const safeEntradas = resultado.entradas.filter((e: any) =>
    conflictCheck.safeRules.some((s: any) => s.titulo === e.titulo)
  );

  await Promise.all(
    safeEntradas.map(async (entrada: {
      categoria: string;
      titulo: string;
      contenido: string;
      bugs?: Array<{ descripcion: string; ejemplo_malo?: string; ejemplo_bueno?: string }>;
    }) => {
      const { error: kErr } = await supabase.from('steve_knowledge').insert({
        categoria: entrada.categoria,
        titulo: entrada.titulo,
        contenido: entrada.contenido,
        activo: true,
        orden: 90,
      });

      if (!kErr) savedKnowledge++;

      if (entrada.bugs && entrada.bugs.length > 0) {
        await Promise.all(
          entrada.bugs.map(async (bug: any) => {
            const { error: bErr } = await supabase.from('steve_bugs').insert({
              categoria: entrada.categoria,
              descripcion: bug.descripcion,
              ejemplo_malo: bug.ejemplo_malo || null,
              ejemplo_bueno: bug.ejemplo_bueno || null,
              activo: true,
            });
            if (!bErr) savedBugs++;
          }),
        );
      }
    }),
  );

  return c.json({
    ...resultado,
    savedKnowledge,
    savedBugs,
    conflictsDetected,
    conflicts: conflictCheck.conflicts,
  });
  } catch (err: any) {
    console.error('[train-steve]', err);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
}
