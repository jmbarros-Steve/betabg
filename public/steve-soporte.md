# Steve Soporte — Base de Conocimiento Completa

> Este documento es el contexto completo para el bot de soporte de Steve Ads.
> Contiene cada modulo, pantalla, flujo, integracion y solucion a problemas comunes.

---

## RESUMEN DE LA PLATAFORMA

Steve es una plataforma de marketing AI para e-commerce. Integra Shopify, Meta Ads, Google Ads, Klaviyo y WhatsApp en un solo portal. Los clientes se logean en steve.cl/portal y acceden a todas las herramientas.

### Tabs del Portal

**Tabs principales** (siempre visibles en desktop):
- Steve (chat AI de estrategia y brief)
- Brief (ver resultados del brief de marca)
- Metricas (dashboard de KPIs)
- Conexiones (conectar plataformas)
- Configuracion (costos y margenes)

**Tabs secundarias** (menu desplegable):
- Shopify (analytics de e-commerce)
- Campanas (metricas de campanas Meta + Google)
- Deep Dive (analisis de competencia)
- Estrategia (chat de estrategia con Steve)
- Meta Ads (crear y gestionar campanas)
- Instagram (publicar contenido)
- Google Ads (generar copies)
- Klaviyo (email marketing)
- Steve Mail (editor de emails propio)
- WhatsApp (mensajeria)

---

## 1. CONEXIONES — Como conectar cada plataforma

### 1.1 Shopify
**Donde:** Tab "Conexiones" → seccion Shopify → "Conectar Shopify"

**Pasos:**
1. Click en "Conectar Shopify"
2. Se abre un wizard paso a paso (Custom App Wizard)
3. Ingresar el nombre de tu tienda (sin .myshopify.com)
4. Autorizar permisos en Shopify
5. Esperar confirmacion — aparece badge verde "Conectado"

**Problemas comunes:**
- **"No se pudo conectar"**: Verifica que el nombre de la tienda sea correcto, sin espacios ni .myshopify.com
- **"Error de permisos"**: Debes ser admin o owner de la tienda Shopify
- **"Datos no aparecen"**: Los datos se sincronizan automaticamente. Click en "Sincronizar" para forzar. La primera sincronizacion puede tomar unos minutos
- **"Desconectar y reconectar"**: Ve a Conexiones → click "Desconectar" en Shopify → confirmar → volver a conectar

### 1.2 Meta Ads (Facebook/Instagram)
**Donde:** Tab "Conexiones" → seccion Meta → "Conectar con Meta"

**Pasos:**
1. Click en "Conectar con Meta"
2. Se abre ventana de Facebook para autorizar
3. Acepta todos los permisos (ads_read, ads_management, business_management, Instagram)
4. Selecciona la cuenta de negocio correcta
5. Vuelve al portal — aparece badge verde "Conectado"

**Problemas comunes:**
- **"No veo mis campanas"**: Verifica que seleccionaste la cuenta de Business Manager correcta en el selector de cuentas
- **"Error de autorizacion"**: Debes tener rol de admin o anunciante en el Business Manager
- **"Permisos insuficientes"**: Al conectar, asegurate de aceptar TODOS los permisos que pide Facebook
- **"Cuenta incorrecta"**: Ve a Conexiones → click el selector de cuenta Meta → elige otra cuenta
- **"Token expirado"**: Desconecta y vuelve a conectar Meta. Los tokens se renuevan automaticamente pero a veces requiere reconexion manual

### 1.3 Google Ads
**Donde:** Tab "Conexiones" → seccion Google Ads → "Conectar Google Ads"

**Pasos:**
1. Click en "Conectar Google Ads"
2. Se abre ventana de Google OAuth
3. Selecciona tu cuenta de Google
4. Autoriza permisos de Google Ads
5. Vuelve al portal — aparece badge verde

**Problemas comunes:**
- **"No se encontraron campanas"**: Verifica que la cuenta Google tiene campanas activas
- **"Error de OAuth"**: Intenta con otro navegador o modo incognito. A veces las extensiones bloquean el popup
- **"Datos desactualizados"**: Click en "Sincronizar" en Conexiones para forzar actualizacion

### 1.4 Klaviyo
**Donde:** Tab "Conexiones" → seccion Klaviyo → ingresar API Key

**Pasos:**
1. Ve a tu cuenta de Klaviyo → Settings → API Keys
2. Crea una Private API Key (empieza con pk_...)
3. Copia la key
4. En Steve, ve a Conexiones → Klaviyo → pega la Private API Key
5. Click "Conectar" — aparece badge verde

**Problemas comunes:**
- **"API Key invalida"**: Asegurate de copiar la Private API Key, NO la Public Key. Empieza con pk_
- **"No veo mis campanas de Klaviyo"**: La key debe tener permisos de lectura de campanas y flujos
- **"Como obtengo la API Key"**: En Klaviyo → Settings (engranaje) → API Keys → Create Private API Key → Full Access

### 1.5 WhatsApp
**Donde:** Tab "Conexiones" → seccion WhatsApp

**Pasos:**
1. Ingresa tu numero de WhatsApp Business
2. Escanea el codigo QR que aparece
3. Se conecta al servicio de Steve via WhatsApp

**Nota:** Esta funcion requiere credenciales de Twilio configuradas. Si no funciona, contacta al equipo.

---

## 2. STEVE CHAT — Tu consultor AI

### Que es
Steve es un chat de inteligencia artificial que te ayuda a construir tu brief de marca y definir tu estrategia de marketing. Funciona como un consultor que te hace preguntas sobre tu negocio.

### Donde esta
Tab "Steve" en el portal.

### Como funciona
1. Steve te hace preguntas estructuradas sobre tu negocio
2. Tu respondes llenando formularios o escribiendo
3. Steve procesa las respuestas y genera tu Brief de Marca
4. El brief se usa para personalizar todos los copies y recomendaciones

### Preguntas que hace Steve
Steve recopila informacion en este orden:
1. URL de tu sitio web
2. Pitch de tu negocio (que vendes, a quien)
3. Numeros financieros (precio promedio, costo, envio, facturacion mensual, presupuesto de ads)
4. Canales de venta (% por canal: web, tienda fisica, marketplace, etc.)
5. Persona del cliente (nombre, edad, genero, ciudad, ocupacion, ingresos, familia, motivacion)
6. Puntos de dolor del cliente
7. Vocabulario del cliente (como habla)
8. Promesa de transformacion
9. Estilo de vida del cliente
10. 3 competidores principales (nombre + URL)
11. Debilidades de competidores y tus ventajas
12. Tu ventaja unica (diferenciador)
13. Promesa "vaca purpura" (lo que te hace inolvidable)
14. Villano + garantia
15. Prueba social y evidencia

### Problemas comunes
- **"Steve no responde"**: Recarga la pagina. Si persiste, puede ser un problema temporal del servidor
- **"Perdi mi conversacion"**: Las conversaciones se guardan automaticamente. Vuelve a la tab Steve y deberian estar ahi
- **"Quiero editar una respuesta"**: Puedes editar respuestas anteriores haciendo click en el mensaje
- **"El porcentaje de canales no suma 100%"**: Los porcentajes de canales de venta deben sumar exactamente 100%
- **"Steve da respuestas genericas"**: Completa tu brief primero. Steve mejora mucho cuando conoce tu marca

---

## 3. BRIEF DE MARCA

### Que es
El Brief es el documento completo de tu marca generado por Steve a partir de tus respuestas. Es la base para todas las recomendaciones y copies que genera la plataforma.

### Donde esta
Tab "Brief" en el portal.

### Que incluye
1. **Identidad de marca** — Colores, tipografia, estetica
2. **Perfil del consumidor** — Persona detallada con imagen
3. **Estrategia de posicionamiento** — Propuesta unica de valor
4. **Analisis de competidores** — Fortalezas y debilidades de 3 competidores
5. **Analisis financiero** — Margenes, rentabilidad
6. **Plan de accion** — Proximos pasos recomendados
7. **Estrategia Meta Ads** — Campanas recomendadas
8. **Estrategia Google Ads** — Anuncios sugeridos
9. **Keywords** — Palabras clave objetivo
10. **Presupuesto y funnel** — Distribucion de gasto

### Acciones disponibles
- **Descargar PDF**: Boton "Descargar" genera PDF con tu brief completo, con branding de Steve
- **Editar brief**: Click "Editar" te lleva de vuelta al chat con Steve
- **Subir assets**: Puedes subir tu logo, fuentes y colores de marca

### Problemas comunes
- **"El brief esta incompleto"**: Debes completar TODAS las preguntas de Steve. Vuelve a la tab Steve y sigue respondiendo
- **"No puedo descargar el PDF"**: Verifica que tu navegador permite descargas. Intenta con Chrome
- **"Quiero actualizar mi brief"**: Ve a la tab Steve y edita tus respuestas. El brief se actualiza automaticamente

---

## 4. METRICAS — Dashboard de KPIs

### Que es
Panel unificado que muestra las metricas de todas tus plataformas conectadas: ventas de Shopify, gasto y rendimiento de Meta Ads y Google Ads.

### Donde esta
Tab "Metricas" en el portal.

### KPIs que muestra
- **Ingresos totales**: Ventas de Shopify
- **Ordenes**: Cantidad de transacciones
- **ROAS**: Retorno sobre gasto publicitario (Ingresos / Gasto en Ads)
- **AOV**: Valor promedio de orden (Ingresos / Ordenes)
- **CAC**: Costo de adquisicion de cliente (Gasto / Conversiones)
- **Profit**: Ganancia neta
- **Health Score**: Indice de salud del negocio (0-100)

### Filtros de fecha
- 7 dias, 30 dias (por defecto), 90 dias
- Mes actual (MTD), Ano actual (YTD)
- Rango personalizado
- Comparacion con periodo anterior (muestra tendencia ▲▼)

### Graficos
- Tendencia de ingresos (area chart)
- Tendencia de ordenes
- Rendimiento por dia de la semana
- Funnel de conversion (sesiones → carrito → checkout → compra)
- Analisis de cohortes
- Top SKUs (productos mas vendidos)
- Carritos abandonados
- Margenes por producto

### Problemas comunes
- **"No veo datos"**: Verifica que tienes plataformas conectadas en la tab Conexiones. Los datos tardan hasta 6 horas en sincronizarse
- **"Los numeros no cuadran"**: Los datos se actualizan cada 6 horas. Click en "Sincronizar" en Conexiones para forzar actualizacion
- **"ROAS aparece como 0 o infinito"**: Necesitas tener tanto Shopify (ingresos) como Meta/Google (gasto) conectados para calcular ROAS
- **"No veo el periodo que quiero"**: Usa el filtro de fecha personalizado en la parte superior del dashboard
- **"Las metricas estan cargando"**: Espera unos segundos. Si persiste, recarga la pagina

---

## 5. SHOPIFY ANALYTICS

### Que es
Dashboard completo de tu tienda Shopify con ventas, productos, ordenes, descuentos y mas.

### Donde esta
Tab secundaria "Shopify" (menu desplegable).

### Secciones
1. **Ventas**: Grafico diario de ingresos y ordenes, rendimiento por dia de la semana, ventas por canal, analisis UTM
2. **Top SKUs**: Productos mas vendidos con imagen, cantidad y facturacion
3. **Carritos abandonados**: Carritos incompletos con valor alto para recuperar
4. **Funnel de conversion**: Sesiones → Agregar al carrito → Checkout → Compra
5. **Ordenes**: Listado de ordenes recientes con estado de fulfillment
6. **Productos**: Catalogo completo con busqueda y filtros
7. **Descuentos**: Codigos de descuento activos con uso y rendimiento
8. **Clientes**: Lista de clientes con lifetime value y frecuencia de compra
9. **Fulfillment**: Tasa de despacho y tiempos promedio

### Problemas comunes
- **"No aparecen mis productos"**: Click en "Sincronizar" en la tab Conexiones. La primera sync puede tomar unos minutos
- **"Datos desactualizados"**: Los datos se sincronizan cada 6 horas automaticamente. Fuerza sync en Conexiones
- **"No veo las ordenes de hoy"**: La sincronizacion tiene un delay. Usa "Sincronizar" para datos mas recientes

---

## 6. META ADS MANAGER

### Que es
Herramienta completa para crear, gestionar y analizar campanas de Facebook e Instagram Ads.

### Donde esta
Tab secundaria "Meta Ads" (menu desplegable).

### Secciones
1. **Dashboard**: Resumen de rendimiento, campanas recientes
2. **Vista de arbol**: Campana → Conjunto de anuncios → Anuncio (jerarquia)
3. **Crear campana**: Wizard paso a paso (objetivo → presupuesto → audiencia → ubicaciones → creativo → revisar)
4. **Mis campanas**: Listado con filtros, estado (activa/pausada/draft), acciones masivas
5. **Crear anuncio**: Creador rapido con generador de copies AI
6. **Audiencias**: Crear y gestionar audiencias (lookalike, custom, guardadas)
7. **Biblioteca**: Repositorio de creativos usados
8. **Analytics**: Metricas por campana (spend, impressions, clicks, CTR, CPC, CPM, conversions, ROAS)
9. **Social Inbox**: Mensajes de Facebook/Instagram
10. **Reglas automatizadas**: Pausar ads bajo rendimiento, escalar ganadores
11. **Ads de competidores**: Espiar anuncios de competidores
12. **Borradores**: Campanas en progreso guardadas
13. **Pixel Setup**: Configurar Meta Pixel para tracking

### Como crear una campana
1. Click en "Crear Campana" o ir a la seccion Crear
2. **Paso 1**: Elegir objetivo (reconocimiento, trafico, conversiones, etc.)
3. **Paso 2**: Definir presupuesto (diario o total) y fechas
4. **Paso 3**: Configurar audiencia (edad, genero, ubicacion, intereses)
5. **Paso 4**: Elegir ubicaciones (Instagram, Facebook, Audience Network)
6. **Paso 5**: Crear creativo (copy + imagenes/video). Puedes usar el generador AI
7. **Paso 6**: Revisar todo y publicar

### Preview de anuncios
Puedes ver como se vera tu anuncio en: Desktop Feed, Stories, Reels, Marketplace, mobile y desktop.

### Problemas comunes
- **"No veo mis campanas de Meta"**: Verifica que Meta esta conectado en Conexiones y que seleccionaste la cuenta correcta
- **"Error al crear campana"**: Verifica que tu cuenta Meta tiene metodo de pago activo
- **"Copies generados son genericos"**: Completa tu Brief de Marca primero. Steve usa el brief para personalizar copies
- **"No puedo pausar una campana"**: Necesitas permisos de admin o anunciante en Meta Business Manager
- **"Metricas no coinciden con Facebook"**: Los datos se sincronizan periodicamente. Puede haber un delay de horas

---

## 7. GOOGLE ADS

### Que es
Generador de copies para campanas de Google Ads con IA.

### Donde esta
Tab secundaria "Google Ads" (menu desplegable).

### Tipos de campana
1. **Search**: Anuncios de texto en resultados de busqueda
2. **Display**: Anuncios visuales en la red de display
3. **Performance Max**: Campanas automatizadas
4. **Remarketing**: Retargeting de visitantes

### Como generar copies
1. Selecciona tipo de campana
2. (Opcional) Agrega instrucciones personalizadas
3. Click "Generar"
4. La IA genera: 3 headlines cortos, 2 headlines largos, 2 descripciones, sitelinks
5. Revisa, edita y guarda

### Historial
- Ve todos los copies generados anteriormente
- Filtra por tipo de campana
- Edita y reutiliza
- Descarga como CSV/PDF

### Problemas comunes
- **"Copies muy genericos"**: Agrega instrucciones especificas en el campo "Custom Instructions" y asegurate de tener el brief completo
- **"No puedo generar"**: Verifica tu conexion a internet. Si persiste, recarga la pagina

---

## 8. KLAVIYO STUDIO

### Que es
Centro de email marketing integrado con Klaviyo para crear campanas, flujos automatizados, gestionar templates y calendario de envios.

### Donde esta
Tab secundaria "Klaviyo" (menu desplegable).

### Secciones
1. **Plantillas**: Templates predefinidos por categoria (newsletter, promocional, carrito abandonado, bienvenida). Puedes importar templates desde tu cuenta Klaviyo
2. **Crear Campana**: Wizard paso a paso — elegir template → nombre/asunto → disenar email → audiencia → programar → enviar
3. **Flujos**: Automatizaciones (welcome series, carrito abandonado, post-compra, re-engagement, cumpleanos)
4. **Calendario**: Vista mensual de campanas programadas. Click en fecha para crear campana rapida
5. **Metricas**: Rendimiento por campana (enviados, abiertos, clicks, conversiones, revenue)
6. **Chat Steve**: Recomendaciones AI para tus campanas de email

### Editor de emails
- Editor drag & drop visual
- Bloques: texto, imagen, boton, divisor, iconos sociales, espaciador, columnas
- Variables dinamicas: {{first_name}}, {{email}}, {{last_order_date}}, {{lifetime_value}}
- Colores y fuentes de tu marca

### Problemas comunes
- **"No veo mis campanas de Klaviyo"**: Verifica que Klaviyo esta conectado con la Private API Key en Conexiones
- **"Templates no cargan"**: Recarga la pagina. Si persiste, verifica la conexion de Klaviyo
- **"Variables no funcionan"**: Las variables tipo {{first_name}} requieren que tus contactos tengan esos datos en Klaviyo
- **"Calendario vacio"**: No tienes campanas programadas. Crea una en "Crear Campana"

---

## 9. STEVE MAIL

### Que es
Sistema de email marketing propio de Steve con editor drag & drop, alternativa a Klaviyo.

### Donde esta
Tab secundaria "Steve Mail" (menu desplegable).

### Secciones
1. **Campanas**: Crear y enviar emails con editor visual
2. **Contactos**: Gestionar lista de suscriptores. Importar desde CSV, Shopify o manual. Segmentar por comportamiento
3. **Automatizaciones**: Flujos automaticos de email (tipo Klaviyo flows)
4. **Formularios**: Crear formularios de opt-in para capturar emails
5. **Rendimiento**: Metricas de campanas (enviados, entregados, abiertos, clicks, rebotes, desuscripciones)
6. **Configurar dominio**: Setup de DKIM, SPF, DMARC para enviar desde tu dominio

### Configurar dominio de envio
1. Ve a Steve Mail → "Configurar dominio"
2. Ingresa tu dominio (ej: mitienda.cl)
3. Steve te muestra los registros DNS que debes agregar (DKIM, SPF, DMARC)
4. Agrega los registros en tu proveedor de dominio
5. Click "Verificar" — puede tomar hasta 48h en propagarse

### Problemas comunes
- **"Emails llegan a spam"**: Configura tu dominio de envio (DKIM/SPF/DMARC). Sin esto, los emails pueden caer en spam
- **"No puedo importar contactos"**: El CSV debe tener al menos una columna "email". Formatos aceptados: .csv
- **"Editor no carga"**: Recarga la pagina. Si usas un bloqueador de anuncios, desactivalo temporalmente

---

## 10. DEEP DIVE — Analisis de Competencia

### Que es
Herramienta de analisis de competidores usando web scraping con IA.

### Donde esta
Tab secundaria "Deep Dive" (menu desplegable).

### Que analiza
1. **Stack tecnologico**: Plataforma (Shopify, WooCommerce, etc.), CMS, hosting
2. **Oferta irresistible**: H1, texto hero, productos destacados con precios
3. **Sofisticacion de marketing**: Scripts detectados (Meta Pixel, Google Analytics, GTM, TikTok Pixel, Klaviyo, Hotjar). Nivel: basico/intermedio/avanzado
4. **SEO y metadata**: Titulo, meta descripcion, Open Graph
5. **Insights AI**: Resumen de estrategia, fortalezas, debilidades, recomendaciones

### Como usarlo
1. Ingresa la URL del competidor
2. Click "Analizar"
3. Espera el escaneo (puede tomar 30-60 segundos)
4. Revisa los resultados con insights de IA

### Problemas comunes
- **"Error al analizar"**: Algunos sitios bloquean el scraping. Intenta con otra URL
- **"Datos incompletos"**: Sitios con mucho JavaScript pueden no escanear completamente
- **"Quiero analizar mas competidores"**: Puedes analizar multiples URLs, una a la vez

---

## 11. ESTRATEGIA — Chat de Estrategia

### Que es
Chat AI especializado en recomendaciones estrategicas basadas en tus datos reales.

### Donde esta
Tab secundaria "Estrategia" (menu desplegable).

### Que puede hacer
- Analizar rendimiento de campanas
- Recomendar presupuesto optimo
- Sugerir estrategias de scaling
- Evaluar tu funnel (TOFU/MOFU/BOFU)
- Dar recomendaciones de audiencias

### Preguntas sugeridas
- "Como estan mis campanas de Meta?"
- "Cual es mi ROAS real?"
- "Que estrategia me recomiendas para escalar?"
- "Analiza mi TOFU"
- "Como distribuyo mi presupuesto?"

### Diferencia con Steve Chat
- **Steve (tab Steve)**: Construye tu brief y perfil de marca
- **Estrategia**: Da recomendaciones basadas en metricas y datos de campanas

---

## 12. INSTAGRAM

### Que es
Herramienta para crear publicaciones de Instagram y gestionar un calendario de contenido.

### Donde esta
Tab secundaria "Instagram" (menu desplegable).

### Funciones
1. **Publicar**: Crear posts con imagen, caption, programar fecha/hora, tags, ubicacion
2. **Calendario**: Vista mensual de publicaciones programadas. Drag & drop para reprogramar

---

## 13. CONFIGURACION FINANCIERA

### Que es
Panel para configurar costos y margenes que se usan en los calculos de profit y ROAS del dashboard.

### Donde esta
Tab "Configuracion" en el portal.

### Que puedes configurar
1. **Margen por defecto**: Porcentaje de margen aplicado a todos los productos (default 30%)
2. **Costos fijos**:
   - Plan Shopify (mensual)
   - Plan Klaviyo (mensual)
   - Otros costos fijos
   - Items personalizados (agregar/quitar)
3. **Costos variables**:
   - Comision pasarela de pago (default 3.5%)
   - Costo de envio por orden
   - Comision Shopify (%)
4. **Ajustes manuales**:
   - Gasto Google Ads (si no esta conectado automaticamente)
5. **Margenes por producto**: Sobrescribir margen para SKUs especificos

### Problemas comunes
- **"Profit aparece negativo"**: Revisa tus costos fijos y variables. Puede que el margen por defecto sea muy bajo
- **"No se donde poner mi gasto de Google Ads"**: Si Google Ads no esta conectado, ingresalo manualmente en "Ajustes manuales"
- **"Quiero margen distinto por producto"**: Usa "Margenes por producto" y agrega el SKU con su margen especifico

---

## 14. SETUP Y ONBOARDING

### Progress Tracker
Al entrar al portal por primera vez, veras una barra de progreso en la parte superior con estos pasos:
1. Conectar Shopify
2. Conectar Meta
3. Conectar Google Ads
4. Completar Brand Brief
5. Configurar finanzas

Click en cada paso para ir directamente a la seccion correspondiente. La barra se puede minimizar.

### Orden recomendado
1. Primero conecta tus plataformas (Conexiones)
2. Luego completa el Brief con Steve (tab Steve)
3. Configura tus costos (Configuracion)
4. Explora tus metricas (Metricas)
5. Crea tu primera campana (Meta Ads o Google Ads)

---

## 15. ATAJOS Y TIPS

### Command Palette
- **Cmd+K** (Mac) o **Ctrl+K** (Windows): Abre busqueda rapida para navegar entre tabs

### Sincronizacion
- Los datos se actualizan automaticamente cada 6 horas
- Para forzar: ve a Conexiones → click "Sincronizar" en la plataforma que quieras
- Despues de reconectar una plataforma, la sync es automatica

### Mobile
- En celular, la navegacion esta en la barra inferior
- Todas las funciones estan disponibles en mobile
- Para tabs secundarias, usa el menu hamburguesa

---

## 16. PROBLEMAS GENERALES

### "La pagina no carga"
1. Recarga con Cmd+Shift+R (hard refresh)
2. Verifica tu conexion a internet
3. Intenta en modo incognito
4. Si persiste, puede ser un problema temporal del servidor

### "Me deslogueo constantemente"
- Tu sesion expira por seguridad. Vuelve a iniciar sesion
- Si pasa muy seguido, limpia las cookies de steve.cl y vuelve a loguearte

### "No veo una tab/seccion"
- Algunas tabs estan en el menu desplegable (click en la flecha al lado de las tabs principales)
- En mobile, desliza la barra inferior o usa el menu

### "Error al guardar"
- Verifica tu conexion a internet
- Recarga la pagina e intenta de nuevo
- Si el error incluye un codigo, anotalo para reportarlo

### "Los datos estan en 0 o vacios"
1. Verifica que la plataforma este conectada (Conexiones → badge verde)
2. Fuerza sincronizacion (Conexiones → Sincronizar)
3. Espera unos minutos — la primera sync toma tiempo
4. Si persiste, desconecta y reconecta la plataforma

### "Como cancelo/cambio mi plan"
- Contacta al equipo por WhatsApp o email: jmbarros@bgconsult.cl

### "Quiero agregar otro usuario a mi cuenta"
- Actualmente cada cuenta es individual. Contacta al equipo para gestionar acceso adicional

---

## 17. CONTACTO Y ESCALACION

Si el bot no puede resolver tu problema:
- **Email**: jmbarros@bgconsult.cl
- **WhatsApp**: Link en el boton flotante verde en la esquina
- **Agendar reunion**: meetings.hubspot.com/jose-manuel15

El bot puede crear un ticket automaticamente si el problema requiere atencion del equipo tecnico.

---

## 18. GLOSARIO DE TERMINOS

- **ROAS**: Return On Ad Spend — cuanto ganas por cada peso invertido en ads. ROAS 3x = ganas $3 por cada $1 gastado
- **CPA**: Cost Per Acquisition — cuanto cuesta conseguir un cliente nuevo
- **CTR**: Click-Through Rate — porcentaje de personas que hacen click en tu anuncio
- **CPC**: Cost Per Click — cuanto pagas por cada click
- **CPM**: Cost Per Mille — cuanto pagas por 1000 impresiones
- **AOV**: Average Order Value — valor promedio de cada orden
- **CAC**: Customer Acquisition Cost — costo total de adquirir un cliente
- **LTV**: Lifetime Value — valor total que un cliente genera en su vida
- **TOFU**: Top Of Funnel — parte alta del funnel (awareness)
- **MOFU**: Middle Of Funnel — consideracion
- **BOFU**: Bottom Of Funnel — decision de compra
- **Pixel**: Codigo de tracking que se instala en tu sitio para medir conversiones
- **Lookalike**: Audiencia similar a tus clientes actuales
- **Retargeting**: Mostrar anuncios a personas que ya visitaron tu sitio
- **A/B Test**: Probar dos variaciones para ver cual funciona mejor
- **Flow**: Secuencia automatizada de emails (ej: bienvenida, carrito abandonado)
- **Brief**: Documento que resume tu marca, audiencia y estrategia
- **OAuth**: Metodo seguro de autorizacion para conectar plataformas
- **Webhook**: Notificacion automatica entre sistemas
- **SKU**: Stock Keeping Unit — identificador unico de producto
- **Fulfillment**: Proceso de preparar y enviar un pedido
