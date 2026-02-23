import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { clientId, formato, angulo, variacionElegida, assetUrls, productData } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const [briefRes, personaRes] = await Promise.all([
      supabase.from('brand_research').select('research_data').eq('client_id', clientId).eq('research_type', 'brand_brief').maybeSingle(),
      supabase.from('buyer_personas').select('persona_data').eq('client_id', clientId).eq('is_complete', true).maybeSingle(),
    ]);

    const brief = (briefRes.data?.research_data as Record<string, unknown>) || {};
    const persona = (personaRes.data?.persona_data as Record<string, unknown>) || {};

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

    const categoria = 'anuncios';
    const [{ data: kbBugs }, { data: kbKnowledge }, { data: adReferences }] = await Promise.all([
      supabase.from('steve_bugs').select('descripcion, ejemplo_malo, ejemplo_bueno').eq('categoria', categoria).eq('activo', true),
      supabase.from('steve_knowledge').select('titulo, contenido').eq('categoria', categoria).eq('activo', true).order('orden'),
      supabase.from('ad_references').select('visual_patterns, quality_score, image_url')
        .eq('angulo', angulo)
        .order('quality_score', { ascending: false })
        .limit(3),
    ]);
    const bugSection = kbBugs && kbBugs.length > 0 ? `\nERRORES CRÍTICOS QUE DEBES EVITAR:\n${kbBugs.map((b: any) => `❌ ${b.descripcion}\nMAL: ${b.ejemplo_malo}\nBIEN: ${b.ejemplo_bueno}`).join('\n\n')}\n` : '';
    const knowledgeSection = kbKnowledge && kbKnowledge.length > 0 ? `\nCONOCIMIENTO BASE:\n${kbKnowledge.map((k: any) => `## ${k.titulo}\n${k.contenido}`).join('\n\n')}\n` : '';

    // Build visual references section from ad_references
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

    const photosList = (assetUrls as string[] || []).slice(0, 5).join(', ');
    const copyText = `Título: ${variacionElegida?.titulo}\nTexto: ${variacionElegida?.texto_principal}\nDescripción: ${variacionElegida?.descripcion}\nCTA: ${variacionElegida?.cta}`;

    // Build product description context
    const productDesc = productData
      ? `Producto: ${productData.title || ''}. Tipo: ${productData.product_type || ''}. Descripción: ${(productData.body_html || '').replace(/<[^>]*>/g, '').slice(0, 200)}.`
      : '';

    // Buyer persona description for photo subjects
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
  "prompt_generacion": "prompt detallado en inglés para Fal.ai Flux Pro"
}`}

IMPORTANTE para prompt_generacion:
${productDesc ? `- Describe el producto en el prompt: "${productDesc}". The product should appear prominently in the image.` : ''}
- ${personaPhotoDesc}
- Siempre terminar el prompt con: "Professional advertising photography, no text or watermarks in the image, sharp focus, high resolution. The image must look like a real photograph, never AI-generated or stock-like."

Responde SOLO el JSON sin markdown ni backticks.`;

    const ANGLE_PHOTO_RULES = `
Reglas de estilo fotográfico por ángulo creativo (DEBES seguir estas reglas al generar prompt_generacion):
- Call Out: Close-up portrait, direct eye contact, clean minimal background, subject addressing viewer directly
- Bold Statement: High contrast, dramatic lighting, product hero shot, wide angle, impactful composition
- Us vs Them: Split composition or before/after layout, clear visual comparison
- Reviews/Testimonios: Lifestyle setting, person using product naturally, warm tones, authentic feel
- Ugly Ads: Raw phone screenshot aesthetic, no production value, looks like organic social media content
- Beneficios: Product in use, person experiencing the benefit, aspirational lifestyle
- Resultados: Clean background with space for number overlays, product secondary
- Antes y Después: Two-panel composition showing transformation
- Descuentos/Ofertas: Bold product shot, clean background, space for price/discount overlay
- Paquetes: Multiple products arranged together, lifestyle bundle composition
`;

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
        system: `${bugSection}${knowledgeSection}${referencesSection}${ANGLE_PHOTO_RULES}Eres un director creativo experto en producción de anuncios para Meta Ads. Generas briefs visuales detallados y accionables para equipos de producción. Cuando generes prompt_generacion, SIEMPRE sigue las reglas de estilo fotográfico del ángulo creativo indicado.${adReferences && adReferences.length > 0 ? ' PRIORIZA replicar los patrones de las referencias visuales reales proporcionadas.' : ''}`,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errText}`);
    }

    const aiResult = await response.json();
    const rawContent = aiResult.content?.[0]?.text || '';

    let parsed;
    try {
      const clean = rawContent.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      throw new Error('Failed to parse AI response as JSON');
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('generate-brief-visual error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
