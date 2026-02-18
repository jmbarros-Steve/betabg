import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 15 questions with optional structured fields for UI rendering
const BRAND_BRIEF_QUESTIONS = [
  {
    id: 'business_pitch',
    question: '**Pregunta 1 de 15 — TU NEGOCIO:** ¿A qué se dedica tu empresa y qué vendes exactamente? Dame el pitch de 30 segundos.\n\n🌐 **También necesito tu página web o tienda online.** Si no tienes, dímelo, pero NO te voy a dejar pasar sin que me cuentes más sobre tu presencia digital.',
    examples: ['Vendemos ropa deportiva premium para mujeres — www.mitienda.cl', 'Somos una agencia de diseño web para pymes, aún no tenemos web propia', 'Tenemos una tienda de cosmética natural en Shopify — mitienda.myshopify.com'],
    fields: [],
    steveIntro: '*sacude las orejas y se sienta profesionalmente* 🐕\n\n¡WOOF! Soy Steve, Bulldog Francés con doctorado en Performance Marketing de Stanford.\n\nVamos a armar tu **Brief Estratégico en 15 preguntas** (ni una más, ni una menos). Al final vas a tener un documento que vale ORO.\n\n',
    commentGuide: 'Si NO dio su URL, RECHAZA la respuesta e insiste en la web. Si no tiene, pídele que describa más su producto y presencia digital. NO pases a la pregunta 2 sin URL o sin explicación válida.',
  },
  {
    id: 'numbers',
    question: '**Pregunta 2 de 15 — LOS NÚMEROS:**\n\nNecesito la carne de tu negocio. **Llena los campos del formulario que aparece abajo** y yo calculo tu **Margen Bruto** y tu **CPA Máximo Viable** (lo máximo que puedes pagar para conseguir un cliente sin perder plata). 💰',
    examples: [],
    fields: [
      { key: 'price', label: '💰 Precio promedio de venta', type: 'number', prefix: '$', placeholder: 'Ej: 35.000' },
      { key: 'cost', label: '📦 Costo del producto/servicio', type: 'number', prefix: '$', placeholder: 'Ej: 12.000' },
      { key: 'shipping', label: '🚚 Costo de envío promedio', type: 'number', prefix: '$', placeholder: 'Ej: 4.000 (0 si es gratis)' },
      { key: 'ads_budget', label: '📣 Gasto mensual en publicidad', type: 'number', prefix: '$', placeholder: 'Ej: 200.000 (0 si no inviertes aún)' },
      { key: 'monthly_sales', label: '📊 Ventas mensuales aprox.', type: 'number', suffix: 'unidades', placeholder: 'Ej: 30' },
    ],
    steveIntro: '*saca calculadora imaginaria* 🧮\n\n',
    commentGuide: 'CALCULA: Margen bruto = Precio - Costo - Envío. Margen % = Margen/Precio×100. CPA Máximo = Margen × 0.30. Muestra tabla con resultados. Explica qué es el CPA. Di que guardaste el CPA en configuración financiera.',
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
    question: '**Pregunta 5 de 15 — SU DOLOR:** ¿Qué problema le quita el sueño a tu cliente ideal? ¿Qué le avergüenza de su situación actual con respecto a lo que TÚ vendes?',
    examples: ['No encuentra pijamas que le queden bien y que no se desarmen en 2 lavados', 'Le da vergüenza abrir la puerta al delivery con la ropa rota que usa en casa', 'Siente que gasta plata en ropa interior que se ve vieja al mes'],
    fields: [],
    steveIntro: '*pone cara seria* 😰\n\n',
    commentGuide: 'Analiza si el dolor es REAL y específico. Si es genérico, recházalo y pide algo más profundo con ejemplos de SU industria.',
  },
  {
    id: 'persona_words',
    question: '**Pregunta 6 de 15 — SUS PALABRAS Y OBJECIONES:** ¿Qué dice EXACTAMENTE tu cliente cuando se queja con un amigo sobre este problema? ¿Cuál es su excusa para NO comprarte? Quiero las FRASES LITERALES.',
    examples: ['"Estoy chata de comprar cosas baratas que se rompen, pero $40.000 por un pijama es mucho"', '"Me da lata gastar en ropa de casa, total nadie me ve"', '"Siempre me pasa que me gusta algo online y cuando llega no es lo mismo"'],
    fields: [],
    steveIntro: '*saca su libreta* 📝\n\n',
    commentGuide: 'Analiza si las frases suenan REALES y textuales. Si son genéricas o suenan a "lenguaje de marketing", recházalas. Necesitas frases que un HUMANO REAL diría.',
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
    commentGuide: 'Analiza si el estilo de vida es coherente con el buyer persona y el ticket promedio. Comenta implicaciones para la estrategia de medios.',
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
    question: '**Pregunta 14 de 15 — PRUEBA SOCIAL Y TONO:** ¿Qué prueba tienes de que tu producto funciona? (testimonios, reviews, fotos de clientes, antes/después, números de ventas)\n\n¿Y qué TONO de comunicación conecta con tu cliente? (informal, sofisticado, gracioso, técnico, emocional...)',
    examples: [
      'Tenemos 200 reviews en Google con promedio 4.8 — Tono cercano y gracioso, como hablar con tu mejor amiga',
      '5.000 clientes recurrentes, 40% recompra — Tono sofisticado pero accesible',
      'Fotos de 50 clientas usando nuestros pijamas en stories — Tono fresco y juvenil, con memes',
    ],
    fields: [],
    steveIntro: '*olfatea buscando evidencia* 📸\n\n',
    commentGuide: 'Evalúa si la prueba social es fuerte o débil. Sugiere cómo amplificarla. Comenta si el tono elegido es coherente con el buyer persona.',
  },
  {
    id: 'brand_assets',
    question: '**Pregunta 15 de 15 — LOGO, FOTOS E IDENTIDAD VISUAL:**\n\n¡Última pregunta! Necesito ver tu marca EN ACCIÓN.\n\n📤 **Sube tu logo y fotos de productos en los botones que aparecen AQUÍ ABAJO en el chat** (NO necesitas ir a otra pestaña).\n\nLuego cuéntame aquí:\n- 🎨 **¿Cuáles son tus colores de marca?** (hex, RGB o nombre)\n- 🖼 **¿Cuál es el estilo visual** que quieres proyectar?\n\n⚠️ **SIN LOGO Y SIN FOTOS NO PUEDO COMPLETAR UN BRIEF PROFESIONAL.**',
    examples: [
      'Mis colores son azul marino (#1a237e) y dorado, estilo elegante y minimalista — ya subí logo y fotos abajo',
      'Verde y blanco, estilo natural y orgánico — subo el logo ahora mismo',
      'Negro y rosa, estilo moderno y juvenil',
    ],
    fields: [],
    steveIntro: '*saca la cámara y ladra* 📸🐕\n\n',
    commentGuide: 'Verifica que hayan subido assets (el sistema muestra botones de upload inline). Comenta los colores y estilo visual. Genera el BRIEF COMPLETO.',
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

ESTÁS SIGUIENDO UN CUESTIONARIO ESTRICTO DE EXACTAMENTE 15 PREGUNTAS.
Las preguntas se hacen EN ORDEN: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15.
NUNCA te saltes una. NUNCA cambies el orden. NUNCA preguntes algo que no corresponde.

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

- Q5 = DOLOR del cliente (problemas, frustraciones)
- Q6 = PALABRAS LITERALES del cliente (frases textuales, objeciones de compra)
- Q7 = TRANSFORMACIÓN (vida después de comprarte)
- Q8 = ESTILO DE VIDA (marcas que consume, dónde pasa tiempo, influencers)
- Q9 = COMPETIDORES (nombres + URLs) — formulario
- Q10 = ANÁLISIS de competidores (promesas incumplidas) — formulario
- Q11 = VENTAJA INCOPIABLE (qué no pueden copiar)
- Q12 = VACA PÚRPURA / GRAN PROMESA (diferenciación, NO logos)
- Q13 = VILLANO + GARANTÍA
- Q14 = PRUEBA SOCIAL + TONO
- Q15 = LOGO, FOTOS, COLORES — pide que suban archivos en pestaña Assets

NUNCA pidas logos en Q12. NUNCA pidas competidores en Q7. NUNCA confundas categorías.

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

═══════════════════════════════════════
REGLAS DE REDACCIÓN ABSOLUTAS:
═══════════════════════════════════════

0. EMPIEZA DIRECTAMENTE CON "## 1. RESUMEN EJECUTIVO" — SIN preámbulo, SIN texto introductorio, SIN "¡Listo!" ni emojis. El documento comienza en la primera línea con el header del resumen ejecutivo.

1. TODO en TERCERA PERSONA PROFESIONAL:
   - CORRECTO: "La marca se posiciona como...", "El consumidor objetivo presenta...", "Se recomienda implementar..."
   - INCORRECTO: "Vendemos...", "Tu cliente...", "Yo creo que..."

2. TONO McKinsey/BCG — Documento de consultoría estratégica:
   - Usa bullet points concisos para listar hallazgos clave, seguidos de 1-2 párrafos de conclusión por sección
   - Prioriza CONCLUSIONES sobre datos — el lector quiere saber QUÉ SIGNIFICA, no repetir lo que dijo
   - NO copies lo que dijo el cliente. ANALIZA, CONTEXTUALIZA y SINTETIZA como un consultor senior.
   - Sé CONCISO: menos texto, más estructura. Bullet points > párrafos largos.

3. CERO emojis, CERO jerga perruna, CERO informalidad. El brief es un documento EJECUTIVO.

4. DATOS CONCRETOS: Incluye métricas, porcentajes, benchmarks de industria cuando sea posible.

5. COMPARACIÓN con la competencia en CADA sección relevante.

6. El resumen ejecutivo DEBE ser completo (mínimo 4 párrafos), NO se corta a la mitad.

7. El plan de 90 días DEBE tener acciones CONCRETAS y MEDIBLES, NO generalidades.

FORMATO OBLIGATORIO (usa headers markdown ## para cada sección):

## 1. RESUMEN EJECUTIVO
- **Diagnóstico:** [1 bullet con la situación actual del negocio]
- **Oportunidad:** [1 bullet con la oportunidad de mercado identificada]
- **Viabilidad:** [1 bullet sobre viabilidad financiera — conclusión, no datos]
- **Recomendación principal:** [1 bullet con la acción estratégica #1]

[1-2 párrafos de conclusión ejecutiva que integre todo lo anterior. Formal, concluyente, sin repetir datos crudos.]

## 2. ADN DE MARCA
- **Sector y vertical:** [análisis del sector y posicionamiento]
- **Producto principal y propuesta de valor:** [redactada en tercera persona profesional, ej: "La marca comercializa pijamas de algodón 100% con certificación de calidad XYZ, posicionándose en el segmento premium del mercado de ropa de dormir."]
- **Rango de precios y posicionamiento competitivo:** [análisis vs. competencia]
- **Presencia digital y distribución:** [evaluación profesional]

## 3. ANÁLISIS FINANCIERO
| Indicador | Valor |
|---|---|
| Ticket promedio | $X |
| Costo unitario | $X |
| Costo de envío | $X |
| Margen bruto unitario | $X (Y%) |
| CPA máximo viable | $X |

**Conclusión financiera:** [2 párrafos con CONCLUSIONES — NO repitas los datos. Analiza si el margen soporta inversión en marketing digital, compara el CPA con benchmarks de la industria (ej: CPA promedio en e-commerce de moda es $X), y da una recomendación clara de inversión óptima. Sé formal y concluyente.]

## 4. PERFIL DEL CONSUMIDOR OBJETIVO
- **Demográfico:** [edad, género, ubicación, ingreso con formato $X.XXX.XXX con separador de miles]
- **Psicográfico:** [valores, aspiraciones, estilo de vida — en 1-2 líneas]
- **Motivación de compra:** [por qué compra, qué busca resolver]
- **Barreras:** [objeciones principales y cómo superarlas]

**Conclusión del perfil:** [1 párrafo formal que sintetice quién es el consumidor y qué implica para la estrategia de comunicación.]

## 5. ANÁLISIS COMPETITIVO ESTRATÉGICO
[Para CADA competidor mencionado, redactar un análisis en prosa:
- Posicionamiento actual en el mercado
- Promesas de marca identificadas y brechas de cumplimiento
- Ventajas y debilidades observadas
- Diferenciación específica del cliente frente a este competidor

Cerrar con: Huecos de mercado identificados y ventaja competitiva sostenible del cliente.]

## 6. ESTRATEGIA DE POSICIONAMIENTO Y DIFERENCIACIÓN
- **Concepto diferenciador (Vaca Púrpura):** [redactado como estrategia de posicionamiento]
- **Narrativa de marca:** [el antagonista del mercado vs. la propuesta del cliente]
- **Garantía diferenciadora:** [cómo elimina el riesgo percibido del consumidor]
- **Capital de prueba social:** [evaluación de activos de credibilidad disponibles]
- **Tono y personalidad de marca:** [guía de comunicación recomendada]

## 7. PLAN ESTRATÉGICO DE 90 DÍAS

### Fase 1: Días 1-30 — Fundamentos
[3-4 acciones CONCRETAS y MEDIBLES. Ej: "Implementar pixel de Meta y Google Analytics 4 con eventos de conversión configurados para add_to_cart y purchase"]

### Fase 2: Días 31-60 — Activación
[3-4 acciones de activación de campañas y contenido]

### Fase 3: Días 61-90 — Optimización y Escalamiento
[3-4 acciones de crecimiento basadas en datos]

### KPIs Recomendados
| KPI | Meta | Plazo |
|---|---|---|
| [3-5 KPIs concretos y medibles] |

### Riesgos y Mitigación
[2-3 riesgos concretos con plan de mitigación]

---
**Documento preparado por Dr. Steve Dogs**
*PhD Performance Marketing — Stanford Dog University*
*Director de Estrategia, BG Consult*`;

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
      
      questionContext = `\n\n═══ INSTRUCCIÓN DEL SISTEMA ═══
PREGUNTA RECIÉN RESPONDIDA: Pregunta ${answeredQuestions} de 15 (${justAnsweredQ?.id})
GUÍA PARA COMENTAR: ${justAnsweredQ?.commentGuide || 'Comenta brevemente la respuesta.'}

SIGUIENTE PREGUNTA QUE DEBES HACER: Pregunta ${nextQuestionIndex + 1} de 15
INTRO DE STEVE: ${nextQ?.steveIntro || ''}
TEXTO EXACTO DE LA PREGUNTA: ${nextQ?.question}

${hasFields ? '⚠️ FORMULARIO: La siguiente pregunta tiene un formulario interactivo. NO escribas los campos como texto. Solo di "Llena los campos del formulario abajo".' : ''}

${nextQ?.examples?.length ? `EJEMPLOS PARA DAR (adáptalos a su industria): ${JSON.stringify(nextQ.examples)}` : 'Da 2-3 ejemplos concretos de SU industria específica.'}

RECUERDA: Tu respuesta debe tener MÁXIMO 2 partes:
1. Comentario breve sobre la respuesta anterior (2-4 oraciones)
2. La siguiente pregunta (usa la intro y el texto exacto de arriba)

NO preguntes NADA que no sea la Pregunta ${nextQuestionIndex + 1}. NO anticipes temas futuros. NO inventes preguntas.`;

      // Special instruction for after Q2 - calculate CPA
      if (answeredQuestions === 2) {
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
