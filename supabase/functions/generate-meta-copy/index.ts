import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

// =============================================================================
// METODOLOGÍA COMBINADA: SABRI SUBY + RUSSELL BRUNSON
// =============================================================================

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

Este es el framework base de TODO mensaje de marketing:

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

1. VALOR PERCIBIDO ALTÍSIMO:
   - Muestra cuánto cuesta en verdad cada cosa
   - Cliente recibe más de lo que paga
   - Oportunidad única e irrepetible

2. GARANTÍA SÓLIDA:
   - 100% devolución, sin preguntas
   - Eliminar TODO el riesgo financiero
   - Debe ser "absurda" para eliminar el miedo
   - Dale un nombre a tu garantía

3. BONOS ATRACTIVOS:
   - Productos/servicios adicionales sin costo
   - Algo que van a ganar EXTRA
   - Que te cueste poco pero valga mucho para ellos

4. ESCASEZ/URGENCIA REAL:
   - Tiempo limitado
   - Cupos limitados
   - Stock limitado
   - DEBE SER REAL - no fake

5. RESULTADOS CLAROS:
   - Promesas específicas y medibles
   - Timeframe claro
   - "En X días lograrás Y"

6. DECISIÓN SIMPLE:
   - Un clic, sin confusión
   - No los pierdas con muchas opciones
   - Proceso de compra rápido

7. BENEFICIOS EMOCIONALES:
   - La gente compra con emociones
   - Justifica con lógica después
   - Pinta el cuadro de la transformación

═══════════════════════════════════════════════════════════════════════════════
PARTE 10: LOS 17 PASOS DE SABRI PARA COPY
═══════════════════════════════════════════════════════════════════════════════

1. LLAMA A TU AUDIENCIA en el principio
   "¿Eres [tipo de persona] que [situación]?"

2. DEMANDA ATENCIÓN con Headline potente
   80% de la efectividad está aquí

3. BACK UP de tu promesa
   Credibilidad inmediata

4. CREA INTRIGA con bullet points
   Genera curiosidad (el incentivo más grande)

5. HAZLOS VIVIR SU PROBLEMA
   Usa sus palabras exactas, describe el dolor

6. DALES LA SOLUCIÓN
   Tu producto como el antídoto

7. MUESTRA TUS CREDENCIALES
   Por qué TÚ puedes ayudarlos

8. DETALLA LOS BENEFICIOS
   Emocionales primero, lógicos después

9. CREA PRUEBA SOCIAL
   Testimonios irrefutables, antes/después

10. MUESTRA LA OFERTA DEL PADRINO
    Tan buena que sería tonto rechazarla

11. MÉTELE BONOS
    Valor adicional sin costo

12. MUESTRA CUÁNTO CUESTA EN REALIDAD
    El valor total de todo

13. MUESTRA EL PRECIO
    Compáralo con algo trivial

14. METE PREMURA
    Descuento temporal, stock limitado

15. GARANTÍA PROFUNDA
    Elimina todo el riesgo

16. LLAMADO A LA ACCIÓN
    Claro y directo

17. RECORDATORIO SI NO COMPRA
    El dolor que seguirá, lo que pierde

═══════════════════════════════════════════════════════════════════════════════
PARTE 11: ESTRUCTURA STAR-STORY-SOLUTION (Russell Brunson)
═══════════════════════════════════════════════════════════════════════════════

⭐ STAR (La Estrella):
- El personaje atractivo
- Saca su atención con curiosidad en el hook
- Muestra que eres como ellos

📖 STORY (La Historia):
- "Te voy a mostrar cómo hemos logrado esto"
- Mucho drama - tristeza, pasiones
- Cómo llegaste al punto más bajo
- El problema que tuviste ES EL MISMO que el de ellos
- Genera empatía total

💡 SOLUTION (La Solución):
- Cuéntales que no es su culpa
- El package de lo que pueden comprar
- "Cuesta tanto pero vale tanto"
- Beneficios vs el resto
- Pruebas sociales
- La oferta debe ser 10X más grande que el precio
- "No voy a cobrarte 10, sino 1, y te doy garantía"
- "Pero se acaba este mes"
- "En X tiempo vas a lograr Y"

═══════════════════════════════════════════════════════════════════════════════
PARTE 12: FÓRMULAS DE HEADLINES Y HOOKS
═══════════════════════════════════════════════════════════════════════════════

HEADLINES QUE GENERAN CURIOSIDAD:
- "Imagínate en 30 días..."
- "Esto no lo saben..."
- "Un dolor que quieren eliminar"
- "[X] maneras de [resultado] que nadie te ha contado"
- "La verdad sobre [tema controversial]"
- "Lo que [expertos] no quieren que sepas"

FÓRMULAS PARA BULLETS:
- "Cómo [lograr X] con [método Y]"
- "¿Necesitas [resultado]? Estás equivocado sobre [creencia]"
- "[X] lugares donde encontrar [Y]"
- "Cómo eliminar [dolor] sin [sacrificio]"
- "Nunca deberías [error común]"
- "Dile adiós a [problema]"

LAS 4 PREGUNTAS (Para tráfico frío):
1. ¿Quién eres? → "Hola, soy..."
2. ¿Qué haces? → "El servicio es..."
3. ¿Por qué? → "Porque necesitan esto, tienen este dolor..."
4. ¿Cómo? → "Pueden acceder a esta oferta así..."

BONUS:
- El catch: "¿Por qué soy tan bueno contigo? La verdad es..."
- Urgencia: "Pero esto tiene un timing..."
- Cancelación: "Y si no te gusta, puedes cancelar..."

═══════════════════════════════════════════════════════════════════════════════
PARTE 13: SCRIPTS ESPECÍFICOS
═══════════════════════════════════════════════════════════════════════════════

SCRIPT PARA UPSELL (OTO):
1. Confirmar que la compra anterior les gustó
2. NO cerrar la venta, no despedirte
3. "Pero espera, hay algo más..."
4. Producto con descuento especial
5. Enfocarse en UN solo producto adicional
6. Imaginarlo CON el producto y el valor
7. Usar "gratis" la mayor cantidad de veces
8. Botón de acción claro
9. Llamada a la atención final

SCRIPT PARA WEBINAR/VIDEO LARGO:
1. Introducción: Hook rápido, promesa gigante
2. Diles que no se desconcentren
3. Por qué TÚ debes hablar de esto
4. Contenido: NO enseñes todo, solo el sistema
5. Los vehículos para solucionar (tu producto)
6. Oferta: Transición suave al cierre
7. Bullet points de lo que incluye
8. Precio ALTO primero, luego precio real
9. Por qué vale la pena (todo lo que ganan)

═══════════════════════════════════════════════════════════════════════════════
PARTE 14: PRINCIPIOS DE PERSUASIÓN COMBINADOS
═══════════════════════════════════════════════════════════════════════════════

1. PROBLEMA → SOLUCIÓN → RESULTADO
   Esta es la estructura base de todo mensaje

2. EMOCIONES PRIMERO, LÓGICA DESPUÉS
   La gente compra con el corazón, justifica con la cabeza

3. ESPECÍFICO > GENÉRICO
   "Pierde 5 kilos en 30 días" > "Pierde peso rápido"

4. USA LAS PALABRAS DEL CLIENTE
   Las mismas frases que usa para describir su problema

5. TODO TIENE UN VILLANO
   La ineficiencia, el sistema, los "expertos", la industria

6. PINTA LA TRANSFORMACIÓN
   Cómo cambia su vida después de usarte

7. LA OFERTA ES LA PUNTA DE ESPADA
   Si no tienes buena oferta, nada importa

8. HAZ QUE SIENTAN QUE SERÍAN TONTOS SI DICEN NO
   Esa es la prueba de una oferta irresistible

═══════════════════════════════════════════════════════════════════════════════
PARTE 15: ANATOMÍA DE UN BUEN ANUNCIO DE META
═══════════════════════════════════════════════════════════════════════════════

PARA ESTÁTICOS:
- Imagen: Debe parecer contenido NORMAL, no publicidad
- Headline Link: 12-18 palabras (60-100 caracteres)
- Testar texto largo vs corto
- Simple y un llamado a la atención
- Pocos botones

PARA VIDEO:
- Los primeros 3 segundos son TODO (el Hook)
- Debe parecer contenido orgánico
- El hook genera pregunta en la mente
- Contenido > Calidad de producción
- Usa ángulo de noticias cuando puedas

HOOKS PARA VIDEO:
- Pregunta impactante
- Estadística sorprendente
- Controversia
- Dolor específico
- Beneficio inmediato
- "Lo que acaban de descubrir sobre..."
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
- Opciones de pago si aplica
- Stack completo de lo que incluye
- Que se sientan TONTOS si dicen no
`,
  },
};

const buildSystemPrompt = (briefData: any, adType: string, funnelStage: keyof typeof FUNNEL_CONTEXT, customPrompt?: string) => {
  const funnel = FUNNEL_CONTEXT[funnelStage];
  
  return `Eres un copywriter EXPERTO en Meta Ads entrenado en las metodologías combinadas de:
- Sabri Suby (Sell Like Crazy / 1PMP)
- Russell Brunson (DotCom Secrets / Expert Secrets / Traffic Secrets)

${COMBINED_METHODOLOGY}

═══════════════════════════════════════════════════════════════════════════════
BRIEF DE MARCA DEL CLIENTE
═══════════════════════════════════════════════════════════════════════════════
${JSON.stringify(briefData, null, 2)}

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
  "script": "Guión usando Star-Story-Solution de Russell:\\n\\n[0-3s] HOOK/STAR: (gancho que detiene el scroll, presenta al personaje)\\n[3-10s] PROBLEMA: (hazlos vivir el dolor)\\n[10-25s] STORY: (la historia, el drama, la empatía)\\n[25-40s] SOLUTION: (tu propuesta como antídoto)\\n[40-50s] PRUEBA: (testimonios, resultados)\\n[50-60s] OFERTA/CTA: (qué hacer ahora, urgencia)\\n\\nIncluye indicaciones visuales."` : ''}
}

IMPORTANTE:
- USA el tono definido en el brief
- INCORPORA las palabras EXACTAS del buyer persona
- APLICA Hook-Historia-Oferta en todo
- SIGUE las fórmulas de headlines según temperatura
- Para ${funnelStage.toUpperCase()}: ${funnel.goal}
- Responde SOLO con JSON, sin texto adicional`;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { clientId, adType, funnelStage, customPrompt, angulo, assetUrls, variacionElegida, mode } = await req.json() as GenerateRequest;

    if (!clientId || !adType || !funnelStage) {
      throw new Error('Missing required parameters');
    }

    // ── VARIACIONES MODE ──────────────────────────────────────────────────────
    if (mode === 'variaciones') {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
      if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured');
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: briefData } = await supabase
        .from('buyer_personas').select('*').eq('client_id', clientId).eq('is_complete', true)
        .order('created_at', { ascending: false }).limit(1).single();

      const rawData = briefData?.persona_data || briefData?.raw_data || {};

      const categoriaVar = 'meta_ads';
      const [{ data: kbBugsVar }, { data: kbKnowledgeVar }] = await Promise.all([
        supabase.from('steve_bugs').select('descripcion, ejemplo_malo, ejemplo_bueno').eq('categoria', categoriaVar).eq('activo', true),
        supabase.from('steve_knowledge').select('titulo, contenido').in('categoria', ['meta_ads', 'anuncios']).eq('activo', true).order('orden', { ascending: false }).order('created_at', { ascending: false }).limit(20),
      ]);
      const bugSectionVar = kbBugsVar && kbBugsVar.length > 0 ? `\nERRORES CRÍTICOS QUE DEBES EVITAR:\n${kbBugsVar.map((b: any) => `❌ ${b.descripcion}\nMAL: ${b.ejemplo_malo}\nBIEN: ${b.ejemplo_bueno}`).join('\n\n')}\n` : '';
      const knowledgeSectionVar = kbKnowledgeVar && kbKnowledgeVar.length > 0 ? `\nREGLAS APRENDIDAS DE CREATIVOS (seguir obligatoriamente):\nSi hay conflicto entre reglas, priorizar las de orden más alto (más recientes).\n${kbKnowledgeVar.map((k: any) => `- ${k.titulo}: ${k.contenido}`).join('\n')}\n` : '';

      const prompt = `${bugSectionVar}${knowledgeSectionVar}Eres un experto en copywriting de performance marketing con metodología Sabri Suby + Russell Brunson.

DATOS DEL CLIENTE:
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
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!aiResp.ok) {
        const errText = await aiResp.text();
        console.error('Anthropic API error (variaciones):', aiResp.status, errText);
        return new Response(JSON.stringify({ error: `Anthropic API error (${aiResp.status}): ${errText.slice(0, 300)}` }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const aiData = await aiResp.json();
      const raw = aiData.content?.[0]?.text || '';
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(raw);
      return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── BRIEF VISUAL MODE ─────────────────────────────────────────────────────
    if (mode === 'brief_visual') {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
      if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured');
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: briefData } = await supabase
        .from('buyer_personas').select('*').eq('client_id', clientId).eq('is_complete', true)
        .order('created_at', { ascending: false }).limit(1).single();

      const rawData = briefData?.persona_data || briefData?.raw_data || {};

      const categoriaBV = 'anuncios';
      const [{ data: kbBugsBV }, { data: kbKnowledgeBV }] = await Promise.all([
        supabase.from('steve_bugs').select('descripcion, ejemplo_malo, ejemplo_bueno').eq('categoria', categoriaBV).eq('activo', true),
        supabase.from('steve_knowledge').select('titulo, contenido').in('categoria', ['anuncios', 'meta_ads']).eq('activo', true).order('orden', { ascending: false }).order('created_at', { ascending: false }).limit(15),
      ]);
      const bugSectionBV = kbBugsBV && kbBugsBV.length > 0 ? `\nERRORES CRÍTICOS QUE DEBES EVITAR:\n${kbBugsBV.map((b: any) => `❌ ${b.descripcion}\nMAL: ${b.ejemplo_malo}\nBIEN: ${b.ejemplo_bueno}`).join('\n\n')}\n` : '';
      const knowledgeSectionBV = kbKnowledgeBV && kbKnowledgeBV.length > 0 ? `\nREGLAS APRENDIDAS DE CREATIVOS (seguir obligatoriamente):\n${kbKnowledgeBV.map((k: any) => `- ${k.titulo}: ${k.contenido}`).join('\n')}\n` : '';

      const prompt = `${bugSectionBV}${knowledgeSectionBV}Basándote en el copy aprobado y las fotos reales del producto, genera el brief visual para producción.

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
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!aiResp.ok) {
        const errText = await aiResp.text();
        console.error('Anthropic API error (brief_visual):', aiResp.status, errText);
        return new Response(JSON.stringify({ error: `Anthropic API error (${aiResp.status}): ${errText.slice(0, 300)}` }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const aiData = await aiResp.json();
      const raw = aiData.content?.[0]?.text || '';
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(raw);
      return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── LEGACY MODE (existing behaviour) ──────────────────────────────────────

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch the completed brand brief
    const { data: briefData, error: briefError } = await supabase
      .from('buyer_personas')
      .select('*')
      .eq('client_id', clientId)
      .eq('is_complete', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (briefError || !briefData) {
      console.error('Brief error:', briefError);
      throw new Error('No completed brand brief found. Please complete the brief with Steve first.');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEVE'S LEARNING ENGINE: Dual-layer learning from ALL clients + this client
    // ═══════════════════════════════════════════════════════════════════════════

    // 1. GLOBAL LEARNING: Patterns from ALL clients
    const { data: globalFeedback } = await supabase
      .from('steve_feedback')
      .select('rating, feedback_text, content_type')
      .eq('content_type', 'meta_copy')
      .order('created_at', { ascending: false })
      .limit(50);

    // 2. CLIENT-SPECIFIC LEARNING: This client's preferences
    const { data: clientFeedback } = await supabase
      .from('steve_feedback')
      .select('rating, feedback_text, content_type, improvement_notes')
      .eq('client_id', clientId)
      .eq('content_type', 'meta_copy')
      .order('created_at', { ascending: false })
      .limit(10);

    // Build Steve's learning context
    let learningContext = '';
    
    // Global patterns analysis
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

    // Client-specific preferences (override global when conflict)
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

    // Extract the answers from raw_data
    const rawData = briefData.raw_data || {};
    const executiveSummary = briefData.executive_summary || '';

    // Build comprehensive brief context
    const briefContext = {
      // Raw answers from the questionnaire
      respuestasCompletas: rawData,
      
      // Executive summary from Steve
      resumenEjecutivo: executiveSummary,
      
      // Structured persona data
      buyerPersona: {
        nombre: briefData.name,
        rangoEdad: briefData.age_range,
        genero: briefData.gender,
        ubicacion: briefData.location,
        ocupacion: briefData.occupation,
      },
      
      // Key psychological drivers
      psicografia: {
        doloresPrincipales: briefData.main_pains,
        deseosPrincipales: briefData.main_desires,
        miedosPrincipales: briefData.main_fears,
        objecionesPrincipales: briefData.main_objections,
      },
      
      // Business info
      negocio: {
        tipoNegocio: rawData.business_type,
        ticketPromedio: rawData.average_ticket,
        margenes: rawData.margins,
        canalesVenta: rawData.sales_channels,
      },
      
      // Deep persona insights
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
      
      // Competitive analysis
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
      
      // Communication strategy (for Hook-Story-Offer)
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

    const categoriaLegacy = 'meta_ads';
    const [{ data: kbBugsLegacy }, { data: kbKnowledgeLegacy }] = await Promise.all([
      supabase.from('steve_bugs').select('descripcion, ejemplo_malo, ejemplo_bueno').eq('categoria', categoriaLegacy).eq('activo', true),
      supabase.from('steve_knowledge').select('titulo, contenido').in('categoria', ['meta_ads', 'anuncios']).eq('activo', true).order('orden', { ascending: false }).order('created_at', { ascending: false }).limit(20),
    ]);
    const bugSectionLegacy = kbBugsLegacy && kbBugsLegacy.length > 0 ? `\nERRORES CRÍTICOS QUE DEBES EVITAR:\n${kbBugsLegacy.map((b: any) => `❌ ${b.descripcion}\nMAL: ${b.ejemplo_malo}\nBIEN: ${b.ejemplo_bueno}`).join('\n\n')}\n` : '';
    const knowledgeSectionLegacy = kbKnowledgeLegacy && kbKnowledgeLegacy.length > 0 ? `\nREGLAS APRENDIDAS (seguir obligatoriamente):\nSi hay conflicto entre reglas, priorizar las de orden más alto.\n${kbKnowledgeLegacy.map((k: any) => `- ${k.titulo}: ${k.contenido}`).join('\n')}\n` : '';

    const systemPrompt = bugSectionLegacy + knowledgeSectionLegacy + buildSystemPrompt(briefContext, adType, funnelStage, customPrompt);

    console.log('Generating copy with Sabri + Russell methodology for:', { clientId, adType, funnelStage });

    // Call Anthropic API directly
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

CONTEXTO DEL BUYER PERSONA: "${briefContext.buyerPersona.nombre || 'Cliente ideal'}"

REQUISITOS OBLIGATORIOS:
1. Aplica el framework HOOK → HISTORIA → OFERTA de Russell Brunson
2. Sigue los pasos correspondientes de los 17 de Sabri Suby
3. Usa las fórmulas de headlines según temperatura del tráfico
4. Incorpora las PALABRAS EXACTAS del buyer persona
5. Para ${funnelStage.toUpperCase()}: ${FUNNEL_CONTEXT[funnelStage].goal}

ELEMENTOS CLAVE DEL BRIEF A USAR:
- Dolor de las 3 AM: ${briefContext.personaProfunda.dolorDeLas3AM || 'No especificado'}
- Palabras exactas del cliente: ${briefContext.personaProfunda.palabrasExactas || 'No especificado'}
- Villano: ${briefContext.estrategiaComunicacional.villano || 'No especificado'}
- Gran promesa: ${briefContext.estrategiaComunicacional.granPromesa || 'No especificado'}
- Transformación soñada: ${briefContext.personaProfunda.transformacionSonada || 'No especificado'}

${learningContext}

Genera copies que VENDAN siguiendo las metodologías combinadas y las preferencias aprendidas del cliente.`
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limits exceeded. Please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await aiResponse.text();
      console.error('Anthropic API error:', aiResponse.status, errorText);
      return new Response(JSON.stringify({ error: `Anthropic API error (${aiResponse.status}): ${errorText.slice(0, 300)}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResponse.json();
    const content = aiData.content?.[0]?.text;

    if (!content) {
      throw new Error('No content in AI response');
    }

    // Parse the JSON response
    let parsedContent;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedContent = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Parse error:', parseError);
      console.log('Raw content:', content);
      throw new Error('Failed to parse AI response');
    }

    console.log('Successfully generated copy with Sabri + Russell methodology');

    return new Response(JSON.stringify(parsedContent), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-meta-copy:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
