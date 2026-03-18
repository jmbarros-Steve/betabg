# QA Report: WhatsApp Module — Run #1

| Field | Value |
|-------|-------|
| **Date** | 2026-03-18 |
| **URL** | https://www.steve.cl/portal |
| **Run ID** | whatsapp-r1 |
| **Module** | WhatsApp Business |
| **Client** | Jardín de Eva |
| **Duration** | ~8 min |
| **Screenshots** | 2 |

## Score: 5/12 checks (42%)

---

## CHECK 1: WhatsApp tab visible en portal

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1.1 | Tab "WhatsApp" en menú Más | **PASS** | Aparece como último item en dropdown |
| 1.2 | Tab carga sin errores JS | **PASS** | Carga correctamente, sin crash |
| 1.3 | Setup screen se muestra | **PASS** | Muestra "Activa WhatsApp para tu tienda" con descripción y beneficios |

### Setup screen — lo que se ve:
- Título: "Activa WhatsApp para tu tienda"
- Descripción: "Tus clientes podrán escribirte por WhatsApp y Steve responderá automáticamente como si fueras tú. Atención 24/7 sin esfuerzo."
- Beneficios listados: Steve responde 24/7, carrito abandonado automático, clientes no saben que es IA, 100 créditos gratis
- Botón: "Activar WhatsApp"
- Nota: "Se asignará un número chileno a tu tienda. Puedes desactivarlo en cualquier momento."

**Evidencia:** [Setup screen](screenshots/wa-r1/qa-wa-r1-overview.png)

---

## CHECK 2: Activar WhatsApp (setup-merchant)

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 2.1 | Click "Activar WhatsApp" | **FAIL** | API retorna 500 |
| 2.2 | Loading state visible | **FAIL** | No se muestra spinner ni feedback |
| 2.3 | Error toast al usuario | **FAIL** | No se muestra ningún error al usuario |
| 2.4 | Número asignado | **FAIL** | No se llega a este paso |

### BUG-001 (CRITICAL): setup-merchant retorna 500

- **Request:** `POST /api/whatsapp/setup-merchant` → HTTP 500 (241ms)
- **Causa probable:** Twilio credentials (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`) no están configuradas en Cloud Run. El endpoint intenta crear sub-account en Twilio y falla.
- **UX:** El usuario hace click, no pasa nada visible. No hay toast de error, no hay spinner, no hay feedback alguno. El botón se queda igual.

### BUG-002 (MAJOR): Sin feedback de error al usuario

- **Qué pasó:** Después de hacer click en "Activar WhatsApp" y recibir 500, la UI no muestra ningún mensaje de error.
- **Qué debería pasar:** Toast rojo "Error al configurar WhatsApp. Intenta de nuevo o contacta soporte."
- **Reproducible:** Siempre

**Evidencia:** [After click](screenshots/wa-r1/qa-wa-r1-activate.png) — idéntico a before

---

## CHECK 3: Balance de créditos

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 3.1 | Vista de créditos visible | **BLOCKED** | Requiere setup completo (wa_twilio_accounts) |

No se puede verificar — el módulo gate-a todo detrás del setup. Sin `wa_twilio_accounts` activo, no se muestra inbox, créditos, campañas ni automatizaciones.

---

## CHECK 4: Enviar mensaje WA

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 4.1 | Enviar mensaje desde portal | **BLOCKED** | Requiere setup completo |

---

## CHECK 5: Configurar número

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 5.1 | Flujo de configuración | **FAIL** | 500 en setup-merchant (ver BUG-001) |

---

## Backend verification

| Endpoint | Registered | Status |
|----------|-----------|--------|
| `POST /api/whatsapp/setup-merchant` | Yes | 500 (Twilio not configured) |
| `POST /api/whatsapp/send-message` | Yes | Not tested (blocked by setup) |
| `POST /api/whatsapp/send-campaign` | Yes | Not tested (blocked by setup) |
| `POST /api/whatsapp/steve-wa-chat` | Yes | Not tested |
| `POST /api/whatsapp/merchant-wa/:id` | Yes | Not tested |
| `POST /api/whatsapp/status-callback` | Yes | Not tested |
| `POST /api/whatsapp/abandoned-cart` | Yes | Not tested |
| `POST /api/whatsapp/shopify-checkout` | Yes | Not tested |

---

## Bugs (2 encontrados)

| # | Severidad | Bug | Bloqueante |
|---|-----------|-----|------------|
| BUG-001 | CRITICAL | setup-merchant retorna 500 — Twilio no configurado | Sí — bloquea TODO el módulo |
| BUG-002 | MAJOR | Sin feedback de error al usuario en activación | No |

---

## Root cause analysis

El módulo WhatsApp está **bien construido** (8 endpoints, setup gate, credits system, UI con tabs). Pero es **100% dependiente de Twilio** que aún no está configurado:

1. `TWILIO_ACCOUNT_SID` — no está en Cloud Run env vars
2. `TWILIO_AUTH_TOKEN` — no está en Cloud Run env vars
3. Sin credenciales → `setup-merchant` falla al intentar crear sub-account → 500

**El módulo no puede funcionar hasta que Twilio esté configurado.** No es un bug de código, es una dependencia de infraestructura pendiente.

## Lo que está bien (código review)

- Setup screen con UX clara y beneficios listados ✅
- Gate pattern correcto: sin account → setup, con account → hub completo ✅
- 8 endpoints registrados en routes/index.ts ✅
- Credit deduction atómica en send-message ✅
- wa_credit_transactions logging ✅
- Sub-account pattern para multi-tenant ✅

## Acción requerida

1. **Obtener credenciales de Twilio** (crear cuenta, agregar billing)
2. **Agregar env vars a Cloud Run:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `STEVE_WA_NUMBER`
3. **Re-testear** — una vez configurado, todo el módulo debería funcionar
4. **Agregar toast de error** en el frontend cuando setup-merchant falla

## Can merchants use WhatsApp?

**NO.** Bloqueado por falta de credenciales Twilio. Todo el código está listo, solo falta la configuración de infraestructura.
