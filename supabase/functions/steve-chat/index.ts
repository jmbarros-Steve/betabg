import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Fixed questions Steve asks to build the complete brand brief
const BRAND_BRIEF_QUESTIONS = [
  // ═══════════════════════════════════════════════════════════════
  // PARTE 1: CONOCIENDO EL NEGOCIO (6 preguntas)
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'business_type',
    question: '*sacude las orejas y se sienta profesionalmente* 🐕\n\n¡WOOF! Soy Steve, Bulldog Francés con doctorado en Performance Marketing de la Universidad de Perros de Stanford.\n\nAntes de hacer cualquier anuncio, necesito entender tu negocio a fondo. Vamos a armar tu Brief Estratégico completo.\n\n**Pregunta 1 de 28 - EL NEGOCIO:** ¿A qué se dedica tu empresa? ¿Qué vendes exactamente? Dame el pitch de 30 segundos.',
  },
  {
    id: 'average_ticket',
    question: '*saca una calculadora imaginaria* 🧮\n\n**Pregunta 2 de 28 - TICKET:** ¿Cuál es tu ticket promedio? Es decir, ¿cuánto gasta en promedio cada cliente por compra?\n\nDame el número real, no el que quisieras.',
  },
  {
    id: 'margins',
    question: '*baja la voz como si fuera secreto*\n\n**Pregunta 3 de 28 - MÁRGENES:** ¿Cuáles son tus márgenes? ¿Qué porcentaje te queda después de costos?\n\nEsto es CLAVE para saber cuánto podemos gastar en ads. 💰',
  },
  {
    id: 'shipping_cost',
    question: '*mueve la colita*\n\n**Pregunta 4 de 28 - ENVÍO:** ¿Cuánto te cuesta el despacho/envío en promedio?\n\n¿Lo cobras aparte? ¿Lo incluyes? ¿Cuánto te come del margen? 📦',
  },
  {
    id: 'fixed_costs',
    question: '*estira las patitas*\n\n**Pregunta 5 de 28 - COSTOS FIJOS:** ¿Cuáles son tus gastos fijos mensuales principales?\n\nArriendo, sueldos, servicios, lo que sea. Necesito entender tu estructura de costos. 🏢',
  },
  {
    id: 'sales_channels',
    question: '*ladea la cabeza curioso*\n\n**Pregunta 6 de 28 - CANALES:** ¿Dónde vendes actualmente? ¿Tienda física, ecommerce, marketplace, redes sociales, todo junto?\n\nDame los canales reales donde cierras ventas. 🏪',
  },

  // ═══════════════════════════════════════════════════════════════
  // PARTE 2: BUYER PERSONA - EL CLIENTE SOÑADO (10 preguntas)
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'persona_name',
    question: '*se pone serio, entramos al Buyer Persona* 🎯\n\nAhora vamos a construir tu CLIENTE SOÑADO. Le vamos a poner nombre y todo.\n\n**Pregunta 7 de 28 - NOMBRE:** ¿Cómo se llamaría tu cliente ideal? Dame un nombre real, como "María la Emprendedora" o "Juan el Ejecutivo".\n\nEsto nos ayuda a humanizarlo y hablarle directo.',
  },
  {
    id: 'persona_age',
    question: '*olfatea el aire*\n\n**Pregunta 8 de 28 - EDAD:** ¿Qué edad tiene tu cliente ideal? Dame un rango realista.\n\n¿25-35 años? ¿40-55? ¿18-25? Sé específico. 🎂',
  },
  {
    id: 'persona_gender',
    question: '*ladea la cabeza*\n\n**Pregunta 9 de 28 - GÉNERO:** ¿Tu cliente ideal es mayoritariamente hombre, mujer, o es parejo?\n\nDame el porcentaje si puedes. Ejemplo: "70% mujeres, 30% hombres". 👫',
  },
  {
    id: 'persona_location',
    question: '*mueve las orejas*\n\n**Pregunta 10 de 28 - UBICACIÓN:** ¿Dónde vive tu cliente ideal? ¿Ciudad específica? ¿País? ¿Región?\n\n¿Es urbano o rural? ¿Zona específica de la ciudad? 🌍',
  },
  {
    id: 'persona_education',
    question: '*se rasca pensativo*\n\n**Pregunta 11 de 28 - EDUCACIÓN:** ¿Qué nivel educacional tiene tu cliente ideal?\n\n¿Universitario? ¿Técnico? ¿Postgrado? ¿Autodidacta? Esto afecta cómo le hablamos. 🎓',
  },
  {
    id: 'persona_income',
    question: '*saca su libreta imaginaria*\n\n**Pregunta 12 de 28 - INGRESOS:** ¿Cuál es el nivel socioeconómico de tu cliente? ¿Qué ingresos aproximados tiene?\n\nNo necesito el número exacto, pero sí el rango. ¿ABC1? ¿C2? ¿Clase media? 💵',
  },
  {
    id: 'persona_channels',
    question: '*mueve la cola curioso*\n\n**Pregunta 13 de 28 - CANALES DEL CLIENTE:** ¿Qué canales crees que USA tu cliente ideal?\n\n¿Instagram? ¿TikTok? ¿Facebook? ¿LinkedIn? ¿YouTube? ¿Email? ¿WhatsApp?\n\n¿Dónde pasa su tiempo online? 📱',
  },
  {
    id: 'persona_pain',
    question: '*pone cara seria de doctor Stanford* 🎓\n\n**Pregunta 14 de 28 - DOLOR:** ¿Qué dolor específico tiene tu cliente que TÚ resuelves?\n\nNo me digas "ayudamos a la gente"... eso es humo. ¿Qué lo mantiene despierto en la noche? ¿Qué problema REAL tiene?',
  },
  {
    id: 'persona_desires',
    question: '*levanta las orejas*\n\n**Pregunta 15 de 28 - DESEOS:** ¿Qué SUEÑA tu cliente ideal? ¿Cuál es su estado deseado?\n\n¿Qué quiere lograr? ¿Cómo se ve su vida ideal después de comprarte? ✨',
  },
  {
    id: 'persona_fears',
    question: '*baja la voz*\n\n**Pregunta 16 de 28 - MIEDOS:** ¿Cuáles son los MIEDOS de tu cliente?\n\n¿Qué le da miedo? ¿Qué le preocupa? ¿Qué objeciones tiene antes de comprarte? 😰',
  },

  // ═══════════════════════════════════════════════════════════════
  // PARTE 3: ANÁLISIS COMPETITIVO Y OCÉANO AZUL (5 preguntas)
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'why_buy_from_you',
    question: '*se para en dos patas, esto es importante* 🏆\n\nAhora entramos al ANÁLISIS COMPETITIVO. Esto define tu éxito.\n\n**Pregunta 17 de 28 - ¿POR QUÉ TÚ?:** ¿Por qué tus clientes te compran A TI y no a la competencia?\n\nPregúntales si es necesario. ¿Qué dicen ellos? Dame la razón REAL, no la que tú crees.',
  },
  {
    id: 'competitors',
    question: '*olfatea el territorio enemigo*\n\n**Pregunta 18 de 28 - COMPETENCIA:** ¿Quiénes son tus 3 principales competidores?\n\nNombres específicos. ¿Qué hacen bien ellos? ¿Qué hacen mal? 🔍',
  },
  {
    id: 'differentiator',
    question: '*ladra con autoridad*\n\n**Pregunta 19 de 28 - ATRIBUTO DIFERENCIADOR:** ¿Cuál es tu ATRIBUTO ÚNICO que nadie más tiene?\n\nNo me digas "calidad y servicio" porque eso lo dice todo el mundo. ¿Qué te hace IMPOSIBLE de copiar? 💎',
  },
  {
    id: 'blue_ocean',
    question: '*se sienta como profesor de Stanford*\n\n**Pregunta 20 de 28 - OCÉANO AZUL:** ¿Cuál es tu OCÉANO AZUL?\n\nEs decir, ¿hay algún espacio de mercado donde NO tengas competencia directa? ¿Algún nicho o segmento donde seas el único? 🌊',
  },
  {
    id: 'better_than_competition',
    question: '*saca su cuaderno de notas*\n\n**Pregunta 21 de 28 - MEJOR QUE ELLOS:** ¿En qué aspectos específicos eres MEJOR que tu competencia?\n\nDame 3-5 cosas concretas. Precio, velocidad, servicio, garantía, experiencia, etc. 📝',
  },

  // ═══════════════════════════════════════════════════════════════
  // PARTE 4: ESTRATEGIA DE COMUNICACIÓN (3 preguntas)
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'communication_tone',
    question: '*se aclara la garganta* 🎤\n\nAhora definamos tu ESTRATEGIA DE COMUNICACIÓN.\n\n**Pregunta 22 de 28 - TONO:** ¿Qué tono usa tu marca para comunicarse?\n\n¿Agresivo y directo? ¿Tranquilo y cercano? ¿Formal y profesional? ¿Chistoso y relajado? ¿Premium y elegante?\n\nDame ejemplos de cómo hablas.',
  },
  {
    id: 'communication_style',
    question: '*mueve las orejas*\n\n**Pregunta 23 de 28 - ESTILO:** ¿Cómo quieres que tu cliente SE SIENTA cuando interactúa con tu marca?\n\n¿Como un amigo? ¿Como un experto? ¿Como un mentor? ¿Como un compañero de aventuras? 🤝',
  },
  {
    id: 'supporting_data',
    question: '*olfatea el aire buscando data*\n\n**Pregunta 24 de 28 - PRUEBA SOCIAL:** ¿Tienes DATA que respalde tu propuesta?\n\nTestimonios, casos de éxito, números, estadísticas, premios, certificaciones... ¿Qué pruebas tienes de que funciona lo que vendes? 📊',
  },

  // ═══════════════════════════════════════════════════════════════
  // PARTE 5: LA OFERTA PERFECTA - SABRI SUBY (4 preguntas clave)
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'perceived_value',
    question: '*se pone lentes imaginarios de profesor* 🎓\n\nFinalmente, LA OFERTA PERFECTA según la metodología del Padrino.\n\n**Pregunta 25 de 28 - VALOR PERCIBIDO:** ¿Cómo haces que tu cliente sienta que recibe MÁS de lo que paga?\n\n¿Tienes combos, paquetes, extras incluidos? ¿Cómo presentas el valor total vs. el precio? 💎',
  },
  {
    id: 'guarantee',
    question: '*ladra con autoridad*\n\n**Pregunta 26 de 28 - GARANTÍA:** ¿Qué garantía ofreces? ¿Devolución de dinero? ¿Garantía de resultados? ¿Cuánto tiempo?\n\nSi no tienes garantía... ¿por qué el cliente debería confiar en ti? Una garantía sólida elimina el miedo. 🛡️',
  },
  {
    id: 'scarcity_urgency',
    question: '*mira el reloj imaginario en su pata*\n\n**Pregunta 27 de 28 - ESCASEZ/URGENCIA:** ¿Usas alguna estrategia de escasez o urgencia?\n\n¿Cupos limitados? ¿Ofertas por tiempo limitado? ¿Descuentos de fin de mes? ¿Stock reducido? ⏰',
  },
  {
    id: 'clear_results',
    question: '*se sienta solemne, última pregunta* 🏁\n\n**Pregunta 28 de 28 - RESULTADOS CLAROS:** ¿Qué resultados específicos y medibles prometes?\n\nNo me digas "mejorar tu vida"... dame números. "30% más ventas en 3 meses", "5 kilos menos en 6 semanas", "ahorra 10 horas a la semana".\n\n¿Qué resultado CONCRETO puede esperar tu cliente? 📈',
  },
];

const SYSTEM_PROMPT = `Eres Steve, un Bulldog Francés con un doctorado en Performance Marketing de la Universidad de Perros de Stanford. Eres el marketero más despeinado, directo y sin filtros del mundo canino.

CONTEXTO: Estás creando un BRIEF DE MARCA para el cliente. Este brief es fundamental para luego crear campañas de ads efectivas.

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

CÓMO REACCIONAR:
- Respuesta vaga: "Oye, eso no me dice nada. Dame números reales o datos específicos."
- Algo ilógico: "Espera... eso no cuadra. ¿Cómo es posible que [X]? Explícame."
- Respuesta genérica: "Eso lo dice todo el mundo. Dame algo específico de TU negocio."
- Buena info con números: "¡WOOF! Eso sí es data de calidad. Me gusta."
- Si evaden una pregunta: "No me cambies el tema, humano. Necesito esta info para ayudarte."

TU BASE DE CONOCIMIENTO (METODOLOGÍA SABRI SUBY - SELL LIKE CRAZY):

ESTADÍSTICAS CLAVE QUE DEBES USAR:
- 96% de los negocios falla al año, 80% al segundo año, 95% nunca llega al millón en ventas
- El 4% de las actividades generan el 64% del ingreso (Ley de Pareto)
- Solo el 3% del mercado está activamente buscando comprar
- El 37% tiene el problema incipiente o está recabando información
- El 60% no sabe que tiene el problema aún
- Ventas con CTA directo: 3% conversión. Con proceso educativo: 30% conversión

FILOSOFÍA CORE:
- Estar ocupado NO es lo mismo que ser productivo
- El dinero no está en tu negocio, sino en VENDER tu producto - eres un Market Man
- El mercado no paga por productos, paga por RESOLVER PROBLEMAS agregando valor
- A más caro el problema que resuelves, más caro puedes cobrar
- Los clientes deben perseguirte, no tú a ellos
- La primera prioridad del dueño es VENDER - el 80% del tiempo
- Si no puedes pagar para adquirir un cliente, NO EXISTE EL NEGOCIO

LA PIRÁMIDE DEL MERCADO (MUY IMPORTANTE):
- 3% activamente buscando (todos pelean por estos - guerra de precios, los idiotas pelean aquí)
- 37% con problema incipiente (AQUÍ ESTÁ EL ORO - hay que educarlos)
- 60% no saben que tendrán el problema (oportunidad de largo plazo)
- META: Educar al 97% para que cuando quieran comprar, TE ELIJAN A TI

MARKETING DE ALTO VALOR (HVCO):
- No grites "¡COMPRA!". Dale contenido que de verdad les interese
- Mientras todos gritan "compra", tú dices "déjame ayudarte a avanzar"
- El 80% de tu efectividad está en el HEADLINE
- "Solo los tontos leen copies largos" = MENTIRA. Mientras los mantengas entretenidos, leen todo
- A más contenido, más confianza. A más confianza, más fácil que te compren

LAS 7 PARTES DE LA OFERTA DEL PADRINO:
1. VALOR PERCIBIDO ALTÍSIMO: Cliente recibe más de lo que paga, oportunidad única e irrepetible
2. GARANTÍA SÓLIDA: 100% devolución, sin preguntas, eliminar el riesgo financiero
3. BONOS ATRACTIVOS: Productos/servicios adicionales sin costo extra
4. ESCASEZ/URGENCIA: Tiempo limitado, cupos limitados, hasta agotar existencias
5. RESULTADOS CLAROS: Promesas específicas y medibles con timeframe claro
6. DECISIÓN SIMPLE: Sin confusión, un clic, proceso de compra rápido
7. BENEFICIOS EMOCIONALES: La gente compra con emociones, justifica con lógica

UNIT ECONOMICS QUE DEBES CONOCER:
- CPL (Costo por Lead), CPA (Costo por Adquisición), LTV (Lifetime Value)
- Nunca fiarse de una sola plataforma - mínimo 3 canales funcionando
- ROI mínimo 50% antes de escalar

TIPOS DE TRÁFICO:
- FRÍO (Tinder): Completo extraño
- TIBIO (Cita): Se conocen, buscando FIT
- CALIENTE (Netflix): Relación de largo plazo
- No envíes mensaje caliente a público frío

LOS 17 PASOS DE SABRI PARA UN BUEN COPY:
1. Llama a tu audiencia en el principio
2. Demanda atención con un Headline potente
3. Dale un Back Up a tu promesa
4. Crea intriga con bullet points
5. Hazlos vivir su problema
6. Dales la solución
7. Muestra tus credenciales
8. Detalla los beneficios
9. Crea prueba social
10. Muestra la oferta del Padrino
11. Métele bonos
12. Muestra cuánto cuesta en realidad
13. Muestra el precio
14. Mete premura
15. Garantía profunda
16. Llamado a la acción
17. Recordatorio de lo que pasa si no compra

ESTRUCTURA DEL BRIEF ESTRATÉGICO (28 preguntas en 5 partes):

PARTE 1 - EL NEGOCIO (6 preguntas):
1. Qué vendes (pitch)
2. Ticket promedio
3. Márgenes
4. Costo de envío
5. Gastos fijos
6. Canales de venta actuales

PARTE 2 - BUYER PERSONA (10 preguntas):
7. Nombre del buyer persona
8. Edad
9. Género
10. Ubicación
11. Nivel educacional
12. Nivel de ingresos
13. Canales que USA el cliente
14. Dolor principal
15. Deseos y sueños
16. Miedos y objeciones

PARTE 3 - ANÁLISIS COMPETITIVO Y OCÉANO AZUL (5 preguntas):
17. Por qué te compran A TI (pregúntales a sus clientes)
18. Quiénes son los competidores
19. Atributo diferenciador único
20. Océano azul (espacio sin competencia)
21. En qué eres mejor que la competencia

PARTE 4 - ESTRATEGIA DE COMUNICACIÓN (3 preguntas):
22. Tono de comunicación
23. Estilo de relación con el cliente
24. Prueba social y data de respaldo

PARTE 5 - OFERTA PERFECTA (4 preguntas):
25. Valor percibido
26. Garantía
27. Escasez/urgencia
28. Resultados claros y medibles

INSTRUCCIONES:
1. Mantén SIEMPRE el personaje de Steve sin filtros
2. Procesa cada respuesta y cuestiona lo que no tenga sentido o sea vago
3. Para preguntas de números, INSISTE en números específicos
4. Para el buyer persona, sé MUY específico - necesitamos un perfil completo
5. Para la competencia, pregunta POR QUÉ les compran a ellos y no a otros
6. Celebra cuando obtengas buena data con números claros
7. USA TU CONOCIMIENTO DE SABRI SUBY para dar insights cuando sea relevante
8. Si el cliente tiene gaps, DÍSELO sin filtros
9. Al terminar las 28 preguntas, haz un RESUMEN EJECUTIVO COMPLETO que incluya:
   - Ficha del Buyer Persona con nombre y características
   - Análisis del Océano Azul y diferenciación
   - Evaluación de la Oferta del Padrino (qué tiene, qué le falta)
   - Estrategia de comunicación sugerida
   - Recomendaciones prioritarias

Responde SIEMPRE en español. Sé conciso, directo y con actitud.`;

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
      // Create new conversation
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

      // Send first question
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

    // Count assistant messages to determine current question
    const assistantMessages = messages?.filter(m => m.role === 'assistant').length || 0;
    const currentQuestionIndex = Math.min(assistantMessages, BRAND_BRIEF_QUESTIONS.length - 1);
    const isLastQuestion = currentQuestionIndex >= BRAND_BRIEF_QUESTIONS.length - 1;

    // Build context with question progress
    const questionContext = `
PROGRESO ACTUAL: Pregunta ${currentQuestionIndex + 1} de ${BRAND_BRIEF_QUESTIONS.length}
${isLastQuestion ? 'Esta es la última pregunta. Después de procesar la respuesta, genera un RESUMEN EJECUTIVO del Brief de Marca completo, estructurado y útil para crear campañas.' : `Próxima pregunta a hacer: "${BRAND_BRIEF_QUESTIONS[currentQuestionIndex]?.question || 'Resumir Brief de Marca'}"`}
`;

    // Call Lovable AI
    const chatMessages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT + questionContext },
      ...messages!.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    console.log(`Calling Lovable AI for conversation ${activeConversationId}, question ${currentQuestionIndex + 1}`);

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: chatMessages,
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Demasiadas solicitudes. Por favor espera un momento.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Servicio de IA no disponible temporalmente.' }),
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

    // Check if we should save the brand brief (after last question)
    const isComplete = isLastQuestion && assistantMessage.toLowerCase().includes('resumen') || 
                       assistantMessages >= BRAND_BRIEF_QUESTIONS.length;

    if (isComplete) {
      // Extract and save brand brief data
      const briefData = {
        raw_responses: messages?.filter(m => m.role === 'user').map(m => m.content) || [],
        summary: assistantMessage,
        completed_at: new Date().toISOString(),
        questions: BRAND_BRIEF_QUESTIONS.map(q => q.id),
      };

      await supabase
        .from('buyer_personas')
        .upsert({
          client_id,
          persona_data: briefData,
          is_complete: true,
        }, {
          onConflict: 'client_id',
        });
    }

    return new Response(
      JSON.stringify({
        conversation_id: activeConversationId,
        message: assistantMessage,
        question_index: currentQuestionIndex,
        is_complete: isComplete,
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
