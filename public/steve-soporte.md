# Steve Soporte — Base de Conocimiento Completa

> Documento de referencia para Chonga, bot de soporte de Steve Ads.
> Actualizado: 12 de abril 2026.

---

## RESUMEN DE LA PLATAFORMA

Steve es una plataforma de marketing AI para e-commerce. Integra Shopify, Meta Ads, Google Ads, Klaviyo, WhatsApp, Instagram y email en un solo portal. Los clientes inician sesion en steve.cl/portal y acceden a todas las herramientas segun su plan.

### Planes disponibles

| Plan | Precio/mes | Resumen |
|------|-----------|---------|
| Visual ($49.990) | $49.990 CLP | Ver datos, metricas y conexiones. Solo lectura |
| Estrategia ($99.990) | $99.990 CLP | Visual + Steve AI, Brief, Deep Dive, Estrategia, insights inteligentes |
| Full ($199.990) | $199.990 CLP | Todo: crear campanas, email, WhatsApp, reglas automatizadas, publicar |

---

## PLAN GATING — Que ve cada plan

### Tabs y acceso por plan

| Tab | Visual | Estrategia | Full |
|-----|--------|-----------|------|
| Metricas | Dashboard basico | + Insights inteligentes, reportes avanzados, reporte semanal | Todo |
| Conexiones | Conectar y gestionar | Todo | Todo |
| Configuracion | Perfil y costos | + Gestion usuarios | Todo |
| Steve (Chat AI) | Bloqueado | Chat con Steve, brief, recomendaciones | + Ejecutar acciones |
| Brief | Bloqueado | Ver y generar briefs | Todo |
| Estrategia | Bloqueado | Diagnostico, plan marketing, competencia | + Ejecucion automatica |
| Deep Dive | Bloqueado | Analisis de competencia con IA | Todo |
| Shopify | Ver productos, ordenes, metricas | Todo | + Editar productos, crear descuentos |
| Campanas | Metricas de campanas | + Recomendaciones IA | Todo |
| Meta Ads | Ver campanas, Social Inbox (leer) | + Analisis IA | + Crear, editar, reglas, audiencias, responder inbox |
| Google Ads | Ver campanas | + Analisis IA | + Crear, editar, reglas |
| Klaviyo | Ver metricas y campanas | Todo | + Crear, editor, importar templates |
| Social (Instagram/FB) | Ver feed y metricas | Todo | + Publicar contenido |
| Steve Mail | Bloqueado | Bloqueado | Todo |
| WhatsApp | Bloqueado | Bloqueado | Ver, enviar, automatizaciones |
| Academy | Cursos basicos | + Contenido avanzado | Todo |

### Cuando preguntan por feature bloqueada
Si el cliente pregunta por algo que no esta en su plan:
1. Explica que hace la feature
2. Indica en que plan esta disponible
3. "Para acceder, puedes subir tu plan en Configuracion o contactar al equipo"

---

## 1. CONEXIONES — Como conectar cada plataforma

### 1.1 Shopify
**Donde:** Tab "Conexiones" → seccion Shopify → "Conectar Shopify"

**Pasos:**
1. Click en "Conectar Shopify"
2. Se abre el Custom App Wizard (paso a paso guiado)
3. Paso 1: Ingresar tu dominio de Shopify (ej: mitienda.myshopify.com o solo "mitienda")
4. Paso 2: Steve te muestra instrucciones para crear una Custom App en tu admin de Shopify
5. Paso 3: Configurar los scopes/permisos necesarios (read_products, read_orders, etc.)
6. Paso 4: Copiar el Access Token de la Custom App y pegarlo en Steve
7. Paso 5: Steve verifica la conexion y hace la primera sincronizacion
8. Aparece badge verde "Conectado"

**Problemas comunes:**
- **"No se pudo conectar"**: Verifica que el dominio de la tienda sea correcto. Debe ser el subdominio de myshopify.com
- **"Error de permisos"**: Debes ser admin o owner de la tienda Shopify para crear Custom Apps
- **"Custom App no aparece"**: En Shopify Admin → Settings → Apps and sales channels → Develop apps → asegurate de habilitar "Custom app development"
- **"Datos no aparecen"**: Los datos se sincronizan automaticamente tras conectar. Click en "Sincronizar" para forzar. La primera sincronizacion puede tomar unos minutos
- **"Desconectar y reconectar"**: Ve a Conexiones → click "Desconectar" en Shopify → confirmar → volver a conectar
- **"Access Token invalido"**: Verifica que copiaste el token completo, sin espacios. Si ya lo cerraste en Shopify, debes crear uno nuevo

### 1.2 Meta Ads (Facebook/Instagram)
**Donde:** Tab "Conexiones" → seccion Meta → "Conectar con Meta"

**Metodos de conexion:**
- **OAuth directo**: Para cuentas personales con acceso al Business Manager
- **BM Partner (empresas)**: Steve se asocia como Partner del Business Manager del cliente
- **Leadsie**: Enlace que el cliente acepta para dar acceso sin compartir contrasenas

**Pasos (OAuth directo):**
1. Click en "Conectar con Meta"
2. Se abre ventana de Facebook para autorizar
3. Acepta todos los permisos: ads_read, ads_management, business_management, pages_read_engagement, instagram_basic
4. Selecciona la pagina de Facebook y cuenta publicitaria correcta
5. Vuelve al portal — aparece badge verde "Conectado"

**Seleccionar cuenta publicitaria:**
- Si tienes multiples cuentas de Meta Ads, veras un selector desplegable
- Elige la cuenta de anuncios (ad account) correcta — cada una tiene un ID tipo "act_123456"
- Puedes cambiar de cuenta en cualquier momento desde el selector

**Problemas comunes:**
- **"No veo mis campanas"**: Verifica que seleccionaste la cuenta de anuncios correcta en el selector. Puedes tener varias
- **"Error de autorizacion"**: Debes tener rol de admin o anunciante en el Business Manager
- **"Permisos insuficientes"**: Al conectar, asegurate de aceptar TODOS los permisos que pide Facebook. Si rechazaste alguno, desconecta y reconecta
- **"Cuenta incorrecta"**: Ve a Conexiones → click el selector de cuenta Meta → elige otra cuenta
- **"Token expirado"**: Desconecta y vuelve a conectar Meta. Esto renueva el token
- **"Popup bloqueado"**: Tu navegador bloquea el popup de Facebook. Permite popups para steve.cl o abrelo en modo incognito
- **"Business Manager no aparece"**: Tu usuario de Facebook necesita ser admin del BM. Verifica en business.facebook.com/settings
- **"Error 190 (token invalido)"**: El token expiro o fue revocado. Desconecta y reconecta
- **"Solo veo una cuenta y tengo varias"**: Verifica que las cuentas estan en el mismo Business Manager. Cuentas en diferentes BMs requieren conexion separada

### 1.3 Google Ads
**Donde:** Tab "Conexiones" → seccion Google Ads → "Conectar Google Ads"

**Pasos:**
1. Click en "Conectar Google Ads"
2. Se abre ventana de Google OAuth
3. Selecciona tu cuenta de Google (la que tiene acceso a Google Ads)
4. Autoriza los permisos necesarios
5. Si tienes multiples cuentas, selecciona la cuenta de Google Ads correcta
6. Vuelve al portal — aparece badge verde "Conectado"

**Problemas comunes:**
- **"No se encontraron campanas"**: Verifica que la cuenta Google Ads tiene campanas creadas. Cuentas nuevas sin campanas no muestran datos
- **"Error de OAuth"**: Intenta con otro navegador o modo incognito. Extensiones como ad blockers pueden bloquear el popup
- **"Datos desactualizados"**: Click en "Sincronizar" en Conexiones para forzar actualizacion
- **"Cuenta MCC vs cuenta individual"**: Si usas una cuenta manager (MCC), asegurate de seleccionar la cuenta cliente correcta
- **"No tengo cuenta de Google Ads"**: Debes crear una en ads.google.com primero. Steve no crea cuentas, solo se conecta a existentes
- **"Conversion tracking no funciona"**: Verifica que la etiqueta de conversion de Google esta instalada en tu sitio

### 1.4 Klaviyo
**Donde:** Tab "Conexiones" → seccion Klaviyo → ingresar Private API Key

**Pasos:**
1. Ve a tu cuenta de Klaviyo → Settings (engranaje abajo a la izquierda) → API Keys
2. Click "Create Private API Key"
3. Dale un nombre (ej: "Steve Ads")
4. Selecciona "Full Access" o al menos: Read Campaigns, Read Flows, Read Metrics, Read Profiles, Read Lists
5. Copia la Private API Key (empieza con pk_...)
6. En Steve, ve a Conexiones → Klaviyo → pega la Private API Key
7. Click "Conectar" — aparece badge verde

**Problemas comunes:**
- **"API Key invalida"**: Asegurate de copiar la **Private** API Key, NO la Public Key. La Private empieza con `pk_`
- **"No veo mis campanas de Klaviyo"**: La key debe tener permisos de lectura de campanas y flujos. Crea una nueva con Full Access
- **"No encuentro donde estan las API Keys"**: En Klaviyo → Settings (engranaje abajo izq.) → API Keys → Create Private API Key
- **"Ya tengo una key pero no funciona"**: Las keys de Klaviyo no expiran, pero pueden tener permisos insuficientes. Crea una nueva con Full Access
- **"Metricas de Klaviyo en 0"**: Verifica que tienes campanas enviadas en Klaviyo. Campanas en draft no generan metricas

### 1.5 WhatsApp (requiere plan Full)
**Donde:** Tab "Conexiones" → seccion WhatsApp

**Requisitos previos:**
- Plan Full activo
- Numero de WhatsApp Business
- Configuracion de WhatsApp Business (el equipo de Steve te ayuda con esto)

**Pasos:**
1. Contacta al equipo de Steve para configurar tu numero de WhatsApp Business
2. El equipo configura la conexion de mensajeria
3. Una vez configurado, aparece la seccion WhatsApp en tu portal
4. Puedes enviar mensajes, crear campanas y configurar automatizaciones

**Nota:** La configuracion inicial de WhatsApp requiere asistencia del equipo. Una vez conectado, todo funciona desde tu portal.

---

## 2. STEVE CHAT — Tu consultor AI de marca

### Que es
Steve es un chat de inteligencia artificial que te guia para construir tu Brand Brief (brief de marca). Funciona como un consultor que te hace 17 preguntas estructuradas sobre tu negocio y genera un documento completo.

**Plan minimo:** Estrategia

### Donde esta
Tab "Steve" en el portal (tab principal).

### Como funciona el Brief — 17 preguntas paso a paso

Steve te hace preguntas en este orden exacto:

1. **URL del sitio web** — Steve analiza tu sitio automaticamente
2. **Pitch del negocio** — Que vendes, a quien, por que te eligen
3. **Numeros financieros** — Precio promedio, costo por producto, costo de envio, facturacion mensual, presupuesto de ads
4. **Canales de venta** — Distribucion porcentual (web, tienda fisica, marketplace, redes, otros). Debe sumar 100%
5. **Persona del cliente** — Nombre ficticio, edad, genero, ciudad, ocupacion, ingresos mensuales, estado familiar, motivacion principal
6. **Puntos de dolor** — Los 3-5 problemas principales que tiene tu cliente antes de comprar
7. **Vocabulario del cliente** — Como habla tu cliente, frases que usa, tono
8. **Promesa de transformacion** — Que cambio experimenta el cliente despues de comprar
9. **Estilo de vida** — Un dia tipico de tu cliente ideal
10. **3 competidores principales** — Nombre + URL de cada uno
11. **Debilidades de competidores** — Que hacen mal y en que eres mejor
12. **Ventaja unica (diferenciador)** — Lo que te hace diferente de todos
13. **Promesa "vaca purpura"** — Lo que te hace inolvidable/memorable
14. **Villano + garantia** — El enemigo comun con tu cliente + tu garantia
15. **Prueba social** — Testimonios, numeros, certificaciones, premios
16. **Canales de adquisicion** — Donde encuentras a tus clientes
17. **Objetivos a 90 dias** — Metas concretas de negocio

### Que genera Steve
Despues de las 17 preguntas, Steve procesa todo y genera:
- **Brand Research completo** — Analisis profundo de tu marca, mercado y competencia
- **Posicionamiento** — Propuesta de valor unica
- **Estrategia de contenido** — Pilares, temas, tono
- **Plan de campanas** — Recomendaciones para Meta y Google
- **Keywords** — Palabras clave objetivo
- **Presupuesto** — Distribucion recomendada de gasto

### Herramientas del chat
Steve puede buscar informacion en tiempo real:
- **Buscar en YouTube** — Encuentra videos relevantes de tu industria
- **Buscar en la web** — Investiga competidores y tendencias

### Problemas comunes
- **"Steve no responde"**: Recarga la pagina. Si persiste, espera unos segundos — puede estar procesando una respuesta larga
- **"Perdi mi conversacion"**: Las conversaciones se guardan automaticamente. Vuelve a la tab Steve y deberian estar ahi
- **"Quiero editar una respuesta"**: Puedes editar respuestas anteriores haciendo click en el mensaje
- **"El porcentaje de canales no suma 100%"**: Los porcentajes de canales de venta deben sumar exactamente 100%. Ajusta hasta que cuadren
- **"Steve da respuestas genericas"**: Completa tu brief primero con respuestas detalladas. Mientras mas informacion des, mejores las recomendaciones
- **"No veo la tab Steve"**: Requiere plan Estrategia o Full. Si tienes plan Visual, la tab aparece bloqueada con candado
- **"Cuanto tarda el brief?"**: Las 17 preguntas toman ~15-20 minutos. El procesamiento final toma ~2-3 minutos

---

## 3. BRIEF DE MARCA

### Que es
El Brief es el documento completo de tu marca generado por Steve a partir de tus 17 respuestas. Es la base para todas las recomendaciones, copies y campanas que genera la plataforma.

**Plan minimo:** Estrategia

### Donde esta
Tab "Brief" en el portal (tab principal).

### Que incluye
1. **Identidad de marca** — Colores, tipografia, estetica visual
2. **Perfil del consumidor** — Persona detallada con demografia y psicografia
3. **Estrategia de posicionamiento** — Propuesta unica de valor, tagline
4. **Analisis de competidores** — Fortalezas y debilidades de 3 competidores
5. **Analisis financiero** — Margenes, rentabilidad, unit economics
6. **Plan de accion** — Proximos pasos recomendados
7. **Estrategia Meta Ads** — Campanas recomendadas con objetivos y audiencias
8. **Estrategia Google Ads** — Tipos de campana y keywords sugeridos
9. **Keywords** — Lista de palabras clave objetivo con volumen estimado
10. **Presupuesto y funnel** — Distribucion de gasto por etapa (TOFU/MOFU/BOFU)

### Acciones disponibles
- **Descargar PDF**: Boton "Descargar" genera un PDF con tu brief completo con branding de Steve
- **Editar brief**: Click "Editar" te lleva de vuelta al chat con Steve para modificar respuestas
- **Subir assets**: Puedes subir tu logo, fuentes y colores de marca
- **Compartir**: Genera un link para compartir el brief con tu equipo

### Problemas comunes
- **"El brief esta incompleto"**: Debes completar TODAS las 17 preguntas de Steve. Vuelve a la tab Steve y sigue respondiendo
- **"No puedo descargar el PDF"**: Verifica que tu navegador permite descargas. Intenta con Chrome. Si no funciona, desactiva el bloqueador de popups
- **"Quiero actualizar mi brief"**: Ve a la tab Steve, edita tus respuestas y Steve regenerara el brief
- **"No veo la tab Brief"**: Requiere plan Estrategia o Full
- **"Brief tarda mucho"**: La generacion usa IA avanzada. Puede tomar 2-3 minutos

---

## 4. METRICAS — Dashboard de KPIs

### Que es
Panel unificado que muestra las metricas de todas tus plataformas conectadas: ventas de Shopify, gasto y rendimiento de Meta Ads y Google Ads, todo en un solo lugar.

**Plan minimo:** Visual (basico), Estrategia (insights + reportes avanzados)

### Donde esta
Tab "Metricas" en el portal (tab principal).

### KPIs que muestra
- **Ingresos totales**: Ventas de Shopify
- **Ordenes**: Cantidad de transacciones
- **ROAS**: Retorno sobre gasto publicitario (Ingresos / Gasto en Ads)
- **AOV**: Valor promedio de orden (Ingresos / Ordenes)
- **CAC**: Costo de adquisicion de cliente (Gasto / Conversiones)
- **Profit**: Ganancia neta (con costos configurados)
- **Health Score**: Indice de salud del negocio (0-100)

### Filtros de fecha
- 7 dias, 30 dias (por defecto), 90 dias
- Mes actual (MTD), Ano actual (YTD)
- Rango personalizado
- Comparacion con periodo anterior (muestra tendencia con flechas arriba/abajo y porcentaje)

### Graficos
- Tendencia de ingresos (area chart)
- Tendencia de ordenes
- Rendimiento por dia de la semana (heatmap)
- Funnel de conversion (sesiones → carrito → checkout → compra)
- Analisis de cohortes
- Top SKUs (productos mas vendidos con imagen y revenue)
- Carritos abandonados (valor y tasa de abandono)
- Margenes por producto

### Smart Insights (plan Estrategia+)
Panel de insights inteligentes que analiza tus datos con IA y genera:
- Alertas de rendimiento (ROAS bajo, CAC alto, etc.)
- Oportunidades de optimizacion
- Recomendaciones accionables
- Tendencias y patrones

### Problemas comunes
- **"No veo datos"**: Verifica que tienes plataformas conectadas en la tab Conexiones. Los datos tardan hasta 6 horas en sincronizarse inicialmente
- **"Los numeros no cuadran"**: Los datos se actualizan cada 6 horas. Click en "Sincronizar" en Conexiones para forzar actualizacion
- **"ROAS aparece como 0 o infinito"**: Necesitas tener tanto Shopify (ingresos) como Meta o Google (gasto) conectados para calcular ROAS
- **"No veo el periodo que quiero"**: Usa el filtro de fecha personalizado en la esquina superior derecha del dashboard
- **"Las metricas estan cargando"**: Espera unos segundos. Si tarda mucho, recarga la pagina
- **"Profit aparece negativo"**: Revisa tus costos en Configuracion. El margen por defecto o los costos fijos pueden estar mal configurados
- **"No veo Smart Insights"**: Requiere plan Estrategia o Full. Con plan Visual no aparece el panel

---

## 5. SHOPIFY ANALYTICS

### Que es
Dashboard completo de tu tienda Shopify con ventas, productos, ordenes, descuentos, clientes y fulfillment.

**Plan minimo:** Visual (ver), Full (editar productos, crear descuentos)

### Donde esta
Tab "Shopify" en el menu desplegable "Mas".

### Secciones
1. **Ventas**: Grafico diario de ingresos y ordenes, rendimiento por dia de la semana, ventas por canal, analisis UTM
2. **Top SKUs**: Productos mas vendidos con imagen, cantidad vendida y facturacion
3. **Carritos abandonados**: Carritos incompletos con valor, email del cliente y productos. Puedes ver cuales tienen mayor valor para recuperar
4. **Funnel de conversion**: Sesiones → Agregar al carrito → Checkout → Compra (con tasa de conversion entre cada paso)
5. **Ordenes**: Listado de ordenes recientes con estado (pending, paid, fulfilled, cancelled), busqueda por numero o cliente
6. **Productos**: Catalogo completo con busqueda, filtros por estado (active/draft/archived), imagen, precio, inventario
7. **Descuentos** (plan Full): Codigos de descuento activos con uso, monto descontado y rendimiento
8. **Clientes**: Lista de clientes con lifetime value, frecuencia de compra, primera y ultima orden
9. **Fulfillment**: Tasa de despacho, tiempos promedio de envio, ordenes pendientes de envio

### Problemas comunes
- **"No aparecen mis productos"**: Click en "Sincronizar" en Conexiones. La primera sync puede tomar unos minutos dependiendo del catalogo
- **"Datos desactualizados"**: Los datos se sincronizan cada 6 horas automaticamente. Fuerza sync en Conexiones
- **"No veo las ordenes de hoy"**: La sincronizacion tiene un delay. Usa "Sincronizar" para datos mas recientes
- **"Carritos abandonados vacios"**: Si tu tienda no tiene carritos abandonados recientes, esta seccion estara vacia. Es normal
- **"No puedo editar productos"**: Requiere plan Full. Con plan Visual solo puedes ver

---

## 6. META ADS MANAGER

### Que es
Herramienta completa para crear, gestionar y analizar campanas de Facebook e Instagram Ads. Incluye dashboard, wizard de creacion, audiencias, reglas automatizadas, social inbox y mas.

**Plan minimo:** Visual (ver), Estrategia (analisis IA), Full (crear, editar, reglas, audiencias)

### Donde esta
Tab "Meta Ads" en el menu desplegable "Mas".

### 6.1 Dashboard
Resumen de rendimiento general: gasto total, impresiones, clicks, CTR, CPC, CPM, conversiones, ROAS. Graficos de tendencia y campanas destacadas.

### 6.2 Vista de arbol (Jerarquia)
Campana → Conjunto de anuncios (Ad Set) → Anuncio (Ad). Expande cada nivel para ver metricas detalladas. Status: activa, pausada, en revision, rechazada.

### 6.3 Crear campana — Wizard 6 pasos (plan Full)
1. **Objetivo**: Reconocimiento de marca, Trafico, Engagement, Leads, Ventas, App promotion
2. **Presupuesto y duracion**: Presupuesto diario o total. Fecha inicio/fin. Optimizacion de entrega
3. **Audiencia**: Edad, genero, ubicacion geografica, intereses, comportamientos. Audiencias guardadas, custom o lookalike
4. **Ubicaciones**: Instagram Feed, Stories, Reels, Explore. Facebook Feed, Stories, Marketplace, Video feeds, Right column. Audience Network. Ubicaciones automaticas o manuales
5. **Creativo**: Subir imagenes/videos. Generar copies con IA (usa tu brief). Preview en tiempo real de como se vera el anuncio. Formatos: imagen unica, carrusel, video, coleccion
6. **Revisar y publicar**: Resumen completo, estimacion de alcance, confirmar y publicar a Meta

### 6.4 Audiencias (plan Full)
- **Lookalike (LAA)**: Audiencias similares a tus clientes. Basadas en: compradores, visitantes del sitio, engagement en Instagram. Porcentaje de similitud: 1% (mas similar) a 10% (mas amplio)
- **Custom Audiences**: Basadas en datos propios — emails, visitantes del sitio, interaccion con pagina/IG, compradores
- **Audiencias guardadas**: Combinaciones de targeting (edad + ubicacion + intereses) que puedes reutilizar

### 6.5 Reglas automatizadas (plan Full)
Crea reglas que ejecutan acciones automaticamente:
- **Pausar ads bajo rendimiento**: Si CPA > umbral o ROAS < minimo por X dias
- **Escalar ganadores**: Si ROAS > objetivo, incrementar presupuesto en X%
- **Alertas**: Notificar cuando gasto supere umbral sin conversiones
- Configuracion: condicion + accion + frecuencia de verificacion + periodo de evaluacion

### 6.6 Social Inbox
- **Ver** (plan Visual+): Mensajes de Facebook e Instagram en una bandeja unificada
- **Responder** (plan Full): Contestar mensajes directamente desde Steve

### 6.7 Pixel Setup
Configurar el Meta Pixel en tu sitio web para tracking de conversiones:
1. Steve te muestra tu Pixel ID
2. Instrucciones para instalar en Shopify (automatico) o sitio custom (codigo)
3. Eventos estandar: PageView, ViewContent, AddToCart, Purchase
4. Verificacion de que el Pixel esta activo

### 6.8 Ads de competidores
Espiar los anuncios activos de tus competidores en la Meta Ad Library. Busca por nombre de pagina o URL.

### 6.9 Borradores
Campanas en progreso que guardaste sin publicar. Puedes retomar desde donde quedaste.

### 6.10 Analytics
Metricas detalladas por campana: spend, impressions, reach, clicks, CTR, CPC, CPM, conversiones, ROAS, frecuencia. Graficos de tendencia y comparacion entre campanas.

### 6.11 Catalogos
Gestion de catalogos de productos para campanas de Dynamic Product Ads (DPA).

### 6.12 Overlap Detection
Detecta solapamiento entre audiencias de diferentes ad sets para evitar competir contigo mismo.

### 6.13 Business Hierarchy
Vista de la estructura de tu Business Manager: cuentas publicitarias, paginas, pixeles, usuarios.

### Problemas comunes
- **"No veo mis campanas de Meta"**: Verifica que Meta esta conectado en Conexiones y que seleccionaste la cuenta de anuncios correcta
- **"Error al crear campana"**: Verifica que tu cuenta Meta tiene un metodo de pago activo y que no esta en revision
- **"Copies generados son genericos"**: Completa tu Brief de Marca primero. Steve usa el brief para personalizar todos los copies
- **"No puedo pausar una campana"**: Necesitas permisos de admin o anunciante en Meta Business Manager y plan Full
- **"Metricas no coinciden con Facebook"**: Los datos se sincronizan periodicamente. Puede haber un delay de hasta 6 horas
- **"Campana rechazada por Meta"**: Revisa las politicas de Meta Ads. Causas comunes: contenido restringido, claims sin sustento, imagenes con texto excesivo
- **"No puedo crear audiencia LAA"**: Necesitas al menos una fuente de datos (Pixel activo, lista de clientes). Asegurate de que tu Pixel tenga suficientes eventos
- **"Regla automatizada no se ejecuta"**: Verifica la frecuencia de la regla y el periodo de evaluacion. Algunas reglas necesitan acumular datos antes de actuar
- **"No veo opcion de crear campana"**: Requiere plan Full
- **"Preview del anuncio no carga"**: Recarga la pagina. Puede ser lentitud temporal del API de Meta

---

## 7. GOOGLE ADS

### Que es
Herramienta para crear campanas RSA (Responsive Search Ads), gestionar keywords, extensiones, conversiones y reglas automatizadas en Google Ads.

**Plan minimo:** Visual (ver), Estrategia (analisis IA), Full (crear, editar, reglas)

### Donde esta
Tab "Google Ads" en el menu desplegable "Mas".

### 7.1 Dashboard de campanas
Vista general de campanas activas: gasto, impresiones, clicks, CTR, CPC, conversiones, costo por conversion, ROAS.

### 7.2 Crear campana RSA (plan Full)
1. Selecciona tipo de campana (Search, Display, Performance Max, Remarketing)
2. Define nombre, presupuesto diario, fecha inicio/fin
3. Agrega keywords objetivo (broad match, phrase match, exact match)
4. Genera copies con IA: 3 headlines cortos (30 chars), 2 headlines largos (90 chars), 2 descripciones (90 chars)
5. Agrega extensiones: sitelinks, callouts, structured snippets
6. Revisa y publica

### 7.3 Keywords
Gestion de palabras clave: agregar, pausar, eliminar. Tipos de match:
- **Broad match**: alcance amplio, Google interpreta la intencion
- **Phrase match**: termino entre comillas, orden importa
- **Exact match**: termino entre corchetes, match preciso
- **Negative keywords**: excluir terminos irrelevantes

### 7.4 Extensiones
- **Sitelinks**: Links adicionales debajo del anuncio (ej: "Ver ofertas", "Contacto")
- **Callouts**: Textos cortos destacados (ej: "Envio gratis", "Garantia 30 dias")
- **Structured snippets**: Categorias de productos/servicios

### 7.5 Conversiones
Configurar y rastrear conversiones:
- Importar conversiones desde Google Ads
- Tag de conversion para tu sitio
- Valores de conversion (estatico o dinamico)

### 7.6 Reglas automatizadas (plan Full)
Similar a Meta: pausar bajo rendimiento, escalar ganadores, alertas de presupuesto.

### 7.7 Analytics
Metricas detalladas por campana, ad group y keyword. Quality Score, Ad Rank, Search Impression Share.

### 7.8 Health Banner
Banner informativo que muestra el estado de salud de tu cuenta de Google Ads: recomendaciones de Google, presupuesto, rendimiento general.

### Problemas comunes
- **"Copies muy genericos"**: Agrega instrucciones especificas en "Custom Instructions" y asegurate de tener el brief completo
- **"No puedo generar copies"**: Verifica tu conexion a internet. Si persiste, recarga la pagina
- **"Campana no se publica"**: Verifica que tu cuenta Google Ads tiene metodo de pago activo y esta habilitada
- **"Quality Score bajo"**: Mejora la relevancia entre keywords, copies y landing page. Steve te da recomendaciones
- **"Conversiones en 0"**: Verifica que el tag de conversion esta instalado correctamente. Puede tomar 24-72h para verificarse
- **"No veo opcion de crear"**: Requiere plan Full

---

## 8. KLAVIYO STUDIO

### Que es
Centro de email marketing integrado con Klaviyo para ver metricas, campanas y flujos. Con plan Full puedes crear campanas, usar el editor drag & drop e importar templates.

**Plan minimo:** Visual (ver metricas y campanas), Full (crear, editar, importar)

### Donde esta
Tab "Klaviyo" en el menu desplegable "Mas".

### 8.1 Plantillas
Templates predefinidos por categoria:
- Newsletter, Promocional, Carrito abandonado, Bienvenida, Post-compra, Re-engagement
- Puedes importar templates directamente desde tu cuenta de Klaviyo (plan Full)
- Preview antes de usar

### 8.2 Crear campana (plan Full)
1. Elegir template o empezar en blanco
2. Nombre de campana y asunto del email (subject line)
3. Disenar el email con el editor drag & drop
4. Seleccionar audiencia (lista o segmento de Klaviyo)
5. Programar fecha/hora de envio
6. Revisar y enviar

### 8.3 Editor drag & drop
Editor visual tipo Klaviyo:
- **Bloques disponibles**: Texto, Imagen, Boton, Divisor, Iconos sociales, Espaciador, Columnas (1-4), Header, Footer
- **Variables dinamicas**: {{first_name}}, {{email}}, {{last_order_date}}, {{lifetime_value}}, {{company}}
- **Personalizacion**: Colores de marca, fuentes, logo. Se carga desde tu brief si lo tienes
- **Responsive**: Preview mobile y desktop

### 8.4 Flujos automatizados
Vista de automatizaciones activas en Klaviyo:
- Welcome series, Carrito abandonado, Post-compra, Re-engagement, Cumpleanos, Winback
- Metricas por flujo: emails enviados, tasa de apertura, clicks, revenue generado

### 8.5 Calendario
Vista mensual de campanas programadas. Click en una fecha para crear campana rapida. Drag & drop para reprogramar (plan Full).

### 8.6 Metricas por campana y flujo
- Enviados, Entregados, Abiertos (open rate), Clicks (CTR), Conversiones, Revenue
- Comparacion entre campanas
- Tendencia temporal

### 8.7 Chat Steve (recomendaciones email)
Steve AI analiza tus metricas de email y recomienda:
- Mejor horario de envio
- Asuntos con mejor rendimiento
- Segmentos a targetear
- Flujos que deberias activar

### Problemas comunes
- **"No veo mis campanas de Klaviyo"**: Verifica que Klaviyo esta conectado con la Private API Key (pk_...) en Conexiones
- **"Templates no cargan"**: Recarga la pagina. Si persiste, verifica la conexion de Klaviyo en Conexiones
- **"Variables no funcionan"**: Las variables tipo {{first_name}} requieren que tus contactos en Klaviyo tengan esos campos llenos
- **"Calendario vacio"**: No tienes campanas programadas. Crea una nueva campana
- **"No puedo crear campanas"**: Requiere plan Full
- **"Importar template desde Klaviyo"**: Ve a Plantillas → "Importar desde Klaviyo" → selecciona template → se copia al editor de Steve (plan Full)
- **"Revenue de email en 0"**: Klaviyo necesita integracion con Shopify para atribuir revenue a emails

---

## 9. STEVE MAIL — Email Marketing Propio

### Que es
Sistema de email marketing propio de Steve con editor visual drag & drop. Alternativa a Klaviyo, integrado directamente en la plataforma.

**Plan minimo:** Full (todas las funciones)

### Donde esta
Tab "Steve Mail" en el menu desplegable "Mas".

### 9.1 Campanas
- Crear campanas de email desde cero o usando templates
- Editor visual drag & drop avanzado
- Asunto, preheader, remitente, audiencia
- Programar o enviar inmediatamente

### 9.2 Contactos
- Gestionar lista de suscriptores
- Importar desde CSV, desde Shopify (sync automatico) o agregar manual
- Segmentar por: comportamiento (abrio, hizo click), compras, ubicacion, fecha de suscripcion
- Desuscripciones automaticas (link en cada email)

### 9.3 Automatizaciones (Flujos)
Flujos automaticos de email tipo Klaviyo:
- **Bienvenida**: Cuando alguien se suscribe
- **Carrito abandonado**: Recordatorio de productos en carrito
- **Post-compra**: Gracias + recomendaciones
- **Re-engagement**: Reactivar suscriptores inactivos
- **Cumpleanos**: Email automatico en fecha de cumpleanos

### 9.4 A/B Testing
Probar dos variaciones del email:
- Asunto A vs Asunto B
- Contenido diferente
- Hora de envio diferente
- Steve envia a un % de prueba, espera resultados, y envia el ganador al resto

### 9.5 Dominio de envio (DKIM/SPF/DMARC)
Configurar tu dominio propio para mejor entregabilidad:
1. Ve a Steve Mail → "Configurar dominio"
2. Ingresa tu dominio (ej: mitienda.cl)
3. Steve te muestra los registros DNS que debes agregar:
   - **DKIM**: Firma digital que verifica que el email viene de ti
   - **SPF**: Lista de servidores autorizados a enviar emails por tu dominio
   - **DMARC**: Politica de autenticacion que protege contra spoofing
4. Agrega los registros en tu proveedor de dominio (ej: Cloudflare, GoDaddy, NIC.cl)
5. Click "Verificar" — puede tomar 24-48h en propagarse

### 9.6 Revenue Attribution
Steve Mail puede atribuir revenue a emails si tienes Shopify conectado:
- Trackea cuando un suscriptor hace click en un email y luego compra
- Ventana de atribucion: 5 dias despues del click

### 9.7 Product Alerts
Emails automaticos cuando un producto vuelve a tener stock o tiene descuento.

### 9.8 Send Time Optimization
Steve analiza cuando tus suscriptores abren emails y optimiza el horario de envio automaticamente.

### 9.9 Queue Health
Monitor del estado de la cola de envio. Muestra: emails en cola, enviados, rebotados, errores.

### Problemas comunes
- **"Emails llegan a spam"**: Configura tu dominio de envio (DKIM/SPF/DMARC). Sin esto, la entregabilidad es baja
- **"No puedo importar contactos"**: El CSV debe tener al menos una columna "email". Maximo 50,000 contactos por importacion
- **"Editor no carga"**: Recarga la pagina. Si usas un bloqueador de anuncios, desactivalo temporalmente para Steve Mail
- **"No veo la tab Steve Mail"**: Requiere plan Full
- **"Emails no se envian"**: Verifica que tienes dominio verificado y saldo de envios. Revisa Queue Health

---

## 10. WHATSAPP

### Que es
Hub de WhatsApp para comunicarte con tus clientes: inbox de conversaciones, campanas bulk, automatizaciones y creditos.

**Plan minimo:** Full

### Donde esta
Tab "WhatsApp" en el menu desplegable "Mas".

### 10.1 Setup
La conexion de WhatsApp requiere configuracion inicial. El equipo de Steve te ayuda con:
- Registrar numero de WhatsApp Business
- Configurar el servicio de mensajeria
- Conectar con Steve

### 10.2 Inbox de conversaciones
Bandeja unificada de mensajes de WhatsApp:
- Ver conversaciones con clientes
- Responder directamente desde Steve
- Buscar por nombre o numero
- Estado de conversacion: activa, pendiente, resuelta

### 10.3 Campanas bulk
Enviar mensajes masivos a multiples clientes:
- Usar templates aprobados por WhatsApp (requerido por Meta)
- Segmentar audiencia
- Programar envio
- Metricas: enviados, entregados, leidos

### 10.4 Automatizaciones
- **Carrito abandonado**: Enviar WA cuando alguien abandona el carrito
- **Confirmacion de compra**: WA automatico post-compra
- **Seguimiento de envio**: Notificacion cuando el pedido se despacha

### 10.5 Creditos
Sistema de creditos para mensajes de WhatsApp:
- Cada mensaje enviado consume creditos
- Ver saldo, historial de consumo, recargar
- Prospect trial: creditos de prueba para nuevos usuarios

### Problemas comunes
- **"No veo la tab WhatsApp"**: Requiere plan Full
- **"No puedo enviar mensajes"**: Verifica que tienes creditos disponibles y que el numero esta configurado
- **"Template rechazado"**: WhatsApp requiere templates aprobados para mensajes masivos. Evita contenido spam o promocional agresivo
- **"Mensajes no llegan"**: Verifica que el numero del destinatario tiene WhatsApp activo. Revisa creditos

---

## 11. DEEP DIVE — Analisis de Competencia

### Que es
Herramienta de analisis profundo de competidores que usa escaneo web + inteligencia artificial para generar insights accionables.

**Plan minimo:** Estrategia

### Donde esta
Tab "Deep Dive" en el menu desplegable "Mas".

### Que analiza
1. **Stack tecnologico**: Plataforma (Shopify, WooCommerce, Magento, custom), CMS, hosting, CDN
2. **Oferta irresistible**: H1 del sitio, texto hero, productos destacados con precios, propuesta de valor visible
3. **Sofisticacion de marketing**: Scripts detectados — Meta Pixel, Google Analytics, GTM, TikTok Pixel, Klaviyo, Hotjar, HubSpot, Criteo. Nivel: basico/intermedio/avanzado
4. **SEO y metadata**: Titulo, meta descripcion, Open Graph, canonical, schema markup
5. **Insights AI**: Resumen de estrategia del competidor, fortalezas, debilidades, oportunidades y recomendaciones para ti

### Como usarlo
1. Ingresa la URL del competidor (ej: www.competidor.cl)
2. Click "Analizar"
3. Steve escanea el sitio (puede tomar 30-60 segundos)
4. La IA analiza los datos y genera insights
5. Revisa los resultados organizados por seccion
6. Puedes analizar multiples competidores uno a la vez

### Problemas comunes
- **"Error al analizar"**: Algunos sitios bloquean el scraping con Cloudflare u otros WAFs. Intenta con otra URL
- **"Datos incompletos"**: Sitios con mucho JavaScript client-side pueden no escanear completamente. Los SPAs son mas dificiles
- **"Tarda mucho"**: El analisis puede tomar hasta 60 segundos. Si supera 2 minutos, recarga y reintenta
- **"No veo la tab Deep Dive"**: Requiere plan Estrategia o Full

---

## 12. ESTRATEGIA — Chat Estrategico

### Que es
Chat AI especializado en recomendaciones estrategicas basadas en tus datos REALES de Shopify, Meta y Google Ads. A diferencia de Steve Chat (que construye tu brief), Estrategia analiza tu rendimiento actual.

**Plan minimo:** Estrategia

### Donde esta
Tab "Estrategia" en el menu desplegable "Mas".

### Diferencia con Steve Chat
| Steve Chat | Estrategia |
|-----------|-----------|
| Construye tu brief de marca | Analiza datos en tiempo real |
| 17 preguntas estructuradas | Chat libre de preguntas |
| Genera perfil de marca | Da recomendaciones de optimizacion |
| Se hace una vez | Se usa continuamente |

### Que puede hacer
- Analizar rendimiento de campanas Meta y Google
- Recomendar presupuesto optimo por canal
- Sugerir estrategias de scaling (como crecer gasto manteniendo ROAS)
- Evaluar tu funnel: TOFU (awareness), MOFU (consideracion), BOFU (conversion)
- Dar recomendaciones de audiencias a probar
- Identificar campanas para pausar o escalar
- Sugerir contenido y creativos basados en rendimiento

### Preguntas sugeridas
- "Como estan mis campanas de Meta esta semana?"
- "Cual es mi ROAS real incluyendo todos los costos?"
- "Que estrategia me recomiendas para escalar al doble?"
- "Analiza mi TOFU — estoy gastando bien?"
- "Como distribuyo mi presupuesto entre Meta y Google?"
- "Que campanas deberia pausar?"

### Problemas comunes
- **"Steve Estrategia no tiene datos"**: Conecta al menos una plataforma (Shopify, Meta o Google) y espera la sincronizacion
- **"Respuestas muy genericas"**: Completa tu brief y conecta todas tus plataformas para mejores recomendaciones
- **"No veo la tab Estrategia"**: Requiere plan Estrategia o Full

---

## 13. SOCIAL HUB (Instagram/Facebook)

### Que es
Herramienta para publicar contenido en Instagram y Facebook, calendario editorial y metricas de social media.

**Plan minimo:** Visual (ver), Full (publicar)

### Donde esta
Tab "Social" en el menu desplegable "Mas".

### Funciones

#### Publisher (plan Full)
- Crear posts para Instagram y Facebook
- Subir imagenes/videos
- Escribir caption con emojis
- Programar fecha/hora de publicacion
- Preview de como se vera

#### Calendario
- Vista mensual de publicaciones programadas y publicadas
- Color-coded: publicado (verde), programado (azul), borrador (gris)
- Click en fecha para crear publicacion rapida

#### Metricas de social
- Seguidores, alcance, impresiones
- Engagement rate (likes + comments + shares / alcance)
- Top posts por engagement
- Crecimiento de seguidores

#### Inbox (dentro de Meta Ads)
- Mensajes directos de Instagram y Facebook en un solo lugar
- Responder directamente (plan Full)

### Problemas comunes
- **"No veo metricas de Instagram"**: Verifica que Meta esta conectado y que la cuenta de Instagram esta vinculada a tu pagina de Facebook
- **"No puedo publicar"**: Requiere plan Full y Meta conectado con permisos de publicacion
- **"Post no se publico"**: Verifica que la imagen cumple con los requisitos de Instagram (formato cuadrado recomendado, max 30 hashtags)

---

## 14. ACADEMY

### Que es
Plataforma de cursos y tutoriales para aprender a usar Steve y marketing digital.

**Plan minimo:** Visual (cursos basicos), Estrategia (contenido avanzado)

### Donde esta
Tab "Academy" en el menu desplegable "Mas".

### Contenido
- **Cursos basicos** (todos los planes): Como conectar plataformas, usar el dashboard, crear tu brief
- **Cursos avanzados** (plan Estrategia+): Estrategia de Meta Ads, Google Ads, email marketing, optimizacion de funnel
- **Certificaciones**: Completa cursos y obtiene certificados
- **Tutoriales en video**: Paso a paso de cada herramienta

### Problemas comunes
- **"No veo cursos avanzados"**: Requiere plan Estrategia o Full
- **"Video no carga"**: Verifica tu conexion a internet. Los videos se cargan desde servidores externos

---

## 15. CRM — Ventas y Prospectos

### Que es
Sistema de CRM para gestionar prospectos, deals, tareas, propuestas y formularios web.

### Funciones
- **Prospects Kanban**: Vista kanban de prospectos por etapa (nuevo, contactado, calificado, propuesta, cerrado)
- **Deals**: Pipeline de ventas con valor y probabilidad de cierre
- **Tasks**: Tareas asignables con fecha de vencimiento
- **Proposals**: Crear y enviar propuestas comerciales
- **Web Forms**: Formularios embebibles para capturar leads desde tu sitio

### Problemas comunes
- **"No veo el CRM"**: El CRM esta integrado en la seccion de WhatsApp/Ventas
- **"Formulario no captura leads"**: Verifica que el codigo del formulario esta correctamente embebido en tu sitio

---

## 16. CONFIGURACION

### Que es
Panel para configurar costos, margenes, perfil de cuenta y gestion de usuarios.

**Plan minimo:** Visual (perfil, costos), Estrategia (gestion usuarios)

### Donde esta
Tab "Configuracion" en el portal (tab principal).

### 16.1 Perfil y cuenta
- Nombre, email, empresa, logo
- Cambiar contrasena
- Ver plan activo

### 16.2 Configuracion financiera
Los costos y margenes se usan para calcular Profit y metricas financieras en el dashboard.

1. **Margen por defecto**: Porcentaje de margen aplicado a todos los productos (default 30%)
2. **Costos fijos mensuales**:
   - Plan Shopify
   - Plan Klaviyo
   - Otros costos fijos
   - Items personalizados (agregar/quitar los que necesites)
3. **Costos variables**:
   - Comision pasarela de pago (default 3.5%)
   - Costo de envio por orden
   - Comision Shopify (%)
4. **Ajustes manuales**:
   - Gasto Google Ads (si no esta conectado automaticamente)
   - Otros gastos de marketing
5. **Margenes por producto**: Sobrescribir margen para SKUs especificos cuando el margen difiere del default

### 16.3 Billing y plan
- Ver plan actual (Visual, Estrategia, Full)
- Features incluidas en tu plan
- Contactar equipo para cambiar plan

### 16.4 Gestion de usuarios (plan Estrategia+)
- Agregar usuarios adicionales a tu cuenta
- Asignar roles y permisos

### Problemas comunes
- **"Profit aparece negativo"**: Revisa tus costos fijos y variables. El margen por defecto puede estar bajo, o los costos fijos altos
- **"No se donde poner mi gasto de Google Ads"**: Si Google Ads no esta conectado, ingresalo manualmente en "Ajustes manuales"
- **"Quiero margen distinto por producto"**: Usa "Margenes por producto" y agrega el SKU con su margen especifico
- **"Como cambio mi plan"**: Contacta al equipo por email (jmbarros@bgconsult.cl) o WhatsApp
- **"No puedo agregar usuarios"**: Requiere plan Estrategia o Full

---

## 17. ATAJOS Y NAVEGACION

### Command Palette (Cmd+K / Ctrl+K)
Abre la busqueda rapida para navegar entre tabs, buscar funciones y ejecutar acciones.

### Keyboard Shortcuts
- **1**: Tab Steve
- **2**: Tab Brief
- **3**: Tab Metricas
- **4**: Tab Conexiones
- **5**: Tab Configuracion
- **Cmd+K / Ctrl+K**: Command Palette

### Navegacion mobile
- En celular, la navegacion esta en la barra inferior
- Tabs principales: iconos en la barra
- Tabs secundarias: boton "Mas" con menu desplegable
- Todas las funciones estan disponibles en mobile

### Sincronizacion de datos
- Los datos se actualizan automaticamente cada 6 horas
- Para forzar: ve a Conexiones → click "Sincronizar" en la plataforma que quieras
- Despues de reconectar una plataforma, la sync es automatica
- La primera sincronizacion despues de conectar puede tomar varios minutos

---

## 18. SETUP Y ONBOARDING

### Progress Tracker
Al entrar al portal por primera vez, veras una barra de progreso en la parte superior con estos pasos:
1. Conectar Shopify
2. Conectar Meta
3. Conectar Google Ads
4. Completar Brand Brief con Steve
5. Configurar finanzas (costos y margenes)

Click en cada paso para ir directamente a la seccion. La barra se puede minimizar y desaparece cuando completas todo.

### Orden recomendado para empezar
1. **Conexiones**: Conecta tus plataformas (Shopify primero, luego Meta y/o Google)
2. **Steve Chat**: Completa las 17 preguntas del brief (plan Estrategia+)
3. **Configuracion**: Configura tus costos y margenes
4. **Metricas**: Explora tu dashboard unificado
5. **Campanas**: Crea tu primera campana (Meta Ads o Google Ads, plan Full)

### Smart Default Tab
Steve elige automaticamente la tab inicial segun tu estado:
- Sin conexiones → Tab Conexiones
- Con conexiones pero sin brief → Tab Steve
- Con conexiones y brief → Tab Metricas

---

## 19. ERRORES COMUNES — TROUBLESHOOTING POR MODULO

### Generales
- **"La pagina no carga"**: Recarga con Cmd+Shift+R (hard refresh). Verifica tu conexion. Si persiste, intenta en modo incognito
- **"Me deslogueo constantemente"**: Las sesiones expiran por seguridad. Limpia cookies de steve.cl y vuelve a loguearte
- **"No veo una tab/seccion"**: Puede estar en el menu "Mas" (tabs secundarias). En mobile, desliza la barra inferior. Si tiene candado, requiere plan superior
- **"Error al guardar"**: Verifica conexion a internet. Recarga e intenta de nuevo
- **"Los datos estan en 0 o vacios"**: 1) Verifica conexion (badge verde), 2) Fuerza sync en Conexiones, 3) Espera unos minutos, 4) Desconecta y reconecta
- **"Pagina queda en blanco"**: Hard refresh (Cmd+Shift+R). Si persiste, limpia cache del navegador
- **"Error 500 / Error interno"**: Problema temporal del servidor. Espera unos minutos e intenta de nuevo
- **"Error de red / Offline"**: Aparece banner rojo "Sin conexion". Verifica tu WiFi/datos

### Meta Ads especificos
- **"Error 100: Invalid parameter"**: La campana tiene un campo invalido. Revisa audiencia, presupuesto y fechas
- **"Error 190: Token invalido"**: Desconecta y reconecta Meta en Conexiones
- **"Error 1487: Budget too low"**: El presupuesto diario minimo para Meta es $1 USD. Aumenta el presupuesto
- **"Ad rejected"**: Revisa politicas de Meta. Evita: claims medicos, antes/despues, texto excesivo en imagenes
- **"Account disabled"**: Tu cuenta de Meta Ads fue deshabilitada. Contacta soporte de Meta directamente
- **"No ad accounts found"**: Tu usuario de Facebook no tiene cuentas publicitarias. Crea una en business.facebook.com

### Google Ads especificos
- **"Budget too low"**: Google Ads tiene minimo de presupuesto diario por campana. Aumentalo
- **"Ad disapproved"**: Revisa politicas de Google. Causa comun: landing page no funcional, claims exagerados
- **"Low Quality Score"**: Mejora relevancia entre keyword, copy y landing page

### Shopify especificos
- **"Products not syncing"**: Verifica que el Custom App tenga scope `read_products`. Reconecta si es necesario
- **"Orders missing"**: La sync trae ordenes recientes. Ordenes muy antiguas pueden no aparecer
- **"Inventory mismatch"**: Los datos de inventario se sincronizan cada 6h. Fuerza sync para dato actual

### Email especificos
- **"Bounced emails"**: Emails invalidos o bandejas llenas. Limpia tu lista de contactos
- **"Low open rate"**: Mejora asunto (subject line), evita palabras spam, usa dominio verificado
- **"Unsubscribe rate alta"**: Reduce frecuencia de envio, mejora segmentacion, agrega valor en cada email

### Klaviyo especificos
- **"Flows not showing"**: Verifica que la API key tenga permisos de Read Flows
- **"Metrics delayed"**: Klaviyo reporta metricas con delay de hasta 24h

### WhatsApp especificos
- **"Message not delivered"**: El destinatario no tiene WhatsApp o su numero es incorrecto
- **"Template pending approval"**: WhatsApp revisa templates antes de aprobarlos. Puede tomar 24h
- **"Insufficient credits"**: Compra mas creditos en WhatsApp → Creditos

---

## 20. CONTACTO Y ESCALACION

Si Chonga no puede resolver tu problema:
- **Email**: jmbarros@bgconsult.cl
- **WhatsApp**: Link en el boton flotante verde en la esquina inferior
- **Agendar reunion**: meetings.hubspot.com/jose-manuel15

Chonga puede crear un ticket automaticamente si el problema requiere atencion del equipo tecnico.

---

## 21. GLOSARIO DE TERMINOS

- **A/B Test**: Probar dos variaciones para ver cual funciona mejor
- **Ad Set**: Conjunto de anuncios dentro de una campana (nivel de audiencia y presupuesto en Meta)
- **AOV**: Average Order Value — valor promedio de cada orden ($ingresos / ordenes)
- **BOFU**: Bottom Of Funnel — decision de compra (personas listas para comprar)
- **Brief**: Documento que resume tu marca, audiencia, competencia y estrategia
- **Broad Match**: Tipo de keyword en Google Ads que alcanza busquedas relacionadas ampliamente
- **CAC**: Customer Acquisition Cost — costo total de adquirir un cliente
- **Callout**: Extension de Google Ads con texto corto destacado
- **CPA**: Cost Per Acquisition — cuanto cuesta una conversion
- **CPC**: Cost Per Click — cuanto pagas por cada click
- **CPM**: Cost Per Mille — cuanto pagas por 1000 impresiones
- **CTR**: Click-Through Rate — porcentaje de personas que hacen click (clicks / impresiones)
- **Custom Audience**: Audiencia basada en tus datos (emails, visitantes, compradores)
- **DKIM**: Firma digital de email que verifica autenticidad del remitente
- **DMARC**: Politica de autenticacion de email contra spoofing
- **DPA**: Dynamic Product Ads — anuncios que muestran productos de tu catalogo automaticamente
- **Engagement Rate**: Tasa de interaccion (likes + comments + shares / alcance)
- **Exact Match**: Tipo de keyword en Google Ads que requiere coincidencia exacta
- **Flow**: Secuencia automatizada de emails (ej: bienvenida, carrito abandonado)
- **Fulfillment**: Proceso de preparar y enviar un pedido
- **Editor visual**: Editor drag & drop de Steve Mail para crear emails sin codigo
- **Health Score**: Indice de salud del negocio calculado por Steve (0-100)
- **Impression Share**: Porcentaje de veces que tu anuncio aparecio vs las oportunidades
- **LAA**: Lookalike Audience — audiencia similar a tus clientes actuales
- **LTV**: Lifetime Value — valor total que un cliente genera en su vida
- **MOFU**: Middle Of Funnel — consideracion (personas evaluando opciones)
- **Negative Keywords**: Palabras clave negativas que excluyen busquedas irrelevantes
- **OAuth**: Metodo seguro de autorizacion para conectar plataformas sin compartir contrasena
- **Phrase Match**: Tipo de keyword en Google Ads que requiere la frase en orden
- **Pixel**: Codigo de tracking que se instala en tu sitio para medir conversiones de Meta
- **Quality Score**: Puntuacion de calidad de Google Ads (1-10) basada en relevancia
- **Retargeting**: Mostrar anuncios a personas que ya visitaron tu sitio o interactuaron
- **ROAS**: Return On Ad Spend — cuanto ganas por cada peso invertido. ROAS 3x = $3 por cada $1
- **RSA**: Responsive Search Ad — formato de anuncio de Google que combina headlines automaticamente
- **Sitelink**: Extension de Google Ads con link adicional debajo del anuncio
- **SKU**: Stock Keeping Unit — identificador unico de producto
- **SPF**: Registro DNS que lista servidores autorizados a enviar emails por tu dominio
- **SUAT**: System User Access Token — token de sistema para conexiones empresariales con Meta
- **TOFU**: Top Of Funnel — awareness (personas que aun no conocen tu marca)
- **UTM**: Parametros de tracking en URLs para atribuir trafico (source, medium, campaign)
- **Webhook**: Notificacion automatica entre sistemas cuando ocurre un evento
