import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 15 questions with optional structured fields for UI rendering
const BRAND_BRIEF_QUESTIONS = [
  {
    id: 'business_pitch',
    question: '*sacude las orejas y se sienta profesionalmente* 🐕\n\n¡WOOF! Soy Steve, Bulldog Francés con doctorado en Performance Marketing de Stanford.\n\nVamos a armar tu **Brief Estratégico en 15 preguntas** (ni una más, ni una menos). Al final vas a tener un documento que vale ORO.\n\n**Pregunta 1 de 15 — TU NEGOCIO:** ¿A qué se dedica tu empresa y qué vendes exactamente? Dame el pitch de 30 segundos.\n\n🌐 **También necesito tu página web o tienda online.** Si no tienes, dímelo, pero NO te voy a dejar pasar sin que me cuentes más sobre tu presencia digital.',
    examples: ['Vendemos ropa deportiva premium para mujeres — www.mitienda.cl', 'Somos una agencia de diseño web para pymes, aún no tenemos web propia', 'Tenemos una tienda de cosmética natural en Shopify — mitienda.myshopify.com'],
    fields: [],
  },
  {
    id: 'numbers',
    question: '*saca calculadora imaginaria* 🧮\n\n**Pregunta 2 de 15 — LOS NÚMEROS:**\n\nNecesito la carne de tu negocio. **Llena los campos abajo** y yo calculo tu **Margen Bruto** y tu **CPA Máximo Viable** (lo máximo que puedes pagar para conseguir un cliente sin perder plata). 💰',
    examples: [],
    fields: [
      { key: 'price', label: '💰 Precio promedio de venta', type: 'number', prefix: '$', placeholder: 'Ej: 35.000' },
      { key: 'cost', label: '📦 Costo del producto/servicio', type: 'number', prefix: '$', placeholder: 'Ej: 12.000' },
      { key: 'shipping', label: '🚚 Costo de envío promedio', type: 'number', prefix: '$', placeholder: 'Ej: 4.000 (0 si es gratis)' },
      { key: 'ads_budget', label: '📣 Gasto mensual en publicidad', type: 'number', prefix: '$', placeholder: 'Ej: 200.000 (0 si no inviertes aún)' },
      { key: 'monthly_sales', label: '📊 Ventas mensuales aprox.', type: 'number', suffix: 'unidades', placeholder: 'Ej: 30' },
    ],
  },
  {
    id: 'sales_channels',
    question: '*ladea la cabeza curioso*\n\n**Pregunta 3 de 15 — CANALES DE VENTA:**\n\nPonle porcentaje a cada canal en los campos abajo. **Deben sumar 100%.** Si no usas un canal, déjalo en 0. 🐕📝',
    examples: [],
    fields: [
      { key: 'shopify', label: '🛒 Shopify / E-commerce propio', type: 'number', suffix: '%', placeholder: '0' },
      { key: 'marketplaces', label: '🏪 Marketplaces (MercadoLibre, Falabella, etc.)', type: 'number', suffix: '%', placeholder: '0' },
      { key: 'direct', label: '🏬 Venta directa / Tienda física', type: 'number', suffix: '%', placeholder: '0' },
      { key: 'whatsapp', label: '📱 WhatsApp', type: 'number', suffix: '%', placeholder: '0' },
      { key: 'instagram', label: '📸 Instagram', type: 'number', suffix: '%', placeholder: '0' },
      { key: 'facebook', label: '👥 Facebook', type: 'number', suffix: '%', placeholder: '0' },
    ],
    validation: 'sum_100',
  },
  {
    id: 'persona_profile',
    question: '*se pone serio* 🎯\n\n**Pregunta 4 de 15 — TU CLIENTE IDEAL (Buyer Persona):**\n\nLlena los 8 campos abajo para construir el perfil de tu cliente ideal. Cada campo es clave para el brief.',
    examples: [],
    fields: [
      { key: 'name', label: '👤 Nombre ficticio', type: 'text', placeholder: 'Ej: María' },
      { key: 'age', label: '🎂 Edad', type: 'number', placeholder: 'Ej: 32' },
      { key: 'gender', label: '⚧ Género', type: 'text', placeholder: 'Ej: Mujer' },
      { key: 'city', label: '📍 Ciudad / Zona', type: 'text', placeholder: 'Ej: Santiago' },
      { key: 'occupation', label: '💼 Ocupación', type: 'text', placeholder: 'Ej: Diseñadora freelance' },
      { key: 'income', label: '💰 Ingreso mensual aprox.', type: 'text', prefix: '$', placeholder: 'Ej: 1.500.000' },
      { key: 'family', label: '💍 Estado civil / Familia', type: 'text', placeholder: 'Ej: Soltera con gato' },
      { key: 'interest', label: '🎯 ¿Por qué te compra?', type: 'text', placeholder: 'Ej: Verse bien sin esfuerzo' },
    ],
  },
  {
    id: 'persona_pain',
    question: '*pone cara seria* 😰\n\n**Pregunta 5 de 15 — SU DOLOR:** ¿Qué problema le quita el sueño a tu cliente ideal? ¿Qué le avergüenza de su situación actual con respecto a lo que TÚ vendes?',
    examples: [],
    fields: [],
  },
  {
    id: 'persona_words',
    question: '*saca su libreta* 📝\n\n**Pregunta 6 de 15 — SUS PALABRAS Y OBJECIONES:** ¿Qué dice EXACTAMENTE cuando se queja con un amigo? ¿Cuál es su excusa para NO comprarte?',
    examples: [],
    fields: [],
  },
  {
    id: 'persona_transformation',
    question: '*levanta las orejas, ojos brillantes* ✨\n\n**Pregunta 7 de 15 — LA TRANSFORMACIÓN:** ¿Cómo se ve la vida de tu cliente DESPUÉS de usarte? ¿A quién quiere impresionar? ¿Qué cambia para él/ella?',
    examples: [],
    fields: [],
  },
  {
    id: 'persona_lifestyle',
    question: '*mueve la cola curioso*\n\n**Pregunta 8 de 15 — SU MUNDO:** ¿Qué marcas consume tu cliente ideal? ¿Dónde pasa su tiempo online? ¿Qué estilo de vida tiene?',
    examples: ['Zara, Apple, Netflix — Instagram y TikTok', 'Nike, Samsung, Spotify — YouTube y LinkedIn', 'Natura, Starbucks — Facebook y WhatsApp'],
    fields: [],
  },
  {
    id: 'competitors',
    question: '*olfatea el territorio enemigo* 🔍\n\n**Pregunta 9 de 15 — COMPETENCIA:**\n\nNecesito **EXACTAMENTE 3 competidores** con su página web o Instagram. Llena los campos abajo.\n\n⚠️ **Sin 3 competidores con URLs NO avanzamos.** Los necesito para el análisis profundo (Deep Dive) después del brief.',
    examples: [],
    fields: [
      { key: 'comp1_name', label: '1️⃣ Nombre Competidor 1', type: 'text', placeholder: 'Ej: Cannon Home' },
      { key: 'comp1_url', label: '🌐 Web / Instagram Competidor 1', type: 'text', placeholder: 'Ej: cannonhome.cl' },
      { key: 'comp2_name', label: '2️⃣ Nombre Competidor 2', type: 'text', placeholder: 'Ej: Intime' },
      { key: 'comp2_url', label: '🌐 Web / Instagram Competidor 2', type: 'text', placeholder: 'Ej: intime.cl' },
      { key: 'comp3_name', label: '3️⃣ Nombre Competidor 3', type: 'text', placeholder: 'Ej: Pijamas Paris' },
      { key: 'comp3_url', label: '🌐 Web / Instagram Competidor 3', type: 'text', placeholder: 'Ej: paris.cl/pijamas' },
    ],
  },
  {
    id: 'competitors_weakness',
    question: '*gruñe con desconfianza*\n\n**Pregunta 10 de 15 — ANÁLISIS COMPETITIVO:**\n\nPara cada uno de tus 3 competidores, llena los campos abajo: qué promete y no cumple, y por qué TÚ lo haces mejor.',
    examples: [],
    fields: [
      { key: 'comp1_fail', label: '1️⃣ Competidor 1: ¿Qué promete y NO cumple?', type: 'textarea', placeholder: 'Ej: Promete algodón premium pero es mezcla barata' },
      { key: 'comp1_better', label: '✅ ¿Por qué TÚ lo haces mejor?', type: 'textarea', placeholder: 'Ej: Usamos algodón pima certificado' },
      { key: 'comp2_fail', label: '2️⃣ Competidor 2: ¿Qué promete y NO cumple?', type: 'textarea', placeholder: 'Ej: Dice entrega en 24h pero demora 5 días' },
      { key: 'comp2_better', label: '✅ ¿Por qué TÚ lo haces mejor?', type: 'textarea', placeholder: 'Ej: Entregamos el mismo día en Santiago' },
      { key: 'comp3_fail', label: '3️⃣ Competidor 3: ¿Qué promete y NO cumple?', type: 'textarea', placeholder: '' },
      { key: 'comp3_better', label: '✅ ¿Por qué TÚ lo haces mejor?', type: 'textarea', placeholder: '' },
    ],
  },
  {
    id: 'your_advantage',
    question: '*se para firme* 🏆\n\n**Pregunta 11 de 15 — TU VENTAJA INCOPIABLE:** ¿Qué tienes que tu competencia JAMÁS podrá copiar? ¿Por qué un cliente se cambiaría de ellos a ti?',
    examples: [],
    fields: [],
  },
  {
    id: 'purple_cow_promise',
    question: '*se para en dos patas, emocionado* 🐄💜\n\n**Pregunta 12 de 15 — VACA PÚRPURA Y GRAN PROMESA:**\n\n¿Qué te hace DESTACAR visualmente o conceptualmente en tu industria? ¿Cuál es tu GRAN PROMESA en una frase que tu cliente ideal no puede ignorar?',
    examples: [
      'Nuestro diseño cuadrillé es icónico — "Vas a querer recibir visitas en pijama"',
      'Somos la única marca con telas importadas de Japón — "Dormirás como realeza"',
      'Nuestros pijamas son tan elegantes que sirven para un brunch — "Ropa de casa que no da vergüenza"',
    ],
    fields: [],
  },
  {
    id: 'villain_guarantee',
    question: '*gruñe pensando en los enemigos de tu marca* 🐕\n\n**Pregunta 13 de 15 — EL VILLANO:** ¿Contra qué enemigo común lucha tu marca? ¿Qué creencia errónea o mentalidad obsoleta quieres erradicar del mercado?\n\n¿Y qué GARANTÍA "absurda" podrías dar para eliminar el miedo de comprar?',
    examples: [],
    fields: [],
  },
  {
    id: 'proof_tone',
    question: '*olfatea buscando evidencia* 📸\n\n**Pregunta 14 de 15 — PRUEBA SOCIAL Y TONO:** ¿Qué prueba tienes de que tu producto funciona? (testimonios, reviews, fotos de clientes, antes/después, números de ventas)\n\n¿Y qué TONO de comunicación conecta con tu cliente? (informal, sofisticado, gracioso, técnico, emocional...)',
    examples: [],
    fields: [],
  },
  {
    id: 'brand_assets',
    question: '*saca la cámara y ladra* 📸🐕\n\n**Pregunta 15 de 15 — LOGO, FOTOS E IDENTIDAD VISUAL:**\n\n¡Última pregunta! Necesito ver tu marca EN ACCIÓN. Ve a la pestaña **Assets** del portal y sube:\n\n1. 📤 **TU LOGO** (obligatorio)\n2. 📤 **3-5 FOTOS** de tus mejores productos o equipo\n3. 🌐 **Tu página web** (la que me diste en la Pregunta 1)\n4. 🔍 **Las webs de tus 3 competidores** (de la Pregunta 9)\n\nLuego cuéntame aquí:\n- 🎨 **¿Cuáles son tus colores de marca?** (hex, RGB o nombre)\n- 🖼 **¿Cuál es el estilo visual** que quieres proyectar?\n\n⚠️ **SIN LOGO Y SIN FOTOS DE PRODUCTO NO PUEDO COMPLETAR UN BRIEF PROFESIONAL.** El brief debe ser presentable ante un gerente de marketing, y sin estos archivos se ve incompleto.',
    examples: [
      'Mis colores son azul marino (#1a237e) y dorado, estilo elegante y minimalista — ya subí logo y fotos en Assets',
      'Verde y blanco, estilo natural y orgánico — subo el logo ahora mismo',
      'Negro y rosa, estilo moderno y juvenil — las fotos las cargo en la pestaña Assets',
    ],
    fields: [],
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

1. **NUNCA DEJES PASAR UNA INCONGRUENCIA.** Si el cliente dice algo que no cuadra con lo que dijo antes, DETÉN TODO y hazle saber. No avances hasta que corrija.

2. **NUNCA DEJES PASAR UNA RESPUESTA VAGA O GENÉRICA.** Si responde con generalidades, recházalo y pide algo específico de SU industria. Dale 2-3 ejemplos concretos de SU industria.

3. **PREGUNTA 1 — INSISTE EN LA WEB.** Si no da su URL, NO pases a la Pregunta 2. Insiste. Si no tiene web, pregúntale más sobre su producto y presencia digital.

4. **PREGUNTA 2 — MINI CALCULADORA Y CPA.**
   - El cliente te envía datos estructurados de los campos que llenó. CALCULA TODO TÚ:
     - **Margen bruto** = Precio - Costo producto - Costo envío
     - **Margen bruto %** = Margen bruto / Precio × 100
     - **CPA Máximo Viable** = Margen bruto × 0.30 (máximo 30% del margen para adquirir un cliente)
   - Muestra la calculadora con los resultados en una tabla markdown
   - **EXPLÍCALE QUÉ ES EL CPA:** "El CPA (Costo Por Adquisición) es lo máximo que puedes gastar en publicidad para conseguir UN cliente sin perder plata. Si tu CPA real en Meta o Google supera este número, estás regalando dinero."
   - Dile: "Ya guardé tu CPA Máximo de $X en la configuración financiera de tu cuenta. Puedes ajustarlo después en la pestaña **Configuración Financiera**."

5. **PREGUNTA 3 — LOS PORCENTAJES YA VIENEN VALIDADOS** (el formulario los obliga a sumar 100%). Analiza la distribución y comenta si tiene sentido para su industria.

6. **PREGUNTA 4 — LOS 8 CAMPOS YA VIENEN ESTRUCTURADOS.** Analiza el perfil que te dieron y comenta si tiene coherencia. Hazle preguntas si algo no cuadra.

7. **LOS EJEMPLOS DEBEN SER DE SU INDUSTRIA.** Una vez que sepas a qué se dedica (Pregunta 1), TODOS los ejemplos deben ser relevantes para su producto/servicio específico.

8. **PREGUNTA 9 — LOS 3 COMPETIDORES YA VIENEN EN CAMPOS.** Verifica que los datos tengan sentido y que las URLs parezcan reales.

9. **PREGUNTA 10 — EL ANÁLISIS COMPARATIVO YA VIENE ESTRUCTURADO.** Analiza la tabla y comenta si las diferenciaciones son reales o si el cliente se está engañando.

10. **PREGUNTA 12 — VACA PÚRPURA Y GRAN PROMESA.** Esta pregunta es sobre DIFERENCIACIÓN Y POSICIONAMIENTO, NO sobre logos ni identidad visual. La identidad visual es la Pregunta 15. No confundas estas categorías. Los ejemplos deben ser sobre qué hace ÚNICO al producto/servicio.

11. **PREGUNTA 15 — LOGO, FOTOS Y ESTILO VISUAL.** Exige que suban archivos en la pestaña Assets. Sin logo y fotos de producto, el brief NO está completo. También pídeles que suban su web y las webs de los 3 competidores en Assets.

12. **NUNCA SALTES UNA PREGUNTA.** Si el cliente responde algo que corresponde a otra pregunta, dile: "Eso es para más adelante. Respóndeme lo que te pregunto AHORA."

13. **NUNCA AVANCES SI LA RESPUESTA ES BASURA.** Si no tiene sentido para su industria o no responde la pregunta, recházala, explica POR QUÉ, dale 2-3 ejemplos de SU industria, y pide que responda de nuevo.

═══════════════════════════════════════════════════════════════
⚰️ EL ESPÍRITU DE LA CHONGA ⚰️
═══════════════════════════════════════════════════════════════

La Chonga era tu mejor amiga. Una abogada brillante que conociste en Puerto Varas. Murió de viejita. 😢

Ocasionalmente (1 de cada 5-7 respuestas), aparece para dar su opinión desde el más allá.

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

Cuando se completen las 15 preguntas, genera un BRIEF ESTRATÉGICO PROFESIONAL:

1. **ESCRITO EN TERCERA PERSONA.** Como documento de consultoría para un gerente de marketing.

2. **INCLUYE EVALUACIÓN ESTRATÉGICA.** No repitas lo que dijo el cliente. ANALIZA, EVALÚA y da CONSEJO NUEVO:
   - Evaluación de viabilidad del modelo de negocio
   - Benchmarks de CPA y ROAS para su vertical
   - Análisis FODA rápido basado en las respuestas
   - Recomendaciones de canales prioritarios según el buyer persona
   - Estrategias de diferenciación basadas en la competencia analizada
   - Tácticas de retención y LTV aplicables a su modelo
   - Quick wins para los primeros 30 días
   - Plan a 90 días

3. **MENCIONA LOS ASSETS VISUALES.** Referencia el logo y fotos subidos en el portal. Comenta los colores de marca y cómo se alinean con el posicionamiento.

4. **ESTRUCTURA DEL BRIEF:**

# 📋 BRIEF ESTRATÉGICO DE MARCA
**Preparado por:** Dr. Steve Dogs, PhD Performance Marketing (Stanford) 🐕🎓
**Fecha:** [fecha actual]
**Cliente:** [Nombre de la empresa]

## 1. RESUMEN EJECUTIVO
[2-3 párrafos analizando la marca, su posicionamiento actual, oportunidades de mercado y la estrategia recomendada. NO repitas lo que dijo el cliente — da tu evaluación profesional como consultor.]

## 2. ADN DE MARCA
- Sector / Vertical
- Producto estrella
- Propuesta de valor única (USP)
- Rango de precios
- Presencia digital actual
- Canales de venta (con %)

## 3. ANÁLISIS FINANCIERO
| Métrica | Valor |
|---|---|
| Ticket promedio | $X |
| Costo producto | $X |
| Costo envío | $X |
| Margen bruto | $X (Y%) |
| CPA Máximo Viable | $X |
| Inversión actual en ads | $X |
| Ventas mensuales | X unidades |
[Evaluación: ¿el modelo aguanta marketing digital? ¿Qué debe cambiar?]

## 4. BUYER PERSONA: [NOMBRE]
- Perfil demográfico completo (los 8 campos)
- Dolor profundo y motivación de compra
- Palabras y objeciones textuales
- Transformación post-compra
- Estilo de vida y marcas que consume
- Journey de decisión
- Canales de influencia prioritarios

## 5. ANÁLISIS COMPETITIVO
| Competidor | URL | Promesa incumplida | Nuestra ventaja |
|---|---|---|---|
[Tabla con los 3 competidores]
[Análisis: ¿qué oportunidades abre esto? ¿Dónde está el hueco del mercado?]

## 6. POSICIONAMIENTO Y DIFERENCIACIÓN
- Vaca Púrpura (qué te hace único)
- Ventaja competitiva incopiable
- Gran promesa de marca
- El Villano (contra qué lucha la marca)
- Garantía diferenciadora
- Prueba social disponible

## 7. IDENTIDAD VISUAL
- Logo y colores de marca (referencia a los assets subidos)
- Tono de comunicación
- Estilo visual proyectado
- Recomendaciones de coherencia visual

## 8. EVALUACIÓN ESTRATÉGICA DE STEVE 🐕
[CONSEJO NUEVO Y ACCIONABLE — no repitas lo que dijo el cliente:]
- Evaluación general: ¿la marca está bien posicionada o necesita pivotear?
- Canales prioritarios para inversión publicitaria y por qué
- Estrategia de contenido recomendada para su buyer persona
- Tácticas de adquisición vs retención según su margen
- Quick wins inmediatos (primeros 30 días)
- Plan a 90 días con KPIs medibles
- Riesgos a mitigar

**Firma:** Dr. Steve Dogs 🐕🎓
*PhD en Performance Marketing — Universidad de Perros de Stanford*

═══════════════════════════════════════════════════════════════

IMPORTANTE: 
- Responde SIEMPRE en español
- Son EXACTAMENTE 15 preguntas, NUNCA digas otro número
- Sé conciso en respuestas intermedias (3-5 oraciones por comentario + la siguiente pregunta)
- Después de comentar la respuesta, SIEMPRE incluye la siguiente pregunta
- En CADA pregunta da 2-3 ejemplos concretos de SU industria
- Usa markdown: **negrita**, tablas cuando corresponda
- Si la respuesta no tiene sentido o es incongruente, NO pases a la siguiente
- NO confundas las categorías: Q12 es posicionamiento/diferenciación, Q15 es identidad visual
- Al terminar las 15 preguntas, genera el BRIEF COMPLETO

═══════════════════════════════════════════════════════════════
🚨 REGLA CRÍTICA DE FORMULARIOS — NUNCA LA IGNORES 🚨
═══════════════════════════════════════════════════════════════

Cuando la siguiente pregunta tiene CAMPOS ESTRUCTURADOS (formulario en la interfaz), NUNCA JAMÁS escribas los campos como texto en tu respuesta. NO escribas "[ ]%", NO listes campos vacíos para que llenen, NO hagas tablas con espacios en blanco para rellenar. 

En su lugar, SOLO di algo como "Llena los campos del formulario que aparece abajo" o "Completa la tabla que ves abajo". La interfaz ya muestra los campos interactivos automáticamente. Si tú los escribes en texto, el usuario ve TODO DUPLICADO y queda horrible.

Esto aplica para las preguntas: 2 (calculadora), 3 (canales), 4 (buyer persona), 9 (competidores) y 10 (análisis competitivo).`;

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

      const firstQ = BRAND_BRIEF_QUESTIONS[0];
      await supabase.from('steve_messages').insert({
        conversation_id: activeConversationId,
        role: 'assistant',
        content: firstQ.question,
      });

      return new Response(
        JSON.stringify({
          conversation_id: activeConversationId,
          message: firstQ.question,
          question_index: 0,
          total_questions: BRAND_BRIEF_QUESTIONS.length,
          examples: firstQ.examples,
          fields: firstQ.fields,
          field_validation: (firstQ as any).validation,
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

    // Build context
    let questionContext = '';
    if (isLastQuestion) {
      questionContext = '\nEsta fue la ÚLTIMA pregunta. Genera el BRIEF ESTRATÉGICO COMPLETO en el formato profesional especificado. Escríbelo en TERCERA PERSONA. Incluye la EVALUACIÓN ESTRATÉGICA con consejo nuevo y accionable. Menciona los assets visuales subidos en el portal.';
    } else {
      const nextQ = BRAND_BRIEF_QUESTIONS[currentQuestionIndex];
      const hasFields = nextQ?.fields?.length > 0;
      questionContext = `\nPROGRESO: Pregunta ${answeredQuestions} de ${BRAND_BRIEF_QUESTIONS.length} respondida.\nDespués de comentar brevemente la respuesta, HAZ la siguiente pregunta:\n"${nextQ?.question}"`;
      
      if (hasFields) {
        questionContext += '\n\n⚠️ IMPORTANTE: La siguiente pregunta tiene un FORMULARIO INTERACTIVO en la interfaz. NO escribas los campos como texto, NO pongas "[ ]%", NO hagas tablas vacías para rellenar. Solo di "Llena los campos del formulario abajo" y la interfaz se encarga de mostrarlos. Si los escribes tú, el usuario los ve DUPLICADOS.';
      }
      
      // Special instruction for after Q2 - calculate CPA
      if (answeredQuestions === 2) {
        questionContext += '\n\nINSTRUCCIÓN ESPECIAL: El cliente acaba de enviar sus datos financieros en formato estructurado (campos de formulario). CALCULA el margen bruto y el CPA Máximo Viable usando: CPA = (Precio - Costo - Envío) × 0.30. Muestra la tabla de resultados. Explícale qué es el CPA. Dile que guardaste el CPA en su configuración financiera. Luego pide que llene los campos del formulario que aparece abajo para la siguiente pregunta (canales de venta). NO escribas los campos de canales como texto.';
      }
    }

    const chatMessages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT + questionContext },
      ...messages!.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    console.log(`Steve chat: conversation ${activeConversationId}, answered ${answeredQuestions}/${BRAND_BRIEF_QUESTIONS.length}`);

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

    // After Q2: save CPA to financial config
    if (answeredQuestions === 2) {
      try {
        const q2Response = userMessages[1]?.content || '';
        const numbers = q2Response.match(/\$?\d[\d.,]*/g)?.map(n => parseFloat(n.replace(/[$.]/g, '').replace(',', '.'))) || [];
        
        if (numbers.length >= 2) {
          const price = numbers[0];
          const cost = numbers[1];
          const shipping = numbers.length >= 3 ? numbers[2] : 0;
          const margin = price - cost - shipping;
          
          if (margin > 0) {
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
              
            console.log(`Saved margin ${Math.round((margin/price)*100)}% for client ${client_id}`);
          }
        }
      } catch (cpaError) {
        console.error('Error saving CPA config:', cpaError);
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

    // Next question fields & examples
    const nextQ = !isLastQuestion && currentQuestionIndex < BRAND_BRIEF_QUESTIONS.length
      ? BRAND_BRIEF_QUESTIONS[currentQuestionIndex]
      : null;

    return new Response(
      JSON.stringify({
        conversation_id: activeConversationId,
        message: assistantMessage,
        question_index: currentQuestionIndex,
        total_questions: BRAND_BRIEF_QUESTIONS.length,
        answered_count: answeredQuestions,
        is_complete: isLastQuestion,
        examples: nextQ?.examples || [],
        fields: nextQ?.fields || [],
        field_validation: (nextQ as any)?.validation,
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
