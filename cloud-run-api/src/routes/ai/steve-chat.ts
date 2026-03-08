import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface BriefQuestion {
  id: string;
  shortLabel: string; // Para UI: "Ahora: [shortLabel]"
  question: string;
  examples: string[];
  fields: Array<{ key: string; label: string; type: string; placeholder?: string; prefix?: string; suffix?: string; options?: Array<{ value: string; label: string }> }>;
  steveIntro?: string;
  commentGuide: string;
  validation?: string;
}

function getBrandBriefQuestions(): BriefQuestion[] {
  return [
    {
      id: 'website_url',
      shortLabel: 'URL de tu sitio web',
      question: '**Antes de empezar — NECESITO TU PÁGINA WEB:**\n\nSin tu URL no puedo hacer el análisis SEO, compararte con la competencia ni generar el brief completo. 🌐\n\n**¿Cuál es tu sitio web o tienda online?**\n\n(Si todavía no tienes, escribe "sin web" y te explico qué hacemos en ese caso)',
      examples: ['www.mitienda.cl', 'mitienda.myshopify.com', 'www.mimarca.com.ar'],
      fields: [{ key: 'url', label: '🌐 URL de tu sitio web o tienda online', type: 'text', placeholder: 'Ej: www.mitienda.cl' }],
      steveIntro: '*olisquea el aire y se prepara* 🐕\n\n¡WOOF! Soy Steve, Bulldog Francés con doctorado en Performance Marketing de Stanford. Vamos a ir charlando y con lo que me cuentes voy armando tu **Brief Estratégico**. El brief todavía no está listo — cuando terminemos todas las preguntas te aviso y lo tendrás. Puedes entrar y salir cuando quieras, guardamos el progreso.\n\nPara empezar necesito UNA cosa:\n\n',
      commentGuide: 'Responde en tono conversacional. Si da URL válida, confirma brevemente y pasa a Pregunta 1. Si escribe "sin web" o "no tengo", ACEPTA: explica que el análisis SEO y competitivo será limitado sin URL pero que pueden continuar y agregarla después, y avanza a Pregunta 1. También acepta URLs de Instagram o perfil Shopify. No inventes otros ejemplos; invita a usar los de abajo.',
    },
    {
      id: 'business_pitch',
      shortLabel: 'Tu negocio (pitch)',
      question: '**Pregunta 1 de 16 — TU NEGOCIO:** ¿A qué se dedica tu empresa y qué vendes exactamente? Dame el pitch de 30 segundos.',
      examples: ['Vendemos ropa deportiva premium para mujeres', 'Somos una agencia de diseño web para pymes', 'Tenemos una tienda de cosmética natural en Shopify'],
      fields: [],
      steveIntro: '*sacude las orejas y se sienta* 🐕\n\nVamos bien. Siguiente tema:\n\n',
      commentGuide: 'Comenta en 1-3 oraciones (conversacional). Si es vago, pide más detalle. No inventes otros ejemplos; solo invita a usar los de abajo.',
    },
    {
      id: 'numbers',
      shortLabel: 'Números (precio, costo, fase)',
      question: '**Pregunta 2 de 16 — LOS NÚMEROS:**\n\nNecesito la carne de tu negocio. **Llena los campos del formulario que aparece abajo** y yo calculo tu **Margen Bruto** y tu **CPA Máximo Viable**. 💰',
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
      commentGuide: 'Evalúa los datos financieros recibidos. CALCULA Margen bruto, Margen %, CPA Máximo; muestra tabla markdown. Di que guardaste el CPA. Menciona la fase del negocio y presupuesto. Si los campos están completos, ACEPTA con [AVANZAR]. NO pidas que llene el formulario de nuevo.',
    },
    {
      id: 'sales_channels',
      shortLabel: 'Canales de venta',
      question: '**Pregunta 3 de 16 — CANALES DE VENTA:**\n\nPonle porcentaje a cada canal en los campos del formulario abajo. **Deben sumar 100%.** Si no usas un canal, déjalo en 0. 🐕📝',
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
      steveIntro: '*ladea la cabeza curioso* 🐕\n\nPara saber dónde enfocar la estrategia necesito que me digas cómo se reparten hoy tus ventas. ',
      commentGuide: 'Comenta en 1-3 oraciones. Analiza si la distribución de canales tiene sentido para su negocio. Si los porcentajes suman 100% y son coherentes, ACEPTA con [AVANZAR]. NO pidas que llene el formulario de nuevo.',
    },
    {
      id: 'persona_profile',
      shortLabel: 'Cliente ideal (buyer persona)',
      question: '**Pregunta 4 de 16 — TU CLIENTE IDEAL (Buyer Persona):**\n\nLlena los 8 campos del formulario abajo para construir el perfil de tu cliente ideal.',
      examples: [],
      fields: [
        { key: 'name', label: '👤 Nombre ficticio', type: 'text', placeholder: 'Ej: María' },
        { key: 'age', label: '🎂 Edad', type: 'number', placeholder: 'Ej: 32' },
        { key: 'gender', label: '🧑 Género', type: 'text', placeholder: 'Ej: Mujer' },
        { key: 'city', label: '📍 Ciudad / Zona', type: 'text', placeholder: 'Ej: Santiago' },
        { key: 'occupation', label: '💼 Ocupación', type: 'text', placeholder: 'Ej: Diseñadora freelance' },
        { key: 'income', label: '💰 Ingreso mensual aprox.', type: 'text', prefix: '$', placeholder: 'Ej: 1.500.000' },
        { key: 'family', label: '💍 Estado civil / Familia', type: 'text', placeholder: 'Ej: Soltera con gato' },
        { key: 'interest', label: '🎯 ¿Por qué te compra?', type: 'text', placeholder: 'Ej: Verse bien sin esfuerzo' },
      ],
      steveIntro: '*se pone serio* 🎯\n\nAhora necesito el perfil de tu cliente ideal para orientar todo el brief. ',
      commentGuide: 'Comenta en tono conversacional (1-3 oraciones). Revisa si el perfil del buyer persona cuadra con el producto que vende. Si los 8 campos están completos y coherentes, ACEPTA con [AVANZAR]. NO pidas que llene el formulario de nuevo.',
    },
    {
      id: 'persona_pain',
      shortLabel: 'Dolor del cliente',
      question: '**Pregunta 5 de 16 — SU DOLOR PROFUNDO:** Necesito entender el dolor real de tu cliente. No me des una frase. Cuéntame:\n\n1. ¿Qué problema específico tiene?\n2. ¿Cómo lo ha intentado resolver antes?\n3. ¿Por qué esa solución anterior no le dio satisfacción completa?\n\nSé específico — piensa en situaciones concretas que vive tu cliente.',
      examples: [],
      fields: [],
      steveIntro: '*pone cara seria* 😰\n\n',
      commentGuide: 'Comenta en 1-3 oraciones. Analiza si el dolor tiene las tres dimensiones (problema, intento fallido, frustración). Si falta o es genérico, RECHAZA con [RECHAZO]. Si la respuesta está completa, ACEPTA con [AVANZAR]. No inventes otros ejemplos.',
    },
    {
      id: 'persona_words',
      shortLabel: 'Palabras y objeciones del cliente',
      question: '**Pregunta 6 de 16 — SUS PALABRAS Y OBJECIONES:** ¿Qué dice EXACTAMENTE tu cliente cuando se queja con un amigo sobre este problema? Dame **2 o 3 frases literales distintas** — una queja habitual, una objeción de compra, y una frustración pasada.',
      examples: [],
      fields: [],
      steveIntro: '*saca su libreta* 📝\n\n',
      commentGuide: 'Comenta en tono conversacional. Verifica que haya MÍNIMO 2 frases literales. Si solo hay una, RECHAZA con [RECHAZO]. Si tiene 2+ frases literales, ACEPTA con [AVANZAR]. No inventes otros ejemplos.',
    },
    {
      id: 'persona_transformation',
      shortLabel: 'La transformación (después de usarte)',
      question: '**Pregunta 7 de 16 — LA TRANSFORMACIÓN:** ¿Cómo se ve la vida de tu cliente DESPUÉS de usarte? ¿A quién quiere impresionar? ¿Qué cambia para él/ella?',
      examples: [],
      fields: [],
      steveIntro: '*levanta las orejas, ojos brillantes* ✨\n\n',
      commentGuide: 'Comenta en 1-3 oraciones. Analiza si la transformación es emocional y tangible. Si es vaga, RECHAZA con [RECHAZO] y pide detalles. Si es concreta, ACEPTA con [AVANZAR]. No inventes otros ejemplos.',
    },
    {
      id: 'persona_lifestyle',
      shortLabel: 'Estilo de vida del cliente',
      question: '**Pregunta 8 de 16 — SU MUNDO:** ¿Qué marcas consume tu cliente ideal? ¿Dónde pasa su tiempo online? ¿Qué estilo de vida tiene? ¿Qué influencers o cuentas sigue?',
      examples: [],
      fields: [],
      steveIntro: '*mueve la cola curioso* 🐕\n\n',
      commentGuide: 'Analiza si el estilo de vida es coherente con el buyer persona. HAZ INFERENCIAS: en base a edad, ingreso, ocupación, deduce qué consume. Si la respuesta es coherente, ACEPTA con [AVANZAR]. NO escribas otros ejemplos en tu mensaje.',
    },
    {
      id: 'competitors',
      shortLabel: '3 competidores (con URLs)',
      question: '**Pregunta 9 de 16 — COMPETENCIA:**\n\nNecesito **EXACTAMENTE 3 competidores** con su página web o Instagram. Llena los campos del formulario abajo.\n\n⚠️ **Sin 3 competidores con URLs NO avanzamos.**',
      examples: [],
      fields: [
        { key: 'comp1_name', label: '1️⃣ Nombre Competidor 1', type: 'text', placeholder: 'Ej: Cannon Home' },
        { key: 'comp1_url', label: '🌐 Web / Instagram Competidor 1', type: 'text', placeholder: 'Ej: cannonhome.cl' },
        { key: 'comp2_name', label: '2️⃣ Nombre Competidor 2', type: 'text', placeholder: 'Ej: Intime' },
        { key: 'comp2_url', label: '🌐 Web / Instagram Competidor 2', type: 'text', placeholder: 'Ej: intime.cl' },
        { key: 'comp3_name', label: '3️⃣ Nombre Competidor 3', type: 'text', placeholder: 'Ej: Marca X' },
        { key: 'comp3_url', label: '🌐 Web / Instagram Competidor 3', type: 'text', placeholder: 'Ej: marcax.com' },
      ],
      steveIntro: '*olfatea el territorio enemigo* 🔍\n\nNecesito tu competencia directa para compararte y ver qué hacen bien o mal. ',
      commentGuide: 'Verifica que los URLs parezcan reales y que los competidores sean del mismo sector. Si los 3 competidores están completos, ACEPTA con [AVANZAR]. NO pidas que llene el formulario de nuevo.',
    },
    {
      id: 'competitors_weakness',
      shortLabel: 'Análisis de competidores',
      question: '**Pregunta 10 de 16 — ANÁLISIS COMPETITIVO:**\n\nPara cada uno de tus 3 competidores, llena los campos del formulario abajo: qué promete y no cumple, y por qué TÚ lo haces mejor.',
      examples: [],
      fields: [
        { key: 'comp1_fail', label: '1️⃣ Competidor 1: ¿Qué promete y NO cumple?', type: 'textarea', placeholder: 'Ej: Promete algodón premium pero es mezcla barata' },
        { key: 'comp1_better', label: '✅ ¿Por qué TÚ lo haces mejor?', type: 'textarea', placeholder: 'Ej: Usamos algodón pima certificado' },
        { key: 'comp2_fail', label: '2️⃣ Competidor 2: ¿Qué promete y NO cumple?', type: 'textarea', placeholder: 'Ej: Dice entrega en 24h pero demora 5 días' },
        { key: 'comp2_better', label: '✅ ¿Por qué TÚ lo haces mejor?', type: 'textarea', placeholder: 'Ej: Entregamos el mismo día en Santiago' },
        { key: 'comp3_fail', label: '3️⃣ Competidor 3: ¿Qué promete y NO cumple?', type: 'textarea', placeholder: '' },
        { key: 'comp3_better', label: '✅ ¿Por qué TÚ lo haces mejor?', type: 'textarea', placeholder: '' },
      ],
      steveIntro: '*gruñe con desconfianza* 🐕\n\nAhora cuéntame para cada uno qué prometen y no cumplen, y por qué tú lo haces mejor. ',
      commentGuide: 'Analiza si las diferenciaciones son REALES y específicas (no genéricas). Si los campos están completos y son coherentes, ACEPTA con [AVANZAR]. NO pidas que llene el formulario de nuevo.',
    },
    {
      id: 'your_advantage',
      shortLabel: 'Tu ventaja incopiable',
      question: '**Pregunta 11 de 16 — TU VENTAJA INCOPIABLE:** ¿Qué tienes que tu competencia JAMÁS podrá copiar? ¿Por qué un cliente se cambiaría de ellos a ti?',
      examples: [],
      fields: [],
      steveIntro: '*se para firme* 🏆\n\n',
      commentGuide: 'Comenta en tono conversacional (1-3 oraciones). Analiza si la ventaja es realmente incopiable. Si es genérica, RECHAZA con [RECHAZO]. Si es específica, ACEPTA con [AVANZAR].',
    },
    {
      id: 'purple_cow_promise',
      shortLabel: 'Vaca púrpura y gran promesa',
      question: '**Pregunta 12 de 16 — VACA PÚRPURA Y GRAN PROMESA:**\n\n¿Qué te hace DESTACAR visualmente o conceptualmente en tu industria? ¿Cuál es tu GRAN PROMESA en una frase que tu cliente ideal no puede ignorar?',
      examples: [],
      fields: [],
      steveIntro: '*se para en dos patas, emocionado* 🐄💜\n\n',
      commentGuide: 'Comenta en 1-3 oraciones. Es sobre posicionamiento y diferenciación, NO logos ni colores. Si la respuesta tiene promesa clara, ACEPTA con [AVANZAR].',
    },
    {
      id: 'villain_guarantee',
      shortLabel: 'Villano y garantía',
      question: '**Pregunta 13 de 16 — EL VILLANO:** ¿Contra qué enemigo común lucha tu marca? ¿Qué creencia errónea quieres erradicar del mercado?\n\n¿Y qué GARANTÍA "absurda" podrías dar para eliminar el miedo de comprar?',
      examples: [],
      fields: [],
      steveIntro: '*gruñe pensando en los enemigos de tu marca* 🐕\n\n',
      commentGuide: 'Comenta en tono conversacional. Analiza si el villano es poderoso y si la garantía elimina el riesgo. Si ambos están, ACEPTA con [AVANZAR].',
    },
    {
      id: 'proof_tone',
      shortLabel: 'Prueba social y tono',
      question: '**Pregunta 14 de 16 — PRUEBA SOCIAL Y TONO:** ¿Qué prueba tienes de que tu producto funciona? (testimonios, reviews, fotos de clientes)\n\n¿Y qué TONO de comunicación conecta con tu cliente?',
      examples: [],
      fields: [],
      steveIntro: '*olfatea buscando evidencia* 📸\n\n',
      commentGuide: 'Comenta en 1-3 oraciones. Evalúa prueba social y si el tono cuadra con el buyer persona. Si la respuesta cubre ambos temas, ACEPTA con [AVANZAR].',
    },
    {
      id: 'brand_identity',
      shortLabel: 'Identidad visual (colores, estilo)',
      question: '**Pregunta 15 de 16 — IDENTIDAD VISUAL DE MARCA:**\n\nCuéntame sobre la identidad visual de tu marca:\n\n- 🎨 **¿Cuáles son tus colores de marca?** (hex, RGB o nombre)\n- 🖼 **¿Cuál es el estilo visual** que quieres proyectar?\n- ✍️ **¿Tienes un manual de marca o guía de estilo?**',
      examples: [],
      fields: [],
      steveIntro: '*saca su paleta de colores* 🎨🐕\n\n',
      commentGuide: 'Comenta en tono conversacional. Valida colores y estilo; si no cuadran, sugiere. NO pidas fotos ni logos (eso es solo en la pregunta 16). Si la respuesta tiene colores/estilo, ACEPTA con [AVANZAR].',
    },
    {
      id: 'brand_assets_upload',
      shortLabel: 'Archivos visuales (logo y fotos)',
      question: '**Pregunta 16 de 16 — ARCHIVOS VISUALES (OBLIGATORIA):**\n\nPerfecto, tengo todo lo que necesito para tu estrategia.\nAntes de generar el análisis, necesito que subas:\n\n📸 **Logo de tu marca** (PNG o JPG)\n📦 **Fotos de tu producto principal** (mínimo 2)\n🖼 **Referencias visuales de anuncios que te gusten** (opcional)\n\nEstos archivos los usaré para crear tus creatividades y asegurarme que todo refleje tu marca correctamente.\n\n📤 **Usa los botones de subida que aparecen AQUÍ ABAJO en el chat.**\n\nSi no tienes fotos ahora, escribe "no tengo fotos" y continuamos igual.',
      examples: ['Ya subí mi logo y 3 fotos de productos', 'No tengo fotos ahora pero las subo después'],
      fields: [],
      steveIntro: '*saca la cámara y ladra* 📸🐕\n\n',
      commentGuide: 'Responde en tono conversacional. Si subió assets, confirma que los recibiste. Si no tiene fotos, acepta y continúa. En ambos casos genera el BRIEF COMPLETO. No incluyas en el brief frases como "subo el logo ahora mismo".',
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

🌎 IDIOMA: Español latinoamericano neutro (México, Colombia, Chile, Perú, etc.). NO uses voseo argentino: no digas "vos", "podés", "tenés", "dale", "che", "acá" por "aquí". Usa "tú" y formas como "puedes", "tienes", "tendrás", "aquí".

🐕 CONTEXTO CONVERSACIONAL (OBLIGATORIO EN CADA RESPUESTA):
- Estructura de cada mensaje: (1) Reacción breve a lo que dijo — 1 a 3 oraciones, natural ("tiene sentido", "ah, claro", "me sirve"). (2) La siguiente pregunta que te indica el sistema — con su intro y texto. (3) Cierre opcional: "¿Alguna duda antes de seguir?" o "¿Te queda claro?" al menos 1 de cada 3 mensajes. No suenes a formulario; habla como en un chat.
- El brief NO está listo hasta que el cliente termine TODAS las preguntas. TÚ le avisarás cuando esté listo (solo después de la pregunta 16).
- Debes dejar claro: "El brief todavía no está listo — lo voy armando con lo que me vas contando. Cuando terminemos todas las preguntas te aviso y lo tendrás. Puedes entrar y salir cuando quieras, guardamos el progreso."
- Repite esta idea de forma natural cada tanto: que puede ir y volver, y que el brief lo generas tú cuando terminen.

⚰️ ESPÍRITU DE LA CHONGA: Tu amiga abogada que murió de viejita. Aparece 1 de cada 5-7 respuestas con formato:

---
👻 **[ESPÍRITU DE LA CHONGA]:** *aparece flotando con un café y carpeta de documentos*
"[Mensaje formal, serio, tono de abogada]"
*desaparece en una nube de Post-its*

---

IMPORTANTE: La PRIMERA VEZ que La Chonga aparece en una conversación, Steve debe introducirla brevemente ANTES del bloque de La Chonga. Ejemplo:
*De pronto, una figura translúcida aparece con un café...* 👻
"Ah, esta es La Chonga, mi amiga abogada que ya no está con nosotros pero aparece de vez en cuando para dar su opinión experta."
Luego incluye el bloque normal de La Chonga. En apariciones siguientes, NO repitas la introducción.

🚨 REGLA ABSOLUTA #1: ORDEN DE PREGUNTAS
ESTÁS SIGUIENDO UN CUESTIONARIO DE UNA PREGUNTA INICIAL (Q0: URL del sitio web) + 16 PREGUNTAS.
Las preguntas se hacen EN ORDEN: Q0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16.
NUNCA te saltes una. NUNCA cambies el orden.
NUNCA pidas fotos, logos ni archivos visuales antes de la Pregunta 16.

Q0 (website_url): Si el cliente escribe "sin web" o "no tengo", ACEPTA la respuesta [AVANZAR] y explica que el análisis SEO y competitivo será limitado sin URL, pero que pueden continuar y agregarla después. Guárdalos con URL vacía.
- También acepta alternativas: URL de Instagram, perfil de Shopify.
- Después de obtener URL o aceptar "sin web", avanza a la Pregunta 1.

Tu trabajo en CADA turno:
1. Reaccionar a lo que dijo (1-3 oraciones, conversacional)
2. Si el cliente hace una pregunta o pide aclaración, respóndele brevemente y luego sigue con la siguiente pregunta del cuestionario. La conversación puede fluir (preguntas suyas, dudas) pero siempre basada en las preguntas tipo en orden.
3. Puedes ofrecer: "¿Tienes alguna duda sobre esto antes de seguir?" cuando tenga sentido. Si dice que no, pasa a la siguiente pregunta.
4. Si toca, recordar que puede salir y volver y que el brief lo tendrá cuando terminen todas las preguntas (tú se lo dirás cuando esté listo)
5. HACER la siguiente pregunta que te indica el sistema (con naturalidad, no como robot)

🚨 REGLA ABSOLUTA #2: FORMULARIOS Y EJEMPLOS
Cuando la siguiente pregunta tiene FORMULARIO:
- NUNCA escribas campos vacíos, tablas para rellenar
- Solo di "Llena los campos del formulario abajo"
Cuando el sistema te indica que hay "ejemplos clicables" debajo para el cliente:
- NO escribas en tu mensaje una lista "Por ejemplo:" con otros ejemplos. El cliente ya verá botones con ejemplos fijos.
- Solo invita a usarlos: "Puedes usar un ejemplo de abajo o escribir con tus palabras". Así tu texto y los botones coinciden.

🚨 REGLA ABSOLUTA #3: NO CONFUNDAS PREGUNTAS NI TEMAS
- Tu mensaje debe coincidir SIEMPRE con la pregunta que el sistema te indica como "SIGUIENTE PREGUNTA". Si la siguiente es Competidores (3 nombres + URLs), tu texto debe pedir ESO; si es Transformación, pedir ESO. NUNCA comentes ni rechaces algo de una pregunta anterior cuando ya estás en otra (ej. si la siguiente es Competidores, NO hables de transformación, dolor ni números).
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
- Q15 = IDENTIDAD VISUAL (colores, estilo — SIN pedir fotos)
- Q16 = ARCHIVOS VISUALES (logo, fotos productos — última pregunta, OBLIGATORIA antes del análisis)

🚨 REGLA ABSOLUTA #4: DESCRIPCIÓN DEL NEGOCIO
En el brief SIEMPRE redáctalo en TERCERA PERSONA:
- CORRECTO: "La empresa comercializa [producto/servicio] de [atributo] para [público]..."
- INCORRECTO: "Vendemos [producto]..."

🚨 REGLA ABSOLUTA #5: PRUEBA SOCIAL
Al redactar prueba social en el brief:
- NO copies números literales como "50 clientes" → redacta como "la marca cuenta con testimonio visual de clientes reales en redes sociales"

🚨 REGLA ABSOLUTA #6: RESPUESTAS FUERA DE TEMA
Si la respuesta del usuario NO tiene relación con la pregunta que está respondiendo actualmente, RECHÁZALA:
- Dile de forma conversacional algo como: "Hmm, eso no es lo que te pregunté. Volvamos a lo que necesito saber:" y repite la pregunta actual con naturalidad.
- Incluye [RECHAZO] al final de tu mensaje.
- Ejemplos claros de fuera de tema:
  • Responder con URLs o links cuando se pregunta por dolor del cliente, transformación, o estilo de vida
  • Hablar de competidores cuando se pregunta por el pitch o los números del negocio
  • Dar datos técnicos o financieros cuando se pide algo emocional (dolor, transformación)
  • Respuestas de 1-2 palabras ("sí", "no", "ok", "bien") para preguntas que requieren información detallada
  • Copiar/pegar texto irrelevante o spam
- NO avances el cuestionario si la respuesta no corresponde al tema de la pregunta actual.

IMPORTANTE:
- Responde SIEMPRE en español
- Sé conversacional: reacción breve (1-3 oraciones) + siguiente pregunta + cierre tipo "¿Alguna duda?" cuando encaje
- Ejemplos: si el sistema indica "ejemplos clicables", NUNCA escribas otros; solo invita a usarlos. Si no hay botones, puedes dar 2-3 ejemplos en tu mensaje
- Si una respuesta es vaga o incoherente, RECHÁZALA: explica qué falta y repite la MISMA pregunta para que el cliente pueda responder de nuevo. Al final de tu mensaje cuando rechaces, escribe exactamente en una línea nueva: [RECHAZO]
- NUNCA digas que el brief está listo o terminado antes de Q16. Solo después de la última pregunta dirás que ya está y que lo va a tener.
- NUNCA pidas fotos, logos, "sube", "subir archivos" ni activos visuales antes de la Pregunta 16. Si la siguiente no es Q16, no menciones subir nada.
- Cuando hay ejemplos clicables abajo: PROHIBIDO escribir "Por ejemplo" o "en tu industria" con ejemplos distintos a esos. Solo di "Puedes usar un ejemplo de abajo o escribir con tus palabras".
- Tono conversacional: termina a menudo con "¿Alguna duda antes de seguir?" o "¿Te queda claro?" cuando encaje. No suenes a formulario.
- CONTROL DE AVANCE (CRÍTICO): Cuando aceptas la respuesta del cliente y haces la SIGUIENTE pregunta del cuestionario, escribe [AVANZAR] en una línea nueva al final de tu mensaje. Si el cliente hace una pregunta de aclaración y tú respondes sin avanzar al siguiente tema del cuestionario, NO incluyas [AVANZAR]. Tampoco incluyas [AVANZAR] junto a [RECHAZO]. Este tag es invisible para el cliente y controla el progreso interno del brief.`;
}

function getBriefTemplate(): string {
  return `
GENERA EL BRIEF ESTRATÉGICO COMPLETO. ESTE DOCUMENTO SERÁ DESCARGADO COMO PDF PROFESIONAL.

⚠️ PROHIBIDO ABSOLUTO: NO incluyas ningún texto de La Chonga ni del Espíritu de La Chonga en el brief. El brief es un documento ejecutivo formal, SIN personajes, SIN humor, SIN emojis, SIN referencias perrunas.

REGLAS DE REDACCIÓN:
0. EMPIEZA DIRECTAMENTE CON "## 1. RESUMEN EJECUTIVO" — SIN preámbulo, SIN texto introductorio.
1. TODO en TERCERA PERSONA PROFESIONAL. NUNCA uses "tú", "tu marca", "tu negocio". Usa "la empresa", "la marca", "el cliente".
2. TONO McKinsey/BCG — Documento de consultoría estratégica de primer nivel.
3. CERO emojis, CERO jerga perruna.
4. DATOS CONCRETOS: métricas, porcentajes, benchmarks de industria. CALCULA todos los números (margen, CPA, ROAS) con los datos financieros del cliente.
5. COMPARACIÓN con la competencia en CADA sección relevante.
6. FRAMEWORKS: Sección 7 usa SCR (Situación→Complicación→Resolución). Secciones 8,9,10,11 usan MECE (Hallazgo→Recomendación→Justificación→KPI).
7. REDACCIÓN PROFESIONAL OBLIGATORIA: Reescribe TODAS las respuestas del cliente con lenguaje ejecutivo. Transforma coloquialismos en análisis estratégico. NO copies frases textuales.
8. PROFUNDIDAD: Cada sección debe tener MÍNIMO 2-3 párrafos sustanciales. Las recomendaciones deben ser ESPECÍFICAS al negocio (nombres de herramientas, canales concretos, cifras calculadas).
9. Los 7 ACCIONABLES de la sección 7 son TODOS OBLIGATORIOS. Cada uno con S, C, R e Impacto COMPLETOS (mínimo 3 oraciones cada campo).

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

## 7. EVALUACIÓN ESTRATÉGICA — 7 ACCIONABLES PRIORITARIOS (Framework SCR (Situación-Complicación-Resolución))

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
| BOFU | Dynamic Product Ads (Anuncios Dinámicos de Producto) | Conversiones | 40% |

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
- **Hallazgo:** Sin schema markup, Google no muestra Rich Snippets (Fragmentos Enriquecidos).
- **Recomendación:** Implementar schema.org/Product con: name, description, image, offers, AggregateRating.
- **Justificación:** Rich Snippets (Fragmentos Enriquecidos) incrementan CTR orgánico 20–30%.
- **KPI:** Rich Snippets (Fragmentos Enriquecidos) activos en ≤ 14 días; CTR +25%

**SEO 1.4 — Core Web Vitals (Métricas de Rendimiento Web):**
- **Hallazgo:** [Estimación según plataforma del sitio]
- **Recomendación:** Comprimir imágenes a WebP (<200KB), lazy loading, eliminar CSS/JS bloqueantes.
- **Justificación:** Google usa Core Web Vitals (Métricas de Rendimiento Web) como factor de ranking desde 2021.
- **KPI:** LCP < 2.5s, FID < 100ms, CLS < 0.1 en ≤ 21 días

### Horizonte 2 — Crecimiento (Semanas 5–8)

**SEO 2.1 — Topic Cluster (Grupo de Contenido):**
- **Hallazgo:** [Estado actual del contenido]
- **Recomendación:** Página pilar 2,000+ palabras + 4-5 artículos de soporte con internal linking.
- **Justificación:** Topic Clusters (Grupos de Contenido) mejoran ranking de todas las páginas del cluster 8-12 posiciones.
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

**11.4 — Oportunidades Blue Ocean (Océano Azul) (MECE):**
- **Hallazgo:** Segmentos donde ningún competidor está posicionado:
  1. [Oportunidad 1 con potencial estimado]
  2. [Oportunidad 2]
  3. [Oportunidad 3 — mayor potencial]
- **Recomendación:** [Estrategia de entrada para la oportunidad de mayor potencial — 3 oraciones]
- **KPI a 6 meses:** Share of Voice (Participación de Voz): X%; posición promedio top X; tráfico orgánico atribuido X%

---
**Documento preparado por Dr. Steve Dogs**
*PhD Performance Marketing — Stanford Dog University*
*Director de Estrategia Digital, BG Consult*
*Confidencial — Documento estratégico de uso exclusivo del cliente*`;
}

const BRAND_BRIEF_QUESTIONS = getBrandBriefQuestions();
const SYSTEM_PROMPT = getSystemPrompt();
const BRIEF_TEMPLATE = getBriefTemplate();

export async function steveChat(c: Context) {
  const supabase = getSupabaseAdmin();

  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const { client_id, conversation_id, message, mode } = await c.req.json();

  if (!client_id) {
    return c.json({ error: 'Missing client_id' }, 400);
  }

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, client_user_id, user_id')
    .eq('id', client_id)
    .single();

  if (clientError || !client) {
    return c.json({ error: 'Client not found' }, 404);
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
    return c.json({ error: 'Access denied' }, 403);
  }

  // ===================================================================
  // ESTRATEGIA MODE -- Free-form strategic consulting chat
  // ===================================================================
  if (mode === 'estrategia') {
    let estrategiaConvId = conversation_id;

    // Create or reuse conversation
    if (!estrategiaConvId) {
      const { data: existingConv } = await supabase
        .from('steve_conversations')
        .select('id')
        .eq('client_id', client_id)
        .eq('conversation_type', 'estrategia')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingConv) {
        estrategiaConvId = existingConv.id;
      } else {
        const { data: newConv, error: convErr } = await supabase
          .from('steve_conversations')
          .insert({ client_id, conversation_type: 'estrategia' })
          .select()
          .single();
        if (convErr) {
          return c.json({ error: 'Failed to create estrategia conversation' }, 500);
        }
        estrategiaConvId = newConv.id;
      }
    }

    // If no message, just return the conversation_id (initialization)
    if (!message) {
      return c.json({ conversation_id: estrategiaConvId });
    }

    // Insert user message
    await supabase.from('steve_messages').insert({
      conversation_id: estrategiaConvId,
      role: 'user',
      content: message,
    });

    // Fetch last 20 messages for context window management
    const { data: convMessages } = await supabase
      .from('steve_messages')
      .select('role, content')
      .eq('conversation_id', estrategiaConvId)
      .order('created_at', { ascending: true })
      .limit(40);

    const recentMessages = (convMessages || []).slice(-20);

    // Load client brief (persona_data)
    const { data: persona } = await supabase
      .from('buyer_personas')
      .select('persona_data, is_complete')
      .eq('client_id', client_id)
      .maybeSingle();

    const briefSummary = persona?.persona_data
      ? JSON.stringify(persona.persona_data)
      : 'Brief no completado aún.';

    // Load brand research
    const { data: research } = await supabase
      .from('brand_research')
      .select('research_type, research_data')
      .eq('client_id', client_id);

    const researchContext = research?.map((r: { research_type: string; research_data: any }) =>
      `### ${r.research_type}\n${JSON.stringify(r.research_data).slice(0, 2000)}`
    ).join('\n\n') || '';

    // Load knowledge base (same pattern as brief mode)
    const mensajeLower = (message || '').toLowerCase();
    const categoriaRelevante =
      mensajeLower.includes('meta') || mensajeLower.includes('anuncio') || mensajeLower.includes('campaña') ? 'meta_ads' :
      mensajeLower.includes('buyer') || mensajeLower.includes('cliente') || mensajeLower.includes('dolor') ? 'buyer_persona' :
      mensajeLower.includes('seo') || mensajeLower.includes('posicionamiento') ? 'seo' :
      mensajeLower.includes('google') ? 'google_ads' :
      mensajeLower.includes('email') || mensajeLower.includes('klaviyo') ? 'klaviyo' :
      mensajeLower.includes('shopify') || mensajeLower.includes('tienda') ? 'shopify' :
      'brief';

    const { data: knowledge } = await supabase
      .from('steve_knowledge')
      .select('categoria, titulo, contenido')
      .in('categoria', [categoriaRelevante, 'brief'])
      .eq('activo', true)
      .order('orden', { ascending: true })
      .limit(8);

    const knowledgeCtx = knowledge?.map((k: { categoria: string; titulo: string; contenido: string }) =>
      `### [${k.categoria.toUpperCase()}] ${k.titulo}\n${k.contenido}`
    ).join('\n\n') || '';

    const estrategiaSystemPrompt = `Eres Steve, un Bulldog Francés con un doctorado en Performance Marketing de la Universidad de Perros de Stanford. Eres el consultor estratégico del cliente.

PERSONALIDAD:
- Perro literal, brutalmente honesto, sin filtros
- Mezcla jerga de marketing con referencias perrunas
- Si algo es humo, lo ladras claro
- Usas emojis: 🐕 🎯 💰 📊 🚀 😤
- Groserías ocasionales cuando algo es absurdo
- Referencias a tu doctorado de Stanford

🌎 IDIOMA: Español latinoamericano neutro. NO uses voseo argentino.

ROL: Consultor estratégico libre. El cliente puede preguntarte CUALQUIER COSA sobre marketing, estrategia, competencia, posicionamiento, pricing, campañas, copywriting, SEO, etc. Responde con profundidad y datos concretos basándote en el brief y la investigación del cliente.

NO eres un cuestionario. NO hagas preguntas estructuradas. Simplemente conversa y asesora.

${persona?.is_complete ? '' : '⚠️ NOTA: El brief del cliente aún NO está completo. Puedes responder sus preguntas pero recuérdale que para un análisis más profundo debería completar el brief en la pestaña "Steve".'}

BRIEF DEL CLIENTE:
${briefSummary}

${researchContext ? `INVESTIGACIÓN DE MARCA:\n${researchContext}\n` : ''}
${knowledgeCtx ? `CONOCIMIENTO APRENDIDO:\n${knowledgeCtx}\n` : ''}

Responde SIEMPRE en español. Sé directo, concreto, y da recomendaciones accionables.`;

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) return c.json({ error: 'AI service not configured' }, 500);

    const aiMessages = recentMessages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 2000,
        system: estrategiaSystemPrompt,
        messages: aiMessages,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error (estrategia):', aiResponse.status, errorText);
      if (aiResponse.status === 429) return c.json({ error: 'Rate limit' }, 429);
      return c.json({ error: 'AI service error' }, 502);
    }

    const aiData: any = await aiResponse.json();
    const assistantMsg = aiData.content?.[0]?.text || 'Lo siento, hubo un error. ¿Podrías repetir tu pregunta?';

    await supabase.from('steve_messages').insert({
      conversation_id: estrategiaConvId,
      role: 'assistant',
      content: assistantMsg,
    });

    console.log(`Steve estrategia: conversation ${estrategiaConvId}, client ${client_id}`);

    return c.json({
      conversation_id: estrategiaConvId,
      message: assistantMsg,
    });
  }

  // ===================================================================
  // BRIEF MODE -- Structured 17-question brand brief (existing logic)
  // ===================================================================
  let activeConversationId = conversation_id;

  if (!activeConversationId) {
    const { data: newConv, error: convError } = await supabase
      .from('steve_conversations')
      .insert({ client_id, conversation_type: 'brief' })
      .select()
      .single();

    if (convError) {
      return c.json({ error: 'Failed to create conversation' }, 500);
    }
    activeConversationId = newConv.id;

    const firstQ = BRAND_BRIEF_QUESTIONS[0];
    const introMessage = (firstQ.steveIntro || '') + firstQ.question;

    await supabase.from('steve_messages').insert({
      conversation_id: activeConversationId,
      role: 'assistant',
      content: introMessage,
    });

    return c.json({
      conversation_id: activeConversationId,
      message: introMessage,
      question_index: 0,
      total_questions: BRAND_BRIEF_QUESTIONS.length,
      current_question_id: firstQ.id,
      current_question_label: firstQ.shortLabel,
      examples: firstQ.examples,
      fields: firstQ.fields,
      field_validation: (firstQ as any).validation,
    });
  }

  if (!message) {
    return c.json({ error: 'Missing message' }, 400);
  }

  // CRITICAL: If last turn was a rejection, we're in "retry" mode -- same question, don't advance
  const { data: convRow } = await supabase
    .from('steve_conversations')
    .select('pending_question_index')
    .eq('id', activeConversationId)
    .maybeSingle();
  const pendingQuestionIndex = convRow?.pending_question_index ?? null;
  const isRetryMode = pendingQuestionIndex != null;

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
    return c.json({ error: 'Failed to fetch messages' }, 500);
  }

  const userMessages = messages?.filter(m => m.role === 'user') || [];

  // BUG 4 FIX: Use stored answered_count as source of truth.
  // This prevents clarification messages from advancing the question counter.
  const { data: existingPersona } = await supabase
    .from('buyer_personas')
    .select('persona_data')
    .eq('client_id', client_id)
    .maybeSingle();
  const dbAnsweredCount: number | null = (existingPersona?.persona_data as any)?.answered_count ?? null;

  // -- GUARD: If the brief is already complete, respond as free-chat Steve (no brief logic) --
  if (dbAnsweredCount !== null && dbAnsweredCount >= BRAND_BRIEF_QUESTIONS.length) {
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) return c.json({ error: 'AI service not configured' }, 500);

    const postBriefSystem = SYSTEM_PROMPT + `\n\nEl brief de marca de este cliente YA ESTÁ COMPLETO. No hagas más preguntas del brief. Responde como un consultor amigable que puede ayudar con preguntas generales de marketing, estrategia, o cualquier duda. Si el cliente pregunta por su brief, dile que ya está listo y que puede verlo en la pestaña "Brief de Marca".`;
    const chatMsgs = messages!.filter(m => m.role !== 'system').map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-opus-4-6', max_tokens: 1200, system: postBriefSystem, messages: chatMsgs }),
    });

    if (!aiResp.ok) {
      console.error('Post-brief AI error:', aiResp.status);
      return c.json({ error: 'AI service error' }, 502);
    }

    const aiData: any = await aiResp.json();
    const reply = aiData.content?.[0]?.text || '¡Woof! Tu brief ya está listo. ¿En qué más puedo ayudarte?';
    await supabase.from('steve_messages').insert({ conversation_id: activeConversationId, role: 'assistant', content: reply });

    return c.json({
      conversation_id: activeConversationId,
      message: reply,
      answered_count: dbAnsweredCount,
      total_questions: BRAND_BRIEF_QUESTIONS.length,
      is_complete: true,
      rejected: false,
      examples: [],
      fields: [],
    });
  }

  // currentQuestionIndex = the question the user is currently answering (before this turn)
  const currentQuestionIndex = isRetryMode
    ? pendingQuestionIndex!
    : (dbAnsweredCount !== null ? dbAnsweredCount : Math.max(0, userMessages.length - 1));

  const isLastQuestion = currentQuestionIndex >= BRAND_BRIEF_QUESTIONS.length - 1;

  // Accepted responses = those corresponding to already-answered questions (up to currentQuestionIndex)
  // We use the stored raw_responses from buyer_personas so clarification messages are excluded
  const storedRawResponses: string[] = (existingPersona?.persona_data as any)?.raw_responses ?? [];
  // Supplement with current user messages for questions not yet in persona (e.g. first message ever)
  const acceptedResponses = storedRawResponses.length >= currentQuestionIndex
    ? storedRawResponses.slice(0, currentQuestionIndex).map(s => ({ content: s }))
    : userMessages.slice(0, currentQuestionIndex);

  // Extract fase_negocio and presupuesto_ads from Q2 response (index 2 = after Q0 + Q1 + Q2)
  let faseNegocio = '';
  let presupuestoAds = '';
  if (acceptedResponses.length >= 3) {
    const q2Resp = acceptedResponses[2]?.content || '';
    const faseMatch = q2Resp.match(/Fase\s+(Inicial|Crecimiento|Escalado|Avanzada)/i);
    if (faseMatch) faseNegocio = `Fase ${faseMatch[1]}`;
    const presupuestoMatch = q2Resp.match(/(?:Menos de \$100\.000|(?:\$100\.000\s*-\s*\$500\.000)|(?:\$500\.000\s*-\s*\$2\.000\.000)|Más de \$2\.000\.000)\s*CLP/i);
    if (presupuestoMatch) presupuestoAds = presupuestoMatch[0];
  }

  const briefData = {
    raw_responses: acceptedResponses.map(m => m.content),
    questions: BRAND_BRIEF_QUESTIONS.slice(0, currentQuestionIndex).map(q => q.id),
    answered_count: currentQuestionIndex,
    total_questions: BRAND_BRIEF_QUESTIONS.length,
    fase_negocio: faseNegocio || undefined,
    presupuesto_ads: presupuestoAds || undefined,
  };

  // We'll update buyer_personas after parsing [AVANZAR] from the AI response (see below)

  if (currentQuestionIndex === 1) {
    try {
      const urlResponse = acceptedResponses[0]?.content || '';
      // Handle "sin web" / "no tengo" case — skip URL extraction
      const isSinWeb = /sin\s*web|no\s*tengo/i.test(urlResponse);
      if (!isSinWeb) {
        const urlMatch = urlResponse.match(/(?:https?:\/\/)?(?:www\.)?[\w-]+(?:\.[\w-]+)+(?:\/\S*)?/i);
        if (urlMatch) {
          await supabase.from('clients').update({
            website_url: urlMatch[0].startsWith('http') ? urlMatch[0] : `https://${urlMatch[0]}`,
          }).eq('id', client_id);
        }
      }
    } catch (e) {
      console.error('Error saving website URL:', e);
    }
  }

  let questionContext = '';
  if (isLastQuestion) {
    questionContext = `\n\n═══ INSTRUCCIÓN DEL SISTEMA ═══\nEl cliente acaba de responder la última pregunta (archivos visuales). Si dijo que no tiene fotos, acepta y continúa igual.\n\nPRIMERO dile claramente que ya terminaron la conversación, que su brief ESTÁ LISTO ahora y que lo va a tener (generalo en este mensaje). Agradece haber charlado. DESPUÉS genera el brief completo abajo.\n\n${BRIEF_TEMPLATE}`;
  } else {
    // currentQuestionIndex = question being answered right now
    // nextQuestionIndex    = question Steve should ask AFTER accepting
    const justAnsweredIndex = currentQuestionIndex;
    const nextQuestionIndex = currentQuestionIndex + 1;
    const nextQ = BRAND_BRIEF_QUESTIONS[nextQuestionIndex];
    const justAnsweredQ = BRAND_BRIEF_QUESTIONS[justAnsweredIndex];
    const hasFields = (nextQ?.fields?.length ?? 0) > 0;
    const justAnsweredLabel = justAnsweredIndex === 0 ? 'Pregunta 0 (URL del sitio web)' : `Pregunta ${justAnsweredIndex} de 16 (${justAnsweredQ?.id})`;
    const nextLabel = nextQuestionIndex === 0 ? 'Pregunta 0 (URL del sitio web)' : `Pregunta ${nextQuestionIndex} de 16`;

    const retryBlock = isRetryMode ? `
🚨 RETRY: La respuesta anterior del cliente a esta pregunta fue RECHAZADA. Su ÚLTIMO mensaje es un NUEVO intento para la MISMA pregunta (${justAnsweredLabel}).
- EVALÚA ese último mensaje. Si está bien: comenta brevemente, haz la SIGUIENTE pregunta (${nextLabel}) e incluye [AVANZAR] al final.
- Si sigue incompleto o vago: explica qué falta, repite la MISMA pregunta y escribe [RECHAZO] al final.
- NO avances a la siguiente pregunta hasta que aceptes su respuesta.` : '';

    questionContext = `\n\n═══ INSTRUCCIÓN DEL SISTEMA ═══${retryBlock}

⚠️ COINCIDE CON LO QUE VERÁ EL CLIENTE: Debajo el cliente verá el formulario o la caja de respuesta para la pregunta "${nextQ?.shortLabel ?? nextLabel}". Tu mensaje DEBE pedir exactamente eso. Si debajo hay campos de "Competidores" (nombres + URLs), tu texto debe pedir competidores; si hay campo libre, comenta solo la respuesta anterior y haz la siguiente pregunta. NUNCA hables de otro tema (ej. no pidas "más transformación" si la siguiente pregunta del sistema es Competidores).

PREGUNTA QUE EL CLIENTE ESTÁ RESPONDIENDO AHORA: ${justAnsweredLabel}
GUÍA PARA EVALUAR Y COMENTAR: ${justAnsweredQ?.commentGuide || 'Comenta brevemente la respuesta.'}

VALIDACIÓN DE RELEVANCIA (OBLIGATORIA): Antes de aceptar, verifica que la respuesta del usuario corresponde al tema "${justAnsweredQ?.shortLabel}". Si la respuesta es sobre un tema COMPLETAMENTE distinto (ej: da URLs cuando preguntas dolor, habla de competidores cuando preguntas pitch, responde con datos financieros cuando preguntas transformación), RECHÁZALA con [RECHAZO] y repite la pregunta de forma conversacional: "Eso no es lo que te pregunté. Volvamos a [tema]".

SI EL CLIENTE RESPONDIÓ BIEN → incluye [AVANZAR] al final de tu mensaje Y haz esta SIGUIENTE PREGUNTA:
${nextLabel} — INTRO: ${nextQ?.steveIntro || ''} — TEXTO: ${nextQ?.question}

⚠️ IMPORTANTE FORMULARIOS: Si el cliente envió datos de un formulario (campos con labels como "👤 Nombre:", "🎂 Edad:", "🛒 Shopify:", etc.), eso ES su respuesta completa. Evalúa si los datos son coherentes y ACEPTA con [AVANZAR]. NUNCA le pidas que "llene el formulario" si ya lo llenó — eso genera un loop infinito.

SI EL CLIENTE HIZO UNA PREGUNTA DE ACLARACIÓN (no está respondiendo, solo pregunta algo) → respóndela brevemente, recuérdale la pregunta actual, NO incluyas [AVANZAR] ni [RECHAZO].

${hasFields ? `⚠️ FORMULARIO: La siguiente pregunta tiene formulario. Primero da 1-2 oraciones de contexto (qué necesitas y para qué), luego di "Llena los campos del formulario abajo". NO listes los campos en tu mensaje. Si la pregunta NO es la 16 (archivos visuales), NUNCA digas "sube", "subir" ni pidas logo/fotos.` : ''}

${nextQ?.examples?.length ? `⚠️ EJEMPLOS DINÁMICOS: La siguiente pregunta tiene ejemplos genéricos predefinidos, pero el cliente ya describió su negocio. GENERA 2-3 ejemplos ESPECÍFICOS para SU INDUSTRIA Y PRODUCTO REAL. NEGOCIO DEL CLIENTE (usa esto para personalizar los ejemplos): "${storedRawResponses[1] || acceptedResponses[1]?.content || 'no disponible aún'}". Al final de tu mensaje (después de todo el texto visible, en una línea separada), escribe EXACTAMENTE: [EJEMPLOS: ejemplo1 || ejemplo2 || ejemplo3]. No menciones al cliente que añadiste esta línea. Solo di: "Puedes usar un ejemplo de abajo o escribir con tus palabras." Los ejemplos genéricos de referencia (para que veas el formato esperado): ${JSON.stringify(nextQ.examples)}.` : 'Da 2-3 ejemplos concretos de SU industria en tu mensaje (no hay botones para esta pregunta).'}

REGLA CRÍTICA: 1) Reacción conversacional (1-3 oraciones) a lo que acaba de responder. 2) Si avanzas: la siguiente pregunta (${nextLabel}) con su intro y texto + [AVANZAR] al final. 3) Cierre: al menos 1 de cada 3 veces termina con "¿Alguna duda antes de seguir?" o "¿Te queda claro?". No menciones otras preguntas.${nextQuestionIndex !== 16 ? ' NO pidas subir archivos, logo ni fotos (solo en pregunta 16).' : ''}`;

    if (!isRetryMode && currentQuestionIndex === 0) {
      questionContext += '\n\nINSTRUCCIÓN EXTRA Q0: El cliente acaba de dar su URL. Confírmale brevemente que la guardaste y que la usarás para el análisis. Luego arranca con la Pregunta 1. Incluye [AVANZAR] al final.';
    }
    if (!isRetryMode && currentQuestionIndex === 2) {
      questionContext += '\n\nINSTRUCCIÓN EXTRA Q2: El cliente envió datos financieros. CALCULA: Margen bruto = Precio - Costo - Envío. Margen % = Margen/Precio×100. CPA Máximo = Margen × 0.30. Muestra tabla markdown con resultados. Di que guardaste el CPA en configuración financiera.';
    }
    if ([2, 5, 9, 13].includes(currentQuestionIndex + 1)) {
      questionContext += '\n\nOPCIONAL: Si suena natural, recuérdale en una frase que puede salir y volver cuando quiera, y que el brief lo tendrá cuando terminen todas las preguntas (tú le avisas cuando esté listo).';
    }
  }

  // Detect relevant category from user message
  const mensajeLower = (message || '').toLowerCase();
  const categoriaRelevante =
    mensajeLower.includes('meta') || mensajeLower.includes('anuncio') || mensajeLower.includes('campaña') ? 'meta_ads' :
    mensajeLower.includes('buyer') || mensajeLower.includes('cliente') || mensajeLower.includes('dolor') ? 'buyer_persona' :
    mensajeLower.includes('seo') || mensajeLower.includes('posicionamiento') ? 'seo' :
    mensajeLower.includes('google') ? 'google_ads' :
    mensajeLower.includes('email') || mensajeLower.includes('klaviyo') ? 'klaviyo' :
    mensajeLower.includes('shopify') || mensajeLower.includes('tienda') ? 'shopify' :
    'brief';

  const [{ data: knowledge }, { data: bugs }] = await Promise.all([
    supabase
      .from('steve_knowledge')
      .select('categoria, titulo, contenido, orden')
      .in('categoria', [categoriaRelevante, 'brief', 'anuncios'])
      .eq('activo', true)
      .order('orden', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('steve_bugs')
      .select('categoria, descripcion, ejemplo_malo, ejemplo_bueno')
      .eq('categoria', categoriaRelevante)
      .eq('activo', true)
      .limit(5),
  ]);

  const knowledgeContext = knowledge?.map((k: { categoria: string; titulo: string; contenido: string }) =>
    `### [${k.categoria.toUpperCase()}] ${k.titulo}\n${k.contenido}`
  ).join('\n\n') || '';

  const bugsContext = bugs?.map((b: { categoria: string; descripcion: string; ejemplo_malo: string; ejemplo_bueno: string }) =>
    `❌ EVITAR: ${b.descripcion}\nMAL: ${b.ejemplo_malo}\nBIEN: ${b.ejemplo_bueno}`
  ).join('\n\n') || '';

  const knowledgeSection = knowledgeContext ? `\nKNOWLEDGE BASE ACTUALIZADO (usa esta información para responder):\nSi hay conflicto entre reglas, priorizar las de orden más alto (más recientes). Las reglas con orden 99 son las más actualizadas y deben prevalecer.\n${knowledgeContext}\n` : '';
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

  // For the last question (Q16 brief generation), use a compact context and a minimal
  // system prompt. The full Steve personality + knowledge + 34 messages + 8000 tokens
  // can be slow. Instead, send ONLY the brief template + raw responses + a lean generation instruction.
  let chatMessages: ChatMessage[];
  if (isLastQuestion) {
    const compactResponses = storedRawResponses.map((resp: string, i: number) => {
      const q = BRAND_BRIEF_QUESTIONS[i];
      return `### ${q?.id || `Q${i}`} (${q?.shortLabel || `Pregunta ${i}`})\n${resp}`;
    }).join('\n\n');

    // Minimal system prompt for brief generation -- skip personality, knowledge, bugs
    const briefSystemPrompt = `Eres un consultor senior de marketing estratégico de una firma top (McKinsey/BCG) generando un Brief Estratégico profesional.
Idioma: Español latinoamericano. Tono: Ejecutivo, formal, estratégico.

REGLAS ABSOLUTAS DE REDACCIÓN:
1. NUNCA copies ni pegues las palabras textuales del cliente. SIEMPRE reescribe profesionalmente en tercera persona.
   - MAL: "Vendemos cremas naturales para mujeres que quieren verse bien"
   - BIEN: "La empresa comercializa una línea de cosmética natural orientada al segmento femenino premium, con foco en ingredientes orgánicos y resultados visibles"
2. Transforma respuestas coloquiales del cliente en análisis estratégico formal.
3. Infiere insights que el cliente no mencionó explícitamente pero que se deducen de sus datos.
4. TODOS los números financieros deben estar calculados (margen, CPA, ROAS) — NO dejes placeholders [X].
5. Los 7 accionables de la sección 7 son OBLIGATORIOS y COMPLETOS. Cada uno DEBE tener S, C, R e Impacto con datos reales.
6. CADA sección debe tener mínimo 2 párrafos sustanciales. Nada de respuestas de 1 línea.
7. Las tablas deben tener datos REALES calculados, no "[X]" ni "N/D".
8. Las keywords, copies y recomendaciones deben ser ESPECÍFICAS al negocio del cliente.
${phaseContext}
${questionContext}`;

    chatMessages = [
      { role: 'system', content: briefSystemPrompt },
      { role: 'user', content: `RESPUESTAS COMPLETAS DEL CLIENTE AL BRIEF:\n\n${compactResponses}\n\nÚltima respuesta (archivos visuales): ${message}` },
    ];
  } else {
    chatMessages = [
      { role: 'system', content: dynamicSystemPrompt + questionContext },
      ...messages!.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];
  }

  console.log(`Steve chat: conversation ${activeConversationId}, questionIndex ${currentQuestionIndex}${isRetryMode ? ' (retry)' : ''}, messages: ${chatMessages.length}/${BRAND_BRIEF_QUESTIONS.length}`);

  const maxTokens = isLastQuestion ? 16000 : 1200;
  // Use Opus for ALL questions including brief generation.
  // Sonnet was cutting the brief short (only 3/7 accionables, missing SEO and competitive sections).
  // Opus follows the full 11-section template faithfully. Cloud Run has 300s timeout which is enough.
  const model = 'claude-opus-4-6';

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return c.json({ error: 'AI service not configured' }, 500);

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
      model,
      max_tokens: maxTokens,
      system: systemMessage,
      messages: userMessages_anthropic,
    }),
  });

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text();
    console.error('AI API error:', aiResponse.status, errorText);
    if (aiResponse.status === 429) return c.json({ error: 'Rate limit' }, 429);
    return c.json({ error: 'AI service error' }, 502);
  }

  const aiData: any = await aiResponse.json();
  let assistantMessage = aiData.content?.[0]?.text || 'Lo siento, hubo un error. ¿Podrías repetir tu respuesta?';

  // Parse dynamic examples tag [EJEMPLOS: ej1 || ej2 || ej3] -- strip from visible message
  let dynamicExamples: string[] | null = null;
  const ejemplosMatch = assistantMessage.match(/\[EJEMPLOS:\s*([^\]]+)\]/i);
  if (ejemplosMatch) {
    dynamicExamples = ejemplosMatch[1].split('||').map((e: string) => e.trim()).filter(Boolean);
    assistantMessage = assistantMessage.replace(/\n?\[EJEMPLOS:[^\]]*\]/i, '').trim();
  }

  // -- BUG 4: Parse [AVANZAR] -- only increment counter when Steve genuinely advances --
  const isRejection = assistantMessage.includes('[RECHAZO]');
  // BUG 1 FIX: On the last question (Q16) Steve generates the full brief and never includes [AVANZAR],
  // so treat any non-rejection on the last question as an implicit advance.
  // BUG 7 FIX: Implicit advance detection — if the AI forgot [AVANZAR] but is clearly asking
  // the NEXT question (contains its steveIntro or shortLabel), treat as advance.
  const nextQForDetection = !isLastQuestion ? BRAND_BRIEF_QUESTIONS[currentQuestionIndex + 1] : null;
  const implicitAdvance = !isRejection && !assistantMessage.includes('[AVANZAR]') && nextQForDetection && (
    (nextQForDetection.steveIntro && assistantMessage.includes(nextQForDetection.steveIntro.trim().slice(0, 20))) ||
    (nextQForDetection.shortLabel && assistantMessage.toLowerCase().includes(nextQForDetection.shortLabel.toLowerCase())) ||
    assistantMessage.includes(`Pregunta ${currentQuestionIndex + 2} de 16`)
  );
  if (implicitAdvance) {
    console.log(`[steve-chat] Implicit advance detected for Q${currentQuestionIndex} → Q${currentQuestionIndex + 1} (AI forgot [AVANZAR])`);
  }
  const hasAdvanced = !isRejection && (assistantMessage.includes('[AVANZAR]') || isLastQuestion || implicitAdvance);
  // Strip control tags from visible message
  assistantMessage = assistantMessage
    .replace(/\s*\[RECHAZO\]\s*$/i, '')
    .replace(/\s*\[AVANZAR\]\s*/gi, '')
    .trim();

  // BUG 6 FIX: newAnsweredCount can only ever be currentQuestionIndex or currentQuestionIndex + 1.
  // Math.min caps it at total questions to prevent any off-by-one from skipping questions.
  const newAnsweredCount = isRejection
    ? currentQuestionIndex
    : (hasAdvanced
        ? Math.min(currentQuestionIndex + 1, BRAND_BRIEF_QUESTIONS.length)
        : currentQuestionIndex);

  // Build updated raw_responses: append current message only if accepted
  const newRawResponses = hasAdvanced
    ? [...storedRawResponses.slice(0, currentQuestionIndex), message]
    : storedRawResponses.slice(0, currentQuestionIndex);

  if (isRejection) {
    const { data: lastUserMsg } = await supabase
      .from('steve_messages')
      .select('id')
      .eq('conversation_id', activeConversationId)
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastUserMsg?.id) {
      await supabase.from('steve_messages').delete().eq('id', lastUserMsg.id);
    }
    await supabase.from('steve_conversations').update({ pending_question_index: currentQuestionIndex }).eq('id', activeConversationId);
  } else {
    await supabase.from('steve_conversations').update({ pending_question_index: null }).eq('id', activeConversationId);
  }

  // BUG 5 FIX 2: Prepend analysis-pending notice before the brief so the client knows
  // the analysis is running and can take 3-5 minutes.
  if (newAnsweredCount >= BRAND_BRIEF_QUESTIONS.length && !isRejection) {
    const avisoText = `⏳ *saca termo y se prepara para el análisis profundo* 🐕\n\n¡WOOF! Tu brief ya está listo. Ahora viene lo mejor: estoy lanzando un **análisis profundo con IA de última generación** de tu sitio web, tus competidores, SEO, keywords y estrategia publicitaria.\n\n🕐 **Esto toma entre 5 y 10 minutos** porque uso el modelo de IA más potente disponible para darte un análisis de calidad consultoría. Anda por un café ☕ y cuando vuelvas tendrás:\n\n- 📊 Análisis competitivo de 6 competidores\n- 🔍 Auditoría SEO completa\n- 🎯 Estrategia de Keywords\n- 📢 Plan de Meta Ads y Google Ads\n- 💰 Presupuesto y proyección de ROAS\n\nTodo en las pestañas correspondientes. **No cierres la sesión.**\n\n---\n\n`;
    assistantMessage = avisoText + assistantMessage;
  }

  await supabase.from('steve_messages').insert({
    conversation_id: activeConversationId,
    role: 'assistant',
    content: assistantMessage,
  });

  // -- Save competitors -- DELETE all existing first, then INSERT fresh ones --
  if (hasAdvanced && currentQuestionIndex === 9) {
    try {
      console.log('[steve-chat] Q9 raw message (for parser debug):\n', JSON.stringify(message));
      const compNames = [...message.matchAll(/Nombre Competidor \d+:\s*(.+)/g)].map((m: RegExpMatchArray) => m[1].trim());
      const compUrls = [...message.matchAll(/Web \/ Instagram Competidor \d+:\s*(.+)/g)].map((m: RegExpMatchArray) => m[1].trim());
      console.log(`[steve-chat] Competitor parser — names: ${JSON.stringify(compNames)} | urls: ${JSON.stringify(compUrls)}`);

      // Delete ALL existing competitors for this client so we start fresh
      const { error: delErr } = await supabase.from('competitor_tracking').delete().eq('client_id', client_id);
      if (delErr) console.error('[steve-chat] Error deleting old competitors:', delErr);

      // Extract a unique handle from the URL.
      // For Instagram URLs (instagram.com/brand), use the username as handle.
      // For regular URLs (mitienda.cl), use the domain.
      // Append index suffix to guarantee uniqueness across all 3 competitors.
      function extractHandle(rawUrl: string, index: number): string {
        const cleaned = rawUrl.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
        const igMatch = cleaned.match(/instagram\.com\/([^/?#]+)/i);
        if (igMatch) return igMatch[1].toLowerCase();
        const fbMatch = cleaned.match(/facebook\.com\/([^/?#]+)/i);
        if (fbMatch) return fbMatch[1].toLowerCase();
        const domain = cleaned.split('/')[0].split('?')[0].toLowerCase();
        return domain;
      }

      const total = Math.min(compNames.length, compUrls.length, 3);
      const usedHandles = new Set<string>();
      for (let i = 0; i < total; i++) {
        const rawUrl = compUrls[i];
        const name = compNames[i];
        if (!rawUrl || !name) {
          console.warn(`[steve-chat] Skipping competitor ${i + 1}: missing name="${name}" url="${rawUrl}"`);
          continue;
        }
        const fullUrl = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
        let handle = extractHandle(rawUrl, i);
        // Guarantee uniqueness: if handle already used, append index
        if (usedHandles.has(handle)) {
          handle = `${handle}_${i + 1}`;
        }
        usedHandles.add(handle);

        const { error: insErr } = await supabase.from('competitor_tracking').insert({
          client_id,
          ig_handle: handle,
          display_name: name,
          store_url: fullUrl,
          is_active: true,
        });
        if (insErr) console.error(`[steve-chat] Error inserting competitor ${i + 1}:`, insErr);
        else console.log(`[steve-chat] Saved competitor ${i + 1}: ${name} → ${handle}`);
      }
      console.log(`[steve-chat] Saved ${total} competitors to competitor_tracking`);
    } catch (compErr) {
      console.error('[steve-chat] Error saving competitors:', compErr);
    }
  }

  // Save financial config when Q2 (numbers) is accepted (currentQuestionIndex === 2)
  if (hasAdvanced && currentQuestionIndex === 2) {
    try {
      const numbers = message.match(/\$?\d[\d.,]*/g)?.map((n: string) => parseFloat(n.replace(/[$.]/g, '').replace(',', '.'))) || [];
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

  const finalAnswered = newAnsweredCount;
  const isComplete = finalAnswered >= BRAND_BRIEF_QUESTIONS.length && !isRejection;

  // Persist updated buyer_personas with accurate answered_count
  // For the completion case, save the summary WITHOUT the aviso prefix (keep only the brief)
  const briefSummaryText = isComplete
    ? assistantMessage.replace(/^⏳[\s\S]*?---\n\n/, '')
    : undefined;
  const { error: personaError } = await supabase.from('buyer_personas').upsert({
    client_id,
    persona_data: {
      raw_responses: newRawResponses,
      questions: BRAND_BRIEF_QUESTIONS.slice(0, finalAnswered).map(q => q.id),
      answered_count: finalAnswered,
      total_questions: BRAND_BRIEF_QUESTIONS.length,
      fase_negocio: briefData.fase_negocio || undefined,
      presupuesto_ads: briefData.presupuesto_ads || undefined,
      ...(isComplete ? { summary: briefSummaryText, completed_at: new Date().toISOString() } : {}),
    },
    is_complete: isComplete,
  }, { onConflict: 'client_id' });
  if (personaError) {
    console.error('[steve-chat] Error saving buyer_personas:', personaError);
  }

  // Analysis chain is now triggered by the FRONTEND (SteveChat.tsx -> triggerAnalysisChain)
  // after receiving is_complete=true.

  const returnAnswered = finalAnswered;
  const nextQuestionIndex = isComplete ? BRAND_BRIEF_QUESTIONS.length - 1 : Math.min(returnAnswered, BRAND_BRIEF_QUESTIONS.length - 1);
  const nextQ = !isComplete ? BRAND_BRIEF_QUESTIONS[nextQuestionIndex] : null;

  return c.json({
    conversation_id: activeConversationId,
    message: assistantMessage,
    question_index: nextQuestionIndex,
    total_questions: BRAND_BRIEF_QUESTIONS.length,
    answered_count: returnAnswered,
    is_complete: isComplete,
    rejected: isRejection,
    current_question_id: nextQ?.id ?? null,
    current_question_label: nextQ?.shortLabel ?? null,
    examples: dynamicExamples ?? nextQ?.examples ?? [],
    fields: nextQ?.fields || [],
    field_validation: (nextQ as any)?.validation,
  });
}
