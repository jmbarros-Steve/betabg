import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

// ═══════════════════════════════════════════════════════════════
// Claude API helper
// ═══════════════════════════════════════════════════════════════
async function callClaude(system: string, userMessage: string, maxTokens = 4096): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('Anthropic API error:', res.status, errText.substring(0, 500));
    if (res.status === 429) {
      throw new Error('Rate limit exceeded. Intenta de nuevo en unos segundos.');
    }
    throw new Error(`Anthropic API error: ${res.status}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

// ═══════════════════════════════════════════════════════════════
// JSON extraction helper — handles cases where Claude wraps
// JSON in markdown or adds extra text around it
// ═══════════════════════════════════════════════════════════════
function extractJSON(text: string): unknown {
  // First: strip markdown code fences
  let clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  // Try direct parse
  try {
    return JSON.parse(clean);
  } catch {
    // ignore
  }

  // Try to find a JSON array
  const arrayMatch = clean.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]);
    } catch {
      // ignore
    }
  }

  // Try to find a JSON object
  const objectMatch = clean.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch {
      // ignore
    }
  }

  throw new Error('No se pudo extraer JSON válido de la respuesta de Claude');
}

// ═══════════════════════════════════════════════════════════════
// Action: analyze
// ═══════════════════════════════════════════════════════════════
async function handleAnalyze(body: { content: string; contentType?: string }): Promise<Response> {
  const { content, contentType } = body;

  if (!content || content.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'content is required and cannot be empty' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const systemPrompt = `Eres un experto en marketing digital y análisis de contenido. Tu trabajo es analizar contenido en bruto (texto, CSV, JSON, URLs, listas de productos) y extraer items individuales para campañas de email marketing.

REGLAS:
1. Identifica cada item individual en el contenido (producto, promoción, evento, noticia, etc.)
2. Clasifica cada item con su tipo, prioridad y ángulo de email recomendado
3. Extrae precios e imágenes si están disponibles en el contenido original
4. Responde SIEMPRE en español
5. Sé preciso: no inventes datos que no estén en el contenido original

Para cada item extraído, genera un objeto con estos campos exactos:
- "name": nombre del item (string)
- "type": uno de "producto", "promocion", "evento", "noticia", "lanzamiento", "coleccion"
- "description": descripción breve del item (string, máx 150 chars)
- "priority": "alta", "media" o "baja" (basado en urgencia/impacto comercial)
- "emailAngle": uno de "promotional", "informativo", "urgency", "storytelling", "social_proof"
- "imageUrl": URL de imagen si se encontró en el contenido, o "" si no
- "price": precio si se encontró, o "" si no
- "originalData": el texto original correspondiente a este item

Responde SOLO con un JSON array puro. Sin explicaciones, sin markdown, sin backticks. Solo el array JSON.`;

  const contentTypeHint = contentType ? `\n[Formato del contenido: ${contentType}]` : '';
  const userMessage = `Analiza el siguiente contenido y extrae todos los items individuales para campañas de email marketing:${contentTypeHint}

---
${content}
---

Responde SOLO con el JSON array de items.`;

  try {
    const rawResponse = await callClaude(systemPrompt, userMessage, 8192);
    console.log('Analyze response length:', rawResponse.length);

    const items = extractJSON(rawResponse);

    if (!Array.isArray(items)) {
      throw new Error('La respuesta de Claude no es un array de items');
    }

    // Build summary
    const typeCounts: Record<string, number> = {};
    for (const item of items) {
      const t = item.type || 'otro';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }
    const parts = Object.entries(typeCounts).map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`);
    const summary = `Detecté ${items.length} items: ${parts.join(', ')}.`;

    return new Response(JSON.stringify({ items, summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Analyze error:', error);
    const msg = error instanceof Error ? error.message : 'Error al analizar el contenido';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// Action: generate
// ═══════════════════════════════════════════════════════════════
interface AnalyzedItem {
  name: string;
  type: string;
  description: string;
  emailAngle: string;
  priority?: string;
  imageUrl?: string;
  price?: string;
  originalData?: string;
}

async function handleGenerate(body: {
  items: AnalyzedItem[];
  brandTone?: string;
  month: string;
  year: number;
}): Promise<Response> {
  const { items, brandTone, month, year } = body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return new Response(JSON.stringify({ error: 'items array is required and cannot be empty' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!month || !year) {
    return new Response(JSON.stringify({ error: 'month and year are required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const systemPrompt = `Eres un experto en email marketing y planificación de campañas. Tu trabajo es generar contenido de email optimizado y un calendario de envío inteligente.

REGLAS DE COPYWRITING:
1. Subject lines: máximo 60 caracteres, persuasivos, sin spam words
2. Preview text: máximo 100 caracteres, complementa el subject
3. Títulos: claros, directos, con gancho
4. Intro: 2-3 oraciones persuasivas y específicas
5. CTA: acción clara y directa (máx 4 palabras)
6. Responde SIEMPRE en español

REGLAS DE CALENDARIO:
1. Distribuir envíos a lo largo del mes de forma equilibrada
2. Máximo 3-4 emails por semana
3. Preferir martes, miércoles y jueves (días 2, 3, 4)
4. Horarios ideales: 10am a 2pm
5. Items de prioridad "alta" deben ir primero en el mes
6. No programar en fines de semana

${brandTone ? `TONO DE MARCA: ${brandTone}` : 'TONO: Profesional pero cercano, español latinoamericano neutro.'}

Responde con un objeto JSON con dos campos:
1. "emails": array con un objeto por cada item, en el mismo orden que los items de entrada. Cada objeto tiene:
   - "subject": subject line optimizado (máx 60 chars)
   - "previewText": preview text (máx 100 chars)
   - "title": headline del email
   - "introText": párrafo introductorio (2-3 oraciones)
   - "ctaText": texto del botón CTA
   - "suggestedDay": día de la semana (1=Lunes a 5=Viernes)
   - "suggestedHour": hora de envío (9 a 17)

2. "schedule": array de objetos con la programación sugerida. Cada objeto tiene:
   - "itemIndex": índice del item (0-based)
   - "itemName": nombre del item
   - "date": fecha sugerida en formato "YYYY-MM-DD"
   - "hour": hora sugerida (9 a 17)
   - "reason": breve razón de por qué ese día/hora

Responde SOLO con el JSON puro. Sin explicaciones, sin markdown, sin backticks.`;

  const itemsList = items.map((item, i) => {
    return `[Item ${i + 1}]
Nombre: ${item.name}
Tipo: ${item.type}
Descripción: ${item.description}
Ángulo email: ${item.emailAngle}
${item.priority ? `Prioridad: ${item.priority}` : ''}
${item.price ? `Precio: ${item.price}` : ''}`;
  }).join('\n\n');

  const userMessage = `Genera contenido de email y calendario para los siguientes ${items.length} items, programados para ${month} ${year}:

${itemsList}

Genera un email optimizado para cada item y un calendario inteligente distribuyendo los envíos a lo largo de ${month} ${year}.`;

  try {
    const rawResponse = await callClaude(systemPrompt, userMessage, 8192);
    console.log('Generate response length:', rawResponse.length);

    const result = extractJSON(rawResponse) as { emails?: unknown[]; schedule?: unknown[] };

    if (!result || typeof result !== 'object') {
      throw new Error('La respuesta de Claude no es un objeto válido');
    }

    const emails = Array.isArray(result.emails) ? result.emails : [];
    const schedule = Array.isArray(result.schedule) ? result.schedule : [];

    if (emails.length === 0) {
      throw new Error('Claude no generó ningún email');
    }

    return new Response(JSON.stringify({ emails, schedule }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Generate error:', error);
    const msg = error instanceof Error ? error.message : 'Error al generar contenido de emails';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// Main handler
// ═══════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth verification ──────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Parse body ─────────────────────────────────────────────
    const body = await req.json();
    const { action } = body;

    if (!action) {
      return new Response(JSON.stringify({ error: 'action is required (analyze | generate)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`steve-bulk-analyze: action=${action}, user=${user.id}`);

    // ── Route to action handler ────────────────────────────────
    switch (action) {
      case 'analyze':
        return await handleAnalyze(body);

      case 'generate':
        return await handleGenerate(body);

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}. Valid actions: analyze, generate` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error: unknown) {
    console.error('steve-bulk-analyze error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
