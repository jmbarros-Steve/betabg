# QA Steve Mail — Guia de Pruebas

**URL Frontend:** https://betabgnuevosupa.vercel.app
**URL API:** https://steve-api-850416724643.us-central1.run.app
**Fecha:** 2026-03-22

> Ir paso por paso. Si algo falla, anotar el numero del paso y seguir con el siguiente.
> Cada paso dice EXACTAMENTE donde hacer click y que esperar.

---

## ANTES DE EMPEZAR

1. Abrir https://betabgnuevosupa.vercel.app
2. Login con tu cuenta
3. Entrar al portal del cliente (sidebar izquierdo)
4. Buscar la seccion **Steve Mail** o **Email Marketing**

---

## BLOQUE 1: CAMPAÑAS (Pasos 1-10)

### Paso 1 — Ver lista de campañas
- **Donde:** Steve Mail > Campañas
- **Hacer:** Simplemente abrir la seccion
- **Esperar:** Lista de campañas existentes (o vacia si es primera vez). No debe dar error ni pantalla blanca.
- ✅ PASA si: Se ve la lista o un mensaje "No hay campañas"
- ❌ FALLA si: Pantalla blanca, error rojo, o spinner infinito

### Paso 2 — Crear campaña nueva
- **Donde:** Campañas > boton "Nueva Campaña" o "Crear"
- **Hacer:** Click en crear. Poner nombre "Test QA 1", seleccionar tipo "Regular"
- **Esperar:** Se crea la campaña y aparece en la lista con status "Borrador" o "Draft"
- ✅ PASA si: Campaña aparece en la lista
- ❌ FALLA si: Error al crear, no aparece

### Paso 3 — Abrir editor de email
- **Donde:** Click en la campaña "Test QA 1" > boton "Editar" o "Diseñar"
- **Hacer:** Esperar que cargue el editor visual (GrapeJS)
- **Esperar:** Editor drag & drop con bloques a la izquierda y preview al centro
- ✅ PASA si: Editor carga con bloques arrastrables
- ❌ FALLA si: Editor no carga, pantalla blanca, o error de JS en consola

### Paso 4 — Editar contenido del email
- **Donde:** Dentro del editor visual
- **Hacer:** Arrastrar un bloque de texto. Escribir "Hola mundo QA". Guardar.
- **Esperar:** El contenido se guarda sin error
- ✅ PASA si: Al cerrar y reabrir el editor, el texto "Hola mundo QA" sigue ahi
- ❌ FALLA si: El contenido no se guarda o desaparece

### Paso 5 — Cambiar asunto del email
- **Donde:** Configuracion de la campaña (antes o despues del editor)
- **Hacer:** Escribir asunto "Test de QA - Ignorar"
- **Esperar:** Se guarda el asunto
- ✅ PASA si: El asunto se mantiene al recargar
- ❌ FALLA si: No hay campo de asunto o no se guarda

### Paso 6 — Seleccionar lista de destinatarios
- **Donde:** Configuracion de la campaña > Destinatarios o "Audiencia"
- **Hacer:** Seleccionar una lista existente (o crear una primero en Paso 21)
- **Esperar:** Muestra cantidad de suscriptores que recibiran el email
- ✅ PASA si: Se puede seleccionar lista y ver conteo
- ❌ FALLA si: No hay opcion de seleccionar lista

### Paso 7 — Programar envio
- **Donde:** Campaña > opcion "Programar" o "Schedule"
- **Hacer:** Seleccionar fecha/hora futura (mañana a las 10:00)
- **Esperar:** Status cambia a "Programada" o "Scheduled"
- ✅ PASA si: Campaña muestra fecha programada
- ❌ FALLA si: Error al programar o no cambia status

### Paso 8 — Cancelar envio programado
- **Donde:** Campaña programada > boton "Cancelar" o "Desprogramar"
- **Hacer:** Click en cancelar
- **Esperar:** Status vuelve a "Borrador"
- ✅ PASA si: Campaña vuelve a borrador
- ❌ FALLA si: No hay boton cancelar o sigue programada

### Paso 9 — Enviar campaña de prueba
- **Donde:** Campaña > "Enviar prueba" o "Test send"
- **Hacer:** Poner tu propio email y enviar
- **Esperar:** Recibes el email en tu bandeja en 1-2 minutos
- ✅ PASA si: Email llega con el contenido correcto
- ❌ FALLA si: No llega, llega vacio, o error al enviar

### Paso 10 — Eliminar campaña de prueba
- **Donde:** Campaña "Test QA 1" > boton eliminar
- **Hacer:** Confirmar eliminacion
- **Esperar:** Campaña desaparece de la lista
- ✅ PASA si: Se elimina correctamente
- ❌ FALLA si: Error o sigue apareciendo

---

## BLOQUE 2: FLUJOS AUTOMATICOS (Pasos 11-22)

### Paso 11 — Ver lista de flujos
- **Donde:** Steve Mail > Flujos (o Automations/Flows)
- **Hacer:** Abrir la seccion
- **Esperar:** Lista de flujos existentes
- ✅ PASA si: Se ve la lista
- ❌ FALLA si: Pantalla blanca o error

### Paso 12 — Crear flujo nuevo
- **Donde:** Flujos > "Crear Flujo" o "Nuevo"
- **Hacer:** Seleccionar trigger "Carrito Abandonado" (o Abandoned Cart). Nombre: "Test QA Flow"
- **Esperar:** Se crea el flujo y se abre el canvas visual
- ✅ PASA si: Canvas aparece con el trigger como primer nodo
- ❌ FALLA si: Error o no abre canvas

### Paso 13 — Agregar step de email
- **Donde:** Canvas del flujo > boton "+" o "Agregar paso"
- **Hacer:** Agregar un paso tipo "Email"
- **Esperar:** Nodo de email aparece en el canvas debajo del trigger
- ✅ PASA si: Nodo email visible en canvas
- ❌ FALLA si: No se puede agregar

### Paso 14 — Editar el email del step
- **Donde:** Click en el nodo de email en el canvas
- **Hacer:** Deberia abrir el editor de email (BlocksEditor o GrapeJS)
- **Esperar:** Editor se abre con el contenido del step
- ✅ PASA si: Editor abre y se puede editar
- ❌ FALLA si: No pasa nada al hacer click, o error

### Paso 15 — Agregar step de espera (delay)
- **Donde:** Canvas > agregar paso tipo "Delay" o "Espera"
- **Hacer:** Configurar espera de 1 hora
- **Esperar:** Nodo de delay aparece con "1 hora" visible
- ✅ PASA si: Delay configurado correctamente
- ❌ FALLA si: No se puede configurar tiempo

### Paso 16 — Agregar condicion (CRITICO)
- **Donde:** Canvas > agregar paso tipo "Condicion"
- **Hacer:** Agregar una condicion (ej: "Abrió email anterior")
- **Esperar:** Nodo de condicion con ramas SI y NO
- ✅ PASA si: Se ven las dos ramas
- ❌ FALLA si: No aparecen ramas o error

### Paso 17 — Agregar email dentro de rama SI (CRITICO — Bug 1 fix)
- **Donde:** Rama SI de la condicion > agregar email
- **Hacer:** Agregar un paso de email dentro de la rama SI
- **Esperar:** Email aparece como sub-paso de la rama SI
- ✅ PASA si: Sub-paso visible dentro de la rama
- ❌ FALLA si: No se puede agregar

### Paso 18 — Editar email de rama SI (CRITICO — Bug 1 fix)
- **Donde:** Click en el email que esta DENTRO de la rama SI
- **Hacer:** Click para editar
- **Esperar:** Se abre el editor visual con el contenido de ese sub-step
- ✅ PASA si: Editor abre con datos del sub-step, se puede editar y guardar
- ❌ FALLA si: No pasa nada al hacer click, o abre el email equivocado, o error

### Paso 19 — Guardar y verificar sub-step
- **Donde:** Editor del sub-step
- **Hacer:** Escribir "Email rama SI - QA" como asunto, guardar, cerrar editor
- **Esperar:** Al reabrir, el asunto dice "Email rama SI - QA"
- ✅ PASA si: Contenido se mantiene
- ❌ FALLA si: Se pierde el contenido o se guarda en otro step

### Paso 20 — Activar flujo
- **Donde:** Flujo "Test QA Flow" > boton "Activar"
- **Hacer:** Click activar
- **Esperar:** Status cambia a "Activo"
- ✅ PASA si: Flujo activo, listo para recibir triggers
- ❌ FALLA si: Error al activar

### Paso 21 — Pausar flujo (CRITICO — Bug 4 fix)
- **Donde:** Flujo activo > boton "Pausar"
- **Hacer:** Click pausar
- **Esperar:** Status cambia a "Pausado". Enrollments existentes deben pasar a "paused".
- ✅ PASA si: Flujo pausado, no salen mas emails
- ❌ FALLA si: Error al pausar o emails siguen saliendo

### Paso 22 — Eliminar flujo de prueba
- **Donde:** Flujo "Test QA Flow" > eliminar
- **Hacer:** Confirmar eliminacion
- **Esperar:** Flujo desaparece
- ✅ PASA si: Eliminado correctamente
- ❌ FALLA si: Error

---

## BLOQUE 3: FLUJOS EN CAMPAIGN STUDIO (Paso 23 — Bug 5 fix)

### Paso 23 — Campaign Studio muestra FlowBuilder (NO Klaviyo)
- **Donde:** Sidebar > Campaign Studio > pestaña "Flujos"
- **Hacer:** Abrir la pestaña de flujos dentro de Campaign Studio
- **Esperar:** Debe mostrar el FlowBuilder de Steve Mail (mismo que en Paso 11-22), NO un wizard de 4 pasos con templates de Klaviyo
- ✅ PASA si: Se ve el FlowBuilder con triggers y canvas
- ❌ FALLA si: Se ve un wizard con "Paso 1, Paso 2..." o menciones a Klaviyo

---

## BLOQUE 4: SUSCRIPTORES (Pasos 24-28)

### Paso 24 — Ver lista de suscriptores
- **Donde:** Steve Mail > Suscriptores
- **Hacer:** Abrir la seccion
- **Esperar:** Tabla con suscriptores (email, status, fecha, source)
- ✅ PASA si: Tabla carga con datos
- ❌ FALLA si: Vacio sin razon o error

### Paso 25 — Agregar suscriptor manual
- **Donde:** Suscriptores > "Agregar" o "Nuevo"
- **Hacer:** Ingresar email "qa-test@example.com"
- **Esperar:** Aparece en la lista con status "subscribed"
- ✅ PASA si: Suscriptor creado
- ❌ FALLA si: Error o duplicado

### Paso 26 — Buscar suscriptor
- **Donde:** Suscriptores > campo de busqueda
- **Hacer:** Escribir "qa-test"
- **Esperar:** Filtra y muestra solo el suscriptor de prueba
- ✅ PASA si: Busqueda funciona
- ❌ FALLA si: No filtra o no encuentra

### Paso 27 — Importar CSV (si existe la opcion)
- **Donde:** Suscriptores > "Importar" o "Import CSV"
- **Hacer:** Subir un CSV con 3 emails de prueba
- **Esperar:** Muestra resumen: 3 importados, 0 duplicados
- ✅ PASA si: Importacion correcta
- ❌ FALLA si: Error de parseo o no importa

### Paso 28 — Crear lista
- **Donde:** Steve Mail > Listas > "Crear Lista"
- **Hacer:** Nombre: "Lista QA Test"
- **Esperar:** Lista creada, visible en el panel
- ✅ PASA si: Lista aparece
- ❌ FALLA si: Error

---

## BLOQUE 5: DOMINIO (Pasos 29-33)

### Paso 29 — Ver dominios configurados
- **Donde:** Steve Mail > Dominio (o Domain Setup / Configuracion)
- **Hacer:** Abrir la seccion
- **Esperar:** Lista de dominios (puede estar vacia)
- ✅ PASA si: Seccion carga sin error
- ❌ FALLA si: Error o pantalla blanca

### Paso 30 — Iniciar verificacion de dominio
- **Donde:** Dominio > "Agregar Dominio"
- **Hacer:** Ingresar un dominio de prueba (ej: tudominio.cl)
- **Esperar:** Muestra registros DNS que hay que agregar (SPF, DKIM, DMARC) con valores para copiar
- ✅ PASA si: Se ven los registros DNS claramente
- ❌ FALLA si: Error de Resend o no muestra registros

### Paso 31 — Ver status de verificacion por registro
- **Donde:** Dominio > el dominio agregado
- **Hacer:** Click en "Verificar" o "Check"
- **Esperar:** Muestra status individual: SPF ✅/❌, DKIM ✅/❌, DMARC ✅/❌
- ✅ PASA si: Se ven los 3 checks individuales
- ❌ FALLA si: Solo muestra "verificado/no verificado" sin detalle

### Paso 32 — Nombre de remitente (from_name)
- **Donde:** Configuracion del dominio
- **Hacer:** Verificar que se puede poner un nombre de remitente (ej: "Mi Tienda")
- **Esperar:** Campo para from_name editable
- ✅ PASA si: Se puede configurar el nombre
- ❌ FALLA si: No existe el campo

### Paso 33 — Eliminar dominio
- **Donde:** Dominio > boton eliminar
- **Hacer:** Eliminar dominio de prueba
- **Esperar:** Se elimina de la lista
- ✅ PASA si: Eliminado
- ❌ FALLA si: Error

---

## BLOQUE 6: TEMPLATES (Pasos 34-37)

### Paso 34 — Ver galeria de templates
- **Donde:** Steve Mail > Templates
- **Hacer:** Abrir la seccion
- **Esperar:** Galeria de templates con previews/thumbnails
- ✅ PASA si: Templates visibles
- ❌ FALLA si: Vacio o error

### Paso 35 — Crear template nuevo
- **Donde:** Templates > "Crear" o "Nuevo"
- **Hacer:** Nombre: "Template QA". Diseñar algo basico en el editor.
- **Esperar:** Template se guarda y aparece en la galeria
- ✅ PASA si: Template guardado con preview
- ❌ FALLA si: Error al guardar

### Paso 36 — Usar template en una campaña
- **Donde:** Crear nueva campaña > seleccionar template
- **Hacer:** Elegir "Template QA"
- **Esperar:** El editor carga con el diseño del template
- ✅ PASA si: Diseño cargado correctamente
- ❌ FALLA si: Carga vacio o template equivocado

### Paso 37 — Eliminar template
- **Donde:** Template "Template QA" > eliminar
- **Hacer:** Confirmar
- **Esperar:** Se elimina
- ✅ PASA si: Eliminado
- ❌ FALLA si: Error

---

## BLOQUE 7: ANALYTICS (Pasos 38-41)

### Paso 38 — Dashboard general de email
- **Donde:** Steve Mail > Analytics (o Dashboard)
- **Hacer:** Abrir
- **Esperar:** Metricas generales: emails enviados, aperturas, clicks, bounces, tasa de apertura
- ✅ PASA si: Numeros visibles (pueden ser 0 si no hay envios)
- ❌ FALLA si: Error o no carga

### Paso 39 — Analytics de una campaña
- **Donde:** Click en una campaña enviada > ver stats
- **Hacer:** Abrir detalle de metricas
- **Esperar:** Open rate, click rate, bounces, unsubscribes para esa campaña
- ✅ PASA si: Metricas por campaña visibles
- ❌ FALLA si: Error o sin datos

### Paso 40 — Deliverability dashboard
- **Donde:** Steve Mail > Deliverability (o dentro de Analytics)
- **Hacer:** Abrir
- **Esperar:** Tasas de entrega, rebotes, spam complaints, reputacion de dominio
- ✅ PASA si: Dashboard con metricas de entregabilidad
- ❌ FALLA si: Error o no existe la seccion

### Paso 41 — Analytics de flujos
- **Donde:** Flujo especifico > ver stats/analytics
- **Hacer:** Abrir stats de un flujo
- **Esperar:** Metricas desglosadas por step del flujo
- ✅ PASA si: Stats por step visibles
- ❌ FALLA si: Error

---

## BLOQUE 8: PRODUCT ALERTS (Pasos 42-44)

### Paso 42 — Ver alertas de producto
- **Donde:** Steve Mail > Product Alerts (o Alertas)
- **Hacer:** Abrir la seccion
- **Esperar:** Lista de alertas configuradas con stats
- ✅ PASA si: Seccion carga
- ❌ FALLA si: Error

### Paso 43 — Stats de alertas
- **Donde:** Product Alerts > Stats o Dashboard
- **Hacer:** Ver resumen
- **Esperar:** Conteos por tipo (back_in_stock, price_drop) y status (active, triggered)
- ✅ PASA si: Stats visibles
- ❌ FALLA si: Error

### Paso 44 — Widget de alertas (endpoint publico)
- **Donde:** Navegador > ir a `https://steve-api-850416724643.us-central1.run.app/api/email-product-alert-widget?client_id=TU_CLIENT_ID`
- **Hacer:** Abrir la URL
- **Esperar:** Devuelve codigo JavaScript del widget
- ✅ PASA si: Se ve codigo JS
- ❌ FALLA si: Error 500 o 404

---

## BLOQUE 9: SIGNUP FORMS (Pasos 45-47)

### Paso 45 — Ver formularios
- **Donde:** Steve Mail > Formularios (o Signup Forms)
- **Hacer:** Abrir la seccion
- **Esperar:** Lista de formularios
- ✅ PASA si: Seccion carga
- ❌ FALLA si: Error

### Paso 46 — Crear formulario
- **Donde:** Formularios > "Crear"
- **Hacer:** Configurar un formulario basico con nombre y lista destino
- **Esperar:** Formulario creado, genera snippet embed
- ✅ PASA si: Formulario guardado con snippet copiable
- ❌ FALLA si: Error

### Paso 47 — Widget de formulario (endpoint publico)
- **Donde:** Navegador > `https://steve-api-850416724643.us-central1.run.app/api/email-form-widget?form_id=TU_FORM_ID`
- **Hacer:** Abrir la URL
- **Esperar:** Devuelve codigo del formulario embebible
- ✅ PASA si: Se ve codigo HTML/JS
- ❌ FALLA si: Error

---

## BLOQUE 10: TRACKING Y UNSUBSCRIBE (Pasos 48-50)

### Paso 48 — Pixel de apertura
- **Donde:** Revisar el HTML de un email enviado (ver source)
- **Hacer:** Buscar una imagen 1x1 con URL tipo `/api/email-track/open?...`
- **Esperar:** El pixel de tracking esta presente en el HTML
- ✅ PASA si: Pixel encontrado en el source
- ❌ FALLA si: No hay pixel de tracking

### Paso 49 — Links de click tracking
- **Donde:** Revisar el HTML de un email enviado
- **Hacer:** Buscar links que pasen por `/api/email-track/click?...`
- **Esperar:** Los links del email pasan por el tracker antes de redirigir
- ✅ PASA si: Links redirigen via tracker
- ❌ FALLA si: Links van directo sin tracking

### Paso 50 — Link de unsubscribe
- **Donde:** Email recibido > footer
- **Hacer:** Click en "Unsubscribe" o "Desuscribirse"
- **Esperar:** Pagina de confirmacion. El suscriptor cambia a status "unsubscribed" en la DB.
- ✅ PASA si: Se desuscribe correctamente
- ❌ FALLA si: Link roto o no cambia status

---

## RESUMEN DE RESULTADOS

| Bloque | Pasos | Pasaron | Fallaron | Notas |
|--------|-------|---------|----------|-------|
| Campañas | 1-10 | | | |
| Flujos | 11-22 | | | |
| Campaign Studio | 23 | | | |
| Suscriptores | 24-28 | | | |
| Dominio | 29-33 | | | |
| Templates | 34-37 | | | |
| Analytics | 38-41 | | | |
| Product Alerts | 42-44 | | | |
| Signup Forms | 45-47 | | | |
| Tracking | 48-50 | | | |
| **TOTAL** | **50** | | | |

---

## PASOS CRITICOS (si estos fallan, NO esta listo para produccion)

⚠️ **Paso 3** — Editor de email carga
⚠️ **Paso 9** — Emails se envian y llegan
⚠️ **Paso 18** — Editar email en ramas de condicion (Bug 1 fix)
⚠️ **Paso 21** — Pausar flujo cancela todo (Bug 4 fix)
⚠️ **Paso 23** — Campaign Studio muestra FlowBuilder, no Klaviyo
⚠️ **Paso 30** — Verificacion de dominio funciona
⚠️ **Paso 50** — Unsubscribe funciona
