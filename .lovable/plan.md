
## Diagnóstico definitivo — Lo que encontré en el código real

### El problema del banner (causa raíz confirmada)

Tras leer el código línea por línea y cruzar con la DB, el flujo actual tiene un defecto estructural grave:

**Doble llamada a `launchAnalysis` sin protección de mutex:**

1. El `useEffect` del mount llama `loadAssets()` (sin await)
2. `loadAssets()` verifica si hay investigaciones previas
3. Si `existingResearch.length === 0`, ejecuta `setTimeout(() => launchAnalysis(...), 800)`
4. El usuario también hace click manualmente → segunda llamada a `launchAnalysis`
5. La segunda llamada hace `clearAllIntervals()` + `setAnalyzing(true)`, PERO luego `loadAssets` ya terminó su verificación y la primera llamada (del timeout) también ejecuta `launchAnalysis`
6. La primera llamada (del timeout) hace `clearAllIntervals()` → mata los pollings de la segunda llamada → el banner queda huérfano sin polling que lo cierre

**Adicionalmente:** El guard `startedAt > 0 && dbUpdatedAt < startedAt` compara timestamps en milisegundos (JS) vs microsegundos (Postgres). Si `dbUpdatedAt` del registro `pending` recién escrito es ligeramente anterior al `startedAt` local (por diferencia de reloj entre cliente y servidor), el guard ignora el `complete` legítimo y el banner **nunca se cierra**.

**El problema de los 6 competidores:** La DB confirma que el análisis devuelve `complete`. El edge function ya tiene la lógica correcta. El problema es que el AI (Gemini 2.5 Flash) con `max_tokens: 12000` puede truncar el JSON antes de llegar al 6to competidor porque el prompt completo con 14,000 chars de contenido de competidores es muy grande. La solución es cambiar a `gemini-2.5-pro` con `max_tokens: 16000` para garantizar el JSON completo.

---

## El nuevo plan — Enfoque radicalmente diferente

### Fix 1: Reemplazar polling por Supabase Realtime

En lugar de `setInterval` con race conditions y guards de timestamp frágiles, usar **Supabase Realtime** (postgres_changes) para escuchar cambios en `brand_research`. Esto es:
- Instantáneo (sin latencia de polling)
- Sin race conditions (el evento llega exactamente cuando la DB cambia)
- Sin necesidad de guards de timestamp

El componente suscribe a cambios en `brand_research` donde `client_id = clientId`. Cuando el edge function escribe `status: complete`, Realtime lo notifica al instante.

**Para el progreso:** Mantener el polling de progreso (3s) ya que es solo UI cosmética. El estado crítico (pending/complete/error) pasa por Realtime.

### Fix 2: Mutex para evitar doble `launchAnalysis`

Agregar un `isLaunchingRef` para garantizar que solo una instancia de `launchAnalysis` corra a la vez. Si ya se está ejecutando, ignorar el segundo llamado.

### Fix 3: Modelo AI más potente para garantizar JSON completo

Cambiar `google/gemini-2.5-flash` a `google/gemini-2.5-pro` con `max_tokens: 16000` en el edge function para asegurar que el JSON se completa con los 6 competidores.

---

## Archivos a modificar

### 1. `src/components/client-portal/BrandAssetUploader.tsx`

**Cambios:**
- Eliminar `statusIntervalRef` y `startStatusPolling()`
- Agregar suscripción Realtime a `brand_research` para escuchar cambios en `analysis_status`
- Agregar `isLaunchingRef` como mutex para evitar doble ejecución
- Mantener `progressIntervalRef` y `startProgressPolling()` para la barra de progreso visual
- En el mount: si `status === pending`, activar banner + suscripción Realtime (sin polling)
- En `launchAnalysis`: verificar mutex, luego activar banner, luego escribir `pending`, luego suscribir a Realtime

**Flujo nuevo:**
```
Click → isLaunchingRef=true → setAnalyzing(true) → escribir pending (await) → 
suscribir Realtime → lanzar edge function (fire & forget)
Edge function escribe complete → Realtime notifica → setAnalyzing(false) → unsubscribe
```

### 2. `supabase/functions/analyze-brand/index.ts`

**Cambios:**
- Cambiar modelo de `google/gemini-2.5-flash` a `google/gemini-2.5-pro`
- Cambiar `max_tokens` de `12000` a `16000`
- Agregar en el prompt una sección FINAL explícita: "VERIFICACIÓN: Cuenta los competidores listados arriba. Tu array competitors[] DEBE tener exactamente N objetos. Si tienes menos, rellena con los datos disponibles."

---

## Ventajas del nuevo enfoque vs el anterior

| Problema anterior | Solución nueva |
|---|---|
| Race condition entre mount poll y manual trigger | Realtime no tiene race conditions — evento único por cambio DB |
| Guard de timestamp frágil (ms vs µs) | No se necesita guard — Realtime solo escucha cambios FUTUROS |
| Doble llamada a `launchAnalysis` | Mutex `isLaunchingRef` bloquea segunda ejecución |
| AI trunca JSON con Flash + 12k tokens | Gemini 2.5 Pro + 16k tokens garantiza JSON completo |
| Poll puede leer estado viejo de DB | Realtime solo recibe eventos DESPUÉS de suscribir |
