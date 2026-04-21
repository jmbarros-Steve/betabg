# Isidora W6 — Journal de Aprendizaje (Code Reviewer)

## Sesión 22/04/2026 — Auditoría exhaustiva PMAX + 4 rondas review sobre Andrés W3

### Contexto
Cierre del módulo PMAX con marathon de features + bugfixes. JM pidió auditoría completa
para detectar fallas latentes antes de declarar PMAX cerrado. 4 rondas de review.

### Ronda 1 — Settings Dialog v2 + Steve AI scorecard (APROBADO CON FOLLOW-UPS)
Revisión inicial del handleGetSettings split + handleSuggestAssetContent + Scorecard UI.
Fallas críticas:
1. **Negative locations se borraban** — `handleUpdateCriteria` fetchaba TODAS las LOCATION
   (incluso negative=true) y las comparaba contra `desiredIds` solo-positivos → exclusiones
   geográficas se perdían silenciosamente. Fix: `AND campaign_criterion.negative = FALSE`.
2. **TARGET_CPA / TARGET_ROAS aceptaban 0** — si el user cambiaba a TARGET_CPA sin valor,
   backend seteaba targetCpaMicros: "0" → Google rechazaba. Fix: guard `> 0` required en
   ambos (frontend validation + backend 400).
3. **Dedup IDs** — sugerí `Array.from(new Set(ids))` en update_criteria.

### Ronda 2 — Steve genera imágenes (APROBADO)
Verificaciones: urlToBase64 contract OK, CORS OK, tamaño base64 dentro de 5MB Google limit,
double-click safety OK.

### Ronda 3 — Auditoría exhaustiva PMAX (VEREDICTO "NO CERRAR" hasta fix de 3)
Auditoría en background cubriendo backend + frontend + shared lib + generate-image. Output:

**6 fallas críticas (3 bloqueantes):**
1. Edit text asset — silent duplicate sin rollback (add+remove sequential, si remove falla
   queda duplicado). Fix: migrar a 1 mutate atómico con create+link+remove.
2. `addAssetGroupId` stale en Dialog reabierto (bug race condition).
3. Audience demographics AGE_RANGE_UNDETERMINED-only → dimension vacía que Google rechaza.
4. Cross-request collision en `Date.now() % 1_000_000` (100% colisión en mismo ms).
5. Cross-tenant leak en LGF (Supabase query falla silenciosa → IDs sin validar pasan al mutate).
6. UUID validation débil en 3 paths (client_id interpolado sin UUID_RX check).

**10 fallas menores:** fetchAssetGroups sin lock, addAssetLoading dialog escape, status PAUSED
sin traducir, handleRemoveAsset con toggleGroup (flash UI), isPmax mid-wizard state leak,
PENDING_TTL match frágil, remove_asset regex, search_themes split por coma, acquisition warning
sin link, DB check race.

**3 patrones recurrentes:** silent `console.warn` en catches críticos (sin surface al user),
optimistic updates sin reconciliation, estado residual en Dialogs reabiertos.

**5 recomendaciones hardening:** atomicidad edit asset, idempotency key, rate limit awareness,
E2E testing PMAX, warnings surface uniforme.

### Ronda 4 — Review final post-fixes (APROBADO PARA DEPLOY)
Andrés aplicó las 6 críticas + 10 menores + 3 hardening pragmáticos + feature wizard
variaciones logo. Verifiqué:
- `googleAdsMutate` default partial_failure=false → replace_asset atómico real (todo o nada).
- Age dimension solo pushea si ageSegments.length > 0 (AGE_RANGE_UNDETERMINED-only arrojaría
  error 400 claro al user).
- LGF fail-safe: flag `validated=false` default, solo true si res.ok. 4 paths dropean.
- 4 Dialogs resetean state al cerrar (add, steve, editAsset, audience).
- Sufijo random: `(Date.now() % 1_000) * 1000 + random(1000)` → 0.1% colisión.
- UUID_RX en handleGetBudgetRecommendation, handleGetRecommendations, handleSuggestAssetContent
  con `safeClientId` (trimmed) en todos los fetches.
- formatPrompts en wizard con logo + landscape_logo. Botones step 4 llaman generateAiImage
  para los 5 formats.

### Ronda 5 — Review 13 items cleanup (APROBADO + 2 observaciones backlog)
Verificaciones finales del bloque de cleanup:
1. Idempotency dedup con limpieza correcta en finally + TTL 60s safety net. hashBody djb2-ish
   32-bit con ventana de colisión en ms — aceptable, post-deploy migrar a SHA1 si aparece
   dedup fantasma.
2. Warnings surface end-to-end verificado (backend → api.ts → toast.warning).
3. Rate limit retorno compatible con ApiResponse del frontend.
4. refreshGroupDetail: si falla, no deja state stale en loading=true. Observación: no hay
   feedback visual persistente si fetch falla (UX minor backlog).
5. 12 tests vitest passing para parseRetryAfterSeconds / formatRetryAfter / hashBody.
6. call_to_action field type-safe al limpiar al cambiar channel_type.

### Patrón adoptado: validación empírica rigurosa + fallback conservador
Consolidado del Ronda 3 audit: priorizar detectar **silent failures** (catch sin surface),
**race conditions** (state stale, double-click, optimistic divergente) y **cross-tenant leaks**
(validación de ownership debe FALLAR SAFE, no FAIL OPEN).

## Sesión 20/04/2026 PM — 5 cross-reviews a Andrés W3 (proto v23 PMAX E2E)

### Regla adoptada: validación empírica para cambios en APIs externas

**ANTES de aprobar cambios en campos required/optional de APIs externas** (Google Ads, Meta, Shopify, Klaviyo, etc.), exigir prueba empírica:

1. **Doc-link oficial** al proto/reference de la versión actual de la API
2. **curl/test** que demuestre el comportamiento si no hay doc clara
3. **Confiar en el error empírico sobre memory antiguo** — las APIs evolucionan entre versiones; memory del equipo puede estar desactualizado

### Caso que generó la regla

En mi primera review del fix Asset.name de Andrés, aprobé "remover campo name" afirmando que era opcional en v23. Mi razonamiento: otros asset types del mismo archivo (headlines, descriptions, CTA, youtube) no lo envían y funcionan OK. Generalicé sin verificar.

Google Ads v23 respondió: `Name is required for this asset type. (mutate_operations[34..36].asset_operation.create.name)` → regresión en producción.

### Señales de alerta en reviews futuras

- Cambio en `required`/`optional` de campos de API externa
- Argumento basado en "el memory dice que X"
- Argumento basado en "los otros ops no lo tienen, entonces este tampoco"
- Contradicción entre comportamiento actual y documentación reciente
- Fix que remueve campos en vez de ajustarlos

### Proceso correcto de review para fixes de API externa

1. **Leer código** + ubicación exacta del cambio
2. **Verificar docs oficiales** (WebFetch a docs.google-ads u otra fuente autoritativa para la versión API correcta)
3. **Si dudas, sugerir el fix más conservador** aunque sea feo (ej: name único con sufijo en vez de sin name)
4. **Cerrar review con doc-link** + conclusión empírica, no solo razonamiento general

## Patrones proto v23 AssetGroupListingGroupFilter (aprendidos en sesión 20/04 PM)

### Regla 1 — Formato compuesto en resource_name
`customers/{cid}/assetGroupListingGroupFilters/{asset_group_id}~{filter_id}`

Temp plano `-1` es rechazado con `'-1' part of the resource name is invalid`. Usar `{realAgId}~{tempFilterId}` — factory oficial `AssetGroupListingGroupFilterCreateOperationFactory(customerId, assetGroupResourceName, TEMPORARY_ID)` hace esto.

### Regla 2 — SUBDIVISION + everything-else child juntos
Un SUBDIVISION debe crearse con su catch-all UNIT_EXCLUDED (productItemId: {}) en el MISMO mutate call. v23 valida per-commit.

### Regla 3 — Temp IDs within-mutate funcionan
En formato compound (9999~-1), Google resuelve temp IDs si parent op va ANTES que child en la lista.

### Regla 4 — listing_source REQUIRED en cada nodo
v21+ hizo listing_source required en SUBDIVISION + UNIT_INCLUDED + UNIT_EXCLUDED. Error empírico: `The required field was not present (listing_source)`. Para PMAX Shopping: `listingSource: 'SHOPPING'` en todos los nodos.

## Patrones Asset.name en Google Ads (aprendidos)

- `Asset.name` es **REQUIRED** para imageAsset en v23 (no opcional como se asumió inicialmente en mi review #1)
- Debe ser único dentro del mutate batch → Google rechaza con "Duplicate assets across mutates cannot have different asset level fields" si 2+ assets tienen el mismo name
- Google dedupe por `data` internamente; el `name` no afecta ese dedup — es solo display
- Solución canónica: sufijo único por counter monotónico → `name: \`${img.name || 'Image'}-${Math.abs(assetTempId)}\``
- Otros asset types (headlines/descriptions/long_headlines/business_name/youtube/CTA) NO requieren name — Google lo autogenera

## Archivos críticos donde reviso (Andrés W3 Google Ads)

| Archivo | Scope |
|---------|-------|
| `cloud-run-api/src/routes/google/manage-google-campaign.ts` | Backend PMAX creation (2945+ lines) |
| `cloud-run-api/src/routes/google/manage-google-pmax.ts` | Single-asset add |
| `cloud-run-api/src/lib/google-ads-api.ts` | Shared lib integración v23 |
| `src/components/client-portal/google-ads/GoogleCampaignManager.tsx` | Frontend wizard |
| `cloud-run-api/src/routes/cron/sync-all-metrics.ts` | Pipeline métricas Google |

## Checklist de review para Andrés W3 (post-sesión 20/04 PM)

- [ ] ¿El fix está basado en error empírico de la API, no en razonamiento general?
- [ ] ¿Verificó contra docs oficiales v23 o proto del recurso?
- [ ] ¿Consistente con otros fixes recientes del mismo archivo?
- [ ] ¿Hay tests E2E que cubran el path arreglado?
- [ ] Si cambia campos required/optional: ¿link a doc o curl empírico?
- [ ] ¿Los comentarios en el código reflejan la realidad actual (no un v20 obsoleto)?

## Sesión 20/04/2026 PM-2 — 7 reviews UX más (total 12+ del día)

### Patterns UX que catché hoy (NUEVOS)

1. **Fragment key en React .map con sub-rows condicionales:**
   `<>...<tr/><tr/></>` sin key causa warning + bug real: cuando filter/sort reordena campaigns, sub-rows expandidas "saltan" entre filas. React no puede trackear el Fragment. Fix: `<Fragment key={id}>` con import explícito.

2. **Server-side filter preferir sobre client-side:**
   Si el backend soporta filter (ej: `campaign_id` en GAQL), usarlo. Filter client-side infla payload y parsing. Verificar siempre antes de aprobar.

3. **Pluralización español incorrecta por replace_all naive:**
   Error común: `replace_all 'asset group' → 'grupo de recursos'` produce "grupo de recursoss" para el plural. El núcleo es "grupo" (no "recursos"), pluraliza a "grupos de recursos". Fix: `{n} grupo{n !== 1 ? 's' : ''} de recursos`.

4. **Imports huérfanos tras refactor:**
   Cuando se extrae un componente, los imports que SOLO usaba ese componente (ej: `useRef`, `Sparkles`, `SteveRecommendation`) quedan sin usar. Con `noUnusedLocals` strict en tsconfig, falla build. Check grep post-refactor.

5. **i18n case-sensitivity en replace_all:**
   `replace_all 'asset group' → 'grupo de recursos'` es case-sensitive y NO toca 'Asset group' (con A mayúscula). Revisar toasts y labels capitalizados manualmente.

6. **Botón con promesa que el dialog no puede cumplir:**
   En scorecard, el botón "+ Agregar" abría dialog que solo soporta 4 text fields. Para IMAGE/LOGO/VIDEO/CTA no puede resolver. Fix: disable el botón para tipos no soportados + texto alternativo ("desde Google Ads") con tooltip.

7. **Double-click safety (actionLoading):**
   En handlers de pause/delete, si no hay `actionLoading` state + `disabled`, doble click dispara 2 requests. Inconsistencia entre componentes del mismo feature (CampaignManager lo tiene, PmaxManager no).

8. **Optimistic state con TTL:**
   Pending groups con TTL de 2 min — si expira sin match, debe avisar al user (`toast.warning`) en vez de desaparecer silenciosamente (o el user crearía duplicado).

### Stats del día

- Reviews totales: 12+
- Rechazos correctivos: 4 (ratio 33%)
- Cada rechazo pilló issue real antes de prod
- Mi único fallo fue review #1 (aprobé Asset.name remove sin verificar docs) → regresión en prod
- A partir de review #2 adopté validación empírica rigurosa (doc-link o curl)

### Señales de alerta en reviews futuras (consolidado)

- Cambio en required/optional de campos de API externa → **exigir doc-link**
- Fix basado en "el memory dice X" → verificar si sigue vigente
- Fix que **remueve campos** → 80% veces es regresión (el campo SÍ era required)
- React Fragment `<>` dentro de `.map` → siempre Fragment con key
- String `replace_all` sobre texto con plurales → verificar pluralización manualmente
- Componente extraído → buscar imports huérfanos en origen
- Acciones destructivas (delete/remove) → verificar que el pattern sea correcto para ESE tipo de recurso (no asumir uniformidad API)

### Patrones proto v23 consolidados

**AssetGroupListingGroupFilter:**
- Resource name compuesto `{realAgId}~{filterId}` (temp plano rechazado)
- SUBDIVISION + everything-else child juntos (per-commit validation)
- Temp IDs within-mutate OK con compound form + orden parent-before-child
- `listing_source` required en cada nodo (v21+, no solo root como v20)

**Asset.name:**
- REQUIRED para imageAsset (no opcional)
- Debe ser único dentro del batch → sufijo con counter monotónico
- Google dedupe por `data` internamente, name es solo display

**Soft-delete INCONSISTENTE por tipo:**
- **Campaign:** `operation.remove` directo (NO update — rechaza status=REMOVED)
- **AssetGroup:** update con status=REMOVED (REPORTADO FALLANDO 20/04 PM-2 — verificar si necesita operation.remove igual que Campaign)
- **Ad Group:** (por verificar)
- Regla: verificar empíricamente por tipo de recurso, no asumir uniformidad
