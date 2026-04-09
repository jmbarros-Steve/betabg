# Andrés W3 — Google Ads — Estado

## Bugs pendientes (asignados 2026-04-09, por Claude Code)

### Bug 1: Métricas Google Ads sin parseFloat defensivo
**Archivo:** `cloud-run-api/src/routes/google/sync-google-ads-metrics.ts`
**Líneas:** 252, 259, 288, 295
**Problema:** Los valores de métricas (`conversions`, `conversionsValue`, `ctr`, `costPerConversion`) se usan directo sin `parseFloat()`. Si la API de Google Ads devuelve strings en vez de numbers (ha pasado), las operaciones matemáticas fallan silenciosamente o producen `NaN`.
**Fix:** Agregar `parseFloat()` defensivo en cada valor antes de usarlo.

### Bug 2: Cron secret comparado con `===` (timing attack)
**Archivo:** `cloud-run-api/src/routes/google/sync-google-ads-metrics.ts`
**Línea:** 38
**Código actual:**
```typescript
const isCron = !!(cronSecret && providedCronSecret === cronSecret);
```
**Problema:** `===` es vulnerable a timing attacks. Un atacante podría medir tiempos de respuesta para adivinar el secret byte a byte.
**Fix:** Usar `timingSafeEqual` de `crypto`:
```typescript
import { timingSafeEqual } from 'crypto';
const isCron = !!(cronSecret && providedCronSecret &&
  cronSecret.length === providedCronSecret.length &&
  timingSafeEqual(Buffer.from(providedCronSecret), Buffer.from(cronSecret)));
```

**Nota:** El mismo bug de `===` también existe en:
- `cloud-run-api/src/routes/cron/chino-executor.ts` línea 127
- `cloud-run-api/src/routes/shopify/sync-shopify-metrics.ts` línea 22
(Estos no son de Google pero conviene arreglarlos juntos)
