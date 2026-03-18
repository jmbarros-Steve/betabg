# QA COMPLETO PUNTA A PUNTA — STEVE ADS

**Fecha:** 17 Marzo 2026
**Objetivo:** Testear TODA la plataforma como si fueras un merchant real que acaba de llegar. Desde el primer click hasta que vende.
**Regla:** Si no puedes marcar el checkbox, es un bug. Sin excepciones.
**Merchant de prueba:** Usar Jardín de Eva, Comercial Badim, o crear uno nuevo.

---

# ═══════════════════════════════════════════
# FASE 0: ANTES DE EMPEZAR
# ═══════════════════════════════════════════

```
□ Abrir Chrome en modo incógnito (sin cache, sin sesiones viejas)
□ Abrir DevTools (F12) → Console abierta → Network abierta
□ Tener a mano:
  - Acceso a Supabase (para verificar datos)
  - Acceso a Shopify Admin del merchant de prueba
  - Acceso a Meta Business Manager de prueba
  - Un celular para probar mobile
  - Este documento abierto en otra pestaña
```

---

# ═══════════════════════════════════════════
# FASE 1: AUTH Y ONBOARDING
# ═══════════════════════════════════════════

## 1A. Registro / Login

```
□ Ir a steve.cl
□ ¿La página carga? ¿En cuántos segundos? (>5s = problema)
□ ¿Se ve login o pantalla de bienvenida?
□ Si es merchant nuevo → ¿hay flujo de registro?
□ Registrar con email nuevo → ¿llega email de confirmación?
□ Confirmar email → ¿redirige a Steve Ads?
□ Login con email + password → ¿funciona?
□ Login con email incorrecto → ¿muestra error claro?
□ Login con password incorrecta → ¿muestra error claro?
□ ¿Hay "Olvidé mi contraseña"? → ¿funciona?
□ Después del login → ¿a dónde llega? ¿Dashboard? ¿Onboarding?
□ Cerrar sesión → ¿funciona? ¿Redirige al login?
□ Volver a entrar → ¿la sesión se mantiene o pide login de nuevo?
□ Console: CERO errores rojos en todo este flujo
```

## 1B. Onboarding / Brand Brief

```
□ ¿El merchant nuevo ve un onboarding guiado?
□ ¿Steve saluda y explica qué es Steve Ads?
□ ¿Empieza el Brand Brief (las 17 preguntas)?

PREGUNTA POR PREGUNTA:
□ P1: ¿Cómo se llama tu negocio? → escribir respuesta → ¿Steve avanza?
□ P2-P17: ¿Cada pregunta aparece en orden?
□ ¿Steve valida las respuestas? (no acepta respuestas vacías o sin sentido)
□ ¿Si escribo "asdfgh" Steve me pide que responda bien?
□ ¿El progreso se muestra? (paso 3 de 17, barra de progreso, etc)
□ ¿Puedo volver atrás a una pregunta anterior?
□ ¿Si cierro el browser y vuelvo, retoma donde quedé?
□ ¿Al terminar las 17 preguntas → se genera el análisis?
□ ¿El análisis tarda cuánto? (>2 min = problema)
□ ¿El análisis se guarda en brand_research? Verificar en Supabase
□ ¿El análisis tiene datos reales del merchant o basura genérica?
□ ¿Después del brief → me lleva al dashboard?
□ Console: CERO errores rojos
□ Si hago click en "Reset" del brief → ¿limpia todo y empieza de nuevo?
□ ¿Las respuestas se guardan en el campo correcto? (no en otro campo)
```

## 1C. Wizard de Bienvenida — Conectar Shopify

El merchant NO sabe qué es un token ni un API key. Steve lo guía paso a paso con instrucciones claras, screenshots, y links directos a la página exacta de Shopify.

```
WIZARD EXISTE Y SE MUESTRA:
□ Después del Brand Brief → ¿aparece el wizard de conexión de Shopify?
□ ¿Steve explica en lenguaje simple POR QUÉ necesita conectar Shopify?
   ("Para ver tus productos, pedidos y ventas desde aquí")
□ ¿Hay un indicador de progreso? (Paso 1 de 5, barra, etc)

PASO 1: "¿Cuál es tu tienda?"
□ ¿Pide el dominio de la tienda? (mitienda.myshopify.com)
□ ¿Valida que el dominio existe? (no acepta "asdfgh.myshopify.com")
□ ¿Muestra error claro si el dominio es inválido?
□ ¿Tiene ejemplo visual de dónde encontrar el dominio?

PASO 2: "Abre tu Shopify Admin"
□ ¿Hay un botón que abre Shopify Admin directo? (link a https://[tienda].myshopify.com/admin)
□ ¿Se abre en nueva pestaña?
□ ¿Las instrucciones dicen claramente: "Haz click en el botón azul"?

PASO 3: "Ve a Configuración → Apps"
□ ¿Las instrucciones dicen EXACTAMENTE dónde hacer click?
□ ¿Hay screenshots/imágenes mostrando dónde está "Settings"?
□ ¿Hay screenshots mostrando dónde está "Apps and sales channels"?
□ ¿Hay screenshots mostrando dónde está "Develop apps"?
□ ¿Si el merchant no tiene "Develop apps" habilitado, Steve explica cómo habilitarlo?
□ ¿Las instrucciones mencionan el Dev Dashboard (dev.shopify.com) para apps nuevas?
   (Desde enero 2026 no se crean custom apps en el Admin)

PASO 4: "Crea la app y copia las credenciales"
□ ¿Steve dice exactamente qué nombre ponerle a la app?
□ ¿Steve dice exactamente qué permisos seleccionar?
   (read_products, write_products, read_orders, write_orders, etc)
□ ¿Hay screenshot mostrando los permisos a marcar?
□ ¿Steve dice cómo instalar la app y obtener el token?
□ ¿Steve explica que el token se muestra UNA SOLA VEZ?

PASO 5: "Pega las credenciales aquí"
□ ¿Hay campo para pegar el API key / access token?
□ ¿El campo es tipo password? (oculta el texto)
□ ¿Al pegar y hacer click en "Conectar" → Steve verifica que el token funciona?
□ ¿Si el token es inválido → muestra error claro?
□ ¿Si el token es válido → muestra "Shopify conectado ✓"?

POST-CONEXIÓN:
□ ¿Los productos se sincronizan automáticamente después de conectar?
□ ¿Cuánto tarda el sync de productos? (>2 min = problema)
□ ¿Hay indicador de "Sincronizando productos..." con progreso?
□ ¿Después del sync → muestra cuántos productos encontró?
   ("Se encontraron 47 productos en tu tienda")
□ Verificar en Supabase: SELECT COUNT(*) FROM shopify_products WHERE client_id = '...';
□ ¿Los productos tienen nombre, precio, imagen, stock?
□ ¿La conexión se guarda en platform_connections?
□ ¿El token está encriptado en Supabase? (NO debe verse texto plano)
□ Console: CERO errores rojos en todo el wizard

BOTÓN DE AYUDA:
□ ¿En cada paso hay un botón "Necesito ayuda" o "No lo encuentro"?
□ ¿Al hacer click → Steve da instrucciones alternativas o más detalle?
□ ¿Hay opción de "Saltar por ahora" si el merchant se frustra?
```

## 1D. Wizard de Bienvenida — Conectar Meta Ads

El merchant NO sabe qué es un System User ni un Business Manager. Steve lo guía paso a paso.

```
WIZARD EXISTE Y SE MUESTRA:
□ Después de conectar Shopify (o en paralelo) → ¿aparece wizard de Meta?
□ ¿Steve explica en lenguaje simple POR QUÉ necesita conectar Meta?
   ("Para manejar tus campañas de publicidad en Facebook e Instagram")
□ ¿Hay indicador de progreso? (Paso 1 de 5)

PASO 1: "Abre tu Meta Business Settings"
□ ¿Hay botón que abre Meta Business Settings directo?
   (link a https://business.facebook.com/settings)
□ ¿Se abre en nueva pestaña?
□ ¿Steve dice: "Entra con tu cuenta de Facebook que usa la publicidad"?
□ ¿Si el merchant no tiene Business Manager, Steve explica cómo crear uno?
   (link a business.facebook.com/overview)

PASO 2: "Crea un empleado para Steve"
□ ¿Las instrucciones dicen EXACTAMENTE:
   1. En el menú de la izquierda, busca "Usuarios del sistema"
   2. Click en "Agregar"
   3. Nombre: escribe "Steve Ads"
   4. Rol: selecciona "Administrador"
   5. Click en "Crear usuario del sistema"
□ ¿Hay screenshot mostrando dónde está "Usuarios del sistema"?
□ ¿Hay screenshot mostrando el formulario de creación?
□ ¿Las instrucciones están en ESPAÑOL? (no en inglés)
□ ¿Si el menú de Meta está en inglés, Steve da instrucciones en ambos idiomas?
   ("System Users" o "Usuarios del sistema")

PASO 3: "Dale acceso a tu cuenta de publicidad"
□ ¿Steve dice exactamente:
   1. Click en el usuario "Steve Ads" que acabas de crear
   2. Click en "Asignar activos"
   3. Selecciona "Cuentas publicitarias"
   4. Selecciona tu cuenta de publicidad
   5. Marca "Administrar campañas"
   6. Click en "Guardar cambios"
□ ¿Hay screenshots de cada sub-paso?

PASO 4: "Genera una llave para Steve"
□ ¿Steve dice exactamente:
   1. Con el usuario "Steve Ads" seleccionado
   2. Click en "Generar nuevo token"
   3. Selecciona la app (si hay más de una, Steve dice cuál)
   4. Marca estos permisos:
      ✅ ads_management
      ✅ ads_read
      ✅ business_management
      ✅ pages_read_engagement
      ✅ pages_manage_ads
      ✅ instagram_basic
      ✅ instagram_content_publish
      ✅ instagram_manage_comments
      ✅ instagram_manage_messages
   5. Click en "Generar token"
   6. COPIA el token (se muestra una sola vez)
□ ¿Hay screenshot mostrando EXACTAMENTE qué permisos marcar?
□ ¿Steve advierte que el token se muestra UNA SOLA VEZ?

PASO 5: "Pega la llave aquí"
□ ¿Hay campo para pegar el token?
□ ¿El campo es tipo password?
□ ¿Al pegar y click en "Conectar" → Steve verifica que el token funciona?
□ ¿Steve hace un test call a la Graph API para validar?
   (GET /me?access_token=TOKEN → debe devolver info del system user)
□ ¿Si el token es inválido → muestra error claro?
□ ¿Si le faltan permisos → dice CUÁLES permisos faltan?
□ ¿Si el token es válido → muestra "Meta conectado ✓"?
□ ¿Detecta automáticamente el ad account del merchant?
□ ¿Muestra el nombre del ad account para confirmar?

POST-CONEXIÓN:
□ ¿Las campañas se sincronizan automáticamente?
□ ¿Cuánto tarda? (>2 min = problema)
□ ¿Hay indicador de "Sincronizando campañas..."?
□ ¿Después del sync → muestra cuántas campañas encontró?
□ Verificar en Supabase: SELECT COUNT(*) FROM meta_campaigns WHERE client_id = '...';
□ ¿El token se guarda encriptado en platform_connections?
□ Console: CERO errores rojos en todo el wizard

BOTÓN DE AYUDA:
□ ¿En cada paso hay un botón "Necesito ayuda" o "No lo encuentro"?
□ ¿Hay opción de "Saltar por ahora"?
□ ¿Si el merchant dice que no tiene Business Manager, Steve lo guía a crear uno?
□ ¿Si el merchant no encuentra "Usuarios del sistema", Steve sugiere verificar
   que sea Admin del Business Manager?
```

---

# ═══════════════════════════════════════════
# FASE 2: DASHBOARD PRINCIPAL
# ═══════════════════════════════════════════

```
□ ¿El dashboard carga? ¿En cuántos segundos?
□ ¿Muestra datos del merchant real o datos genéricos/vacíos?
□ ¿Las ventas que muestra coinciden con Shopify real?
   → Abrir Shopify Admin → comparar números
□ ¿El gasto de Meta que muestra coincide con Meta real?
   → Abrir Meta Ads Manager → comparar números
□ ¿Los números están en CLP (pesos chilenos) con formato $XX.XXX?
□ ¿O están en USD / sin formato / mal formateados?
□ ¿Hay semáforos (🟢🟡🔴) o indicadores de si va bien o mal?
□ ¿Usa jerga de marketing (ROAS, CPA, CTR) o lenguaje simple?
□ ¿El dashboard se ve bien en celular? (abrir desde el teléfono)
□ ¿Todos los widgets/cards cargan? ¿O alguno queda en "loading" infinito?
□ ¿Los links del dashboard llevan a las secciones correctas?
□ Console: CERO errores rojos
```

---

# ═══════════════════════════════════════════
# FASE 3: STEVE AI (CHAT)
# ═══════════════════════════════════════════

```
□ ¿Hay un chat con Steve accesible? ¿Dónde? (sidebar, botón flotante, página)
□ Escribir: "Hola" → ¿Steve responde? ¿En cuántos segundos?
□ Escribir: "¿Cuánto vendí esta semana?" → ¿Responde con datos reales?
   → Comparar con Shopify Admin → ¿coincide?
□ Escribir: "¿Cuánto gasté en publicidad?" → ¿Responde con datos reales?
   → Comparar con Meta Ads Manager → ¿coincide?
□ Escribir: "¿Cuál es mi producto más vendido?" → ¿Responde correcto?
□ Escribir: "¿Qué me recomiendas hacer?" → ¿La recomendación tiene sentido?
□ Escribir algo off-topic: "¿Quién ganó el partido?" → ¿Steve redirige al tema?
□ ¿Steve habla en español chileno natural? ¿O en inglés/formal?
□ ¿Steve usa jerga de marketing o habla en plata?
□ ¿Steve menciona "plantas muertas" o datos que no son del merchant?
□ ¿Steve inventa números o dice "no tengo esa información"?
□ ¿El historial de chat se mantiene si recargo la página?
□ ¿Puedo hacer múltiples preguntas seguidas sin que se pierda contexto?
□ ¿El endpoint /api/steve-chat responde? (no 502, no 500)
□ Console: CERO errores rojos
```

---

# ═══════════════════════════════════════════
# FASE 4: META ADS
# ═══════════════════════════════════════════

## 4A. Campañas

```
□ Ir a Meta Ads → Campañas
□ ¿Se ve la lista de campañas? ¿Carga datos?
□ ¿Las campañas que muestra existen en Meta real?
   → Abrir Meta Ads Manager → comparar
□ ¿Los estados son correctos? (Activa/Pausada/etc)
□ ¿Los presupuestos son correctos?
□ ¿Las métricas son correctas? (spend, impressions, clicks)
□ Click en una campaña → ¿se abre el detalle?
□ ¿El detalle tiene datos correctos?

CREAR CAMPAÑA NUEVA:
□ Click en "Crear campaña" → ¿se abre el wizard?
□ Paso 1: Objetivo → ¿se puede seleccionar?
□ Paso 2: Presupuesto → ¿se puede ingresar monto?
□ Paso 3: Audiencia → ¿se puede configurar?
□ Paso 4: Creativos → ¿se pueden agregar imágenes?
□ ¿Steve genera copies? ¿Son relevantes al negocio? ¿O plantas muertas?
□ ¿Steve genera imágenes? ¿O falla?
□ ¿Se puede publicar la campaña?
□ Si se publica → ¿aparece en Meta Ads Manager real?
□ ¿El presupuesto en Meta coincide con lo que configuré en Steve?
□ Console: CERO errores rojos
```

## 4B. Audiencias

```
□ Ir a Meta Ads → Audiencias
□ ¿Se ven las audiencias? ¿O está vacío?
□ ¿Puedo crear una audiencia nueva?
□ ¿Puedo crear un Lookalike?
□ ¿Las audiencias creadas aparecen en Meta real?
```

## 4C. Reglas automáticas

```
□ Ir a Meta Ads → Reglas
□ ¿Existen reglas creadas?
□ ¿Puedo crear una regla nueva?
□ ¿La regla se ejecuta realmente? (verificar con campaña de prueba)
□ ¿O solo se guarda en Supabase sin hacer nada?
```

## 4D. Competencia / Ad Library

```
□ Ir a Meta Ads → Competencia
□ ¿La pantalla existe?
□ ¿Puedo agregar un competidor?
□ ¿Carga anuncios del competidor desde Facebook Ad Library?
□ ¿Steve analiza los anuncios? ¿Sugiere algo?
```

## 4E. Métricas de Meta

```
□ ¿Hay dashboard de métricas de Meta?
□ ¿Los datos coinciden con Meta Ads Manager real?
□ ¿Se actualiza periódicamente o está congelado?
□ ¿Puedo filtrar por rango de fechas?
□ ¿Los gráficos cargan correctamente?
```

---

# ═══════════════════════════════════════════
# FASE 5: STEVE MAIL
# ═══════════════════════════════════════════

## 5A. Lista de emails

```
□ Ir a Steve Mail
□ ¿Se ve una lista de emails/campañas?
□ ¿Puedo crear un email nuevo?
□ ¿Puedo ver emails anteriores?
□ ¿Hay filtros? (borradores, enviados, etc)
```

## 5B. Editor de email

```
□ Click en "Crear email" o abrir uno existente
□ ¿Se abre un editor visual? ¿O HTML crudo?
□ ¿Puedo arrastrar bloques? (drag & drop funcional)
□ ¿Los bloques disponibles son: texto, imagen, botón, producto, separador?
□ Agregar bloque de texto → ¿puedo escribir y formatear?
□ Agregar bloque de imagen → ¿puedo subir una imagen?
□ ¿La imagen se sube realmente? (no solo URL, sino archivo)
□ Agregar bloque de producto → ¿aparece selector de productos de Shopify?
□ ¿Los productos tienen foto, nombre, precio, link?
□ ¿Puedo elegir qué productos incluir?
□ ¿El botón "Bloques" arriba a la derecha funciona?
□ ¿Puedo mover bloques de posición?
□ ¿Puedo eliminar un bloque?
□ ¿Puedo cambiar colores/fuentes?
□ ¿El logo del merchant aparece?
□ ¿Hay mención de Klaviyo en CUALQUIER parte? → BUG si sí
□ Console: CERO errores rojos
```

## 5C. Generación con IA

```
□ Pedir a Steve que genere un email promocional
□ ¿Steve genera el email completo?
□ ¿El email tiene productos REALES de la tienda Shopify?
□ ¿El email tiene descuento con código FUNCIONAL?
   → Ir a Shopify Admin → Discounts → ¿el código existe?
   → Ir a la tienda → checkout → ¿el código funciona?
□ ¿El email habla del negocio real o de "plantas muertas"?
□ ¿El diseño se ve profesional?
□ ¿Los links de los productos van a la tienda real?
□ ¿El email tiene botón de CTA? (Comprar ahora, Ver oferta, etc)
□ ¿El email tiene footer con unsubscribe?
```

## 5D. Vista previa

```
□ ¿Hay botón de "Vista previa" o "Preview"?
□ Click → ¿se abre la preview?
□ ¿Muestra el email como lo vería el destinatario?
□ ¿Hay toggle desktop / móvil?
□ ¿La preview se ve bien? (no HTML crudo, no roto)
```

## 5E. Envío real

```
□ ¿Puedo configurar destinatarios? (email de prueba)
□ ¿Puedo enviar un email de prueba a MI email?
□ ¿El email LLEGA a mi bandeja de entrada?
□ ¿Cuánto tarda en llegar? (>5 min = problema)
□ ¿Llega a inbox o a spam?
□ ¿El email se ve bien en Gmail? ¿Outlook? ¿iPhone?
□ ¿El "From" dice el nombre del merchant o "Steve Ads" o algo raro?
□ ¿El dominio del remitente es el del merchant o steve.cl?
□ ¿El link de unsubscribe funciona?
□ ¿El envío se registra en Supabase? (email_campaigns)
□ ¿Se usa Resend para el envío? (NO Klaviyo)
□ ¿Los webhooks de Resend actualizan métricas? (opens, clicks)
```

## 5F. Plantillas

```
□ ¿Hay sección de plantillas?
□ ¿Cuántas plantillas hay? (0 = bug o feature pendiente)
□ ¿Puedo crear un email desde una plantilla?
□ ¿Las plantillas se ven profesionales?
```

---

# ═══════════════════════════════════════════
# FASE 6: PRODUCTOS (MINI SHOPIFY)
# ═══════════════════════════════════════════

```
□ ¿Hay sección de "Productos" en el sidebar?
□ ¿Se ve una lista/grid de productos?
□ ¿Los productos tienen imagen, nombre, precio, stock?
□ ¿Los datos coinciden con Shopify Admin?
   → Abrir Shopify Admin → Products → comparar
□ ¿Puedo buscar un producto por nombre?
□ ¿Puedo filtrar por colección?
□ ¿Puedo editar el precio de un producto? → ¿Se actualiza en Shopify?
□ ¿Puedo editar el stock? → ¿Se actualiza en Shopify?
□ ¿Puedo editar el título? → ¿Se actualiza en Shopify?
□ ¿Puedo subir/cambiar la foto? → ¿Se actualiza en Shopify?
□ ¿Puedo agregar un producto nuevo?
□ Si no existe esta sección → es feature pendiente, documentar
□ Console: CERO errores rojos
```

---

# ═══════════════════════════════════════════
# FASE 7: PEDIDOS (MINI SHOPIFY)
# ═══════════════════════════════════════════

```
□ ¿Hay sección de "Pedidos" en el sidebar?
□ ¿Se ve una lista de pedidos?
□ ¿Los pedidos coinciden con Shopify Admin?
□ ¿Puedo ver el detalle de un pedido? (productos, cliente, dirección)
□ ¿Puedo marcar un pedido como enviado?
   → ¿Se actualiza en Shopify Admin? (verificar)
   → ¿El cliente recibe email de Shopify con tracking?
□ ¿Hay badge de pedidos pendientes en el sidebar?
□ Si no existe esta sección → es feature pendiente, documentar
□ Console: CERO errores rojos
```

---

# ═══════════════════════════════════════════
# FASE 8: CLIENTES
# ═══════════════════════════════════════════

```
□ ¿Hay sección de "Clientes"?
□ ¿Se ve lista de clientes con nombre, email, total comprado?
□ ¿Los datos coinciden con Shopify Admin → Customers?
□ ¿Puedo buscar un cliente?
□ ¿Puedo ver historial de compras de un cliente?
□ ¿Steve sugiere acciones para clientes inactivos?
□ Si no existe → feature pendiente, documentar
```

---

# ═══════════════════════════════════════════
# FASE 9: DESCUENTOS
# ═══════════════════════════════════════════

```
□ ¿Hay sección de "Descuentos"?
□ ¿Se ven los descuentos activos?
□ ¿Puedo crear un descuento nuevo?
□ ¿El descuento se crea EN SHOPIFY real? (verificar en Shopify Admin → Discounts)
□ ¿El código funciona en checkout? (probarlo comprando)
□ Si no existe → feature pendiente, documentar
```

---

# ═══════════════════════════════════════════
# FASE 10: LEARNING CENTER
# ═══════════════════════════════════════════

```
□ ¿Hay sección de Learning Center / Knowledge Base?
□ ¿Puedo agregar una fuente? (URL, YouTube, PDF, texto)
□ Agregar URL de un artículo → ¿Steve lo procesa?
□ ¿Se extraen reglas/conocimiento?
□ ¿Steve usa ese conocimiento en sus respuestas?
□ ¿Puedo ver las reglas extraídas?
□ ¿Puedo eliminar una fuente?
□ Console: CERO errores rojos
```

---

# ═══════════════════════════════════════════
# FASE 11: CONFIGURACIÓN
# ═══════════════════════════════════════════

```
□ ¿Hay página de configuración / settings?
□ ¿Puedo ver las plataformas conectadas?
□ ¿Puedo desconectar una plataforma?
□ ¿Puedo cambiar datos del perfil?
□ ¿Puedo cambiar la contraseña?
□ ¿Hay info de la suscripción/plan?
```

---

# ═══════════════════════════════════════════
# FASE 12: MOBILE
# ═══════════════════════════════════════════

```
Abrir steve.cl desde el CELULAR:

□ ¿La página carga correctamente?
□ ¿El login funciona?
□ ¿El dashboard se ve bien? (no cortado, no texto encimado)
□ ¿El sidebar se convierte en menú hamburguesa?
□ ¿Steve chat funciona en mobile?
□ ¿Puedo navegar a todas las secciones?
□ ¿Los botones son suficientemente grandes para tocar con el dedo?
□ ¿Las tablas se ven bien o se desbordan?
□ ¿El editor de email funciona en mobile? (probablemente no, documentar)
□ ¿Las imágenes cargan?
□ ¿El scroll funciona bien? (no se queda pegado)
```

---

# ═══════════════════════════════════════════
# FASE 13: VELOCIDAD Y ERRORES
# ═══════════════════════════════════════════

```
VELOCIDAD (cronometrar cada uno):
□ Login → Dashboard: ___ segundos (>5s = lento)
□ Dashboard → Meta Ads: ___ segundos (>3s = lento)
□ Dashboard → Steve Mail: ___ segundos (>3s = lento)
□ Dashboard → Productos: ___ segundos (>3s = lento)
□ Steve responde pregunta simple: ___ segundos (>10s = lento)
□ Generar email con IA: ___ segundos (>30s = lento)
□ Generar copy de Meta con IA: ___ segundos (>15s = lento)

ERRORES DE CONSOLA:
□ Navegar por TODA la plataforma con F12 → Console abierta
□ Anotar CADA error rojo que aparezca
□ Screenshot del error + en qué página estabas
□ Anotar warnings amarillos repetitivos (pueden indicar problemas)

NETWORK:
□ ¿Hay requests que fallan con 500? ¿Cuáles?
□ ¿Hay requests que fallan con 502? ¿Cuáles?
□ ¿Hay requests que tardan >10 segundos?
□ ¿Hay requests en loop? (el mismo endpoint llamado 20 veces)
  → fetch-shopify-products tiene este bug conocido
```

---

# ═══════════════════════════════════════════
# FASE 14: SEGURIDAD Y DATOS
# ═══════════════════════════════════════════

```
□ Login con merchant A → ¿veo SOLO datos de merchant A?
□ ¿Puedo ver datos de otro merchant? (cambiar client_id en URL)
   → Si sí → 🔴 BUG CRÍTICO DE SEGURIDAD (RLS roto)
□ ¿Los tokens de Meta/Shopify están encriptados en Supabase?
   → SELECT access_token FROM platform_connections LIMIT 1;
   → Si se ve texto plano (empieza con "EAA" o "shpat_") → 🔴 CRÍTICO
□ ¿Las URLs de la API están protegidas? (no se puede llamar sin auth)
□ ¿El logout realmente invalida la sesión?
```

---

# ═══════════════════════════════════════════
# RESUMEN EJECUTIVO
# ═══════════════════════════════════════════

```
Completar después del QA:

FASE                    ESTADO    BUGS ENCONTRADOS
─────────────────────────────────────────────────
1. Auth/Onboarding      □ OK □ MAL   ___
2. Dashboard            □ OK □ MAL   ___
3. Steve Chat           □ OK □ MAL   ___
4. Meta Ads             □ OK □ MAL   ___
5. Steve Mail           □ OK □ MAL   ___
6. Productos            □ OK □ MAL   ___
7. Pedidos              □ OK □ MAL   ___
8. Clientes             □ OK □ MAL   ___
9. Descuentos           □ OK □ MAL   ___
10. Learning Center     □ OK □ MAL   ___
11. Configuración       □ OK □ MAL   ___
12. Mobile              □ OK □ MAL   ___
13. Velocidad           □ OK □ MAL   ___
14. Seguridad           □ OK □ MAL   ___

TOTAL BUGS: ___
CRÍTICOS: ___
MAJOR: ___
MINOR: ___

MÓDULO MÁS ROTO: _______________
MÓDULO MÁS SANO: _______________
DATO MÁS PREOCUPANTE: _______________
```

---

# ═══════════════════════════════════════════
# FLUJO COMPLETO E2E: "SOY UN MERCHANT NUEVO"
# ═══════════════════════════════════════════

Este es el test definitivo. Hacer todo SEGUIDO como si fueras un merchant que llega por primera vez:

```
□ 1. Abro steve.cl en mi celular
□ 2. Me registro con mi email
□ 3. Confirmo email
□ 4. Steve me saluda y empieza el Brand Brief
□ 5. Respondo las 17 preguntas sobre MI negocio
□ 6. Steve genera el análisis de mi marca
□ 7. Aparece el wizard de Shopify — Steve me guía paso a paso
□ 8. Creo la app en Shopify siguiendo las instrucciones de Steve
□ 9. Pego el token → Steve dice "Shopify conectado ✓"
□ 10. Mis productos aparecen en Steve Ads
□ 11. Aparece el wizard de Meta — Steve me guía paso a paso
□ 12. Creo el System User en Meta siguiendo las instrucciones de Steve
□ 13. Genero el token con los permisos que Steve me dice
□ 14. Pego el token → Steve dice "Meta conectado ✓"
□ 15. Mis campañas aparecen en Steve Ads
□ 16. Le pregunto a Steve "¿Cómo va mi negocio?"
□ 17. Steve me responde con datos REALES y en ESPAÑOL SIMPLE
□ 18. Le pido a Steve que cree una campaña de Meta
□ 19. Steve genera copies relevantes a MI negocio (no plantas)
□ 20. Steve genera imágenes para el anuncio
□ 21. La campaña se publica en Meta real
□ 22. Le pido a Steve que cree un email promocional
□ 23. El email tiene MIS productos con fotos y precios reales
□ 24. El email tiene un cupón que FUNCIONA en Shopify
□ 25. Puedo editar el email arrastrando bloques
□ 26. La vista previa se ve bien
□ 27. Envío el email de prueba → LLEGA a mi inbox
□ 28. Veo mis pedidos recientes en Steve Ads
□ 29. Marco un pedido como enviado → se actualiza en Shopify
□ 30. El dashboard me muestra cuánto vendí hoy en lenguaje simple
□ 31. Cierro la app y duermo tranquilo sabiendo que Steve trabaja

RESULTADO: ___/31 pasos completados exitosamente
Si es <22 → la plataforma NO está lista para merchants reales
Si es 22-28 → funcional con bugs, se puede usar con cuidado
Si es 29-31 → lista para lanzar
```
