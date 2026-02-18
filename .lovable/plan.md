
## Diagnóstico definitivo — Evidencia concreta de la base de datos

### Lo que confirman los datos:
- **El edge function funciona perfectamente:** Ultima ejecucion: 200 OK, 145 segundos, escribio `status: complete` y **6 competidores** en la DB
- **`brand_research` esta en la publicacion Realtime:** La migracion funciono correctamente
- **El estado actual en DB:** `analysis_status = complete`, `competitor_analysis = 6 competidores`

### El bug real (por fin identificado con certeza)

El Realtime de Supabase con `filter: client_id=eq.${clientId}` en `postgres_changes` tiene un comportamiento critico documentado: **el filtro del lado servidor requiere que el usuario autenticado tenga una politica RLS que le permita hacer SELECT del row filtrado**. Si el evento es escrito por el `service_role` (el edge function), Realtime evalua si el *suscriptor* (el usuario del browser) puede ver ese row segun RLS, y si hay alguna ambiguedad, **descarta el evento silenciosamente sin error**.

Esto explica por que el Realtime **nunca dispara** en el browser aunque el edge function escribe `complete` correctamente.

**Prueba adicional:** El codigo tiene `event: 'UPDATE'` pero el edge function hace `upsert` con `onConflict: 'client_id,research_type'`. Si en algun momento el registro no existe, el upsert hace un `INSERT`, no un `UPDATE` — y el listener de Realtime no lo captura porque solo escucha `UPDATE`.

### La solucion: Polling hibrido confiable (sin Realtime para el estado critico)

En lugar de depender exclusivamente de Realtime (que tiene el bug de filtros RLS), implementar un **polling de status simple y directo** cada 4 segundos:

1. Cuando el usuario hace click → `setAnalyzing(true)` inmediatamente → guardar timestamp local en `sessionStorage`
2. Iniciar polling de status cada 4s que consulta `analysis_status` en la DB
3. Cuando el poll encuentra `status: complete` con `updated_at` posterior al timestamp del click → cerrar banner
4. Mantener el Realtime como canal adicional (si funciona, mejor; si no, el polling lo cubre)

**Por que este enfoque es mas confiable que Realtime:**
- No depende de filtros RLS del Realtime
- No tiene el bug INSERT vs UPDATE
- El guard de timestamp ahora funciona correctamente porque: el upsert de `pending` actualiza `updated_at` a "ahora", y el `complete` llega despues — ambos son posteriores al click del usuario
- La comparacion de timestamps se hace en UTC string, no en numeros — eliminando el problema ms vs µs

### Por que el guard de timestamp anterior fallaba

El codigo anterior usaba `analysisStartRef.current` (milisegundos de JS) y comparaba con `updated_at` de Postgres (timestamp ISO string). La conversion era inconsistente. La nueva implementacion guarda el timestamp como string ISO en `sessionStorage` y compara directamente con `row.updated_at` (ambos strings ISO), lo que elimina el problema completamente.

---

## Cambios a implementar

### Archivo: `src/components/client-portal/BrandAssetUploader.tsx`

**Cambios:**
1. Eliminar la dependencia exclusiva en Realtime para detectar el `complete`
2. Agregar un `statusPollingRef` que consulta `analysis_status` cada 4 segundos
3. Guardar el timestamp del click en `sessionStorage` como string ISO
4. En el poll: comparar `updated_at` del registro con el timestamp del click (ambos ISO strings) — si `updated_at > clickTimestamp` Y `status === complete`, cerrar banner
5. Mantener el Realtime como canal adicional (doble cobertura)
6. El banner debe aparecer **sincrónicamente** al hacer click (antes de cualquier async)

**Flujo nuevo garantizado:**
```text
Click del usuario
  → setAnalyzing(true) [SINCRONO — banner aparece instantáneamente]
  → sessionStorage.setItem('analysis_started_at', new Date().toISOString())
  → clearAll() [kill pollings anteriores]
  → isLaunchingRef.current = true

await upsert pending [async]
  → iniciar statusPollingRef (cada 4s)
  → iniciar progressPollingRef (cada 3s)
  → subscribeToStatus() [Realtime como bonus]
  → fetch edge function [fire & forget]

statusPoll (cada 4s):
  → leer analysis_status de DB
  → si status === complete Y updated_at > analysis_started_at → cerrar banner
  → si status === error → cerrar banner con error

Edge function:
  → escribe pending → progress updates → complete
  → Realtime O poll detectan el complete → banner se cierra
```

**Seccion critica — como se guarda el timestamp:**
```typescript
// Al hacer click:
const startedAt = new Date().toISOString();
sessionStorage.setItem(`analysis_started_${clientId}`, startedAt);

// En el poll:
const startedAt = sessionStorage.getItem(`analysis_started_${clientId}`) || '';
if (row.status === 'complete' && row.updated_at > startedAt) {
  // cerrar banner
}
```

**Por que `updated_at > startedAt` funciona:**
- `startedAt` es el ISO string del momento del click (ej: `2026-02-18T21:40:00.000Z`)
- `updated_at` del registro `complete` es el ISO string de cuando el edge function termino (ej: `2026-02-18T21:42:05.770Z`)
- La comparacion de strings ISO funciona lexicograficamente — siempre correcta
- El registro `pending` tambien tiene `updated_at` posterior al click, pero `status !== complete`, por lo que se ignora

### No se tocan otros archivos

El edge function (`analyze-brand/index.ts`) ya funciona perfectamente. Los 6 competidores ya estan en la DB. Solo hay que arreglar el frontend.

---

## Resumen de lo que se cambia vs lo que queda igual

| Elemento | Estado | Accion |
|---|---|---|
| Edge function analyze-brand | Funciona (6 competidores, status complete) | Sin cambios |
| Realtime publicacion brand_research | Habilitada | Sin cambios (se mantiene como backup) |
| Banner AnalysisBanner | Correcto | Sin cambios |
| BrandAssetUploader — logica de status | Rota (solo Realtime, sin fallback) | ARREGLAR con polling hibrido |
| Timestamp guard | Roto (numero vs string) | ARREGLAR con ISO string en sessionStorage |
