import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

interface GenerateRequest {
  clientId: string;
  adType: 'static' | 'video';
  funnelStage: 'tofu' | 'mofu' | 'bofu';
  customPrompt?: string;
  angulo?: string;
  assetUrls?: string[];
  variacionElegida?: Record<string, string>;
  mode?: 'variaciones' | 'brief_visual' | 'legacy';
}

const COMBINED_METHODOLOGY = `
███████████████████████████████████████████████████████████████████████████████
█                                                                             █
█  METODOLOGÍA DE COPYWRITING PARA FUNNELS DE ALTA CONVERSIÓN                 █
█  Basado en: Sabri Suby (Sell Like Crazy) + Russell Brunson (DotCom Secrets) █
█                                                                             █
███████████████████████████████████████████████████████████████████████████████

═══════════════════════════════════════════════════════════════════════════════
PARTE 1: ESTADÍSTICAS Y FILOSOFÍA CORE
═══════════════════════════════════════════════════════════════════════════════

ESTADÍSTICAS CLAVE:
- 96% de los negocios falla al año
- 80% falla al segundo año
- 95% nunca llega al millón en ventas
- El 4% de las actividades generan el 64% del ingreso (Ley de Pareto)

FILOSOFÍA CORE (Sabri + Russell):
- El dinero no está en tu negocio, está en VENDER tu producto
- El mercado paga por RESOLVER PROBLEMAS, no por productos
- A más caro el problema que resuelves, más caro puedes cobrar
- Los clientes deben perseguirte, no tú a ellos
- Si no puedes pagar para adquirir un cliente, NO EXISTE EL NEGOCIO
- El que MÁS puede gastar en adquirir un cliente GANA
- AOV (Average Order Value) debe ser > CPA (Cost Per Acquisition)

═══════════════════════════════════════════════════════════════════════════════
PARTE 2: LA FÓRMULA SECRETA DE RUSSELL BRUNSON
═══════════════════════════════════════════════════════════════════════════════

Las 4 Preguntas Fundamentales:

1. ¿QUIÉNES SON TUS CLIENTES?
   - Debes AMAR a quienes sirves
   - Crea avatar detallado (hombre y mujer)
   - Todo lo que les gusta y no les gusta
   - Imprímelo y pégalo en tu muralla

2. ¿DÓNDE ESTÁN? (Congregaciones)
   - ¿Dónde se juntan online?
   - ¿Qué grupos de Facebook tienen?
   - ¿Qué leen, qué películas ven?
   - ¿De dónde sacan su información?

3. ¿CUÁL ES EL HOOK? (El Anzuelo)
   - La oferta debe ir de la mano con el público
   - Debe generar CURIOSIDAD
   - Debe captar atención instantánea

4. ¿CUÁL ES EL RESULTADO?
   - No es el producto, es el IMPACTO
   - ¿Dónde los vas a dejar que van a explotar?
   - Todo tiene que darles VALOR

═══════════════════════════════════════════════════════════════════════════════
PARTE 3: EL FRAMEWORK UNIVERSAL - HOOK → HISTORIA → OFERTA
═══════════════════════════════════════════════════════════════════════════════

🪝 HOOK (El Anzuelo):
- Son las entradas, miradas y mensajes para captar atención
- Debe generar CURIOSIDAD inmediata
- Si algo no funciona, revisa primero el hook
- El 80% de la efectividad está en el headline

📖 HISTORIA:
- Cuenta una historia detrás de la oferta
- Cómo le cambió la vida a alguien
- Genera empatía y conexión emocional
- La gente compra con emociones, justifica con lógica

💰 OFERTA:
- No vendas productos, vende TRANSFORMACIÓN
- Dale a la gente lo que quiere y lo que mueren por tener
- No los beneficios del producto, sino todos los resultados
- 2 maneras de hacer algo barato: bajar precio o subir valor percibido

SI ALGO NO FUNCIONA → Revisa: ¿Es el Hook? ¿Es la Historia? ¿Es la Oferta?

═══════════════════════════════════════════════════════════════════════════════
PARTE 4: LA PIRÁMIDE DEL MERCADO (Sabri Suby)
═══════════════════════════════════════════════════════════════════════════════

3% ACTIVAMENTE BUSCANDO:
- Los idiotas pelean aquí - guerra de precios
- Fácil que compren pero difícil destacar
- Nunca te van a dejar mucho dinero

37% PROBLEMA INCIPIENTE (¡EL ORO!):
- Tienen el problema pero no buscan activamente
- Están recabando información
- DEBEN SER EDUCADOS para que te elijan

60% NO SABEN QUE TIENEN EL PROBLEMA:
- Oportunidad de largo plazo
- Hay que moverlos hacia arriba

META: Educar al 97% para que cuando quieran comprar, TE ELIJAN A TI

═══════════════════════════════════════════════════════════════════════════════
PARTE 5: TEMPERATURA DEL TRÁFICO
═══════════════════════════════════════════════════════════════════════════════

🥶 TRÁFICO FRÍO (Tinder):
- Completo extraño, no te conocen
- Solo harán click en algo que les IMPACTE
- NO LE VENDAS, edúcalo primero
- Usa contenido de alto valor (HVCO)
- El pre-marco es fundamental

🌡️ TRÁFICO TIBIO (Cita):
- Te conocen, están evaluando opciones
- Están buscando FIT contigo
- Construye confianza y diferénciate
- Muestra credenciales y resultados

🔥 TRÁFICO CALIENTE (Netflix):
- Relación de largo plazo establecida
- Listos para comprar
- Aquí va la Oferta del Padrino/Irresistible
- Ya confían en ti

REGLA DE ORO: El mensaje debe coincidir con la temperatura del tráfico.
Si envías mensaje caliente a público frío = te mandan a volar.

HEADLINES POR TEMPERATURA (Russell Brunson):
- Hot: "[Producto] es el mejor por [razón]. Garantizado."
- Warm: "Busca [resultado] sin [dolor]"
- Cold: "No dejes que [obstáculo] te detenga. Cómo [lograr resultado]"

═══════════════════════════════════════════════════════════════════════════════
PARTE 6: MARKETING DE ALTO VALOR (HVCO)
═══════════════════════════════════════════════════════════════════════════════

- NO grites "¡COMPRA!". Dale contenido que de verdad les interese
- Mientras todos gritan "compra", tú dices "déjame ayudarte a avanzar"
- Si entras con vender a público frío, te mandan a volar

DATOS REALES:
- Ventas con CTA directo: 3% conversión
- Con proceso educativo: 30% conversión

"Solo los tontos leen copies largos" = MENTIRA
- Mientras los mantengas entretenidos, leen TODO
- A más contenido, más confianza
- A más confianza, más fácil que compren

Lo más importante: DEMOSTRAR lo bueno que eres en la cancha, no DECIRLO.

═══════════════════════════════════════════════════════════════════════════════
PARTE 7: EL PERSONAJE ATRACTIVO (Russell Brunson)
═══════════════════════════════════════════════════════════════════════════════

La marca necesita un PERSONAJE con quien la gente conecte:

TIPOS DE IDENTIDAD:
1. El Líder Experimentado - ya pasó por todo
2. El Aventurero - está en el camino, comparte aprendizajes
3. El Reportero - entrevista a quienes saben
4. El Reluctante - tiene que ayudar por obligación moral

ELEMENTOS CLAVE:
- Mostrar FALLAS es clave - genera empatía
- Comparte tu vida real
- Usa parábolas y historias
- Mantén opiniones firmes (imposible no ofender a nadie)
- Si nadie sabe de ti, nadie va a comprarte

HISTORIAS QUE CONECTAN:
- Loss: aprender de la pérdida
- Ellos vs Nosotros: quiénes son tu tribu
- Antes y Después: la transformación
- Descubrimiento: lo que encontraste
- Secretos: lo que otros no saben

═══════════════════════════════════════════════════════════════════════════════
PARTE 8: LA ESCALERA DE VALOR (Russell Brunson)
═══════════════════════════════════════════════════════════════════════════════

Concepto: Debes hacer que el cliente parta de a poco y vaya subiendo.

- Dales valor pequeño primero para que prueben
- Conforme confían, ofrece más valor a mayor precio
- Cada peldaño de la escalera tiene su propio funnel
- El leal cae automático si le das valor primero

ESTRUCTURA:
1. Lead Magnet (gratis) → Captura email
2. Tripwire (muy barato) → Convierte en comprador
3. Core Offer (precio normal) → Tu producto principal
4. Upsells/Bonos → Aumenta AOV
5. Premium (precio alto) → Para los más comprometidos

REGLA: Parte de lo básico, luego crece. No hagas todo de una.

═══════════════════════════════════════════════════════════════════════════════
PARTE 9: LAS 7 PARTES DE LA OFERTA DEL PADRINO (Sabri Suby)
═══════════════════════════════════════════════════════════════════════════════

Una oferta TAN buena que sería TONTO decir que no:

1. VALOR PERCIBIDO ALTÍSIMO
2. GARANTÍA SÓLIDA
3. BONOS ATRACTIVOS
4. ESCASEZ/URGENCIA REAL
5. RESULTADOS CLAROS
6. DECISIÓN SIMPLE
7. BENEFICIOS EMOCIONALES

═══════════════════════════════════════════════════════════════════════════════
PARTE 10: LOS 17 PASOS DE SABRI PARA COPY
═══════════════════════════════════════════════════════════════════════════════

1. LLAMA A TU AUDIENCIA en el principio
2. DEMANDA ATENCIÓN con Headline potente
3. BACK UP de tu promesa
4. CREA INTRIGA con bullet points
5. HAZLOS VIVIR SU PROBLEMA
6. DALES LA SOLUCIÓN
7. MUESTRA TUS CREDENCIALES
8. DETALLA LOS BENEFICIOS
9. CREA PRUEBA SOCIAL
10. MUESTRA LA OFERTA DEL PADRINO
11. MÉTELE BONOS
12. MUESTRA CUÁNTO CUESTA EN REALIDAD
13. MUESTRA EL PRECIO
14. METE PREMURA
15. GARANTÍA PROFUNDA
16. LLAMADO A LA ACCIÓN
17. RECORDATORIO SI NO COMPRA

═══════════════════════════════════════════════════════════════════════════════
PARTE 11: ESTRUCTURA STAR-STORY-SOLUTION (Russell Brunson)
═══════════════════════════════════════════════════════════════════════════════

⭐ STAR: El personaje atractivo
📖 STORY: La historia con drama y empatía
💡 SOLUTION: La oferta 10X más grande que el precio

═══════════════════════════════════════════════════════════════════════════════
PARTE 12: FÓRMULAS DE HEADLINES Y HOOKS
═══════════════════════════════════════════════════════════════════════════════

HEADLINES QUE GENERAN CURIOSIDAD:
- "Imagínate en 30 días..."
- "Esto no lo saben..."
- "[X] maneras de [resultado] que nadie te ha contado"
- "La verdad sobre [tema controversial]"

FÓRMULAS PARA BULLETS:
- "Cómo [lograr X] con [método Y]"
- "¿Necesitas [resultado]? Estás equivocado sobre [creencia]"
- "Dile adiós a [problema]"

═══════════════════════════════════════════════════════════════════════════════
PARTE 13: SCRIPTS ESPECÍFICOS
═══════════════════════════════════════════════════════════════════════════════

SCRIPT PARA UPSELL (OTO):
1. Confirmar que la compra anterior les gustó
2. "Pero espera, hay algo más..."
3. Producto con descuento especial
4. Botón de acción claro

SCRIPT PARA WEBINAR/VIDEO LARGO:
1. Hook rápido, promesa gigante
2. Por qué TÚ debes hablar de esto
3. Contenido: NO enseñes todo, solo el sistema
4. Oferta: Transición suave al cierre
5. Precio ALTO primero, luego precio real

═══════════════════════════════════════════════════════════════════════════════
PARTE 14: PRINCIPIOS DE PERSUASIÓN COMBINADOS
═══════════════════════════════════════════════════════════════════════════════

1. PROBLEMA → SOLUCIÓN → RESULTADO
2. EMOCIONES PRIMERO, LÓGICA DESPUÉS
3. ESPECÍFICO > GENÉRICO
4. USA LAS PALABRAS DEL CLIENTE
5. TODO TIENE UN VILLANO
6. PINTA LA TRANSFORMACIÓN
7. LA OFERTA ES LA PUNTA DE ESPADA
8. HAZ QUE SIENTAN QUE SERÍAN TONTOS SI DICEN NO

═══════════════════════════════════════════════════════════════════════════════
PARTE 15: ANATOMÍA DE UN BUEN ANUNCIO DE META
═══════════════════════════════════════════════════════════════════════════════

PARA ESTÁTICOS:
- Imagen: Debe parecer contenido NORMAL, no publicidad
- Headline Link: 12-18 palabras (60-100 caracteres)
- Simple y un llamado a la atención

PARA VIDEO:
- Los primeros 3 segundos son TODO (el Hook)
- Debe parecer contenido orgánico
- Contenido > Calidad de producción

HOOKS PARA VIDEO:
- Pregunta impactante
- Estadística sorprendente
- Controversia
- Dolor específico
- Beneficio inmediato
`;

const FUNNEL_CONTEXT = {
  tofu: {
    name: 'Top of Funnel (TOFU) - TRÁFICO FRÍO',
    audience: 'Audiencia FRÍA - No te conocen, como Tinder. Son el 60% o parte del 37% de la pirámide.',
    goal: 'INTERRUMPIR el scroll, educar, generar curiosidad. Moverlos hacia arriba en la pirámide. NO VENDER.',
    focus: 'El PROBLEMA, no el producto. Marketing de Alto Valor (HVCO). El pre-marco correcto.',
    russellApproach: `
APLICA LA FÓRMULA SECRETA (Russell):
- Responde: ¿Quién eres? ¿Qué haces? ¿Por qué? ¿Cómo pueden acceder?
- Hook que genere CURIOSIDAD instantánea
- El headline es el 80% de la efectividad
- Parecer contenido orgánico, NO publicidad

HEADLINES PARA TRÁFICO FRÍO:
- "No dejes que [obstáculo] te detenga"
- "Cómo [lograr resultado] sin [sacrificio]"
- "La verdad sobre [tema que les importa]"
- "[X] errores que cometes con [problema]"
`,
    sabriApproach: `
APLICA MARKETING DE ALTO VALOR (Sabri):
- NO vendas, educa y genera curiosidad
- Habla del dolor de las 3 AM
- Usa las palabras EXACTAS del cliente
- Pregunta que haga pensar "¿Cómo saben lo que pienso?"
- Estadísticas impactantes
- Presenta al VILLANO

PASOS DE SABRI (1-5):
1. Llama a tu audiencia específica
2. Headline potente que demande atención
3. Intriga con bullet points
4. Hazlos VIVIR su problema
5. Genera curiosidad sobre la solución (sin venderla)
`,
    copyRules: `
- 100% enfoque en el PROBLEMA
- No menciones el producto directamente
- Usa estadísticas impactantes
- Pregunta que genere identificación
- CTA hacia CONTENIDO DE VALOR, no compra
- Parecer contenido orgánico
- Genera intriga y curiosidad
- Responde las 4 preguntas de Russell para frío
`,
  },
  mofu: {
    name: 'Middle of Funnel (MOFU) - TRÁFICO TIBIO',
    audience: 'Audiencia TIBIA - Te conocen, como una Cita. Son el 37% que está recabando información.',
    goal: 'Construir CONFIANZA, diferenciarte, posicionar tu solución como LA OBVIA. Subir en la escalera de valor.',
    focus: 'Tu SOLUCIÓN y por qué eres diferente. Credenciales, prueba social, el Personaje Atractivo.',
    russellApproach: `
APLICA EL PERSONAJE ATRACTIVO (Russell):
- Muestra tu historia real (Star-Story-Solution)
- Comparte fallas y vulnerabilidades = empatía
- Mantén opiniones firmes
- Usa la estructura: Antes → Después
- "El problema que tuve es el MISMO que el tuyo"
- Demuestra que eres como ellos

HEADLINES PARA TRÁFICO TIBIO:
- "Busca [resultado] sin [dolor]"
- "Cómo [yo/cliente] logró [resultado]"
- "El secreto de [resultado] que nadie te cuenta"
- "[Número] clientes ya lograron [resultado]"
`,
    sabriApproach: `
CONSTRUYE CONFIANZA (Sabri):
- Muestra tu "Vaca Púrpura" - qué te hace diferente
- Comparte tu "Secreto del Insider"
- Testimonios y prueba social irrefutable
- Por qué elegirte sobre la competencia
- Tu proceso único o metodología
- Educa sobre la solución CORRECTA

PASOS DE SABRI (5-10):
5. Hazlos vivir el problema (refuerzo)
6. Presenta LA SOLUCIÓN
7. Muestra TUS CREDENCIALES
8. Detalla BENEFICIOS (emocionales primero)
9. Prueba social potente
10. Introduce la oferta (sin presión aún)
`,
    copyRules: `
- Muestra resultados y transformaciones reales
- Usa testimonios con nombres y detalles
- Explica tu metodología o proceso único
- Diferénciate claramente de la competencia
- Historia personal que genere empatía
- CTA hacia demo, consulta o más información
- Construye autoridad sin ser arrogante
- Usa la estructura Star-Story-Solution
`,
  },
  bofu: {
    name: 'Bottom of Funnel (BOFU) - TRÁFICO CALIENTE',
    audience: 'Audiencia CALIENTE - Listos para comprar, como Netflix. El 3% + los que ya educaste.',
    goal: 'CERRAR LA VENTA con la Oferta del Padrino. Una oferta tan buena que sería TONTO rechazarla.',
    focus: 'La OFERTA IRRESISTIBLE completa. Urgencia REAL, garantía absurda, bonos, stack de valor.',
    russellApproach: `
APLICA LA OFERTA IRRESISTIBLE (Russell):
- Stack de valor: muestra TODO lo que incluye
- Precio alto primero → precio real después
- "No voy a cobrarte X, sino Y"
- "Y te doy garantía, pero se acaba este mes"
- Compara con algo trivial ("menos que un café al día")
- Un solo producto, decisión simple
- El botón con texto de acción claro

HEADLINES PARA TRÁFICO CALIENTE:
- "[Producto] es el mejor por [razón]. Garantizado."
- "Última oportunidad para [resultado]"
- "[Descuento]% solo por [tiempo limitado]"
- "Solo quedan [X] cupos/unidades"
`,
    sabriApproach: `
APLICA LA OFERTA DEL PADRINO (Sabri):
1. VALOR PERCIBIDO ALTÍSIMO
2. GARANTÍA SÓLIDA (absurda)
3. BONOS ATRACTIVOS
4. ESCASEZ/URGENCIA REAL
5. RESULTADOS CLAROS
6. DECISIÓN SIMPLE
7. BENEFICIOS EMOCIONALES

PASOS DE SABRI (10-17):
10. Muestra la Oferta del Padrino
11. Métele bonos
12. Muestra cuánto cuesta en realidad
13. Muestra precio (compara con trivial)
14. Mete premura REAL
15. Garantía profunda y visible
16. CTA directo y claro
17. Recordatorio de lo que pierden
`,
    copyRules: `
- La oferta debe ser IRRESISTIBLE
- Incluye garantía prominente con nombre
- Urgencia y escasez REAL (no fake)
- Muestra el valor total vs el precio
- CTA súper claro y directo
- Recuerda el costo de NO actuar
- Usa "tú" y lenguaje directo
- Stack completo de lo que incluye
- Que se sientan TONTOS si dicen no
`,
  },
};

function buildSystemPrompt(briefData: any, adType: string, funnelStage: keyof typeof FUNNEL_CONTEXT, customPrompt?: string, productContext?: string, brandContext?: string) {
  const funnel = FUNNEL_CONTEXT[funnelStage];

  return `Eres un copywriter EXPERTO en Meta Ads entrenado en las metodologías combinadas de:
- Sabri Suby (Sell Like Crazy / 1PMP)
- Russell Brunson (DotCom Secrets / Expert Secrets / Traffic Secrets)

███████████████████████████████████████████████████████████████████████████████
█  REGLA #0 — ANTI-ALUCINACIÓN (MÁXIMA PRIORIDAD)                           █
███████████████████████████████████████████████████████████████████████████████
- NUNCA inventes productos, marcas, industrias o temas que NO aparezcan en el contexto de este prompt.
- NUNCA hables de plantas, macetas, jardines, mascotas, comida u otros temas genéricos a menos que sean los productos REALES del cliente.
- Si no hay suficientes datos del cliente, usa SOLO lo que sí tienes (productos de Shopify, propuesta de valor, nombre de marca).
- Todo el copy DEBE referirse a los productos y la marca REALES del cliente que aparecen abajo.
- Si generas copy sobre un tema que NO está en los datos del cliente, estás fallando.

${COMBINED_METHODOLOGY}

═══════════════════════════════════════════════════════════════════════════════
BRIEF DE MARCA DEL CLIENTE
═══════════════════════════════════════════════════════════════════════════════
${JSON.stringify(briefData, null, 2)}

${brandContext || ''}

${productContext || ''}

═══════════════════════════════════════════════════════════════════════════════
INSTRUCCIONES ESPECÍFICAS PARA ESTA GENERACIÓN
═══════════════════════════════════════════════════════════════════════════════

ETAPA DEL FUNNEL: ${funnel.name}
- Audiencia: ${funnel.audience}
- Objetivo: ${funnel.goal}
- Enfoque: ${funnel.focus}

APPROACH DE RUSSELL BRUNSON:
${funnel.russellApproach}

APPROACH DE SABRI SUBY:
${funnel.sabriApproach}

REGLAS DE COPY PARA ESTA ETAPA:
${funnel.copyRules}

TIPO DE ANUNCIO: ${adType === 'static' ? 'Estático (imagen)' : 'Video'}

${customPrompt ? `INSTRUCCIONES ADICIONALES DEL CLIENTE: ${customPrompt}` : ''}

═══════════════════════════════════════════════════════════════════════════════
FRAMEWORK OBLIGATORIO: HOOK → HISTORIA → OFERTA
═══════════════════════════════════════════════════════════════════════════════

Todo copy DEBE seguir este framework:
- HOOK: Captura atención instantánea
- HISTORIA: Genera conexión emocional
- OFERTA: Da valor irresistible (adaptado a la etapa del funnel)

═══════════════════════════════════════════════════════════════════════════════
FORMATO DE RESPUESTA
═══════════════════════════════════════════════════════════════════════════════

Responde ÚNICAMENTE con un JSON válido con esta estructura:
{
  "headlines": [
    "5 headlines potentes usando las fórmulas de Sabri + Russell",
    "Cada uno con ángulo diferente: dolor, curiosidad, beneficio, controversia, transformación",
    "Adaptados a la temperatura del tráfico (${funnelStage.toUpperCase()})"
  ],
  "primaryText": "Texto principal siguiendo Hook-Historia-Oferta. Para TOFU: 100-200 palabras enfocadas en el problema y educación. Para MOFU: 150-250 palabras con historia y credenciales. Para BOFU: 200-400 palabras con la oferta completa del Padrino.",
  "description": "Descripción de 1-2 líneas que refuerce el headline con intriga"${adType === 'video' ? `,
  "hooks": [
    "5 hooks diferentes para los primeros 3 segundos",
    "Cada hook debe DETENER el scroll",
    "Usa: pregunta, estadística, controversia, dolor, beneficio"
  ],
  "script": "Guión usando Star-Story-Solution de Russell"` : ''}
}

IMPORTANTE:
- USA el tono definido en el brief
- INCORPORA las palabras EXACTAS del buyer persona
- APLICA Hook-Historia-Oferta en todo
- SIGUE las fórmulas de headlines según temperatura
- Para ${funnelStage.toUpperCase()}: ${funnel.goal}
- Responde SOLO con JSON, sin texto adicional
- REGLA ANTI-ALUCINACIÓN: Todo el copy DEBE referirse EXCLUSIVAMENTE a los productos y marca del cliente listados arriba. Si no hay productos listados, usa la propuesta de valor y el nombre de la marca. NUNCA inventes productos, industrias ni temas genéricos. PROHIBIDO hablar de plantas, macetas, jardines, mascotas, comida u otros temas que no estén en los datos del cliente.`;
}

export async function generateMetaCopy(c: Context) {
  try {
  const body = await c.req.json();

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    console.error('[generate-meta-copy] ANTHROPIC_API_KEY is not configured');
    return c.json({ error: 'Error interno del servidor' }, 500);
  }

  const supabase = getSupabaseAdmin();

  // Extract clientId early (used by both instruction and standard modes)
  const resolvedClientId = body.client_id || body.clientId;
  if (!resolvedClientId) {
    return c.json({ error: 'Missing client_id or clientId' }, 400);
  }

  // Verify the authenticated user owns this client
  const user = c.get('user');
  if (user) {
    const { data: ownerCheck } = await supabase
      .from('clients')
      .select('id')
      .eq('id', resolvedClientId)
      .or(`user_id.eq.${user.id},client_user_id.eq.${user.id}`)
      .maybeSingle();
    if (!ownerCheck) {
      return c.json({ error: 'No tienes acceso a este cliente' }, 403);
    }
  }

  // ── INSTRUCTION MODE (simple prompt pass-through) ───────────────────────
  // Used by TestingWizard322 and CampaignCreateWizard for quick copy generation
  if (body.instruction) {
    const cId = resolvedClientId;

    // Fetch client brief, knowledge base, and brand research
    const [{ data: briefData }, { data: brandResearch }, { data: kbBugs }, { data: kbKnowledge }] = await Promise.all([
      supabase.from('buyer_personas').select('*').eq('client_id', cId).eq('is_complete', true).order('created_at', { ascending: false }).limit(1).single(),
      supabase.from('brand_research').select('brand_name, industry, target_audience, value_proposition, brand_voice, competitor_analysis, product_details').eq('client_id', cId).order('created_at', { ascending: false }).limit(1).single(),
      supabase.from('steve_bugs').select('descripcion, ejemplo_malo, ejemplo_bueno').eq('categoria', 'meta_ads').eq('activo', true),
      supabase.from('steve_knowledge').select('titulo, contenido').in('categoria', ['meta_ads', 'anuncios']).eq('activo', true).order('orden', { ascending: false }).limit(10),
    ]);

    const personaData = briefData?.persona_data || briefData?.raw_data || {};
    const brandSection = brandResearch ? `\nDATOS DE LA MARCA:
- Marca: ${brandResearch.brand_name || 'N/A'}
- Industria: ${brandResearch.industry || 'N/A'}
- Audiencia objetivo: ${JSON.stringify(brandResearch.target_audience || 'N/A')}
- Propuesta de valor: ${JSON.stringify(brandResearch.value_proposition || 'N/A')}
- Voz de marca: ${JSON.stringify(brandResearch.brand_voice || 'N/A')}
- Detalles del producto: ${JSON.stringify(brandResearch.product_details || 'N/A')}\n` : '';
    const briefSection = Object.keys(personaData).length > 0 ? `\nBRIEF DEL CLIENTE:\n${JSON.stringify(personaData, null, 2)}\n` : '';
    const bugSection = kbBugs && kbBugs.length > 0 ? `\nERRORES A EVITAR:\n${kbBugs.map((b: any) => `❌ ${b.descripcion}`).join('\n')}\n` : '';
    const knowledgeSection = kbKnowledge && kbKnowledge.length > 0 ? `\nREGLAS:\n${kbKnowledge.map((k: any) => `- ${k.titulo}: ${k.contenido}`).join('\n')}\n` : '';

    // Fetch Shopify products for concrete context
    const { data: shopifyProducts } = await supabase
      .from('shopify_products')
      .select('title, product_type, price, image_url')
      .eq('client_id', cId)
      .limit(10);

    const { data: clientInfo } = await supabase
      .from('clients')
      .select('name, company, shop_domain')
      .eq('id', cId)
      .maybeSingle();

    const shopifySection = shopifyProducts && shopifyProducts.length > 0
      ? `\nPRODUCTOS REALES DE LA TIENDA:\n${shopifyProducts.map((p: any) => `- ${p.title} ($${Number(p.price).toLocaleString('es-CL')} CLP) — ${p.product_type || 'general'}`).join('\n')}\n`
      : '';

    const clientSection = clientInfo
      ? `\nCLIENTE: ${clientInfo.name || clientInfo.company || 'N/A'}${clientInfo.shop_domain ? ` (${clientInfo.shop_domain})` : ''}\n`
      : '';

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: 'Eres un copywriter experto en Meta Ads. REGLA ABSOLUTA: TODO el copy que generes DEBE ser 100% específico para la marca y productos REALES del cliente. NUNCA inventes productos, industrias, o temas genéricos. PROHIBIDO hablar de plantas, mascotas, comida u otros temas que no correspondan al negocio real del cliente. Si no hay suficiente contexto, usa SOLO los datos que sí tienes.',
        messages: [{ role: 'user', content: `${clientSection}${brandSection}${briefSection}${shopifySection}${bugSection}${knowledgeSection}\nREGLA CRÍTICA: TODO el copy DEBE ser 100% específico para esta marca y sus productos reales. NUNCA inventes productos, industrias o temas genéricos. Si no tienes suficiente contexto, usa los productos de Shopify y la propuesta de valor de la marca. PROHIBIDO hablar de plantas, mascotas, comida u otros temas que no sean del cliente.\n\n${body.instruction}` }],
      }),
    });
    const aiData: any = await resp.json();
    const text = aiData?.content?.[0]?.text || '';
    return c.json({ copy: text, text });
  }

  // ── STANDARD MODES (variaciones, brief_visual, legacy) ─────────────────
  const { clientId, adType, funnelStage, customPrompt, angulo, assetUrls, variacionElegida, mode } = body as GenerateRequest;

  if (!clientId || !adType || !funnelStage) {
    return c.json({ error: 'Missing required parameters' }, 400);
  }

  // Ownership already verified above (resolvedClientId check)

  // ── VARIACIONES MODE ──────────────────────────────────────────────────────
  if (mode === 'variaciones') {
    const { data: briefData } = await supabase
      .from('buyer_personas').select('*').eq('client_id', clientId).eq('is_complete', true)
      .order('created_at', { ascending: false }).limit(1).single();

    const rawData = briefData?.persona_data || briefData?.raw_data || {};

    const [{ data: kbBugsVar }, { data: kbKnowledgeVar }] = await Promise.all([
      supabase.from('steve_bugs').select('descripcion, ejemplo_malo, ejemplo_bueno').eq('categoria', 'meta_ads').eq('activo', true),
      supabase.from('steve_knowledge').select('titulo, contenido').in('categoria', ['meta_ads', 'anuncios']).eq('activo', true).order('orden', { ascending: false }).order('created_at', { ascending: false }).limit(20),
    ]);
    const bugSectionVar = kbBugsVar && kbBugsVar.length > 0 ? `\nERRORES CRÍTICOS QUE DEBES EVITAR:\n${kbBugsVar.map((b: any) => `❌ ${b.descripcion}\nMAL: ${b.ejemplo_malo}\nBIEN: ${b.ejemplo_bueno}`).join('\n\n')}\n` : '';
    const knowledgeSectionVar = kbKnowledgeVar && kbKnowledgeVar.length > 0 ? `\nREGLAS APRENDIDAS DE CREATIVOS (seguir obligatoriamente):\nSi hay conflicto entre reglas, priorizar las de orden más alto (más recientes).\n${kbKnowledgeVar.map((k: any) => `- ${k.titulo}: ${k.contenido}`).join('\n')}\n` : '';

    const [{ data: brandResearchVar }, { data: shopifyProductsVar }, { data: clientInfoVar }] = await Promise.all([
      supabase.from('brand_research').select('brand_name, industry, target_audience, value_proposition, brand_voice, product_details').eq('client_id', clientId).order('created_at', { ascending: false }).limit(1).single(),
      supabase.from('shopify_products').select('title, product_type, price, image_url').eq('client_id', clientId).limit(10),
      supabase.from('clients').select('name, company, shop_domain').eq('id', clientId).maybeSingle(),
    ]);

    const brandContextVar = brandResearchVar ? `\nMARCA: ${brandResearchVar.brand_name || 'N/A'}
Industria: ${brandResearchVar.industry || 'N/A'}
Propuesta de valor: ${JSON.stringify(brandResearchVar.value_proposition || 'N/A')}
Voz de marca: ${JSON.stringify(brandResearchVar.brand_voice || 'N/A')}
Productos: ${JSON.stringify(brandResearchVar.product_details || 'N/A')}\n` : '';

    const shopifyContextVar = shopifyProductsVar && shopifyProductsVar.length > 0
      ? `\nPRODUCTOS REALES DE LA TIENDA:\n${shopifyProductsVar.map((p: any) => `- ${p.title} ($${Number(p.price).toLocaleString('es-CL')} CLP) — ${p.product_type || 'general'}`).join('\n')}\n`
      : '';

    const storeNameVar = clientInfoVar?.name || clientInfoVar?.company || '';

    const prompt = `${bugSectionVar}${knowledgeSectionVar}Eres un experto en copywriting de performance marketing con metodología Sabri Suby + Russell Brunson.
REGLA CRÍTICA: El copy debe ser 100% específico para los productos y marca del cliente. USA los nombres reales de sus productos, sus precios reales, su propuesta de valor real. NUNCA inventes un negocio ficticio ni uses temas genéricos.
${brandContextVar}${shopifyContextVar}
DATOS DEL CLIENTE:
- Tienda: ${storeNameVar}
- Brief: ${JSON.stringify(rawData, null, 2)}
- Fotos del producto disponibles: ${(assetUrls || []).join(', ')}

Genera exactamente 3 variaciones usando el ángulo "${angulo}" para un anuncio ${funnelStage?.toUpperCase()} ${adType === 'video' ? 'video' : 'imagen'}.
${customPrompt ? `Instrucciones adicionales: ${customPrompt}` : ''}

Usa las fotos para hacer el copy más específico — menciona colores, diseños o detalles reales que veas.

Responde SOLO en JSON válido sin markdown ni backticks:
{
  "explicacion": "Por qué este ángulo funciona para este cliente (2-3 líneas)",
  "variaciones": [
    {"badge": "Variación A", "titulo": "...", "texto_principal": "...", "descripcion": "...", "cta": "..."},
    {"badge": "Variación B", "titulo": "...", "texto_principal": "...", "descripcion": "...", "cta": "..."},
    {"badge": "Variación C", "titulo": "...", "texto_principal": "...", "descripcion": "...", "cta": "..."}
  ]
}`;

    const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: 'Eres un copywriter experto. REGLA ABSOLUTA: NUNCA inventes productos, marcas o temas. SOLO usa los datos reales del cliente que aparecen en el prompt. PROHIBIDO hablar de plantas, mascotas, comida u otros temas genéricos que no correspondan al negocio real del cliente.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error('Anthropic API error (variaciones):', aiResp.status, errText);
      return c.json({ error: `Anthropic API error (${aiResp.status}): ${errText.slice(0, 300)}` }, 500);
    }
    const aiData: any = await aiResp.json();
    const raw = aiData.content?.[0]?.text || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(raw);
    return c.json(parsed);
  }

  // ── BRIEF VISUAL MODE ─────────────────────────────────────────────────────
  if (mode === 'brief_visual') {
    const { data: briefData } = await supabase
      .from('buyer_personas').select('*').eq('client_id', clientId).eq('is_complete', true)
      .order('created_at', { ascending: false }).limit(1).single();

    const rawData = briefData?.persona_data || briefData?.raw_data || {};

    const [{ data: kbBugsBV }, { data: kbKnowledgeBV }] = await Promise.all([
      supabase.from('steve_bugs').select('descripcion, ejemplo_malo, ejemplo_bueno').eq('categoria', 'anuncios').eq('activo', true),
      supabase.from('steve_knowledge').select('titulo, contenido').in('categoria', ['anuncios', 'meta_ads']).eq('activo', true).order('orden', { ascending: false }).order('created_at', { ascending: false }).limit(15),
    ]);
    const bugSectionBV = kbBugsBV && kbBugsBV.length > 0 ? `\nERRORES CRÍTICOS QUE DEBES EVITAR:\n${kbBugsBV.map((b: any) => `❌ ${b.descripcion}\nMAL: ${b.ejemplo_malo}\nBIEN: ${b.ejemplo_bueno}`).join('\n\n')}\n` : '';
    const knowledgeSectionBV = kbKnowledgeBV && kbKnowledgeBV.length > 0 ? `\nREGLAS APRENDIDAS DE CREATIVOS (seguir obligatoriamente):\n${kbKnowledgeBV.map((k: any) => `- ${k.titulo}: ${k.contenido}`).join('\n')}\n` : '';

    const [{ data: shopifyProductsBV }, { data: brandResearchBV }, { data: clientInfoBV }] = await Promise.all([
      supabase.from('shopify_products').select('title, product_type, price, image_url').eq('client_id', clientId).limit(10),
      supabase.from('brand_research').select('brand_name, industry, value_proposition, product_details').eq('client_id', clientId).order('created_at', { ascending: false }).limit(1).single(),
      supabase.from('clients').select('name, company, shop_domain').eq('id', clientId).maybeSingle(),
    ]);

    const shopifyContextBV = shopifyProductsBV && shopifyProductsBV.length > 0
      ? `\nProductos reales de la tienda:\n${shopifyProductsBV.map((p: any) => `- ${p.title} ($${Number(p.price).toLocaleString('es-CL')} CLP)${p.image_url ? ` [foto: ${p.image_url}]` : ''}`).join('\n')}\n`
      : '';

    const brandContextBV = brandResearchBV ? `\nMarca: ${brandResearchBV.brand_name || 'N/A'}\nIndustria: ${brandResearchBV.industry || 'N/A'}\nProductos: ${JSON.stringify(brandResearchBV.product_details || 'N/A')}\n` : '';
    const clientNameBV = clientInfoBV?.name || clientInfoBV?.company || '';

    const prompt = `${bugSectionBV}${knowledgeSectionBV}Basándote en el copy aprobado y las fotos reales del producto, genera el brief visual para producción.
Cliente: ${clientNameBV}
${brandContextBV}${shopifyContextBV}
Copy aprobado: ${JSON.stringify(variacionElegida)}
Formato: ${adType}
Ángulo: ${angulo}
Brief del cliente: ${JSON.stringify(rawData, null, 2)}
Fotos disponibles: ${(assetUrls || []).join(', ')}

${adType === 'static'
  ? `Responde SOLO en JSON sin markdown:
{"tipo":"imagen","concepto":"...","plano_principal":"...","texto_overlay":"...","estilo_fotografico":"lifestyle/ugc/editorial/clean","iluminacion":"...","colores":"...","foto_recomendada":"URL de la foto más adecuada o null si no hay","instruccion_foto":"usarla tal cual / cambiar fondo / agregar texto / animar","prompt_generacion":"prompt detallado en inglés para Fal.ai Flux Pro"}`
  : `Responde SOLO en JSON sin markdown:
{"tipo":"video","duracion":"15s","escena_1":{"tiempo":"0-3s","descripcion":"...","texto_overlay":"..."},"escena_2":{"tiempo":"3-12s","descripcion":"...","texto_overlay":"..."},"escena_3":{"tiempo":"12-15s","descripcion":"...","texto_overlay":"..."},"musica_sugerida":"...","tono":"...","foto_recomendada":"URL de la foto más adecuada o null si no hay","instruccion_foto":"animar / usar como base / cambiar fondo","prompt_generacion":"prompt detallado en inglés para Kling AI"}`
}`;

    const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: 'Eres un director creativo experto en producción visual para Meta Ads. REGLA ABSOLUTA: Basa el brief visual SOLO en los productos y marca REALES del cliente. NUNCA inventes productos ni temas genéricos.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error('Anthropic API error (brief_visual):', aiResp.status, errText);
      return c.json({ error: `Anthropic API error (${aiResp.status}): ${errText.slice(0, 300)}` }, 500);
    }
    const aiData: any = await aiResp.json();
    const raw = aiData.content?.[0]?.text || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(raw);
    return c.json(parsed);
  }

  // ── LEGACY MODE ──────────────────────────────────────────────────────────

  const { data: briefData, error: briefError } = await supabase
    .from('buyer_personas')
    .select('*')
    .eq('client_id', clientId)
    .eq('is_complete', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (briefError || !briefData) {
    console.error('[generate-meta-copy] Brief error:', briefError);
    return c.json({ error: 'No completed brand brief found. Please complete the brief with Steve first.' }, 404);
  }

  // Dual-layer learning
  const { data: globalFeedback } = await supabase
    .from('steve_feedback')
    .select('rating, feedback_text, content_type')
    .eq('content_type', 'meta_copy')
    .order('created_at', { ascending: false })
    .limit(50);

  const { data: clientFeedback } = await supabase
    .from('steve_feedback')
    .select('rating, feedback_text, content_type, improvement_notes')
    .eq('client_id', clientId)
    .eq('content_type', 'meta_copy')
    .order('created_at', { ascending: false })
    .limit(10);

  let learningContext = '';

  if (globalFeedback && globalFeedback.length > 0) {
    const globalAvgRating = globalFeedback.reduce((sum, f) => sum + (f.rating || 0), 0) / globalFeedback.length;
    const globalNegative = globalFeedback.filter(f => (f.rating || 0) <= 2 && f.feedback_text);
    const globalPositive = globalFeedback.filter(f => (f.rating || 0) >= 4 && f.feedback_text);

    learningContext += `
═══════════════════════════════════════════════════════════════════════════════
🧠 STEVE'S GLOBAL LEARNING (Patrones de ${globalFeedback.length} generaciones)
═══════════════════════════════════════════════════════════════════════════════
Rating promedio global: ${globalAvgRating.toFixed(1)}/5

${globalPositive.length > 0 ? `
✅ PATRONES QUE FUNCIONAN (aprendido de múltiples clientes):
${globalPositive.slice(0, 5).map(f => `- "${f.feedback_text}"`).join('\n')}
` : ''}

${globalNegative.length > 0 ? `
⚠️ PATRONES A EVITAR (errores comunes detectados):
${globalNegative.slice(0, 5).map(f => `- "${f.feedback_text}"`).join('\n')}
` : ''}
`;
  }

  if (clientFeedback && clientFeedback.length > 0) {
    const clientAvgRating = clientFeedback.reduce((sum, f) => sum + (f.rating || 0), 0) / clientFeedback.length;
    const clientNegative = clientFeedback.filter(f => (f.rating || 0) <= 2 && f.feedback_text);
    const clientPositive = clientFeedback.filter(f => (f.rating || 0) >= 4 && f.feedback_text);

    learningContext += `
═══════════════════════════════════════════════════════════════════════════════
🎯 PREFERENCIAS DE ESTE CLIENTE ESPECÍFICO
═══════════════════════════════════════════════════════════════════════════════
Rating promedio del cliente: ${clientAvgRating.toFixed(1)}/5
Generaciones evaluadas: ${clientFeedback.length}

${clientPositive.length > 0 ? `
✅ LO QUE LE GUSTA A ESTE CLIENTE (PRIORIDAD MÁXIMA):
${clientPositive.map(f => `- "${f.feedback_text}"`).join('\n')}
` : ''}

${clientNegative.length > 0 ? `
⛔ LO QUE ESTE CLIENTE RECHAZA (EVITAR ABSOLUTAMENTE):
${clientNegative.map(f => `- "${f.feedback_text}"`).join('\n')}
` : ''}

REGLA: Las preferencias del cliente SIEMPRE tienen prioridad sobre los patrones globales.
`;
  }

  if (learningContext) {
    learningContext += `
═══════════════════════════════════════════════════════════════════════════════
🐕 INSTRUCCIÓN DE STEVE
═══════════════════════════════════════════════════════════════════════════════
Soy Steve y he aprendido de múltiples clientes. Uso estos insights para generar
copies más efectivos. Aplico patrones globales exitosos pero SIEMPRE respeto
las preferencias específicas de cada cliente cuando las conozco.
`;
  }

  const rawData = briefData.raw_data || {};
  const executiveSummary = briefData.executive_summary || '';

  const briefContext = {
    respuestasCompletas: rawData,
    resumenEjecutivo: executiveSummary,
    buyerPersona: {
      nombre: briefData.name,
      rangoEdad: briefData.age_range,
      genero: briefData.gender,
      ubicacion: briefData.location,
      ocupacion: briefData.occupation,
    },
    psicografia: {
      doloresPrincipales: briefData.main_pains,
      deseosPrincipales: briefData.main_desires,
      miedosPrincipales: briefData.main_fears,
      objecionesPrincipales: briefData.main_objections,
    },
    negocio: {
      tipoNegocio: rawData.business_type,
      ticketPromedio: rawData.average_ticket,
      margenes: rawData.margins,
      canalesVenta: rawData.sales_channels,
    },
    personaProfunda: {
      dolorDeLas3AM: rawData.persona_3am_pain,
      verguenza: rawData.persona_shame,
      errorComun: rawData.persona_common_mistake,
      miedoNoComprar: rawData.persona_fear_not_buying,
      sentimientoDomingo: rawData.persona_sunday_feeling,
      palabrasExactas: rawData.persona_exact_words,
      objecionInterna: rawData.persona_internal_objection,
      transformacionSonada: rawData.persona_transformation,
      marcasQueConsume: rawData.persona_lifestyle_brands,
      aQuienImpresiona: rawData.persona_impress_who,
      canalesCliente: rawData.persona_channels,
      suenosDeseos: rawData.persona_desires,
      frustracionesDiarias: rawData.persona_daily_frustrations,
    },
    competencia: {
      competidores: rawData.competitors_list,
      quejasCompetencia: rawData.competitors_complaints,
      promesasFalsas: rawData.competitors_false_promise,
      preciosCompetencia: rawData.competitors_pricing,
      puntoDebil: rawData.competitors_slow_point,
      tonoCompetencia: rawData.competitors_tone,
      canalIgnorado: rawData.competitors_ignored_channel,
      ofertaEntrada: rawData.competitors_entry_offer,
      porQueCambiarse: rawData.why_switch_to_you,
      ventajaImposibleCopiar: rawData.uncopyable_advantage,
    },
    estrategiaComunicacional: {
      vacaPurpura: rawData.purple_cow,
      granPromesa: rawData.big_promise,
      villano: rawData.villain,
      garantiaAbsurda: rawData.absurd_guarantee,
      pruebaIrrefutable: rawData.irrefutable_proof,
      secretoInsider: rawData.insider_secret,
      tonoIdeal: rawData.ideal_tone,
      ofertaIrresistible: rawData.irresistible_offer,
      razonUrgencia: rawData.urgency_reason,
    },
  };

  const [{ data: kbBugsLegacy }, { data: kbKnowledgeLegacy }, { data: brandResearchLegacy }, { data: shopifyProductsLegacy }, { data: clientInfoLegacy }] = await Promise.all([
    supabase.from('steve_bugs').select('descripcion, ejemplo_malo, ejemplo_bueno').eq('categoria', 'meta_ads').eq('activo', true),
    supabase.from('steve_knowledge').select('titulo, contenido').in('categoria', ['meta_ads', 'anuncios']).eq('activo', true).order('orden', { ascending: false }).order('created_at', { ascending: false }).limit(20),
    supabase.from('brand_research').select('brand_name, industry, target_audience, value_proposition, brand_voice, competitor_analysis, product_details').eq('client_id', clientId).order('created_at', { ascending: false }).limit(1).single(),
    supabase.from('shopify_products').select('title, product_type, price, image_url').eq('client_id', clientId).limit(10),
    supabase.from('clients').select('name, company, shop_domain').eq('id', clientId).maybeSingle(),
  ]);
  const bugSectionLegacy = kbBugsLegacy && kbBugsLegacy.length > 0 ? `\nERRORES CRÍTICOS QUE DEBES EVITAR:\n${kbBugsLegacy.map((b: any) => `❌ ${b.descripcion}\nMAL: ${b.ejemplo_malo}\nBIEN: ${b.ejemplo_bueno}`).join('\n\n')}\n` : '';
  const knowledgeSectionLegacy = kbKnowledgeLegacy && kbKnowledgeLegacy.length > 0 ? `\nREGLAS APRENDIDAS (seguir obligatoriamente):\nSi hay conflicto entre reglas, priorizar las de orden más alto.\n${kbKnowledgeLegacy.map((k: any) => `- ${k.titulo}: ${k.contenido}`).join('\n')}\n` : '';

  const brandContextLegacy = brandResearchLegacy ? `
═══════════════════════════════════════════════════════════════════════════════
DATOS DE LA MARCA (brand_research)
═══════════════════════════════════════════════════════════════════════════════
- Marca: ${brandResearchLegacy.brand_name || 'N/A'}
- Industria: ${brandResearchLegacy.industry || 'N/A'}
- Audiencia objetivo: ${JSON.stringify(brandResearchLegacy.target_audience || 'N/A')}
- Propuesta de valor: ${JSON.stringify(brandResearchLegacy.value_proposition || 'N/A')}
- Voz de marca: ${JSON.stringify(brandResearchLegacy.brand_voice || 'N/A')}
- Detalles del producto: ${JSON.stringify(brandResearchLegacy.product_details || 'N/A')}
- Análisis competencia: ${JSON.stringify(brandResearchLegacy.competitor_analysis || 'N/A')}` : '';

  const shopifyContextLegacy = shopifyProductsLegacy && shopifyProductsLegacy.length > 0
    ? `
═══════════════════════════════════════════════════════════════════════════════
PRODUCTOS REALES DE LA TIENDA (Shopify) — USA ESTOS PRODUCTOS EN EL COPY
═══════════════════════════════════════════════════════════════════════════════
${shopifyProductsLegacy.map((p: any) => `- ${p.title} ($${Number(p.price).toLocaleString('es-CL')} CLP) — ${p.product_type || 'general'}`).join('\n')}`
    : '';

  const clientNameLegacy = clientInfoLegacy?.name || clientInfoLegacy?.company || '';
  const shopDomainLegacy = clientInfoLegacy?.shop_domain || '';
  const clientHeaderLegacy = clientNameLegacy ? `\nCLIENTE: ${clientNameLegacy}${shopDomainLegacy ? ` (${shopDomainLegacy})` : ''}` : '';

  const systemPrompt = bugSectionLegacy + knowledgeSectionLegacy + clientHeaderLegacy + buildSystemPrompt(briefContext, adType, funnelStage, customPrompt, shopifyContextLegacy, brandContextLegacy);

  console.log('Generating copy with Sabri + Russell methodology for:', { clientId, adType, funnelStage });

  const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Genera copies profesionales para un anuncio ${adType === 'static' ? 'estático' : 'de video'} de Meta Ads para la etapa ${funnelStage.toUpperCase()} del funnel.

CLIENTE: ${clientNameLegacy || 'N/A'}${shopDomainLegacy ? ` (${shopDomainLegacy})` : ''}
CONTEXTO DEL BUYER PERSONA: "${briefContext.buyerPersona.nombre || 'Cliente ideal'}"

REQUISITOS OBLIGATORIOS:
1. Aplica el framework HOOK → HISTORIA → OFERTA de Russell Brunson
2. Sigue los pasos correspondientes de los 17 de Sabri Suby
3. Usa las fórmulas de headlines según temperatura del tráfico
4. Incorpora las PALABRAS EXACTAS del buyer persona
5. Para ${funnelStage.toUpperCase()}: ${FUNNEL_CONTEXT[funnelStage].goal}
6. SOLO habla de los productos y la marca REALES del cliente — NUNCA inventes productos ni temas genéricos
7. Si hay productos de Shopify en el contexto, MENCIONA al menos uno por nombre en el copy

ELEMENTOS CLAVE DEL BRIEF A USAR:
- Dolor de las 3 AM: ${briefContext.personaProfunda.dolorDeLas3AM || 'No especificado'}
- Palabras exactas del cliente: ${briefContext.personaProfunda.palabrasExactas || 'No especificado'}
- Villano: ${briefContext.estrategiaComunicacional.villano || 'No especificado'}
- Gran promesa: ${briefContext.estrategiaComunicacional.granPromesa || 'No especificado'}
- Transformación soñada: ${briefContext.personaProfunda.transformacionSonada || 'No especificado'}

${learningContext}

RECORDATORIO FINAL: El copy DEBE ser 100% sobre los productos y marca del cliente. PROHIBIDO inventar productos o usar temas genéricos como plantas, mascotas, comida, etc. Si no corresponden al negocio real.

Genera copies que VENDAN siguiendo las metodologías combinadas y las preferencias aprendidas del cliente.`
        },
      ],
    }),
  });

  if (!aiResponse.ok) {
    if (aiResponse.status === 429) {
      return c.json({ error: 'Rate limits exceeded. Please try again later.' }, 429);
    }
    const errorText = await aiResponse.text();
    console.error('Anthropic API error:', aiResponse.status, errorText);
    return c.json({ error: `Anthropic API error (${aiResponse.status}): ${errorText.slice(0, 300)}` }, 500);
  }

  const aiData: any = await aiResponse.json();
  const content = aiData.content?.[0]?.text;

  if (!content) {
    console.error('[generate-meta-copy] No content in AI response');
    return c.json({ error: 'Error generando el copy. Intenta de nuevo.' }, 500);
  }

  let parsedContent;
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsedContent = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('No JSON found in response');
    }
  } catch (parseError) {
    console.error('[generate-meta-copy] Parse error:', parseError);
    console.log('[generate-meta-copy] Raw content:', content);
    return c.json({ error: 'Error procesando la respuesta. Intenta de nuevo.' }, 500);
  }

  console.log('Successfully generated copy with Sabri + Russell methodology');

  return c.json(parsedContent);
  } catch (err: any) {
    console.error('[generate-meta-copy]', err);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
}
