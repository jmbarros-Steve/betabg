import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export async function generateBriefVisual(c: Context) {
  try {
  const { clientId, formato, angulo, variacionElegida, assetUrls, productData } = await c.req.json();

  const supabase = getSupabaseAdmin();

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
      .order('orden', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(15),
    supabase.from('ad_references').select('visual_patterns, quality_score, image_url')
      .or(`client_id.eq.${clientId},client_id.is.null`)
      .eq('angulo', angulo)
      .order('quality_score', { ascending: false })
      .limit(3),
  ]);

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

${formato === 'video' ? `Responde en JSON para VIDEO:
{
  "tipo": "video",
  "duracion": "15s",
  "escena_1": {"tiempo": "0-3s", "descripcion": "...", "texto_overlay": "..."},
  "escena_2": {"tiempo": "3-12s", "descripcion": "...", "texto_overlay": "..."},
  "escena_3": {"tiempo": "12-15s", "descripcion": "...", "texto_overlay": "..."},
  "musica_sugerida": "...",
  "tono": "...",
  "foto_recomendada": "URL de la foto más adecuada y por qué (o 'Sin foto disponible')",
  "instruccion_foto": "animar / usar como base / cambiar fondo",
  "prompt_generacion": "prompt detallado en inglés para Kling AI"
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
${productDesc ? `- Describe el producto EXACTO en el prompt: "${productDesc}". The product must appear prominently and realistically — same shape, colors, packaging.` : ''}
- ${personaPhotoDesc}
- ESTILO DE LA TIENDA: El estilo fotográfico debe ser COHERENTE con la estética de la tienda y su catálogo de productos. Si la tienda vende productos premium, la foto debe verse premium. Si es una tienda casual/juvenil, la foto debe reflejar esa energía. Usa los colores de marca, el rango de precios y el tipo de productos como guía para definir el nivel de producción, ambientación y estilo de la imagen. La foto generada debe parecer parte natural del feed de la tienda o su catálogo.
- CLAVE PARA REALISMO: El prompt debe especificar detalles físicos reales: textura de piel con poros e imperfecciones naturales, ropa con arrugas y pliegues reales, superficies con reflejos naturales, profundidad de campo con bokeh sutil, iluminación con sombras suaves y direccionales.
- Mencionar un entorno REAL y específico (ej: "en una cocina moderna con mesón de mármol" NO "en un fondo limpio").
- NUNCA usar palabras como "digital art", "illustration", "3D render", "graphic design" — todo debe ser "photograph".
- Siempre terminar el prompt con: "Ultra-realistic commercial photograph, professional advertising photo shoot, real textures, natural imperfections, shot on Canon EOS R5. No illustrations, no AI artifacts, no plastic-looking skin, no floating objects, no text overlays."

Responde SOLO el JSON sin markdown ni backticks.`;

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

  const systemPrompt = `${bugSection}${knowledgeSection}${referencesSection}${ANGLE_PHOTO_RULES}Eres un director creativo experto en producción de anuncios para Meta Ads. Generas briefs visuales detallados y accionables para equipos de producción. Cuando generes prompt_generacion, SIEMPRE sigue las reglas de estilo fotográfico del ángulo creativo indicado.${adReferences && adReferences.length > 0 ? ' PRIORIZA replicar los patrones de las referencias visuales reales proporcionadas.' : ''}`;

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
