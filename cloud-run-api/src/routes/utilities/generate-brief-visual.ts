import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { loadStudioAssets } from '../../lib/brief-estudio-loader.js';
import { pickTrackForAngleAndMood, type MusicMood } from '../../lib/music-library.js';

// Mirror of ANGLE_TEMPLATE + TEMPLATE_ENGINE in generate-video.ts. We duplicate
// here (instead of importing) because this file is only called at brief time
// and the video route is called later — no circular imports, no shared state.
// The client never sees Veo/Runway — Steve picks the template behind the scenes
// and the prompt is shaped accordingly (cinematic/silent for Runway templates,
// audio-first for Veo templates).
const ANGLE_TEMPLATE_BRIEF: Record<string, string> = {
  'Bold Statement': 'hero_shot',
  'Beneficios': 'hero_shot',
  'Beneficios Principales': 'hero_shot',
  'Nueva Colección': 'product_reveal',
  'Descuentos/Ofertas': 'product_reveal',
  'Ingredientes/Material': 'macro_detail',
  'Detalles de Producto': 'macro_detail',
  'Antes y Después': 'before_after',
  'Reviews/Testimonios': 'testimonial',
  'Reviews + Beneficios': 'testimonial',
  'Mensajes y Comentarios': 'testimonial',
  'Call Out': 'talking_head',
  'Ugly Ads': 'lifestyle_ugc',
  'Memes': 'lifestyle_ugc',
  'Pantalla Dividida': 'before_after',
  'Paquetes': 'hero_shot',
  'Resultados': 'hero_shot',
  'Us vs Them': 'before_after',
};

const TEMPLATE_ENGINE_BRIEF: Record<string, 'veo' | 'runway'> = {
  'hero_shot': 'runway',
  'product_reveal': 'runway',
  'unboxing': 'runway',
  'before_after': 'runway',
  'macro_detail': 'runway',
  'lifestyle_ugc': 'veo',
  'talking_head': 'veo',
  'testimonial': 'veo',
};

function deriveTemplateBrief(angulo: string | undefined): string {
  return (angulo && ANGLE_TEMPLATE_BRIEF[angulo]) || 'hero_shot';
}

function deriveEngineBrief(angulo: string | undefined): 'veo' | 'runway' {
  return TEMPLATE_ENGINE_BRIEF[deriveTemplateBrief(angulo)] || 'runway';
}

export async function generateBriefVisual(c: Context) {
  try {
  const {
    clientId,
    formato,
    angulo,
    variacionElegida,
    assetUrls,
    productData,
    funnelStage,
    // Brief Estudio — Etapa 5
    studio_mode: rawStudioMode,
    mood_key: rawMoodKey,
  } = await c.req.json();
  const studioMode = rawStudioMode === true;
  const moodKeyInput: string | null =
    typeof rawMoodKey === 'string' ? rawMoodKey.trim().slice(0, 32) : null;
  // Funnel stage controls the VISUAL playbook. Each stage has a different
  // purpose for the image: TOFU = stop the scroll + brand identity, MOFU =
  // build trust with real use cases, BOFU = push the sale with hero product.
  const stage: 'tofu' | 'mofu' | 'bofu' = ['tofu', 'mofu', 'bofu'].includes(String(funnelStage).toLowerCase())
    ? String(funnelStage).toLowerCase() as 'tofu' | 'mofu' | 'bofu'
    : 'mofu';

  const supabase = getSupabaseAdmin();

  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  if (!clientId) return c.json({ error: 'clientId is required' }, 400);

  const { data: ownerCheck } = await supabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .or(`user_id.eq.${user.id},client_user_id.eq.${user.id}`)
    .maybeSingle();
  if (!ownerCheck) return c.json({ error: 'No tienes acceso a este cliente' }, 403);

  const [briefRes, personaRes, shopifyProductsRes, clientRes] = await Promise.all([
    supabase.from('brand_research').select('research_data').eq('client_id', clientId).eq('research_type', 'brand_brief').maybeSingle(),
    supabase.from('buyer_personas').select('persona_data').eq('client_id', clientId).eq('is_complete', true).maybeSingle(),
    supabase.from('shopify_products').select('title, product_type, image_url, price_min').eq('client_id', clientId).limit(10),
    supabase.from('clients').select('shop_domain, name, company').eq('id', clientId).maybeSingle(),
  ]);

  const brief = (briefRes.data?.research_data as Record<string, unknown>) || {};
  const persona = (personaRes.data?.persona_data as Record<string, unknown>) || {};
  const shopifyProducts = shopifyProductsRes.data || [];
  const clientInfo = clientRes.data || {};

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

  const categoria = 'anuncios';
  const [{ data: kbBugs }, { data: kbKnowledge }, { data: adReferences }] = await Promise.all([
    supabase.from('steve_bugs').select('descripcion, ejemplo_malo, ejemplo_bueno').eq('categoria', categoria).eq('activo', true),
    supabase.from('steve_knowledge').select('id, titulo, contenido')
      .in('categoria', ['anuncios', 'meta_ads'])
      .eq('activo', true)
      .eq('approval_status', 'approved')
      .is('purged_at', null)
      .order('orden', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(15),
    supabase.from('ad_references').select('visual_patterns, quality_score, image_url')
      .or(`client_id.eq.${clientId},client_id.is.null`)
      .eq('angulo', angulo)
      .order('quality_score', { ascending: false })
      .limit(3),
  ]);

  const bvRuleIds = (kbKnowledge || []).map((k: any) => k.id).filter(Boolean);
  if (bvRuleIds.length > 0) {
    supabase.from('qa_log').insert({ check_type: 'knowledge_injection', status: 'info', details: JSON.stringify({ source: 'generate-brief-visual', rule_count: bvRuleIds.length, rule_ids: bvRuleIds }), detected_by: 'generate-brief-visual' }).then(({ error }: any) => { if (error) console.error('[generate-brief-visual] qa_log:', error.message); });
  }
  const bugSection = kbBugs && kbBugs.length > 0 ? `\nERRORES CRÍTICOS QUE DEBES EVITAR:\n${kbBugs.map((b: any) => `❌ ${b.descripcion}\nMAL: ${b.ejemplo_malo}\nBIEN: ${b.ejemplo_bueno}`).join('\n\n')}\n` : '';
  const knowledgeSection = kbKnowledge && kbKnowledge.length > 0 ? `\nREGLAS APRENDIDAS DE CREATIVOS (seguir obligatoriamente):\nSi hay conflicto entre reglas, priorizar las de orden más alto (más recientes).\n${kbKnowledge.map((k: any) => `- ${k.titulo}: ${k.contenido}`).join('\n')}\n` : '';

  let referencesSection = '';
  if (adReferences && adReferences.length > 0) {
    const refEntries = adReferences.map((ref: any, i: number) => {
      const patterns = ref.visual_patterns || {};
      return `Referencia ${i + 1} (quality: ${ref.quality_score}/10):\n${patterns.raw_analysis ? patterns.raw_analysis.slice(0, 800) : 'Sin análisis disponible'}`;
    }).join('\n\n');

    referencesSection = `\nREFERENCIAS VISUALES REALES (usa estos patrones para tu prompt_generacion):
${refEntries}

Tu prompt_generacion DEBE seguir los patrones de composición, iluminación, estilo fotográfico y paleta de colores de estas referencias reales. No inventes un estilo nuevo — replica el estilo que ya funcionó.\n`;
  }

  // Build Shopify store context for prompt enrichment
  let shopifyContext = '';
  if (shopifyProducts.length > 0 || (clientInfo as any).shop_domain) {
    const storeDomain = (clientInfo as any).shop_domain || '';
    const storeName = (clientInfo as any).name || (clientInfo as any).company || '';
    const productTypes = [...new Set(shopifyProducts.map((p: any) => p.product_type).filter(Boolean))];
    const priceRange = shopifyProducts.length > 0
      ? { min: Math.min(...shopifyProducts.map((p: any) => parseFloat(p.price_min) || 0)), max: Math.max(...shopifyProducts.map((p: any) => parseFloat(p.price_min) || 0)) }
      : null;
    const productSamples = shopifyProducts.slice(0, 5).map((p: any) => `${p.title} ($${p.price_min})`).join(', ');

    shopifyContext = `\nCONTEXTO DE TIENDA SHOPIFY:
Tienda: ${storeName}${storeDomain ? ` (${storeDomain})` : ''}
Categorías de productos: ${productTypes.join(', ') || 'No disponible'}
${priceRange ? `Rango de precios: $${priceRange.min} - $${priceRange.max}` : ''}
Productos destacados: ${productSamples || 'No disponible'}
`;
  }

  const photosList = (assetUrls as string[] || []).slice(0, 5).join(', ');
  const copyText = `Título: ${variacionElegida?.titulo}\nTexto: ${variacionElegida?.texto_principal}\nDescripción: ${variacionElegida?.descripcion}\nCTA: ${variacionElegida?.cta}`;

  const productDesc = productData
    ? `Producto: ${productData.title || ''}. Tipo: ${productData.product_type || ''}. Descripción: ${(productData.body_html || '').replace(/<[^>]*>/g, '').slice(0, 200)}.`
    : '';

  const personaGender = persona.genero || persona.gender || 'persona';
  const personaAge = persona.edad || persona.age || '25-40';
  const personaLifestyle = persona.estilo_vida || persona.lifestyle || persona.intereses || '';
  const personaPhotoDesc = `The person in the photo should be: ${personaGender}, approximately ${personaAge} years old${personaLifestyle ? `, in a setting that reflects: ${personaLifestyle}` : ''}.`;

  // Derive the video template + engine from the creative angle. The client
  // never picks — Steve decides whether this is a cinematic product shot
  // (silent 10s Runway) or a human-led scene (8s Veo with audio). The brief
  // prompt is shaped accordingly so the AI doesn't produce an audio-centric
  // prompt for a Runway (silent) engine or vice-versa.
  const videoTemplate = deriveTemplateBrief(typeof angulo === 'string' ? angulo : undefined);
  const videoEngine = deriveEngineBrief(typeof angulo === 'string' ? angulo : undefined);
  const videoIsRunway = videoEngine === 'runway';
  const videoDurationSec = videoIsRunway ? 10 : 8;

  const userPrompt = `Basándote en el copy aprobado y las fotos reales del producto, genera el brief visual para producción.

Copy aprobado:
${copyText}

Formato: ${formato === 'video' ? 'Video' : 'Imagen estática'}
Ángulo: ${angulo}
Buyer Persona: ${persona.nombre || 'Cliente ideal'}, ${personaAge} años
${productDesc ? `Producto: ${productDesc}` : ''}
Colores de marca: ${brief.brand_colors || brief.colores || 'A definir'}
Estilo visual: ${brief.visual_style || brief.estilo || 'moderno y limpio'}
Fotos disponibles del producto: ${photosList || 'No hay fotos'}
${shopifyContext}

${formato === 'video' ? `Responde en JSON para VIDEO (${videoDurationSec} segundos, un solo plano continuo${videoIsRunway ? ' — SIN audio, cinematográfico con foco absoluto en producto' : ' con audio nativo sincronizado (voz + ambiente + música)'}):
{
  "tipo": "video",
  "duracion": "${videoDurationSec}s",
  "plano": "descripción corta del único plano del video (no soporta multi-escena en ${videoDurationSec}s)",
  "texto_overlay": "opcional, 1-3 palabras máx",
  ${videoIsRunway
    ? '"musica_sugerida": "ninguna — video silencioso, se agrega audio en post si aplica",'
    : '"musica_sugerida": "género + mood (ej: acoustic folk, warm and intimate)",'}
  "tono": "...",
  "foto_recomendada": "URL http(s) real de foto de producto si existe, o null si no hay — NUNCA escribas 'Sin foto disponible' como string",
  "instruccion_foto": "image-to-video (preservar el producto literal) / text-to-video (sin foto base)",
  "prompt_generacion": "prompt cinematográfico en inglés para el motor de video IA — OBLIGATORIO seguir la estructura de las reglas de abajo"
}` : `Responde en JSON para IMAGEN:
{
  "tipo": "imagen",
  "concepto": "...",
  "plano_principal": "...",
  "texto_overlay": "...",
  "estilo_fotografico": "lifestyle/ugc/editorial/clean",
  "iluminacion": "...",
  "colores": "...",
  "foto_recomendada": "URL de la foto más adecuada y por qué (o 'Sin foto disponible')",
  "instruccion_foto": "usarla tal cual / cambiar fondo / agregar texto / animar",
  "prompt_generacion": "prompt detallado en inglés para Gemini"
}`}

IMPORTANTE para prompt_generacion (seguir OBLIGATORIAMENTE):
${productDesc
  ? `- Describe el producto EXACTO en el prompt: "${productDesc}". The product must appear prominently and realistically — same shape, colors, packaging.`
  : shopifyProducts.length > 0
    ? `- CRÍTICO (marca general — NO inventes productos): el usuario NO eligió un producto específico, pero la tienda SÍ tiene productos reales. Elige UNO de los productos reales del catálogo Shopify listado arriba y descríbelo EXACTAMENTE como aparece (nombre, tipo, rango de precio que indique calidad). En tu prompt_generacion, el producto hero debe ser ese producto real — JAMÁS un producto genérico, imaginado o inventado. Si no puedes identificar detalles de un producto real del catálogo, escribe 'a generic product-free lifestyle scene' y NO incluyas ningún producto en la escena. Es mejor una foto SIN producto que con un producto falso.`
    : `- IMPORTANTE: NO hay productos reales disponibles. Genera una escena de estilo de vida / marca SIN mostrar productos específicos. Ningún producto inventado debe aparecer en la escena. Si la escena necesita un objeto central, usa elementos neutros como manos, textura, persona, paisaje — nunca un producto alucinado.`}
- ${personaPhotoDesc}
- ESTILO DE LA TIENDA: El estilo fotográfico debe ser COHERENTE con la estética de la tienda y su catálogo de productos. Si la tienda vende productos premium, la foto debe verse premium. Si es una tienda casual/juvenil, la foto debe reflejar esa energía. Usa los colores de marca, el rango de precios y el tipo de productos como guía para definir el nivel de producción, ambientación y estilo de la imagen. La foto generada debe parecer parte natural del feed de la tienda o su catálogo.
- CLAVE PARA REALISMO: El prompt debe especificar detalles físicos reales: textura de piel con poros e imperfecciones naturales, ropa con arrugas y pliegues reales, superficies con reflejos naturales, profundidad de campo con bokeh sutil, iluminación con sombras suaves y direccionales.
- Mencionar un entorno REAL y específico (ej: "en una cocina moderna con mesón de mármol" NO "en un fondo limpio").
- NUNCA usar palabras como "digital art", "illustration", "3D render", "graphic design" — todo debe ser "photograph".
- Siempre terminar el prompt con: "Ultra-realistic commercial photograph, professional advertising photo shoot, real textures, natural imperfections, shot on Canon EOS R5. No illustrations, no AI artifacts, no plastic-looking skin, no floating objects, no text overlays."

${formato === 'video' ? (videoIsRunway ? `
REGLAS ESPECÍFICAS para prompt_generacion de VIDEO (${videoDurationSec} segundos, cinematográfico, SIN audio, 1080p):

El motor de video IA rinde 10× mejor con prompts TIGHT de 300-500 caracteres, 5 capas combinadas esenciales, vs prompts inflados de 4000 chars con 8 capas separadas. TIGHT > LARGO. No sobrecargues al modelo — se satura y produce garbage. Target ≈500 chars.

REGLA DE ORO — PRODUCTO TERMINADO COMO HERO PIXEL-PERFECT (no proceso artesanal):
${productDesc || shopifyProducts.length > 0 ? `
- El prompt DEBE nombrar el producto REAL del catálogo de la tienda (ej: "a Good Gres stoneware vase with matte clay texture and mineral glaze", NO "a ceramic product").
- PRIORIZÁ producto terminado como hero shot (rotando sobre pedestal, iluminado, close-up macro) POR ENCIMA de procesos artesanales (manos trabajando, materia prima).
- Este motor es SILENCIOSO — no menciones audio, diálogo, música ni voz en el prompt. Foco 100% visual.
- El producto debe ser VISUALMENTE PROTAGÓNICO al menos ${Math.max(videoDurationSec - 2, 6)} de los ${videoDurationSec} segundos (close-up macro, hero shot, o slow dolly). Idealmente pixel-perfect, con textura fidedigna.
- Si el cliente NO eligió producto específico, usá el primer producto del catálogo como hero. NUNCA uses un producto genérico o alucinado.
` : `
- No hay productos reales disponibles. El video debe ser de marca/lifestyle SIN ningún producto visible. Trabajar solo con persona + ambiente + emoción.
- Este motor es SILENCIOSO — no menciones audio, diálogo, música ni voz en el prompt. Foco 100% visual.
`}

ESTRUCTURA OBLIGATORIA — 5 CAPAS COMBINADAS (sin capa de audio — este motor es silencioso):

1. SUBJECT + ACTION — qué/quién + verbo concreto combinados (ej: "a finished Good Gres stoneware vase slowly rotates on a charcoal concrete pedestal"). Evitá "sonriendo", "usando", "posando".
2. SCENE + LIGHTING — dónde + cómo está iluminado combinados (ej: "studio black backdrop, dramatic key light from above-right, rim light behind outlines silhouette, soft fill on shadow side").
3. CAMERA + STYLE — plano + look fotográfico combinados (ej: "slow 360° dolly, Hasselblad medium-format 100mm f/4, warm earth-tone color grade, shallow depth of field").
4. PRODUCT EMPHASIS — declará explícitamente cuántos segundos el producto está visible + cómo se resalta (ej: "product fills frame for ${videoDurationSec - 2} of ${videoDurationSec} seconds; macro reveals clay texture and glaze color shift from ocher to moss green").
5. MOTION ARC — describir el movimiento visual en UNA línea (ej: "slow camera push-in from medium to macro; subject rotates 120° during the final 3 seconds").

Siempre cerrar con "${videoDurationSec}-second total duration."

EJEMPLO DE PROMPT DE CALIDAD A REPLICAR (producto terminado como hero, ≈500 chars, 5 capas, silencioso):
"Cinematic ${videoDurationSec}-second hero shot of a finished Good Gres stoneware vase on a dark charcoal concrete pedestal. Slow 360° rotation reveals the unique matte clay texture and mineral glaze that shifts color from deep ocher to moss green. Dramatic key light from above right, rim light behind outlines the silhouette, soft fill on the shadow side. Macro 100mm lens, f/4, studio black background. Warm earth-tone color grade, rich shadows. Camera pans slowly around product. Shot on Hasselblad medium format. Slow push-in from medium to close-up over the final 4 seconds. ${videoDurationSec}-second total duration."

NUNCA entregues:
- Prompts con audio, música, diálogo o voz (este motor no lo soporta).
- Prompts vagos tipo "persona haciendo cerámica" o "mujer sonriendo en cocina" (producen mediocre).
- Prompts de >800 caracteres (el motor se satura → garbage).
- Procesos artesanales SIN mostrar el producto terminado ≥${Math.max(videoDurationSec - 3, 4)} segundos.
- Más de 5 capas — las 5 son las esenciales. Menos es más.
` : `
REGLAS ESPECÍFICAS para prompt_generacion de VIDEO (${videoDurationSec} segundos, con audio nativo sincronizado, 1080p):

El motor de video IA rinde 10× mejor con prompts TIGHT de 300-500 caracteres, 5 capas combinadas esenciales, vs prompts inflados de 4000 chars con 8 capas separadas. TIGHT > LARGO. No sobrecargues al modelo — se satura y produce garbage (tipo "dedo metiéndose en barro"). Target ≈500 chars.

REGLA DE ORO — PERSONA + PRODUCTO EN ESCENA HUMANA (no solo hero shot de producto):
${productDesc || shopifyProducts.length > 0 ? `
- El prompt DEBE incluir una PERSONA como foco principal — habla a cámara, usa el producto, reacciona, o da testimonio. Este motor hace voz + expresión + lip-sync mucho mejor que un producto rotando solo.
- El producto REAL del catálogo debe aparecer al menos ${Math.max(videoDurationSec - 4, 3)} de los ${videoDurationSec} segundos, pero NO tiene que dominar el frame — la persona y la emoción son el hero.
- Si la persona habla, incluí la frase exacta que dice en el prompt (ej: 'She says "esto me cambió la vida" looking directly at camera').
- Si el cliente NO eligió producto específico, usá el primer producto del catálogo pero como secundario a la persona.
` : `
- Sin productos reales disponibles. El video es puramente sobre persona + ambiente + emoción. NUNCA inventes un producto.
- Si la persona habla, incluí la frase exacta en el prompt.
`}

ESTRUCTURA OBLIGATORIA — 5 CAPAS COMBINADAS:

1. SUBJECT + ACTION — qué persona + qué hace/dice combinados (ej: "a woman in her late 20s leans into camera and says 'no volví a dormir mal desde esto'"). Evitá "sonriendo", "usando", "posando" vagos.
2. SCENE + LIGHTING — dónde + cómo está iluminado combinados (ej: "her bedroom at golden hour, soft window light from the left, warm fill bouncing off cream walls").
3. CAMERA + STYLE — plano + look fotográfico combinados (ej: "medium close-up, iPhone 15 handheld with subtle shake, unfiltered UGC look").
4. PRODUCT + CONTEXT — cómo aparece el producto (ej: "the ${productData?.title || 'product'} is visible on the nightstand for ${Math.max(videoDurationSec - 4, 3)} of ${videoDurationSec} seconds, picked up at second ${Math.floor(videoDurationSec / 2)}").
5. AUDIO — específico pero conciso, 1 línea (ej: "Audio: ambient room tone, she speaks clearly in neutral Latin Spanish, soft indie guitar underlays. Lip-sync accurately.").

Siempre cerrar con "${videoDurationSec}-second total duration."

EJEMPLO DE PROMPT DE CALIDAD A REPLICAR (persona talking-head, ≈500 chars, 5 capas, con audio):
"${videoDurationSec}-second UGC-style iPhone clip. A woman in her late 20s with unstyled hair sits on her bed, leans slightly into camera and says in neutral Latin Spanish: 'no volví a dormir mal desde que empecé'. Soft golden-hour window light from the left, warm fill on cream walls. Medium close-up, handheld iPhone 15 with subtle natural shake, unfiltered Instagram-reel look. Product visible on nightstand for ${Math.max(videoDurationSec - 4, 3)} of ${videoDurationSec} seconds. Audio: ambient room tone, clear voice, soft indie guitar underlays. Lip-sync accurately. ${videoDurationSec}-second total duration."

NUNCA entregues:
- Prompts vagos tipo "persona haciendo cerámica" o "mujer sonriendo en cocina" (producen mediocre).
- Prompts de >800 caracteres (el motor se satura → garbage).
- Producto rotando solo sin persona (para ese ángulo hay otro motor — este prioriza persona).
- Más de 5 capas — las 5 son las esenciales. Menos es más.
`) : ''}

Responde SOLO el JSON sin markdown ni backticks.`;

  // Stage-specific visual playbook. TOFU/MOFU/BOFU each need a different role
  // for the image — this overrides any angle-level rules when there's conflict.
  const STAGE_PLAYBOOKS: Record<'tofu' | 'mofu' | 'bofu', string> = {
    tofu: `
FUNNEL STAGE = TOFU (Top — presentar marca a gente que no te conoce)
Purpose of the image: STOP THE SCROLL + build brand identity. NOT sell yet.
- Product prominence: LOW. Product appears as a PROP, NOT the hero. Often partially cropped, at distance, or background element.
- Scene: Wide LIFESTYLE shot. Rich environment (home, outdoor, café, beach, kitchen) that tells a story.
- Person: YES, aspirational. Real person but idealized — happy, confident, in their element. Persona should match target demo.
- Lighting: Natural, soft, golden hour preferred. Documentary-aspirational.
- Composition: Editorial / fashion / magazine-style. Rule of thirds, negative space, depth of field.
- Text overlay: NONE or a short emotional claim ("Así se vive", "Comer distinto"). NEVER prices, discounts, CTAs.
- Colors: Warm, emotional, cinematic palette. Brand colors as accents, not dominant.
- Goal: viewer should feel "me identifico con esto" or "qué mundo es ese".`,

    mofu: `
FUNNEL STAGE = MOFU (Middle — considerar, construir confianza)
Purpose of the image: BUILD TRUST via real use cases + social proof.
- Product prominence: MEDIUM. Product visible IN USE by real people. Balanced with the person/scene.
- Scene: Casual / honest / documentary. Real home, real kitchen, real desk. No staged perfection.
- Person: YES, realistic. Shows the product in the hands of someone who looks like the target customer. Medium shot (waist-up).
- Lighting: Ambient, honest. Mixed (daylight + interior). Can be imperfect.
- Composition: Over-the-shoulder, POV, UGC phone-style, or medium portrait. Feels unscripted.
- Text overlay: Testimonial quotes ("Lo uso todos los días"), review stars, short phrases in real voice. Never generic slogans.
- Colors: Natural, true-to-life. No heavy color grading.
- Goal: viewer should feel "gente normal como yo lo usa y le gusta".`,

    bofu: `
FUNNEL STAGE = BOFU (Bottom — cerrar la venta)
Purpose of the image: PUSH THE PURCHASE. Clear product, clear offer, clear CTA in the head.
- Product prominence: MAX (80%+ del frame). Product is the absolute hero — large, centered, sharp.
- Scene: Minimal OR high-production studio. Clean background (solid color, cyclorama, marble) or a prop context that only reinforces the product (ingredient around food product, texture under fabric).
- Person: OPTIONAL. If present, focused on product (close-up of hand holding it). Never distracts from product.
- Lighting: Studio-style, clean, controlled. Contrast to make product pop. Macro details visible (texture, packaging, labels, reflections).
- Composition: Hero product shot, macro, flat-lay, tight crop. No negative space wasted.
- Text overlay: Price, discount ("-40%", "Desde $X"), urgency ("Últimas unidades", "Solo hoy"), brand logo. CTA subtle or within copy.
- Colors: High contrast. Brand colors dominant. Price/discount in bold accent color.
- Goal: viewer should feel "lo quiero ya, precio claro, click".`,
  };

  const stagePlaybook = `\n${STAGE_PLAYBOOKS[stage]}\n`;

  const ANGLE_PHOTO_RULES = `
Reglas de estilo fotográfico por ángulo creativo (DEBES seguir estas reglas al generar prompt_generacion):
- Call Out: Close-up portrait, direct eye contact, clean minimal background, subject addressing viewer directly. TONE: provocative, confrontational, "Hey you!"
- Bold Statement: High contrast, dramatic lighting, product hero shot, wide angle, impactful composition. TONE: confident, authoritative, disruptive
- Us vs Them: Split composition or before/after layout, clear visual comparison. TONE: competitive, us-first, showing the gap
- Reviews/Testimonios: Lifestyle setting, person using product naturally, warm tones, authentic feel. TONE: trusted, genuine, word-of-mouth
- Ugly Ads: Raw phone screenshot aesthetic, no production value, looks like organic social media content. TONE: raw, unfiltered, anti-ad
- Beneficios: Product in use, person experiencing the benefit, aspirational lifestyle. TONE: transformative, "imagine yourself", solution-focused
- Beneficios Principales: Macro detail on the KEY benefit with visual proof. TONE: specific, evidence-based, "this is what matters"
- Resultados: Clean background with space for number overlays, product secondary. TONE: data-driven, impressive, metrics-focused
- Antes y Después: Two-panel composition showing transformation. TONE: dramatic change, journey, night-and-day difference
- Descuentos/Ofertas: Bold product shot, clean background, space for price/discount overlay. TONE: urgency, value, limited-time
- Paquetes: Multiple products arranged together, lifestyle bundle composition. TONE: value stacking, completeness, "everything you need"
- Pantalla Dividida: Split-screen dual narrative showing two moments/perspectives. TONE: contrast, comparison, storytelling
- Nueva Colección: Editorial fashion/product shoot, fresh colors, seasonal. TONE: excitement, novelty, "just dropped"
- Detalles de Producto: Extreme macro, texture focus, craftsmanship visible. TONE: quality, precision, premium
- Ingredientes/Material: Raw materials/ingredients beautifully arranged around product. TONE: transparency, natural, "what's inside"
- Memes: Trending meme format adapted to brand, relatable humor. TONE: funny, shareable, culturally relevant
- Mensajes y Comentarios: Screenshot-style showing real DMs/comments praising product. TONE: social proof, viral, community

REGLA CRÍTICA DE VARIACIÓN: Cada prompt_generacion debe ser ÚNICO y CREATIVO. NO repitas los mismos escenarios, metáforas o situaciones entre imágenes. Si el producto es X, piensa en 10 formas distintas de mostrarlo y elige la más inesperada y atractiva para este ángulo específico. Sorprende al espectador.
`;

  const systemPrompt = `${bugSection}${knowledgeSection}${referencesSection}${stagePlaybook}${ANGLE_PHOTO_RULES}Eres un director creativo experto en producción de anuncios para Meta Ads. Generas briefs visuales detallados y accionables para equipos de producción. Tu prompt_generacion DEBE respetar, en este orden de prioridad: (1) el FUNNEL STAGE playbook arriba — es la REGLA MÁS IMPORTANTE y define el rol visual de la imagen, (2) el ángulo creativo específico, (3) las referencias visuales reales.${adReferences && adReferences.length > 0 ? ' PRIORIZA replicar los patrones de las referencias visuales reales proporcionadas.' : ''}`;

  // Build multimodal message with reference images and product photos
  const messageContent: any[] = [];

  // Add ad reference images (visual examples from knowledge library)
  const refImages = (adReferences || []).filter((ref: any) => ref.image_url).slice(0, 3);
  if (refImages.length > 0) {
    messageContent.push({ type: 'text', text: `IMÁGENES DE REFERENCIA DE ANUNCIOS EXITOSOS (replica este estilo visual):` });
    for (const ref of refImages) {
      messageContent.push({
        type: 'image',
        source: { type: 'url', url: (ref as any).image_url },
      });
    }
  }

  // Add Shopify product images (store aesthetic reference)
  const productImages = shopifyProducts.filter((p: any) => p.image_url).slice(0, 3);
  if (productImages.length > 0) {
    messageContent.push({ type: 'text', text: `FOTOS DEL CATÁLOGO SHOPIFY (la imagen generada debe ser coherente con esta estética de tienda):` });
    for (const p of productImages) {
      messageContent.push({
        type: 'image',
        source: { type: 'url', url: (p as any).image_url },
      });
    }
  }

  // Add the main text prompt
  messageContent.push({ type: 'text', text: userPrompt });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: messageContent }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Anthropic API error response:', errText);
    let userMessage = 'Steve no pudo generar el brief visual. Intenta de nuevo.';
    try {
      const errJson = JSON.parse(errText);
      if (errJson.error?.message) userMessage = errJson.error.message;
    } catch { /* use generic message */ }
    throw new Error(userMessage);
  }

  const aiResult: any = await response.json();
  const rawContent = aiResult.content?.[0]?.text || '';

  if (!rawContent) {
    throw new Error('No se pudo generar el contenido. Intenta de nuevo.');
  }

  let parsed;
  try {
    const clean = rawContent.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(clean);
  } catch {
    console.error('Failed to parse AI JSON response:', rawContent.slice(0, 500));
    throw new Error('Error procesando la respuesta. Intenta de nuevo.');
  }

  // Brief Estudio — Etapa 5: enrich response with studio assets + suggested
  // music track. Non-destructive: never overwrites fields produced by the AI.
  if (studioMode) {
    try {
      const studioAssets = await loadStudioAssets(supabase, clientId);
      // Prefer brand-chosen moods over caller-provided mood_key.
      const studioMood =
        (moodKeyInput as MusicMood | null) ||
        ((studioAssets.music_preferences?.moods?.[0] as MusicMood | undefined) ?? null);
      const pickedTrack = studioMood
        ? pickTrackForAngleAndMood(String(angulo || ''), studioMood)
        : undefined;

      const studioMeta: Record<string, unknown> = {
        studio_mode: true,
        studio_ready: studioAssets.studio_ready,
        actor_id: studioAssets.primary_actor?.id ?? null,
        actor_reference_image: studioAssets.primary_actor?.reference_images?.[0] ?? null,
        voice_id: studioAssets.primary_voice?.voice_id ?? null,
        voice_source: studioAssets.primary_voice?.source ?? null,
        featured_product_id: studioAssets.featured_products?.[0]?.shopify_product_id ?? null,
        featured_product_title: studioAssets.featured_products?.[0]?.title ?? null,
        featured_product_image: studioAssets.featured_products?.[0]?.image_url ?? null,
        music_track_id: pickedTrack?.id ?? null,
        music_mood: studioMood ?? null,
      };
      parsed = { ...parsed, studio: studioMeta };

      // If AI didn't suggest a foto_recomendada (or returned literal placeholder),
      // fall back to the first Brief Estudio featured product image so callers
      // can use it as the image-to-video anchor.
      const fotoValue = typeof parsed?.foto_recomendada === 'string' ? parsed.foto_recomendada : '';
      const looksValid = /^https?:\/\//i.test(fotoValue.trim());
      if (!looksValid && studioMeta.featured_product_image) {
        if (fotoValue.trim().length > 0) {
          // AI devolvió algo que no es http(s) — lo descartamos en favor del
          // producto destacado real. Logueamos para detectar si pasa seguido
          // (podría ser ruta relativa válida de storage que estamos perdiendo).
          console.warn(
            '[generate-brief-visual][studio] descartando foto_recomendada no-http:',
            fotoValue.slice(0, 120),
          );
        }
        parsed.foto_recomendada = studioMeta.featured_product_image;
      }
    } catch (err: any) {
      console.warn('[generate-brief-visual][studio] enrichment failed:', err?.message);
    }
  }

  return c.json(parsed);

  } catch (error: any) {
    console.error('generate-brief-visual error:', error);
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
}
