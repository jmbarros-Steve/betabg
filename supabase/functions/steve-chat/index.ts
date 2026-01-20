import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Fixed questions Steve asks to build the buyer persona
const BUYER_PERSONA_QUESTIONS = [
  {
    id: 'demographics',
    question: '¡Hola! Soy Steve, tu asistente para crear anuncios increíbles. 🎯\n\nPara empezar, cuéntame sobre tu cliente ideal: ¿Qué edad tiene? ¿Es hombre, mujer, o ambos? ¿Dónde vive?',
  },
  {
    id: 'occupation',
    question: 'Perfecto. Ahora cuéntame: ¿A qué se dedica tu cliente ideal? ¿Cuál es su nivel de ingresos aproximado?',
  },
  {
    id: 'interests',
    question: '¿Cuáles son los intereses y hobbies de tu cliente ideal? ¿Qué le gusta hacer en su tiempo libre?',
  },
  {
    id: 'pain_points',
    question: 'Muy importante: ¿Cuáles son los principales problemas o dolores que tiene tu cliente ideal? ¿Qué le frustra o preocupa?',
  },
  {
    id: 'goals',
    question: '¿Cuáles son las metas y aspiraciones de tu cliente ideal? ¿Qué quiere lograr?',
  },
  {
    id: 'buying_behavior',
    question: '¿Cómo toma decisiones de compra tu cliente ideal? ¿Qué factores considera antes de comprar?',
  },
  {
    id: 'product_value',
    question: '¿Qué problema específico resuelve tu producto/servicio para este cliente? ¿Por qué elegiría tu marca sobre la competencia?',
  },
  {
    id: 'tone_style',
    question: 'Última pregunta: ¿Qué tono de comunicación prefieres para tus anuncios? (Ej: profesional, casual, divertido, emocional, inspirador)',
  },
];

const SYSTEM_PROMPT = `Eres Steve, un asistente amigable y experto en marketing digital de Consultoría BG. Tu objetivo es ayudar a los clientes a definir su buyer persona a través de una conversación natural.

INSTRUCCIONES IMPORTANTES:
1. Cuando el usuario responda a una pregunta, procesa su respuesta y extrae la información relevante.
2. Sé amigable, usa emojis ocasionalmente, y haz que la conversación fluya naturalmente.
3. Si la respuesta es muy corta o vaga, pide amablemente más detalles.
4. Después de obtener suficiente información de cada pregunta, avanza a la siguiente.
5. Si el usuario pregunta algo fuera del tema, responde brevemente y vuelve al cuestionario.
6. Cuando termines todas las preguntas, resume el buyer persona y confirma con el usuario.

PREGUNTAS A CUBRIR (en orden):
1. Demografía: edad, género, ubicación
2. Ocupación e ingresos
3. Intereses y hobbies
4. Problemas y dolores
5. Metas y aspiraciones
6. Comportamiento de compra
7. Valor del producto/servicio
8. Tono de comunicación preferido

Mantén un tono conversacional y profesional. Responde en español.`;

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
