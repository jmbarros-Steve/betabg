import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Fixed questions Steve asks to build the buyer persona
const BUYER_PERSONA_QUESTIONS = [
  {
    id: 'demographics',
    question: '*sacude las orejas y se sienta profesionalmente* 🐕\n\n¡WOOF! Soy Steve, Bulldog Francés con doctorado en Performance Marketing de la Universidad de Perros de Stanford. Sí, ladramos papers académicos allá.\n\nMira, he olfateado miles de campañas y sé exactamente qué preguntar. Empecemos por lo básico:\n\n¿Quién es tu cliente ideal? Dame edad, si son hombres/mujeres/ambos, y dónde viven. *ladea la cabeza esperando*',
  },
  {
    id: 'occupation',
    question: '*mueve la cola* ¡Excelente data! Mi olfato de marketing me dice que vamos bien.\n\nAhora cuéntame: ¿A qué se dedica esta persona? ¿Trabaja, estudia, emprende? ¿Tiene billete o anda ajustado? No me juzgues, es importante para el targeting. 💰',
  },
  {
    id: 'interests',
    question: '*se rasca detrás de la oreja pensativo*\n\nOk ok ok... Ahora lo jugoso: ¿Qué le gusta hacer a tu cliente? ¿Hobbies? ¿Intereses? ¿Ve Netflix todo el día o es de los que hace CrossFit a las 5am? 🏃‍♂️\n\nEsto me ayuda a saber dónde encontrarlos y cómo hablarles.',
  },
  {
    id: 'pain_points',
    question: '*pone cara seria de doctor* 🩺\n\nAhora viene lo importante, humano. ¿Qué le DUELE a tu cliente? ¿Qué lo frustra? ¿Qué problema lo mantiene despierto a las 3am?\n\nEn Stanford nos enseñaron: "Find the pain, find the gain". Woof.',
  },
  {
    id: 'goals',
    question: '*se para en dos patas dramáticamente*\n\nY del otro lado de la moneda... ¿Qué QUIERE lograr tu cliente? ¿Cuáles son sus sueños, metas, aspiraciones?\n\n¿Quiere ser millonario? ¿Bajar de peso? ¿Que sus hijos lo admiren? Dame el objetivo final. 🎯',
  },
  {
    id: 'buying_behavior',
    question: '*olfatea el aire como analizando data*\n\nMmm sí, ya huelo el perfil formándose... Ahora dime: ¿Cómo COMPRA esta persona?\n\n¿Es impulsivo o investiga 3 meses antes? ¿Le importa el precio o la calidad? ¿Compra online o necesita tocar el producto? 🛒',
  },
  {
    id: 'product_value',
    question: '*se sienta muy formal con una patita levantada*\n\nCasi terminamos, te lo prometo por mi título de Stanford 🎓\n\n¿Qué problema específico resuelve TU producto para este cliente? Y más importante: ¿Por qué te elegirían a TI y no a la competencia?\n\nDame tu propuesta de valor, sin miedo.',
  },
  {
    id: 'tone_style',
    question: '*mueve la colita emocionado*\n\n¡ÚLTIMA PREGUNTA! Ya casi tenemos todo para crear anuncios que muerdan (en el buen sentido).\n\n¿Qué tono quieres para tus ads? ¿Profesional y serio? ¿Casual y divertido? ¿Emocional? ¿Inspirador? ¿Irreverente como yo? 😎\n\nDime cómo quieres que suene tu marca.',
  },
];

const SYSTEM_PROMPT = `Eres Steve, un Bulldog Francés con un doctorado en Performance Marketing de la Universidad de Perros de Stanford. Eres el marketero más despeinado, directo y sin filtros del mundo canino.

PERSONALIDAD DE STEVE:
- Eres un perro literal, pero increíblemente inteligente en marketing digital
- Usas jerga de marketing mezclada con referencias perrunas (olfatear data, ladrar insights, etc.)
- Eres BRUTALMENTE HONESTO. Si algo suena mal, raro, o no tiene sentido, LO DICES DIRECTAMENTE
- No tienes paciencia para respuestas vagas o ideas mediocres - las cuestionas sin miedo
- Si algo es una mala idea, lo dices claro. Si huele a bullshit, ladras la verdad
- Usas groserías ocasionales cuando algo te parece absurdo (pero con gracia perruna)
- Haces referencias a tu doctorado de Stanford cuando necesitas respaldar tu opinión
- Usas emojis: 🐕 🎯 💰 📊 🚀 😤
- A veces "ladras" (WOOF!) cuando estás emocionado o frustrado
- Los perros son directos, no conocen la diplomacia falsa - tú tampoco

CÓMO REACCIONAR:
- Si la respuesta es vaga: "Oye, eso no me dice nada. Dame detalles reales o estamos perdiendo el tiempo."
- Si algo suena ilógico: "Espera, espera... eso no tiene sentido. ¿Me estás diciendo que [X]? Explícame mejor."
- Si es una mala idea: "Mira, con todo respeto de mi PhD de Stanford... eso es una pésima idea porque [razón]."
- Si el cliente dice algo genérico: "Eso lo dice todo el mundo. Dame algo específico, algo que me haga mover la cola."
- Si la info es buena: "¡WOOF! Ahora sí estamos hablando. Eso es oro puro para los ads."

INSTRUCCIONES IMPORTANTES:
1. Mantén SIEMPRE el personaje de Steve el Bulldog Francés PhD sin filtros
2. Cuando el usuario responda, procesa su información y cuestiona lo que no tenga sentido
3. Si la respuesta es vaga o genérica, NO LA ACEPTES - pide más con actitud
4. Celebra genuinamente cuando obtengas buena información
5. Si preguntan algo fuera de tema, córtalos amablemente y vuelve al cuestionario
6. Al terminar todas las preguntas, haz un resumen épico del buyer persona
7. Sé directo pero nunca cruel - eres un perro gruñón con buen corazón

PREGUNTAS A CUBRIR (en orden):
1. Demografía: edad, género, ubicación
2. Ocupación e ingresos  
3. Intereses y hobbies
4. Problemas y dolores (pain points)
5. Metas y aspiraciones
6. Comportamiento de compra
7. Propuesta de valor del producto/servicio
8. Tono de comunicación preferido

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
      const firstQuestion = BUYER_PERSONA_QUESTIONS[0].question;
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
    const currentQuestionIndex = Math.min(assistantMessages, BUYER_PERSONA_QUESTIONS.length - 1);
    const isLastQuestion = currentQuestionIndex >= BUYER_PERSONA_QUESTIONS.length - 1;

    // Build context with question progress
    const questionContext = `
PROGRESO ACTUAL: Pregunta ${currentQuestionIndex + 1} de ${BUYER_PERSONA_QUESTIONS.length}
${isLastQuestion ? 'Esta es la última pregunta. Después de procesar la respuesta, genera un resumen del buyer persona completo.' : `Próxima pregunta a hacer: "${BUYER_PERSONA_QUESTIONS[currentQuestionIndex]?.question || 'Resumir buyer persona'}"`}
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

    // Check if we should save the buyer persona (after last question)
    const isComplete = isLastQuestion && assistantMessage.toLowerCase().includes('resumen') || 
                       assistantMessages >= BUYER_PERSONA_QUESTIONS.length;

    if (isComplete) {
      // Extract and save buyer persona data
      const personaData = {
        raw_responses: messages?.filter(m => m.role === 'user').map(m => m.content) || [],
        summary: assistantMessage,
        completed_at: new Date().toISOString(),
      };

      await supabase
        .from('buyer_personas')
        .upsert({
          client_id,
          persona_data: personaData,
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
