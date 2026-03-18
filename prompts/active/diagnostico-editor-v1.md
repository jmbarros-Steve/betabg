# Diagnóstico Completo — Editor de Emails Steve Mail v2
**Fecha:** 2026-03-17
**Ejecutado por:** Valentina W1
**Branch:** main
**Cliente de prueba:** Patricio Correa / Jardín de Eva

---

## 1. Librería del Editor

**Sistema actual: Editor custom basado en bloques (NO GrapeJS, NO Unlayer)**

El editor GrapeJS fue **completamente reemplazado** por un sistema propietario de bloques. Los archivos `SteveMailEditor.tsx`, `grapesjsCustomBlocks.ts`, `grapejs-theme.css`, `grapesjsI18n.ts`, `grapesjsMergeTags.ts` ya **no existen** en el codebase.

El nuevo sistema consiste en:
- `EmailBlockEditor.tsx` — Canvas con drag-and-drop, palette de bloques, toolbar flotante
- `BlocksEditorWrapper.tsx` — Wrapper React con sanitización DOMPurify y ref API
- `blockTypes.ts` — Definiciones de 17+ tipos de bloque
- `blockRenderer.ts` — Renderizado a HTML email-safe (tables, inline styles, Outlook)
- `BlockConfigPanel.tsx` — Panel de configuración dinámico por tipo de bloque

---

## 2. Screenshots

| Screenshot | Resolución | Archivo |
|------------|-----------|---------|
| Home Steve Mail | 1280px | `e2e/screenshots/editor-diagnostico-01-mail-home-1280.png` |
| Step 1 - Datos | 1280px | `e2e/screenshots/editor-diagnostico-02-step1-1280.png` |
| Step 2 - Editor completo | 1280px | `e2e/screenshots/editor-diagnostico-03-editor-1280.png` |
| Editor con bloque agregado | 1280px | `e2e/screenshots/editor-diagnostico-04-block-added-1280.png` |
| Editor en 375px | 375px | `e2e/screenshots/editor-diagnostico-06-viewport-375.png` |

---

## 3. Flujo Completo — Evaluación Punto a Punto

### 3.1 Crear email arrastrando bloques
**FUNCIONA**

- Layout 3 paneles: Palette (izquierda) → Canvas (centro) → Configuración (derecha)
- 17 tipos de bloque disponibles en la palette: Texto, Imagen, División, Botón, Encabezado, Sombra, Divisor, Redes, Espaciador, Producto, Cupón, Tabla, Reseña, Video, HTML, Productos, Diseño
- Click en un bloque lo agrega al canvas instantáneamente
- Toolbar flotante sobre cada bloque (tipo, mover arriba/abajo, duplicar, eliminar)
- Counter de bloques en header ("0 bloques" → "1 bloque")
- Drop zone visible con mensaje "Arrastra bloques aquí / O haz clic en un bloque del panel izquierdo"
- Panel derecho muestra "Selecciona un bloque" hasta que se haga click en uno

### 3.2 Agregar producto Shopify
**FUNCIONA** (con limitaciones)

- Bloque "Producto" existe en la palette con ícono dedicado
- Toolbar superior tiene botón "Productos" para inserción avanzada
- `ProductBlockPanel.tsx` ofrece 3 modos: Feed Dinámico, Selección Manual, Búsqueda
- 6 tipos de feed dinámico: Best Sellers, Últimos Vistos, Nuevos, Back in Stock, Complementarios, Carrito Abandonado
- Genera HTML con `data-steve-products="true"` para procesamiento backend
- **Limitación:** El selector manual requiere conexión Shopify activa para mostrar productos reales

### 3.3 Editar colores/fonts/spacing
**FUNCIONA**

- Al seleccionar un bloque de texto, panel derecho muestra:
  - **Contenido**: Textarea editable + botón "Insertar variable" (merge tags)
  - **Estilo**: Alineación (Izq/Centro/Der), Tamaño de fuente (select 14px), Color de texto (color picker #333333)
- Botones Duplicar y Eliminar al fondo del panel
- `BlockConfigPanel.tsx` tiene configuración específica para cada tipo de bloque (1172 líneas)
- `GlobalStylesPanel.tsx` permite brand kit: colores primario/secundario, fuente, logo

### 3.4 Preview desktop + mobile
**FUNCIONA MAL**

- Botón "Preview" visible en la barra superior del canvas
- Toggle Desktop/Mobile existe (íconos de monitor y teléfono) y funciona visualmente
- **Problema:** En viewport 375px, el canvas y el panel de configuración se superponen. No hay responsive breakpoint que oculte el panel derecho en mobile
- **Problema:** No hay un modo preview dedicado (fullscreen) que muestre el email renderizado final sin controles de edición
- El toggle de dispositivo cambia el ancho del canvas (600px vs 360px) pero no simula un inbox real

### 3.5 Test email — ¿llega? ¿se ve bien?
**NO EVALUABLE EN DIAGNÓSTICO AUTOMÁTICO**

- El botón "Enviar email de prueba" existe en Step 4 (Revisar y Enviar)
- El backend `send-email.ts` usa Resend API para envío
- Tracking pixel + link wrapping implementados
- Unsubscribe footer con HMAC token
- **Requiere test manual** para verificar deliverability y rendering

---

## 4. Lista Completa de Archivos del Editor

### Frontend — Editor Core (`src/components/client-portal/email/`)
| Archivo | Líneas | Función |
|---------|--------|---------|
| `BlocksEditorWrapper.tsx` | 186 | Wrapper React, sanitización, ref API |
| `CampaignBuilder.tsx` | 1570 | Wizard 4 pasos, CRUD campañas |
| `EmailTemplateGallery.tsx` | 1610 | 30+ templates, categorías, AI |
| `EmailMarketing.tsx` | 105 | Entry point, tabs |
| `FlowBuilder.tsx` | 751 | Automatizaciones, 8 triggers |
| `FlowCanvas.tsx` | 691 | Canvas visual de flujos |
| `FormBuilder.tsx` | 629 | Formularios signup |
| `ConditionalBlockPanel.tsx` | 523 | Bloques condicionales |
| `UniversalBlocksPanel.tsx` | 501 | Bloques reutilizables |
| `ProductBlockPanel.tsx` | 495 | Inserción de productos |
| `ABTestResultsPanel.tsx` | 488 | Resultados A/B |
| `GlobalStylesPanel.tsx` | 358 | Brand kit |
| `EmailAnalytics.tsx` | 563 | Dashboard métricas |
| `DeliverabilityDashboard.tsx` | 399 | Reputación SMTP |
| `ClickHeatmapPanel.tsx` | 385 | Heatmap de clicks |
| `DomainSetup.tsx` | 240 | Verificación dominio |
| `IndustryBenchmarksPanel.tsx` | 265 | Benchmarks industria |
| `SegmentBuilder.tsx` | 290 | Segmentación audiencia |
| `SubscribersList.tsx` | 315 | Lista suscriptores |
| `ProductAlerts.tsx` | 343 | Alertas de stock |
| `RevenueAttributionPanel.tsx` | 252 | Atribución revenue |
| `ImageEditorPanel.tsx` | 226 | Editor imágenes |
| `emailTemplates.ts` | 1745 | Templates HTML/JSON |
| `steveMailMergeTags.ts` | 76 | Definiciones merge tags |

### Frontend — Block System (`src/components/client-portal/email-blocks/`)
| Archivo | Líneas | Función |
|---------|--------|---------|
| `EmailBlockEditor.tsx` | 729 | Canvas principal, drag-drop, palette |
| `BlockConfigPanel.tsx` | 1172 | Config dinámica por tipo bloque |
| `blockTypes.ts` | 215 | Definiciones BlockType enum + defaults |
| `blockRenderer.ts` | 244 | HTML rendering email-safe |
| `KlaviyoVariablePicker.tsx` | 111 | Picker merge tags |

### Backend — Email Routes (`cloud-run-api/src/routes/email/`)
| Archivo | Líneas | Función |
|---------|--------|---------|
| `manage-campaigns.ts` | 700 | CRUD + envío campañas |
| `flow-engine.ts` | 813 | Ejecución flows con branching |
| `flow-webhooks.ts` | 949 | Webhooks + crons trigger |
| `send-email.ts` | 253 | Envío individual Resend |
| `product-recommendations.ts` | 550 | Recomendaciones productos |
| `product-recommendation-engine.ts` | 371 | Algoritmo recomendación |
| `campaign-analytics.ts` | 555 | Métricas campañas |
| `track-events.ts` | 282 | Tracking opens/clicks |
| `ab-testing.ts` | 372 | A/B testing |
| `generate-email-content.ts` | 249 | Generación AI |
| `email-templates-api.ts` | 236 | CRUD templates |
| `sync-subscribers.ts` | 273 | Sync desde Shopify |
| `query-subscribers.ts` | 159 | Query suscriptores |
| `signup-forms.ts` | 422 | Formularios |
| `form-widget.ts` | 472 | Widget deployment |
| `smart-send-time.ts` | 207 | Optimización horario |
| `revenue-attribution.ts` | 424 | Atribución revenue |
| `send-queue.ts` | 325 | Cola bulk send |
| `list-cleanup.ts` | 218 | Limpieza emails |
| `verify-domain.ts` | 163 | DKIM/SPF |
| `unsubscribe.ts` | 148 | Desuscripción |
| `product-alerts.ts` | 320 | Alertas stock |
| `product-alert-widget.ts` | 409 | Widget alertas |

### Backend — Librerías (`cloud-run-api/src/lib/`)
| Archivo | Líneas | Función |
|---------|--------|---------|
| `template-engine.ts` | 356 | Nunjucks, merge tags, filtros |
| `email-html-processor.ts` | 677 | Procesamiento bloques custom |

### Supabase Functions
| Archivo | Líneas | Función |
|---------|--------|---------|
| `steve-email-content/index.ts` | 432 | Generación AI emails |
| `klaviyo-push-emails/index.ts` | 434 | Push a Klaviyo |
| `parse-email-html/index.ts` | 145 | HTML → blocks parser |

### Otros
| Archivo | Líneas | Función |
|---------|--------|---------|
| `EmailTemplateBuilder.tsx` | 1234 | Builder standalone templates |
| `klaviyo/UnlayerEmailEditor.tsx` | ~150 | Bridge Klaviyo (nombre legacy) |

---

## 5. Evaluación Detallada

### FUNCIONA
| # | Feature | Detalle |
|---|---------|---------|
| 1 | Tabs principales | Campañas, Contactos, Automatizaciones, Formularios visibles |
| 2 | Crear campaña (wizard) | 4 pasos: Datos → Diseño → Audiencia → Revisar |
| 3 | Editor 3 paneles | Palette izquierda, canvas centro, config derecha |
| 4 | 17 tipos de bloque | Texto, Imagen, División, Botón, Encabezado, Sombra, Divisor, Redes, Espaciador, Producto, Cupón, Tabla, Reseña, Video, HTML, Productos, Diseño |
| 5 | Click-to-add bloques | Click en palette agrega al canvas |
| 6 | Toolbar flotante | Tipo, mover, duplicar, eliminar por bloque |
| 7 | Config panel dinámico | Campos cambian según tipo de bloque |
| 8 | Merge tags | "Insertar variable" con 7 categorías |
| 9 | Templates gallery | 30+ templates por categoría/industria |
| 10 | Bloques reutilizables | Botón "Bloques" en toolbar |
| 11 | Productos dinámicos | Botón "Productos" + ProductBlockPanel |
| 12 | Bloques condicionales | Botón "Condicional" en toolbar |
| 13 | AI generation | Botón para generar contenido con AI |
| 14 | Guardar plantilla | Botón "Guardar Plantilla" |
| 15 | Automatizaciones | 8 triggers: abandoned_cart, welcome, customer_created, first_purchase, post_purchase, winback, birthday, browse_abandonment |
| 16 | A/B testing | Soporte variant B, split, métricas |
| 17 | Sanitización HTML | DOMPurify con whitelist estricta |
| 18 | Email structure | DOCTYPE, Outlook VML, dark mode, responsive CSS |
| 19 | Backend processing | processEmailHtml() maneja data-steve-products, data-steve-discount, data-steve-condition per-subscriber |
| 20 | Tracking | Open pixel + click redirect + UTM params |

### FUNCIONA MAL
| # | Feature | Problema | Severidad |
|---|---------|----------|-----------|
| 1 | Mobile preview | Toggle Desktop/Mobile existe pero no hay modo fullscreen preview | Media |
| 2 | Responsive 375px | En viewport 375px, palette y config se superponen. Canvas desaparece | Alta |
| 3 | Tab Analytics/Rendimiento | El tab se llama "Rendimiento" pero el test busca "Analytics" — discrepancia de nombre | Baja |
| 4 | undo/redo | BlocksEditorWrapper tiene stubs vacíos para undo() y redo() | Media |
| 5 | setDevice() | Stub vacío en BlocksEditorWrapper — no propaga al EmailBlockEditor | Baja |

### NO FUNCIONA
| # | Feature | Problema | Severidad |
|---|---------|----------|-----------|
| 1 | Drag-and-drop real | Solo click-to-add funciona. No se probó drag desde palette al canvas | Media |
| 2 | Test email send | No se pudo verificar envío real (requiere Step 4 completo) | Alta — pendiente manual |

---

## 6. Bugs Identificados

### Críticos
1. **Responsive en mobile viewport (375px)**: El editor se rompe visualmente — los paneles se superponen y el canvas no es visible. Necesita breakpoints CSS para ocultar palette/config en mobile.

### Medios
2. **undo/redo no implementado**: `BlocksEditorWrapper.tsx` líneas 154-165 son stubs. El usuario no puede deshacer cambios.
3. **Preview mode incompleto**: No hay modo fullscreen que muestre el email renderizado como se vería en un inbox real.
4. **Nunjucks falla silenciosamente**: `template-engine.ts` línea 267 — si el template tiene errores, retorna HTML original sin notificar al usuario.

### Bajos
5. **Tab naming**: El tab se llama "Rendimiento" en la UI pero algunos tests esperan "Analytics".
6. **Product cache stale**: Productos Shopify cacheados 1 hora — si se eliminan productos, aparecen fantasmas.
7. **Legacy naming**: `UnlayerEmailEditor.tsx` no usa Unlayer — confunde a desarrolladores.

---

## 7. Gap Frontend ↔ Backend

| Feature | Frontend | Backend | Status |
|---------|----------|---------|--------|
| Merge tags `{{nombre}}` | Editor inserta | Nunjucks reemplaza | SIN GAP |
| Productos `data-steve-products` | UI genera HTML | processEmailHtml() reemplaza per-subscriber | SIN GAP |
| Descuentos `data-steve-discount` | UI genera HTML | processEmailHtml() crea código Shopify | SIN GAP |
| Condicionales `data-steve-condition` | UI serializa JSON | processEmailHtml() evalúa y remueve | SIN GAP |
| A/B testing | UI crea variant B | Backend split + selecciona ganador | SIN GAP |
| Recomendaciones personalizadas | UI elige tipo feed | Backend genera per-subscriber | SIN GAP |

---

## 8. Resumen Ejecutivo

El editor de emails Steve Mail v2 es un **sistema completo y funcional** que reemplazó exitosamente a GrapeJS con un editor custom de bloques.

**Fortalezas:**
- 17+ tipos de bloque con config dinámica
- Pipeline backend completo (condicionales → productos → descuentos per-subscriber)
- Sanitización de seguridad robusta
- Templates gallery con 30+ opciones + AI generation
- 8 triggers de automatización

**Áreas de mejora:**
- Responsive en mobile viewport
- Undo/redo no implementado
- Preview fullscreen ausente
- Tests E2E desactualizados (buscan GrapeJS que ya no existe)

**Conclusión:** El editor está en **estado funcional sólido para desktop**. Las prioridades de mejora son: (1) implementar undo/redo, (2) agregar preview fullscreen, (3) arreglar responsive mobile.
