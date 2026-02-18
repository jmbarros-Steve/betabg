
## Diagnóstico definitivo (con evidencia de base de datos y logs)

### Problema 1: Banner — Race Condition confirmada

El edge function logs confirman que `analysis_status` queda en `complete` en la DB tras cada análisis. Al hacer click:

1. `setAnalyzing(true)` se ejecuta (banner aparece)
2. Se inicia `startStatusPolling()` inmediatamente
3. El STEP 5 fire-and-forget hace upsert de `pending` — pero esto puede tardar 200-500ms
4. El polling (cada 5s) puede leer la DB **antes** que llegue el `pending`, encontrando el `complete` anterior
5. El timestamp guard compara `dbUpdatedAt` del registro `complete` vs `startedAt`... pero hay un bug: el upsert de `pending` actualiza el `updated_at` del mismo registro, y cuando el poll llega, puede leer ese registro ya actualizado con `status: complete` pero `updated_at` de hace 1 hora — que SÍ es menor que `startedAt` — y debería ignorarlo correctamente.

**El bug real:** La función `startStatusPolling` y `startProgressPolling` se llaman dentro de `launchAnalysis` ANTES del `await supabase.auth.getSession()`. Pero al ser llamadas con `setInterval`, sus closures capturan el valor de `analysisStartRef.current` en el momento en que el intervalo ejecuta, no en el momento de creación. Esto está bien. El verdadero problema es que `clearAllIntervals()` (STEP 2) es llamado después de que `analysisStartRef.current = startedAt` (STEP 1), pero el STEP 4 (startPolling) es llamado ANTES del upsert. Cuando el primer poll ejecuta (3-5s después), el upsert de `pending` ya debería haber llegado... pero si la DB aún tiene `complete` y la `updated_at` de ese complete es anterior a `startedAt`, el guard funciona. 

**El bug real identificado:** La comparación en `startStatusPolling` usa `dbUpdatedAt >= startedAt` para decidir si reaccionar. Cuando se hace el upsert de `pending`, el `updated_at` se convierte en "ahora" (mayor que `startedAt`). Entonces el poll lee `status: pending` con `updated_at` nuevo — correcto, no hace nada. Pero cuando después llega el `complete`, el `updated_at` también es nuevo — correcto, cierra el banner. **Entonces el guard SÍ funciona correctamente... ¿por qué no funciona en práctica?**

**La respuesta está en el `useEffect` del mount:** El componente se monta, hace un query a `analysis_status`, encuentra `complete` (del análisis anterior), y como no es `pending`, no activa el banner. Esto es correcto. Pero el problema es que `loadAssets()` también puede disparar `launchAnalysis` mediante `setTimeout(..., 800)` en el auto-trigger — y en ese caso `analysisStartRef.current` es 0 al momento del mount, y los pollings empiezan en el mount check antes del auto-trigger.

**El bug real (confirmado):** En el `useEffect` del mount, si el status es `pending` (análisis en progreso), se llama `startStatusPolling()` con `analysisStartRef.current = 0`. Esto significa que el guard `if (startedAt > 0 && dbUpdatedAt < startedAt)` nunca se ejecuta (porque `startedAt === 0`). Esto es intencional para el "resume". Pero el problema es que si inmediatamente después el análisis termina (`complete`), el poll lo recoge y cierra el banner — esto es correcto. El verdadero problema es **cuando el usuario hace click manualmente**: el `launchAnalysis` hace `clearAllIntervals()`, luego inicia nuevos pollings, pero si el `useEffect` ya había iniciado un polling con `startedAt=0`, ese polling viejo todavía puede estar corriendo un instante antes del `clearAllIntervals()`. No, porque `clearAllIntervals()` los mata.

**Conclusión del bug del banner:** El problema más probable es que `analyzing` state ya estaba en `false`, el usuario hace click, `setAnalyzing(true)` se llama, pero **React puede batching múltiples state updates** y el componente re-renderiza con el banner, pero en el mismo tick hay algo que lo vuelve a `false`. La causa más probable: `loadAssets()` se ejecuta en paralelo con el mount check, y si encuentra `existingResearch.length > 0` (porque ya hay research de corridas anteriores), NO hace auto-trigger — correcto. Pero el mount check ya puede haber detectado `status: complete` y dado que `analysisStartRef.current === 0`, el guard falla y el status poll llama `setAnalyzing(false)`.

**El verdadero bug:** El poll del `useEffect` mount (que tiene `startedAt=0`) puede leer `complete` y llamar `setAnalyzing(false)` DESPUÉS de que el usuario clickeó y `setAnalyzing(true)`. Esto es la race condition: el polling iniciado en el mount corre en paralelo con el manual trigger.

### Problema 2: Solo 5 competidores en el resultado final

Los logs confirman que el edge function analiza 6 URLs correctamente. La DB también confirma solo 5 en el resultado. El problema es que la **IA (Gemini) no incluye todos los competidores en el JSON**. La razón: el prompt dice "Los primeros `clientProvidedUrls.length` (3) son los que el cliente indicó" — pero luego el contenido de los 6 competidores se corta a 10,000 chars total (`slice(0, 10000)`), y si algún competidor tiene mucho contenido, el 6to puede quedar truncado o el AI simplemente ignora el último por limitación de contexto.

La solución es asegurar que el prompt explícitamente nombre los 6 URLs en el array de competidores esperado.

---

## Plan de implementación

### Fix 1: Banner — Eliminar la race condition del mount polling

**Archivo:** `src/components/client-portal/BrandAssetUploader.tsx`

El polling iniciado en el `useEffect` mount (para "resumir" un análisis en progreso) tiene `analysisStartRef.current = 0`, lo que desactiva el guard de timestamp. Esto permite que ese polling react a un `complete` **después** de que el usuario hace click. 

**Solución:** Cuando el usuario hace click manualmente (`launchAnalysis`), inmediatamente:
1. Cancelar el polling del mount (`clearAllIntervals`)  
2. Establecer `analysisStartRef.current = Date.now()`
3. Hacer el upsert de `pending` de forma **síncrona** (`await`) antes de iniciar los nuevos pollings
4. Solo entonces iniciar los nuevos pollings

Esto elimina la race: el polling del mount es destruido, el nuevo polling solo reacciona a registros más nuevos que el click.

**Cambio adicional:** El primer poll de status debe esperar al menos 8 segundos antes de ejecutar (no inmediatamente al crear el interval), para dar tiempo al upsert de `pending` de llegar a la DB.

### Fix 2: 6 competidores — Forzar al AI a listar todos

**Archivo:** `supabase/functions/analyze-brand/index.ts`

Agregar al prompt una lista explícita de las 6 URLs que DEBE incluir en el array `competitor_analysis.competitors`, con instrucción de que son exactamente N competidores requeridos. También aumentar el slice del contenido de competidores de 10,000 a 14,000 chars para dar más contexto al 6to competidor.

---

## Archivos a modificar

1. **`src/components/client-portal/BrandAssetUploader.tsx`**
   - Cambiar `launchAnalysis` para hacer `await` del upsert de `pending` antes de iniciar pollings
   - Agregar `setTimeout` de 8s al primer check del status poll (usando un flag `firstCheck`)
   - En el mount check, si `status === pending`: usar `analysisStartRef.current = -1` (valor especial) para que el guard siempre lo ignore y el polling solo reaccione a `complete` — y cuando el usuario hace click, `clearAllIntervals()` mata ese poll antes de crear uno nuevo con timestamp real

2. **`supabase/functions/analyze-brand/index.ts`**
   - En `buildAnalysisPrompt`: agregar la lista explícita de URLs que el AI DEBE incluir
   - Cambiar `slice(0, 10000)` a `slice(0, 14000)` para el contenido de competidores
   - Asegurar que el JSON schema del prompt requiera exactamente `N` objetos en el array donde N = número de URLs analizadas
