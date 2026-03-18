# QA FINAL: WhatsApp Module — Ignacio W17

| Field | Value |
|-------|-------|
| **Date** | 2026-03-18 |
| **Module** | WhatsApp Business (Steve Chat + Merchant WA) |
| **Run** | Final audit |

## Results: 5/6 PASS, 1 PARTIAL

---

### CHECK 1: WhatsApp Hub UI
**✅ PASS**

- Tab "WhatsApp" visible en menú "Más"
- Carga setup screen correctamente: "Activa WhatsApp para tu tienda"
- Beneficios listados: Steve responde 24/7, carrito abandonado, 100 créditos gratis
- Botón "Activar WhatsApp" presente
- 2x 406 iniciales en wa_twilio_accounts/wa_credits (PostgREST schema cache stale) — se resolvió solo, queries ahora retornan OK

---

### CHECK 2: Backend completo
**✅ PASS — 8/8 archivos, 1,444 líneas totales**

| Archivo | Líneas | Función |
|---------|--------|---------|
| steve-wa-chat.ts | 195 | Webhook: merchant → Steve por WA |
| merchant-wa.ts | 347 | Webhook: cliente → tienda (Steve responde como la tienda) |
| send-message.ts | 115 | Portal: merchant envía reply manual + descuenta 1 crédito |
| send-campaign.ts | 201 | Envío masivo de campañas WA |
| setup-merchant.ts | 273 | Crear sub-account Twilio + comprar número + créditos bienvenida |
| status-callback.ts | 38 | Twilio status updates (delivered, read, failed) |
| abandoned-cart-wa.ts | 189 | Automatización carrito abandonado |
| shopify-checkout-webhook.ts | 86 | Webhook de Shopify para triggear WA |

8 rutas registradas en index.ts.

---

### CHECK 3: Twilio env vars en Cloud Run
**⚠️ PARTIAL — 3/4**

| Variable | Estado |
|----------|--------|
| TWILIO_ACCOUNT_SID | ✅ Configurada |
| TWILIO_AUTH_TOKEN | ✅ Configurada |
| TWILIO_PHONE_NUMBER | ✅ Configurada |
| STEVE_WA_NUMBER | ❌ Falta — usado por steve-wa-chat.ts para identificar mensajes entrantes del merchant |

**Fix:** `gcloud run services update steve-api --region us-central1 --project steveapp-agency --set-env-vars STEVE_WA_NUMBER=<número>`

---

### CHECK 4: Webhook endpoint
**✅ PASS**

| Endpoint | Method | Response |
|----------|--------|----------|
| /api/whatsapp/steve-wa-chat | POST | 200 OK |
| /api/whatsapp/setup-merchant | POST (sin JWT) | 401 Unauthorized (expected) |
| /api/whatsapp/merchant-wa/:id | POST | Registered, Twilio webhook |
| /api/whatsapp/status-callback | POST | Registered, no JWT |
| /api/whatsapp/send-message | POST | Registered, JWT required |
| /api/whatsapp/send-campaign | POST | Registered, JWT required |

---

### CHECK 5: Tablas en Supabase
**✅ PASS — 7/7 tablas WA**

| Tabla | Estado |
|-------|--------|
| wa_messages | ✅ Existe |
| wa_twilio_accounts | ✅ Existe |
| wa_credits | ✅ Existe |
| wa_credit_transactions | ✅ Existe |
| wa_conversations | ✅ Existe |
| wa_campaigns | ✅ Existe |
| wa_automations | ✅ Existe |
| steve_conversations.channel | ❌ Columna faltante (no bloquea, steve_conversations usa conversation_id) |

---

### CHECK 6: Qué falta para activar WhatsApp

**Infraestructura (15 min):**
1. ~~Crear cuenta Twilio~~ ✅ Ya existe (TWILIO_ACCOUNT_SID configurado)
2. ~~Comprar número chileno~~ ✅ Ya existe (TWILIO_PHONE_NUMBER configurado)
3. Agregar `STEVE_WA_NUMBER` a Cloud Run (1 min)
4. Registrar número para WhatsApp Business en Meta/Twilio (~10-15 min, proceso guiado)
5. Configurar webhook URL de Twilio: `https://steve-api-850416724643.us-central1.run.app/api/whatsapp/steve-wa-chat` (2 min)

**Costo Twilio (ya en cuenta):**
- Número chileno: ~$15/mes
- Mensajes WA (Chile): ~$0.05 USD por mensaje
- Sub-accounts para merchants: gratis (parte de la cuenta principal)

**Código faltante: NADA.** Todo está implementado:
- Backend: 8 endpoints, 1,444 líneas
- Frontend: WhatsAppHub con Setup, Inbox, Campaigns, Automations, Credits (5 tabs)
- Base de datos: 7 tablas con RLS
- Sistema de créditos: check balance, deduct, transactions
- Automatización: carrito abandonado con Shopify webhook
- Alertas: email al merchant cuando créditos bajos

**Tiempo estimado para activar: 30 minutos** (configuración de Twilio + Meta WhatsApp Business, sin código).

---

## RESUMEN

| Check | Estado |
|-------|--------|
| 1. WhatsApp Hub UI | ✅ PASS |
| 2. Backend completo (8 archivos) | ✅ PASS |
| 3. Twilio env vars | ⚠️ 3/4 (falta STEVE_WA_NUMBER) |
| 4. Webhook endpoint | ✅ PASS (200 OK) |
| 5. Tablas Supabase (7 tablas) | ✅ PASS |
| 6. Qué falta | Solo config Twilio+Meta (~30 min) |

**Veredicto: WhatsApp está CODE COMPLETE. Solo falta configuración de infraestructura.**
