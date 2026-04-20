# Andrés W3 — Journal de Aprendizaje

## Sesión 09/04/2026 — Primera activación + Absorción conocimiento Leadsie

### Lo que aprendí de Felipe W2 sobre Leadsie/SUAT (3 sesiones: 06-08 abril)

**Contexto:** App Meta de Steve NO está verificada → OAuth bloqueado → solución BM Partner via Leadsie con SUAT (nunca expira).

**Flujo completo:**
```
Frontend MetaPartnerSetup.tsx → Leadsie con ?customUserId={client_id}
→ Merchant aprueba en Meta UI
→ Leadsie POST webhook con body.user = client_id
→ Upsert platform_connections (connection_type='leadsie', access_token_encrypted=NULL)
→ getTokenForConnection() detecta 'leadsie' → retorna META_SYSTEM_TOKEN (env var)
→ SUAT llama Graph API
```

**2 antipatrones CRÍTICOS:**
1. NUNCA chequear `access_token_encrypted` antes de `getTokenForConnection()` — rechaza SUAT
2. NUNCA llamar `/me/*` con SUAT — cross-contamination multi-merchant. Siempre GETs directos por ID persistido

**Lecciones aplicables a Google Ads:**
- `getTokenForConnection()` como ÚNICO punto de entrada para tokens (aplicar mismo patrón)
- Webhooks: NUNCA silent failures, siempre throw + try/catch → 500
- RLS canónico: `is_super_admin(auth.uid())`, nunca `role = 'admin'`
- No cambiar contratos hardcoded sin grep first
- gcloud deploy puede reportar false 'failed' — validar con `revisions list`

### Investigación: Leadsie para Google Ads — SÍ SE PUEDE

**Leadsie soporta Google Ads.** Confirmado en leadsie.com/integrations/google.

**Flujo propuesto Google Ads via Leadsie + MCC:**
```
1. Frontend GooglePartnerSetup.tsx → abre Leadsie con ?customUserId={client_id}
2. Merchant aprueba acceso Google Ads al MCC de Steve
3. Leadsie POST webhook → /api/webhooks/leadsie-google con body.user = client_id
4. Webhook persiste en platform_connections (platform='google', connection_type='leadsie')
5. getTokenForConnection() detecta platform='google' + type='leadsie'
   → retorna OAuth token del MCC (env var o refresh token del MCC)
6. API calls con developer token + MCC OAuth + customer_id del merchant
```

**Ventaja vs OAuth individual:**
- Un solo token (MCC) para todos los merchants (como SUAT de Meta)
- No hay tokens expirando por merchant
- Mismos antipatrones aplican: scoping por customer_id, nunca listar TODAS las cuentas

## Sesión 10/04/2026 — Tier 1 + Tier 2 + Fix Pipeline

### Tier 1: Campañas + Reglas Automáticas
- 6 archivos nuevos, 3 modificados, 2075 líneas
- Tablas: `google_automated_rules` + `google_rule_execution_log` (con RLS + indexes)
- `manage-google-campaign.ts`: pause/resume/update_budget/list_details
- `manage-google-rules.ts`: CRUD reglas
- `execute-google-rules.ts`: cron cada hora
- Frontend: `GoogleCampaignManager.tsx` + `GoogleAutomatedRules.tsx` (5 presets + historial)
- Commit: `12b642f0`

### Tier 2: 5 Features Search
- Keywords Manager, Search Terms + Negative Keywords, RSA Ads, Ad Extensions, Conversions
- 8 archivos nuevos, 2 modificados
- 5 rondas de QA

### Fix Pipeline
- `sync-campaign-metrics.ts`: arreglado para Google
- `check-google-ads-health.ts`: nuevo health check
- `currency.ts`: conversión a CLP
- MCC 403 fallback implementado

## Sesión 12/04/2026 — Tier 3: Shared Lib + PMAX + Steve AI

1. **Shared lib `google-ads-api.ts`** — ~465 líneas eliminando código duplicado
2. **`manage-google-campaign.ts`** — expandido a 13 actions
3. **`manage-google-pmax.ts`** — NUEVO, 6 actions para Performance Max
4. **Frontend expandido:** wizard campañas, settings, ad groups, PMAX manager, Steve AI recommendations
5. **Commit `5b3c60bb`**, deploy rev 00513-489
6. **12 archivos, +2979/-785 líneas**

### Lecciones API v23
- Google Ads API v23 requiere GAQL con `searchStream` (no `search`)
- `mutate` requiere `operations` con `create`/`update`/`remove`
- PMAX necesita TODOS los assets mínimos en un solo batch
- MCC puede dar 403 si Leadsie offboard rompió link → fallback obligatorio

## Sesión 13/04/2026 — Wizard PMAX 6 pasos + 10 fixes API v23

### Wizard PMAX expandido
- De 4 a 6 pasos: +imágenes (base64), +videos YouTube, +CTA, +display URL path
- Sub-componentes: `ImageUploadZone`, `YouTubeInput`, `fileToBase64`
- Arquitectura rediseñada: frontend convierte imágenes a base64, backend crea todo en un solo `mutate` batch

### 10 fixes API v23
1. `startDate` formato correcto
2. `deliveryMethod` deprecated → removido
3. Bidding strategy: `maximizeConversions` con campo correcto
4. `explicitlyShared` en budget
5. EU political ads compliance field
6. `brandGuidelines` campo nuevo
7. URL protocol validation (https://)
8. Asset batch: todos los assets mínimos en un mutate
9. Text truncation a límites Google Ads (30/90 chars)
10. Error details con field violations para debugging

### Cambios clave
- Timeout API: 15s → 60s
- Error messages ahora incluyen field violations
- 7 commits, 6 deploys Cloud Run
- `GoogleCampaignManager.tsx` +496 líneas

## Sesión 15/04/2026 — AI en cada paso del Wizard PMAX

- AI en Step 1: nombre de campaña sugerido
- AI en Step 2: targeting (locations + languages)
- AI en Step 4: generación imágenes con Gemini (3 formatos + generar todas)
- AI en Step 5: CTA + sitelinks automáticos
- Brief fetch: lee `raw_responses` + `google_ads_strategy` + `keywords` + `competitive_analysis`

### Lección estructura Brief
- `buyer_personas.persona_data.raw_responses` = array de 17 strings (Q0-Q16)
- `buyer_personas.persona_data.fase_negocio / presupuesto_ads` = metadata
- `brand_research` con `research_type=brand_strategy` solo tiene `{status, completed_at, sections_saved}` = METADATA, no contenido
- Contenido real está en: `google_ads_strategy` (ad_copies, extensions, bidding_strategy), `competitive_analysis`, `keywords`
- NUNCA buscar `brand_positioning/value_proposition/brand_voice` en `brand_research` — esos campos no existen

## Sesión 20/04/2026 — Wizard PMAX enterprise (marathon)

**Archivos modificados:** manage-google-campaign.ts, generate-image.ts, GoogleCampaignManager.tsx, SteveRecommendation.tsx.
**Commits:** 20+. **Deploys Cloud Run:** 12+. **Revision final:** steve-api-00558-px7.
**Cross-review:** Isidora W6 (5 rondas) + Javiera W12 (2 rondas).

### Features implementadas

#### 1. user_intent — prompt libre que alimenta todos los AI
- Frontend: textarea en Step 1 (maxLength=800)
- Backend `handleGetRecommendations`: lee `user_intent` y concatena al `extraContext` como "OBJETIVO DE LA CAMPAÑA (palabras del usuario)" → propaga a TODOS los prompts
- `handleGetBudgetRecommendation`: inyecta en unit_economics + fallback
- `generate-image.ts`: acepta `userIntent` y concatena al `promptBase`
- `SteveRecommendation`: prop `userIntent`, lo pasa en `data.user_intent`

#### 2. Merchant Center direct + categorías
- `handleListCatalogProducts`: GAQL `shopping_product` primary + Shopify fallback
- Fields correctos v17+: `product_type_level1/2/3`, `category_level1/2/3` (NO `_l1`)
- `merchantCenterId` required (regex `/^\d+$/`) para evitar cross-MC mix
- Cross-reference con `shopify_products` por `product_id`/`handle`/`sku` para enriquecer `image_url`
- UI panel Step 2: `<details>` colapsables por categoría con checkbox indeterminate

#### 3. Listing Group Filter tree (PMAX Shopping)
- Root SUBDIVISION + N UNIT_INCLUDED (caseValue.productItemId.value=sku) + catch-all UNIT_EXCLUDED
- `listingSource: 'SHOPPING'` solo en root (v23 rechaza en children)
- **CRÍTICO:** `AssetGroupListingGroupFilter` NO acepta temp resource names → **3 mutates separados:**
  1. Primary: core (campaign + assetGroup + assets + criteria + sitelinks)
  2. Middle: root LGF solo (sin resourceName, Google asigna → extraer real)
  3. Final: leaves + audience + signals referenciando real root + real asset_group

#### 4. Audience Signal AI + existentes
- `recommendation_type='audience_signals'` + whitelist enums (AGE/GENDER/PARENTAL/INCOME)
- Shape proto v23: `AgeSegment { minAge, maxAge }` ints (NO enum wrapper `{ type }`)
- `AGE_RANGE_65_UP` → solo `{ minAge: 65 }`; `UNDETERMINED` → `includeUndetermined: true` de la dimension
- Gender/parental/income: **strings enum directos**, no wrapped
- `AssetGroupSignal.audience = { audience: resource }` (AudienceInfo wrapped)
- **Google límite:** 1 audience signal por asset group (backend toma el primero)
- Nuevo action `list_audiences` (GAQL `audience` + `user_list`) + UI con checkboxes + badges

#### 5. Auto-fit de imágenes con sharp
- Nuevo dep `sharp` en cloud-run-api/package.json
- `generate-image.ts`: `normalizeToPmaxSpec(buf, formato)` — center-crop + resize al spec exacto después de Gemini
- `manage-google-campaign.ts`: `autoFitImageToSpec(base64, field_type)` — si imagen no cumple ratio, se adapta en memoria
- Specs: MARKETING_IMAGE 1200x628, SQUARE 1200x1200, PORTRAIT 960x1200, LOGO 1200x1200, LANDSCAPE_LOGO 1200x300
- Ya no rechaza por aspect ratio — corrige

#### 6. Customer Acquisition via CampaignLifecycleGoal
- `customerAcquisitionSetting` NO es field de Campaign — vive en `CampaignLifecycleGoal` (mutate aparte)
- Después del primary mutate, extraer `campaignResource`, POST a `customers/{cid}/campaignLifecycleGoals:mutate`
- Validación pre: GAQL check user_list CRM_BASED activo → si no, degradar a BID_ONLY + warning

#### 7. Security hardening
- UUID regex antes de interpolar `clientId` en PostgREST `eq.${}` (previene operator injection)
- SSRF helper `isPublicHost()`: bloquea RFC1918, loopback, 169.254.x metadata, .internal, .local
- `fetchRealSiteUrls`: SSRF-safe con re-check de `resp.url` post-redirect
- `selected_product_ids` cross-validated contra `shopify_products WHERE client_id=ctx.clientId`
- Dispatcher sobrescribe `client_id` del body con `ctx.clientId` en create_campaign, get_recommendations, get_budget_recommendation

#### 8. UI cleanup (Step 2 wizard)
- Dialog 600px → 1024px, `w-[95vw]`, overflow-x-hidden
- `prettyAudienceName()` regex limpia timestamps de `AssetGroupPersona_...` → `Asset Group #553510`
- Badges con iconos (Target, Users, Sparkles) en preview cards
- Warning Customer Match: card amber con AlertCircle
- Checkbox indeterminate para categorías con selección parcial
- Mensajes user-friendly para errores comunes (duplicate name, budget inválido)

### Lecciones proto v23 (cascada de fixes)
1. **AudienceAgeDimension.ageRanges:** `AgeSegment{minAge,maxAge}` ints (no enum wrapper `{ type }`)
2. **shopping_product fields:** `_level1..level5` (no `_l1`); `image_link` NO existe (removido)
3. **searchTheme.text shape** (no `searchThemeTargets`) — 1 AssetGroupSignal por tema
4. **AssetGroupSignal.audience:** `AudienceInfo{audience:resource}` wrapped
5. **CTA:** `callToActionAsset` enum (no `textAsset`)
6. **UNDETERMINED:** filter en gender/parental/income con `includeUndetermined: true` en dimension
7. **sitelink finalUrls:** en Asset padre (no en `sitelinkAsset`)
8. **AssetGroupListingGroupFilter + temp IDs (v23, 3 reglas):**
   - **Regla 1 (formato compuesto):** `resource_name` debe ser `customers/{cid}/assetGroupListingGroupFilters/{realAssetGroupId}~{filterId}`. Temp ID plano `-1` es rechazado con "'-1' part of the resource name is invalid". Usar `{realAgId}~{tempFilterId}` (factory oficial `AssetGroupListingGroupFilterCreateOperationFactory` hace esto). Por eso el asset group debe crearse ANTES (primary mutate), para tener su real ID disponible al construir los LGF resource names del secondary.
   - **Regla 2 (root + everything-else):** Un SUBDIVISION debe crearse JUNTO con su child "everything else" (catch-all `UNIT_EXCLUDED` con `productItemId: {}`) en el MISMO mutate call. v23 valida per-commit.
   - **Regla 3 (within-mutate resolution):** temp IDs en compound form (`9999~-1`) sí funcionan si el parent op va antes que el child op en la lista.
   - **Regla 4 (listing_source required per-node):** v21+ cambió `listing_source` de opcional/heredable a REQUIRED en cada nodo LGF (SUBDIVISION, UNIT_INCLUDED, UNIT_EXCLUDED). Si falta en un child, Google rechaza con "The required field was not present". Para PMAX Shopping usar `'SHOPPING'` en todos. El comentario viejo "listingSource va SOLO en root" era incorrecto (basado en v20).
   - Conclusión: mutate 2 = root + catch-all con compound temp. Mutate 3 = UNIT_INCLUDED leaves + signals usando real root resource. Todos con `listingSource: 'SHOPPING'`.
   - El memory anterior "NO acepta temp IDs" era incompleto: el temp plano no funciona, el compound con real AG sí. Corregido 20/04 PM-3 (`c5df2f42`) + PM-4 (`843f1f44`) + PM-5 (`a847e4ff`).
9. **Customer Acquisition:** `CampaignLifecycleGoal` mutate separado (no en Campaign.create)
10. **Audience signal:** Google limit 1 por asset group (backend toma el primero)

### Arquitectura clave: 2-batch mutate (que se volvió 3 con LGF)
- **Primary batch:** core (campaign + assetGroup + assets + criteria + sitelinks)
- **Secondary batch:** LGF root separado + leaves + signals
- Renumerado de temp IDs bajos (-1..-10) en secondary batch via regex
- CampaignLifecycleGoal es un tercer mutate aparte si aplica

### Red flags descubiertos
- `AssetGroupListingGroupFilter` NO acepta temp IDs — aprendizaje caro, obliga a 3 mutates
- `customerAcquisitionSetting` NO es field de Campaign — hay que buscar en CampaignLifecycleGoal
- `shopping_product.image_link` NO existe en v23 — cross-reference con shopify_products es obligatorio para enriquecer imágenes
- Google API limit 1 audience signal por asset group aunque la UI permita multi-select
