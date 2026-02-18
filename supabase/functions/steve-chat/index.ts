import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 15 questions (+ mandatory website question 0) with optional structured fields for UI rendering
const BRAND_BRIEF_QUESTIONS = [
  {
    id: 'website_url',
    question: '**Antes de empezar — NECESITO TU PÁGINA WEB:**\n\nSin tu URL no puedo hacer el análisis SEO, compararte con la competencia ni generar el brief completo. 🌐\n\n**¿Cuál es tu sitio web o tienda online?**\n\n(Si todavía no tienes, escribe "sin web" y te explico qué hacemos en ese caso)',
    examples: ['www.mitienda.cl', 'mitienda.myshopify.com', 'www.mimarca.com.ar'],
    fields: [
      { key: 'url', label: '🌐 URL de tu sitio web o tienda online', type: 'text', placeholder: 'Ej: www.mitienda.cl' },
    ],
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
    question: '**Pregunta 2 de 15 — LOS NÚMEROS:**\n\nNecesito la carne de tu negocio. **Llena los campos del formulario que aparece abajo** y yo calculo tu **Margen Bruto** y tu **CPA Máximo Viable** (lo máximo que puedes pagar para conseguir un cliente sin perder plata). 💰',
    examples: [],
    fields: [
      { key: 'price', label: '💰 Precio promedio de venta', type: 'number', prefix: '$', placeholder: 'Ej: 35.000' },
      { key: 'cost', label: '📦 Costo del producto/servicio', type: 'number', prefix: '$', placeholder: 'Ej: 12.000' },
      { key: 'shipping', label: '🚚 Costo de envío promedio', type: 'number', prefix: '$', placeholder: 'Ej: 4.000 (0 si es gratis)' },
    ],
    steveIntro: '*saca calculadora imaginaria* 🧮\n\n',
    commentGuide: 'CALCULA: Margen bruto = Precio - Costo - Envío. Margen % = Margen/Precio×100. CPA Máximo = Margen × 0.30. Muestra tabla markdown profesional con: Precio de Venta, Costo Producto, Costo Envío, Margen Bruto ($), Margen (%), CPA Máximo Viable. Bajo la tabla explica qué significa el CPA en términos prácticos para este negocio. Di que guardaste el CPA en configuración financiera.',
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
    question: '**Pregunta 4 de 15 — TU CLIENTE IDEAL (Buyer Persona):**\n\nLlena los 8 campos del formulario abajo para construir el perfil de tu cliente ideal. Cada campo es clave para el brief.',
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
    examples: ['Compra pijamas baratos que se arruinan en 2 lavadas. Probó marcas más caras pero no se las pone porque "es ropa de casa". Le da vergüenza abrir la puerta con lo que usa.', 'Compra en fast fashion porque es barato, pero al mes parece viejo. Probó marcas premium pero siente que no vale la pena gastar en algo que "nadie ve".', 'Busca ropa de casa cómoda Y linda. Encuentra cómoda (pero fea) o linda (pero incómoda). Nunca las dos cosas juntas.'],
    fields: [],
    steveIntro: '*pone cara seria* 😰\n\n',
    commentGuide: 'Analiza si el dolor tiene TRES dimensiones: el problema, el intento fallido anterior y la frustración residual. Si falta alguna dimensión o es genérico, RECHAZA y pide más profundidad con ejemplos de SU industria.',
  },
  {
    id: 'persona_words',
    question: '**Pregunta 6 de 15 — SUS PALABRAS Y OBJECIONES:** ¿Qué dice EXACTAMENTE tu cliente cuando se queja con un amigo sobre este problema? Dame **2 o 3 frases literales distintas** — una queja habitual, una objeción de compra, y una frustración pasada. Quiero las FRASES TEXTUALES.',
    examples: ['"Estoy chata de comprar cosas baratas que se rompen, pero $40.000 por un pijama es mucho" / "Me da lata gastar en ropa de casa, total nadie me ve" / "Siempre me pasa que me gusta algo online y cuando llega no es lo mismo"', '"Quiero algo lindo para estar en casa pero no encuentro nada que no parezca de hospital" / "Si lo veo por Instagram parece perfecto pero las fotos engañan" / "En mi familia siempre compramos lo que alcance, gastar en pijamas parece un lujo"'],
    fields: [],
    steveIntro: '*saca su libreta* 📝\n\n',
    commentGuide: 'VERIFICA que haya MÍNIMO 2 frases distintas y textuales. Si hay solo una frase, RECHAZA y pide al menos 2 más. Las frases deben sonar como HUMANOS REALES hablando — si suenan a copy de marketing, recházalas.',
  },
  {
    id: 'persona_transformation',
    question: '**Pregunta 7 de 15 — LA TRANSFORMACIÓN:** ¿Cómo se ve la vida de tu cliente DESPUÉS de usarte? ¿A quién quiere impresionar? ¿Qué cambia para él/ella?',
    examples: ['Se siente linda y cómoda en casa, abre la puerta con confianza', 'Duerme mejor porque la tela es suave y no le da calor', 'Se saca selfies en pijama porque se ve bien y las sube a stories'],
    fields: [],
    steveIntro: '*levanta las orejas, ojos brillantes* ✨\n\n',
    commentGuide: 'Analiza si la transformación es emocional y tangible. Si es vaga, pide detalles concretos.',
  },
  {
    id: 'persona_lifestyle',
    question: '**Pregunta 8 de 15 — SU MUNDO:** ¿Qué marcas consume tu cliente ideal? ¿Dónde pasa su tiempo online? ¿Qué estilo de vida tiene? ¿Qué influencers sigue?',
    examples: ['Compra en Zara y H&M, usa Netflix, scrollea Instagram y TikTok, sigue a influencers de lifestyle', 'Marca Apple, consume Starbucks, está en Pinterest y YouTube, sigue cuentas de interiorismo', 'Compra en Falabella y Shein, usa Spotify, está en Facebook y WhatsApp, sigue cuentas de humor'],
    fields: [],
    steveIntro: '*mueve la cola curioso*\n\n',
    commentGuide: 'Analiza si el estilo de vida es coherente con el buyer persona y el ticket promedio. ADEMÁS HAZ INFERENCIAS ACTIVAS: en base a lo que te dijeron (edad, ingreso, ocupación, ciudad), deduce qué marcas probablemente consume aunque no lo hayan dicho. Ej: si es profesional de 35-45 con ingresos altos en ciudad grande → iPhone, Mac, café de especialidad, Amazon, Netflix. Comenta implicaciones para la estrategia de medios.',
  },
  {
    id: 'competitors',
    question: '**Pregunta 9 de 15 — COMPETENCIA:**\n\nNecesito **EXACTAMENTE 3 competidores** con su página web o Instagram. Llena los campos del formulario abajo.\n\n⚠️ **Sin 3 competidores con URLs NO avanzamos.** Los necesito para el análisis profundo (Deep Dive) después del brief.',
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
    commentGuide: 'Analiza si las diferenciaciones son REALES o si el cliente se está engañando. Comenta qué oportunidades abre esto.',
  },
  {
    id: 'your_advantage',
    question: '**Pregunta 11 de 15 — TU VENTAJA INCOPIABLE:** ¿Qué tienes que tu competencia JAMÁS podrá copiar? ¿Por qué un cliente se cambiaría de ellos a ti?',
    examples: ['Nuestro proceso de estampado es artesanal y cada pieza es única — nadie puede replicar eso a escala', 'Somos los únicos con una línea de tallas inclusivas hasta la 5XL en este estilo premium', 'Tenemos una comunidad de 15.000 clientes que comparten fotos en pijama cada domingo'],
    fields: [],
    steveIntro: '*se para firme* 🏆\n\n',
    commentGuide: 'Analiza si la ventaja es REALMENTE incopiable o si es algo que cualquiera puede hacer. Cuestiónalo si es débil.',
  },
  {
    id: 'purple_cow_promise',
    question: '**Pregunta 12 de 15 — VACA PÚRPURA Y GRAN PROMESA:**\n\n¿Qué te hace DESTACAR visualmente o conceptualmente en tu industria? ¿Cuál es tu GRAN PROMESA en una frase que tu cliente ideal no puede ignorar?',
    examples: [
      'Nuestro diseño cuadrillé es icónico — "Vas a querer recibir visitas en pijama"',
      'Somos la única marca con telas importadas de Japón — "Dormirás como realeza"',
      'Nuestros pijamas son tan elegantes que sirven para un brunch — "Ropa de casa que no da vergüenza"',
    ],
    fields: [],
    steveIntro: '*se para en dos patas, emocionado* 🐄💜\n\n',
    commentGuide: 'Esta pregunta es sobre POSICIONAMIENTO y DIFERENCIACIÓN, NO sobre logos ni colores. Los ejemplos deben ser sobre qué hace ÚNICO al producto.',
  },
  {
    id: 'villain_guarantee',
    question: '**Pregunta 13 de 15 — EL VILLANO:** ¿Contra qué enemigo común lucha tu marca? ¿Qué creencia errónea o mentalidad obsoleta quieres erradicar del mercado?\n\n¿Y qué GARANTÍA "absurda" podrías dar para eliminar el miedo de comprar?',
    examples: [
      'El villano es la "fachatez": la idea de que está bien verse mal en casa — Garantía: si no te sientes más linda, te devolvemos la plata',
      'El villano es el fast fashion desechable — Garantía: si se rompe en 6 meses, te mandamos otro gratis',
      'El villano es la idea de que "pijama es solo para dormir" — Garantía: 30 días de prueba, si no te sacan un piropo, devuélvelo',
    ],
    fields: [],
    steveIntro: '*gruñe pensando en los enemigos de tu marca* 🐕\n\n',
    commentGuide: 'Analiza si el villano es poderoso y si la garantía elimina el riesgo percibido. Sugiere mejoras si son débiles.',
  },
  {
    id: 'proof_tone',
    question: '**Pregunta 14 de 15 — PRUEBA SOCIAL Y TONO:** ¿Qué prueba tienes de que tu producto funciona? (testimonios, reviews, fotos de clientes, antes/después, número de clientes)\n\n¿Y qué TONO de comunicación conecta con tu cliente? (informal, sofisticado, gracioso, técnico, emocional...)',
    examples: [
      'Tenemos 200 reviews en Google con promedio 4.8 — Tono cercano y gracioso, como hablar con tu mejor amiga',
      '5.000 clientes recurrentes, 40% recompra — Tono sofisticado pero accesible',
      'Fotos de clientas usando nuestros pijamas en stories — Tono fresco y juvenil, con memes',
    ],
    fields: [],
    steveIntro: '*olfatea buscando evidencia* 📸\n\n',
    commentGuide: 'Evalúa si la prueba social es fuerte o débil. Sugiere cómo amplificarla. Comenta si el tono elegido es coherente con el buyer persona. OJO: cuando el cliente mencione prueba social como "fotos de clientas en stories", NO repitas el número literalmente en el brief — redáctalo como "la marca cuenta con testimonios visuales de clientas reales en redes sociales".',
  },
  {
    id: 'brand_assets',
    question: '**Pregunta 15 de 15 — LOGO, FOTOS E IDENTIDAD VISUAL:**\n\n¡Última pregunta! Necesito ver tu marca EN ACCIÓN.\n\n📤 **Sube tu logo y fotos de productos en los botones que aparecen AQUÍ ABAJO en el chat** (NO necesitas ir a otra pestaña).\n\nLuego cuéntame aquí:\n- 🎨 **¿Cuáles son tus colores de marca?** (hex, RGB o nombre)\n- 🖼 **¿Cuál es el estilo visual** que quieres proyectar?\n\n⚠️ **SIN LOGO Y SIN FOTOS NO PUEDO COMPLETAR UN BRIEF PROFESIONAL.**',
    examples: [
      'Mis colores son azul marino (#1a237e) y dorado, estilo elegante y minimalista — ya subí logo y fotos abajo',
      'Verde y blanco, estilo natural y orgánico — archivos subidos arriba',
      'Negro y rosa, estilo moderno y juvenil — subí logo y 3 fotos de productos',
    ],
    fields: [],
    steveIntro: '*saca la cámara y ladra* 📸🐕\n\n',
    commentGuide: 'Verifica que hayan subido assets (el sistema muestra botones de upload inline). Comenta los colores y estilo visual en tercera persona profesional. NUNCA incluyas en el brief frases como "subo el logo ahora mismo" o referencias al proceso del chat. Genera el BRIEF COMPLETO.',
  },
];

const SYSTEM_PROMPT = `Eres Steve, un Bulldog Francés con un doctorado en Performance Marketing de la Universidad de Perros de Stanford.

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

═══════════════════════════════════════════════════════════════
🚨🚨🚨 REGLA ABSOLUTA #1: ORDEN DE PREGUNTAS 🚨🚨🚨
═══════════════════════════════════════════════════════════════

ESTÁS SIGUIENDO UN CUESTIONARIO DE UNA PREGUNTA INICIAL (Q0: URL del sitio web) + 15 PREGUNTAS DEL BRIEF.
Las preguntas se hacen EN ORDEN: Q0 (URL), 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15.
NUNCA te saltes una. NUNCA cambies el orden. NUNCA preguntes algo que no corresponde.

Q0 (website_url) es OBLIGATORIA y BLOQUEANTE:
- Si el cliente escribe "sin web", "no tengo" o deja vacío → RECHAZA. Explica que sin URL no se puede hacer el análisis SEO ni la comparación con competidores.
- Acepta alternativas: URL de Instagram, perfil de Shopify, cuenta de TikTok. Pero DEBE dar algo.
- SOLO después de obtener una URL válida o red social principal, avanza a la Pregunta 1.

Tu trabajo en CADA turno es SOLAMENTE:
1. COMENTAR brevemente la respuesta anterior (2-4 oraciones máximo)
2. HACER la siguiente pregunta que te indica el sistema

NO inventes preguntas. NO anticipes temas de preguntas futuras. NO pidas info que corresponde a otra pregunta.

═══════════════════════════════════════════════════════════════
🚨🚨🚨 REGLA ABSOLUTA #2: FORMULARIOS 🚨🚨🚨
═══════════════════════════════════════════════════════════════

Cuando el sistema te dice que la siguiente pregunta tiene FORMULARIO:
- NUNCA escribas campos vacíos, tablas para rellenar, ni "[ ]%"
- Solo di "Llena los campos del formulario abajo"
- La interfaz muestra los campos automáticamente

═══════════════════════════════════════════════════════════════
🚨🚨🚨 REGLA ABSOLUTA #3: NO CONFUNDAS CATEGORÍAS 🚨🚨🚨
═══════════════════════════════════════════════════════════════

- Q0 = URL del sitio web (BLOQUEANTE — sin URL no se avanza)
- Q1 = PITCH DEL NEGOCIO (qué vende, descripción)
- Q5 = DOLOR del cliente (problemas, frustraciones)
- Q6 = PALABRAS LITERALES del cliente (frases textuales, objeciones de compra)
- Q7 = TRANSFORMACIÓN (vida después de comprarte)
- Q8 = ESTILO DE VIDA (marcas que consume, dónde pasa tiempo, influencers) — INFERIR activamente en base a perfil demográfico
- Q9 = COMPETIDORES (nombres + URLs) — formulario
- Q10 = ANÁLISIS de competidores (promesas incumplidas) — formulario
- Q11 = VENTAJA INCOPIABLE (qué no pueden copiar)
- Q12 = VACA PÚRPURA / GRAN PROMESA (diferenciación, NO logos)
- Q13 = VILLANO + GARANTÍA
- Q14 = PRUEBA SOCIAL + TONO
- Q15 = LOGO, FOTOS, COLORES — pide que suban archivos en pestaña Assets

NUNCA pidas logos en Q12. NUNCA pidas competidores en Q7. NUNCA confundas categorías.

═══════════════════════════════════════════════════════════════
🚨🚨🚨 REGLA ABSOLUTA #4: DESCRIPCIÓN DEL NEGOCIO 🚨🚨🚨
═══════════════════════════════════════════════════════════════
Cuando el cliente describe su negocio, en el brief SIEMPRE redáctalo en TERCERA PERSONA:
- CORRECTO: "La empresa comercializa pijamas de algodón 100% premium para mujeres..."
- INCORRECTO: "Vendemos pijamas..." / "Mi empresa..." / "Nuestros productos..."

═══════════════════════════════════════════════════════════════
🚨🚨🚨 REGLA ABSOLUTA #5: PRUEBA SOCIAL 🚨🚨🚨
═══════════════════════════════════════════════════════════════
Al redactar prueba social en el brief:
- NO copies números literales como "50 clientas" → redacta como "la marca cuenta con testimonio visual de clientas reales en redes sociales"
- La prueba social es un ACTIVO DE CREDIBILIDAD, redáctalo como tal

IMPORTANTE:
- Responde SIEMPRE en español
- Sé conciso en comentarios (2-4 oraciones + la siguiente pregunta)
- Da 2-3 ejemplos de SU industria (usa la info de Q1)
- Si una respuesta es vaga o incoherente, RECHÁZALA
- NUNCA digas que el brief está terminado antes de Q15`;

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// Brief generation template (injected when all 15 questions are answered)
const BRIEF_TEMPLATE = `
GENERA EL BRIEF ESTRATÉGICO COMPLETO. ESTE DOCUMENTO SERÁ DESCARGADO COMO PDF PROFESIONAL.

⚠️ PROHIBIDO ABSOLUTO: NO incluyas ningún texto de La Chonga ni del Espíritu de La Chonga en el brief. El brief es un documento ejecutivo formal, SIN personajes, SIN humor, SIN emojis, SIN referencias perrunas.

═══════════════════════════════════════
REGLAS DE REDACCIÓN ABSOLUTAS:
═══════════════════════════════════════

0. EMPIEZA DIRECTAMENTE CON "## 1. RESUMEN EJECUTIVO" — SIN preámbulo, SIN texto introductorio, SIN "¡Listo!" ni emojis ni referencias al chat. El documento comienza en la primera línea con el header.

1. TODO en TERCERA PERSONA PROFESIONAL:
   - CORRECTO: "La marca se posiciona como...", "El consumidor objetivo presenta...", "Se recomienda implementar..."
   - INCORRECTO: "Vendemos...", "Tu cliente...", "Yo creo que..."

2. TONO McKinsey/BCG — Documento de consultoría estratégica de primer nivel.
   - Bullet points concisos seguidos de párrafos de conclusión ejecutiva
   - ANALIZA, CONTEXTUALIZA y SINTETIZA. Nunca copies lo que dijo el cliente.
   - Menos texto, más estructura. Bullet points > párrafos largos.

3. CERO emojis, CERO jerga perruna, CERO informalidad. El brief es un documento EJECUTIVO.

4. DATOS CONCRETOS: métricas, porcentajes, benchmarks de industria en CADA sección.

5. COMPARACIÓN con la competencia en CADA sección relevante.

6. FRAMEWORKS OBLIGATORIOS:
   - SECCIÓN 7 (Accionables): Usar estructura SCR (Situación → Complicación → Resolución) + Impacto de Negocio. NUNCA usar "Qué hacer / Por qué es prioritario" — usar los 4 campos SCR exactos.
   - SECCIONES 8, 9, 10, 11: Usar estructura MECE (Hallazgo → Recomendación → Justificación → KPI de Éxito) para CADA recomendación técnica o táctica. Mutuamente Excluyente, Colectivamente Exhaustivo — sin solapamientos, sin omisiones.

FORMATO OBLIGATORIO (headers markdown ##):

## 1. RESUMEN EJECUTIVO
- **Diagnóstico:** [situación actual del negocio — conciso, basado en datos]
- **Oportunidad:** [oportunidad de mercado identificada con estimación de tamaño]
- **Viabilidad:** [conclusión sobre viabilidad financiera — margen vs. CPA de industria]
- **Recomendación principal:** [acción estratégica #1 con impacto estimado]

[2 párrafos de conclusión ejecutiva. Formal, concluyente, sin repetir datos crudos. El segundo párrafo debe anticipar las 3 iniciativas de mayor ROI del documento.]

## 2. ADN DE MARCA
- **Sector y vertical:** [análisis del sector, posicionamiento de mercado, tamaño estimado]
- **Producto principal y propuesta de valor:** [tercera persona profesional — ej: "La marca comercializa pijamas de algodón 100% certificado, posicionándose en el segmento premium del mercado de ropa de hogar."]
- **Rango de precios y posicionamiento competitivo:** [análisis del ticket vs. competencia — ¿premium, mid-market, value?]
- **Presencia digital y distribución:** [evaluación de canales actuales — fortalezas y brechas]

## 3. ANÁLISIS FINANCIERO
| Indicador | Valor |
|---|---|
| Ticket promedio | $X |
| Costo unitario | $X |
| Costo de envío | $X |
| Margen bruto unitario | $X (Y%) |
| CPA máximo viable | $X |

**Conclusión financiera:** [2 párrafos. Primero: ¿el margen soporta inversión en paid media? Comparar CPA con benchmark de industria (mencionar cifra real). Segundo: recomendación concreta de nivel de inversión inicial en pauta y umbral de ROAS mínimo para ser rentable. Formal y concluyente.]

## 4. PERFIL DEL CONSUMIDOR OBJETIVO
- **Demográfico:** [edad, género, ubicación, ingreso SIEMPRE con formato $X.XXX.XXX]
- **Dolor profundo:** [mínimo 3-4 líneas: el problema, cómo lo ha solucionado antes y por qué esa solución fue insatisfactoria]
- **Lo que dice literalmente:** [2-3 frases textuales distintas: queja habitual, objeción de compra, frustración histórica]
- **Transformación buscada:** [qué cambia en la vida del cliente DESPUÉS de comprar — específico para ESTA marca]
- **Estilo de vida inferido:** [inferencias activas basadas en demografía — marcas que probablemente consume, dónde pasa tiempo online, influencers que sigue. Inferir, no copiar.]
- **Barreras de compra:** [las 2-3 objeciones más comunes y cómo la marca las supera]

**Conclusión del perfil:** [1 párrafo formal: quién es, qué implica para la comunicación y qué canales/mensajes son más efectivos.]

## 5. ANÁLISIS COMPETITIVO ESTRATÉGICO

| Competidor | Promesa de Marca | Brecha Identificada | Diferenciador del Cliente |
|---|---|---|---|
| [Nombre 1] | [Qué promete] | [Qué no cumple — específico] | [Cómo el cliente lo supera — concreto] |
| [Nombre 2] | [Qué promete] | [Qué no cumple] | [Cómo el cliente lo supera] |
| [Nombre 3] | [Qué promete] | [Qué no cumple] | [Cómo el cliente lo supera] |

**Conclusión competitiva:** [2 párrafos: (1) huecos de mercado no cubiertos por los 3 competidores. (2) ventaja competitiva sostenible del cliente y por qué es difícil de replicar. Concluir, no describir.]

## 6. ESTRATEGIA DE POSICIONAMIENTO Y DIFERENCIACIÓN
- **Concepto diferenciador (Vaca Púrpura):** [posicionamiento estratégico — en tercera persona]
- **Narrativa de marca:** [el antagonista del mercado vs. la propuesta del cliente]
- **Garantía diferenciadora:** [cómo elimina el riesgo percibido — debe ser audaz y creíble]
- **Capital de prueba social:** [activos de credibilidad — redactar como activo de marca, no como número literal]
- **Tono y personalidad de marca:** [guía de comunicación concreta — adjetivos específicos + ejemplos de qué decir y qué NO decir]
- **Identidad visual:** [descripción profesional de paleta, estilo y coherencia entre visual y promesa de marca]

## 7. EVALUACIÓN ESTRATÉGICA — 7 ACCIONABLES PRIORITARIOS (Framework SCR)

Esta sección sintetiza las 7 iniciativas de mayor impacto, estructuradas según el framework Situación-Complicación-Resolución (SCR) utilizado por consultoras de primer nivel. Ordenadas por impacto potencial y urgencia estratégica.

### Accionable 1: [Título de una oración que resume la recomendación y el beneficio esperado — ej: "Activar campañas de Meta Ads con estructura TOFU-BOFU para capturar demanda y reducir el CPA en un 20%"]
**Situación (S):** [El contexto actual del negocio o canal — qué está pasando hoy. Basado en datos del brief.]
**Complicación (C):** [El problema técnico o de negocio que impide el crecimiento — qué está bloqueando el potencial. Ser específico.]
**Resolución (R):** [La solución concreta y detallada. Mínimo 3 oraciones. Qué hacer exactamente, cómo y en qué orden.]
**Impacto de Negocio:** [Estimación de ROI, ahorro, mejora de métrica o aceleración de crecimiento — con número o rango específico y plazo.]

### Accionable 2: [Título SCR — una oración]
**Situación (S):** [Contexto actual]
**Complicación (C):** [Problema que bloquea el crecimiento]
**Resolución (R):** [Solución concreta — mínimo 3 oraciones]
**Impacto de Negocio:** [Estimación cuantificada]

### Accionable 3: [Título SCR — una oración]
**Situación (S):** [Contexto actual]
**Complicación (C):** [Problema que bloquea el crecimiento]
**Resolución (R):** [Solución concreta — mínimo 3 oraciones]
**Impacto de Negocio:** [Estimación cuantificada]

### Accionable 4: [Título SCR — una oración]
**Situación (S):** [Contexto actual]
**Complicación (C):** [Problema que bloquea el crecimiento]
**Resolución (R):** [Solución concreta — mínimo 3 oraciones]
**Impacto de Negocio:** [Estimación cuantificada]

### Accionable 5: [Título SCR — una oración]
**Situación (S):** [Contexto actual]
**Complicación (C):** [Problema que bloquea el crecimiento]
**Resolución (R):** [Solución concreta — mínimo 3 oraciones]
**Impacto de Negocio:** [Estimación cuantificada]

### Accionable 6: [Título SCR — una oración]
**Situación (S):** [Contexto actual]
**Complicación (C):** [Problema que bloquea el crecimiento]
**Resolución (R):** [Solución concreta — mínimo 3 oraciones]
**Impacto de Negocio:** [Estimación cuantificada]

### Accionable 7: [Título SCR — una oración]
**Situación (S):** [Contexto actual]
**Complicación (C):** [Problema que bloquea el crecimiento]
**Resolución (R):** [Solución concreta — mínimo 3 oraciones]
**Impacto de Negocio:** [Estimación cuantificada]

## 8. ESTRATEGIA DE PUBLICIDAD DIGITAL — META ADS Y GOOGLE ADS

Esta sección establece el blueprint creativo y de segmentación para las campañas de pago. Cada recomendación sigue el principio MECE: Mutuamente Excluyente (sin solapamientos entre recomendaciones) y Colectivamente Exhaustivo (cobertura completa de todas las palancas clave).

### 8.1 META ADS (Facebook & Instagram)

**Estructura de campañas recomendada:**

| Etapa del Funnel | Tipo de Campaña | Objetivo | Presupuesto Sugerido (%) |
|---|---|---|---|
| TOFU (Awareness) | Video / Reels | Alcance + Reconocimiento de marca | 30% |
| MOFU (Consideración) | Carrusel / Imagen estática | Tráfico al sitio + Interacción | 30% |
| BOFU (Conversión) | Dynamic Product Ads (DPA) | Compras / Conversiones | 40% |

**Recomendaciones creativas (Framework MECE):**

**Hallazgo:** [Diagnóstico específico sobre el tipo de creativo que mejor convierte en este sector y buyer persona — con dato de industria si aplica]
**Recomendación:** Implementar los siguientes formatos en orden de prioridad:
- **Formato #1 — [Nombre]:** [Descripción detallada del formato: dimensiones, duración si es video, estructura visual slide a slide, texto overlay recomendado, argumento principal. Ej: "Video testimonial UGC de 15s. Los primeros 3 segundos muestran el dolor del cliente sin el producto. Segundos 4-10: transformación. Segundos 11-15: CTA con garantía. Formato 9:16 para Reels/Stories, 1:1 para feed."]
- **Formato #2 — [Nombre]:** [Descripción detallada]
- **Formato #3 — [Nombre]:** [Descripción detallada]
- **Formato #4 — Retargeting:** [Descripción del creativo específico para recuperar carritos y visitantes — qué mostrar, qué decir, qué urgencia usar]
**Justificación:** [Por qué estos formatos en este orden — qué datos o benchmarks de la industria lo respaldan]
**KPI de Éxito:** CTR > [X]% en feed; CPA < $[X calculado en sección 3]; Frecuencia < 4 antes de rotar creativos

**Copywriting y lenguaje (Framework MECE):**

**Hallazgo:** [Qué dice literalmente el buyer persona (del brief, sección 4) y cómo esto informa el copy más efectivo]
**Recomendación:**
- **Tono:** [Definición concreta — adjetivos específicos + qué evitar. Ej: "Cercano, femenino, aspiracional sin pedantería. Usar 'tú' directo. Evitar tecnicismos y anglicismos."]
- **Hooks de apertura (primeros 3 segundos):** [3 frases textuales listas para usar — cada una conecta con un aspecto distinto del dolor del buyer persona]
  - Hook 1 (dolor): "[frase textual]"
  - Hook 2 (social proof): "[frase textual]"
  - Hook 3 (transformación): "[frase textual]"
- **Estructura del copy BOFU:** Problema (1 línea) → Agitación (1 línea) → Solución (2 líneas) → Prueba Social (1 línea) → CTA (1 línea). Máximo 125 caracteres en texto principal para mobile.
- **CTAs recomendados:** [2-3 CTAs específicos listos para usar]
- **Objeciones a neutralizar en el copy:** [Para cada objeción identificada en Q6, el copy exacto que la rebate]
**Justificación:** El copy que replica el lenguaje literal del comprador reduce la fricción cognitiva y mejora el CTR hasta en un 30% (Nielsen, 2023).
**KPI de Éxito:** CTR de copy > [X]%; mensaje principal recordado por > 60% de la audiencia en brand lift test

**Segmentación de audiencias (Framework MECE):**

**Hallazgo:** [Diagnóstico del nivel de sofisticación de targeting recomendado para este cliente — inicio/intermedio/avanzado — y por qué]
**Recomendación:**
- **Audiencia fría (Prospecting):** [Intereses específicos, comportamientos y demografía detallada basada en el buyer persona. Listar intereses concretos, no categorías genéricas.]
- **Audiencia tibia (Engagement):** Visitantes del sitio web (últimos 30 días) + interactuados con perfil IG/FB (últimos 60 días). Excluir compradores.
- **Audiencia caliente (Retargeting):** Visitantes de páginas de producto (7 días) + add-to-cart (7 días) + checkout iniciado (3 días). Mensajes de urgencia específicos para cada segmento.
- **Lookalike:** 1% de base de compradores (mínimo 1,000 registros). Expandir a 2-3% cuando el volumen lo permita.
**Justificación:** [Por qué esta estructura de audiencias maximiza el retorno para este negocio específicamente]
**KPI de Éxito:** CPM audiencia fría < $[X]; tasa de retargeting a compra > [X]%; ROAS lookalike > [X]x

### 8.2 GOOGLE ADS

**Estructura de campañas recomendada:**

| Tipo de Campaña | Keywords / Targeting | Objetivo | Prioridad |
|---|---|---|---|
| Search — Marca | [Nombre de marca] + variantes | Defender tráfico de marca | Inmediata |
| Search — Genérico | Keywords de intención comercial alta | Capturar demanda existente | Alta |
| Shopping / PMax | Feed de productos optimizado | Conversiones directas e-commerce | Alta |
| Display Remarketing | Visitantes últimos 30 días | Recuperar interés | Media |

**Keywords y estructura de anuncios (Framework MECE):**

**Hallazgo:** [Diagnóstico del volumen de búsqueda estimado en el sector y el nivel de intención comercial de las keywords identificadas en el brief]
**Recomendación:**
- **Keywords de conversión alta — concordancia exacta y de frase:**
  [Listar 6-8 keywords específicas para ESTE negocio ordenadas por intención de compra — decreciente]
- **Keywords de marca a proteger:** [Nombre de marca] + comprar | + precio | + envío | + opiniones
- **Keywords negativas obligatorias:** [Listar 6-8 términos a excluir con razón breve para cada uno]
- **Estructura del anuncio RSA — Headlines (usar todos los 15 pins disponibles):**
  - H1-H3 (pin): Keywords principales con intención comercial — máx. 30 chars c/u
  - H4-H8: Propuesta de valor + beneficios diferenciales
  - H9-H12: Oferta, garantía, urgencia
  - H13-H15: Nombre de marca + variantes
- **Descriptions (4 disponibles):** D1 = beneficio principal + CTA | D2 = rebatir objeción #1 | D3 = garantía + urgencia | D4 = variante estacional si aplica. Máx. 90 chars c/u.
- **Extensions obligatorias:** Sitelinks (4 mínimo con descripción) + Callouts (6 mínimo) + Structured Snippets + Seller Ratings + Price Extensions si aplica
**Justificación:** [Por qué esta estructura de keywords y anuncios captura la mayor parte del volumen de búsqueda disponible con el menor CPC posible]
**KPI de Éxito:** CTR Search > [X]%; QS promedio > 7; CPA < $[X calculado en sección 3 × 0.85]

**Bidding y Performance Max (Framework MECE):**

**Hallazgo:** [Diagnóstico del volumen de conversiones actual o esperado — esto determina la estrategia de bidding]
**Recomendación:**
- Fase 1 (0-30 días): Manual CPC mejorado o tCPA inicial. CPA objetivo = [CPA sección 3 × 0.80]. Acumular datos de conversión.
- Fase 2 (30-90 días): Migrar a tROAS cuando se tengan 30+ conversiones/mes. ROAS objetivo = [Precio ÷ CPA × 0.85].
- Fase 3 (90+ días): Maximizar valor de conversión con tROAS agresivo + activar PMax con señales de audiencia de compradores reales.
- Performance Max: Activar con mínimo 50 conversiones/mes. Assets: 15 imágenes (min 6 landscape + 6 square + 3 portrait), 5 videos 15-20s, 15 headlines, 4 descriptions.
**Justificación:** [Por qué esta progresión de bidding optimiza el aprendizaje del algoritmo sin quemar presupuesto en la fase inicial]
**KPI de Éxito:** ROAS Fase 1 > [X]x; ROAS Fase 2 > [X]x; CPA PMax < [X]% vs. CPA Search

## 9. MAPA DE COSTOS Y RENTABILIDAD PUBLICITARIA

Esta sección establece los parámetros financieros no negociables para evaluar el rendimiento de cada canal. Los umbrales son vinculantes — toda campaña por debajo de ellos debe pausarse o optimizarse.

**Métricas objetivo por plataforma:**

| KPI | Meta Ads | Google Ads | Benchmark de Industria |
|---|---|---|---|
| CPA objetivo | $[Margen bruto × 0.25] | $[Margen bruto × 0.20] | E-commerce similar: $X–$X |
| ROAS mínimo aceptable | [Precio ÷ CPA Meta] | [Precio ÷ CPA Google] | Industria: 2.5–4x típico |
| ROAS objetivo | [ROAS mín × 1.5] | [ROAS mín × 1.5] | Top performers: 5x+ |
| CPM estimado | $X–$X (LATAM) | N/A | Promedio LATAM: $5–$15 |
| CTR mínimo aceptable | 1.5% feed / 0.8% Stories | 3.5–5% Search | Benchmarks 2024 |
| CVR mínima | 1.5% | 2.5% | E-commerce: 1.8% promedio |

**Reglas de corte de campañas (Framework MECE):**

**Hallazgo:** Sin reglas de pausa predefinidas, el presupuesto se dilapida en conjuntos de anuncios y keywords que generan clics sin conversión, incrementando el CPA total.
**Recomendación:**
- Pausar ad sets de Meta con CPA > 2× objetivo después de $[X = CPA objetivo × 2] de inversión sin conversión
- Pausar creativos de Meta con frecuencia > 4 sin conversión o CPM > $[X] por 7 días consecutivos
- Pausar keywords de Google con CTR < 1% después de 500 impresiones
- Pausar grupos de anuncios con CPA > 1.5× objetivo después de 30 conversiones acumuladas
**Justificación:** Estas reglas de pausa permiten una optimización sistemática sin decisiones emocionales, reduciendo el CPA promedio entre un 15–25% en los primeros 90 días.
**KPI de Éxito:** CPA promedio del portafolio dentro del objetivo en ≤ 45 días desde el lanzamiento

**Proyección de escalabilidad financiera:**

| Inversión mensual | ROAS objetivo | Ingresos atribuidos | Margen neto estimado |
|---|---|---|---|
| $[X — inversión inicial] | [ROAS obj] | $[X × ROAS] | $[Ingresos − inversión × (1−margen%)] |
| $[X×2] | [ROAS obj manteniéndose] | $[X×2 × ROAS] | $[calcular] |
| $[X×4] | [ROAS obj conservador con escala] | $[X×4 × ROAS conservador] | $[calcular] |

[Calcular las 3 filas con números reales basados en el margen y CPA de la sección 3.]

**Regla de oro de inversión:** [1 párrafo concreto: inversión recomendada en el mes 1, condiciones para doblar el presupuesto (ROAS sostenido por X semanas), y límite máximo de inversión antes de optimizar el embudo de conversión.]

## 10. HOJA DE RUTA SEO — 90 DÍAS (Framework MECE)

Cada recomendación de esta sección aplica el principio MECE: Hallazgo basado en datos → Recomendación técnica concreta → Justificación de impacto en negocio → KPI de Éxito medible. Sin solapamientos entre horizontes, cobertura exhaustiva de todas las palancas SEO.

**Diagnóstico SEO actual:**
[2-3 líneas de diagnóstico basado en lo que se conoce del sitio y sector. Mencionar las 2-3 brechas más críticas que frenan el posicionamiento orgánico.]

---

### Horizonte 1 — Quick Wins (Semanas 1–4): Correcciones técnicas y on-page

**Recomendación SEO 1.1 — [Título de acción]:**
- **Hallazgo:** [Dato específico del problema detectado — ej: "El 60% de las páginas de producto carecen de meta description optimizada, resultando en fragmentos auto-generados que reducen el CTR orgánico"]
- **Recomendación:** [Qué hacer exactamente y cómo — pasos concretos]
- **Justificación:** [Por qué esta acción mueve la aguja del negocio — impacto en tráfico, CTR o conversión]
- **KPI de Éxito:** [Métrica medible y plazo — ej: "CTR orgánico +15–25% en 30 días medido en Google Search Console"]

**Recomendación SEO 1.2 — [Título de acción]:**
- **Hallazgo:** [Dato específico del problema]
- **Recomendación:** [Qué hacer exactamente]
- **Justificación:** [Impacto en negocio]
- **KPI de Éxito:** [Métrica y plazo]

**Recomendación SEO 1.3 — Schema Markup Product + Review:**
- **Hallazgo:** Sin schema markup, Google no puede mostrar Rich Snippets (estrellas, precio, disponibilidad) en los resultados de búsqueda, reduciendo el CTR orgánico vs. competidores que sí lo implementan.
- **Recomendación:** Implementar schema.org/Product con propiedades: name, description, image, sku, brand, offers (price, priceCurrency, availability). Agregar schema Review/AggregateRating con datos reales de clientes.
- **Justificación:** Los Rich Snippets incrementan el CTR orgánico entre un 20–30% (Google, 2023) sin modificar el ranking — efecto directo en tráfico sin costo adicional.
- **KPI de Éxito:** Rich Snippets activos en Google Search Console en ≤ 14 días; CTR de páginas con schema > CTR de páginas sin schema en +25%

**Recomendación SEO 1.4 — Core Web Vitals (LCP, FID, CLS):**
- **Hallazgo:** [Estimación del estado actual de velocidad basada en la plataforma del sitio — Shopify, WooCommerce, etc.]
- **Recomendación:** Comprimir imágenes a formato WebP (< 200KB por imagen), activar lazy loading, eliminar CSS/JS bloqueantes en above-the-fold, [acción específica según plataforma].
- **Justificación:** Google usa Core Web Vitals como factor de ranking desde 2021. Un LCP > 4s puede suprimir hasta 2 posiciones en SERP vs. competidores con mejor velocidad.
- **KPI de Éxito:** LCP < 2.5s, FID < 100ms, CLS < 0.1 — medidos en PageSpeed Insights en ≤ 21 días

---

### Horizonte 2 — Crecimiento Orgánico (Semanas 5–8): Contenido y autoridad

**Recomendación SEO 2.1 — Topic Cluster y Contenido Pilar:**
- **Hallazgo:** [Diagnóstico del estado actual del contenido del sitio — ¿hay blog? ¿hay páginas de categoría optimizadas? ¿qué keywords no están siendo atacadas con contenido?]
- **Recomendación:** Crear un topic cluster alrededor de [tema principal del negocio]: (1) Página pilar de 2,000+ palabras sobre [keyword principal de alta intención]. (2) 4-5 artículos de soporte de 800-1,200 palabras sobre: [listar 4-5 subtemas específicos del sector]. (3) Internal linking entre pilar y artículos de soporte.
- **Justificación:** Los topic clusters incrementan la autoridad temática del dominio, mejorando el posicionamiento de todas las páginas del cluster en un promedio de 8-12 posiciones (Moz, 2023).
- **KPI de Éxito:** Página pilar en top 20 en 45 días; top 10 en 90 días para keyword principal

**Recomendación SEO 2.2 — Páginas de Categoría con Copy SEO:**
- **Hallazgo:** Las páginas de categoría en e-commerce suelen carecer de copy textual, privándolas de relevancia semántica para keywords comerciales de alta intención y volumen.
- **Recomendación:** Agregar 150–200 palabras de copy SEO al inicio de cada página de categoría principal. Incluir keyword exacta en los primeros 100 caracteres + 2-3 variaciones semánticas + H2 de soporte con keyword de intención comercial. [Listar las 3-4 páginas de categoría prioritarias para este negocio].
- **Justificación:** Páginas de categoría con copy SEO optimizado posicionan para keywords comerciales de alto volumen con alta intención de compra — directamente vinculadas a conversión.
- **KPI de Éxito:** Páginas de categoría en top 15 para sus keywords objetivo en 60 días

**Recomendación SEO 2.3 — Linkbuilding Inicial:**
- **Hallazgo:** [Diagnóstico del perfil de backlinks actual — ¿tiene alguno? ¿cuál es el DA estimado vs. competidores?]
- **Recomendación:** Estrategia de linkbuilding en 3 tácticas: (1) Directorios sectoriales de alta autoridad: [listar 3-4 directorios relevantes para el sector]. (2) PR digital: notas de prensa a medios sectoriales o de estilo de vida. (3) Colaboraciones de contenido con marcas complementarias no competidoras.
- **Justificación:** Cada backlink de calidad desde un dominio DA > 30 incrementa la autoridad del dominio y mejora el ranking de todas las páginas del sitio.
- **KPI de Éxito:** 5-10 backlinks de calidad (DA > 30) en 60 días; DA del dominio +3-5 puntos en 90 días

---

### Horizonte 3 — Dominación Orgánica (Semanas 9–12): Autoridad de dominio

**Recomendación SEO 3.1 — Contenido Evergreen Estratégico:**
- **Hallazgo:** Los competidores no están posicionando contenido informacional en los siguientes temas con alto volumen de búsqueda, dejando una ventana de oportunidad:
- **Recomendación:** Crear 3 artículos evergreen de alta profundidad (2,000+ palabras): [Tema 1 — keyword + volumen estimado], [Tema 2], [Tema 3]. Formato: guía definitiva + datos actualizados + imágenes propias + FAQ con schema.
- **Justificación:** El contenido evergreen genera tráfico compuesto que se incrementa mes a mes sin inversión adicional. Un artículo bien posicionado puede atraer 200-500 visitas mensuales por 3-5 años.
- **KPI de Éxito:** 3 artículos en top 10 para sus keywords objetivo en 90 días

**KPIs Globales de SEO a 90 Días:**
| Métrica | Línea Base (hoy) | Objetivo 30 días | Objetivo 90 días |
|---|---|---|---|
| Tráfico orgánico mensual | [X visitas estimadas] | +20% | +50–80% |
| Keywords en top 10 | [X] | [X+10] | [X+25] |
| CTR orgánico promedio | [X%] | [X+1.5]% | [X+3]% |
| DA del dominio | [X estimado] | [X+2] | [X+5] |

**Stack SEO obligatorio:** Google Search Console (auditoría y monitoreo), Semrush o Ahrefs (keyword tracking + backlinks), Screaming Frog (auditoría técnica), PageSpeed Insights (Core Web Vitals)[, app específica si el sitio está en Shopify: SEO Booster o Plug in SEO].

## 11. PLAN DE DOMINACIÓN COMPETITIVA (Framework MECE)

Cada iniciativa competitiva aplica MECE: sin solapamientos entre tácticas, cobertura exhaustiva de todos los frentes donde se puede ganar participación de mercado.

**Mapa de vulnerabilidades competitivas:**

| Competidor | Vulnerabilidad Principal | Vector de Ataque | Canal | Plazo |
|---|---|---|---|---|
| [Competidor 1] | [Debilidad específica y explotable — basada en Q10] | [Táctica concreta para explotarla] | [Meta / Google / SEO / Contenido] | [Corto/Mediano] |
| [Competidor 2] | [Debilidad específica] | [Táctica concreta] | [Canal] | [Plazo] |
| [Competidor 3] | [Debilidad específica] | [Táctica concreta] | [Canal] | [Plazo] |

---

**Iniciativa Competitiva 11.1 — Keywords de Competidores en Google:**
- **Hallazgo:** [Diagnóstico: ¿qué volumen de búsquedas tienen las keywords de marca de los competidores? ¿cuál es el CPC estimado? ¿tiene sentido económico pujar por ellas dado el margen del negocio?]
- **Recomendación:** [Si aplica] Crear campañas de Search específicas pujando por: [Nombre Competidor] + "alternativa", [Nombre Competidor] + "vs", [Nombre Competidor] + "precio". Landing page dedicada comparando ambas marcas con lenguaje objetivo. [Si no aplica, justificar por qué y proponer alternativa más efectiva.]
- **Justificación:** Los usuarios que buscan marcas competidoras están en fase de decisión avanzada — tasa de conversión típicamente 40–60% superior a búsquedas genéricas.
- **KPI de Éxito:** CPA de campañas competidoras < [X% del CPA objetivo]; Conversion Rate > [X]%

**Iniciativa Competitiva 11.2 — Contenido SEO de Comparación:**
- **Hallazgo:** Las páginas de comparación ([Marca A] vs [Marca B]) capturan tráfico de alta intención en fase de decisión — generalmente con CTR y CVR superiores al promedio del sitio.
- **Recomendación:** Crear páginas de contenido tipo: "[Nombre de la marca] vs [Competidor 1]: ¿Cuál es mejor en [atributo clave]?" para cada competidor. Formato: tabla comparativa + análisis neutral + veredicto claro favorable al cliente + testimonios. Optimizar para featured snippet.
- **Justificación:** [Dato de por qué este contenido de comparación genera tráfico de alta conversión en este sector específico]
- **KPI de Éxito:** Páginas de comparación en top 5 para keywords "[marca] vs [competidor]" en 60 días; CVR > 3%

**Iniciativa Competitiva 11.3 — Mensajes diferenciadores por competidor (para ads):**

Para capturar clientes insatisfechos de cada competidor, usar los siguientes mensajes en campañas de retargeting y keywords de comparación:
- **vs. [Competidor 1]:** "[Mensaje diferenciador específico basado en la brecha identificada en Q10 — listo para usar como copy de anuncio]"
- **vs. [Competidor 2]:** "[Mensaje diferenciador específico — listo para usar]"
- **vs. [Competidor 3]:** "[Mensaje diferenciador específico — listo para usar]"
**KPI de Éxito:** CTR de anuncios con mensajes diferenciadores > CTR de anuncios genéricos en +20%

**Iniciativa Competitiva 11.4 — Oportunidades Blue Ocean:**
- **Hallazgo:** El análisis competitivo revela los siguientes segmentos o propuestas de valor donde ningún competidor está posicionado fuertemente:
  1. [Oportunidad Blue Ocean 1 — con estimación de tamaño o potencial]
  2. [Oportunidad Blue Ocean 2]
  3. [Oportunidad Blue Ocean 3 — la de mayor potencial de crecimiento a largo plazo]
- **Recomendación:** [Estrategia de entrada para la oportunidad de mayor potencial — mínimo 3 oraciones con pasos concretos]
- **Justificación:** [Por qué estas oportunidades representan ventaja sostenible vs. intentar competir frontalmente en segmentos ya saturados]
- **KPI de Éxito a 6 meses:** Share of Voice en keywords objetivo: [X]%; Posición promedio para keywords de oportunidad: top [X]; Tráfico orgánico atribuido a iniciativas Blue Ocean: [X]% del total

---
**Documento preparado por Dr. Steve Dogs**
*PhD Performance Marketing — Stanford Dog University*
*Director de Estrategia Digital, BG Consult*
*Confidencial — Documento estratégico de uso exclusivo del cliente*`;


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
      const introMessage = (firstQ.steveIntro || '') + firstQ.question;
      
      await supabase.from('steve_messages').insert({
        conversation_id: activeConversationId,
        role: 'assistant',
        content: introMessage,
      });

      return new Response(
        JSON.stringify({
          conversation_id: activeConversationId,
          message: introMessage,
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

    // After Q0 (website_url): save URL to clients table
    if (answeredQuestions === 1) {
      try {
        const urlResponse = userMessages[0]?.content || '';
        const urlMatch = urlResponse.match(/(?:https?:\/\/)?(?:www\.)?[\w-]+(?:\.[\w-]+)+(?:\/\S*)?/i);
        if (urlMatch) {
          await supabase
            .from('clients')
            .update({ website_url: urlMatch[0].startsWith('http') ? urlMatch[0] : `https://${urlMatch[0]}` })
            .eq('id', client_id);
        }
      } catch (e) {
        console.error('Error saving website URL:', e);
      }
    }

    // Build DETERMINISTIC question context
    let questionContext = '';
    
    if (isLastQuestion) {
      questionContext = `\n\n═══ INSTRUCCIÓN DEL SISTEMA ═══\nEl cliente acaba de responder la PREGUNTA 15 (la última). ${BRIEF_TEMPLATE}`;
    } else {
      const justAnsweredIndex = answeredQuestions - 1; // 0-based index of question just answered
      const nextQuestionIndex = answeredQuestions; // 0-based index of next question
      const nextQ = BRAND_BRIEF_QUESTIONS[nextQuestionIndex];
      const justAnsweredQ = BRAND_BRIEF_QUESTIONS[justAnsweredIndex];
      
      const hasFields = nextQ?.fields?.length > 0;
      
      // Q0 = website_url (shown as "Pregunta 0"), Q1 onwards = "Pregunta 1 de 15" etc.
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

NO preguntes NADA que no sea la ${nextLabel}. NO anticipes temas futuros. NO inventes preguntas.`;

      // Special instruction for after Q0 - website URL saved
      if (answeredQuestions === 1) {
        questionContext += '\n\nINSTRUCCIÓN EXTRA Q0: El cliente acaba de dar su URL. Confírmale brevemente que la guardaste y que la usarás para el análisis SEO. Luego arranca con la Pregunta 1 del Brief.';
      }

      // Special instruction for after Q2 - calculate CPA
      if (answeredQuestions === 3) {
        questionContext += '\n\nINSTRUCCIÓN EXTRA Q2: El cliente envió datos financieros. CALCULA: Margen bruto = Precio - Costo - Envío. Margen % = Margen/Precio×100. CPA Máximo = Margen × 0.30. Muestra tabla markdown con resultados. Explica qué es CPA. Di que guardaste el CPA en configuración financiera.';
      }
    }

    const chatMessages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT + questionContext },
      ...messages!.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    console.log(`Steve chat: conversation ${activeConversationId}, answered ${answeredQuestions}/${BRAND_BRIEF_QUESTIONS.length}`);

    const maxTokens = isLastQuestion ? 8000 : 1200;

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

    // After Q2 (now index 3 because Q0 is website_url): save CPA to financial config
    // Q0=index0, Q1=index1, Q2=index2, so after 3 user messages answeredQuestions===3
    if (answeredQuestions === 3) {
      try {
        const q2Response = userMessages[2]?.content || '';
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

    // If complete, update summary and trigger automatic SEO/Keywords analysis
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

      // Auto-trigger analyze-brand in background (fire and forget)
      try {
        // Get client info for website URL and competitor URLs
        const { data: clientData } = await supabase
          .from('clients')
          .select('website_url')
          .eq('id', client_id)
          .single();

        // Extract website URL from Q1 response (business_pitch)
        const q1Response = userMessages[0]?.content || '';
        const urlMatch = q1Response.match(/https?:\/\/[^\s,]+|www\.[^\s,]+|\b\w+\.(cl|com|net|store|shop|myshopify\.com)\b/i);
        const websiteUrl = clientData?.website_url || (urlMatch ? urlMatch[0] : null);

        // Extract competitor URLs from Q9 response (competitors)
        const q9Response = userMessages[8]?.content || '';
        const competitorUrls: string[] = [];
        const urlMatches = q9Response.match(/https?:\/\/[^\s,]+|www\.[^\s,]+|\b\w+\.(cl|com|net|store|shop|myshopify\.com)\b/gi) || [];
        for (const u of urlMatches.slice(0, 3)) {
          const cleaned = u.startsWith('http') ? u : `https://${u}`;
          competitorUrls.push(cleaned);
        }

        // Mark analysis as pending in brand_research
        await supabase
          .from('brand_research')
          .upsert({
            client_id,
            research_type: 'analysis_status',
            research_data: { status: 'pending', started_at: new Date().toISOString() },
          }, { onConflict: 'client_id,research_type' });

        // Call analyze-brand edge function asynchronously (don't await)
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const projectId = supabaseUrl.replace('https://', '').split('.')[0];
        const analyzeUrl = `https://${projectId}.supabase.co/functions/v1/analyze-brand`;
        
        fetch(analyzeUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
            'x-client-info': 'steve-chat-auto-trigger',
          },
          body: JSON.stringify({
            client_id,
            website_url: websiteUrl,
            competitor_urls: competitorUrls,
            research_type: 'full_analysis',
          }),
        }).then(async (r) => {
          if (r.ok) {
            console.log(`Auto analyze-brand completed for client ${client_id}`);
            // Mark as complete
            await supabase
              .from('brand_research')
              .upsert({
                client_id,
                research_type: 'analysis_status',
                research_data: { status: 'complete', completed_at: new Date().toISOString() },
              }, { onConflict: 'client_id,research_type' });
          } else {
            const errText = await r.text();
            console.error(`Auto analyze-brand failed: ${r.status}`, errText);
            await supabase
              .from('brand_research')
              .upsert({
                client_id,
                research_type: 'analysis_status',
                research_data: { status: 'error', error: `HTTP ${r.status}` },
              }, { onConflict: 'client_id,research_type' });
          }
        }).catch(async (err) => {
          console.error('Auto analyze-brand fetch error:', err);
          await supabase
            .from('brand_research')
            .upsert({
              client_id,
              research_type: 'analysis_status',
              research_data: { status: 'error', error: String(err) },
            }, { onConflict: 'client_id,research_type' });
        });

        console.log(`Auto analyze-brand triggered for client ${client_id}, website: ${websiteUrl}`);
      } catch (autoAnalyzeErr) {
        console.error('Error triggering auto analyze-brand:', autoAnalyzeErr);
      }
    }

    // Next question fields & examples
    const nextQuestionIndex = Math.min(answeredQuestions, BRAND_BRIEF_QUESTIONS.length - 1);
    const nextQ = !isLastQuestion && nextQuestionIndex < BRAND_BRIEF_QUESTIONS.length
      ? BRAND_BRIEF_QUESTIONS[nextQuestionIndex]
      : null;

    return new Response(
      JSON.stringify({
        conversation_id: activeConversationId,
        message: assistantMessage,
        question_index: nextQuestionIndex,
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
