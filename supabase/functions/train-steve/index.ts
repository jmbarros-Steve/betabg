import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { contenido, categoriaHint } = await req.json();

    if (!contenido?.trim()) {
      return new Response(JSON.stringify({ error: 'Contenido vacío' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY no configurada');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── Call Claude ──────────────────────────────────────────────────────────
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
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

${categoriaHint ? `Categoría sugerida: ${categoriaHint}` : 'Detecta la categoría automáticamente'}

Por cada concepto importante genera una entrada. Si el contenido tiene varios temas distintos, crea múltiples entradas.

Por cada concepto genera:
{
  "categoria": "categoria_detectada",
  "titulo": "título corto y descriptivo (máximo 80 caracteres)",
  "contenido": "reglas concretas y accionables en formato de lista numerada. Usa el formato: 1. Regla. 2. Regla. etc.",
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
      throw new Error(`Anthropic error: ${errText}`);
    }

    const anthropicData = await anthropicRes.json();
    const rawText = anthropicData.content[0].text.trim();

    // Strip markdown code fences if present
    const jsonText = rawText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
    const resultado = JSON.parse(jsonText);

    if (!resultado.entradas || !Array.isArray(resultado.entradas)) {
      throw new Error('Respuesta de Claude no tiene el formato esperado');
    }

    // ── Save to DB ───────────────────────────────────────────────────────────
    let savedKnowledge = 0;
    let savedBugs = 0;

    await Promise.all(
      resultado.entradas.map(async (entrada: {
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
          orden: 99,
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

    return new Response(
      JSON.stringify({
        ...resultado,
        savedKnowledge,
        savedBugs,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('train-steve error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Error interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
