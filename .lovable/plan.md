
## El Bug Real — Identificado con Evidencia Concreta

### Causa 1 (CRÍTICA): Comparación de timestamps rota por formato de string

La comparación `updatedAt > startedAt` falla porque los dos strings tienen **formatos distintos**:

- `startedAt` (guardado por JS): `"2026-02-18T21:40:00.000Z"` — usa **T** como separador
- `updated_at` (devuelto por Supabase): `"2026-02-18 21:48:29.561682+00"` — usa **espacio** como separador

En comparación lexicográfica, el espacio (`0x20`) tiene valor ASCII **menor** que `T` (`0x54`). Esto significa que `"2026-02-18 21:48:29..."` siempre es **menor** que `"2026-02-18T..."` aunque sea una hora posterior. El guard **siempre falla**, el banner **nunca se cierra**.

### Causa 2 (SECUNDARIA): El `analysis_status` en DB ya dice `complete`

La DB muestra que el último análisis terminó correctamente en `21:48:29`. El registro YA TIENE `status: complete`. Cuando el usuario hace click y el poll empieza, la primera lectura encuentra `status: complete` — pero como el guard de timestamp falla (por el problema de formato), lo ignora. Cuando el nuevo análisis termina y escribe `complete` de nuevo, el problema se repite.

### Causa 3: El botón está `disabled` durante el análisis (`analyzing = true`) pero el `autoTriggered` no es suficiente

El mount effect puede ver `status: pending` en DB (si un análisis anterior falló a mitad), activar `isLaunchingRef = true`, e impedir que el click manual funcione. Esto es secundario pero explicaría un escenario adicional.

---

## La Solución Real — Simple y Definitiva

### Fix 1: Normalizar ambos timestamps a Date antes de comparar

En lugar de comparar strings, convertir ambos a objetos `Date` para una comparación numérica correcta:

```typescript
// ANTES (roto):
if (status === 'complete' && updatedAt > startedAt) { ... }

// DESPUÉS (correcto):
const updatedMs = new Date(updatedAt).getTime();
const startedMs = new Date(startedAt).getTime();
if (status === 'complete' && updatedMs > startedMs) { ... }
```

`new Date("2026-02-18 21:48:29.561682+00")` y `new Date("2026-02-18T21:40:00.000Z")` se parsean correctamente a timestamps numéricos, y la comparación numérica funciona sin importar el formato del string.

### Fix 2: Guardar startedAt como timestamp numérico (ms) en sessionStorage

Para evitar cualquier ambigüedad futura:

```typescript
// Guardar: número de milisegundos
sessionStorage.setItem(`analysis_started_${clientId}`, Date.now().toString());

// Leer y comparar:
const startedMs = parseInt(sessionStorage.getItem(`analysis_started_${clientId}`) || '0');
const updatedMs = new Date(updatedAt).getTime();
if (status === 'complete' && updatedMs > startedMs) { ... }
```

### Fix 3: El mount effect no debe activar `isLaunchingRef` si ya hay `complete` en DB

Si al montar el componente el status es `complete`, no hacer nada (es el estado normal post-análisis). Solo activar el "resume" si el status es `pending`.

---

## Archivos a Modificar

### Solo UN archivo: `src/components/client-portal/BrandAssetUploader.tsx`

**Cambios específicos (líneas exactas):**

**1. `startStatusPolling` (líneas 185-211):** Cambiar la comparación de strings a comparación de `Date` objects:

```typescript
function startStatusPolling() {
  if (statusPollingRef.current) { clearInterval(statusPollingRef.current); }
  console.log('[StatusPoll] Starting status polling every 4s');
  statusPollingRef.current = setInterval(async () => {
    const { data } = await supabase
      .from('brand_research')
      .select('research_data, updated_at')
      .eq('client_id', clientId)
      .eq('research_type', 'analysis_status')
      .maybeSingle();

    if (!data) return;
    const status = (data.research_data as any)?.status;
    const updatedMs = new Date(data.updated_at || 0).getTime();
    const startedMs = parseInt(sessionStorage.getItem(`analysis_started_${clientId}`) || '0');
    console.log('[StatusPoll] status:', status, '| updatedMs:', updatedMs, '| startedMs:', startedMs, '| diff:', updatedMs - startedMs);

    if (status === 'complete' && updatedMs > startedMs) {
      console.log('[StatusPoll] ✅ complete detected — closing banner');
      finishAnalysis(true);
    } else if (status === 'error' && updatedMs > startedMs) {
      console.log('[StatusPoll] ❌ error detected — closing banner');
      finishAnalysis(false);
    }
  }, 4000);
}
```

**2. `subscribeToStatus` (líneas 213-250):** Mismo fix en el handler de Realtime:

```typescript
const updatedMs = new Date(row.updated_at || 0).getTime();
const startedMs = parseInt(sessionStorage.getItem(`analysis_started_${clientId}`) || '0');

if (status === 'complete' && updatedMs > startedMs) { ... }
```

**3. `launchAnalysis` (líneas 295-296):** Guardar como número en lugar de ISO string:

```typescript
// ANTES:
const startedAt = new Date().toISOString();
sessionStorage.setItem(`analysis_started_${clientId}`, startedAt);

// DESPUÉS:
const startedMs = Date.now();
sessionStorage.setItem(`analysis_started_${clientId}`, startedMs.toString());
```

**4. Mount effect (líneas 264-265):** Mismo cambio para el "resume" desde mount:

```typescript
// ANTES:
sessionStorage.setItem(`analysis_started_${clientId}`, new Date(Date.now() - 3600000).toISOString());

// DESPUÉS:
sessionStorage.setItem(`analysis_started_${clientId}`, (Date.now() - 3600000).toString());
```

---

## Por Qué Esto Funciona

La comparación `new Date("2026-02-18 21:48:29.561682+00").getTime()` devuelve `1771451309561` (ms desde epoch). La comparación `new Date("2026-02-18T21:40:00.000Z").getTime()` devuelve `1771450800000`. La resta es positiva (~509000 ms = ~8.5 min después), la comparación `updatedMs > startedMs` es `true`. El banner se cierra.

Este es el mismo fix que ha fallado antes, pero por primera vez con evidencia concreta de por qué fallaba: el **formato del string** difería entre JS y Postgres.

---

## Verificación que Necesitas Hacer

Después del fix, al hacer click en el botón, deberías ver en la consola (F12):

```
[Button] Clicked — analyzing: false websiteUrl: https://...
[launchAnalysis] STARTING — url: https://... | startedMs: 1771452000000
[launchAnalysis] DB status set to pending ✓
[StatusPoll] Starting status polling every 4s
[StatusPoll] status: pending | updatedMs: 1771452001234 | startedMs: 1771452000000 | diff: 1234
... (2 minutos después) ...
[StatusPoll] status: complete | updatedMs: 1771452120000 | startedMs: 1771452000000 | diff: 120000
[StatusPoll] ✅ complete detected — closing banner
```

Si `diff` es positivo y el status es `complete`, el banner se cierra. Fin.

---

## Resumen

| Componente | Estado Anterior | Estado Nuevo |
|---|---|---|
| Comparación de timestamps | String lexicográfico (roto por formato Postgres vs ISO) | Numérico via `Date.getTime()` |
| sessionStorage | ISO string `"2026-02-18T..."` | Número ms `"1771452000000"` |
| Edge function | Sin cambios — ya funciona | Sin cambios |
| Realtime | Sin cambios — mantiene como bonus | Sin cambios |
| Mount effect resume | Sin cambios — lógica correcta | Solo cambio de formato timestamp |
