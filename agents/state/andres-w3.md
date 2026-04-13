# Andrés W3 — Google Ads — Estado

## Bugs resueltos

### Bug 1: Métricas Google Ads sin parseFloat defensivo ✅ (2026-04-13)
**Archivo:** `cloud-run-api/src/routes/google/sync-google-ads-metrics.ts`
**Fix:** Interface actualizado a `string | number`, `parseFloat(String(...)) || 0` aplicado en `conversions`, `conversionsValue`, `ctr`, `costPerConversion`.

### Bug 2: Cron secret comparado con `===` (timing attack) ✅ (ya estaba arreglado)
**Fix:** Ya migrado a `isValidCronSecret()` de `cloud-run-api/src/lib/cron-auth.ts` que usa `timingSafeEqual`.

## Tareas pendientes
- Ninguna asignada actualmente
