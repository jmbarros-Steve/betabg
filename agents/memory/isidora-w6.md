# Isidora W6 — Journal de Aprendizaje (Code Reviewer)

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
