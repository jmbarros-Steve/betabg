# Felipe W2 — Journal

## 2026-04-06: BM Partner Token Migration

### Decisiones
- **getTokenForConnection** es el patrón único para resolver tokens Meta en todo el backend
- Para bm_partner: retorna SUAT directo (env var META_SYSTEM_TOKEN)
- Para oauth/flbi: decrypt via RPC + refresh proactivo si expira en <7 días
- Tokens no-Meta (Klaviyo API keys, Google refresh tokens, Shopify) se quedan con decrypt inline — no aplica getTokenForConnection

### Descubrimientos
- `analytics/meta-adset-action.ts` es un archivo DUPLICADO de `meta/meta-adset-action.ts` — ambos existían y ambos necesitaban migración. No estaba en la lista original del plan.
- `check-meta-scopes.ts` ya tenía handling de bm_partner (retorna all scopes) pero el path OAuth aún usaba decrypt inline
- La carpeta `coverage/` (770k líneas de lcov) se estaba incluyendo en git — agregado a .gitignore

### Rutas migradas (24 total)
**Críticas (11):** sync-meta-metrics, manage-meta-campaign, fetch-meta-business-hierarchy, check-meta-scopes, fetch-meta-ad-accounts, meta-social-inbox, execute-meta-rules, publish-facebook, fetch-facebook-insights, publish-instagram, fetch-instagram-insights

**Secundarias (13):** manage-meta-audiences, manage-meta-pixel, manage-meta-rules, meta-catalogs, meta-targeting-search, detect-audience-overlap, meta-adset-action, sync-klaviyo-to-meta-audience, sync-campaign-metrics, fetch-campaign-adsets, sync-competitor-ads, analytics/meta-adset-action, check-meta-scopes (OAuth path)

---

## 2026-04-07: Pivot Admatic → Leadsie + Bug crítico SUAT en 8 archivos

### Decisión arquitectónica
- **Switch a Leadsie** (descartado Admatic). Razones:
  - Leadsie soporta `customUserId` URL param → reflejado en webhook como `body.user` → match directo sin email
  - Admatic requería email match (más fricción para JM)
  - Webhook payload Admatic venía con metadata Bubble.io innecesaria
  - Leadsie tiene mejor UX nativa Meta
- **3 connection types soportados ahora**: `oauth` (decrypt RPC), `bm_partner` (SUAT), `leadsie` (SUAT)
- Resolver: extender `if (connection_type === 'bm_partner')` → `if (connection_type === 'bm_partner' || 'leadsie')` (2 líneas, líneas 24 y 67)

### ⚠️ Bug crítico descubierto: 8 archivos rechazaban SUAT
**El antipatrón:**
```typescript
if (!conn?.access_token_encrypted) return error;  // ❌
```
**Por qué es crítico:** Las conexiones SUAT (bm_partner/leadsie) tienen `access_token_encrypted=NULL` porque el token vive en env var `META_SYSTEM_TOKEN`. Este check rechazaba SUAT antes de llegar al resolver.

**Cómo lo encontré:** JM preguntó "voy a poder publicar la foto en instagram?" → fui a verificar `publish-instagram.ts` → vi el check → `grep` reveló que estaba en 8 archivos.

**Sin este fix, la migración a Leadsie habría sido cosmética**: ninguna conexión SUAT podía publicar fotos, leer insights, usar bandeja, listar ad accounts, ni correr el cron de performance.

**Archivos arreglados:**
1. `instagram/publish-instagram.ts:39`
2. `instagram/fetch-instagram-insights.ts:41`
3. `facebook/publish-facebook.ts:46`
4. `facebook/fetch-facebook-insights.ts:42`
5. `meta/meta-social-inbox.ts:673`
6. `meta/fetch-meta-ad-accounts.ts:130`
7. `meta/fetch-meta-business-hierarchy.ts:328`
8. `cron/performance-tracker-meta.ts` ← **outlier**, único Meta cron usando `decryptPlatformToken` legacy. Conversión completa a `getTokenForConnection`.

### Patrón correcto (memorizar para siempre)
```typescript
// ✅ BIEN
const { data: conn } = await supabase
  .from('platform_connections')
  .select('id, access_token_encrypted, connection_type')  // include connection_type
  .eq('client_id', clientId)
  .eq('platform', 'meta')
  .maybeSingle();

if (!conn) return error;  // solo chequear que existe la conexión
const token = await getTokenForConnection(supabase, conn);
if (!token) return error;  // resolver maneja oauth/bm_partner/leadsie
```

### Migration history repair
Production tenía orfanas: `20260321`, `20260322`, `20260325`, `20260407210000`. Las locales existen pero CLI no las matcheaba por nombre+version.
Solución: `npx supabase migration repair --status reverted 20260321 20260322 --linked` + push idempotente. Como las migrations usan `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`, re-aplicarlas no rompe nada.

### Tabla + UI para huérfanas
- Tabla `orphan_meta_connections` aplicada en producción
- UI admin en `/admin/huerfanas-meta` (`AdminOrphanMetaConnections.tsx`, 480 líneas, patrón AdminWaitlist)
- Botón en AdminCerebro con icon `Link2Off`
- Asignación solo marca reviewed — NO crea conexión real (TODO futuro)

### Lecciones
1. **Defensive checks pueden esconder bugs**. El `if (!conn?.access_token_encrypted)` parecía safe pero rechazaba un caso válido (SUAT). Cuando uses un patrón nuevo (resolver), audita TODOS los call sites para ver si hay checks viejos que ya no aplican.
2. **Outliers son donde se esconden los bugs**. 7 archivos tenían un patrón consistente, 1 (`performance-tracker-meta.ts`) tenía un patrón legacy diferente. Ese fue el más peligroso porque parecía "ya migrado" pero usaba otra lib.
3. **`getTokenForConnection` es el ÚNICO punto de entrada** para tokens Meta. NUNCA llamar `decryptPlatformToken` directo para tokens Meta. NUNCA chequear `access_token_encrypted` antes del resolver.
4. **Migration repair es seguro si las migraciones son idempotentes**. Cuando la metadata remota está desincronizada con archivos locales, repair + idempotent push es el camino limpio.

### Estado actual
- Resolver listo (acepta 3 tipos)
- 8 archivos limpios
- Tabla huérfanas + UI admin funcionales
- **BLOQUEADO**: necesito que el socio de JM apruebe crear System User en BM para generar SUAT y setear `META_SYSTEM_TOKEN`. Hasta entonces, todo está en standby.
- En paralelo JM puede configurar Leadsie Connect Profile (#16, no bloqueado)

### Notion
TODO: crear sesión "Sesion 07/04 - Switch Leadsie + Bug Fix SUAT" en hub Felipe (`33a9af51b58d81dab4e5f3493b6d25d4`) cuando JM lo pida.

---

## 2026-04-08: Leadsie Hardening + SUAT Scoping Multi-Merchant

### Contexto
Post auto-review manual + cross-review con 4 agentes (Isidora W6, Javiera W12, Sebastián W5, Diego W8) detecté 9 bugs críticos en el prototipo Leadsie. **2 rondas de fixes**, deploy exitoso `steve-api-00426-869`, smoke test pasa.

### Bug más grave: SUAT Scoping Multi-Merchant (Fix #29)
**Antes:** `fetch-meta-business-hierarchy.ts` llamaba `/me/adaccounts` con el SUAT. El SUAT tiene acceso a TODAS las cuentas publicitarias de TODOS los merchants del BM de Steve. Un merchant abría el wizard y veía — y podía potencialmente operar — los ad accounts de otros merchants. **Cross-contamination completa.**

**Fix:** extender el SELECT de `platform_connections` para traer `account_id`, `page_id`, `ig_account_id`, `pixel_id` que el webhook Leadsie ya persistió específicamente para ese `client_id`. Luego hacer GETs directos `/act_{id}`, `/{page_id}`, `/{pixel_id}` con el SUAT — solo los assets de ese cliente. Zero cross-contamination.

```typescript
if (isSuat) {
  const scopedAccountId = connection.account_id;
  const scopedPageId = connection.page_id;
  // ... etc

  const [acc, page, pixel] = await Promise.all([
    scopedAccountId ? metaGet(`/act_${scopedAccountId}`, token, {...}) : null,
    scopedPageId ? metaGet(`/${scopedPageId}`, token, {...}) : null,
    scopedPixelId ? metaGet(`/${scopedPixelId}`, token, {...}) : null,
  ]);

  if (acc && acc.id) directAccounts = [acc as AdAccount];
  if (page && page.id) directPages = [page as PageInfo];
  if (pixel && pixel.id) directPixels = [pixel as PixelInfo];
}
```

### Otros 8 fixes
- **#22 RLS** `orphan_meta_connections`: `role='admin'` → `is_super_admin(auth.uid())` (patrón canónico waitlist_leads). JM no podía ver hu\u00e9rfanas antes.
- **#23 Silent failure** `storeOrphan`: tragaba error y devolvía 200 → Leadsie nunca reintentaba. Fix: throw + try/catch → 500.
- **#24 `isActive` permissive**: antes requería ad account. Ahora `account_id OR page_id OR ig_account_id` (merchants orgánicos son válidos).
- **#25 HMAC validation webhook**: `LEADSIE_WEBHOOK_SECRET` via header `X-Webhook-Secret` o `?secret=`. Dev mode si env no seteada.
- **#26 SUAT detection hierarchy**: skip `/me/businesses` si `connection_type IN ('bm_partner','leadsie')`.
- **#28 Revert `groupId='personal'`** (Isidora HIGH #1): en ronda 1 puse `'shared'` por claridad, rompió 3 lugares de `MetaConnectionWizard.tsx` que hardcodean el literal `'personal'`. Lección: **grep first before changing hardcoded contracts**.
- **#30 Poll `MetaPartnerSetup`** (Isidora MEDIUM #4): aceptar `page_id/ig_account_id` para consistencia con backend.
- **#31 Log estructurado** (Isidora MEDIUM #5): `console.error({err, body})` en catch `storeOrphan` para que Cloud Logging conserve payload aunque la tabla esté muerta.

### Cross-review findings
Todos APROBADO CON OBSERVACIONES:
- **Isidora W6** (backend+frontend+UX): 2 HIGH (arreglados ronda 2), 3 MEDIUM, 2 LOW
- **Javiera W12** (SQL+seguridad): 1 HIGH (migration no idempotente, deuda), 3 MEDIUM, 1 LOW
- **Sebastián W5** (infra): 1 HIGH (`LEADSIE_WEBHOOK_SECRET` no seteada)
- **Diego W8** (database): 3 HIGH (types.ts stale, cols fantasma `end_user_email`/`partner_id`, `raw_payload` sin retention), 2 MEDIUM, 2 LOW

### Deploy false alarm (gcloud CLI)
2 intentos de `gcloud run deploy` reportaron "Building Container failed, Deployment failed" pero `gcloud builds log` mostró `Successfully built` + `DONE`, y `gcloud run revisions list` mostró la nueva revision al 100% traffic. **Validar siempre con `revisions list` antes de reintentar.**

### Migration history repair
`supabase db push` falló con `Remote migration versions not found in local` — phantom versions `20260321`, `20260322`, `20260325`. Fix: `supabase migration repair --status reverted <version> --linked` por cada uno. Otro dev tiene una migración `20260408140300_steve_alerts_table.sql` con el MISMO antipattern `role='super_admin'` inexistente en enum — NO es mía pero va a fallar.

### Drift crítico prod↔repo
El código deployado `steve-api-00426-869` está en prod pero NO hay commit git. Los 4 archivos están modificados en disco. Push pendiente por permiso de JM. Al retomar mañana: `git status` primero.

### Lecciones aprendidas (nuevas)
1. **SUAT requiere scoping manual explícito**. `/me/*` endpoints con SUAT devuelven TODO el BM. Nunca usar sin WHERE. Patrón: persistir IDs en el webhook → GETs directos por ID en el handler.
2. **NUNCA cambiar contratos hardcoded sin grep first**. El `groupId='shared'` rompió 3 lugares del wizard. Grep del literal antes de cambiar strings de contrato.
3. **Silent failures son peores que throws en webhooks**. Webhooks idempotentes DEBEN propagar errores para que el upstream reintente. `try { await } catch {}` es anti-pattern en webhook handlers.
4. **RLS patterns canónicos** de este proyecto: siempre `is_super_admin(auth.uid())`, nunca `user_roles.role = 'admin'` (el enum `app_role` no tiene `super_admin`).
5. **gcloud run deploy puede reportar false 'failed'** — validar con `gcloud run revisions list` antes de reintentar. No redeploy a ciegas.

### Notion + Supabase sync
- Notion sesión: https://www.notion.so/33d9af51b58d816684f8f48d68823660
- Supabase `agent_sessions` Felipe W2 actualizado con memory_md completo, session_count=2

### Estado al cierre
- Código en prod (9 fixes vivos) pero drift git
- **Siguientes 3 acciones en orden**: #27 setear `LEADSIE_WEBHOOK_SECRET` → #16 JM configura Leadsie dashboard → #18 test E2E cliente real
- 8 items de deuda técnica documentados, no blockers

---

## 2026-04-15: Hallazgo CRITERIO — 83 reglas fantasma bloquean campañas Meta

### Contexto
JM intentó subir campaña Razas Pet desde el wizard. CRITERIO la rechazó con score 32% (86 reglas fallidas, 4 blockers).

### Hallazgo #1: Reglas no implementadas fallan por defecto
De 86 reglas fallidas, **83 dicen "Rule not yet implemented"**. Las reglas están definidas en `criterio_rules` (R-006 a R-111) pero la lógica de evaluación nunca se escribió. El evaluador marca fail por defecto → bloquea campañas válidas.

Solo 3 reglas evaluaron algo real:
- R-033: 0 intereses (targeting no pasado al evaluador)
- R-087: imagen 0x0 (imagen no pasada al evaluador)
- R-088: formato vacío (creative format no pasado)

### Hallazgo #2: Steve pelea consigo mismo
El copy rechazado fue generado por `generate-meta-copy`. La IA genera → CRITERIO rechaza → cliente bloqueado.

### Root cause: 3 problemas, 3 agentes
1. **Isidora W6**: reglas not-implemented deben retornar pass (no fail)
2. **Tomás W7**: generate-meta-copy no conoce reglas CRITERIO
3. **Felipe W2**: wizard no pasa data completa (imagen/targeting) al evaluador

### Impacto
NINGÚN cliente puede subir campañas Meta por Steve hasta que se arregle.

### Registros
- Supabase `tasks`: `c7cb5271-49fe-462e-b247-910c1d7b5896` (critica, producto)
- Notion sesión: https://www.notion.so/3439af51b58d819f88add4b8232ee050
- Supabase `agent_sessions` w2: session_count=5, actualizado

---

## 2026-04-15 (sesión 2): Webhook race condition + wizard overwrite + Razas Pet restore

### Bugs encontrados y corregidos

**Bug #32: Webhook race condition en leadsie-webhook.ts**
Leadsie manda múltiples webhooks `PARTIAL_SUCCESS` en ráfaga (<100ms). Cada uno tiene diferentes assets como `Connected`. El `upsert` con `onConflict: client_id,platform` reemplaza TODOS los campos — el último webhook gana y nulea campos set por webhooks anteriores.

**Fix:** Check-then-merge. Si la conexión existe, solo actualizar campos non-null del webhook actual; preservar valores previos para campos null.

**Bug #33: Wizard sobreescribe campos existentes en MetaConnectionWizard.tsx**
`handleConfirmConnect` escribía los 7 campos del portfolio. Si el hierarchy endpoint no descubrió page/ig (porque la conexión ya tenía page_id null por el bug #32), el wizard nulea esos valores.

**Fix:** Leer valores actuales de la conexión antes de hacer update. Solo sobreescribir si el portfolio trae valor non-null.

### Hallazgo arquitectónico: Leadsie IDs ≠ BM IDs

**Descubrimiento crítico:** Los IDs que Leadsie manda en `connectionAssets` son los IDs del **merchant** (su cuenta personal), NO necesariamente los IDs accesibles via el SUAT del BM de Steve. Ejemplo Razas Pet:
- Leadsie mandó page `100393186274585` → INACCESIBLE via SUAT
- BM de Steve tiene page `731826166673553` (Razas Pet Shop) → ACCESIBLE

**Implicación:** El webhook NO puede confiar ciegamente en los IDs de Leadsie para conexiones SUAT. Debería cross-reference con `/me/accounts` (pages accesibles al SUAT) para validar. TODO para futuro.

### Lecciones
1. **Race conditions en webhooks** son silenciosas — no hay error, simplemente data incorrecta. Siempre hacer merge, nunca overwrite ciego.
2. **PARTIAL_SUCCESS de Leadsie** es un estado real que produce múltiples webhooks. El código debe ser resiliente a ráfagas.
3. **Los IDs de Leadsie son del merchant, no del BM.** Para SUAT, los IDs útiles son los que `/me/accounts` y `/act_X/adspixels` devuelven. El webhook debería validar.
4. **Sin audit trail para webhooks exitosos** — solo guardamos raw_payload para orphans. Si el webhook matchea, perdemos el payload original. Debería guardarse siempre para debugging.


## Sesión 2026-04-22 — Wizard Meta v23.0 + Video universal + Veo 3.1 + Conexión Goodgres

**Contexto**: Sesión marathón del wizard de creación de anuncios Meta. Upgrade de Graph API v21→v23, agregué video universal (single/carousel/DCT), Veo 3.1 para generación de video con IA, y arreglé la conexión Leadsie del cliente nuevo Goodgres (Ignacia Maturana).

**Trabajo hecho**:
- **Graph API v21.0 → v23.0** en 25 archivos. `instagram_actor_id` → `instagram_user_id` (deprecated sep/2025). `standard_enhancements` deprecated en v22 → reemplazado por 4 switches granulares de Advantage+ Creative.
- **Pixel selector + evento conversión** (10 opciones, auto-fetch si solo hay 1)
- **Placements**: Advantage+ vs manual, con checkboxes por plataforma (FB/IG/AN/Messenger)
- **Saved Audiences listing** extendido en `manage-meta-audiences.handleList`
- **Page + Instagram selector** en step creative
- **UTM builder** con 5 macros oficiales + preview live de URL final
- **Advantage+ Creative**: 4 switches granulares
- **Nuevo tipo "Advantage+ Catálogo (DPA)"** (antes "Shopping", renombrado)
- **Reach estimate en vivo** con color coding (verde >100K, amarillo 10K-100K, rojo <10K)
- **Botón "🤖 Que Steve arme toda la campaña"** — Claude Sonnet llena todos los steps en 1 call
- **Endpoint `/api/steve-suggest-interests`** (Claude + Meta `/search?type=adinterest`)
- **ReviewStep** muestra todos los campos nuevos antes de publicar
- **Sprint Final Video Universal**:
  - Helper `uploadVideoFromUrl` con polling `?fields=status` hasta `ready` (4 min timeout)
  - Helper `looksLikeVideoUrl` por extensión
  - SINGLE: rama `video_data` vs `link_data` con thumbnail del primer slot image
  - CAROUSEL: `child_attachments` mixed image_hash + video_id (sin `picture` para videos — Meta auto-extrae)
  - DCT: `asset_feed_spec.videos[]` + `images[]` mezclados, `ad_formats: ['AUTOMATIC_FORMAT']`
- **Veo 3.1 Preview (Google Gemini)**:
  - Rewrite completo de `generate-video.ts` → Gemini API (mismo key de Imagen 4)
  - 8s 1080p con audio nativo, `VIDEO_USD_COST=3.20`, `VIDEO_CREDIT_COST=30`
  - Long-running operation + polling inline 4.5 min
  - `refundVideoCreditsOnce` helper idempotente con marker en `credit_transactions.accion`
  - Endpoint `GET /api/generate-video-status` para client polling post-timeout
  - Frontend: Tab "IA Video" en MEDIA_TABS, warning de costo, polling cada 20s × 3 min, aspect ratio dinámico 9:16/16:9 (Veo 3.1 no soporta 1:1)
- **Conexión Goodgres (Ignacia Maturana)**:
  - `LEADSIE_WEBHOOK_SECRET` estaba desincronizado entre Cloud Run (`7e9f9abb...`) y Admatic (`a695871a...`) — rompía TODOS los webhooks desde siempre
  - Fix: extraído secret real de logs → actualizado env var Cloud Run
  - Webhook procesó con `PARTIAL_SUCCESS` (Ignacia no autorizó ad account)
  - UPDATE manual `platform_connections.account_id='39053602'`
- **RLS fix bucket `client-assets`**: policy esperaba `auth.uid()` como primer folder. Wizard usaba `assets/{clientId}` → fail. Fix: `${user.id}/meta-uploads/`
- **Hotfixes UX**: botón "X" en slots ahora clear-in-place (no remove), preview avanzado muestra campos faltantes, previews por placement vía `/act/adimages` + `image_hash` (Supabase rate-limitaba 13 paralelos), input editable `ad_name`, "Claude está pensando" → "Steve", DCT `ad_formats: ['AUTOMATIC_FORMAT']` (antes SINGLE_IMAGE hacía que Meta Ads Manager lo mostrara como "Una sola imagen o video")

**Archivos tocados** (principales):
- `src/components/client-portal/meta-ads/CampaignCreateWizard.tsx` — wizard completo (141KB, leer antes)
- `src/components/client-portal/meta-ads/MetaCampaignManager.tsx` — pixel, placements, Advantage+ Creative
- `cloud-run-api/src/routes/meta/manage-meta-campaign.ts` — video universal single/carousel/DCT
- `cloud-run-api/src/routes/meta/manage-meta-audiences.ts` — handleList extendido
- `cloud-run-api/src/routes/meta/meta-targeting-search.ts` — `/search?type=adinterest`
- `cloud-run-api/src/routes/ai/generate-video.ts` — rewrite completo Veo 3.1
- `cloud-run-api/src/routes/ai/generate-video-status.ts` — nuevo endpoint polling
- `cloud-run-api/src/routes/ai/steve-suggest-interests.ts` — nuevo
- `cloud-run-api/src/routes/ai/steve-suggest-campaign.ts` — botón 🤖 armar campaña
- `cloud-run-api/src/routes/oauth/leadsie-webhook.ts` — revisado (secret sync)
- 25 archivos migrados Graph v21→v23

**Gotchas para sesiones futuras**:
1. **Graph API v22+**: `standard_enhancements` deprecated → usar 4 switches granulares de Advantage+ Creative.
2. **Veo 3.1 NO soporta aspect ratio 1:1** — solo 9:16 y 16:9. Forzar UI a elegir.
3. **Meta `/act/advideos` requiere polling `?fields=status`** hasta `status.video_status=ready`. Timeout razonable: 4 min.
4. **CAROUSEL con videos**: NO mandar `picture` en el child_attachment — Meta auto-extrae thumbnail.
5. **DCT con mix video+image**: `ad_formats` debe ser `['AUTOMATIC_FORMAT']`, NO `SINGLE_IMAGE`.
6. **Bucket `client-assets` RLS**: primer folder DEBE ser `auth.uid()`, no arbitrario.
7. **Previews por placement**: Supabase rate-limit si son 13 paralelos. Subir a `/act/adimages` primero y usar `image_hash`.
8. **Leadsie webhook**: validar shared secret con `crypto.timingSafeEqual`. Cuando cambia el secret en la plataforma, hay que sincronizar manualmente en Cloud Run env vars (pendiente: healthcheck automático).
9. **PARTIAL_SUCCESS de Leadsie**: puede producir múltiples webhooks. Código debe ser resiliente a ráfagas.
10. **SUAT en Goodgres**: nunca usar `/me/adaccounts` — usar `account_id` persistido en DB.
11. **`refundVideoCreditsOnce`**: el nombre `operationName` generado con `Date.now()` NO es idempotente en `launch-fail` y `no-op` paths. Task #31 tiene fix pendiente (unique constraint en `credit_transactions`).

**Decisiones de JM en este día**:
- Video cost pool compartido con imagen + warning educativo en UI (30 créditos = $3.20 USD = 15 imágenes)
- Client-side polling para Veo (no background worker) — más simple y suficiente
- Aspect ratio video: solo 9:16 y 16:9 (cliente entiende la limitación)
- IA en todos los steps del wizard con meta de ≤5 min total para campaña
- Botón "🤖 Que Steve arme toda la campaña" es feature estrella — invertir en mejorarlo
- Renombrar "Shopping" → "Advantage+ Catálogo (DPA)" para claridad del cliente
- UX: botón X en slots debe clear-in-place, no remove (preserva 3:2:2)

**Deploys**: 8+ deploys backend Cloud Run. Revision final: **steve-api-00615-f6t** (SUCCESS, 100% traffic). 10+ pushes frontend. Último commit: **37e82c50**. Bundle prod: `index-DyPz-KzT.js`.

---

## Sesión 2026-04-23 — DPA como 4º formato + Advantage+ preview individual + Publish drafts fix

**Cambios (Meta Ads):**
- **Grupo B — errores de acceso**: `meta-catalogs.ts` fallback a `/{bm_id}/owned_product_catalogs` + `client_product_catalogs` cuando no hay match en ad account (devuelve diagnostics + hint). `manage-meta-campaign.ts handleGeneratePreviews` ahora devuelve `success:false + error` cuando los 13 placements fallan (antes: grid vacío silencioso). Banner azul en frontend explica que "no tengo acceso" del iframe solo afecta preview, no publicación.
- **Grupo C — features**: Botón "3 variaciones desde esta" en creativos. Banner DPA con tokens `{{product.name}}`, `{{product.price}}`, `{{product.current_price}}`, `{{product.description}}`, `{{product.brand}}` click-to-copy.
- **DPA como 4º formato del Ad Set**: además de Flexible/Carrusel/Única. `budgetType=ADVANTAGE` fuerza `adSetFormat='catalog'`. Cuando `adSetFormat=catalog` → banner verde bloqueado + oculta 4 formatos + oculta selector foto/video + salta steps Funnel/Ángulo/Enfoque + oculta sección Creativos en step Anuncio.
- **Preview DPA con tokens resueltos**: fetch live de Shopify del primer producto, reemplaza tokens con datos reales. Fallback genérico si no hay productos sincronizados. (scope raíz del componente para compartir entre sub-steps).
- **Validación DPA**: NO exige imagen, SÍ exige `catalog_id` + `product_set`.
- **Advantage+ Creative — panel preview individual**: nuevo endpoint `POST /api/meta-preview-enhancements`. Por cada feature llama `/generatepreviews` con `creative_features_spec` override (solo esa feature `OPT_IN`). Retorna eligibility + iframe por feature. 12 features: image_touchups, image_brightness_and_contrast, image_uncrop, music_gen, product_extensions, site_extensions, text_optimizations, dynamic_media (standard) + image_expansion, image_generation_background, text_generation, enhance_cta (generative/IA).
- **UI AdvantagePreviewPanel**: expandible con baseline "original" + iframe por cada feature + toggles. Separados Standard vs Generative (badge IA amarillo). Features no elegibles grayed-out. Submit integration: `creative_features` override map pisa los 5 coarse toggles del `AdvantageCreativeToggles` al submit.
- **Publicar desde borradores (DraftsManager)**: antes mandaba payload mínimo (name+budget). Ahora rebuilds payload completo desde `brief_visual`: imágenes DCT, copy DCT, targeting, funnel, angle, page/IG/pixel, catalog, creative_features. Validación pre-submit con issues detallados.
- **Wizard handleSaveDraft**: persiste en `brief_visual` todos los campos necesarios para republicar (page_id, pixel_id, catalog_id, creative_features, etc).

**Archivos modificados:**
- `cloud-run-api/src/routes/meta/meta-catalogs.ts` (fallback BM owned/client catalogs)
- `cloud-run-api/src/routes/meta/manage-meta-campaign.ts` (handleGeneratePreviews error flag)
- `cloud-run-api/src/routes/meta/meta-preview-enhancements.ts` (NUEVO endpoint per-feature)
- `src/components/client-portal/meta-ads/CampaignCreateWizard.tsx` (DPA UI + TDZ fix + dpaSampleProduct scope raíz)
- `src/components/client-portal/meta-ads/AdvantagePreviewPanel.tsx` (NUEVO componente)
- `src/components/client-portal/meta-ads/DraftsManager.tsx` (payload rebuild completo)

**Decisiones clave:**
- **DPA ↔ Advantage ↔ catalog es sync forzado**: budgetType=ADVANTAGE sin producto seleccionado → fuerza catalog. Justificación: Advantage+ shopping campaign exige catálogo; inconsistencia antes causaba rechazo silencioso de Meta.
- **Preview per-feature**: único modo de testear eligibility real de Meta sin publicar. `/generatepreviews` con override es barato y devuelve iframe previsualizable por feature.
- **Validación DPA sin imagen**: catalog + product_set son la "imagen" dinámica — exigir static image bloqueaba el flujo.
- **Drafts republicables**: persistir TODO el estado del wizard en brief_visual (no solo name+budget). Republicar = reconstruir el contexto original.

**Deploys**: 11 revisions Cloud Run hoy (steve-api-00617-fch → 00628-nm2). Commits principales: `1005e733`, `9a52a9b5`, `02faaed7`, `84e4be33`, `0f87df03`, `ba2ccaf6`, `59afed01`, `ffc7fddd`, `95080d0a`, `4eada524`.

**Pendiente:**
- Tasks #9 in_progress: verificación end-to-end JM de DPA publish + Advantage+ preview + drafts republish
- Task #31 pending: unique constraint credit_transactions

---
