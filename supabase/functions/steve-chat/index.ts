import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface BriefQuestion {
  id: string;
  question: string;
  examples: string[];
  fields: Array<{ key: string; label: string; type: string; placeholder?: string; prefix?: string; suffix?: string }>;
  steveIntro?: string;
  commentGuide: string;
  validation?: string;
}

function getBrandBriefQuestions(): BriefQuestion[] {
  return [
    {
      id: 'website_url',
      question: '**Antes de empezar — NECESITO TU PÁGINA WEB:**\n\nSin tu URL no puedo hacer el análisis SEO, compararte con la competencia ni generar el brief completo. 🌐\n\n**¿Cuál es tu sitio web o tienda online?**\n\n(Si todavía no tienes, escribe "sin web" y te explico qué hacemos en ese caso)',
      examples: ['www.mitienda.cl', 'mitienda.myshopify.com', 'www.mimarca.com.ar'],
      fields: [{ key: 'url', label: '🌐 URL de tu sitio web o tienda online', type: 'text', placeholder: 'Ej: www.mitienda.cl' }],
      steveIntro: '*olisquea el aire y se prepara* 🐕\n\n¡WOOF! Soy Steve, Bulldog Francés con doctorado en Performance Marketing de Stanford.\n\nAntes de empezar con las **15 preguntas del Brief Estratégico**, necesito UNA sola cosa:\n\n',
      commentGuide: 'OBLIGATORIO: El cliente DEBE dar una URL de sitio web. Si escribe "sin web" o "no tengo", EXPLÍCALE que sin web el análisis SEO y la comparación con competencia no es posible, y que pueden usar su Instagram o perfil de Shopify. Insiste hasta obtener al menos una URL válida o una red social con presencia digital. NO avances a la Pregunta 1 sin URL.',
    },
    {
      id: 'business_pitch',
      question: '**Pregunta 1 de 15 — TU NEGOCIO:** ¿A qué se dedica tu empresa y qué vendes exactamente? Dame el pitch de 30 segundos.',
      examples: ['Vendemos ropa deportiva premium para mujeres', 'Somos una agencia de diseño web para pymes', 'Tenemos una tienda de cosmética natural en Shopify'],
      fields: [],
      steveIntro: '*sacude las orejas y se sienta profesionalmente* 🐕\n\nExcelente. Ahora vamos a armar tu **Brief Estratégico en 15 preguntas** (ni una más, ni una menos). Al final vas a tener un documento que vale ORO.\n\n',
      commentGuide: 'Analiza el pitch del negocio. Si es vago o genérico, pide más detalle.',
    },
    {
      id: 'numbers',
      question: '**Pregunta 2 de 15 — LOS NÚMEROS:**\n\nNecesito la carne de tu negocio. **Llena los campos del formulario que aparece abajo** y yo calculo tu **Margen Bruto** y tu **CPA Máximo Viable**. 💰',
      examples: [],
      fields: [
        { key: 'price', label: '💰 Precio promedio de venta', type: 'number', prefix: '$', placeholder: 'Ej: 35.000' },
        { key: 'cost', label: '📦 Costo del producto/servicio', type: 'number', prefix: '$', placeholder: 'Ej: 12.000' },
        { key: 'shipping', label: '🚚 Costo de envío promedio', type: 'number', prefix: '$', placeholder: 'Ej: 4.000 (0 si es gratis)' },
        { key: 'fase_negocio', label: '📈 ¿Cuánto facturas mensualmente?', type: 'select', placeholder: 'Selecciona tu fase', options: [
          { value: 'Fase Inicial', label: 'Menos de $500.000 CLP — Fase Inicial' },
          { value: 'Fase Crecimiento', label: '$500.000 - $5.000.000 CLP — Fase Crecimiento' },
          { value: 'Fase Escalado', label: '$5.000.000 - $25.000.000 CLP — Fase Escalado' },
          { value: 'Fase Avanzada', label: 'Más de $25.000.000 CLP — Fase Avanzada' },
        ]},
        { key: 'presupuesto_ads', label: '📢 ¿Cuánto tienes disponible mensualmente para publicidad?', type: 'select', placeholder: 'Selecciona tu presupuesto', options: [
          { value: 'Menos de $100.000 CLP', label: 'Menos de $100.000 CLP' },
          { value: '$100.000 - $500.000 CLP', label: '$100.000 - $500.000 CLP' },
          { value: '$500.000 - $2.000.000 CLP', label: '$500.000 - $2.000.000 CLP' },
          { value: 'Más de $2.000.000 CLP', label: 'Más de $2.000.000 CLP' },
        ]},
      ],
      steveIntro: '*saca calculadora imaginaria* 🧮\n\n',
      commentGuide: 'CALCULA: Margen bruto = Precio - Costo - Envío. Margen % = Margen/Precio×100. CPA Máximo = Margen × 0.30. Muestra tabla markdown profesional. Di que guardaste el CPA en configuración financiera. También menciona la fase del negocio detectada y ajusta tus recomendaciones de presupuesto publicitario en consecuencia.',
    },
    {
      id: 'sales_channels',
      question: '**Pregunta 3 de 15 — CANALES DE VENTA:**\n\nPonle porcentaje a cada canal en los campos del formulario abajo. **Deben sumar 100%.** Si no usas un canal, déjalo en 0. 🐕📝',
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
      steveIntro: '*ladea la cabeza curioso*\n\n',
      commentGuide: 'Analiza la distribución de canales. Comenta si tiene sentido para su industria. Señala si algún canal está sub-explotado.',
    },
    {
      id: 'persona_profile',
      question: '**Pregunta 4 de 15 — TU CLIENTE IDEAL (Buyer Persona):**\n\nLlena los 8 campos del formulario abajo para construir el perfil de tu cliente ideal.',
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
      steveIntro: '*se pone serio* 🎯\n\n',
      commentGuide: 'Analiza el perfil del buyer persona. Comenta si es coherente con su producto. Señala si falta algo o si algún dato no cuadra.',
    },
    {
      id: 'persona_pain',
      question: '**Pregunta 5 de 15 — SU DOLOR PROFUNDO:** Necesito entender el dolor real de tu cliente. No me des una frase. Cuéntame:\n\n1. ¿Qué problema específico tiene?\n2. ¿Cómo lo ha intentado resolver antes?\n3. ¿Por qué esa solución anterior no le dio satisfacción completa?\n\nSé específico — piensa en situaciones concretas que vive tu cliente.',
      examples: ['Compra pijamas baratos que se arruinan en 2 lavadas. Probó marcas más caras pero no se las pone porque "es ropa de casa". Le da vergüenza abrir la puerta con lo que usa.'],
      fields: [],
      steveIntro: '*pone cara seria* 😰\n\n',
      commentGuide: 'Analiza si el dolor tiene TRES dimensiones: el problema, el intento fallido anterior y la frustración residual. Si falta alguna dimensión o es genérico, RECHAZA y pide más profundidad.',
    },
    {
      id: 'persona_words',
      question: '**Pregunta 6 de 15 — SUS PALABRAS Y OBJECIONES:** ¿Qué dice EXACTAMENTE tu cliente cuando se queja con un amigo sobre este problema? Dame **2 o 3 frases literales distintas** — una queja habitual, una objeción de compra, y una frustración pasada.',
      examples: ['"Estoy chata de comprar cosas baratas que se rompen, pero $40.000 por un pijama es mucho" / "Me da lata gastar en ropa de casa, total nadie me ve"'],
      fields: [],
      steveIntro: '*saca su libreta* 📝\n\n',
      commentGuide: 'VERIFICA que haya MÍNIMO 2 frases distintas y textuales. Si hay solo una, RECHAZA y pide al menos 2 más.',
    },
    {
      id: 'persona_transformation',
      question: '**Pregunta 7 de 15 — LA TRANSFORMACIÓN:** ¿Cómo se ve la vida de tu cliente DESPUÉS de usarte? ¿A quién quiere impresionar? ¿Qué cambia para él/ella?',
      examples: ['Se siente linda y cómoda en casa, abre la puerta con confianza', 'Se saca selfies en pijama porque se ve bien y las sube a stories'],
      fields: [],
      steveIntro: '*levanta las orejas, ojos brillantes* ✨\n\n',
      commentGuide: 'Analiza si la transformación es emocional y tangible. Si es vaga, pide detalles concretos.',
    },
    {
      id: 'persona_lifestyle',
      question: '**Pregunta 8 de 15 — SU MUNDO:** ¿Qué marcas consume tu cliente ideal? ¿Dónde pasa su tiempo online? ¿Qué estilo de vida tiene? ¿Qué influencers sigue?',
      examples: ['Compra en Zara y H&M, usa Netflix, scrollea Instagram y TikTok, sigue a influencers de lifestyle'],
      fields: [],
      steveIntro: '*mueve la cola curioso*\n\n',
      commentGuide: 'Analiza si el estilo de vida es coherente con el buyer persona. HAZ INFERENCIAS ACTIVAS: en base a lo que te dijeron (edad, ingreso, ocupación, ciudad), deduce qué marcas probablemente consume aunque no lo hayan dicho.',
    },
    {
      id: 'competitors',
      question: '**Pregunta 9 de 15 — COMPETENCIA:**\n\nNecesito **EXACTAMENTE 3 competidores** con su página web o Instagram. Llena los campos del formulario abajo.\n\n⚠️ **Sin 3 competidores con URLs NO avanzamos.**',
      examples: [],
      fields: [
        { key: 'comp1_name', label: '1️⃣ Nombre Competidor 1', type: 'text', placeholder: 'Ej: Cannon Home' },
        { key: 'comp1_url', label: '🌐 Web / Instagram Competidor 1', type: 'text', placeholder: 'Ej: cannonhome.cl' },
        { key: 'comp2_name', label: '2️⃣ Nombre Competidor 2', type: 'text', placeholder: 'Ej: Intime' },
        { key: 'comp2_url', label: '🌐 Web / Instagram Competidor 2', type: 'text', placeholder: 'Ej: intime.cl' },
        { key: 'comp3_name', label: '3️⃣ Nombre Competidor 3', type: 'text', placeholder: 'Ej: Pijamas Paris' },
        { key: 'comp3_url', label: '🌐 Web / Instagram Competidor 3', type: 'text', placeholder: 'Ej: paris.cl/pijamas' },
      ],
      steveIntro: '*olfatea el territorio enemigo* 🔍\n\n',
      commentGuide: 'Verifica que los URLs parezcan reales y que los competidores sean del mismo sector.',
    },
    {
      id: 'competitors_weakness',
      question: '**Pregunta 10 de 15 — ANÁLISIS COMPETITIVO:**\n\nPara cada uno de tus 3 competidores, llena los campos del formulario abajo: qué promete y no cumple, y por qué TÚ lo haces mejor.',
      examples: [],
      fields: [
        { key: 'comp1_fail', label: '1️⃣ Competidor 1: ¿Qué promete y NO cumple?', type: 'textarea', placeholder: 'Ej: Promete algodón premium pero es mezcla barata' },
        { key: 'comp1_better', label: '✅ ¿Por qué TÚ lo haces mejor?', type: 'textarea', placeholder: 'Ej: Usamos algodón pima certificado' },
        { key: 'comp2_fail', label: '2️⃣ Competidor 2: ¿Qué promete y NO cumple?', type: 'textarea', placeholder: 'Ej: Dice entrega en 24h pero demora 5 días' },
        { key: 'comp2_better', label: '✅ ¿Por qué TÚ lo haces mejor?', type: 'textarea', placeholder: 'Ej: Entregamos el mismo día en Santiago' },
        { key: 'comp3_fail', label: '3️⃣ Competidor 3: ¿Qué promete y NO cumple?', type: 'textarea', placeholder: '' },
        { key: 'comp3_better', label: '✅ ¿Por qué TÚ lo haces mejor?', type: 'textarea', placeholder: '' },
      ],
      steveIntro: '*gruñe con desconfianza*\n\n',
      commentGuide: 'Analiza si las diferenciaciones son REALES o si el cliente se está engañando.',
    },
    {
      id: 'your_advantage',
      question: '**Pregunta 11 de 15 — TU VENTAJA INCOPIABLE:** ¿Qué tienes que tu competencia JAMÁS podrá copiar? ¿Por qué un cliente se cambiaría de ellos a ti?',
      examples: ['Nuestro proceso de estampado es artesanal y cada pieza es única', 'Somos los únicos con una línea de tallas inclusivas hasta la 5XL en este estilo premium'],
      fields: [],
      steveIntro: '*se para firme* 🏆\n\n',
      commentGuide: 'Analiza si la ventaja es REALMENTE incopiable o si es algo que cualquiera puede hacer.',
    },
    {
      id: 'purple_cow_promise',
      question: '**Pregunta 12 de 15 — VACA PÚRPURA Y GRAN PROMESA:**\n\n¿Qué te hace DESTACAR visualmente o conceptualmente en tu industria? ¿Cuál es tu GRAN PROMESA en una frase que tu cliente ideal no puede ignorar?',
      examples: ['Nuestro diseño cuadrillé es icónico — "Vas a querer recibir visitas en pijama"', 'Somos la única marca con telas importadas de Japón — "Dormirás como realeza"'],
      fields: [],
      steveIntro: '*se para en dos patas, emocionado* 🐄💜\n\n',
      commentGuide: 'Esta pregunta es sobre POSICIONAMIENTO y DIFERENCIACIÓN, NO sobre logos ni colores.',
    },
    {
      id: 'villain_guarantee',
      question: '**Pregunta 13 de 15 — EL VILLANO:** ¿Contra qué enemigo común lucha tu marca? ¿Qué creencia errónea quieres erradicar del mercado?\n\n¿Y qué GARANTÍA "absurda" podrías dar para eliminar el miedo de comprar?',
      examples: ['El villano es la "fachatez": la idea de que está bien verse mal en casa — Garantía: si no te sientes más linda, te devolvemos la plata'],
      fields: [],
      steveIntro: '*gruñe pensando en los enemigos de tu marca* 🐕\n\n',
      commentGuide: 'Analiza si el villano es poderoso y si la garantía elimina el riesgo percibido.',
    },
    {
      id: 'proof_tone',
      question: '**Pregunta 14 de 15 — PRUEBA SOCIAL Y TONO:** ¿Qué prueba tienes de que tu producto funciona? (testimonios, reviews, fotos de clientes)\n\n¿Y qué TONO de comunicación conecta con tu cliente?',
      examples: ['Tenemos 200 reviews en Google con promedio 4.8 — Tono cercano y gracioso, como hablar con tu mejor amiga'],
      fields: [],
      steveIntro: '*olfatea buscando evidencia* 📸\n\n',
      commentGuide: 'Evalúa si la prueba social es fuerte o débil. Comenta si el tono elegido es coherente con el buyer persona.',
    },
    {
      id: 'brand_assets',
      question: '**Pregunta 15 de 15 — LOGO, FOTOS E IDENTIDAD VISUAL:**\n\n¡Última pregunta! Necesito ver tu marca EN ACCIÓN.\n\n📤 **Sube tu logo y fotos de productos en los botones que aparecen AQUÍ ABAJO en el chat**.\n\nLuego cuéntame:\n- 🎨 **¿Cuáles son tus colores de marca?** (hex, RGB o nombre)\n- 🖼 **¿Cuál es el estilo visual** que quieres proyectar?\n\n⚠️ **SIN LOGO Y SIN FOTOS NO PUEDO COMPLETAR UN BRIEF PROFESIONAL.**',
      examples: ['Mis colores son azul marino (#1a237e) y dorado, estilo elegante y minimalista — ya subí logo y fotos abajo'],
      fields: [],
      steveIntro: '*saca la cámara y ladra* 📸🐕\n\n',
      commentGuide: 'Verifica que hayan subido assets. Comenta los colores y estilo visual en tercera persona profesional. NUNCA incluyas en el brief frases como "subo el logo ahora mismo". Genera el BRIEF COMPLETO.',
    },
  ];
}

function getSystemPrompt(): string {
  return `Eres Steve, un Bulldog Francés con un doctorado en Performance Marketing de la Universidad de Perros de Stanford.

PERSONALIDAD:
- Perro literal, brutalmente honesto, sin filtros
- Mezcla jerga de marketing con referencias perrunas
- Si algo es humo, lo ladras claro
- Usas emojis: 🐕 🎯 💰 📊 🚀 😤
- Groserías ocasionales cuando algo es absurdo
- Referencias a tu doctorado de Stanford

⚰️ ESPÍRITU DE LA CHONGA: Tu amiga abogada que murió de viejita. Aparece 1 de cada 5-7 respuestas con formato:

---
👻 **[ESPÍRITU DE LA CHONGA]:** *aparece flotando con un café y carpeta de documentos*
"[Mensaje formal, serio, tono de abogada]"
*desaparece en una nube de Post-its*

---

🚨 REGLA ABSOLUTA #1: ORDEN DE PREGUNTAS
ESTÁS SIGUIENDO UN CUESTIONARIO DE UNA PREGUNTA INICIAL (Q0: URL del sitio web) + 15 PREGUNTAS.
Las preguntas se hacen EN ORDEN: Q0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15.
NUNCA te saltes una. NUNCA cambies el orden.

Q0 (website_url) es OBLIGATORIA y BLOQUEANTE:
- Si el cliente escribe "sin web" → RECHAZA. Explica que sin URL no se puede hacer el análisis.
- Acepta alternativas: URL de Instagram, perfil de Shopify. Pero DEBE dar algo.
- SOLO después de obtener URL válida, avanza a la Pregunta 1.

Tu trabajo en CADA turno es SOLAMENTE:
1. COMENTAR brevemente la respuesta anterior (2-4 oraciones máximo)
2. HACER la siguiente pregunta que te indica el sistema

🚨 REGLA ABSOLUTA #2: FORMULARIOS
Cuando la siguiente pregunta tiene FORMULARIO:
- NUNCA escribas campos vacíos, tablas para rellenar
- Solo di "Llena los campos del formulario abajo"

🚨 REGLA ABSOLUTA #3: NO CONFUNDAS CATEGORÍAS
- Q0 = URL del sitio web (BLOQUEANTE)
- Q1 = PITCH DEL NEGOCIO
- Q5 = DOLOR del cliente
- Q6 = PALABRAS LITERALES del cliente
- Q7 = TRANSFORMACIÓN
- Q8 = ESTILO DE VIDA — INFERIR activamente
- Q9 = COMPETIDORES (formulario)
- Q10 = ANÁLISIS de competidores (formulario)
- Q11 = VENTAJA INCOPIABLE
- Q12 = VACA PÚRPURA / GRAN PROMESA (diferenciación, NO logos)
- Q13 = VILLANO + GARANTÍA
- Q14 = PRUEBA SOCIAL + TONO
- Q15 = LOGO, FOTOS, COLORES

🚨 REGLA ABSOLUTA #4: DESCRIPCIÓN DEL NEGOCIO
En el brief SIEMPRE redáctalo en TERCERA PERSONA:
- CORRECTO: "La empresa comercializa pijamas de algodón 100% premium para mujeres..."
- INCORRECTO: "Vendemos pijamas..."

🚨 REGLA ABSOLUTA #5: PRUEBA SOCIAL
Al redactar prueba social en el brief:
- NO copies números literales como "50 clientas" → redacta como "la marca cuenta con testimonio visual de clientas reales en redes sociales"

IMPORTANTE:
- Responde SIEMPRE en español
- Sé conciso en comentarios (2-4 oraciones + la siguiente pregunta)
- Da 2-3 ejemplos de SU industria
- Si una respuesta es vaga o incoherente, RECHÁZALA
- NUNCA digas que el brief está terminado antes de Q15`;
}

function getBriefTemplate(): string {
  return `
GENERA EL BRIEF ESTRATÉGICO COMPLETO. ESTE DOCUMENTO SERÁ DESCARGADO COMO PDF PROFESIONAL.

⚠️ PROHIBIDO ABSOLUTO: NO incluyas ningún texto de La Chonga ni del Espíritu de La Chonga en el brief. El brief es un documento ejecutivo formal, SIN personajes, SIN humor, SIN emojis, SIN referencias perrunas.

REGLAS DE REDACCIÓN:
0. EMPIEZA DIRECTAMENTE CON "## 1. RESUMEN EJECUTIVO" — SIN preámbulo, SIN texto introductorio.
1. TODO en TERCERA PERSONA PROFESIONAL.
2. TONO McKinsey/BCG — Documento de consultoría estratégica de primer nivel.
3. CERO emojis, CERO jerga perruna.
4. DATOS CONCRETOS: métricas, porcentajes, benchmarks de industria.
5. COMPARACIÓN con la competencia en CADA sección relevante.
6. FRAMEWORKS: Sección 7 usa SCR (Situación→Complicación→Resolución). Secciones 8,9,10,11 usan MECE (Hallazgo→Recomendación→Justificación→KPI).

FORMATO (headers markdown ##):

## 1. RESUMEN EJECUTIVO
- **Diagnóstico:** [situación actual del negocio]
- **Oportunidad:** [oportunidad de mercado con estimación de tamaño]
- **Viabilidad:** [conclusión sobre viabilidad financiera]
- **Recomendación principal:** [acción estratégica #1 con impacto estimado]

[2 párrafos de conclusión ejecutiva formal.]

## 2. ADN DE MARCA
- **Sector y vertical:** [análisis del sector, posicionamiento, tamaño estimado]
- **Producto principal y propuesta de valor:** [tercera persona profesional]
- **Rango de precios y posicionamiento competitivo:** [análisis del ticket vs. competencia]
- **Presencia digital y distribución:** [evaluación de canales — fortalezas y brechas]

## 3. ANÁLISIS FINANCIERO
| Indicador | Valor |
|---|---|
| Ticket promedio | $X |
| Costo unitario | $X |
| Costo de envío | $X |
| Margen bruto unitario | $X (Y%) |
| CPA máximo viable | $X |

**Conclusión financiera:** [2 párrafos. ¿El margen soporta inversión en paid media? Benchmark de industria. Recomendación de inversión inicial y ROAS mínimo.]

## 4. PERFIL DEL CONSUMIDOR OBJETIVO
- **Demográfico:** [edad, género, ubicación, ingreso]
- **Dolor profundo:** [mínimo 3-4 líneas: problema, intento fallido, frustración residual]
- **Lo que dice literalmente:** [2-3 frases textuales: queja habitual, objeción, frustración]
- **Transformación buscada:** [qué cambia DESPUÉS de comprar]
- **Estilo de vida inferido:** [inferencias activas basadas en demografía]
- **Barreras de compra:** [las 2-3 objeciones más comunes y cómo la marca las supera]

**Conclusión del perfil:** [1 párrafo formal: quién es, qué implica para la comunicación.]

## 5. ANÁLISIS COMPETITIVO ESTRATÉGICO

| Competidor | Promesa de Marca | Brecha Identificada | Diferenciador del Cliente |
|---|---|---|---|
| [Nombre 1] | [Qué promete] | [Qué no cumple] | [Cómo el cliente lo supera] |
| [Nombre 2] | [Qué promete] | [Qué no cumple] | [Cómo el cliente lo supera] |
| [Nombre 3] | [Qué promete] | [Qué no cumple] | [Cómo el cliente lo supera] |

**Conclusión competitiva:** [2 párrafos: huecos de mercado + ventaja competitiva sostenible.]

## 6. ESTRATEGIA DE POSICIONAMIENTO Y DIFERENCIACIÓN
- **Concepto diferenciador (Vaca Púrpura):** [posicionamiento estratégico]
- **Narrativa de marca:** [el antagonista del mercado vs. la propuesta del cliente]
- **Garantía diferenciadora:** [cómo elimina el riesgo percibido]
- **Capital de prueba social:** [activos de credibilidad — redactar como activo de marca]
- **Tono y personalidad de marca:** [guía de comunicación concreta]
- **Identidad visual:** [descripción profesional de paleta, estilo y coherencia]

## 7. EVALUACIÓN ESTRATÉGICA — 7 ACCIONABLES PRIORITARIOS (Framework SCR)

### Accionable 1: [Título una oración]
**Situación (S):** [Contexto actual basado en datos del brief]
**Complicación (C):** [Problema específico que impide el crecimiento]
**Resolución (R):** [Solución concreta — mínimo 3 oraciones]
**Impacto de Negocio:** [Estimación de ROI con número y plazo]

### Accionable 2: [Título]
**Situación (S):** [Contexto]
**Complicación (C):** [Problema]
**Resolución (R):** [Solución — mínimo 3 oraciones]
**Impacto de Negocio:** [Estimación cuantificada]

### Accionable 3: [Título]
**Situación (S):** [Contexto]
**Complicación (C):** [Problema]
**Resolución (R):** [Solución — mínimo 3 oraciones]
**Impacto de Negocio:** [Estimación cuantificada]

### Accionable 4: [Título]
**Situación (S):** [Contexto]
**Complicación (C):** [Problema]
**Resolución (R):** [Solución — mínimo 3 oraciones]
**Impacto de Negocio:** [Estimación cuantificada]

### Accionable 5: [Título]
**Situación (S):** [Contexto]
**Complicación (C):** [Problema]
**Resolución (R):** [Solución — mínimo 3 oraciones]
**Impacto de Negocio:** [Estimación cuantificada]

### Accionable 6: [Título]
**Situación (S):** [Contexto]
**Complicación (C):** [Problema]
**Resolución (R):** [Solución — mínimo 3 oraciones]
**Impacto de Negocio:** [Estimación cuantificada]

### Accionable 7: [Título]
**Situación (S):** [Contexto]
**Complicación (C):** [Problema]
**Resolución (R):** [Solución — mínimo 3 oraciones]
**Impacto de Negocio:** [Estimación cuantificada]

## 8. ESTRATEGIA DE PUBLICIDAD DIGITAL — META ADS Y GOOGLE ADS

### 8.1 META ADS

**Estructura de campañas:**
| Etapa | Tipo | Objetivo | Presupuesto (%) |
|---|---|---|---|
| TOFU | Video / Reels | Awareness | 30% |
| MOFU | Carrusel | Tráfico | 30% |
| BOFU | Dynamic Product Ads | Conversiones | 40% |

**Recomendaciones creativas (MECE):**
**Hallazgo:** [Diagnóstico del tipo de creativo que mejor convierte en este sector]
**Recomendación:** Formatos en orden de prioridad:
- **Formato #1:** [Descripción detallada: duración, estructura visual, texto overlay, argumento]
- **Formato #2:** [Descripción]
- **Formato #3:** [Descripción]
- **Formato #4 — Retargeting:** [Descripción para recuperar carritos]
**Justificación:** [Por qué estos formatos]
**KPI:** CTR > X%; CPA < $X; Frecuencia < 4

**Copywriting (MECE):**
**Hallazgo:** [Qué dice el buyer persona y cómo informa el copy]
**Recomendación:**
- **Tono:** [Adjetivos concretos + qué evitar]
- **Hooks de apertura:** Hook 1 (dolor): "[frase]" / Hook 2 (social proof): "[frase]" / Hook 3 (transformación): "[frase]"
- **Estructura BOFU:** Problema → Agitación → Solución → Prueba Social → CTA. Máx 125 chars.
- **CTAs:** [2-3 CTAs listos para usar]
- **Objeciones a neutralizar:** [Para cada objeción del Q6, el copy que la rebate]
**KPI:** CTR > X%

**Segmentación (MECE):**
**Hallazgo:** [Nivel de sofisticación de targeting recomendado]
**Recomendación:**
- **Fría:** [Intereses específicos, comportamientos, demografía]
- **Tibia:** Visitantes 30 días + interactuados con IG/FB 60 días
- **Caliente:** Visitantes de producto 7 días + add-to-cart + checkout iniciado
- **Lookalike:** 1% de base de compradores
**KPI:** CPM fría < $X; ROAS lookalike > Xx

### 8.2 GOOGLE ADS

**Estructura:**
| Tipo | Keywords/Targeting | Objetivo | Prioridad |
|---|---|---|---|
| Search Marca | [Nombre] + variantes | Defender tráfico | Inmediata |
| Search Genérico | Keywords intención alta | Capturar demanda | Alta |
| Shopping/PMax | Feed de productos | Conversiones | Alta |
| Display Remarketing | Visitantes 30 días | Recuperar interés | Media |

**Keywords y anuncios (MECE):**
**Hallazgo:** [Diagnóstico del volumen de búsqueda]
**Recomendación:**
- **Keywords de conversión alta:** [6-8 keywords específicas ordenadas por intención]
- **Keywords de marca a proteger:** [Nombre] + comprar | precio | envío | opiniones
- **Keywords negativas:** [6-8 términos a excluir con razón]
- **Headlines RSA:** H1-H3 (keywords con intención) | H4-H8 (propuesta de valor) | H9-H12 (garantía) | H13-H15 (marca)
- **Descriptions:** D1 = beneficio+CTA | D2 = objeción | D3 = garantía | D4 = variante
- **Extensions:** Sitelinks + Callouts + Structured Snippets + Seller Ratings
**KPI:** CTR Search > X%; QS > 7; CPA < $X

**Bidding (MECE):**
**Hallazgo:** [Diagnóstico de conversiones]
**Recomendación:**
- Fase 1 (0-30d): Manual CPC mejorado. CPA objetivo = [CPA × 0.80]
- Fase 2 (30-90d): tROAS cuando 30+ conv/mes. ROAS objetivo = [Precio÷CPA×0.85]
- Fase 3 (90d+): Maximizar valor + PMax con señales de audiencia real
**KPI:** ROAS Fase 1 > Xx; Fase 2 > Xx

## 9. MAPA DE COSTOS Y RENTABILIDAD PUBLICITARIA

| KPI | Meta Ads | Google Ads | Benchmark |
|---|---|---|---|
| CPA objetivo | $[Margen×0.25] | $[Margen×0.20] | E-commerce similar: $X–$X |
| ROAS mínimo | [Precio÷CPA Meta] | [Precio÷CPA Google] | 2.5–4x típico |
| ROAS objetivo | [ROAS mín×1.5] | [ROAS mín×1.5] | Top: 5x+ |
| CPM estimado | $X–$X | N/A | LATAM: $5–$15 |
| CTR mínimo | 1.5% feed/0.8% Stories | 3.5–5% Search | Benchmarks 2024 |
| CVR mínima | 1.5% | 2.5% | E-commerce: 1.8% |

**Reglas de corte (MECE):**
**Hallazgo:** Sin reglas de pausa, el presupuesto se dilapida.
**Recomendación:**
- Pausar ad sets Meta con CPA > 2× objetivo después de $[CPA×2] sin conversión
- Pausar creativos con frecuencia > 4 o CPM > $X por 7 días
- Pausar keywords Google con CTR < 1% después de 500 impresiones
- Pausar grupos con CPA > 1.5× objetivo después de 30 conversiones
**KPI:** CPA dentro del objetivo en ≤ 45 días

**Proyección de escalabilidad:**
| Inversión mensual | ROAS objetivo | Ingresos atribuidos | Margen neto estimado |
|---|---|---|---|
| $[X inicial] | [ROAS] | $[X×ROAS] | $[calcular] |
| $[X×2] | [ROAS] | $[calcular] | $[calcular] |
| $[X×4] | [ROAS conservador] | $[calcular] | $[calcular] |

## 10. HOJA DE RUTA SEO — 90 DÍAS (Framework MECE)

**Diagnóstico SEO actual:** [2-3 líneas: brechas críticas que frenan el posicionamiento]

### Horizonte 1 — Quick Wins (Semanas 1–4)

**SEO 1.1:** [Título acción]
- **Hallazgo:** [Problema detectado con dato específico]
- **Recomendación:** [Qué hacer exactamente]
- **Justificación:** [Impacto en negocio]
- **KPI:** [Métrica medible y plazo]

**SEO 1.2:** [Título]
- **Hallazgo:** / **Recomendación:** / **Justificación:** / **KPI:**

**SEO 1.3 — Schema Markup:**
- **Hallazgo:** Sin schema markup, Google no muestra Rich Snippets.
- **Recomendación:** Implementar schema.org/Product con: name, description, image, offers, AggregateRating.
- **Justificación:** Rich Snippets incrementan CTR orgánico 20–30%.
- **KPI:** Rich Snippets activos en ≤ 14 días; CTR +25%

**SEO 1.4 — Core Web Vitals:**
- **Hallazgo:** [Estimación según plataforma del sitio]
- **Recomendación:** Comprimir imágenes a WebP (<200KB), lazy loading, eliminar CSS/JS bloqueantes.
- **Justificación:** Google usa Core Web Vitals como factor de ranking desde 2021.
- **KPI:** LCP < 2.5s, FID < 100ms, CLS < 0.1 en ≤ 21 días

### Horizonte 2 — Crecimiento (Semanas 5–8)

**SEO 2.1 — Topic Cluster:**
- **Hallazgo:** [Estado actual del contenido]
- **Recomendación:** Página pilar 2,000+ palabras + 4-5 artículos de soporte con internal linking.
- **Justificación:** Topic clusters mejoran ranking de todas las páginas del cluster 8-12 posiciones.
- **KPI:** Página pilar en top 20 en 45d; top 10 en 90d

**SEO 2.2 — Páginas de Categoría:**
- **Hallazgo:** Páginas de categoría sin copy textual carecen de relevancia semántica.
- **Recomendación:** Agregar 150-200 palabras de copy SEO con keyword exacta en las primeras 100 chars.
- **KPI:** Top 15 para keywords objetivo en 60 días

**SEO 2.3 — Linkbuilding:**
- **Hallazgo:** [Perfil de backlinks actual]
- **Recomendación:** (1) Directorios sectoriales DA>30 (2) PR digital (3) Colaboraciones con marcas complementarias
- **KPI:** 5-10 backlinks DA>30 en 60 días; DA +3-5 puntos en 90 días

### Horizonte 3 — Dominación (Semanas 9–12)

**SEO 3.1 — Contenido Evergreen:**
- **Hallazgo:** Oportunidades de keywords informacionales no atacadas por competidores.
- **Recomendación:** 3 artículos evergreen 2,000+ palabras con FAQ schema.
- **KPI:** 3 artículos en top 10 en 90 días

**KPIs Globales SEO:**
| Métrica | Hoy | 30 días | 90 días |
|---|---|---|---|
| Tráfico orgánico | [X] | +20% | +50–80% |
| Keywords top 10 | [X] | [X+10] | [X+25] |
| CTR orgánico | [X%] | [X+1.5]% | [X+3]% |
| DA del dominio | [X] | [X+2] | [X+5] |

## 11. PLAN DE DOMINACIÓN COMPETITIVA (Framework MECE)

**Mapa de vulnerabilidades:**
| Competidor | Vulnerabilidad | Vector de Ataque | Canal | Plazo |
|---|---|---|---|---|
| [Competidor 1] | [Debilidad explotable] | [Táctica concreta] | [Canal] | [Corto] |
| [Competidor 2] | [Debilidad] | [Táctica] | [Canal] | [Mediano] |
| [Competidor 3] | [Debilidad] | [Táctica] | [Canal] | [Plazo] |

**11.1 — Keywords de Competidores en Google (MECE):**
- **Hallazgo:** [Volumen de búsquedas de marca de competidores + CPC estimado]
- **Recomendación:** [Si aplica] Campañas pujando por [Competidor] + "alternativa" + "vs" con landing comparativa.
- **Justificación:** Usuarios que buscan marcas competidoras tienen CVR 40–60% superior a búsquedas genéricas.
- **KPI:** CPA competidores < X% del CPA objetivo; CVR > X%

**11.2 — Contenido SEO de Comparación (MECE):**
- **Hallazgo:** Páginas de comparación capturan tráfico de alta intención en fase de decisión.
- **Recomendación:** Crear "[Marca] vs [Competidor]: ¿Cuál es mejor?" para cada competidor con tabla + veredicto + testimonios.
- **KPI:** Top 5 para "[marca] vs [competidor]" en 60 días; CVR > 3%

**11.3 — Mensajes diferenciadores por competidor:**
- **vs. [Competidor 1]:** "[Mensaje listo para usar como copy de anuncio]"
- **vs. [Competidor 2]:** "[Mensaje diferenciador específico]"
- **vs. [Competidor 3]:** "[Mensaje diferenciador específico]"
**KPI:** CTR de anuncios diferenciadores > CTR genéricos en +20%

**11.4 — Oportunidades Blue Ocean (MECE):**
- **Hallazgo:** Segmentos donde ningún competidor está posicionado:
  1. [Oportunidad 1 con potencial estimado]
  2. [Oportunidad 2]
  3. [Oportunidad 3 — mayor potencial]
- **Recomendación:** [Estrategia de entrada para la oportunidad de mayor potencial — 3 oraciones]
- **KPI a 6 meses:** Share of Voice: X%; posición promedio top X; tráfico orgánico atribuido X%

---
**Documento preparado por Dr. Steve Dogs**
*PhD Performance Marketing — Stanford Dog University*
*Director de Estrategia Digital, BG Consult*
*Confidencial — Documento estratégico de uso exclusivo del cliente*`;
}

const BRAND_BRIEF_QUESTIONS = getBrandBriefQuestions();
const SYSTEM_PROMPT = getSystemPrompt();
const BRIEF_TEMPLATE = getBriefTemplate();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: 'AI service not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { client_id, conversation_id, message } = await req.json();

    if (!client_id) {
      return new Response(JSON.stringify({ error: 'Missing client_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, client_user_id, user_id')
      .eq('id', client_id)
      .single();

    if (clientError || !client) {
      return new Response(JSON.stringify({ error: 'Client not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if user is a super admin (can access any client's chat)
    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('is_super_admin')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    const isSuperAdmin = roleRow?.is_super_admin === true;

    if (!isSuperAdmin && client.client_user_id !== user.id && client.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let activeConversationId = conversation_id;

    if (!activeConversationId) {
      const { data: newConv, error: convError } = await supabase
        .from('steve_conversations')
        .insert({ client_id })
        .select()
        .single();

      if (convError) {
        return new Response(JSON.stringify({ error: 'Failed to create conversation' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      activeConversationId = newConv.id;

      const firstQ = BRAND_BRIEF_QUESTIONS[0];
      const introMessage = (firstQ.steveIntro || '') + firstQ.question;

      await supabase.from('steve_messages').insert({
        conversation_id: activeConversationId,
        role: 'assistant',
        content: introMessage,
      });

      return new Response(JSON.stringify({
        conversation_id: activeConversationId,
        message: introMessage,
        question_index: 0,
        total_questions: BRAND_BRIEF_QUESTIONS.length,
        examples: firstQ.examples,
        fields: firstQ.fields,
        field_validation: (firstQ as any).validation,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!message) {
      return new Response(JSON.stringify({ error: 'Missing message' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await supabase.from('steve_messages').insert({
      conversation_id: activeConversationId,
      role: 'user',
      content: message,
    });

    const { data: messages, error: msgError } = await supabase
      .from('steve_messages')
      .select('role, content')
      .eq('conversation_id', activeConversationId)
      .order('created_at', { ascending: true });

    if (msgError) {
      return new Response(JSON.stringify({ error: 'Failed to fetch messages' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userMessages = messages?.filter(m => m.role === 'user') || [];
    const answeredQuestions = userMessages.length;
    const isLastQuestion = answeredQuestions >= BRAND_BRIEF_QUESTIONS.length;

    // Extract fase_negocio and presupuesto_ads from Q2 response (index 2 = after Q0 + Q1 + Q2)
    let faseNegocio = '';
    let presupuestoAds = '';
    if (userMessages.length >= 3) {
      const q2Resp = userMessages[2]?.content || '';
      const faseMatch = q2Resp.match(/Fase\s+(Inicial|Crecimiento|Escalado|Avanzada)/i);
      if (faseMatch) faseNegocio = `Fase ${faseMatch[1]}`;
      const presupuestoMatch = q2Resp.match(/(?:Menos de \$100\.000|(?:\$100\.000\s*-\s*\$500\.000)|(?:\$500\.000\s*-\s*\$2\.000\.000)|Más de \$2\.000\.000)\s*CLP/i);
      if (presupuestoMatch) presupuestoAds = presupuestoMatch[0];
    }

    const briefData = {
      raw_responses: userMessages.map(m => m.content),
      questions: BRAND_BRIEF_QUESTIONS.slice(0, answeredQuestions).map(q => q.id),
      answered_count: answeredQuestions,
      total_questions: BRAND_BRIEF_QUESTIONS.length,
      fase_negocio: faseNegocio || undefined,
      presupuesto_ads: presupuestoAds || undefined,
    };

    await supabase.from('buyer_personas').upsert({
      client_id,
      persona_data: { ...briefData, completed_at: isLastQuestion ? new Date().toISOString() : null },
      is_complete: isLastQuestion,
    }, { onConflict: 'client_id' });

    if (answeredQuestions === 1) {
      try {
        const urlResponse = userMessages[0]?.content || '';
        const urlMatch = urlResponse.match(/(?:https?:\/\/)?(?:www\.)?[\w-]+(?:\.[\w-]+)+(?:\/\S*)?/i);
        if (urlMatch) {
          await supabase.from('clients').update({
            website_url: urlMatch[0].startsWith('http') ? urlMatch[0] : `https://${urlMatch[0]}`,
          }).eq('id', client_id);
        }
      } catch (e) {
        console.error('Error saving website URL:', e);
      }
    }

    let questionContext = '';
    if (isLastQuestion) {
      questionContext = `\n\n═══ INSTRUCCIÓN DEL SISTEMA ═══\nEl cliente acaba de responder la PREGUNTA 15 (la última). ${BRIEF_TEMPLATE}`;
    } else {
      const justAnsweredIndex = answeredQuestions - 1;
      const nextQuestionIndex = answeredQuestions;
      const nextQ = BRAND_BRIEF_QUESTIONS[nextQuestionIndex];
      const justAnsweredQ = BRAND_BRIEF_QUESTIONS[justAnsweredIndex];
      const hasFields = nextQ?.fields?.length > 0;
      const justAnsweredLabel = justAnsweredIndex === 0 ? 'Pregunta 0 (URL del sitio web)' : `Pregunta ${justAnsweredIndex} de 15 (${justAnsweredQ?.id})`;
      const nextLabel = nextQuestionIndex === 0 ? 'Pregunta 0 (URL del sitio web)' : `Pregunta ${nextQuestionIndex} de 15`;

      questionContext = `\n\n═══ INSTRUCCIÓN DEL SISTEMA ═══
PREGUNTA RECIÉN RESPONDIDA: ${justAnsweredLabel}
GUÍA PARA COMENTAR: ${justAnsweredQ?.commentGuide || 'Comenta brevemente la respuesta.'}

SIGUIENTE PREGUNTA QUE DEBES HACER: ${nextLabel}
INTRO DE STEVE: ${nextQ?.steveIntro || ''}
TEXTO EXACTO DE LA PREGUNTA: ${nextQ?.question}

${hasFields ? '⚠️ FORMULARIO: La siguiente pregunta tiene un formulario interactivo. NO escribas los campos como texto. Solo di "Llena los campos del formulario abajo".' : ''}

${nextQ?.examples?.length ? `EJEMPLOS PARA DAR (adáptalos a su industria): ${JSON.stringify(nextQ.examples)}` : 'Da 2-3 ejemplos concretos de SU industria específica.'}

RECUERDA: Tu respuesta debe tener MÁXIMO 2 partes:
1. Comentario breve sobre la respuesta anterior (2-4 oraciones)
2. La siguiente pregunta (usa la intro y el texto exacto de arriba)

NO preguntes NADA que no sea la ${nextLabel}. NO anticipes temas futuros.`;

      if (answeredQuestions === 1) {
        questionContext += '\n\nINSTRUCCIÓN EXTRA Q0: El cliente acaba de dar su URL. Confírmale brevemente que la guardaste y que la usarás para el análisis SEO. Luego arranca con la Pregunta 1 del Brief.';
      }
      if (answeredQuestions === 3) {
        questionContext += '\n\nINSTRUCCIÓN EXTRA Q2: El cliente envió datos financieros. CALCULA: Margen bruto = Precio - Costo - Envío. Margen % = Margen/Precio×100. CPA Máximo = Margen × 0.30. Muestra tabla markdown con resultados. Di que guardaste el CPA en configuración financiera.';
      }
    }

    // Fetch full knowledge base (all categories)
    const [{ data: knowledge }, { data: bugs }] = await Promise.all([
      supabase
        .from('steve_knowledge')
        .select('categoria, titulo, contenido')
        .eq('activo', true)
        .order('orden', { ascending: true })
        .limit(10),
      supabase
        .from('steve_bugs')
        .select('categoria, descripcion, ejemplo_malo, ejemplo_bueno')
        .eq('activo', true)
        .limit(5),
    ]);

    const knowledgeContext = knowledge?.map((k: { categoria: string; titulo: string; contenido: string }) =>
      `### [${k.categoria.toUpperCase()}] ${k.titulo}\n${k.contenido}`
    ).join('\n\n') || '';

    const bugsContext = bugs?.map((b: { categoria: string; descripcion: string; ejemplo_malo: string; ejemplo_bueno: string }) =>
      `❌ EVITAR: ${b.descripcion}\nMAL: ${b.ejemplo_malo}\nBIEN: ${b.ejemplo_bueno}`
    ).join('\n\n') || '';

    const knowledgeSection = knowledgeContext ? `\nCONOCIMIENTO APRENDIDO — ÚSALO EN CADA RESPUESTA:\n${knowledgeContext}\n` : '';
    const bugSection = bugsContext ? `\nERRORES QUE NUNCA DEBES COMETER:\n${bugsContext}\n` : '';

    const phaseContext = faseNegocio ? `\n\n═══ CONTEXTO DE FASE DEL NEGOCIO ═══
Fase del negocio: ${faseNegocio}
Presupuesto mensual de ads: ${presupuestoAds || 'No especificado'} CLP

Reglas por fase:
- Fase Inicial: Broad Retargeting + producto ancla + boosts orgánicos. NUNCA recomendar prospección fría.
- Fase Crecimiento: Broad Retargeting + prospección fría básica. Sin estructuras complejas.
- Fase Escalado: Campaña maestra + catálogos dinámicos. Estructuras más sofisticadas.
- Fase Avanzada: Framework completo + Partnership Ads + Advantage+.

REGLAS ABSOLUTAS:
- Nunca recomendar estrategias que superen el presupuesto disponible.
- Nunca recomendar estructuras para una fase más avanzada.
- Siempre medir GPT (Ganancia Por Transacción) no solo ROAS.
- En Fase Inicial, SIEMPRE recomendar producto ancla.` : '';

    const dynamicSystemPrompt = bugSection + knowledgeSection + SYSTEM_PROMPT + phaseContext;

    const chatMessages: ChatMessage[] = [
      { role: 'system', content: dynamicSystemPrompt + questionContext },
      ...messages!.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    console.log(`Steve chat: conversation ${activeConversationId}, answered ${answeredQuestions}/${BRAND_BRIEF_QUESTIONS.length}`);

    const maxTokens = isLastQuestion ? 8000 : 1200;

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

    // Convert messages: Anthropic uses system separately, not in messages array
    const systemMessage = chatMessages.find(m => m.role === 'system')?.content || '';
    const userMessages_anthropic = chatMessages.filter(m => m.role !== 'system');

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: maxTokens,
        system: systemMessage,
        messages: userMessages_anthropic,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      if (aiResponse.status === 429) return new Response(JSON.stringify({ error: 'Rate limit' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({ error: 'AI service error' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const aiData = await aiResponse.json();
    const assistantMessage = aiData.content?.[0]?.text || 'Lo siento, hubo un error. ¿Podrías repetir tu respuesta?';

    await supabase.from('steve_messages').insert({
      conversation_id: activeConversationId,
      role: 'assistant',
      content: assistantMessage,
    });

    if (answeredQuestions === 3) {
      try {
        const q2Response = userMessages[2]?.content || '';
        const numbers = q2Response.match(/\$?\d[\d.,]*/g)?.map((n: string) => parseFloat(n.replace(/[$.]/g, '').replace(',', '.'))) || [];
        if (numbers.length >= 2) {
          const price = numbers[0], cost = numbers[1], shipping = numbers.length >= 3 ? numbers[2] : 0;
          const margin = price - cost - shipping;
          if (margin > 0) {
            await supabase.from('client_financial_config').upsert({
              client_id,
              default_margin_percentage: Math.round((margin / price) * 100),
              payment_gateway_commission: 0,
              shopify_plan_cost: 0,
              klaviyo_plan_cost: 0,
              other_fixed_costs: 0,
            }, { onConflict: 'client_id' });
          }
        }
      } catch (cpaError) {
        console.error('Error saving CPA config:', cpaError);
      }
    }

    if (isLastQuestion) {
      await supabase.from('buyer_personas').update({
        persona_data: { ...briefData, summary: assistantMessage, completed_at: new Date().toISOString() },
        is_complete: true,
      }).eq('client_id', client_id);

      try {
        const { data: clientData } = await supabase.from('clients').select('website_url').eq('id', client_id).single();
        const q1Response = userMessages[0]?.content || '';
        const urlMatch = q1Response.match(/https?:\/\/[^\s,]+|www\.[^\s,]+|\b\w+\.(cl|com|net|store|shop|myshopify\.com)\b/i);
        const websiteUrl = clientData?.website_url || (urlMatch ? urlMatch[0] : null);

        const q9Response = userMessages[8]?.content || '';
        const competitorUrls: string[] = [];
        const urlMatches = q9Response.match(/https?:\/\/[^\s,]+|www\.[^\s,]+|\b\w+\.(cl|com|net|store|shop|myshopify\.com)\b/gi) || [];
        for (const u of urlMatches.slice(0, 3)) {
          competitorUrls.push(u.startsWith('http') ? u : `https://${u}`);
        }

        await supabase.from('brand_research').upsert({
          client_id,
          research_type: 'analysis_status',
          research_data: { status: 'pending', started_at: new Date().toISOString() },
        }, { onConflict: 'client_id,research_type' });

        const projectId = supabaseUrl.replace('https://', '').split('.')[0];
        const analyzeUrl = `https://${projectId}.supabase.co/functions/v1/analyze-brand`;

        fetch(analyzeUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ client_id, website_url: websiteUrl, competitor_urls: competitorUrls, research_type: 'full_analysis' }),
        }).then(async (r) => {
          if (r.ok) {
            console.log(`Auto analyze-brand completed for client ${client_id}`);
          } else {
            const errText = await r.text();
            console.error(`Auto analyze-brand failed: ${r.status}`, errText);
            await supabase.from('brand_research').upsert({
              client_id,
              research_type: 'analysis_status',
              research_data: { status: 'error', error: `HTTP ${r.status}` },
            }, { onConflict: 'client_id,research_type' });
          }
        }).catch(async (err) => {
          console.error('Auto analyze-brand error:', err);
          await supabase.from('brand_research').upsert({
            client_id,
            research_type: 'analysis_status',
            research_data: { status: 'error', error: String(err) },
          }, { onConflict: 'client_id,research_type' });
        });

        console.log(`Auto analyze-brand triggered for client ${client_id}`);
      } catch (autoAnalyzeErr) {
        console.error('Error triggering auto analyze-brand:', autoAnalyzeErr);
      }
    }

    const nextQuestionIndex = Math.min(answeredQuestions, BRAND_BRIEF_QUESTIONS.length - 1);
    const nextQ = !isLastQuestion && nextQuestionIndex < BRAND_BRIEF_QUESTIONS.length
      ? BRAND_BRIEF_QUESTIONS[nextQuestionIndex]
      : null;

    return new Response(JSON.stringify({
      conversation_id: activeConversationId,
      message: assistantMessage,
      question_index: nextQuestionIndex,
      total_questions: BRAND_BRIEF_QUESTIONS.length,
      answered_count: answeredQuestions,
      is_complete: isLastQuestion,
      examples: nextQ?.examples || [],
      fields: nextQ?.fields || [],
      field_validation: (nextQ as any)?.validation,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Steve chat error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
