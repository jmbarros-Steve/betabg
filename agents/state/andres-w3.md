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

## Tareas completadas previas
- [x] Implementar flujo Leadsie+MCC para onboarding merchants Google (funcionando, 1 cuenta activa synceando)
- [x] LEADSIE_WEBHOOK_SECRET seteada en Cloud Run (rev 00531-jns, 2026-04-15)
- [x] Leadsie Connect Profile configurado para Google Ads por JM

## Blockers
- Ninguno activo. Credenciales Google en Cloud Run resueltas vía Leadsie+MCC (1 cuenta activa synceando).
