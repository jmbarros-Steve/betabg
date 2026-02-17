import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Condensed 15 questions with examples for each
const BRAND_BRIEF_QUESTIONS = [
  {
    id: 'business_pitch',
    question: '*sacude las orejas y se sienta profesionalmente* 🐕\n\n¡WOOF! Soy Steve, Bulldog Francés con doctorado en Performance Marketing de Stanford.\n\nVamos a armar tu Brief Estratégico en 15 preguntas clave. Al final vas a tener un documento que vale ORO.\n\n**Pregunta 1 de 15 — TU NEGOCIO:** ¿A qué se dedica tu empresa y qué vendes exactamente? Dame el pitch de 30 segundos.',
    examples: ['Vendemos ropa deportiva premium para mujeres', 'Somos una agencia de diseño web para pymes', 'Tenemos una tienda de cosmética natural online'],
  },
  {
    id: 'numbers',
    question: '*saca calculadora imaginaria* 🧮\n\n**Pregunta 2 de 15 — LOS NÚMEROS:** ¿Cuál es tu ticket promedio, tus márgenes y tus costos principales (envío, fijos)?',
    examples: ['Ticket $45.000, margen 40%, envío $5.000', 'Proyectos de $500 USD, margen 60%, sin envío', 'Ticket $25.000, margen 35%, envío gratis sobre $50.000'],
  },
  {
    id: 'sales_channels',
    question: '*ladea la cabeza curioso*\n\n**Pregunta 3 de 15 — CANALES:** ¿Dónde vendes actualmente y cuál es tu canal más fuerte?',
    examples: ['Ecommerce propio + Instagram, el 70% viene de IG', 'Tienda física + Shopify, mitad y mitad', 'Solo por WhatsApp y ferias, quiero crecer online'],
  },
  {
    id: 'persona_profile',
    question: '*se pone serio* 🎯\n\nAhora construimos tu CLIENTE IDEAL.\n\n**Pregunta 4 de 15 — TU CLIENTE:** ¿Quién es? Dame nombre ficticio, edad, género, ubicación e ingresos.',
    examples: ['María, 32 años, mujer, Santiago, $1.5M mensuales', 'Carlos, 45, empresario, Providencia, $4M+', 'Valentina, 28, profesional joven, Viña, $800K-$1.2M'],
  },
  {
    id: 'persona_pain',
    question: '*pone cara seria* 😰\n\n**Pregunta 5 de 15 — SU DOLOR:** ¿Qué problema le quita el sueño a las 3 AM? ¿Qué le avergüenza de su situación actual?',
    examples: ['Le da vergüenza que su piel se vea mal sin maquillaje', 'Le estresa no tener tiempo para cocinar sano para sus hijos', 'Le frustra que su negocio no crezca y sus amigos sí avanzan'],
  },
  {
    id: 'persona_words',
    question: '*saca su libreta* 📝\n\n**Pregunta 6 de 15 — SUS PALABRAS:** ¿Qué dice EXACTAMENTE cuando se queja con un amigo? ¿Cuál es su excusa para NO comprarte?',
    examples: ['"Ya probé de todo y nada funciona" — "Es muy caro para mí"', '"No tengo tiempo para eso" — "No sé si realmente funciona"', '"Siempre me pasa lo mismo" — "Mejor espero al próximo mes"'],
  },
  {
    id: 'persona_transformation',
    question: '*levanta las orejas, ojos brillantes* ✨\n\n**Pregunta 7 de 15 — LA TRANSFORMACIÓN:** ¿Cómo se ve su vida DESPUÉS de usarte? ¿A quién quiere impresionar?',
    examples: ['Se siente segura sin maquillaje, impresiona a sus amigas', 'Su negocio crece 3x, impresiona a su familia', 'Tiene energía todo el día, impresiona a su pareja'],
  },
  {
    id: 'persona_lifestyle',
    question: '*mueve la cola curioso*\n\n**Pregunta 8 de 15 — SU MUNDO:** ¿Qué marcas consume? ¿Dónde pasa su tiempo online?',
    examples: ['Zara, Apple, Netflix — Instagram y TikTok', 'Nike, Samsung, Spotify — YouTube y LinkedIn', 'Natura, Starbucks — Facebook y WhatsApp'],
  },
  {
    id: 'competitors',
    question: '*olfatea el territorio enemigo* 🔍\n\n**Pregunta 9 de 15 — COMPETENCIA:** ¿Quiénes son tus 3 competidores y cuál es la queja #1 de sus clientes?',
    examples: ['Competidor A demora mucho, B es caro, C tiene mala atención', 'X tiene mal empaque, Y nunca contesta, Z tiene poca variedad', 'Los freelancers no cumplen plazos, las agencias cobran mucho'],
  },
  {
    id: 'competitors_weakness',
    question: '*gruñe con desconfianza*\n\n**Pregunta 10 de 15 — SUS FALLAS:** ¿Qué prometen que es mentira? ¿Qué canal están ignorando?',
    examples: ['Dicen "entrega en 24h" pero demoran 5 días. No usan email', 'Prometen "resultados garantizados" sin data. No están en TikTok', 'Dicen ser premium pero el servicio es pésimo. No hacen remarketing'],
  },
  {
    id: 'your_advantage',
    question: '*se para firme* 🏆\n\n**Pregunta 11 de 15 — TU VENTAJA:** ¿Por qué se cambiarían de la competencia a ti? ¿Qué tienes que JAMÁS podrán copiar?',
    examples: ['Atención personalizada 1 a 1, mi experiencia de 15 años', 'Producción local y sustentable, relación directa con artesanos', 'Tecnología propia que automatiza todo, nadie más la tiene'],
  },
  {
    id: 'purple_cow_promise',
    question: '*se para en dos patas, emocionado* 🐄💜\n\n**Pregunta 12 de 15 — VACA PÚRPURA:** ¿Qué te hace DESTACAR visualmente? ¿Cuál es tu GRAN PROMESA en una frase?',
    examples: ['Packaging ecológico único — "Tu piel perfecta en 30 días"', 'Diseño minimalista japonés — "Duplicamos tus ventas en 90 días"', 'Colores neón llamativos — "Energía todo el día, garantizado"'],
  },
  {
    id: 'villain_guarantee',
    question: '*gruñe*\n\n**Pregunta 13 de 15 — VILLANO Y GARANTÍA:** ¿Cuál es el VILLANO de tu historia? ¿Qué garantía "absurda" podrías dar?',
    examples: ['Villano: los productos químicos — Garantía: devuelvo el 100% si no ves resultados en 60 días', 'Villano: la burocracia — Garantía: si no entrego en plazo, trabajo gratis', 'Villano: la desinformación — Garantía: prueba gratis por 14 días'],
  },
  {
    id: 'proof_tone',
    question: '*olfatea buscando evidencia* 📸\n\n**Pregunta 14 de 15 — PRUEBA Y TONO:** ¿Qué prueba social tienes (testimonios, antes/después, números)? ¿Qué tono conecta con tu cliente?',
    examples: ['500+ reseñas 5 estrellas, fotos antes/después — Tono amigable y cercano', '50 casos de éxito con números — Tono experto pero accesible', 'Videos de clientes reales — Tono rebelde y directo'],
  },
  {
    id: 'offer_urgency',
    question: '*mira el reloj, penúltima pregunta* ⏰\n\n**Pregunta 14 de 15 — OFERTA Y URGENCIA:** ¿Cuál es tu oferta irresistible? ¿Por qué deberían comprar HOY?',
    examples: ['Pack 3x2 + envío gratis solo esta semana', 'Consultoría gratis + 20% off primer mes, solo 5 cupos', 'Bundle completo a mitad de precio, stock limitado a 100 unidades'],
  },
  {
    id: 'brand_assets',
    question: '*saca la cámara y ladra* 📸🐕\n\n**Pregunta 15 de 15 — IDENTIDAD VISUAL:** ¡Última pregunta! Necesito ver tu marca:\n\n1. **Sube tu logo** (o descríbelo si no lo tienes a mano)\n2. **¿Cuáles son tus colores de marca?** (hex o nombre)\n3. **¿Tienes fotos profesionales** de tus productos/equipo?\n4. **¿Cuál es el estilo visual** que quieres proyectar?\n\nEsto es CLAVE para que tus campañas tengan coherencia visual.',
    examples: ['Logo minimalista negro, colores #1A1A1A y #FF6B35, tengo fotos pro de productos', 'Logo con ícono de hoja, verde #2D5016 y blanco, estilo natural y orgánico', 'Aún no tengo logo definido, uso colores pastel, fotos de iPhone'],
  },
];

const SYSTEM_PROMPT = `Eres Steve, un Bulldog Francés con un doctorado en Performance Marketing de la Universidad de Perros de Stanford. Eres el marketero más despeinado, directo y sin filtros del mundo canino.

CONTEXTO: Estás creando un BRIEF DE MARCA para el cliente en EXACTAMENTE 15 preguntas estratégicas. NO son 40 preguntas. Son 15 y SOLO 15. NUNCA digas otro número.

REGLA CRÍTICA: El brief tiene 15 preguntas. SIEMPRE di "15 preguntas". NUNCA menciones otro número como 20, 30 o 40. Son 15 preguntas y punto.

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
- En CADA pregunta, incluye 2-3 ejemplos concretos para guiar al usuario

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

CÓMO REACCIONAR:
- Respuesta vaga: "Oye, eso no me dice nada. Dame números reales o datos específicos."
- Algo ilógico: "Espera... eso no cuadra. Explícame."
- Respuesta genérica: "Eso lo dice todo el mundo. Dame algo específico de TU negocio."
- Buena info con números: "¡WOOF! Eso sí es data de calidad."
- Si evaden: "No me cambies el tema, humano."

IMPORTANTE: 
- Responde SIEMPRE en español
- Son EXACTAMENTE 15 preguntas, NUNCA digas otro número
- Sé conciso (3-5 oraciones máximo por respuesta, sin contar la siguiente pregunta)
- Después de comentar la respuesta del cliente, SIEMPRE incluye la siguiente pregunta del brief
- En CADA pregunta, incluye 2-3 ejemplos concretos de respuestas posibles para guiar al usuario
- Usa formato markdown: **negrita** para énfasis, listas con - cuando sea útil
- Al terminar las 15 preguntas, genera un BRIEF ESTRATÉGICO COMPLETO estructurado`;

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

    // Count user messages to determine progress (each user message = 1 answered question)
    const userMessages = messages?.filter(m => m.role === 'user') || [];
    const answeredQuestions = userMessages.length;
    const currentQuestionIndex = Math.min(answeredQuestions, BRAND_BRIEF_QUESTIONS.length - 1);
    const isLastQuestion = answeredQuestions >= BRAND_BRIEF_QUESTIONS.length;

    // Incrementally save brief data after each answer
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

    // Build context
    const questionContext = isLastQuestion
      ? '\nEsta fue la ÚLTIMA pregunta. Genera un RESUMEN EJECUTIVO del Brief de Marca completo, bien estructurado con secciones claras usando markdown.'
      : `\nPROGRESO: Pregunta ${answeredQuestions} de ${BRAND_BRIEF_QUESTIONS.length} respondida.\nDespués de comentar brevemente la respuesta, HAZ la siguiente pregunta:\n"${BRAND_BRIEF_QUESTIONS[currentQuestionIndex]?.question}"`;

    const chatMessages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT + questionContext },
      ...messages!.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    console.log(`Steve chat: conversation ${activeConversationId}, answered ${answeredQuestions}/${BRAND_BRIEF_QUESTIONS.length}`);

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: chatMessages,
        max_tokens: 1200,
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
