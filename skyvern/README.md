# Skyvern — Integración con Steve Platform

## Acceso

| Recurso | URL |
|---------|-----|
| API | `http://localhost:8000` |
| UI | `http://localhost:8080` |
| Containers | `~/skyvern` (Docker Compose) |

## Autenticación

Todas las llamadas al API requieren el header `x-api-key`:

```
x-api-key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjQ5MTg3NDcwNzQsInN1YiI6Im9fNTA3MjUyMjgwMjMwMTYzMDc4In0.77WUj9xpzCq2xKQv5WZK7_aRBVrhmCbhcibUUFDJaQE
```

## Crear una tarea

```bash
curl -X POST http://localhost:8000/v1/run/tasks \
  -H "Content-Type: application/json" \
  -H "x-api-key: <TOKEN>" \
  -d '{
    "url": "https://ejemplo.com",
    "prompt": "Navega al login y completa el formulario con email test@test.com",
    "engine": "skyvern-2.0"
  }'
```

Respuesta:
```json
{
  "run_id": "tsk_v2_507255378383187738",
  "status": "queued",
  "app_url": "http://localhost:8080/runs/wr_..."
}
```

## Consultar estado

```bash
curl http://localhost:8000/v1/runs/<run_id> \
  -H "x-api-key: <TOKEN>"
```

Estados posibles: `queued` → `running` → `completed` | `failed`

## Conexión con Steve Tasks

Cuando se crea una task en la tabla `tasks` con `type = 'skyvern-onboarding'`, el cron
`/api/cron/skyvern-dispatcher` la detecta automáticamente y:

1. Lee el campo `spec` (JSONB) para obtener `url` y `prompt`
2. Crea un run en Skyvern via API
3. Actualiza la task a `in_progress` con el `run_id` en `result`
4. En la siguiente ejecución, consulta el estado del run y marca la task como `completed` o `failed`

### Ejemplo: crear task de onboarding

```sql
INSERT INTO tasks (shop_id, title, description, type, source, priority, spec)
VALUES (
  'uuid-del-cliente',
  'Onboarding automático: configurar Shopify',
  'Navegar a Shopify admin y configurar checkout settings',
  'skyvern-onboarding',
  'cerebro',
  'alta',
  '{"url": "https://admin.shopify.com/store/mi-tienda", "prompt": "Navigate to Settings > Checkout and enable automatic email collection"}'
);
```

## LLM Config

- Provider: Anthropic (`ANTHROPIC_CLAUDE4_SONNET`)
- Modelo: `claude-sonnet-4-20250514`
- Config: `~/skyvern/.env` con `ENABLE_ANTHROPIC=true`

## Operaciones

```bash
# Reiniciar
cd ~/skyvern && sudo docker compose restart skyvern

# Ver logs
cd ~/skyvern && sudo docker logs -f skyvern-skyvern-1

# Parar todo
cd ~/skyvern && sudo docker compose down

# Iniciar todo
cd ~/skyvern && sudo docker compose up -d
```

---

## WhatsApp — Carrito Abandonado (Flujo Completo)

Flujo automático: cliente abandona carrito en Shopify → 1hr después recibe WhatsApp recordatorio vía el número del merchant.

### Arquitectura

```
Shopify (checkouts/create webhook)
  │
  ▼
POST /api/whatsapp/shopify-checkout-webhook
  │  Identifica merchant por shop_domain
  │  Extrae teléfono, productos, URL del carrito
  │  Guarda en shopify_abandoned_checkouts
  │
  ▼
Cron cada hora: POST /api/cron/abandoned-cart-wa
  │  Busca checkouts 1-24hrs old, no completados, no recordados
  │  Para cada uno:
  │    ├─ ¿Merchant tiene wa_automations.trigger_type='abandoned_cart' activa? → sino skip
  │    ├─ ¿Merchant tiene wa_credits.balance >= 1? → sino skip
  │    ├─ ¿Merchant tiene wa_twilio_accounts activa? → sino skip
  │    │
  │    ▼
  │  Construye mensaje desde template:
  │    {{customer_name}}, {{product_name}}, {{total_price}}, {{cart_url}}, {{store_name}}
  │    │
  │    ▼
  │  Envía vía Twilio sub-account del merchant
  │    whatsapp:{merchant_number} → whatsapp:{customer_phone}
  │    │
  │    ▼
  │  Descuenta 1 crédito (wa_credits) + registra transacción (wa_credit_transactions)
  │  Guarda en wa_messages (channel='merchant_wa', template='abandoned_cart')
  │  Marca checkout como wa_reminder_sent=true
  │
  ▼
Cliente recibe WhatsApp con link al carrito
  Si compra → Shopify orders/create webhook marca order_completed=true
```

### Tablas involucradas

| Tabla | Rol |
|-------|-----|
| `shopify_abandoned_checkouts` | Almacena checkouts pendientes con teléfono, productos, URL |
| `wa_automations` | Config del merchant: template, trigger_type, is_active |
| `wa_credits` | Balance de créditos WA del merchant |
| `wa_credit_transactions` | Historial de consumo de créditos |
| `wa_twilio_accounts` | Sub-account Twilio del merchant (SID, token, número) |
| `wa_messages` | Historial de todos los mensajes WA enviados |

### Archivos

| Archivo | Función |
|---------|---------|
| `cloud-run-api/src/routes/whatsapp/shopify-checkout-webhook.ts` | Webhook receptor de Shopify |
| `cloud-run-api/src/routes/whatsapp/abandoned-cart-wa.ts` | Cron horario que envía recordatorios |
| `supabase/migrations/20260317800000_shopify_abandoned_checkouts.sql` | Tabla + índice |

### Configuración requerida

1. **Shopify**: configurar webhook `checkouts/create` → `https://steve-api-850416724643.us-central1.run.app/api/whatsapp/shopify-checkout-webhook`
2. **Cloud Scheduler**: cron `0 * * * *` → `POST /api/cron/abandoned-cart-wa` con header `X-Cron-Secret`
3. **Merchant**: crear automation en portal WA con trigger `abandoned_cart` y template personalizado
4. **Créditos**: merchant debe tener balance > 0 en `wa_credits`
