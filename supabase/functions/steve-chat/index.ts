import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Fixed questions Steve asks to build the brand brief
const BRAND_BRIEF_QUESTIONS = [
  {
    id: 'business_type',
    question: '*sacude las orejas y se sienta profesionalmente* 🐕\n\n¡WOOF! Soy Steve, Bulldog Francés con doctorado en Performance Marketing de la Universidad de Perros de Stanford.\n\nAntes de hacer cualquier anuncio, necesito entender tu negocio a fondo. Vamos a armar tu Brief de Marca.\n\n**Pregunta 1 de 11:** ¿A qué se dedica tu empresa? ¿Qué vendes exactamente? Dame el pitch de 30 segundos.',
  },
  {
    id: 'customers',
    question: '*mueve la cola* Ok, ya olfateo el negocio...\n\n**Pregunta 2 de 11:** ¿Quiénes te compran? Dame el perfil real, no el que sueñas. Edad, género, nivel socioeconómico, ubicación. ¿Quién saca la tarjeta? 💳',
  },
  {
    id: 'sales_channels',
    question: '*ladea la cabeza curioso*\n\n**Pregunta 3 de 11:** ¿Dónde vendes? ¿Tienda física, ecommerce, marketplace, redes sociales, todo junto? Dame los canales reales de venta. 🏪',
  },
  {
    id: 'communication_tone',
    question: '*se rasca la oreja pensativo*\n\n**Pregunta 4 de 11:** ¿Qué idioma/tono usa tu marca para comunicarse?\n\n¿Agresivo y directo? ¿Tranquilo y cercano? ¿Formal y profesional? ¿Chistoso? Dame ejemplos si puedes. 🎤',
  },
  {
    id: 'pain_solved',
    question: '*pone cara seria de doctor Stanford* 🎓\n\n**Pregunta 5 de 11:** ¿Qué dolor específico solucionas? No me digas "ayudamos a la gente"... eso es humo.\n\n¿Qué problema REAL tiene tu cliente que TÚ resuelves?',
  },
  {
    id: 'supporting_data',
    question: '*olfatea el aire buscando data*\n\n**Pregunta 6 de 11:** ¿Tienes DATA que respalde tu propuesta? Testimonios, casos de éxito, números, estadísticas...\n\n¿Qué pruebas tienes de que funciona lo que vendes? 📊',
  },
  {
    id: 'competitive_advantage',
    question: '*se para en dos patas*\n\n**Pregunta 7 de 11:** ¿Cuál es tu ventaja competitiva REAL?\n\n¿Por qué alguien te compraría a TI y no al de al lado? Y no me digas "calidad y servicio" porque eso lo dice todo el mundo. 😤',
  },
  {
    id: 'average_ticket',
    question: '*saca una calculadora imaginaria* 🧮\n\n**Pregunta 8 de 11:** ¿Cuál es tu ticket promedio? Es decir, ¿cuánto gasta en promedio cada cliente por compra?\n\nDame el número real, no el que quisieras.',
  },
  {
    id: 'margins',
    question: '*baja la voz como si fuera secreto*\n\n**Pregunta 9 de 11:** ¿Cuáles son tus márgenes? ¿Qué porcentaje te queda después de costos?\n\nEsto es CLAVE para saber cuánto podemos gastar en ads. 💰',
  },
  {
    id: 'shipping_cost',
    question: '*mueve la colita*\n\n**Pregunta 10 de 11:** ¿Cuánto te cuesta el despacho/envío en promedio?\n\n¿Lo cobras aparte? ¿Lo incluyes? ¿Cuánto te come del margen? 📦',
  },
  {
    id: 'fixed_costs',
    question: '*se sienta formal, última pregunta*\n\n**Pregunta 11 de 11 - LA ÚLTIMA:** ¿Cuáles son tus gastos fijos mensuales principales?\n\nArriendo, sueldos, servicios, lo que sea. Necesito entender tu estructura de costos para calcular bien los números. 🏢',
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

PREGUNTAS DEL BRIEF DE MARCA (11 en total):
1. A qué se dedica la empresa
2. Quiénes le compran (perfil de cliente real)
3. Dónde venden (canales)
4. Tono/idioma de comunicación
5. Qué dolor solucionan
6. Data que respalde (testimonios, casos, números)
7. Ventaja competitiva real
8. Ticket promedio
9. Márgenes
10. Costo de despacho promedio
11. Gastos fijos

INSTRUCCIONES:
1. Mantén SIEMPRE el personaje de Steve sin filtros
2. Procesa cada respuesta y cuestiona lo que no tenga sentido o sea vago
3. Para preguntas de números (ticket, márgenes, costos), INSISTE en números específicos
4. Celebra cuando obtengas buena data con números claros
5. Al terminar las 11 preguntas, haz un RESUMEN EJECUTIVO del Brief de Marca
6. El resumen debe ser estructurado y útil para crear campañas después

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
