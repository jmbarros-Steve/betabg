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
    question: '*sacude las orejas y se sienta profesionalmente* 🐕\n\n¡WOOF! Soy Steve, Bulldog Francés con doctorado en Performance Marketing de la Universidad de Perros de Stanford.\n\nVamos a armar tu Brief Estratégico COMPLETO. Son 40 preguntas profundas, pero al final vas a tener un documento que vale ORO para tus campañas.\n\n**Pregunta 1 de 40 - EL NEGOCIO:** ¿A qué se dedica tu empresa? ¿Qué vendes exactamente? Dame el pitch de 30 segundos.',
  },
  {
    id: 'average_ticket',
    question: '*saca una calculadora imaginaria* 🧮\n\n**Pregunta 2 de 40 - TICKET:** ¿Cuál es tu ticket promedio? ¿Cuánto gasta en promedio cada cliente por compra?\n\nDame el número real, no el que quisieras.',
  },
  {
    id: 'margins',
    question: '*baja la voz como si fuera secreto*\n\n**Pregunta 3 de 40 - MÁRGENES:** ¿Cuáles son tus márgenes? ¿Qué porcentaje te queda después de costos?\n\nEsto es CLAVE para saber cuánto podemos gastar en ads. 💰',
  },
  {
    id: 'shipping_cost',
    question: '*mueve la colita*\n\n**Pregunta 4 de 40 - ENVÍO:** ¿Cuánto te cuesta el despacho/envío en promedio? ¿Lo cobras aparte? ¿Lo incluyes? 📦',
  },
  {
    id: 'fixed_costs',
    question: '*estira las patitas*\n\n**Pregunta 5 de 40 - COSTOS FIJOS:** ¿Cuáles son tus gastos fijos mensuales principales? Arriendo, sueldos, servicios. 🏢',
  },
  {
    id: 'sales_channels',
    question: '*ladea la cabeza curioso*\n\n**Pregunta 6 de 40 - CANALES:** ¿Dónde vendes actualmente? ¿Tienda física, ecommerce, marketplace, redes sociales? 🏪',
  },

  // ═══════════════════════════════════════════════════════════════
  // PARTE 2: BUYER PERSONA PSICOGRÁFICO (15 preguntas profundas)
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'persona_name',
    question: '*se pone serio, entramos al BUYER PERSONA PROFUNDO* 🎯\n\nAhora vamos a construir tu CLIENTE SOÑADO. No demográficos aburridos... PSICOGRÁFICOS.\n\n**Pregunta 7 de 40 - NOMBRE:** ¿Cómo se llamaría tu cliente ideal? Dame un nombre real, como "María la Emprendedora" o "Juan el Ejecutivo".',
  },
  {
    id: 'persona_demographics',
    question: '*olfatea el aire*\n\n**Pregunta 8 de 40 - DEMOGRAFÍA BÁSICA:** Dame los básicos: Edad, género, ubicación, nivel educacional, ingresos aproximados.\n\nEjemplo: "Mujer, 35-45 años, Santiago oriente, universitaria, $2-4M mensuales". 📊',
  },
  {
    id: 'persona_3am_pain',
    question: '*pone cara seria, ojos fijos* 😰\n\n**Pregunta 9 de 40 - DOLOR DE LAS 3 AM:** ¿Cuál es el "dolor de cabeza" que le quita el sueño a tu cliente a las 3 AM?\n\nEse pensamiento que lo tortura cuando está solo en la oscuridad. Dame el dolor REAL.',
  },
  {
    id: 'persona_shame',
    question: '*baja la voz*\n\n**Pregunta 10 de 40 - VERGÜENZA:** ¿Qué es lo que MÁS LE AVERGÜENZA de su situación actual?\n\nEjemplo: "Que su piso de lujo se vea opaco frente a las visitas". La vergüenza vende. 😳',
  },
  {
    id: 'persona_common_mistake',
    question: '*ladea la cabeza*\n\n**Pregunta 11 de 40 - ERROR COMÚN:** ¿Cuál es el error más común que comete tu cliente ANTES de encontrarte?\n\nEjemplo: "Limpiar madera con cloro", "Contratar al más barato y arrepentirse". 🚫',
  },
  {
    id: 'persona_fear_not_buying',
    question: '*mueve las orejas alerta*\n\n**Pregunta 12 de 40 - MIEDO DE NO COMPRAR:** ¿A qué le tiene MIEDO si NO compra tu producto HOY?\n\n¿Qué pasa si no actúa? ¿Qué pierde? ¿Qué empeora? 😱',
  },
  {
    id: 'persona_sunday_feeling',
    question: '*se sienta pensativo*\n\n**Pregunta 13 de 40 - SENTIMIENTO DOMINGO:** ¿Cómo se siente un domingo por la tarde cuando piensa en el problema que TÚ resuelves?\n\nDescríbeme esa emoción. ¿Frustración? ¿Ansiedad? ¿Culpa? 🌅',
  },
  {
    id: 'persona_exact_words',
    question: '*saca su libreta* 📝\n\n**Pregunta 14 de 40 - PALABRAS EXACTAS:** ¿Qué palabras EXACTAS usa tu cliente para describir su problema cuando se queja con un amigo?\n\nDame frases reales, como las diría él/ella. Esto es ORO para los copies.',
  },
  {
    id: 'persona_internal_objection',
    question: '*olfatea desconfianza*\n\n**Pregunta 15 de 40 - OBJECIÓN INTERNA:** ¿Cuál es la objeción INTERNA que tiene tu cliente para NO comprarte?\n\n¿Es muy caro? ¿No confía en que funcione? ¿Ha sido engañado antes? ¿Pereza? 🤔',
  },
  {
    id: 'persona_transformation',
    question: '*levanta las orejas, ojos brillantes* ✨\n\n**Pregunta 16 de 40 - TRANSFORMACIÓN:** ¿Cuál es su "estado de transformación" SOÑADO?\n\n¿Cómo se ve su vida DESPUÉS de usarte? Píntame el cuadro del éxito.',
  },
  {
    id: 'persona_lifestyle_brands',
    question: '*mueve la cola curioso*\n\n**Pregunta 17 de 40 - MARCAS QUE CONSUME:** ¿Qué marcas de ropa, autos o tecnología consume habitualmente?\n\nEsto define su estatus y cómo le hablamos. ¿iPhone o Android? ¿Zara o Falabella? 🛍️',
  },
  {
    id: 'persona_impress_who',
    question: '*ladra bajito*\n\n**Pregunta 18 de 40 - ¿A QUIÉN IMPRESIONA?:** ¿Quién es la persona a la que tu cliente MÁS quiere impresionar?\n\n¿Su pareja? ¿Sus padres? ¿Sus amigos? ¿Su jefe? ¿Sus vecinos? 👀',
  },
  {
    id: 'persona_channels',
    question: '*saca su celular imaginario*\n\n**Pregunta 19 de 40 - CANALES DEL CLIENTE:** ¿Dónde pasa su tiempo online tu cliente ideal?\n\n¿Instagram? ¿TikTok? ¿Facebook? ¿LinkedIn? ¿YouTube? ¿WhatsApp? ¿Email? 📱',
  },
  {
    id: 'persona_desires',
    question: '*se para en dos patas*\n\n**Pregunta 20 de 40 - SUEÑOS:** ¿Qué SUEÑA tu cliente ideal? ¿Cuál es su meta de vida relacionada con lo que vendes?\n\n¿Qué quiere lograr realmente? 🌟',
  },
  {
    id: 'persona_daily_frustrations',
    question: '*gruñe levemente*\n\n**Pregunta 21 de 40 - FRUSTRACIONES DIARIAS:** ¿Cuáles son las frustraciones del DÍA A DÍA de tu cliente relacionadas con tu producto/servicio?\n\nNo el gran dolor... las molestias pequeñas y constantes. 😤',
  },

  // ═══════════════════════════════════════════════════════════════
  // PARTE 3: ANÁLISIS COMPETITIVO PROFUNDO (10 preguntas)
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'competitors_list',
    question: '*olfatea el territorio enemigo* 🔍\n\nAhora entramos al ANÁLISIS COMPETITIVO PROFUNDO. Para ganarles, hay que saber dónde fallan.\n\n**Pregunta 22 de 40 - COMPETIDORES:** ¿Quiénes son tus 3 competidores DIRECTOS y qué venden exactamente?',
  },
  {
    id: 'competitors_complaints',
    question: '*saca lupa imaginaria* 🔎\n\n**Pregunta 23 de 40 - QUEJAS DE SUS CLIENTES:** ¿Cuál es la QUEJA NÚMERO 1 de los clientes en los reviews de tu competencia?\n\n¡Esto es ORO PURO! Ve a leer sus reviews negativos.',
  },
  {
    id: 'competitors_false_promise',
    question: '*gruñe con desconfianza*\n\n**Pregunta 24 de 40 - PROMESAS FALSAS:** ¿Qué beneficio prometen ELLOS que tú sabes que es MENTIRA o a medias?\n\n¿Dónde no cumplen lo que dicen? 🤥',
  },
  {
    id: 'competitors_pricing',
    question: '*saca calculadora*\n\n**Pregunta 25 de 40 - PRECIOS COMPETENCIA:** ¿Cuánto cobran ellos y cuál es su estructura de descuentos?\n\n¿Hacen ofertas? ¿Cuánto? ¿Con qué frecuencia? 💰',
  },
  {
    id: 'competitors_slow_point',
    question: '*ladea la cabeza*\n\n**Pregunta 26 de 40 - PUNTO DÉBIL:** ¿Qué aspecto de su servicio es LENTO, burocrático o "estirado"?\n\n¿Dónde hacen esperar a los clientes? ¿Qué proceso es tedioso? 🐌',
  },
  {
    id: 'competitors_tone',
    question: '*escucha atento*\n\n**Pregunta 27 de 40 - TONO COMPETENCIA:** ¿Cómo es el tono de voz de tu competencia?\n\n¿Son corporativos aburridos? ¿Agresivos por precio? ¿Premium distantes? 🎤',
  },
  {
    id: 'competitors_ignored_channel',
    question: '*mueve las orejas*\n\n**Pregunta 28 de 40 - CANAL IGNORADO:** ¿Qué canal de venta están IGNORANDO ellos?\n\nEjemplo: No tienen WhatsApp, no hacen mailing, no están en TikTok. 📵',
  },
  {
    id: 'competitors_entry_offer',
    question: '*olfatea oportunidades*\n\n**Pregunta 29 de 40 - OFERTA DE ENTRADA:** ¿Cuál es su "oferta de entrada" para captar clientes nuevos?\n\n¿Tienen prueba gratis? ¿Descuento primera compra? ¿Consulta sin costo? 🎁',
  },
  {
    id: 'why_switch_to_you',
    question: '*se para firme* 🏆\n\n**Pregunta 30 de 40 - ¿POR QUÉ CAMBIARSE?:** ¿Por qué un cliente SE CAMBIARÍA de ellos a TI? (Además del precio)\n\n¿Qué harías diferente que los haga decir "me voy con este otro"?',
  },
  {
    id: 'uncopyable_advantage',
    question: '*ladra con orgullo*\n\n**Pregunta 31 de 40 - IMPOSIBLE DE COPIAR:** ¿Qué es lo ÚNICO que tú haces que ellos JAMÁS podrán copiar rápidamente?\n\nTu "foso" competitivo. Tu ventaja injusta. 💎',
  },

  // ═══════════════════════════════════════════════════════════════
  // PARTE 4: ESTRATEGIA COMUNICACIONAL POTENTE (9 preguntas)
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'purple_cow',
    question: '*se para en dos patas, emocionado* 🐄💜\n\nAhora armamos tu ESTRATEGIA COMUNICACIONAL. La "Venta de Bodega".\n\n**Pregunta 32 de 40 - VACA PÚRPURA:** ¿Cuál es tu "Vaca Púrpura"? Lo que te hace DESTACAR visualmente de inmediato.\n\n¿Qué es lo primero que la gente nota de ti?',
  },
  {
    id: 'big_promise',
    question: '*ladra con fuerza*\n\n**Pregunta 33 de 40 - GRAN PROMESA:** ¿Cuál es la "GRAN PROMESA" de tu marca en UNA SOLA FRASE?\n\nEjemplo: "Duplicamos tus ventas en 90 días o te devolvemos el dinero". 🎯',
  },
  {
    id: 'villain',
    question: '*gruñe*\n\n**Pregunta 34 de 40 - EL VILLANO:** ¿Cuál es el VILLANO de tu historia?\n\nEjemplo: El polvo, la ineficiencia, el dueño tacaño, el sistema anticuado, los "expertos" que cobran y no entregan. 👹',
  },
  {
    id: 'absurd_guarantee',
    question: '*mueve la cola*\n\n**Pregunta 35 de 40 - GARANTÍA ABSURDA:** ¿Qué garantía "ABSURDA" podrías dar para eliminar TODO el riesgo del cliente?\n\nAlgo tan loco que se sientan tontos si no aprovechan. 🛡️',
  },
  {
    id: 'irrefutable_proof',
    question: '*olfatea buscando evidencia*\n\n**Pregunta 36 de 40 - PRUEBA IRREFUTABLE:** ¿Qué prueba social (testimonios/fotos/videos) tienes que sea IRREFUTABLE?\n\n¿Tienes antes/después? ¿Números concretos? ¿Clientes famosos? 📸',
  },
  {
    id: 'insider_secret',
    question: '*baja la voz, secreto*\n\n**Pregunta 37 de 40 - SECRETO DEL INSIDER:** ¿Cuál es el "Insider Trading" de tu negocio?\n\nEse secreto que solo los EXPERTOS saben y el cliente común desconoce. 🤫',
  },
  {
    id: 'ideal_tone',
    question: '*se aclara la garganta*\n\n**Pregunta 38 de 40 - TONO IDEAL:** ¿Qué tono de voz conecta MEJOR con tu cliente?\n\n¿El experto serio? ¿El amigo rebelde? ¿El mentor sabio? ¿El vecino de confianza? 🎤',
  },
  {
    id: 'irresistible_offer',
    question: '*mueve la cola emocionado*\n\n**Pregunta 39 de 40 - OFERTA IRRESISTIBLE:** ¿Cuál es la OFERTA IRRESISTIBLE que haría que el cliente se sienta TONTO si dice que no?\n\nPiensa: tanto valor que parece un error de precio. 💥',
  },
  {
    id: 'urgency_reason',
    question: '*mira el reloj, última pregunta* ⏰\n\n**Pregunta 40 de 40 - RAZÓN DE URGENCIA:** ¿Cuál es la razón de urgencia REAL para que compren HOY y no mañana?\n\n¿Stock limitado? ¿Precio que sube? ¿Bonus temporal? ¿Cupos? Dame algo REAL, no fake. 🏁',
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

ESTRUCTURA DEL BRIEF ESTRATÉGICO (40 preguntas en 4 partes):

PARTE 1 - EL NEGOCIO (6 preguntas):
1-6: Pitch, ticket, márgenes, envío, costos fijos, canales

PARTE 2 - BUYER PERSONA PSICOGRÁFICO (15 preguntas profundas):
7. Nombre del buyer persona
8. Demografía básica
9. Dolor de las 3 AM (qué le quita el sueño)
10. Vergüenza (qué le avergüenza de su situación)
11. Error común que comete antes de encontrarte
12. Miedo si NO compra hoy
13. Sentimiento del domingo (cómo se siente pensando en el problema)
14. Palabras exactas que usa para describir su problema
15. Objeción interna para no comprar
16. Estado de transformación soñado
17. Marcas que consume (estatus)
18. A quién quiere impresionar
19. Canales donde pasa tiempo
20. Sueños y deseos
21. Frustraciones diarias

PARTE 3 - ANÁLISIS COMPETITIVO PROFUNDO (10 preguntas):
22. 3 competidores directos
23. Queja #1 en reviews de competencia
24. Promesas falsas de la competencia
25. Precios y descuentos de competencia
26. Punto lento/burocrático de competencia
27. Tono de voz de competencia
28. Canal que ignoran
29. Oferta de entrada de competencia
30. Por qué se cambiarían a ti
31. Lo que NO pueden copiar de ti

PARTE 4 - ESTRATEGIA COMUNICACIONAL POTENTE (9 preguntas):
32. Vaca Púrpura (qué te hace destacar)
33. Gran Promesa en una frase
34. El Villano de tu historia
35. Garantía absurda que elimina riesgo
36. Prueba social irrefutable
37. Secreto del insider
38. Tono ideal para tu cliente
39. Oferta irresistible
40. Razón de urgencia real

INSTRUCCIONES:
1. Mantén SIEMPRE el personaje de Steve sin filtros
2. Procesa cada respuesta y cuestiona lo que no tenga sentido o sea vago
3. Para preguntas psicográficas, PROFUNDIZA. No aceptes respuestas superficiales.
4. Para la competencia, pregunta POR QUÉ les compran a ellos y dónde FALLAN
5. Celebra cuando obtengas buena data con números y emociones claras
6. USA TU CONOCIMIENTO DE SABRI SUBY para dar insights cuando sea relevante
7. Si el cliente tiene gaps, DÍSELO sin filtros
8. Al terminar las 40 preguntas, genera un BRIEF ESTRATÉGICO COMPLETO que incluya:
   - FICHA DEL BUYER PERSONA con nombre, demografía y psicografía
   - MAPA DE DOLOR: 3 AM pain, vergüenza, miedos, objeciones
   - ESTADO DE TRANSFORMACIÓN: El antes y después soñado
   - ANÁLISIS COMPETITIVO: Debilidades a explotar, océano azul
   - ESTRATEGIA COMUNICACIONAL: Vaca púrpura, villano, gran promesa
   - OFERTA IRRESISTIBLE: Garantía, urgencia, prueba social
   - RECOMENDACIONES PRIORITARIAS: Top 5 acciones inmediatas

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
