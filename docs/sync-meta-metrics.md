# Sync Meta Metrics — Fix de auth y flujo completo

## Bug original

Steve chat decía "no tengo acceso a cuentas" para Jardín de Eva aunque Meta estaba conectado.
Causa: `platform_metrics` y `campaign_metrics` estaban vacíos porque el sync nunca corría.

## Root cause (commit c9aeb7d)

```
sync-all-metrics (cron cada 6h)
  → llama internamente a sync-meta-metrics
  → envía header: X-Cron-Secret
  → sync-meta-metrics pasa por authMiddleware
  → authMiddleware requiere Authorization: Bearer
  → 401 Unauthorized ← AQUÍ SE ROMPÍA
  → platform_metrics nunca se llenaba
```

`authMiddleware` acepta:
- `Authorization: Bearer {JWT}` — valida con Supabase auth
- `Authorization: Bearer {SERVICE_ROLE_KEY}` o `X-Internal-Key: {SERVICE_ROLE_KEY}` — marca como internal

El cron enviaba solo `X-Cron-Secret`, que no es ninguno de esos.

## Fix aplicado

### 1. sync-all-metrics.ts

Ahora envía `SUPABASE_SERVICE_ROLE_KEY` como `Authorization: Bearer` + `X-Internal-Key`:

```typescript
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const response = await fetch(`${baseUrl}${endpoint}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${serviceKey}`,
    'X-Internal-Key': serviceKey,
    'X-Cron-Secret': cronSecret!,
  },
  body: JSON.stringify(body),
});
```

### 2. sync-meta-metrics.ts

Detecta llamadas internas y salta validación de ownership:

```typescript
const isInternal = c.get('isInternal');
if (isInternal) {
  console.log('[sync-meta] Internal/cron call — skipping user auth');
} else if (shopifySessionToken) {
  // ... validación normal
}

// Ownership check también se salta para internal
if (!isInternal) {
  // ... verificar que el user es dueño de la conexión
}
```

## Flujo completo después del fix

```
Cloud Scheduler (cada 6h)
  → POST /api/cron/sync-all-metrics (X-Cron-Secret)
    → Lee TODAS las platform_connections con token
    → Para cada conexión Meta:
      → POST /api/sync-meta-metrics (Authorization: Bearer SERVICE_KEY)
        → authMiddleware reconoce como internal ✓
        → syncMetaMetrics salta ownership check ✓
        → Descifra token Meta del merchant
        → GET graph.facebook.com/v21.0/act_{id}/insights
        → Guarda en platform_metrics (spend, impressions, clicks, etc.)
        → GET graph.facebook.com/v21.0/act_{id}/campaigns
        → Guarda en campaign_metrics (por campaña: spend, ROAS, CTR, etc.)

Steve chat (modo estrategia)
  → Lee platform_metrics + campaign_metrics del client_id
  → Inyecta en system prompt como "MÉTRICAS DE PLATAFORMA" y "CAMPAÑAS ACTIVAS"
  → Claude responde con datos reales
```

## Archivos involucrados

| Archivo | Cambio |
|---------|--------|
| `cloud-run-api/src/routes/cron/sync-all-metrics.ts` | Envía SERVICE_ROLE_KEY como auth |
| `cloud-run-api/src/routes/meta/sync-meta-metrics.ts` | Acepta internal calls, salta ownership |
| `cloud-run-api/src/middleware/auth.ts` | Sin cambios (ya soportaba SERVICE_ROLE_KEY) |

## Verificar que funciona

Después del deploy:

```bash
# Trigger manual
curl -X POST https://steve-api-850416724643.us-central1.run.app/api/cron/sync-all-metrics \
  -H "X-Cron-Secret: $CRON_SECRET"

# Verificar datos (con service role key)
curl "https://zpswjccsxjtnhetkkqde.supabase.co/rest/v1/platform_metrics?select=*&limit=5" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY"
```
