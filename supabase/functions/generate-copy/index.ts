import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { clientId, funnel, formato, angulo, instrucciones, assetUrls, fase_negocio, presupuesto_ads, producto_seleccionado, categoria_seleccionada, tipo_anuncio, campana_destino } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch brand data
    const [briefRes, personaRes] = await Promise.all([
      supabase.from('brand_research').select('research_data').eq('client_id', clientId).eq('research_type', 'brand_brief').maybeSingle(),
      supabase.from('buyer_personas').select('persona_data').eq('client_id', clientId).eq('is_complete', true).maybeSingle(),
    ]);

    const brief = (briefRes.data?.research_data as Record<string, unknown>) || {};
    const persona = (personaRes.data?.persona_data as Record<string, unknown>) || {};

    // Check & deduct credits
    const { data: credits, error: creditsErr } = await supabase
      .from('client_credits')
      .select('id, creditos_disponibles, creditos_usados')
      .eq('client_id', clientId)
      .maybeSingle();

    if (creditsErr) throw creditsErr;

    if (!credits) {
      // Auto-create credits for client
      await supabase.from('client_credits').insert({ client_id: clientId, creditos_disponibles: 99999, creditos_usados: 0, plan: 'free_beta' });
    }

    const available = credits?.creditos_disponibles ?? 99999;
    if (available < 1) {
      return new Response(JSON.stringify({ error: 'NO_CREDITS', message: 'Sin créditos disponibles' }), {
        status: 402,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

    // Detect relevant category from context
    const contextoLower = `${funnel || ''} ${angulo || ''} ${instrucciones || ''}`.toLowerCase();
    const categoriaRelevante =
      contextoLower.includes('google') ? 'google_ads' :
      'meta_ads'; // generate-copy is primarily for ads

    const [{ data: knowledge }, { data: bugs }] = await Promise.all([
      supabase.from('steve_knowledge').select('categoria, titulo, contenido')
        .in('categoria', [categoriaRelevante, 'anuncios', 'meta_ads'])
        .eq('activo', true)
        .order('orden', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('steve_bugs').select('categoria, descripcion, ejemplo_malo, ejemplo_bueno')
        .in('categoria', [categoriaRelevante, 'anuncios'])
        .eq('activo', true).limit(5),
    ]);

    const copyKnowledge = knowledge?.map((k: any) =>
      `### [${k.categoria.toUpperCase()}] ${k.titulo}\n${k.contenido}`
    ).join('\n\n') || '';

    const copyBugs = bugs?.map((b: any) =>
      `❌ EVITAR: ${b.descripcion}\nMAL: ${b.ejemplo_malo}\nBIEN: ${b.ejemplo_bueno}`
    ).join('\n\n') || '';

    const knowledgeSection = copyKnowledge ? `\nREGLAS APRENDIDAS DE CREATIVOS (seguir obligatoriamente):\nSi hay conflicto entre reglas, priorizar las de orden más alto (más recientes). Las reglas con orden 99 son las más actualizadas y deben prevalecer.\n${copyKnowledge}\n` : '';
    const bugSection = copyBugs ? `\nERRORES A EVITAR EN COPIES:\n${copyBugs}\n` : '';

    const competidores = (brief.competitors as string[])?.join(', ') || 'No especificados';
    const photosList = (assetUrls as string[] || []).slice(0, 5).join(', ');

    const phaseRulesSection = fase_negocio ? `\nFASE DEL NEGOCIO: ${fase_negocio}\nPRESUPUESTO MENSUAL DE ADS: ${presupuesto_ads || 'No especificado'} CLP\n\nREGLAS POR FASE:\n- Fase Inicial: Broad Retargeting + producto ancla + boosts orgánicos. NUNCA prospección fría.\n- Fase Crecimiento: Broad Retargeting + prospección fría básica.\n- Fase Escalado: Campaña maestra + catálogos dinámicos.\n- Fase Avanzada: Framework completo + Partnership Ads + Advantage+.\n\nNunca recomendar estrategias que superen el presupuesto disponible.\nNunca recomendar estructuras para una fase más avanzada.\nSiempre medir GPT no ROAS.\nEn Fase Inicial, SIEMPRE recomendar producto ancla.\n` : '';

    const systemPrompt = `Eres un experto en copywriting para Meta Ads de e-commerce latinoamericano.\n${knowledgeSection}${bugSection}${phaseRulesSection}Genera copies de alta conversión con metodología Sabri Suby + Russell Brunson basado en los datos del cliente.`;

    const productoContext = producto_seleccionado
      ? `- Producto específico: ${producto_seleccionado.title} — Precio: ${producto_seleccionado.price} — ${producto_seleccionado.description || ''}`
      : categoria_seleccionada
      ? `- Categoría de producto: ${categoria_seleccionada}`
      : '- Tipo de anuncio: Genérico de marca / Awareness';

    const userPrompt = `DATOS DEL CLIENTE:
- Negocio: ${brief.business_description || brief.descripcion || 'E-commerce'}
- Buyer Persona: ${persona.nombre || 'Cliente ideal'}, ${persona.edad || '25-45'} años, ${persona.ocupacion || 'profesional'}
- Dolor principal: ${persona.dolor || persona.pain_points || 'No especificado'}
- Objeciones literales: ${persona.objeciones || persona.objections || 'No especificadas'}
- Tono de marca: ${brief.tone || brief.tono || 'profesional y cercano'}
- Garantía: ${brief.guarantee || brief.garantia || 'No especificada'}
- Prueba social: ${brief.social_proof || brief.prueba_social || 'No especificada'}
- Ventaja competitiva: ${brief.competitive_advantage || brief.ventaja_competitiva || 'No especificada'}
- CPA máximo: ${brief.max_cpa || brief.cpa_max || 'No especificado'}
- Competidores: ${competidores}
- Fase del negocio: ${fase_negocio || 'No especificada'}
- Presupuesto de ads: ${presupuesto_ads || 'No especificado'} CLP
- Campaña destino: ${campana_destino || funnel?.toUpperCase()}
${productoContext}
- Funnel: ${funnel?.toUpperCase()}
- Formato: ${formato === 'video' ? 'Video' : 'Imagen estática'}
- Ángulo creativo: ${angulo}
- Instrucciones adicionales: ${instrucciones || 'Ninguna'}
- Fotos del producto disponibles: ${photosList || 'No hay fotos aún'}

Usa las fotos para hacer el copy más específico y descriptivo cuando estén disponibles.
${producto_seleccionado ? `El copy debe enfocarse específicamente en el producto "${producto_seleccionado.title}" y sus beneficios concretos.` : ''}

Genera exactamente 10 variaciones de copy distintas usando el ángulo "${angulo}" para un anuncio ${funnel?.toUpperCase()} ${formato === 'video' ? 'en video' : 'en imagen estática'}.
Cada variación debe tener un enfoque ligeramente diferente dentro del mismo ángulo.
Numeradas del 1 al 10.

Responde SOLO en JSON válido sin markdown ni backticks:
{
  "explicacion": "Por qué este ángulo funciona para este cliente (2-3 líneas concretas)",
  "variaciones": [
    { "badge": "Variación 1", "titulo": "...", "texto_principal": "...", "descripcion": "...", "cta": "..." },
    { "badge": "Variación 2", "titulo": "...", "texto_principal": "...", "descripcion": "...", "cta": "..." },
    { "badge": "Variación 3", "titulo": "...", "texto_principal": "...", "descripcion": "...", "cta": "..." },
    { "badge": "Variación 4", "titulo": "...", "texto_principal": "...", "descripcion": "...", "cta": "..." },
    { "badge": "Variación 5", "titulo": "...", "texto_principal": "...", "descripcion": "...", "cta": "..." },
    { "badge": "Variación 6", "titulo": "...", "texto_principal": "...", "descripcion": "...", "cta": "..." },
    { "badge": "Variación 7", "titulo": "...", "texto_principal": "...", "descripcion": "...", "cta": "..." },
    { "badge": "Variación 8", "titulo": "...", "texto_principal": "...", "descripcion": "...", "cta": "..." },
    { "badge": "Variación 9", "titulo": "...", "texto_principal": "...", "descripcion": "...", "cta": "..." },
    { "badge": "Variación 10", "titulo": "...", "texto_principal": "...", "descripcion": "...", "cta": "..." }
  ]
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 6000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errText}`);
    }

    const aiResult = await response.json();
    const rawContent = aiResult.content?.[0]?.text || '';

    // Parse JSON
    let parsed;
    try {
      const clean = rawContent.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      throw new Error('Failed to parse AI response as JSON');
    }

    // Deduct 1 credit
    if (credits) {
      await supabase.from('client_credits').update({
        creditos_disponibles: (credits.creditos_disponibles || 99999) - 1,
        creditos_usados: (credits.creditos_usados || 0) + 1,
      }).eq('client_id', clientId);
    }

    // Record transaction
    await supabase.from('credit_transactions').insert({
      client_id: clientId,
      accion: `Generar copies — Ángulo: ${angulo} | ${funnel?.toUpperCase()} | ${formato}`,
      creditos_usados: 1,
      costo_real_usd: 0.01,
    });

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('generate-copy error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
