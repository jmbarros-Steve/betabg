import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQueryOrDefault } from '../../lib/safe-supabase.js';
import { buildCriterioRulesBlock } from '../../lib/criterio/rules-context.js';

const GOOGLE_ADS_METHODOLOGY = `
═══════════════════════════════════════════════════════════════════════════════
METODOLOGÍA PARA GOOGLE ADS - Responsive Search Ads (RSA)
═══════════════════════════════════════════════════════════════════════════════

ESTRUCTURA DE UN RSA:
- 15 Headlines (máximo 30 caracteres cada uno)
- 4 Descripciones (máximo 90 caracteres cada una)
- Títulos largos opcionales (máximo 90 caracteres)
- Sitelinks con título y descripción

PRINCIPIOS DE SABRI SUBY PARA SEARCH ADS:
1. La persona está BUSCANDO activamente - ya tiene intención
2. Responde directamente a su búsqueda/problema
3. Usa las palabras que ELLOS usarían
4. Destaca la DIFERENCIACIÓN inmediatamente
5. Incluye prueba social comprimida

PRINCIPIOS DE RUSSELL BRUNSON PARA SEARCH ADS:
1. Hook en el headline - captura con curiosidad o beneficio directo
2. Story condensada en descripción - micro-narrativa
3. Offer claro - qué obtienen si hacen clic

TIPOS DE HEADLINES A INCLUIR:
1. Headline con keyword principal (intención directa)
2. Headline con beneficio primario
3. Headline con diferenciador único
4. Headline con prueba social (números, testimonios cortos)
5. Headline con urgencia/escasez
6. Headline con pregunta que genera curiosidad
7. Headline con el "villano" (problema que resuelves)
8. Headline con la transformación
9. Headline con precio/oferta si aplica
10. Headlines con variaciones de la keyword

SITELINKS ESTRATÉGICOS:
- Link a testimonios/casos de éxito
- Link a oferta principal o descuento
- Link a página de servicios/productos
- Link a contacto/demo/consulta gratuita
`;

const CAMPAIGN_TYPES: Record<string, { name: string; focus: string; tips: string }> = {
  search: {
    name: 'Búsqueda (Search)',
    focus: 'Responder a la intención de búsqueda activa del usuario',
    tips: 'Headlines con keywords, beneficios directos y diferenciadores',
  },
  display: {
    name: 'Display/GDN',
    focus: 'Captar atención visual y generar awareness',
    tips: 'Headlines más llamativos, enfocados en problema/solución',
  },
  performance_max: {
    name: 'Performance Max',
    focus: 'Variedad para que el algoritmo optimice',
    tips: 'Mix de headlines emocionales, racionales y de acción',
  },
  remarketing: {
    name: 'Remarketing',
    focus: 'Reconectar con visitantes anteriores',
    tips: 'Headlines que recuerden el valor, urgencia y ofertas especiales',
  },
};

export async function generateGoogleCopy(c: Context) {
  try {
  const { clientId, campaignType, customPrompt } = await c.req.json();

  if (!clientId) {
    return c.json({ error: 'clientId is required' }, 400);
  }

  const supabase = getSupabaseAdmin();

  const { data: briefData, error: briefError } = await supabase
    .from('buyer_personas')
    .select('persona_data, is_complete')
    .eq('client_id', clientId)
    .eq('is_complete', true)
    .maybeSingle();

  if (briefError || !briefData) {
    return c.json({ error: 'Brief de marca no encontrado o incompleto' }, 404);
  }

  const categoriaGG = 'google_ads';
  const [{ data: kbBugsGG }, { data: kbKnowledgeGG }] = await Promise.all([
    supabase.from('steve_bugs').select('descripcion, ejemplo_malo, ejemplo_bueno').eq('categoria', categoriaGG).eq('activo', true),
    supabase.from('steve_knowledge').select('id, titulo, contenido').eq('categoria', categoriaGG).eq('activo', true).eq('approval_status', 'approved').is('purged_at', null).order('orden'),
  ]);

  const ggRuleIds = (kbKnowledgeGG || []).map((k: any) => k.id).filter(Boolean);
  if (ggRuleIds.length > 0) {
    supabase.from('qa_log').insert({ check_type: 'knowledge_injection', status: 'info', details: JSON.stringify({ source: 'generate-google-copy', rule_count: ggRuleIds.length, rule_ids: ggRuleIds }), detected_by: 'generate-google-copy' }).then(({ error }: any) => { if (error) console.error('[generate-google-copy] qa_log:', error.message); });
  }
  const bugSectionGG = kbBugsGG && kbBugsGG.length > 0 ? `\nERRORES CRÍTICOS QUE DEBES EVITAR:\n${kbBugsGG.map((b: any) => `❌ ${b.descripcion}\nMAL: ${b.ejemplo_malo}\nBIEN: ${b.ejemplo_bueno}`).join('\n\n')}\n` : '';
  const knowledgeSectionGG = kbKnowledgeGG && kbKnowledgeGG.length > 0 ? `\nCONOCIMIENTO BASE:\n${kbKnowledgeGG.map((k: any) => `## ${k.titulo}\n${k.contenido}`).join('\n\n')}\n` : '';

  // Dual-layer learning
  const globalFeedback = await safeQueryOrDefault<any>(
    supabase
      .from('steve_feedback')
      .select('rating, feedback_text, content_type')
      .eq('content_type', 'google_copy')
      .order('created_at', { ascending: false })
      .limit(50),
    [],
    'generateGoogleCopy.getGlobalFeedback',
  );

  const clientFeedback = await safeQueryOrDefault<any>(
    supabase
      .from('steve_feedback')
      .select('rating, feedback_text, content_type, improvement_notes')
      .eq('client_id', clientId)
      .eq('content_type', 'google_copy')
      .order('created_at', { ascending: false })
      .limit(10),
    [],
    'generateGoogleCopy.getClientFeedback',
  );

  let learningContext = '';

  if (globalFeedback && globalFeedback.length > 0) {
    const globalAvgRating = globalFeedback.reduce((sum, f) => sum + (f.rating || 0), 0) / globalFeedback.length;
    const globalNegative = globalFeedback.filter(f => (f.rating || 0) <= 2 && f.feedback_text);
    const globalPositive = globalFeedback.filter(f => (f.rating || 0) >= 4 && f.feedback_text);

    learningContext += `
═══════════════════════════════════════════════════════════════════════════════
🧠 STEVE'S GLOBAL LEARNING - Google Ads (${globalFeedback.length} generaciones)
═══════════════════════════════════════════════════════════════════════════════
Rating promedio global: ${globalAvgRating.toFixed(1)}/5

${globalPositive.length > 0 ? `
✅ PATRONES EXITOSOS EN GOOGLE ADS:
${globalPositive.slice(0, 5).map(f => `- "${f.feedback_text}"`).join('\n')}
` : ''}

${globalNegative.length > 0 ? `
⚠️ ERRORES COMUNES A EVITAR:
${globalNegative.slice(0, 5).map(f => `- "${f.feedback_text}"`).join('\n')}
` : ''}
`;
  }

  if (clientFeedback && clientFeedback.length > 0) {
    const clientAvgRating = clientFeedback.reduce((sum, f) => sum + (f.rating || 0), 0) / clientFeedback.length;
    const clientNegative = clientFeedback.filter(f => (f.rating || 0) <= 2 && f.feedback_text);
    const clientPositive = clientFeedback.filter(f => (f.rating || 0) >= 4 && f.feedback_text);

    learningContext += `
═══════════════════════════════════════════════════════════════════════════════
🎯 PREFERENCIAS DE ESTE CLIENTE
═══════════════════════════════════════════════════════════════════════════════
Rating del cliente: ${clientAvgRating.toFixed(1)}/5

${clientPositive.length > 0 ? `
✅ LO QUE PREFIERE (PRIORIDAD):
${clientPositive.map(f => `- "${f.feedback_text}"`).join('\n')}
` : ''}

${clientNegative.length > 0 ? `
⛔ LO QUE RECHAZA:
${clientNegative.map(f => `- "${f.feedback_text}"`).join('\n')}
` : ''}
`;
  }

  const campaign = CAMPAIGN_TYPES[campaignType as string] || CAMPAIGN_TYPES.search;

  // Load CRITERIO rules for Google Ads quality
  const criterioBlock = await buildCriterioRulesBlock(supabase, ['GOOGLE ADS']);

  const systemPrompt = `${bugSectionGG}${knowledgeSectionGG}${criterioBlock}Eres un experto en Google Ads y copywriting, entrenado en las metodologías de Sabri Suby y Russell Brunson.

${GOOGLE_ADS_METHODOLOGY}

═══════════════════════════════════════════════════════════════════════════════
BRIEF DE MARCA DEL CLIENTE
═══════════════════════════════════════════════════════════════════════════════
${JSON.stringify(briefData.persona_data, null, 2)}

═══════════════════════════════════════════════════════════════════════════════
TIPO DE CAMPAÑA: ${campaign.name}
═══════════════════════════════════════════════════════════════════════════════
Enfoque: ${campaign.focus}
Tips: ${campaign.tips}

${customPrompt ? `INSTRUCCIONES ADICIONALES: ${customPrompt}` : ''}

${learningContext}

═══════════════════════════════════════════════════════════════════════════════
FORMATO DE RESPUESTA
═══════════════════════════════════════════════════════════════════════════════

Responde ÚNICAMENTE con un JSON válido:
{
  "headlines": [
    "15 headlines de máximo 30 caracteres cada uno"
  ],
  "longHeadlines": [
    "3 títulos largos de máximo 90 caracteres"
  ],
  "descriptions": [
    "4 descripciones de máximo 90 caracteres"
  ],
  "sitelinks": [
    {
      "title": "Título del sitelink (máx 25 chars)",
      "description": "Descripción del sitelink (máx 35 chars)",
      "suggestedUrl": "/ruta-sugerida"
    }
  ]
}

REGLAS:
- Cada headline: máximo 30 caracteres
- Cada título largo: máximo 90 caracteres
- Cada descripción: máximo 90 caracteres
- Cada título de sitelink: máximo 25 caracteres
- Cada descripción de sitelink: máximo 35 caracteres
- USA el tono y vocabulario del buyer persona
- INCLUYE números y prueba social donde sea posible
- NO uses signos de exclamación excesivos
- APLICA las preferencias del cliente del feedback de Steve`;

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    console.error('[generate-google-copy] ANTHROPIC_API_KEY not configured');
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
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        { role: 'user', content: `Genera copies para una campaña de ${campaign.name} basándote en el brief de marca proporcionado.` },
      ],
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      return c.json({ error: 'Rate limit exceeded' }, 429);
    }
    const errorBody = await response.text();
    console.error('[generate-google-copy] Anthropic API error:', response.status, errorBody);
    return c.json({ error: 'Error generando el copy. Intenta de nuevo.' }, 500);
  }

  const data: any = await response.json();
  const content = data.content?.[0]?.text || '';

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('[generate-google-copy] Invalid JSON response from AI');
    return c.json({ error: 'Error procesando la respuesta. Intenta de nuevo.' }, 500);
  }

  const generatedCopy = JSON.parse(jsonMatch[0]);

  return c.json(generatedCopy);
  } catch (err: any) {
    console.error('[generate-google-copy]', err);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
}
