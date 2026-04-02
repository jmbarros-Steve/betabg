import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { loadKnowledge } from '../../lib/knowledge-loader.js';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const SCRIPT_CREDIT_COST = 1;

interface ScriptRequest {
  clientId: string;
  duracion: '15s' | '30s' | '60s';
  funnel: 'tofu' | 'mofu' | 'bofu';
  angulo?: string;
  instrucciones?: string;
  producto?: string;
  variacionTexto?: string; // existing copy to base the script on
}

/**
 * POST /api/generate-video-script
 *
 * Generates a structured video script with:
 *   - Hook (first 3 seconds)
 *   - Body (main content)
 *   - CTA (closing call-to-action)
 *
 * Uses Claude Sonnet for generation. Output in Chilean Spanish.
 */
export async function generateVideoScript(c: Context) {
  try {
    const body: ScriptRequest = await c.req.json();
    const { clientId, duracion, funnel, angulo, instrucciones, producto, variacionTexto } = body;

    if (!clientId || !duracion || !funnel) {
      return c.json({ error: 'clientId, duracion, and funnel are required' }, 400);
    }

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
    }

    const supabase = getSupabaseAdmin();

    // Deduct credits
    const { data: deductResult, error: deductError } = await supabase
      .rpc('deduct_credits', { p_client_id: clientId, p_amount: SCRIPT_CREDIT_COST });

    if (deductError) {
      return c.json({ error: 'NO_CREDIT_RECORD', message: 'No se encontró registro de créditos.' }, 402);
    }
    if (!deductResult?.[0]?.success) {
      return c.json({ error: 'NO_CREDITS', message: `Se necesita ${SCRIPT_CREDIT_COST} crédito para generar un script.` }, 402);
    }

    // Load brand context
    const [brandRes, productsRes] = await Promise.all([
      supabase.from('brand_research').select('brand_name, brand_voice, target_audience, usp, industry').eq('client_id', clientId).maybeSingle(),
      supabase.from('shopify_products').select('title, description').eq('client_id', clientId).limit(5),
    ]);

    const brand = brandRes.data;
    const products = productsRes.data || [];

    // Load video/ads knowledge rules
    const { knowledgeBlock, bugsBlock } = await loadKnowledge(
      ['video', 'anuncios', 'meta_ads', 'creativos'],
      { clientId, limit: 10, audit: { source: 'generate-video-script' } }
    );

    const duracionConfig = {
      '15s': { totalSeconds: 15, hookSeconds: 3, bodySeconds: 9, ctaSeconds: 3, wordCount: '30-45' },
      '30s': { totalSeconds: 30, hookSeconds: 3, bodySeconds: 22, ctaSeconds: 5, wordCount: '60-90' },
      '60s': { totalSeconds: 60, hookSeconds: 3, bodySeconds: 50, ctaSeconds: 7, wordCount: '120-180' },
    }[duracion];

    const funnelGuide = {
      tofu: 'El espectador NO conoce la marca. El hook debe ser disruptivo y emocional. Enfócate en el PROBLEMA o la curiosidad. No menciones la marca hasta el body.',
      mofu: 'El espectador ya vio algo de la marca. Muestra PRUEBA SOCIAL, beneficios concretos, y diferenciadores. Puede mencionar la marca desde el inicio.',
      bofu: 'El espectador está listo para comprar. Usa URGENCIA, ofertas limitadas, garantías. El CTA debe ser directo y con incentivo claro.',
    }[funnel];

    const prompt = `Eres un director creativo de video para ecommerce en Chile. Genera un script de video publicitario de ${duracion} (${duracionConfig.totalSeconds} segundos).

CONTEXTO DE LA MARCA:
${brand ? `- Marca: ${brand.brand_name || 'N/A'}
- Voz: ${brand.brand_voice || 'N/A'}
- Audiencia: ${brand.target_audience || 'N/A'}
- USP: ${brand.usp || 'N/A'}
- Industria: ${brand.industry || 'N/A'}` : '- Sin datos de marca disponibles.'}

PRODUCTOS:
${products.length > 0 ? products.map(p => `- ${p.title}: ${(p.description || '').slice(0, 100)}`).join('\n') : '- Sin productos cargados.'}

${producto ? `PRODUCTO DESTACADO: ${producto}` : ''}
${variacionTexto ? `COPY BASE (úsalo como inspiración para el script):\n${variacionTexto}` : ''}
${angulo ? `ÁNGULO CREATIVO: ${angulo}` : ''}
${instrucciones ? `INSTRUCCIONES ADICIONALES: ${instrucciones}` : ''}

ETAPA DEL FUNNEL: ${funnel.toUpperCase()}
${funnelGuide}

${knowledgeBlock}${bugsBlock}
ESTRUCTURA DEL SCRIPT:

1. HOOK (primeros ${duracionConfig.hookSeconds} segundos):
   - Texto que se dice/muestra en pantalla
   - Dirección visual (qué se ve, movimientos de cámara, transiciones)
   - DEBE captar atención en los primeros 2 segundos
   - Puede ser: pregunta provocadora, estadística impactante, escena inesperada, o dolor del cliente

2. BODY (${duracionConfig.bodySeconds} segundos):
   - Texto narrado o en pantalla
   - Dirección visual por cada sección (2-4 escenas)
   - Beneficio principal con evidencia (testimonios, demos, antes/después)
   - Transiciones sugeridas entre escenas

3. CTA (últimos ${duracionConfig.ctaSeconds} segundos):
   - Texto del llamado a acción (claro y directo)
   - Dirección visual (logo, producto, botón, oferta)
   - Qué debe hacer el espectador (comprar, visitar, seguir)

REGLAS:
- Español chileno natural (no formal, no peninsular)
- Total de palabras habladas: ~${duracionConfig.wordCount}
- Cada escena debe tener texto + dirección visual
- NO uses jerga de marketing ("engagement", "funnel", "conversion")
- SÍ usa lenguaje real de Chile ("bacán", "dale", "cacha", "filete" si es apropiado para la marca)
- El hook NUNCA empieza con el nombre de la marca
- Incluye indicaciones de música/sonido si es relevante

Responde SOLO con un JSON válido con esta estructura exacta:
{
  "titulo": "nombre corto del script",
  "duracion": "${duracion}",
  "funnel": "${funnel}",
  "hook": {
    "texto": "lo que se dice/muestra en los primeros ${duracionConfig.hookSeconds}s",
    "visual": "descripción de lo que se ve en pantalla",
    "duracion_segundos": ${duracionConfig.hookSeconds}
  },
  "body": [
    {
      "texto": "narración o texto en pantalla de esta escena",
      "visual": "qué se ve, movimiento de cámara, transición",
      "duracion_segundos": 0
    }
  ],
  "cta": {
    "texto": "llamado a acción claro",
    "visual": "qué se ve al final (logo, oferta, botón)",
    "duracion_segundos": ${duracionConfig.ctaSeconds}
  },
  "musica_sugerida": "estilo de música o sonido de fondo",
  "notas_produccion": "tips para grabar/editar este video"
}`;

    const anthropicRes = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('[generate-video-script] Anthropic error:', anthropicRes.status, errText);
      return c.json({ error: 'Error generando script. Intenta de nuevo.' }, 502);
    }

    const anthropicData: any = await anthropicRes.json();
    const rawText = anthropicData?.content?.[0]?.text || '';

    // Extract JSON from response (may have markdown fences)
    let script: any;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');
      script = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error('[generate-video-script] Failed to parse JSON:', rawText.slice(0, 500));
      return c.json({ error: 'Error parseando script. Intenta de nuevo.' }, 500);
    }

    // Log credit usage
    await supabase.from('credit_transactions').insert({
      client_id: clientId,
      accion: `Generar script de video ${duracion}`,
      creditos_usados: SCRIPT_CREDIT_COST,
      costo_real_usd: 0.01,
    });

    return c.json({ success: true, script });
  } catch (err: any) {
    console.error('[generate-video-script]', err);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
}
