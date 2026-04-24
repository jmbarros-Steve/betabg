import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export async function generateBriefVisual(c: Context) {
  try {
  const { clientId, formato, angulo, variacionElegida, assetUrls, productData, funnelStage } = await c.req.json();
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
    supabase.from('shopify_products').select('title, product_type, image_url, price').eq('client_id', clientId).limit(10),
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
      ? { min: Math.min(...shopifyProducts.map((p: any) => parseFloat(p.price) || 0)), max: Math.max(...shopifyProducts.map((p: any) => parseFloat(p.price) || 0)) }
      : null;
    const productSamples = shopifyProducts.slice(0, 5).map((p: any) => `${p.title} ($${p.price})`).join(', ');

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

${formato === 'video' ? `Responde en JSON para VIDEO (motor: Google Veo 3.1, 8 segundos, un solo plano continuo, con audio nativo sincronizado):
{
  "tipo": "video",
  "duracion": "8s",
  "plano": "descripción corta del único plano del video (Veo 3.1 no soporta multi-escena en 8s)",
  "texto_overlay": "opcional, 1-3 palabras máx",
  "musica_sugerida": "género + mood (ej: acoustic folk, warm and intimate)",
  "tono": "...",
  "foto_recomendada": "URL http(s) real de foto de producto si existe, o null si no hay — NUNCA escribas 'Sin foto disponible' como string",
  "instruccion_foto": "image-to-video (preservar el producto literal) / text-to-video (sin foto base)",
  "prompt_generacion": "prompt cinematográfico en inglés para Veo 3.1 — OBLIGATORIO seguir la estructura de las reglas de abajo"
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

${formato === 'video' ? `
REGLAS ESPECÍFICAS para prompt_generacion de VIDEO (Veo 3.1 — 8 segundos, 1080p, con audio):

Veo 3.1 rinde 10× mejor con prompts cinematográficos estructurados vs prompts planos tipo "mujer usando el producto". El prompt DEBE incluir estas 8 capas en este orden:

REGLA DE ORO — EL PRODUCTO ES PROTAGONISTA:
${productDesc || shopifyProducts.length > 0 ? `
- El prompt DEBE nombrar el producto REAL del catálogo de la tienda (ej: "a Good Gres stoneware vase with visible clay texture and mineral glaze", NO "a ceramic product").
- El producto debe ser VISUALMENTE PROTAGÓNICO al menos 4 de los 8 segundos (close-up macro, hero shot, o zoom).
- En SUBJECT: describí el producto con nombre + material + detalles físicos específicos del catálogo.
- En ACTION: la acción debe girar ALREDEDOR del producto (revelar, servir, sostener, acercar la cámara al producto, no solo "mujer sonriendo").
- En AUDIO: si hay voz humana, debe mencionar explícitamente el nombre de la marca o el producto al menos una vez. Si no hay voz, el sonido diegético debe ser del producto en uso (clink de la cerámica, sirviendo agua, etc.).
- Si el cliente NO eligió producto específico, usá el primer producto del <catalogo_disponible> como hero. NUNCA uses un producto genérico o alucinado.
` : `
- No hay productos reales disponibles. El video debe ser de marca/lifestyle SIN ningún producto visible. En SUBJECT y ACTION no hay producto — trabajar solo con persona + ambiente + emoción. En AUDIO evitar referencias a productos inexistentes.
`}


1. SUBJECT — qué/quién está en cámara (describir cara/ropa/objeto con detalle).
2. ACTION — verbos concretos específicos ("pouring", "unboxing", "stirring", "sliding a finger along"). Evita "sonriendo", "usando".
3. SCENE / SETTING — dónde + props específicos + hora del día.
4. CAMERA — elegir UNO: "close-up macro", "medium shot", "over-the-shoulder POV", "slow dolly-in", "handheld phone-style", "overhead flat-lay pan".
5. LIGHTING — "golden hour from window left", "studio softbox at 45°", "practical kitchen pendants warm 2700K", "overcast diffused daylight".
6. STYLE — "Canon 50mm f/1.4 look", "16mm film grain", "cinematic teal-and-orange grade", "natural Instagram UGC iPhone look", "Hasselblad medium-format product still".
7. PACING — "single continuous take, slow pacing" or "snap cuts every 2s". Siempre terminar: "8-second total duration".
8. AUDIO — ESPECÍFICO y detallado. Ejemplos:
   - "Audio: soft kitchen ambience, acoustic guitar (warm finger-picking), occasional crockery clinks. No dialogue."
   - "Audio: upbeat indie-pop beat (120bpm, tambourine), natural street ambience, a woman's voice saying in Spanish '¿Por qué pagar más?' at second 5. Clear lip-sync."
   - "Audio: soft whirring of pottery wheel, faint acoustic guitar, single breath of concentration at second 4. No music."

Ejemplo de prompt cinematográfico de calidad (replica este nivel de detalle):
"Cinematic close-up, macro lens, of a ceramist's hands shaping wet clay on a spinning wheel. Hands are weathered, fingernails slightly clay-stained. The clay is forming the base of a stoneware vase — raw earth-tone texture, visible wheel lines. Studio natural light from a tall window on the left creates soft shadows and highlights the water glisten on her fingers. Single continuous slow dolly-in over 8 seconds. Shot on Hasselblad 80mm f/4. Warm earth-tone color grade, shallow depth of field. Audio: soft whirring of the pottery wheel at low RPM, faint acoustic guitar (single guitar warm tones), one concentrated breath at the 5-second mark. No dialogue. 8-second total duration."

NUNCA entregues prompts vagos tipo "persona haciendo cerámica" o "mujer sonriendo en cocina". Eso produce videos mediocres. Sé MUY específico en CADA capa.
` : ''}

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

  return c.json(parsed);

  } catch (error: any) {
    console.error('generate-brief-visual error:', error);
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
}
