import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

function buildKnowledgeBlock(rules: Array<{ categoria: string; titulo: string; contenido: string; orden: number }>): string {
  if (!rules || rules.length === 0) return '';
  const grouped: Record<string, string[]> = {};
  for (const r of rules) {
    const cat = r.categoria.toUpperCase();
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(`- ${r.titulo}: ${r.contenido}`);
  }
  let block = '\n\nKNOWLEDGE BASE ACTUALIZADO (usa esta información para responder):\n';
  block += 'Si hay conflicto entre reglas, priorizar las de orden más alto (más recientes). Las reglas con orden 99 son las más actualizadas y deben prevalecer.\n\n';
  for (const [cat, items] of Object.entries(grouped)) {
    block += `[${cat}]\n${items.join('\n')}\n\n`;
  }
  return block;
}

function detectRelevantCategories(message: string): string[] {
  const msg = message.toLowerCase();
  const categories: string[] = [];
  if (msg.includes('meta') || msg.includes('facebook') || msg.includes('anuncio') || msg.includes('ads') || msg.includes('campaña') || msg.includes('roas') || msg.includes('cpm') || msg.includes('ctr') || msg.includes('cpa')) {
    categories.push('meta_ads', 'anuncios');
  }
  if (msg.includes('google') || msg.includes('search') || msg.includes('pmax') || msg.includes('performance max')) {
    categories.push('google_ads');
  }
  if (msg.includes('seo') || msg.includes('orgánico') || msg.includes('posicionamiento')) {
    categories.push('seo');
  }
  if (msg.includes('klaviyo') || msg.includes('email') || msg.includes('correo') || msg.includes('flow') || msg.includes('newsletter')) {
    categories.push('klaviyo');
  }
  if (msg.includes('shopify') || msg.includes('tienda') || msg.includes('ecommerce') || msg.includes('conversión')) {
    categories.push('shopify');
  }
  if (msg.includes('brief') || msg.includes('marca') || msg.includes('branding') || msg.includes('estrategia')) {
    categories.push('brief');
  }
  if (msg.includes('buyer') || msg.includes('persona') || msg.includes('cliente ideal') || msg.includes('audiencia')) {
    categories.push('buyer_persona');
  }
  if (msg.includes('creativ') || msg.includes('hook') || msg.includes('copy') || msg.includes('imagen') || msg.includes('video') || msg.includes('ugc')) {
    categories.push('anuncios');
  }
  // If nothing matched, load the most common categories
  if (categories.length === 0) {
    categories.push('meta_ads', 'brief', 'anuncios', 'shopify');
  }
  return [...new Set(categories)];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, client_id } = await req.json() as { messages: Message[]; client_id: string };

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Detect relevant categories from last user message
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const categories = lastUserMsg ? detectRelevantCategories(lastUserMsg.content) : ['meta_ads', 'brief', 'anuncios'];

    // Fetch knowledge rules
    const { data: knowledge } = await supabase
      .from('steve_knowledge')
      .select('categoria, titulo, contenido, orden')
      .in('categoria', categories)
      .eq('activo', true)
      .order('orden', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(30);

    // Fetch client brief context
    let clientContext = '';
    if (client_id) {
      const { data: client } = await supabase
        .from('clients')
        .select('name, company, website_url, fase_negocio, presupuesto_ads')
        .eq('id', client_id)
        .single();
      if (client) {
        clientContext = `\n\nCLIENTE ACTUAL: ${client.name}${client.company ? ` (${client.company})` : ''}${client.website_url ? ` | Web: ${client.website_url}` : ''}${client.fase_negocio ? ` | Fase: ${client.fase_negocio}` : ''}${client.presupuesto_ads ? ` | Budget Ads: $${client.presupuesto_ads}` : ''}`;
      }

      // Also fetch buyer persona if exists
      const { data: persona } = await supabase
        .from('buyer_personas')
        .select('persona_data, is_complete')
        .eq('client_id', client_id)
        .maybeSingle();
      if (persona?.is_complete && persona?.persona_data) {
        const pd = persona.persona_data as Record<string, unknown>;
        clientContext += `\nBRIEF COMPLETADO: Sí. Buyer persona disponible.`;
      }
    }

    const knowledgeBlock = buildKnowledgeBlock(knowledge || []);

    const systemPrompt = `Eres Steve, un Bulldog Francés con doctorado en Performance Marketing de Stanford. 🐕

PERSONALIDAD:
- Perro literal, brutalmente honesto, sin filtros
- Mezcla jerga de marketing con referencias perrunas
- Si algo es humo, lo ladras claro
- Usas emojis: 🐕 🎯 💰 📊 🚀 😤
- Groserías ocasionales cuando algo es absurdo
- Referencias a tu doctorado de Stanford

🌎 IDIOMA: Español latinoamericano neutro. NO uses voseo argentino.
💰 MONEDA: SIEMPRE usa Pesos Chilenos (CLP). NUNCA menciones COP, USD ni otra moneda a menos que el cliente lo pida explícitamente. Todos los ejemplos de presupuesto, CPA, CPM, etc. deben ser en CLP.
📋 BRIEF: Si el cliente quiere hacer un brief estratégico o llenar su cuestionario, NO lo hagas aquí. Dile que use la pestaña "Steve" (Brief) donde puede completar el cuestionario guiado paso a paso.

MODO: CONSULTOR ESTRATÉGICO
En este modo eres un consultor de marketing digital de alto nivel. El cliente puede preguntarte CUALQUIER cosa sobre:
- Estrategia de Meta Ads (estructuras, presupuestos, creativos, audiencias)
- Google Ads (Search, PMax, Shopping)
- SEO y contenido orgánico
- Klaviyo y email marketing
- Shopify y optimización de conversión
- Estrategia general de growth y performance marketing
- Análisis de métricas y KPIs
- Creativos y copywriting

REGLAS:
1. Responde de forma ACCIONABLE — no teoría genérica
2. Si tienes reglas aprendidas relevantes, APLÍCALAS al caso del cliente
3. Usa datos concretos cuando los tengas (CPA, ROAS, CPM, etc.)
4. Sé conciso pero completo (máximo 4-5 párrafos por respuesta)
5. Si no sabes algo, dilo — no inventes
6. Usa markdown para estructura (bullets, bold, tablas cuando aplique)
${clientContext}${knowledgeBlock}`;

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemPrompt,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Anthropic error:', response.status, text);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      throw new Error(`Anthropic error: ${response.status}`);
    }

    const data = await response.json();
    const message = data.content?.[0]?.text || '';

    return new Response(
      JSON.stringify({ message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Steve strategy error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
