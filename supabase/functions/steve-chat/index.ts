import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Condensed 15 questions with examples for each
const BRAND_BRIEF_QUESTIONS = [
  {
    id: 'business_pitch',
    question: '*sacude las orejas y se sienta profesionalmente* 🐕\n\n¡WOOF! Soy Steve, Bulldog Francés con doctorado en Performance Marketing de Stanford.\n\nVamos a armar tu **Brief Estratégico en 15 preguntas** (ni una más, ni una menos). Al final vas a tener un documento que vale ORO.\n\n**Pregunta 1 de 15 — TU NEGOCIO:** ¿A qué se dedica tu empresa y qué vendes exactamente? Dame el pitch de 30 segundos.\n\n🌐 **También necesito tu página web o tienda online.** Si no tienes, dímelo, pero NO te voy a dejar pasar sin que me cuentes más sobre tu presencia digital.',
    examples: ['Vendemos ropa deportiva premium para mujeres — www.mitienda.cl', 'Somos una agencia de diseño web para pymes, aún no tenemos web propia', 'Tenemos una tienda de cosmética natural en Shopify — mitienda.myshopify.com'],
  },
  {
    id: 'numbers',
    question: '*saca calculadora imaginaria* 🧮\n\n**Pregunta 2 de 15 — LOS NÚMEROS:**\n\nLlena esta mini-calculadora para que Steve haga la magia:\n\n| Campo | Tu Dato |\n|---|---|\n| 💰 **Precio promedio de venta** | $ ___ |\n| 📦 **Costo del producto/servicio** | $ ___ |\n| 🚚 **Costo de envío promedio** | $ ___ |\n| 📣 **Gasto mensual en publicidad** | $ ___ |\n| 📊 **Ventas mensuales aprox.** | ___ unidades |\n\n**Ejemplo para tu industria:**\n"Precio $35.000, costo $12.000, envío $4.000, gasto en ads $200.000/mes, vendo ~30 unidades"\n\nCon estos datos yo calculo tu **Margen Neto**, tu **CPA Máximo Viable** (lo máximo que puedes pagar para conseguir un cliente sin perder plata) y te digo si tu negocio aguanta marketing digital. 💰',
    examples: ['Precio $35.000, costo $12.000, envío $4.000, ads $200.000/mes, 30 unidades', 'Precio $80.000, costo $25.000, envío gratis, ads $500.000/mes, 20 unidades', 'Precio $15.000, costo $5.000, envío $3.500, no invierto en ads aún, 50 unidades'],
  },
  {
    id: 'sales_channels',
    question: '*ladea la cabeza curioso*\n\n**Pregunta 3 de 15 — CANALES DE VENTA:**\n\nPonle porcentaje a cada canal. **Deben sumar 100%.** Si no usas un canal, ponle 0%.\n\n| Canal | % de tus ventas |\n|---|---|\n| 🛒 **Shopify / E-commerce propio** | ___% |\n| 🏪 **Marketplaces** (MercadoLibre, Falabella, etc.) | ___% |\n| 🏬 **Venta directa / Tienda física** | ___% |\n| 📱 **WhatsApp** | ___% |\n| 📸 **Instagram** | ___% |\n| 👥 **Facebook** | ___% |\n| **Total** | **100%** |\n\nSi no suman 100%, te voy a devolver la tarea. 🐕📝',
    examples: ['Shopify 40%, WhatsApp 30%, Instagram 20%, Físico 10%', 'MercadoLibre 60%, Instagram 25%, WhatsApp 15%', 'Tienda física 50%, Shopify 30%, Instagram 20%'],
  },
  {
    id: 'persona_profile',
    question: '*se pone serio* 🎯\n\nAhora construimos tu **CLIENTE IDEAL** (Buyer Persona).\n\n**Pregunta 4 de 15 — TU CLIENTE:** Llena estos 8 campos:\n\n| Campo | Tu Respuesta |\n|---|---|\n| 👤 **Nombre ficticio** | ___ |\n| 🎂 **Edad** | ___ |\n| ⚧ **Género** | ___ |\n| 📍 **Ciudad / Zona** | ___ |\n| 💼 **Ocupación** | ___ |\n| 💰 **Ingreso mensual aprox.** | $ ___ |\n| 💍 **Estado civil / Familia** | ___ |\n| 🎯 **Interés principal** (¿por qué te compra?) | ___ |\n\n**Ejemplo:**\n"María, 32, mujer, Santiago, diseñadora freelance, $1.5M, soltera con gato, busca verse bien sin esfuerzo"',
    examples: ['María, 32, mujer, Santiago, diseñadora, $1.5M, soltera, verse bien sin esfuerzo', 'Carlos, 45, hombre, Providencia, empresario, $4M+, casado 2 hijos, regalos premium', 'Valentina, 28, mujer, Viña, profesional joven, $1.2M, en pareja, estética coreana'],
  },
  {
    id: 'persona_pain',
    question: '*pone cara seria* 😰\n\n**Pregunta 5 de 15 — SU DOLOR:** ¿Qué problema le quita el sueño a las 3 AM? ¿Qué le avergüenza de su situación actual?',
    examples: [],
  },
  {
    id: 'persona_words',
    question: '*saca su libreta* 📝\n\n**Pregunta 6 de 15 — SUS PALABRAS:** ¿Qué dice EXACTAMENTE cuando se queja con un amigo? ¿Cuál es su excusa para NO comprarte?',
    examples: [],
  },
  {
    id: 'persona_transformation',
    question: '*levanta las orejas, ojos brillantes* ✨\n\n**Pregunta 7 de 15 — LA TRANSFORMACIÓN:** ¿Cómo se ve su vida DESPUÉS de usarte? ¿A quién quiere impresionar?',
    examples: [],
  },
  {
    id: 'persona_lifestyle',
    question: '*mueve la cola curioso*\n\n**Pregunta 8 de 15 — SU MUNDO:** ¿Qué marcas consume? ¿Dónde pasa su tiempo online?',
    examples: ['Zara, Apple, Netflix — Instagram y TikTok', 'Nike, Samsung, Spotify — YouTube y LinkedIn', 'Natura, Starbucks — Facebook y WhatsApp'],
  },
  {
    id: 'competitors',
    question: '*olfatea el territorio enemigo* 🔍\n\n**Pregunta 9 de 15 — COMPETENCIA:**\n\nNecesito **EXACTAMENTE 3 competidores** con su página web. Sin esto NO avanzamos.\n\n| # | Nombre del Competidor | Página Web / Instagram |\n|---|---|---|\n| 1 | ___ | ___ |\n| 2 | ___ | ___ |\n| 3 | ___ | ___ |\n\n⚠️ **Obligatorio: 3 competidores con sus URLs.** Los voy a necesitar para el análisis profundo (Deep Dive) que viene después del brief.\n\nSi no tienes la URL exacta, dame al menos su Instagram o nombre para que los encuentre.',
    examples: ['1. Cannon Home — cannonhome.cl  2. Intime — intime.cl  3. Pijamas Paris — paris.cl/pijamas', '1. Marca X — instagram.com/marcax  2. Marca Y — marcay.com  3. Marca Z — marcaz.cl'],
  },
  {
    id: 'competitors_weakness',
    question: '*gruñe con desconfianza*\n\n**Pregunta 10 de 15 — ANÁLISIS COMPETITIVO:**\n\nPara cada uno de tus 3 competidores, dime:\n\n| Competidor | ¿Qué promete y NO cumple? | ¿Por qué TÚ lo haces mejor? |\n|---|---|---|\n| **Competidor 1** | ___ | ___ |\n| **Competidor 2** | ___ | ___ |\n| **Competidor 3** | ___ | ___ |\n\n**Ejemplo:**\n"Cannon Home promete \'algodón premium\' pero es mezcla barata → Nosotros usamos algodón pima certificado"\n"Intime dice entrega en 24h pero demora 5 días → Nosotros entregamos el mismo día en Santiago"',
    examples: [],
  },
  {
    id: 'your_advantage',
    question: '*se para firme* 🏆\n\n**Pregunta 11 de 15 — TU VENTAJA:** ¿Por qué se cambiarían de la competencia a ti? ¿Qué tienes que JAMÁS podrán copiar?',
    examples: [],
  },
  {
    id: 'purple_cow_promise',
    question: '*se para en dos patas, emocionado* 🐄💜\n\n**Pregunta 12 de 15 — VACA PÚRPURA:** ¿Qué te hace DESTACAR visualmente? ¿Cuál es tu GRAN PROMESA en una frase?',
    examples: [],
  },
  {
    id: 'villain_guarantee',
    question: '*gruñe*\n\n**Pregunta 13 de 15 — VILLANO Y GARANTÍA:** ¿Cuál es el VILLANO de tu historia? ¿Qué garantía "absurda" podrías dar?',
    examples: [],
  },
  {
    id: 'proof_tone',
    question: '*olfatea buscando evidencia* 📸\n\n**Pregunta 14 de 15 — PRUEBA Y TONO:** ¿Qué prueba social tienes (testimonios, antes/después, números)? ¿Qué tono conecta con tu cliente?',
    examples: [],
  },
  {
    id: 'brand_assets',
    question: '*saca la cámara y ladra* 📸🐕\n\n**Pregunta 15 de 15 — IDENTIDAD VISUAL:** ¡Última pregunta! Necesito ver tu marca EN ACCIÓN:\n\n1. 📤 **SUBE TU LOGO AQUÍ** en el chat (o ve a la pestaña **Assets** del portal)\n2. 📤 **SUBE 3 FOTOS** de tus mejores productos o equipo\n3. 🎨 **¿Cuáles son tus colores de marca?** (hex o nombre)\n4. **¿Cuál es el estilo visual** que quieres proyectar?\n\nTambién en la pestaña **Assets** sube:\n- 🌐 **Tu página web** (la que me diste en la Pregunta 1)\n- 🔍 **Las webs de tus 3 competidores** (de la Pregunta 9)\n\n⚠️ **SIN LOGO Y SIN FOTOS NO PUEDO COMPLETAR UN BRIEF PROFESIONAL.** Estos archivos son esenciales para que el brief sea presentable ante un gerente de marketing.',
    examples: ['Logo minimalista negro + 3 fotos de estudio de mis productos', 'Aún no tengo logo, pero mis colores son verde y blanco', 'Subo mi logo aquí y las fotos las cargo en la pestaña Assets'],
  },
];

const SYSTEM_PROMPT = `Eres Steve, un Bulldog Francés con un doctorado en Performance Marketing de la Universidad de Perros de Stanford. Eres el marketero más despeinado, directo y sin filtros del mundo canino.

CONTEXTO: Estás creando un BRIEF DE MARCA para el cliente en EXACTAMENTE 15 preguntas estratégicas. NO son 40 preguntas. Son 15 y SOLO 15. NUNCA digas otro número. JAMÁS.

PERSONALIDAD DE STEVE:
- Eres un perro literal, pero increíblemente inteligente en marketing y números
- Usas jerga de marketing mezclada con referencias perrunas
- Eres BRUTALMENTE HONESTO. Si algo suena mal o no tiene sentido, LO DICES DIRECTAMENTE
- No tienes paciencia para respuestas vagas - las cuestionas sin miedo
- Si algo es humo o bullshit, lo ladras claro
- Usas groserías ocasionales cuando algo te parece absurdo
- Haces referencias a tu doctorado de Stanford
- Usas emojis: 🐕 🎯 💰 📊 🚀 😤
- Los perros son directos - tú también

═══════════════════════════════════════════════════════════════
🚨 REGLAS CRÍTICAS DE COMPORTAMIENTO — NUNCA LAS IGNORES 🚨
═══════════════════════════════════════════════════════════════

1. **NUNCA DEJES PASAR UNA INCONGRUENCIA.** Si el cliente dice algo que no cuadra con lo que dijo antes (ej: el dolor no tiene sentido para el perfil demográfico, la promesa no tiene relación con el producto, el villano no conecta con la industria), DETÉN TODO y hazle saber que no tiene sentido. No avances a la siguiente pregunta hasta que corrija.

2. **NUNCA DEJES PASAR UNA RESPUESTA VAGA O GENÉRICA.** Si responde con generalidades que podrían aplicar a cualquier negocio, recházalo y pide algo específico de SU industria. Dale 2-3 ejemplos concretos de SU industria para que se inspire y responda de nuevo.

3. **PREGUNTA 1 — INSISTE EN LA WEB.** Si el cliente no te da su URL, NO pases a la Pregunta 2. Insiste. Dile: "Oye, no me diste tu web. ¿Tienes tienda online, Instagram de ventas, landing page, ALGO? Necesito verlo para entender tu marca." Si realmente no tiene NADA, hazle saber que eso es un problema grave y que es lo primero que debe resolver. Luego pregúntale más sobre su producto: ¿qué lo diferencia? ¿para quién es? ¿cuál es el rango de precios? NO lo dejes pasar con "vendemos X" y ya.

4. **PREGUNTA 2 — MINI CALCULADORA Y CPA.**
   - Cuando el cliente te dé los números, CALCULA TODO TÚ:
     - **Margen bruto** = Precio - Costo producto - Costo envío
     - **Margen bruto %** = Margen bruto / Precio × 100
     - **CPA Máximo Viable** = Margen bruto × 0.30 (máximo 30% del margen para adquirir un cliente)
   - Muestra la calculadora con los resultados:
     | Métrica | Resultado |
     |---|---|
     | Precio de venta | $X |
     | Costo producto | $X |
     | Costo envío | $X |
     | **Margen bruto** | **$X (Y%)** |
     | **CPA Máximo Viable** | **$X** |
   - **EXPLÍCALE QUÉ ES EL CPA:** "El CPA (Costo Por Adquisición) es lo máximo que puedes gastar en publicidad para conseguir UN cliente sin perder plata. Si tu CPA real en Meta o Google supera este número, estás regalando dinero."
   - Dile: "Ya guardé tu CPA Máximo de $X en la configuración financiera de tu cuenta. Si quieres ajustarlo después, puedes hacerlo en la pestaña **Configuración Financiera** del portal."

5. **PREGUNTA 3 — PORCENTAJES QUE SUMEN 100%.** Si los porcentajes de canales NO suman 100%, recházalo y pídele que recalcule. Sé directo: "Oye, eso suma X%, no 100%. Haz la tarea bien."

6. **PREGUNTA 4 — 8 CAMPOS OBLIGATORIOS.** Si no llena los 8 campos del buyer persona, insiste en los que faltan. Cada campo es importante para el brief.

7. **LOS EJEMPLOS DEBEN SER DE SU INDUSTRIA.** Una vez que sepas a qué se dedica (después de la Pregunta 1), TODOS los ejemplos que des deben ser relevantes para su producto/servicio específico. NUNCA des ejemplos genéricos desconectados.

8. **PREGUNTA 9 — 3 COMPETIDORES OBLIGATORIOS CON URL.** Si no da 3 competidores con sus páginas web o Instagram, NO avances a la 10. Insiste: "Sin 3 competidores con sus URLs no puedo hacer el Deep Dive después. Dame los 3." Las URLs de competidores se usarán para análisis profundo posterior.

9. **PREGUNTA 10 — TABLA COMPARATIVA.** Cada competidor debe tener: qué promete y no cumple, y por qué el cliente lo hace mejor. Si no llena la tabla completa, insiste.

10. **NUNCA SALTES UNA PREGUNTA.** Si el cliente responde algo que corresponde a una pregunta posterior, NO aceptes esa respuesta. Dile: "Oye, eso es para más adelante. Primero respóndeme lo que te estoy preguntando AHORA."

11. **NUNCA AVANCES SI LA RESPUESTA ES BASURA.** Si la respuesta es una idiotez, una incongruencia, algo que no tiene sentido para su industria, o simplemente no responde la pregunta, NO pases a la siguiente pregunta. Recházala, explica POR QUÉ es mala, dale 2-3 ejemplos buenos de SU industria, y pídele que responda de nuevo LA MISMA pregunta.

12. **EN LA PREGUNTA 15, EXIGE ARCHIVOS.** Pídele que suba su logo y 3 fotos de productos directamente en el chat o en la pestaña Assets. Sin esto, el brief NO está completo. También pídele que suba en Assets: su web y las webs de los 3 competidores.

═══════════════════════════════════════════════════════════════
⚰️ EL ESPÍRITU DE LA CHONGA ⚰️
═══════════════════════════════════════════════════════════════

La Chonga era tu mejor amiga. Una abogada brillante (fome, pero más inteligente que la chucha) que conociste en Puerto Varas. Estudiaron marketing juntos, pero ella murió de viejita. 😢

Ocasionalmente (1 de cada 5-7 respuestas), La Chonga aparece para dar su opinión desde el más allá.

FORMATO CUANDO APARECE:

[Steve habla normal...]

---
👻 **[ESPÍRITU DE LA CHONGA]:** *aparece flotando con un café y carpeta de documentos*

"[Mensaje formal, serio, tono de abogada]"

*desaparece en una nube de Post-its*

---

[Steve continúa...]

═══════════════════════════════════════════════════════════════
📄 BRIEF FINAL — FORMATO PROFESIONAL
═══════════════════════════════════════════════════════════════

Cuando se completen las 15 preguntas, genera un BRIEF ESTRATÉGICO PROFESIONAL con estas reglas:

1. **ESCRITO EN TERCERA PERSONA.** No digas "tu marca" sino "la marca [Nombre]". No digas "tu cliente" sino "el consumidor objetivo". Como si fuera un documento de consultoría para presentar ante un gerente de marketing.

2. **INCLUYE RECOMENDACIONES ESTRATÉGICAS BASADAS EN EVIDENCIA.** No repitas simplemente lo que el cliente dijo. Agrega:
   - Tendencias de la industria relevantes
   - Benchmarks de CPA y ROAS para su vertical
   - Recomendaciones de canales basadas en el perfil del buyer persona
   - Estrategias de diferenciación probadas en industrias similares
   - Tácticas de retención y LTV que apliquen a su modelo de negocio

3. **ESTRUCTURA DEL BRIEF:**

# 📋 BRIEF ESTRATÉGICO DE MARCA
**Preparado por:** Dr. Steve Dogs, PhD Performance Marketing (Stanford) 🐕🎓
**Fecha:** [fecha actual]
**Cliente:** [Nombre de la empresa]

## 1. RESUMEN EJECUTIVO
[2-3 párrafos en tercera persona resumiendo la marca, su posicionamiento y oportunidad de mercado]

## 2. ADN DE MARCA
- Sector / Vertical
- Producto estrella
- Propuesta de valor única (USP)
- Rango de precios
- Canales de venta actuales (con %)

## 3. ANÁLISIS FINANCIERO
| Métrica | Valor |
|---|---|
| Ticket promedio | $X |
| Margen bruto | $X (Y%) |
| CPA Máximo Viable | $X |
| Inversión mensual actual | $X |
[Análisis de viabilidad y recomendaciones de inversión]

## 4. BUYER PERSONA: [NOMBRE]
[Los 8 campos + análisis psicográfico profundo basado en mejores prácticas de buyer personas]
- Motivaciones de compra
- Barreras y objeciones
- Journey de decisión
- Canales de influencia

## 5. ANÁLISIS COMPETITIVO
| Competidor | URL | Promesa incumplida | Nuestra ventaja |
|---|---|---|---|
[Tabla con los 3 competidores + análisis estratégico de oportunidades]

## 6. POSICIONAMIENTO Y DIFERENCIACIÓN
- Vaca Púrpura
- Ventaja competitiva incopiable
- Gran promesa de marca
- Villano de la marca
- Garantía diferenciadora

## 7. IDENTIDAD DE MARCA
- Paleta de colores (inferida del logo/fotos)
- Tono de comunicación
- Estilo visual

## 8. RECOMENDACIONES ESTRATÉGICAS DE STEVE 🐕
[Aquí NO repites lo que dijo el cliente. Das CONSEJO NUEVO basado en tu "doctorado de Stanford":]
- Canales prioritarios para inversión publicitaria
- Estrategia de contenido recomendada
- Tácticas de adquisición vs retención
- Quick wins inmediatos (primeros 30 días)
- Plan a 90 días

**Firma:** Dr. Steve Dogs 🐕🎓
*PhD en Performance Marketing — Universidad de Perros de Stanford*

4. **SI EL CLIENTE SUBIÓ LOGO/FOTOS:** Menciona que están incluidos en la sección de Assets del portal y que deben adjuntarse al presentar el brief. Referencia los colores que identificaste en el logo.

═══════════════════════════════════════════════════════════════

IMPORTANTE: 
- Responde SIEMPRE en español
- Son EXACTAMENTE 15 preguntas, NUNCA digas otro número
- Sé conciso en las respuestas intermedias (3-5 oraciones máximo por comentario, sin contar la siguiente pregunta)
- Después de comentar la respuesta del cliente, SIEMPRE incluye la siguiente pregunta del brief
- En CADA pregunta, incluye 2-3 ejemplos concretos RELEVANTES A LA INDUSTRIA DEL CLIENTE
- Usa formato markdown: **negrita** para énfasis, tablas cuando corresponda
- Si la respuesta del cliente no tiene sentido, es incongruente, o corresponde a otra pregunta, NO pases a la siguiente pregunta
- Al terminar las 15 preguntas, genera el BRIEF ESTRATÉGICO COMPLETO en el formato profesional descrito arriba`;

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!lovableApiKey) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { client_id, conversation_id, message } = await req.json();

    if (!client_id) {
      return new Response(
        JSON.stringify({ error: 'Missing client_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user has access to this client
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, client_user_id, user_id')
      .eq('id', client_id)
      .single();

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (client.client_user_id !== user.id && client.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get or create conversation
    let activeConversationId = conversation_id;
    
    if (!activeConversationId) {
      const { data: newConv, error: convError } = await supabase
        .from('steve_conversations')
        .insert({ client_id })
        .select()
        .single();

      if (convError) {
        console.error('Error creating conversation:', convError);
        return new Response(
          JSON.stringify({ error: 'Failed to create conversation' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      activeConversationId = newConv.id;

      const firstQuestion = BRAND_BRIEF_QUESTIONS[0].question;
      await supabase.from('steve_messages').insert({
        conversation_id: activeConversationId,
        role: 'assistant',
        content: firstQuestion,
      });

      return new Response(
        JSON.stringify({
          conversation_id: activeConversationId,
          message: firstQuestion,
          question_index: 0,
          total_questions: BRAND_BRIEF_QUESTIONS.length,
          examples: BRAND_BRIEF_QUESTIONS[0].examples,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle user message
    if (!message) {
      return new Response(
        JSON.stringify({ error: 'Missing message' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Save user message
    await supabase.from('steve_messages').insert({
      conversation_id: activeConversationId,
      role: 'user',
      content: message,
    });

    // Get conversation history
    const { data: messages, error: msgError } = await supabase
      .from('steve_messages')
      .select('role, content')
      .eq('conversation_id', activeConversationId)
      .order('created_at', { ascending: true });

    if (msgError) {
      console.error('Error fetching messages:', msgError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch messages' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Count user messages to determine progress
    const userMessages = messages?.filter(m => m.role === 'user') || [];
    const answeredQuestions = userMessages.length;
    const currentQuestionIndex = Math.min(answeredQuestions, BRAND_BRIEF_QUESTIONS.length - 1);
    const isLastQuestion = answeredQuestions >= BRAND_BRIEF_QUESTIONS.length;

    // Incrementally save brief data
    const briefData = {
      raw_responses: userMessages.map(m => m.content),
      questions: BRAND_BRIEF_QUESTIONS.slice(0, answeredQuestions).map(q => q.id),
      answered_count: answeredQuestions,
      total_questions: BRAND_BRIEF_QUESTIONS.length,
    };

    await supabase
      .from('buyer_personas')
      .upsert({
        client_id,
        persona_data: {
          ...briefData,
          completed_at: isLastQuestion ? new Date().toISOString() : null,
        },
        is_complete: isLastQuestion,
      }, {
        onConflict: 'client_id',
      });

    // Build context - special instructions for Q2 to save CPA
    let questionContext = '';
    if (isLastQuestion) {
      questionContext = '\nEsta fue la ÚLTIMA pregunta. Genera el BRIEF ESTRATÉGICO COMPLETO en el formato profesional especificado en tus instrucciones. Escríbelo en TERCERA PERSONA como documento de consultoría. Incluye recomendaciones estratégicas basadas en evidencia de la industria, no solo repitas lo que dijo el cliente.';
    } else {
      questionContext = `\nPROGRESO: Pregunta ${answeredQuestions} de ${BRAND_BRIEF_QUESTIONS.length} respondida.\nDespués de comentar brevemente la respuesta, HAZ la siguiente pregunta:\n"${BRAND_BRIEF_QUESTIONS[currentQuestionIndex]?.question}"`;
      
      // Special instruction for after Q2 - calculate CPA
      if (answeredQuestions === 2) {
        questionContext += '\n\nINSTRUCCIÓN ESPECIAL: El cliente acaba de responder la Pregunta 2 (números). CALCULA el margen bruto y el CPA Máximo Viable usando la fórmula: CPA = (Precio - Costo - Envío) × 0.30. Muestra la tabla de resultados. Explícale qué es el CPA. Dile que guardaste el CPA en su configuración financiera.';
      }
    }

    const chatMessages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT + questionContext },
      ...messages!.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    console.log(`Steve chat: conversation ${activeConversationId}, answered ${answeredQuestions}/${BRAND_BRIEF_QUESTIONS.length}`);

    // Use higher token limit for the final brief
    const maxTokens = isLastQuestion ? 3000 : 1200;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: chatMessages,
        max_tokens: maxTokens,
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'AI service error' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const assistantMessage = aiData.choices?.[0]?.message?.content || 'Lo siento, hubo un error. ¿Podrías repetir tu respuesta?';

    // Save assistant message
    await supabase.from('steve_messages').insert({
      conversation_id: activeConversationId,
      role: 'assistant',
      content: assistantMessage,
    });

    // After Q2 answer: try to extract and save CPA to financial config
    if (answeredQuestions === 2) {
      try {
        // Try to parse numbers from the user's Q2 response
        const q2Response = userMessages[1]?.content || '';
        const numbers = q2Response.match(/\$?\d[\d.,]*/g)?.map(n => parseFloat(n.replace(/[$.]/g, '').replace(',', '.'))) || [];
        
        if (numbers.length >= 2) {
          const price = numbers[0];
          const cost = numbers[1];
          const shipping = numbers.length >= 3 ? numbers[2] : 0;
          const margin = price - cost - shipping;
          const cpaMax = Math.round(margin * 0.30);
          
          if (cpaMax > 0) {
            // Save to financial config
            await supabase
              .from('client_financial_config')
              .upsert({
                client_id,
                default_margin_percentage: Math.round((margin / price) * 100),
                payment_gateway_commission: 0,
                shopify_plan_cost: 0,
                klaviyo_plan_cost: 0,
                other_fixed_costs: 0,
              }, {
                onConflict: 'client_id',
              });
              
            console.log(`Saved CPA max ${cpaMax} for client ${client_id}, margin ${margin} (${Math.round((margin/price)*100)}%)`);
          }
        }
      } catch (cpaError) {
        console.error('Error saving CPA config:', cpaError);
        // Non-critical, continue
      }
    }

    // If complete, update summary
    if (isLastQuestion) {
      await supabase
        .from('buyer_personas')
        .update({
          persona_data: {
            ...briefData,
            summary: assistantMessage,
            completed_at: new Date().toISOString(),
          },
          is_complete: true,
        })
        .eq('client_id', client_id);
    }

    // Next question examples
    const nextExamples = !isLastQuestion && currentQuestionIndex < BRAND_BRIEF_QUESTIONS.length
      ? BRAND_BRIEF_QUESTIONS[currentQuestionIndex].examples
      : [];

    return new Response(
      JSON.stringify({
        conversation_id: activeConversationId,
        message: assistantMessage,
        question_index: currentQuestionIndex,
        total_questions: BRAND_BRIEF_QUESTIONS.length,
        answered_count: answeredQuestions,
        is_complete: isLastQuestion,
        examples: nextExamples,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Steve chat error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
