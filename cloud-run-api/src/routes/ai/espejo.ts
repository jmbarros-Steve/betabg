import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { createTask } from '../../lib/task-creator.js';

// ─── Claude Vision prompts ───────────────────────────────────────────────────

const EMAIL_PROMPT = (brandName: string, brandColors: string) =>
  `Evalúa este email HTML de marketing para e-commerce.
Marca: ${brandName}. Colores de marca: ${brandColors}.

Analiza el HTML como si lo vieras renderizado. Evalúa cada punto de 1-10:
1. MOBILE: ¿Texto legible (min 14px)? ¿Imágenes con alt text? ¿CTA visible sin mucho scroll? ¿Botón clickeable (min 44px)?
2. LAYOUT: ¿Jerarquía visual clara? ¿Espaciado entre bloques? ¿Alineación consistente? ¿Ancho max-width ~600px?
3. BRAND: ¿Colores coinciden con la marca? ¿Logo presente? ¿Tono visual coherente?
4. CTA: ¿Botón principal visible y con contraste? ¿Texto de acción claro?
5. PRODUCTOS: ¿Imágenes de productos presentes? ¿Precios visibles? ¿Nombres legibles?

Responde SOLO en JSON válido (sin markdown, sin backticks):
{"mobile":X, "layout":X, "brand":X, "cta":X, "products":X, "overall":X, "issues":["problema 1","problema 2"], "pass": true/false}

pass=true si overall >= 7.`;

const AD_PROMPT = (brandName: string, brandColors: string) =>
  `Evalúa esta imagen para anuncio de Meta Ads.
Marca: ${brandName}. Colores de marca: ${brandColors}.

Evalúa cada punto de 1-10:
1. RESOLUCIÓN: ¿Nítida o borrosa?
2. TEXTO: ¿Menos del 20% de la imagen es texto? ¿Texto completo (no cortado)?
3. PRODUCTO: ¿Producto principal visible y reconocible?
4. LOGO: ¿Logo de marca presente y legible?
5. BRAND: ¿Colores coherentes con la marca?
6. COMPOSICIÓN: ¿Fondo limpio? ¿Rostros no cortados? ¿Sin marca de agua?

Responde SOLO en JSON válido (sin markdown, sin backticks):
{"resolution":X, "text":X, "product":X, "logo":X, "brand":X, "composition":X, "overall":X, "issues":["problema 1"], "pass": true/false}

pass=true si overall >= 7.`;

// ─── Dynamic visual criteria from steve_knowledge ───────────────────────────

async function loadDynamicVisualCriteria(entityType: 'email' | 'ad'): Promise<string> {
  try {
    const supabase = getSupabaseAdmin();
    const relevantCategories = entityType === 'email'
      ? ['klaviyo', 'brief', 'anuncios', 'steve_accuracy']
      : ['meta_ads', 'anuncios', 'brief', 'steve_accuracy'];

    const { data: criteria } = await supabase
      .from('steve_knowledge')
      .select('titulo, contenido')
      .eq('visual_relevant', true)
      .eq('approval_status', 'approved')
      .eq('activo', true)
      .in('categoria', relevantCategories)
      .order('orden', { ascending: false })
      .limit(10);

    if (!criteria || criteria.length === 0) return '';

    const lines = criteria.map((c: any) => `- ${c.titulo}: ${c.contenido}`).join('\n');
    return `\n\nCRITERIOS ADICIONALES (aprendidos del swarm):\n${lines}`;
  } catch (err) {
    console.error('[espejo] Error loading dynamic visual criteria:', err);
    return '';
  }
}

// ─── Claude Vision call ──────────────────────────────────────────────────────

interface VisionContent {
  type: string;
  source?: { type: string; media_type: string; data: string };
  text?: string;
}

async function callClaudeVision(content: VisionContent[]): Promise<any> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude Vision API error ${response.status}: ${errText.slice(0, 300)}`);
  }

  return response.json();
}

function parseVisionResponse(visionResponse: any): any {
  try {
    const text = visionResponse.content?.[0]?.text || '';
    const cleaned = text.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (parseErr) {
    console.error('[espejo] Error parsing Claude Vision response:', parseErr);
    return { overall: 0, issues: ['Error parsing Claude Vision response'], pass: false };
  }
}

// ─── Save to criterio_results ────────────────────────────────────────────────

async function saveEspejoResult(
  shopId: string,
  entityType: string,
  entityId: string,
  evalResult: any
) {
  const supabase = getSupabaseAdmin();
  const passed = evalResult.pass === true && (evalResult.overall || 0) >= 7;

  await supabase.from('criterio_results').insert({
    rule_id: `ESPEJO-${entityType.toUpperCase()}`,
    shop_id: shopId,
    entity_type: entityType,
    entity_id: entityId,
    passed,
    actual_value: JSON.stringify(evalResult),
    expected_value: 'overall >= 7, pass = true',
    details: evalResult.issues?.join('. ') || 'OK',
    evaluated_by: 'espejo',
  });

  return passed;
}

// ─── Public functions ────────────────────────────────────────────────────────

/**
 * Evaluate an email's HTML visually using Claude.
 * Instead of rendering to a screenshot (no Playwright in Cloud Run),
 * we send the raw HTML to Claude and ask it to evaluate the design.
 */
export async function espejoEmail(
  emailHtml: string,
  shopId: string,
  entityId: string,
  brandColors: string,
  brandName: string
): Promise<{ pass: boolean; score: number; issues: string[]; details: any }> {
  console.log(`[espejo] Evaluating email for shop=${shopId} entity=${entityId}`);

  const dynamicCriteria = await loadDynamicVisualCriteria('email');

  const content: VisionContent[] = [
    {
      type: 'text',
      text: `Aquí está el código HTML del email. Analízalo como si lo vieras renderizado visualmente:\n\n${emailHtml.substring(0, 30000)}`,
    },
    { type: 'text', text: EMAIL_PROMPT(brandName, brandColors) + dynamicCriteria },
  ];

  const visionResponse = await callClaudeVision(content);
  const evalResult = parseVisionResponse(visionResponse);

  const passed = await saveEspejoResult(shopId, 'email', entityId, evalResult);

  console.log(`[espejo] Email result: score=${evalResult.overall}, pass=${passed}, issues=${evalResult.issues?.length || 0}`);

  // Create task when ESPEJO rejects
  if (!passed) {
    try {
      await createTask({
        shop_id: shopId,
        title: `ESPEJO rechazó email: score ${evalResult.overall || 0}/10`,
        description: `Evaluación visual de email (entity: ${entityId}) falló.\n\nProblemas detectados:\n${(evalResult.issues || []).map((i: string) => `- ${i}`).join('\n')}\n\nDetalles: mobile=${evalResult.mobile}, layout=${evalResult.layout}, brand=${evalResult.brand}, cta=${evalResult.cta}, products=${evalResult.products}`,
        priority: 'alta',
        type: 'mejora',
        source: 'espejo',
        assigned_squad: 'marketing',
      });
    } catch (taskErr) {
      console.error('[espejo] Error creating task for rejected email:', taskErr);
    }
  }

  return {
    pass: passed,
    score: evalResult.overall || 0,
    issues: evalResult.issues || [],
    details: evalResult,
  };
}

/**
 * Evaluate a Meta ad image visually using Claude Vision.
 * Downloads the image, converts to base64, sends to Claude.
 */
export async function espejoAd(
  imageUrl: string,
  shopId: string,
  entityId: string,
  brandColors: string,
  brandName: string
): Promise<{ pass: boolean; score: number; issues: string[]; details: any }> {
  console.log(`[espejo] Evaluating ad image for shop=${shopId} entity=${entityId}`);

  // Download the image and convert to base64
  const imgResponse = await fetch(imageUrl);
  if (!imgResponse.ok) {
    const errResult = { pass: false, score: 0, issues: [`Cannot download image: HTTP ${imgResponse.status}`], details: {} };
    await saveEspejoResult(shopId, 'ad_image', entityId, { overall: 0, pass: false, issues: errResult.issues });
    return errResult;
  }

  const imgBuffer = await imgResponse.arrayBuffer();
  const base64 = Buffer.from(imgBuffer).toString('base64');

  // Detect media type from content-type header
  const contentType = imgResponse.headers.get('content-type') || 'image/jpeg';
  const mediaType = contentType.startsWith('image/') ? contentType.split(';')[0] : 'image/jpeg';

  const dynamicCriteria = await loadDynamicVisualCriteria('ad');

  const content: VisionContent[] = [
    {
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: base64 },
    },
    { type: 'text', text: AD_PROMPT(brandName, brandColors) + dynamicCriteria },
  ];

  const visionResponse = await callClaudeVision(content);
  const evalResult = parseVisionResponse(visionResponse);

  const passed = await saveEspejoResult(shopId, 'ad_image', entityId, evalResult);

  console.log(`[espejo] Ad result: score=${evalResult.overall}, pass=${passed}, issues=${evalResult.issues?.length || 0}`);

  // Create task when ESPEJO rejects
  if (!passed) {
    try {
      await createTask({
        shop_id: shopId,
        title: `ESPEJO rechazó ad_image: score ${evalResult.overall || 0}/10`,
        description: `Evaluación visual de imagen publicitaria (entity: ${entityId}) falló.\n\nProblemas detectados:\n${(evalResult.issues || []).map((i: string) => `- ${i}`).join('\n')}\n\nDetalles: resolution=${evalResult.resolution}, text=${evalResult.text}, product=${evalResult.product}, logo=${evalResult.logo}, brand=${evalResult.brand}, composition=${evalResult.composition}`,
        priority: 'alta',
        type: 'mejora',
        source: 'espejo',
        assigned_squad: 'marketing',
      });
    } catch (taskErr) {
      console.error('[espejo] Error creating task for rejected ad:', taskErr);
    }
  }

  return {
    pass: passed,
    score: evalResult.overall || 0,
    issues: evalResult.issues || [],
    details: evalResult,
  };
}

// ─── HTTP endpoint handler ───────────────────────────────────────────────────

/**
 * POST /api/espejo
 * Body: { type: "email" | "ad", shop_id, entity_id, brand_colors, brand_name, html?, image_url? }
 */
export async function espejoHandler(c: Context) {
  try {
    const body = await c.req.json();
    const { type, shop_id, entity_id, brand_colors = '#000000', brand_name = 'Brand' } = body;

    if (!type || !shop_id || !entity_id) {
      return c.json({ error: 'Missing required fields: type, shop_id, entity_id' }, 400);
    }

    if (type === 'email') {
      const { html } = body;
      if (!html) return c.json({ error: 'Missing html for email evaluation' }, 400);

      const result = await espejoEmail(html, shop_id, entity_id, brand_colors, brand_name);
      return c.json(result, result.pass ? 200 : 422);
    }

    if (type === 'ad') {
      const { image_url } = body;
      if (!image_url) return c.json({ error: 'Missing image_url for ad evaluation' }, 400);

      const result = await espejoAd(image_url, shop_id, entity_id, brand_colors, brand_name);
      return c.json(result, result.pass ? 200 : 422);
    }

    return c.json({ error: `Unknown type: ${type}. Must be "email" or "ad"` }, 400);
  } catch (error) {
    console.error('[espejo] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: 'ESPEJO evaluation failed', details: message }, 500);
  }
}
