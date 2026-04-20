# Andrés W3 — Google Ads — Estado

## Última sesión: 20/04/2026

### Resumen de sesiones
| Fecha | Sesión | Commits | Deploys |
|-------|--------|---------|---------|
| 09/04 | Dashboard 7 features + 30 fixes + 1 bug fix | — | — |
| 10/04 AM | Fix Pipeline: sync-campaign-metrics, health check, currency, MCC fallback | — | rev 00478 |
| 10/04 PM | Tier 2: Keywords, RSA, Extensions, Conversions, Search Terms | `12b642f0` | Supabase+CR+Vercel+Scheduler |
| 12/04 | Tier 3: Shared lib, 13 actions, PMAX, Steve AI recs (+2979/-785) | `5b3c60bb` | rev 00513-489 |
| 13/04 | Wizard PMAX 6 pasos + 10 fixes API v23 + single-batch arch | 7 commits | 6 deploys CR |
| 15/04 | AI en cada paso del Wizard PMAX (Step 1-5) | — | — |
| 20/04 | **Wizard PMAX enterprise:** user_intent + MC + multi-audience + LGF tree + 13 fixes proto v23 | 20+ commits | 12+ deploys CR (final rev 00558-px7) |
| 20/04 PM | **Fix Asset.name duplicate** en imageAsset creates (PMAX mutate abort cascade) | `055ff6d8` | rev 00560-jrq |
| 20/04 PM-2 | **Regresión corregida:** `name` es REQUIRED para imageAsset en v23 → solución correcta = name único con sufijo `assetTempId` | `8867f21c` | rev 00561-kd6 |
| 20/04 PM-3 | **LGF root + catch-all en mismo mutate:** v23 valida per-commit "SUBDIVISION must have everything else child" → root y catch-all van juntos con temp ID resuelto internamente | `c5df2f42` | rev 00562-4bn |
| 20/04 PM-4 | **LGF resource_name compound `{realAgId}~{tempId}`:** v23 rechaza temp plano `-1`; patrón canónico del factory oficial de Google | `843f1f44` | rev 00563-8sr |
| 20/04 PM-5 | **listing_source required en todos los nodos LGF:** v21+ lo hizo required en cada nodo, no solo root | `a847e4ff` | rev 00564-fmv |
| 20/04 PM-6 | **UX fixes:** nombre campaña dinámico por channel_type + bid strategy dropdown shadcn | `145925c5` | rev 00565-lf2 |
| 20/04 PM-7 | **🥇 Auto-refresh PMAX + optimistic update + pause-when-hidden** | `ba0571cb` | Vercel |
| 20/04 PM-8 | **🥈 Scorecard calidad AG** (STRENGTH_CONFIG + progress bar + "qué mejorar") | `029ef0a8` | Vercel |
| 20/04 PM-9 | **🥉 Vista jerárquica** asset groups inline en tab Campañas | `f9fed308` | Vercel |
| 20/04 PM-10 | **Acciones por grupo de recursos** + CreateAssetGroupDialog shared + tab renombrada | `fd6e5391` | Vercel |
| 20/04 PM-11 | **Soft-delete campañas** (v1 fallido, fix `02cb0a5d` via operation.remove) | `a9d2b405`/`02cb0a5d` | rev 00566-5bp / 00567-l89 |

### ⚠️ PENDIENTES MAÑANA (21/04) — flagged por JM

- **FALLA eliminación de grupos de recursos** — botón Trash2 en tab "Grupos de recursos PMAX" falla al ejecutar. Probablemente AssetGroup tiene misma restricción v23 que Campaign (no acepta update status=REMOVED). Aplicar `assetGroupOperation.remove` paralelo al fix `02cb0a5d`.
- **Edición de AG poco intuitiva** — reemplazar `window.prompt`/`window.confirm` por Dialog con Input. Aplica en tab PMAX (rename/delete) y CampaignManager sub-row (delete).

### Tiers completados
- [x] **Tier 1:** Pause/resume, budget, reglas automáticas (2 tablas + RLS + cron)
- [x] **Tier 2:** Keywords, RSA Ads, Extensions, Conversions, Search Terms (8 archivos)
- [x] **Tier 3:** Shared lib ~465 líneas, 13 actions campaign, 6 actions PMAX, Steve AI
- [x] **Tier 3.5:** Wizard PMAX 6 pasos, 10 fixes API v23, single-batch architecture
- [x] **Tier 4 (20/04):** Wizard PMAX enterprise — user_intent propagado, MC direct via GAQL shopping_product, multi-audience signals, LGF tree con 3 mutates, CampaignLifecycleGoal separado, auto-fit imágenes con sharp, grounded sitelinks SSRF-safe, security hardening (UUID regex, cross-validation SKUs)

### Bugs resueltos
- [x] Métricas sin parseFloat defensivo → `parseFloat(String(...)) || 0` (2026-04-13)
- [x] Cron secret timing attack → ya migrado a `isValidCronSecret()` con `timingSafeEqual`
- [x] Goals no se reseteaban al cambiar de cliente en dashboard (2026-04-09)
- [x] API v23 (13/04): startDate, deliveryMethod, bidding strategy, explicitlyShared, EU political, brandGuidelines, URL protocol, asset batch, text truncation, error details
- [x] Proto v23 (20/04): AgeSegment{minAge,maxAge} ints, shopping_product._level1..5, image_link removido, searchTheme.text shape, AudienceInfo wrap, callToActionAsset enum, UNDETERMINED filter, sitelink finalUrls en Asset padre, AssetGroupListingGroupFilter sin temp IDs, customerAcquisitionSetting en CampaignLifecycleGoal, 1 audience signal per asset group, TypeScript scope fix
- [x] **Asset.name duplicate bug** (20/04 PM): imageAsset creates caían al default 'Image' → Google rechaza "Duplicate assets across mutates cannot have different asset level fields" → cascada de 25 ops assetGroupAssetOperation con "Resource was not found". Fix final: `name: \`${img.name || 'Image'}-${Math.abs(assetTempId)}\`` (sufijo único derivado del counter monotónico). Afectaba `manage-google-campaign.ts:900` + `manage-google-pmax.ts:253`. Commits `055ff6d8` (regresión: removía name pero v23 lo requiere) + `8867f21c` (fix correcto). Rev final 00561-kd6.

## Tareas pendientes (verificación marathon 20/04)
- [ ] **Probar PMAX end-to-end con productos reales** (LGF tree aplicado correctamente) ← PRIORIDAD
- [ ] Verificar que el budget del AI respeta el del Step 1 (±20%)
- [ ] Verificar que las imágenes AI usan productos del MC como referencia visual
- [ ] Confirmar que `CampaignLifecycleGoal` se aplica solo si hay Customer Match activa
- [ ] Verificar nombres de audiencias limpios en UI (prettyAudienceName)
- [ ] Auditar `secondaryWarning` en response cuando audience multi-select
- [ ] Crear task en Supabase para el cap de 500 SKUs vs necesidad real del user
- [ ] Documentar en el hub del agente el flujo de 3 mutates para PMAX con LGF
- [ ] Asset editing post-creación (feature nueva)
- [ ] Validación aspect ratio client-side (auto-fit con sharp ya lo resuelve server-side, revisar si aún aplica)
- [ ] Follow-ups Isidora W6 post-fix Asset.name (no-bloqueantes):
  - Sanitizar `img.name` en `manage-google-campaign.ts:900` (strip newlines, truncar a 120 chars, límite Google Asset.name=128)
  - Fix colisión cosmética cross-request en `manage-google-pmax.ts`: `assetTempId=-1` constante (línea 241) → cambiar a `Date.now()` o hash corto del `image_data`
  - Agregar test E2E con 2 imágenes del mismo `img.name` para verificar no-colisión

## Tareas completadas previas
- [x] Implementar flujo Leadsie+MCC para onboarding merchants Google (funcionando, 1 cuenta activa synceando)
- [x] LEADSIE_WEBHOOK_SECRET seteada en Cloud Run (rev 00531-jns, 2026-04-15)
- [x] Leadsie Connect Profile configurado para Google Ads por JM

## Blockers
- Ninguno activo. Credenciales Google en Cloud Run resueltas vía Leadsie+MCC (1 cuenta activa synceando).
