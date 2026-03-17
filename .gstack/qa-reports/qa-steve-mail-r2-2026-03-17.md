# QA Report: Steve Mail — Run #2 (Bug Verification)

| Field | Value |
|-------|-------|
| **Date** | 2026-03-17 |
| **URL** | https://www.steve.cl/portal |
| **Run ID** | stevemail-r2 |
| **Scope** | Verification of 4 bugs from stevemail-r1 |
| **Duration** | ~8 min |
| **Screenshots** | 4 |

## Summary: 1 fixed, 3 still open

| Bug | r1 Status | r2 Status | Notes |
|-----|-----------|-----------|-------|
| BUG-001 | MAJOR | **OPEN** | No bloque Footer/Unsubscribe en sidebar editor |
| BUG-002 | MAJOR | **OPEN** | Email remitente sigue mostrando "noreply@tudominio.com" |
| BUG-003 | MAJOR | **OPEN** | No hay UI para crear listas ni segmentos en Contactos |
| BUG-004 | MAJOR | **FIXED** | Botón "Configuración de dominio" ahora abre sheet con input + verificar |

---

## BUG-001: No hay bloque Footer/Unsubscribe — OPEN

**Verificación:** Abrí el editor (paso 2 del wizard). Sidebar muestra 18 tipos de bloques:
Texto, Imagen, División, Botón, Encabezado, Sombra, Divisor, Redes, Espaciador, Producto, Cupón, Tabla, Reseña, Vídeo, HTML, Productos, Columnas, Sección.

**Ninguno es "Footer" ni "Unsubscribe".** Busqué en el texto completo de la página las palabras "Footer", "Unsubscribe", "Pie de página", "desuscri" — no aparecen.

**Novedad vs r1:** Se agregó bloque "HTML" y bloque "Vídeo" que no existían antes. Pero Footer/Unsubscribe dedicado sigue faltando.

**Impacto:** Sin link de unsubscribe, los emails enviados violan CAN-SPAM/GDPR. Es ilegal enviar emails comerciales sin opción de desuscripción.

**Evidencia:** [Editor sidebar](screenshots/stevemail-r2/stevemail-r2-bug001-editor.png)

---

## BUG-002: Email remitente placeholder — OPEN

**Verificación:** Al crear nueva campaña, el campo "Email del remitente" muestra `noreply@tudominio.com`.

- Nombre del remitente: "Jardin de Eva" ✅ (auto-rellena correctamente)
- Email del remitente: `noreply@tudominio.com` ❌ (placeholder genérico, no el dominio real)

El campo está vacío (no es placeholder sino texto del input hint). El merchant no sabe qué poner ahí.

**Sugerencia:** Si no hay dominio verificado, mostrar un aviso "Configura tu dominio primero" con link al sheet de configuración. Si hay dominio verificado, auto-rellenar con `noreply@{dominio}`.

**Evidencia:** [Sender field](screenshots/stevemail-r2/stevemail-r2-bug002-sender.png)

---

## BUG-003: No se pueden crear listas ni segmentos — OPEN

**Verificación:** Tab "Contactos" muestra:
- Stats: 0 Total, 0 Suscritos, 0 Desuscritos
- Filtro por estado (dropdown "Todos")
- Botón "Importar de Shopify" ✅
- Botón "Agregar contacto" ✅
- Búsqueda por email/nombre ✅

**Falta:** No hay botón "Crear lista", "Nueva lista", "Nuevo segmento" ni nada similar. Todos los contactos van a una lista plana. Sin listas, en el paso 3 "Audiencia" del wizard no puedes segmentar a quién enviar.

**Evidencia:** [Contactos tab](screenshots/stevemail-r2/stevemail-r2-bug003-contactos.png)

---

## BUG-004: Botón "Configuración de dominio" — FIXED ✅

**Verificación:** Click en "Configuración de dominio" ahora abre un sheet lateral con:
- Título: "Configurar dominio de envío"
- Subtítulo: "Envía emails desde tu propio dominio (ej: info@tutienda.com)"
- "Paso 1: Tu dominio"
- Input de texto con placeholder "tutienda.com"
- Botón "Verificar" (disabled hasta que se ingrese dominio)
- Botón "Close" para cerrar

**Funcionaba en r1?** No — click no hacía nada.
**Funciona en r2?** Sí — abre correctamente el flujo de configuración.

**Evidencia:** [Domain config sheet](screenshots/stevemail-r2/stevemail-r2-bug004-domain.png)

---

## Nuevos hallazgos en r2

### NUEVO: Bloques HTML y Vídeo agregados al editor
- Bloque "HTML" ahora aparece en sidebar (no existía en r1)
- Bloque "Vídeo" ahora aparece en sidebar (no existía en r1)
- El bloque HTML podría usarse como workaround temporal para agregar un footer con unsubscribe manualmente

### NUEVO: Bloque "Condicional" en editor
- Botón "Condicional" visible en toolbar — permite contenido dinámico basado en condiciones
- No existía en r1

---

## Priorización de fixes pendientes

| Prioridad | Bug | Impacto |
|-----------|-----|---------|
| 1. CRITICAL | BUG-001: Footer/Unsubscribe | Ilegal enviar sin esto |
| 2. HIGH | BUG-002: Email remitente | Confunde al merchant |
| 3. HIGH | BUG-003: Listas/segmentos | No puede segmentar audiencia |

## Score actualizado

| Metric | r1 | r2 | Delta |
|--------|----|----|-------|
| Bugs abiertos | 4 | 3 | -1 |
| Bugs cerrados | 0 | 1 | +1 |
| Bloques editor | 13 | 18 | +5 |
| Features nuevas | — | HTML, Vídeo, Condicional | +3 |

**El editor sigue mejorando** (5 bloques nuevos). Falta el fix crítico de Footer/Unsubscribe para que Steve Mail sea legalmente usable.
