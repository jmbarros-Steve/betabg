import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export async function generateCopy(c: Context) {
  try {
  const {
    clientId, funnel, formato, angulo, instrucciones, assetUrls,
    fase_negocio, presupuesto_ads, producto_seleccionado,
    categoria_seleccionada, tipo_anuncio, campana_destino,
  } = await c.req.json();

  const supabase = getSupabaseAdmin();

    // Verify the authenticated user owns this client
    const user = c.get('user');
    if (!user || !clientId) {
      return c.json({ error: 'Missing authentication or clientId' }, 401);
    }
    const { data: ownerCheck } = await supabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .or(`user_id.eq.${user.id},client_user_id.eq.${user.id}`)
      .maybeSingle();
    if (!ownerCheck) {
      return c.json({ error: 'No tienes acceso a este cliente' }, 403);
    }

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

  if (creditsErr) {
    console.error('[generate-copy] Credits error:', creditsErr);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }

  if (!credits) {
    return c.json(
      { error: 'NO_CREDIT_RECORD', message: 'No se encontró registro de créditos para este cliente. Contacta al administrador.' },
      402
    );
  }

  const available = credits.creditos_disponibles ?? 0;
  if (available < 1) {
    return c.json({ error: 'NO_CREDITS', message: 'Sin créditos disponibles' }, 402);
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    console.error('[generate-copy] ANTHROPIC_API_KEY not configured');
    return c.json({ error: 'Error interno del servidor' }, 500);
  }

  const contextoLower = `${funnel || ''} ${angulo || ''} ${instrucciones || ''}`.toLowerCase();
  const categoriaRelevante = contextoLower.includes('google') ? 'google_ads' : 'meta_ads';

  const [{ data: knowledge }, { data: bugs }] = await Promise.all([
    supabase.from('steve_knowledge').select('id, categoria, titulo, contenido')
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
    console.error('[generate-copy] Anthropic API error:', response.status, errText);
    return c.json({ error: 'Error generando el copy. Intenta de nuevo.' }, 500);
  }

  const aiResult: any = await response.json();
  const rawContent = aiResult.content?.[0]?.text || '';

  let parsed;
  try {
    const clean = rawContent.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(clean);
  } catch {
    console.error('[generate-copy] Failed to parse AI response as JSON');
    return c.json({ error: 'Error procesando la respuesta. Intenta de nuevo.' }, 500);
  }

  // Deduct 1 credit atomically
  const { data: deductResult, error: deductError } = await supabase
    .rpc('deduct_credits', { p_client_id: clientId, p_amount: 1 });

  if (deductError || !deductResult?.[0]?.success) {
    console.error('[generate-copy] Atomic credit deduction failed:', deductError || deductResult);
  }

  // Record transaction
  await supabase.from('credit_transactions').insert({
    client_id: clientId,
    accion: `Generar copies — Ángulo: ${angulo} | ${funnel?.toUpperCase()} | ${formato}`,
    creditos_usados: 1,
    costo_real_usd: 0.01,
  });

  return c.json(parsed);
  } catch (err: any) {
    console.error('[generate-copy]', err);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
}
