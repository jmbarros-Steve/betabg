# QA URGENTE: BUGS ENCONTRADOS EN PRODUCCIÓN

**Fecha:** 17 Marzo 2026
**Reportado por:** José Manuel (CEO)
**Estado:** TODOS estos bugs están en producción AHORA
**Instrucción:** Verificar CADA bug, documentar con screenshot, y crear task para el agente responsable.

---

# ═══════════════════════════════════════════
# MÓDULO 1: META ADS — 5 BUGS
# ═══════════════════════════════════════════

## META-BUG-01: Generación de fotos para anuncios NO funciona
**Severidad:** 🔴 CRITICAL
**Qué debería pasar:** El merchant pide a Steve que genere imágenes/creativos para sus anuncios de Meta. Steve genera imágenes profesionales con el producto y las deja listas para subir a Meta.
**Qué pasa:** No se generan las fotos. El flujo falla silenciosamente o da error.

```
VERIFICAR:
□ Ir a Meta Ads → Crear campaña → llegar al paso de creativos
□ Pedir a Steve que genere imágenes para un anuncio
□ ¿Aparece algún error? ¿Cuál? Screenshot del error
□ ¿Se queda cargando infinitamente?
□ ¿El botón de generar existe o no aparece?
□ Revisar consola del navegador (F12 → Console) → ¿hay errores rojos?
□ Revisar Network tab → ¿qué endpoint se llama? ¿Qué responde?
□ ¿El endpoint de generación de imágenes existe en Cloud Run?
□ ¿Tiene API key configurada? (OpenAI DALL-E / Fal.ai / lo que use)

REPRODUCIR:
1. Login como merchant de prueba (Jardín de Eva o Badim)
2. Meta Ads → Campañas → Crear nueva campaña
3. Llegar al paso de Creativos / Anuncios
4. Intentar generar imagen con IA
5. Documentar exactamente qué pasa
```

---

## META-BUG-02: Los copies siguen hablando de plantas muertas
**Severidad:** 🔴 CRITICAL
**Qué debería pasar:** Steve genera copies basados en los PRODUCTOS REALES del merchant y su BRAND BRIEF. Si el merchant vende ropa, Steve habla de ropa. Si vende cosméticos, Steve habla de cosméticos.
**Qué pasa:** Los copies generados mencionan "plantas muertas" que no tienen nada que ver con el negocio del merchant. Steve está usando contexto equivocado, datos hardcodeados, o el brand brief está contaminado.

```
VERIFICAR:
□ Abrir el Brand Brief del merchant de prueba → ¿qué dice? ¿Menciona plantas?
□ Revisar tabla brand_research en Supabase → ¿hay datos de "plantas muertas"?
□ Revisar tabla steve_knowledge → ¿hay entries con "plantas" que no corresponden?
□ Pedir a Steve que genere un copy para Meta → ¿menciona plantas?
□ Revisar el system prompt de generate-meta-copy → ¿tiene datos hardcodeados?
□ Revisar si el endpoint usa el client_id correcto para cargar productos
□ ¿Los productos de Shopify del merchant tienen algo de plantas?
□ ¿El brand brief se completó correctamente o tiene datos de prueba?

INVESTIGAR:
1. ¿Es un problema de contexto? (Steve carga datos del merchant equivocado)
2. ¿Es un problema de brand brief? (el brief tiene basura de testing)
3. ¿Es un problema de prompt? (hay ejemplos hardcodeados con plantas)
4. ¿Es un problema de knowledge base? (steve_knowledge tiene basura)

CÓMO ENCONTRAR LA CAUSA:
1. SELECT * FROM brand_research WHERE client_id = '[CLIENT_ID]';
   → ¿Tiene "plantas" en algún campo?
2. SELECT * FROM steve_knowledge WHERE client_id = '[CLIENT_ID]';
   → ¿Tiene entries con "plantas"?
3. Buscar en el código: grep -r "planta" ~/steve/src/
   → ¿Hay datos hardcodeados?
4. Revisar el último prompt que se mandó a Claude para generar el copy
   → ¿Qué contexto tenía?
```

---

## META-BUG-03: Las reglas automáticas — ¿son estándar o se ejecutan?
**Severidad:** 🟡 MAJOR
**Qué debería pasar:** Las reglas automáticas (ej: "pausar campaña si CPA > $5.000") deben hacer llamadas REALES a la Meta API para pausar/activar campañas.
**Qué pasa:** No está claro si las reglas realmente mandan la llamada a Meta o solo se guardan en Supabase sin ejecutar nada.

```
VERIFICAR:
□ Ir a Meta Ads → Reglas automáticas
□ ¿Hay reglas creadas?
□ Crear una regla de prueba: "Si CPA > $99.999 → pausar campaña"
   (umbral imposible para que no haga daño)
□ ¿La regla se guardó en Supabase? SELECT * FROM meta_rules WHERE client_id = '...'
□ ¿Hay un cron/scheduler que evalúa las reglas periódicamente?
□ Si la regla se activa, ¿qué endpoint llama?
□ ¿Ese endpoint hace POST a la Meta API? ¿O solo actualiza Supabase?
□ Revisar logs de Cloud Run → buscar calls a graph.facebook.com con "status=PAUSED"
□ ¿Las reglas tienen un campo "last_executed" o "execution_log"?
□ ¿Funcionan en producción o solo en modo mock/simulación?

TEST REAL (con cuidado):
1. Crear una campaña de prueba en Meta (budget mínimo $1 USD)
2. Crear regla: "Si spend > $0.01 → pausar"
3. Esperar a que la regla debería ejecutarse
4. ¿La campaña se pausó EN META REAL? (verificar en Meta Ads Manager)
5. Si no → las reglas son decoración, no funcionales
```

---

## META-BUG-04: Inteligencia de competencia NO funciona
**Severidad:** 🟡 MAJOR
**Qué debería pasar:** El módulo de competencia muestra anuncios de competidores desde la Facebook Ad Library. Steve analiza qué están haciendo y sugiere contra-estrategias.
**Qué pasa:** No funciona. No carga datos, da error, o muestra vacío.

```
VERIFICAR:
□ Ir a Meta Ads → Competencia (o Ads Library, o como se llame el módulo)
□ ¿La pantalla carga? ¿Muestra algo?
□ Si está vacío → ¿hay competidores configurados para el merchant?
□ Revisar tabla de competidores → ¿tiene entries?
□ ¿Hay un endpoint que scrape la Facebook Ad Library?
□ ¿Usa Apify? ¿Está configurado? ¿Tiene créditos?
□ ¿El endpoint de Ad Library responde o da error?
□ Revisar consola del navegador → errores
□ Revisar Network tab → ¿qué endpoint se llama? ¿Qué responde?

REPRODUCIR:
1. Login como merchant
2. Meta Ads → Competencia
3. Si pide agregar competidor → agregar uno (ej: una marca chilena conocida)
4. ¿Carga los anuncios del competidor?
5. Si no → documentar el error exacto
```

---

## META-BUG-05: Social Inbox NO funciona
**Severidad:** 🟡 MAJOR
**Qué debería pasar:** El Social Inbox muestra comentarios y mensajes de la página de Facebook e Instagram del merchant. Steve puede responder automáticamente.
**Qué pasa:** No funciona.

```
VERIFICAR:
□ ¿Existe la pantalla de Social Inbox? ¿Dónde está? (Meta Ads? Instagram? Sidebar?)
□ Si existe → ¿carga datos? ¿Muestra mensajes/comentarios?
□ Si está vacío → ¿hay webhooks configurados para recibir mensajes?
□ ¿El token de Meta tiene permisos de pages_manage_messages?
□ ¿Hay webhook de Facebook configurado para esta app?
□ ¿Instagram Messaging API está habilitado?
□ Revisar tabla de inbox → ¿hay entries?
□ ¿Nunca se implementó o se implementó y se rompió?

NOTA: Si Social Inbox nunca se implementó, eso NO es un bug — es una feature pendiente.
Documentar claramente si es bug (existía y se rompió) o feature (nunca se hizo).
```

---

# ═══════════════════════════════════════════
# MÓDULO 2: ESTRATEGIA / STEVE AI — 1 BUG
# ═══════════════════════════════════════════

## STEVE-BUG-01: Steve dice que vendió $50.000 en Shopify (dato malo)
**Severidad:** 🔴 CRITICAL
**Qué debería pasar:** Steve consulta las métricas REALES de Shopify (ventas, pedidos) y reporta datos correctos. Si el merchant vendió $890.000 → Steve dice $890.000.
**Qué pasa:** Steve dice que vendió $50.000 cuando probablemente no es así. Steve tiene datos incorrectos, desactualizados, o inventados.

```
VERIFICAR:
□ Preguntarle a Steve: "¿Cuánto vendí esta semana?"
□ ¿Qué número da? Screenshot de la respuesta
□ Abrir Shopify Admin → Analytics → ¿cuánto vendió realmente?
□ Comparar los dos números → ¿coinciden?
□ Revisar tabla shopify_orders en Supabase → ¿está actualizada?
□ Revisar sync de Shopify → ¿cuándo fue el último sync?
□ ¿El endpoint sync-shopify-metrics funciona? ¿Cuándo corrió por última vez?
□ ¿Steve está leyendo de shopify_orders o de otro lado?
□ ¿Steve inventa datos cuando no tiene información real?
□ Revisar el prompt de steve-chat → ¿tiene instrucción de NO inventar datos?

INVESTIGAR LA FUENTE DEL DATO:
1. SELECT SUM(total_price) FROM shopify_orders 
   WHERE client_id = '[CLIENT_ID]' 
   AND created_at > '2026-03-10';
   → ¿Qué da Supabase?

2. Shopify API directa:
   GET /admin/api/2026-01/orders.json?created_at_min=2026-03-10
   → ¿Qué da Shopify real?

3. Si Supabase ≠ Shopify → el sync está roto
4. Si Supabase = correcto pero Steve dice otra cosa → Steve lee mal los datos
5. Si Supabase está vacío → sync nunca corrió o falló

CRÍTICO: Steve NO debe inventar números. Si no tiene datos, debe decir
"No tengo datos actualizados de ventas. ¿Quieres que sincronice?"
```

---

# ═══════════════════════════════════════════
# MÓDULO 3: STEVE MAIL — 9 BUGS
# ═══════════════════════════════════════════

## MAIL-BUG-01: Emails generados no llevan productos, descuentos ni códigos reales
**Severidad:** 🔴 CRITICAL
**Qué debería pasar:** Cuando Steve genera un email, debe incluir productos REALES de Shopify (nombre, precio, foto, link), descuentos reales con código funcional, y contenido basado en la tienda real del merchant.
**Qué pasa:** Los emails generados tienen colores bonitos y usan el logo, pero NO incluyen productos reales, NO tienen descuentos funcionales, NO usan códigos de cupón de Shopify. Además mencionan "planta muerta" (mismo bug que en Meta copies).

```
VERIFICAR:
□ Ir a Steve Mail → Crear nuevo email
□ Pedir a Steve que genere un email promocional
□ ¿El email incluye productos reales del merchant? ¿Con foto, nombre y precio?
□ ¿O tiene productos genéricos / inventados / placeholder?
□ ¿El email tiene un código de descuento? ¿Es un código real creado en Shopify?
□ ¿O es un código inventado tipo "DISCOUNT20" que no existe en ningún lado?
□ ¿Los links de los productos van a la tienda real del merchant?
□ ¿O van a URLs genéricas / rotas / placeholder?
□ ¿Menciona "plantas muertas"? (mismo problema que META-BUG-02)
□ Revisar de dónde saca los productos → ¿shopify_products? ¿Están actualizados?
□ Revisar si el cupón se crea en Shopify via API o es texto plano inventado

LA PREGUNTA DEL CUPÓN:
□ Cuando Steve pone un código de descuento en el email:
  - ¿Steve lo crea en Shopify vía API? (price_rules + discount_codes)
  - ¿O solo pone texto "USA CÓDIGO: VERANO20" sin crearlo en Shopify?
  - ¿Qué tipo de cupón es? (porcentaje, monto fijo, envío gratis)
  - ¿Es un "Price Rule" de Shopify? ¿O es inventado y no va a funcionar?
  - Probar: ¿el código funciona si lo uso en el checkout de Shopify?
```

---

## MAIL-BUG-02: Editor drag & drop NO funciona — queda con HTML
**Severidad:** 🔴 CRITICAL
**Qué debería pasar:** El editor de emails tiene bloques que el merchant puede arrastrar, soltar, mover, y editar visualmente. Como Canva o Mailchimp.
**Qué pasa:** No se puede arrastrar nada. Los bloques no se mueven. El merchant ve HTML crudo en vez de un editor visual.

```
VERIFICAR:
□ Ir a Steve Mail → abrir un email (nuevo o existente)
□ ¿Se ve un editor visual con bloques? ¿O se ve código HTML?
□ Intentar arrastrar un bloque → ¿se mueve?
□ Intentar agregar un bloque nuevo → ¿funciona?
□ Intentar editar texto dentro de un bloque → ¿es editable?
□ Intentar cambiar una imagen → ¿funciona?
□ Intentar mover un bloque de posición → ¿se puede?
□ ¿El editor usa alguna librería? (GrapesJS, Unlayer, custom?)
□ Revisar consola del navegador → ¿hay errores de JavaScript?
□ ¿El componente del editor se renderiza o se rompe al cargar?
□ ¿Funciona en Chrome? ¿Safari? ¿Firefox?
```

---

## MAIL-BUG-03: Vista previa NO funciona
**Severidad:** 🔴 CRITICAL
**Qué debería pasar:** El merchant puede ver cómo se ve el email antes de enviarlo. Como lo vería el destinatario. Desktop y móvil.
**Qué pasa:** La vista previa no funciona. No muestra nada, o muestra HTML crudo, o no se abre.

```
VERIFICAR:
□ ¿Hay botón de "Vista previa" o "Preview"?
□ Si existe → click → ¿qué pasa?
□ ¿Se abre un modal? ¿Una nueva pestaña? ¿Nada?
□ Si se abre → ¿muestra el email renderizado o HTML crudo?
□ ¿Hay toggle desktop/móvil?
□ Revisar consola → errores
□ ¿El endpoint que genera el preview existe? ¿Responde?
```

---

## MAIL-BUG-04: No hay plantillas
**Severidad:** 🟡 MAJOR
**Qué debería pasar:** El merchant puede elegir entre plantillas pre-diseñadas: "Promoción", "Nuevo producto", "Newsletter", "Carrito abandonado", etc. Cada plantilla tiene un diseño profesional listo.
**Qué pasa:** No hay plantillas. El merchant empieza de cero siempre.

```
VERIFICAR:
□ ¿Hay sección de "Plantillas" o "Templates" en Steve Mail?
□ Si existe → ¿tiene plantillas? ¿Cuántas?
□ Si no existe → ¿nunca se implementó?
□ Revisar tabla email_templates → ¿hay entries con is_template = true?
□ ¿El diseño del frontend tiene espacio para plantillas?

NOTA: Si nunca se implementó, es feature pendiente, no bug.
Pero para el merchant es un bloqueante — necesita algo de dónde partir.
```

---

## MAIL-BUG-05: Botón "Bloques" arriba a la derecha no funciona
**Severidad:** 🟡 MAJOR
**Qué debería pasar:** Al hacer click en "Bloques", se abre un panel con bloques disponibles para agregar al email: texto, imagen, botón, producto, separador, etc.
**Qué pasa:** Se ve el botón "Bloques" pero al hacer click no pasa nada. No se puede agregar bloques al email.

```
VERIFICAR:
□ Ubicar el botón "Bloques" arriba a la derecha del editor
□ Click → ¿qué pasa?
□ ¿Se abre un panel lateral? ¿Un dropdown? ¿Nada?
□ ¿El click registra en consola algún evento?
□ ¿Hay un componente React que debería renderizar?
□ Revisar si es un bug de CSS (panel se abre pero está oculto/detrás)
□ Revisar z-index, display, visibility del panel de bloques
```

---

## MAIL-BUG-06: No se pueden elegir productos dinámicos
**Severidad:** 🔴 CRITICAL
**Qué debería pasar:** El merchant puede insertar un bloque de "Producto" en el email y elegir productos de su tienda Shopify. El producto se muestra con foto, nombre, precio y link.
**Qué pasa:** Cuando intenta poner productos, no puede elegir productos dinámicos de Shopify. No aparece un selector de productos.

```
VERIFICAR:
□ En el editor de email → intentar agregar bloque de "Producto"
□ ¿Aparece un picker/selector de productos?
□ Si aparece → ¿carga los productos de Shopify? ¿O está vacío?
□ Si no aparece → ¿el bloque de producto existe como opción?
□ ¿Los productos de Shopify están sincronizados en Supabase?
□ SELECT COUNT(*) FROM shopify_products WHERE client_id = '[CLIENT_ID]';
□ ¿El endpoint que busca productos responde? ¿Con datos?
□ ¿El componente ProductPicker está implementado?
□ ¿Hay diferencia entre producto "estático" (texto fijo) y "dinámico" (desde Shopify)?
```

---

## MAIL-BUG-07: Dice que Klaviyo insertará por ellos — PERO NO USAMOS KLAVIYO
**Severidad:** 🔴 CRITICAL
**Qué debería pasar:** Steve Mail envía emails por Resend. Klaviyo NO se usa para envíos. El merchant no debería ver ninguna referencia a Klaviyo en el flujo de emails.
**Qué pasa:** En algún punto del flujo, Steve Mail dice que "Klaviyo insertará los productos" o algo similar. Esto es INCORRECTO — no usamos Klaviyo para emails. Los emails se envían por Resend.

```
VERIFICAR:
□ ¿Dónde exactamente aparece la mención de Klaviyo? Screenshot
□ ¿Es en el editor? ¿En el flujo de envío? ¿En un tooltip?
□ ¿Es texto hardcodeado en el frontend?
□ ¿O viene del backend / prompt de Steve?
□ Buscar en el código: grep -r "klaviyo" ~/steve/src/components/email/
□ Buscar en el código: grep -r "Klaviyo" ~/steve/src/components/stevemail/
□ ¿Hay lógica que todavía intente conectar con Klaviyo para emails?
□ ¿El endpoint de envío usa Resend o intenta usar Klaviyo?

RECORDATORIO PARA TODOS:
  Steve Mail envía por RESEND, no por Klaviyo.
  Klaviyo no se usa para emails actualmente.
  TODA referencia a Klaviyo en el módulo de email es un BUG.
  Buscar y eliminar cada mención de Klaviyo en el módulo de Steve Mail.
```

---

## MAIL-BUG-08: ¿El cupón se crea en Shopify? ¿Qué tipo es?
**Severidad:** 🟡 MAJOR (depende de si los cupones funcionan o no)
**Qué debería pasar:** Cuando Steve genera un email con cupón de descuento, debe CREAR el cupón en Shopify vía API (price_rules + discount_codes) para que funcione cuando el cliente lo use en checkout.
**Qué pasa:** No está claro si el cupón se crea realmente en Shopify o es solo texto decorativo.

```
VERIFICAR:
□ Generar un email con cupón de descuento
□ ¿Qué código de cupón aparece en el email?
□ Ir a Shopify Admin → Discounts → ¿existe ese código?
□ Si NO existe → el cupón es inventado y NO VA A FUNCIONAR cuando un cliente lo use
□ Si SÍ existe → ¿qué tipo es? (porcentaje, monto fijo, envío gratis)
□ ¿Steve llama a create-shopify-discount cuando genera el email?
□ Revisar el endpoint generate-mass-campaigns → ¿crea descuento vía API?
□ ¿El cupón tiene fecha de expiración?
□ ¿Tiene límite de usos?
□ Probar: ir a la tienda del merchant → checkout → ingresar el código → ¿funciona?

DECISIÓN NECESARIA:
  Si Steve genera cupones, TIENE que crearlos en Shopify vía API.
  Un cupón que no existe en Shopify = cliente frustrado = merchant enojado.
  Si no se puede crear automáticamente, Steve debe decir
  "Crea este cupón en tu Shopify: VERANO20 → 20% descuento"
```

---

## MAIL-BUG-09: Vista previa no funciona (duplicado de MAIL-BUG-03)
**Severidad:** 🔴 CRITICAL
**Nota:** José Manuel mencionó esto dos veces. Confirma que es un dolor grande.
**Acción:** Mismo que MAIL-BUG-03. Priorizar fix.

---

# ═══════════════════════════════════════════
# CÓMO HACER ESTE QA
# ═══════════════════════════════════════════

## Setup

```
REQUISITOS:
- Acceso a Steve Ads en producción (app.steveads.com o localhost)
- Cuenta de merchant de prueba con:
  - Shopify conectado (con productos reales)
  - Meta conectado (con ad account real o sandbox)
  - Brand Brief completado
- Acceso a Supabase (para verificar datos)
- Acceso a Shopify Admin del merchant de prueba
- Chrome con DevTools (F12)
```

## Proceso por cada bug

```
PARA CADA BUG:

1. REPRODUCIR
   - Seguir los pasos exactos de la sección "VERIFICAR"
   - NO asumir que funciona. Click en cada botón.
   - Si dice "funciona" tiene que funcionar DE VERDAD (datos reales, no mock)

2. DOCUMENTAR
   - Screenshot de lo que se ve (el bug)
   - Screenshot de la consola (errores JS)
   - Screenshot del Network tab (requests fallidos)
   - URL exacta donde ocurre
   - Query de Supabase si aplica

3. CLASIFICAR
   - ¿Es un bug de FRONTEND? (se renderiza mal, botón no funciona)
   - ¿Es un bug de BACKEND? (endpoint falla, datos incorrectos)
   - ¿Es un bug de DATOS? (Supabase tiene basura, sync roto)
   - ¿Es un bug de PROMPT? (Steve genera contenido incorrecto)
   - ¿Es una FEATURE que nunca se implementó?

4. ASIGNAR
   - Frontend → Camila (W4)
   - Backend Meta → Valentina (W1)
   - Backend Mail → Valentín (W18) o quien lleve Steve Mail
   - Steve AI / Prompts → Paula (W19)
   - Shopify sync → Matías (W13)
   - Infra / endpoints → Sebastián (W5)

5. PRIORIZAR
   - 🔴 CRITICAL: el merchant ve datos incorrectos o no puede hacer su trabajo
   - 🟡 MAJOR: funcionalidad rota pero hay workaround
   - 🟢 MINOR: cosmético o edge case
```

## Orden de ejecución

```
DÍA 1 — Primero los CRITICAL (bloquean al merchant):
  □ MAIL-BUG-02: Editor drag & drop no funciona
  □ MAIL-BUG-07: Quitar toda mención de Klaviyo de Steve Mail
  □ META-BUG-02 + MAIL-BUG-01: "Plantas muertas" (mismo root cause)
  □ STEVE-BUG-01: Steve inventa datos de ventas
  □ MAIL-BUG-06: Productos dinámicos no funcionan

DÍA 2 — Los que afectan flujo completo:
  □ META-BUG-01: Generación de fotos para anuncios
  □ MAIL-BUG-03/09: Vista previa de emails
  □ MAIL-BUG-05: Botón Bloques no funciona
  □ MAIL-BUG-08: Verificar si cupones se crean en Shopify

DÍA 3 — Los MAJOR:
  □ META-BUG-03: Reglas automáticas ¿se ejecutan?
  □ META-BUG-04: Competencia / Ad Library
  □ META-BUG-05: Social Inbox
  □ MAIL-BUG-04: Plantillas de email
```

---

# ═══════════════════════════════════════════
# PLANTILLA DE REPORTE POR BUG
# ═══════════════════════════════════════════

```
Copiar y pegar esta plantilla para cada bug:

## [BUG-ID]: [Título]
**Estado:** ✅ Verificado / ❌ No reproducible / 🔄 Parcial
**Tipo:** Frontend / Backend / Datos / Prompt / No implementado
**Agente responsable:** [nombre]

**Pasos para reproducir:**
1. ...
2. ...
3. ...

**Resultado esperado:**
...

**Resultado actual:**
...

**Screenshots:**
- [screenshot del bug]
- [screenshot de la consola]
- [screenshot del network tab]

**Root cause (si se identificó):**
...

**Fix propuesto:**
...
```

---

# ═══════════════════════════════════════════
# HIPÓTESIS DE ROOT CAUSE: "PLANTAS MUERTAS"
# ═══════════════════════════════════════════

El bug de "plantas muertas" aparece en META (copies) y MAIL (emails).
Esto sugiere un root cause COMÚN. Candidatos:

```
1. BRAND BRIEF CONTAMINADO
   El brand brief del merchant de prueba tiene datos de testing con "plantas"
   → Steve usa esos datos para todo
   → Fix: limpiar brand_research del merchant

2. STEVE_KNOWLEDGE CONTAMINADO
   La tabla steve_knowledge tiene entries de testing con "plantas"
   → Steve lo usa como contexto
   → Fix: DELETE FROM steve_knowledge WHERE content LIKE '%planta%'

3. PROMPTS CON EJEMPLOS HARDCODEADOS
   Los prompts de Steve tienen ejemplos con "plantas" como placeholder
   → "Ejemplo: Hola! Tenemos plantas hermosas para tu hogar"
   → Steve lo copia en vez de generar contenido original
   → Fix: revisar TODOS los prompts y quitar ejemplos

4. SHOPIFY PRODUCTS MAL SINCRONIZADOS
   Los productos de Shopify en Supabase son de otro merchant (uno de plantas)
   → Steve carga productos equivocados
   → Fix: verificar que shopify_products tiene el client_id correcto

BUSCAR:
  grep -r "planta" ~/steve/src/
  grep -r "planta" ~/steve/supabase/functions/
  SELECT * FROM brand_research WHERE content::text LIKE '%planta%';
  SELECT * FROM steve_knowledge WHERE content LIKE '%planta%';
  SELECT * FROM shopify_products WHERE title LIKE '%planta%';
```
