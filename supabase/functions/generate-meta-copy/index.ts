import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateRequest {
  clientId: string;
  adType: 'static' | 'video';
  funnelStage: 'tofu' | 'mofu' | 'bofu';
  customPrompt?: string;
}

// =============================================================================
// METODOLOGÍA COMPLETA 1PMP - SABRI SUBY "SELL LIKE CRAZY"
// =============================================================================

const SABRI_METHODOLOGY = `
═══════════════════════════════════════════════════════════════════════════════
METODOLOGÍA 1PMP - SABRI SUBY "SELL LIKE CRAZY"
═══════════════════════════════════════════════════════════════════════════════

ESTADÍSTICAS CLAVE DEL MERCADO:
- 96% de los negocios falla al año
- 80% falla al segundo año
- 95% nunca llega al millón en ventas
- El 4% de las actividades generan el 64% del ingreso (Ley de Pareto)

FILOSOFÍA CORE:
- Estar ocupado NO es lo mismo que ser productivo
- El dinero no está en tu negocio, está en VENDER tu producto - eres un Market Man
- El mercado no paga por productos, paga por RESOLVER PROBLEMAS agregando valor
- A más caro el problema que resuelves, más caro puedes cobrar
- Los clientes deben perseguirte, no tú a ellos
- La primera prioridad del dueño es VENDER - el 80% del tiempo
- Si no puedes pagar para adquirir un cliente, NO EXISTE EL NEGOCIO

═══════════════════════════════════════════════════════════════════════════════
LA PIRÁMIDE DEL MERCADO (FUNDAMENTAL)
═══════════════════════════════════════════════════════════════════════════════

3% ACTIVAMENTE BUSCANDO:
- Todos pelean por estos - guerra de precios
- Los idiotas compiten aquí
- Fácil que compren pero no dejan mucho dinero

37% PROBLEMA INCIPIENTE (¡AQUÍ ESTÁ EL ORO!):
- Tienen el problema pero no están buscando activamente
- Están recabando información
- DEBEN SER EDUCADOS para que te elijan

60% NO SABEN QUE TIENEN EL PROBLEMA:
- Oportunidad de largo plazo
- Hay que moverlos hacia arriba en la pirámide

META: Educar al 97% para que cuando quieran comprar, TE ELIJAN A TI
- No vayas directo a la venta
- Edúcalos, cuéntales cosas, dales información
- Muévelos hacia arriba para que luego vayan y te compren

═══════════════════════════════════════════════════════════════════════════════
LOS 3 TIPOS DE TRÁFICO (TEMPERATURA)
═══════════════════════════════════════════════════════════════════════════════

🥶 TRÁFICO FRÍO (Tinder):
- Completo extraño
- Solo hará Like en algo que le llame MUCHO la atención
- NO LE VENDAS, edúcalo primero
- Usa contenido de alto valor (HVCO)

🌡️ TRÁFICO TIBIO (Cita):
- Se van conociendo
- Están buscando FIT
- Construye confianza y diferénciate

🔥 TRÁFICO CALIENTE (Netflix):
- Ya piensan en relación a largo plazo
- Listos para comprar
- Aquí va la oferta del Padrino

REGLA DE ORO: Si envías mensaje caliente a público frío, te van a mandar a volar.

═══════════════════════════════════════════════════════════════════════════════
MARKETING DE ALTO VALOR (HVCO) - PARA TOFU/MOFU
═══════════════════════════════════════════════════════════════════════════════

- No grites "¡COMPRA!". Dale contenido que de verdad les interese
- Mientras todos gritan "compra", tú dices "déjame ayudarte a avanzar"
- Si entras con vender, te van a mandar a volar

DATOS REALES DE CONVERSIÓN:
- Ventas con CTA directo: 3% conversión
- Con proceso educativo: 30% conversión

"Solo los tontos leen copies largos" = MENTIRA
- Mientras los mantengas entretenidos, leen todo
- A más contenido, más confianza
- A más confianza, más fácil que te compren

REGLA: El 80% de tu efectividad está en el HEADLINE

TÉCNICAS PARA HEADLINES:
- Toca temas que le DUELAN a tu cliente
- Usa números: "7 maneras de...", "Las 5 razones por las que..."
- Genera INTRIGA que los obligue a seguir leyendo
- Debe ser algo SALVAJE que mate al cliente

═══════════════════════════════════════════════════════════════════════════════
LAS 7 PARTES DE LA OFERTA DEL PADRINO - PARA BOFU
═══════════════════════════════════════════════════════════════════════════════

1. VALOR PERCIBIDO ALTÍSIMO:
   - Cliente recibe más de lo que paga
   - Oportunidad única e irrepetible
   - Muéstrales cuánto cuesta en verdad cada cosa

2. GARANTÍA SÓLIDA:
   - 100% devolución, sin preguntas
   - Eliminar el riesgo financiero
   - Vienen de tráfico frío, no te conocen
   - La garantía debe ser "absurda" para eliminar TODO el riesgo

3. BONOS ATRACTIVOS:
   - Productos/servicios adicionales sin costo extra
   - De verdad funcionan como motivadores
   - Algo que van a ganar EXTRA

4. ESCASEZ/URGENCIA (REAL, no fake):
   - Tiempo limitado
   - Cupos limitados
   - Hasta agotar existencias
   - DEBE SER REAL o pierdes credibilidad

5. RESULTADOS CLAROS:
   - Promesas específicas y medibles
   - Timeframe claro
   - "En X días lograrás Y"

6. DECISIÓN SIMPLE:
   - Sin confusión
   - Un clic
   - Proceso de compra rápido
   - No los pierdas con tanta oferta

7. BENEFICIOS EMOCIONALES:
   - La gente compra con emociones
   - Justifica con lógica después
   - Pinta el cuadro de la transformación

═══════════════════════════════════════════════════════════════════════════════
LOS 17 PASOS DE SABRI PARA UN BUEN COPY
═══════════════════════════════════════════════════════════════════════════════

1. LLAMA A TU AUDIENCIA en el principio
   - "¿Eres [tipo de persona] que [situación específica]?"
   
2. DEMANDA ATENCIÓN con un Headline potente
   - 80% de la efectividad está aquí
   - Palabras fuertes que llamen la atención
   
3. DALE UN BACK UP a tu promesa
   - Credibilidad inmediata
   - Por qué deberían creerte
   
4. CREA INTRIGA con bullet points
   - Genera curiosidad (el incentivo más grande del ser humano)
   - "Cómo X con Y", "La verdad sobre...", "Lo que nadie te dice de..."
   
5. HAZLOS VIVIR SU PROBLEMA
   - Usa las palabras EXACTAS que ellos usan
   - Describe el dolor de las 3 AM
   - El sentimiento del domingo por la tarde
   
6. DALES LA SOLUCIÓN
   - Presenta tu producto/servicio como el antídoto
   
7. MUESTRA TUS CREDENCIALES
   - Por qué TÚ puedes ayudarlos
   - Experiencia, resultados, especialización
   
8. DETALLA LOS BENEFICIOS
   - Beneficios emocionales PRIMERO
   - Lógicos después
   - Features vs Beneficios: qué GANAN ellos
   
9. CREA PRUEBA SOCIAL
   - Testimonios irrefutables
   - Antes/después
   - Números concretos
   - Clientes reconocibles
   
10. MUESTRA LA OFERTA DEL PADRINO
    - Tan buena que sería tonto rechazarla
    
11. MÉTELE BONOS
    - Valor adicional sin costo
    
12. MUESTRA CUÁNTO CUESTA EN REALIDAD
    - El valor total de todo lo que incluye
    
13. MUESTRA EL PRECIO
    - Compáralo con algo trivial
    - Opciones de cuotas
    
14. METE PREMURA
    - Descuento que dura X días
    - Stock limitado
    - Cupos limitados
    
15. GARANTÍA PROFUNDA
    - Elimina todo el riesgo
    - Ponla en el centro
    - Dale un nombre
    
16. LLAMADO A LA ACCIÓN
    - Claro y directo
    - No preguntes, DILES qué hacer
    
17. RECORDATORIO DE LO QUE PASA SI NO COMPRA
    - El dolor que seguirá
    - Lo que se pierde
    - El costo de no actuar

═══════════════════════════════════════════════════════════════════════════════
LA LINTERNA MÁGICA (FUNNEL EDUCATIVO)
═══════════════════════════════════════════════════════════════════════════════

La idea es GUIAR al cliente por donde quieres que vaya:

1. ATRAE con contenido de alto valor (HVCO)
2. EDUCA sobre el problema y la solución
3. CONSTRUYE CONFIANZA con más contenido valioso
4. PRESENTA LA OFERTA DEL PADRINO cuando están listos

"Pero si les doy tanta información, van a hacerlo solos"
→ MENTIRA. Lo que les falta es TIEMPO, no información.

A más contenido → más confianza → más fácil que compren

═══════════════════════════════════════════════════════════════════════════════
ANATOMÍA DE UN BUEN ANUNCIO DE META
═══════════════════════════════════════════════════════════════════════════════

PARA ANUNCIOS ESTÁTICOS:
- Imagen: Debe parecer contenido NORMAL, no publicidad
- Usa imágenes que llamen la atención sin parecer anuncio
- Headline Link: 12 a 18 palabras (60-100 caracteres)
- Testar texto largo vs corto

PARA ANUNCIOS DE VIDEO:
- Los primeros 3 segundos son TODO (el Hook)
- Debe parecer contenido orgánico, no publicidad
- El hook debe generar una pregunta en la mente
- Contenido > Calidad de producción

TÉCNICAS DE INTRIGA PARA HOOKS:
- Ángulo de noticias ("Lo que acaban de descubrir sobre...")
- Controversia ("Por qué [creencia común] está mal")
- Curiosidad ("El secreto que los expertos no quieren que sepas")
- Dolor específico ("Si te pasa [esto], necesitas ver esto")
- Beneficio inmediato ("Cómo [resultado] en [tiempo]")

═══════════════════════════════════════════════════════════════════════════════
FÓRMULAS PROBADAS PARA BULLETS Y HOOKS
═══════════════════════════════════════════════════════════════════════════════

- "Cómo [lograr X] con [método Y]"
- "¿Necesitas [resultado]? Estás equivocado sobre [creencia]"
- "[X] lugares donde encontrar [Y]"
- "Cómo eliminar [dolor] sin [sacrificio]"
- "Nunca deberías [error común]"
- "Dile adiós a [problema]"
- "La verdad sobre [tema controversial]"
- "Lo que [expertos/industria] no quieren que sepas sobre [tema]"
- "[Número] maneras de [resultado] que nadie te ha contado"

═══════════════════════════════════════════════════════════════════════════════
PRINCIPIOS DE PERSUASIÓN
═══════════════════════════════════════════════════════════════════════════════

1. PROBLEMA → SOLUCIÓN → RESULTADO
   Esta es la estructura base de todo mensaje

2. EMOCIONES PRIMERO, LÓGICA DESPUÉS
   La gente compra con el corazón y justifica con la cabeza

3. ESPECÍFICO > GENÉRICO
   "Pierde 5 kilos en 30 días" > "Pierde peso rápido"

4. PALABRAS DEL CLIENTE
   Usa las mismas palabras que TU cliente usa para describir su problema

5. EL VILLANO
   Todo buen copy tiene un enemigo: la ineficiencia, el sistema, los "expertos", etc.

6. LA TRANSFORMACIÓN
   Pinta el cuadro del "después" - cómo cambia su vida
`;

const FUNNEL_CONTEXT = {
  tofu: {
    name: 'Top of Funnel (TOFU) - TRÁFICO FRÍO',
    audience: 'Audiencia FRÍA - No te conocen, no saben que tienen un problema (el 60% o parte del 37%)',
    goal: 'Llamar la atención, educar, generar curiosidad. MOVERLOS HACIA ARRIBA en la pirámide.',
    focus: 'El PROBLEMA, no el producto. Interrumpir el scroll con algo que resuene. Marketing de Alto Valor (HVCO).',
    approach: `
APLICA MARKETING DE ALTO VALOR (HVCO):
- NO vendas, educa y genera curiosidad
- Habla del dolor de las 3 AM del cliente
- Usa las palabras EXACTAS que el cliente usa para describir su problema
- Pregunta que haga pensar "¿Cómo saben lo que estoy pensando?"
- Estadísticas impactantes relacionadas con el problema
- Presenta al VILLANO de la historia
- El 80% de la efectividad está en el HEADLINE

PASOS DE SABRI A APLICAR (1-5):
1. Llama a tu audiencia específica
2. Headline potente que demande atención
3. Intriga con bullet points
4. Hazlos VIVIR su problema
5. Genera curiosidad sobre la solución (sin venderla aún)

RECUERDA:
- Ventas con CTA directo: 3% conversión
- Con proceso educativo: 30% conversión
- No seas como los "idiotas que pelean por el 3%"
`,
    copyRules: `
- Enfócate 100% en el PROBLEMA, no menciones el producto directamente
- Usa estadísticas impactantes
- Pregunta que genere identificación inmediata
- El CTA debe ser hacia CONTENIDO DE VALOR, no hacia compra
- Parecer contenido orgánico, NO publicidad
- Genera intriga y curiosidad
`,
  },
  mofu: {
    name: 'Middle of Funnel (MOFU) - TRÁFICO TIBIO',
    audience: 'Audiencia TIBIA - Te conocen, están evaluando opciones (el 37% que está recabando información)',
    goal: 'Construir confianza, diferenciarte, posicionar tu solución como LA OBVIA.',
    focus: 'Tu SOLUCIÓN y por qué eres diferente. Credenciales, prueba social, el "Secreto del Insider".',
    approach: `
CONSTRUYE CONFIANZA Y DIFERENCIACIÓN:
- Muestra tu "Vaca Púrpura" - qué te hace diferente
- Comparte tu "Secreto del Insider" - lo que solo los expertos saben
- Testimonios y prueba social irrefutable
- Por qué elegirte a ti sobre la competencia
- Tu proceso único o metodología
- Educa sobre la solución CORRECTA al problema

PASOS DE SABRI A APLICAR (5-10):
5. Hazlos vivir el problema (refuerzo)
6. Presenta LA SOLUCIÓN
7. Muestra TUS CREDENCIALES
8. Detalla los BENEFICIOS (emocionales primero)
9. Prueba social potente
10. Introduce la oferta (sin presión aún)

RECUERDA:
- A más contenido, más confianza
- A más confianza, más fácil que compren
- Posiciónate como LA oferta obvia
`,
    copyRules: `
- Muestra resultados y transformaciones reales
- Usa testimonios con nombres y detalles específicos
- Explica tu metodología o proceso único
- Diferénciate claramente de la competencia
- El CTA puede ser hacia una demo, consulta o más información
- Construye autoridad sin ser arrogante
`,
  },
  bofu: {
    name: 'Bottom of Funnel (BOFU) - TRÁFICO CALIENTE',
    audience: 'Audiencia CALIENTE - Listos para comprar, solo necesitan el empujón final (el 3% + los que ya educaste)',
    goal: 'CERRAR LA VENTA con la Oferta del Padrino. Una oferta tan buena que sería tonto rechazarla.',
    focus: 'La OFERTA DEL PADRINO completa. Urgencia REAL, garantía absurda, bonos, beneficios claros.',
    approach: `
APLICA LA OFERTA DEL PADRINO COMPLETA:
1. VALOR PERCIBIDO ALTÍSIMO - Muestra todo lo que incluye
2. GARANTÍA SÓLIDA - Elimina TODO el riesgo
3. BONOS ATRACTIVOS - Valor adicional sin costo
4. ESCASEZ/URGENCIA - Pero REAL, no fake
5. RESULTADOS CLAROS - Promesas específicas y medibles
6. DECISIÓN SIMPLE - Un clic, sin confusión
7. BENEFICIOS EMOCIONALES - Pinta la transformación

PASOS DE SABRI A APLICAR (10-17):
10. Muestra la Oferta del Padrino
11. Métele bonos
12. Muestra cuánto cuesta en realidad
13. Muestra el precio (compáralo con algo trivial)
14. Mete premura REAL
15. Garantía profunda y visible
16. CTA directo y claro
17. Recordatorio de lo que pierden si no actúan

RECUERDA:
- Haz que la oferta sea TAN LOCA que solo un tonto diría que no
- La garantía debe eliminar completamente el miedo
- La urgencia debe ser REAL (tiempo limitado, stock limitado, cupos)
`,
    copyRules: `
- La oferta debe ser irresistible
- Incluye garantía prominente
- Urgencia y escasez REAL
- Muestra el valor total vs el precio
- CTA súper claro y directo
- Recuerda el costo de NO actuar
- Usa "tú" y lenguaje directo
- Opciones de pago si aplica
`,
  },
};

const buildSystemPrompt = (briefData: any, adType: string, funnelStage: keyof typeof FUNNEL_CONTEXT, customPrompt?: string) => {
  const funnel = FUNNEL_CONTEXT[funnelStage];
  
  return `Eres un copywriter EXPERTO en Meta Ads entrenado exclusivamente en la metodología 1PMP de Sabri Suby "Sell Like Crazy".

${SABRI_METHODOLOGY}

═══════════════════════════════════════════════════════════════════════════════
BRIEF DE MARCA DEL CLIENTE
═══════════════════════════════════════════════════════════════════════════════
${JSON.stringify(briefData, null, 2)}

═══════════════════════════════════════════════════════════════════════════════
INSTRUCCIONES ESPECÍFICAS PARA ESTA GENERACIÓN
═══════════════════════════════════════════════════════════════════════════════

ETAPA DEL FUNNEL: ${funnel.name}
- Audiencia: ${funnel.audience}
- Objetivo: ${funnel.goal}
- Enfoque: ${funnel.focus}

APPROACH ESPECÍFICO:
${funnel.approach}

REGLAS DE COPY PARA ESTA ETAPA:
${funnel.copyRules}

TIPO DE ANUNCIO: ${adType === 'static' ? 'Estático (imagen)' : 'Video'}

${customPrompt ? `INSTRUCCIONES ADICIONALES DEL CLIENTE: ${customPrompt}` : ''}

═══════════════════════════════════════════════════════════════════════════════
FORMATO DE RESPUESTA
═══════════════════════════════════════════════════════════════════════════════

Responde ÚNICAMENTE con un JSON válido con esta estructura:
{
  "headlines": [
    "5 headlines potentes siguiendo los 17 pasos de Sabri",
    "Cada uno con un ángulo diferente: dolor, curiosidad, beneficio, controversia, transformación"
  ],
  "primaryText": "Texto principal del anuncio siguiendo los pasos de Sabri apropiados para ${funnelStage.toUpperCase()}. Para TOFU: 100-200 palabras enfocadas en el problema. Para MOFU: 150-250 palabras construyendo confianza. Para BOFU: 200-350 palabras con la oferta completa.",
  "description": "Descripción corta de 1-2 líneas que refuerce el headline y genere click"${adType === 'video' ? `,
  "hooks": [
    "5 hooks diferentes para los primeros 3 segundos del video",
    "Cada hook debe detener el scroll inmediatamente",
    "Usa: pregunta impactante, estadística, controversia, dolor específico, beneficio"
  ],
  "script": "Guión completo del video estructurado así:\\n\\n[0-3s] HOOK: (el gancho que detiene el scroll)\\n[3-10s] PROBLEMA: (agita el dolor)\\n[10-20s] AGITACIÓN: (hazlo vivir el problema)\\n[20-35s] SOLUCIÓN: (presenta tu propuesta)\\n[35-45s] BENEFICIOS/PRUEBA: (por qué funciona)\\n[45-55s] OFERTA/CTA: (qué hacer ahora)\\n\\nIncluye indicaciones visuales entre paréntesis."` : ''}
}

IMPORTANTE:
- USA el tono de voz definido en el brief del cliente
- INCORPORA las palabras EXACTAS que usa el buyer persona
- APLICA los pasos de Sabri correspondientes a la etapa del funnel
- Para ${funnelStage.toUpperCase()}: ${funnel.goal}
- NO inventes información, usa solo lo del brief
- Responde SOLO con el JSON, sin texto adicional antes ni después`;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { clientId, adType, funnelStage, customPrompt } = await req.json() as GenerateRequest;

    if (!clientId || !adType || !funnelStage) {
      throw new Error('Missing required parameters');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch the completed brand brief
    const { data: briefData, error: briefError } = await supabase
      .from('buyer_personas')
      .select('*')
      .eq('client_id', clientId)
      .eq('is_complete', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (briefError || !briefData) {
      console.error('Brief error:', briefError);
      throw new Error('No completed brand brief found. Please complete the brief with Steve first.');
    }

    // Extract the answers from raw_data
    const rawData = briefData.raw_data || {};
    const executiveSummary = briefData.executive_summary || '';

    // Build comprehensive brief context
    const briefContext = {
      // Raw answers from the questionnaire
      respuestasCompletas: rawData,
      
      // Executive summary from Steve
      resumenEjecutivo: executiveSummary,
      
      // Structured persona data
      buyerPersona: {
        nombre: briefData.name,
        rangoEdad: briefData.age_range,
        genero: briefData.gender,
        ubicacion: briefData.location,
        ocupacion: briefData.occupation,
      },
      
      // Key psychological drivers
      psicografia: {
        doloresPrincipales: briefData.main_pains,
        deseosPrincipales: briefData.main_desires,
        miedosPrincipales: briefData.main_fears,
        objecionesPrincipales: briefData.main_objections,
      },
      
      // Extract specific answers if available
      negocio: {
        tipoNegocio: rawData.business_type,
        ticketPromedio: rawData.average_ticket,
        margenes: rawData.margins,
        canalesVenta: rawData.sales_channels,
      },
      
      personaProfunda: {
        dolorDeLas3AM: rawData.persona_3am_pain,
        verguenza: rawData.persona_shame,
        errorComun: rawData.persona_common_mistake,
        miedoNoComprar: rawData.persona_fear_not_buying,
        sentimientoDomingo: rawData.persona_sunday_feeling,
        palabrasExactas: rawData.persona_exact_words,
        objecionInterna: rawData.persona_internal_objection,
        transformacionSonada: rawData.persona_transformation,
        marcasQueConsume: rawData.persona_lifestyle_brands,
        aQuienImpresiona: rawData.persona_impress_who,
        canalesCliente: rawData.persona_channels,
        suenosDeseos: rawData.persona_desires,
        frustracionesDiarias: rawData.persona_daily_frustrations,
      },
      
      competencia: {
        competidores: rawData.competitors_list,
        quejasCompetencia: rawData.competitors_complaints,
        promesasFalsas: rawData.competitors_false_promise,
        preciosCompetencia: rawData.competitors_pricing,
        puntoDebil: rawData.competitors_slow_point,
        tonoCompetencia: rawData.competitors_tone,
        canalIgnorado: rawData.competitors_ignored_channel,
        ofertaEntrada: rawData.competitors_entry_offer,
        porQueCambiarse: rawData.why_switch_to_you,
        ventajaImposibleCopiar: rawData.uncopyable_advantage,
      },
      
      estrategiaComunicacional: {
        vacaPurpura: rawData.purple_cow,
        granPromesa: rawData.big_promise,
        villano: rawData.villain,
        garantiaAbsurda: rawData.absurd_guarantee,
        pruebaIrrefutable: rawData.irrefutable_proof,
        secretoInsider: rawData.insider_secret,
        tonoIdeal: rawData.ideal_tone,
        ofertaIrresistible: rawData.irresistible_offer,
        razonUrgencia: rawData.urgency_reason,
      },
    };

    const systemPrompt = buildSystemPrompt(briefContext, adType, funnelStage, customPrompt);

    console.log('Generating copy for:', { clientId, adType, funnelStage });

    // Call Lovable AI
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { 
            role: 'user', 
            content: `Genera copies profesionales para un anuncio ${adType === 'static' ? 'estático' : 'de video'} de Meta Ads para la etapa ${funnelStage.toUpperCase()} del funnel.

REQUISITOS:
1. Aplica TODOS los pasos de Sabri Suby correspondientes a esta etapa
2. Usa la información del Brief de Marca para personalizar cada copy
3. Incorpora las palabras EXACTAS que usa el buyer persona "${briefContext.buyerPersona.nombre || 'el cliente ideal'}"
4. Sigue las reglas específicas para ${funnelStage.toUpperCase()}: ${FUNNEL_CONTEXT[funnelStage].goal}

Genera copies que realmente VENDAN siguiendo la metodología 1PMP completa.`
          },
        ],
        temperature: 0.85,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limits exceeded. Please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: 'Payment required. Please add credits to your workspace.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      throw new Error('AI Gateway error');
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    // Parse the JSON response
    let parsedContent;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedContent = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Parse error:', parseError);
      console.log('Raw content:', content);
      throw new Error('Failed to parse AI response');
    }

    console.log('Successfully generated copy with Sabri methodology');

    return new Response(JSON.stringify(parsedContent), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-meta-copy:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
