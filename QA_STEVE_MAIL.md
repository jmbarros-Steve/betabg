# INSTRUCCIÓN QA — STEVE MAIL COMPLETO

**Agente:** Javiera (W12 — QA permanente)
**Ambiente:** Producción (Cloud Run + Vercel)
**Fecha:** 17 Marzo 2026
**Prioridad:** CRÍTICA — Steve Mail nunca ha mandado un email real a un cliente

---

## CONTEXTO

Steve Mail es el módulo de EMAIL MARKETING PROPIO de Steve Ads. **NO es Klaviyo.** Es un editor de emails completo construido dentro de Steve Ads que:

- Tiene su propio editor drag & drop (content_blocks JSON)
- Tiene product picker de Shopify
- Genera copies masivos con Claude (IA)
- Envía emails a través de **Resend** (NO Klaviyo)
- Dominio: steve.cl (verificado hoy en Resend)
- Debe manejar sus propias listas, segmentos, métricas

**ESTADO ACTUAL: Nunca se ha mandado un email real a un cliente. Solo pruebas en dev.**

La meta de este QA es verificar TODO el flujo end-to-end: desde que el merchant crea un email hasta que llega a la bandeja de entrada del destinatario y se trackean opens/clicks.

---

## FORMATO DE REPORTE

Por cada bug:

```
[SEVERIDAD] CRÍTICO | MAJOR | MINOR | UX
[FLUJO] Nombre del flujo (ej: F1-EDITOR)
[PASO] Número del paso
[QUÉ PASÓ] Descripción exacta
[QUÉ DEBERÍA PASAR] Comportamiento esperado
[EVIDENCIA] Screenshot, error, response HTTP
[REPRODUCIBLE] Siempre | A veces | Una vez
```

Si un flujo completo **NO EXISTE** todavía → documentar como **"FEATURE FALTANTE"** con severidad indicada.

---

## F1 — EDITOR DRAG & DROP

### Objetivo
Verificar que el editor de emails funciona completo: agregar, mover, editar y eliminar bloques.

### Pasos

1. **Acceder al editor**
   - [ ] Desde el sidebar/módulo de Steve Mail, hay opción clara de "Crear email" o "Nuevo email"
   - [ ] El editor carga sin errores en menos de 5 segundos
   - [ ] Se ve una interfaz de drag & drop (no solo un textarea)

2. **Tipos de bloques disponibles**
   - [ ] Bloque de TEXTO — se puede agregar, escribir, formatear (bold, italic, links)
   - [ ] Bloque de IMAGEN — se puede agregar (ver F7 para upload vs URL)
   - [ ] Bloque de BOTÓN / CTA — se puede agregar con texto y URL configurables
   - [ ] Bloque de PRODUCTO (Shopify) — se puede agregar (ver F2)
   - [ ] Bloque de SEPARADOR / DIVIDER
   - [ ] Bloque de COLUMNAS (2 o 3 columnas lado a lado)
   - [ ] Bloque de HEADER / LOGO
   - [ ] Bloque de FOOTER con links de unsubscribe
   - [ ] ¿Hay bloque de CÓDIGO HTML custom? (nice to have)
   - Si algún bloque NO EXISTE → documentar como FEATURE FALTANTE

3. **Drag & drop funcional**
   - [ ] Se pueden AGREGAR bloques desde un panel lateral al canvas
   - [ ] Se pueden MOVER bloques arrastrándolos (reordenar)
   - [ ] Se pueden DUPLICAR bloques
   - [ ] Se pueden ELIMINAR bloques
   - [ ] El orden de los bloques se guarda correctamente en content_blocks JSON
   - [ ] Al recargar la página, el email se ve igual (persistencia)

4. **Edición de bloques**
   - [ ] Click en un bloque de texto → se puede editar inline
   - [ ] Click en un bloque de imagen → se puede cambiar la imagen
   - [ ] Click en un bloque de botón → se puede cambiar texto y URL
   - [ ] Cambios se guardan automáticamente (o con botón de guardar claro)

5. **Preview del email**
   - [ ] Hay botón de "Preview" o "Vista previa"
   - [ ] El preview muestra el email como se vería en una bandeja de entrada
   - [ ] Preview desktop Y preview mobile
   - [ ] El preview coincide con lo que se diseñó en el editor (WYSIWYG)
   - [ ] Los productos se ven con imagen, título y precio reales

6. **Templates**
   - [ ] Hay templates prediseñados para empezar (no solo canvas vacío)
   - [ ] Se puede seleccionar un template y editarlo
   - [ ] Los templates se ven profesionales (no HTML roto)
   - [ ] ¿Se pueden guardar templates propios? (nice to have)

7. **Edge cases del editor**
   - [ ] ¿Qué pasa si agrego 20+ bloques? ¿Se pone lento?
   - [ ] ¿Qué pasa si arrastro un bloque fuera del canvas?
   - [ ] ¿Qué pasa si pego texto formateado de Word/Google Docs?
   - [ ] ¿Funciona en Chrome, Firefox, Safari?
   - [ ] ¿Funciona en pantallas chicas (laptop 1280px)?

---

## F2 — PRODUCT PICKER DE SHOPIFY

### Objetivo
Verificar que se pueden insertar productos reales de Shopify en el email.

### Pre-condición
Tienda de Shopify conectada con productos sincronizados.

### Pasos

1. **Acceder al product picker**
   - [ ] Dentro del editor, hay opción clara de "Agregar producto" o bloque tipo "Producto"
   - [ ] Se abre un selector/modal con productos de Shopify

2. **Listado de productos**
   - [ ] Se muestran los productos sincronizados de la tienda
   - [ ] Cada producto muestra: imagen thumbnail, título, precio
   - [ ] Se puede buscar/filtrar por nombre
   - [ ] Se puede filtrar por colección
   - [ ] La lista carga en menos de 5 segundos
   - [ ] Si hay 0 productos → mensaje claro (no pantalla vacía)
   - [ ] Si hay 1000+ productos → paginación o scroll infinito funciona

3. **Insertar producto en el email**
   - [ ] Al seleccionar un producto → se inserta un bloque en el email
   - [ ] El bloque muestra: imagen del producto, título, precio, botón "Comprar"
   - [ ] La imagen viene de Shopify (no está rota)
   - [ ] El precio es CORRECTO (coincide con Shopify actual)
   - [ ] El botón "Comprar" apunta a la URL del producto en la tienda
   - [ ] Se pueden insertar MÚLTIPLES productos

4. **Actualización de datos**
   - [ ] Si el precio cambia en Shopify → ¿se actualiza en el email? ¿O queda el precio viejo?
   - [ ] Si el producto se elimina en Shopify → ¿qué muestra el email?
   - [ ] Si la imagen cambia en Shopify → ¿se actualiza?
   - [ ] Documentar el comportamiento actual sea cual sea

5. **Personalización del bloque de producto**
   - [ ] ¿Se puede editar el texto del botón? ("Comprar" → "Ver producto")
   - [ ] ¿Se puede cambiar el layout? (imagen arriba vs al lado)
   - [ ] ¿Se puede ocultar el precio?

---

## F3 — GENERACIÓN DE COPIES CON IA (CLAUDE)

### Objetivo
Verificar que Steve genera contenido de email de calidad usando IA.

### Pasos

1. **Acceso a generación**
   - [ ] Hay botón claro de "Generar con IA" o "Steve escribe" en el editor
   - [ ] Se puede generar un email completo desde cero
   - [ ] Se puede generar solo un bloque de texto (no todo el email)

2. **Inputs para la generación**
   - [ ] Se puede describir qué tipo de email quieres ("promoción de verano", "lanzamiento de producto")
   - [ ] Steve usa el brief del cliente como base (no genera genérico)
   - [ ] Se puede seleccionar un producto de Shopify como tema del email
   - [ ] Se puede elegir tono/estilo

3. **Calidad del output**
   - [ ] El subject line generado es atractivo y no parece spam
   - [ ] El body copy es relevante al tema pedido
   - [ ] El texto está en español chileno natural (no español de España)
   - [ ] Incluye CTA claro
   - [ ] No tiene errores gramaticales ni frases robot
   - [ ] Es diferente cada vez que se genera (no copypaste)

4. **Generación masiva**
   - [ ] ¿Se pueden generar múltiples variantes de un email?
   - [ ] ¿Se pueden generar emails para múltiples productos de una vez?
   - [ ] Tiempo de generación: < 60 segundos por email
   - [ ] Hay indicador de progreso durante la generación

5. **Edición post-generación**
   - [ ] El email generado por IA se puede editar libremente en el editor
   - [ ] Se pueden regenerar bloques individuales sin perder el resto
   - [ ] Se puede pedir "hazlo más corto" o "cambia el tono"

---

## F4 — ENVÍO REAL POR RESEND

### Objetivo
Verificar que un email se envía realmente, llega a la bandeja, y no cae en spam.

### Pre-condición
Dominio steve.cl verificado en Resend (confirmado hoy).

### Pasos

1. **Configuración de envío**
   - [ ] Se puede configurar el FROM: nombre + email (ej: "Steve Ads <hola@steve.cl>")
   - [ ] Se puede configurar el REPLY-TO
   - [ ] Se puede escribir el SUBJECT LINE
   - [ ] Se puede escribir el PREVIEW TEXT (lo que se ve antes de abrir)

2. **Selección de destinatarios**
   - [ ] Se puede enviar a una LISTA (ver F6)
   - [ ] Se puede enviar a un SEGMENTO (ver F6)
   - [ ] Se puede enviar a un email específico (para testing)
   - [ ] Se muestra el conteo de destinatarios antes de enviar
   - [ ] Si la lista está vacía → aviso claro

3. **Envío de prueba**
   - [ ] Hay botón de "Enviar prueba" o "Send test"
   - [ ] Se puede enviar un email de prueba a MI correo
   - [ ] El email de prueba LLEGA (verificar en inbox real)
   - [ ] El email de prueba se ve bien (no HTML roto)
   - [ ] Llega en menos de 30 segundos
   - [ ] Verificar en Gmail, Outlook, y Apple Mail si es posible

4. **Envío real (campaña)**
   - [ ] Hay botón de "Enviar campaña" o "Send"
   - [ ] Hay confirmación antes de enviar ("¿Estás seguro? Se enviará a X personas")
   - [ ] Se puede PROGRAMAR envío para una fecha/hora futura
   - [ ] El envío se ejecuta realmente (verificar que Resend lo procesó)
   - [ ] NO hay doble envío (si presiono dos veces no manda doble)

5. **Deliverability**
   - [ ] El email llega al INBOX (no spam/junk) en Gmail
   - [ ] El email llega al INBOX en Outlook
   - [ ] El FROM muestra "Steve Ads" o el nombre configurado (no "via resend.dev")
   - [ ] El dominio steve.cl está correctamente autenticado:
     - [ ] SPF configurado
     - [ ] DKIM configurado
     - [ ] DMARC configurado
   - [ ] El link de UNSUBSCRIBE funciona y está presente
   - [ ] Los headers del email son correctos (no falta List-Unsubscribe)

6. **Envío masivo**
   - [ ] ¿Qué pasa si envío a 100 personas? ¿Se envía correctamente?
   - [ ] ¿Qué pasa si envío a 1000? ¿Hay rate limiting?
   - [ ] ¿Hay queue/cola de envío o va todo de golpe?
   - [ ] Resend tiene rate limits — ¿el sistema los respeta?
   - [ ] Si un email rebota (bounce) → ¿se registra?

7. **Errores de envío**
   - [ ] Si Resend falla → ¿mensaje claro o silencio?
   - [ ] Si un email es inválido → ¿se salta o rompe todo?
   - [ ] Si el API key de Resend está mal → ¿error claro?
   - [ ] Si el dominio no está verificado → ¿error claro?

---

## F5 — MÉTRICAS POST-ENVÍO

### Objetivo
Verificar que después de enviar, se trackean opens, clicks, bounces, unsubscribes.

### Pasos

1. **Dashboard de métricas**
   - [ ] Después de enviar una campaña → se muestra una página de resultados
   - [ ] Métricas visibles: enviados, entregados, abiertos, clicks, bounces, unsubscribes
   - [ ] Las métricas se actualizan en tiempo real (o al menos cada pocos minutos)
   - [ ] Los porcentajes son correctos (open rate = opens / delivered × 100)

2. **Open tracking**
   - [ ] El email contiene un pixel de tracking invisible
   - [ ] Cuando alguien abre el email → se registra en Steve Ads
   - [ ] Open rate se calcula correctamente
   - [ ] Resend provee webhooks de open → ¿Steve los recibe?

3. **Click tracking**
   - [ ] Los links en el email pasan por un redirect de tracking
   - [ ] Cuando alguien hace click → se registra en Steve Ads
   - [ ] Click rate se calcula correctamente
   - [ ] Se puede ver QUÉ link fue clickeado (no solo "hubo un click")
   - [ ] El redirect no rompe la URL de destino

4. **Bounces y errores**
   - [ ] Si un email rebota (dirección no existe) → se registra
   - [ ] Bounce rate visible en el dashboard
   - [ ] Emails rebotados se marcan para no enviarles de nuevo

5. **Unsubscribes**
   - [ ] El link de unsubscribe en el email funciona
   - [ ] Al hacer click → el contacto se marca como unsubscribed
   - [ ] No se le envía más en futuras campañas
   - [ ] ¿Hay landing page de unsubscribe o va a un link genérico de Resend?

6. **Webhooks de Resend**
   - [ ] ¿Steve tiene un endpoint para recibir webhooks de Resend?
   - [ ] Eventos que Resend puede enviar: delivered, opened, clicked, bounced, complained
   - [ ] Verificar que el endpoint existe y procesa correctamente cada tipo
   - [ ] Si el webhook endpoint no existe → FEATURE FALTANTE CRITICAL

7. **Métricas por campaña vs globales**
   - [ ] Se puede ver métricas de UNA campaña específica
   - [ ] Se puede ver métricas globales (todas las campañas)
   - [ ] Se puede comparar campañas entre sí
   - [ ] Hay gráficos o solo números planos

---

## F6 — LISTAS, SEGMENTOS Y CONTACTOS

### Objetivo
Verificar que Steve Mail tiene su propio sistema de gestión de contactos, listas y segmentos.

### Pasos

1. **Contactos**
   - [ ] Hay una sección de "Contactos" o "Suscriptores" en Steve Mail
   - [ ] Se pueden ver los contactos existentes (nombre, email, fecha)
   - [ ] Se pueden IMPORTAR contactos (CSV, copypaste, manual)
   - [ ] Se pueden EXPORTAR contactos
   - [ ] Los contactos de Shopify (clientes) se sincronizan automáticamente
   - [ ] Cada contacto tiene: email, nombre, teléfono, fecha de suscripción, status

2. **Listas**
   - [ ] Se pueden crear LISTAS (agrupaciones manuales de contactos)
   - [ ] Se pueden nombrar las listas ("Clientes VIP", "Newsletter", etc)
   - [ ] Se pueden agregar/quitar contactos de una lista
   - [ ] Una campaña se puede enviar a una lista específica
   - [ ] El conteo de contactos por lista es correcto

3. **Segmentos (dinámicos)**
   - [ ] Se pueden crear SEGMENTOS basados en condiciones:
     - Por comportamiento de compra (compró / no compró en X días)
     - Por valor (gastó más de $X)
     - Por engagement (abrió/no abrió últimos emails)
     - Por producto comprado
     - Por fecha de suscripción
   - [ ] Los segmentos se actualizan automáticamente (no son estáticos)
   - [ ] Se puede ver cuántos contactos calzan en un segmento
   - [ ] Una campaña se puede enviar a un segmento

4. **Unsubscribes y bounces**
   - [ ] Los contactos que hicieron unsubscribe están marcados
   - [ ] Los emails que rebotaron están marcados
   - [ ] Estos contactos NO reciben emails nuevos (verificar que el sistema los excluye)
   - [ ] Hay lista visible de unsubscribes y bounces

5. **Si NADA de esto existe**
   - Documentar como FEATURE FALTANTE con severidad:
   - Contactos básicos: CRITICAL (sin esto no puedes enviar)
   - Listas manuales: CRITICAL (necesitas poder seleccionar a quién enviar)
   - Segmentos dinámicos: MAJOR (puede esperar pero es core)
   - Import/export: MAJOR

---

## F7 — UPLOAD DE IMÁGENES

### Objetivo
Verificar que el merchant puede subir fotos propias al email, no solo pegar URLs.

### Pasos

1. **Subir imagen en el editor**
   - [ ] En un bloque de imagen, hay botón de "Subir imagen" (no solo campo de URL)
   - [ ] Se puede hacer drag & drop de un archivo desde el computador
   - [ ] Se puede seleccionar un archivo con file picker
   - [ ] Formatos soportados: JPG, PNG, GIF, WEBP
   - [ ] Tamaño máximo claro (¿5MB? ¿10MB?)
   - [ ] Si el archivo es muy grande → mensaje de error claro

2. **Storage de imágenes**
   - [ ] Las imágenes se suben a algún storage (Supabase Storage, S3, Cloudinary, etc)
   - [ ] La URL generada es pública y accesible (el email la necesita para renderizar)
   - [ ] La URL no expira (un email enviado hace 6 meses sigue mostrando la imagen)
   - [ ] La imagen carga rápido (CDN o similar)

3. **Galería / Imágenes subidas previamente**
   - [ ] ¿Hay galería de imágenes subidas anteriormente?
   - [ ] ¿Se pueden reusar imágenes en múltiples emails?
   - [ ] ¿Se pueden eliminar imágenes de la galería?

4. **Imágenes en el email enviado**
   - [ ] Las imágenes se ven correctamente en el email recibido
   - [ ] No aparecen como adjuntos (deben ser inline via URL)
   - [ ] Se ven bien en Gmail, Outlook, Apple Mail
   - [ ] Se ven bien en mobile
   - [ ] Alt text configurado (para accesibilidad)

5. **Si NO se pueden subir imágenes (solo URL)**
   - Documentar como FEATURE FALTANTE → CRITICAL
   - Un merchant de e-commerce NECESITA subir fotos de sus productos/marca

---

## F8 — VERIFICACIÓN DE DOMINIOS (CADA CLIENTE TIENE EL SUYO)

### Objetivo
Verificar el flujo completo donde cada merchant configura SU propio dominio para enviar emails. No todos envían desde steve.cl — cada uno envía desde su dominio (jardindeeva.cl, comercialbadim.cl, etc).

### Pasos

1. **Flujo de agregar dominio**
   - [ ] Hay sección clara de "Configurar dominio" o "Mi dominio" en Steve Mail
   - [ ] El merchant puede ingresar su dominio (ej: jardindeeva.cl)
   - [ ] Steve llama a Resend API para registrar el dominio
   - [ ] Steve muestra los registros DNS que el merchant debe agregar:
     - [ ] SPF (TXT record)
     - [ ] DKIM (CNAME o TXT records — Resend da 3 registros DKIM)
     - [ ] DMARC (TXT record — opcional pero recomendado)
   - [ ] Las instrucciones son claras y copiables (botón de copiar cada registro)
   - [ ] Se explica DÓNDE agregarlos ("Ve al panel de tu proveedor de dominio: GoDaddy, Cloudflare, NIC Chile, etc")
   - [ ] NO se usa jerga técnica sin explicación (SPF → "registro de verificación de envío")

2. **Verificación del dominio**
   - [ ] Hay botón de "Verificar dominio" o "Comprobar"
   - [ ] Steve consulta Resend API para verificar los registros DNS
   - [ ] Si están correctos → ✅ "Dominio verificado"
   - [ ] Si faltan registros → ❌ detalle de cuáles faltan
   - [ ] Si están incorrectos → ❌ con explicación de qué arreglar
   - [ ] ¿Hay verificación automática periódica? (polling cada X minutos)
   - [ ] ¿Cuánto tarda en propagarse? (comunicar al merchant: "puede tardar hasta 48 horas")

3. **Estado del dominio visible**
   - [ ] Cada merchant ve el estado de SU dominio en Steve Mail
   - [ ] Estados posibles: Pendiente → Verificando → Verificado → Error
   - [ ] Si el dominio no está verificado → NO puede enviar emails (bloqueo claro)
   - [ ] Mensaje: "Configura tu dominio para poder enviar emails" si no tiene uno

4. **Dominio por defecto (steve.cl) como fallback**
   - [ ] Si el merchant NO ha configurado su dominio → ¿puede enviar desde @steve.cl?
   - [ ] ¿O es obligatorio tener dominio propio para enviar?
   - [ ] Documentar cuál es el comportamiento actual

5. **Emails enviados desde el dominio del merchant**
   - [ ] Enviar email de prueba desde el dominio del merchant
   - [ ] Verificar que el FROM dice "nombre@dominiodelmerchan.cl" (no @steve.cl ni @resend.dev)
   - [ ] Verificar que NO dice "via resend.dev" o "on behalf of" en Gmail
   - [ ] Verificar SPF pass en headers del email recibido
   - [ ] Verificar DKIM pass en headers del email recibido
   - [ ] Verificar score en mail-tester.com (objetivo: 9+/10) con el dominio del merchant

6. **Múltiples merchants con distintos dominios**
   - [ ] Verificar que cada merchant SOLO ve y usa su propio dominio
   - [ ] Merchant A no puede enviar desde el dominio de Merchant B (RLS)
   - [ ] El sistema de Resend maneja múltiples dominios correctamente

7. **Edge cases**
   - [ ] ¿Qué pasa si el merchant pone un dominio que ya está registrado en Resend por otro?
   - [ ] ¿Qué pasa si el merchant pierde acceso a su DNS y los registros desaparecen?
   - [ ] ¿Qué pasa si el dominio del merchant está en una blacklist?
   - [ ] ¿Se puede cambiar de dominio después de configurar uno?
   - [ ] ¿Se puede tener múltiples dominios por merchant?

---

## F9 — FLUJO COMPLETO END-TO-END

### Objetivo
Hacer TODO el flujo como un merchant real, de principio a fin.

### El test definitivo

```
1. Abrir Steve Mail
2. Crear un email nuevo
3. Elegir un template (o empezar de cero)
4. Agregar bloque de texto con headline
5. Agregar un producto de Shopify con el picker
6. SUBIR una imagen propia (no URL)
7. Agregar botón CTA
8. Agregar footer con unsubscribe
9. Generar el subject line con IA
10. Preview del email (desktop + mobile)
11. Seleccionar lista/segmento de destinatarios
12. Enviar email de PRUEBA a mi correo
13. Verificar que LLEGA al inbox (no spam)
14. Verificar que se ve bien (imágenes, productos, botones)
15. Hacer click en un link del email
16. Verificar que el click se registra en Steve Mail
17. Enviar la campaña real
18. Verificar métricas: enviados, entregados, opens, clicks
19. Hacer click en Unsubscribe
20. Verificar que el contacto se marca como unsubscribed
```

### Cada paso que falla → bug con severidad

Los pasos 12-13 (email llega al inbox) son el **BLOQUEADOR #1**. Si el email no llega, nada más importa.

---

## MATRIZ DE PRIORIDAD

```
CRÍTICO (sin esto Steve Mail no existe):
- El email no se envía / no llega
- El email cae en spam
- El editor no carga o crashea
- No se pueden agregar destinatarios
- No se pueden subir imágenes (solo URL)
- Resend API key mal configurada
- Dominio no verificado correctamente
- No hay link de unsubscribe (viola CAN-SPAM)
- Doble envío al presionar botón 2 veces

MAJOR (arreglar esta semana):
- Product picker no carga productos
- Generación IA falla o tarda >120s
- Métricas no se registran (opens/clicks)
- No hay preview del email
- No hay listas/segmentos
- Webhooks de Resend no se reciben
- Bounces no se registran

MINOR (próximo sprint):
- Templates pocos o feos
- Preview solo desktop (no mobile)
- No se puede programar envío futuro
- Falta galería de imágenes
- Falta export de contactos

UX (backlog):
- Editor lento con muchos bloques
- Drag & drop poco intuitivo
- Falta undo/redo
- Terminología confusa
```

---

## EJECUCIÓN

1. **Corre los 9 flujos en orden** (F1 a F9)
2. **F9 es el más importante** — es el test end-to-end real
3. **Documenta CADA checkbox** como ✅ PASS o ❌ FAIL o ⬜ NO EXISTE
4. **Para cada FAIL → bug con formato**
5. **Para cada NO EXISTE → FEATURE FALTANTE con severidad**
6. **Al final genera:**
   - Score total: X/Y checks
   - Lista de features faltantes (probablemente muchas)
   - Lista de bugs en lo que SÍ existe
   - Top 5 bloqueadores para que Steve Mail sea usable
   - Recomendación: ¿se puede mandar el primer email real o no?

7. **Guardar en** `qa_log` tabla de Supabase:
   - `run_id`: "stevemail-r1"
   - `module`: "steve-mail"
   - `score`: puntuación
   - `bugs`: JSON con bugs
   - `features_missing`: JSON con features faltantes

---

## RECORDATORIOS

- Steve Mail **NO ES KLAVIYO**. Es nuestro propio editor + Resend para envío. No busques integraciones con Klaviyo aquí.
- El envío es por **Resend** con dominio **steve.cl**. API Key: re_4NcYYT4W (configurada hoy en Cloud Run).
- **NUNCA envíes emails de prueba a clientes reales.** Solo a correos internos de prueba.
- Si algo que está en esta lista NO EXISTE en el código → no es un bug, es una FEATURE FALTANTE. Documentar con severidad.
- Lo más probable es que falten muchas features. Eso está bien. El objetivo es saber EXACTAMENTE qué falta para que Steve Mail sea funcional.
- El test definitivo es F9: si puedes hacer todo el flujo end-to-end y el email llega → Steve Mail funciona. Si no → hay que arreglar antes de pensar en features extras.
