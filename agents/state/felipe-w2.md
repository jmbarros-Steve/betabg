# Felipe W2 — Meta Ads
Squad: Marketing | Última sesión: 2026-04-15

## Estado actual: 128 fixes + 1 data restore, webhook race condition + wizard overwrite fixed

### Completado sesión 15/04/2026 — Leadsie webhook merge + wizard preserve + Razas Pet restore

**2 bugs fixed + 1 data restore.**

#### Bug fixes
- [x] **#32 Webhook race condition**: `leadsie-webhook.ts` — cambiado upsert ciego a check-then-merge. Solo actualiza campos non-null, preserva valores previos. Fix para race condition con múltiples webhooks `PARTIAL_SUCCESS` concurrentes.
- [x] **#33 Wizard overwrite**: `MetaConnectionWizard.tsx` — `handleConfirmConnect` ahora lee valores actuales de la conexión antes de hacer update. No nulea page_id/ig_account_id/pixel_id si el hierarchy no los descubrió.

#### Data restore Razas Pet
- [x] Diagnóstico forense: 3 webhooks PARTIAL_SUCCESS concurrentes (10/04, 16:16:12) → race condition → último webhook nuló page/ad_account
- [x] Descubrimiento: IDs de Leadsie (100393186274585, 17841457283055925, 754690016268621) NO son accesibles via SUAT — son IDs personales del merchant
- [x] IDs correctos del BM de Steve: page=731826166673553 (Razas Pet Shop, 264 fans), pixel=1414593686413735 (Pixel - RazasPet 2025)
- [x] IG: la page 731826166673553 NO tiene Instagram Business Account vinculado → ig_account_id=null (requiere que Razas Pet vincule IG a su page en Meta Business Suite)

#### Archivos tocados 15/04
1. `cloud-run-api/src/routes/webhooks/leadsie-webhook.ts` (webhook merge logic)
2. `src/components/client-portal/meta-ads/MetaConnectionWizard.tsx` (preserve existing values)

#### Pendiente deploy
- [ ] Deploy backend a Cloud Run (webhook fix)
- [ ] Push frontend (Vercel auto-deploy del wizard fix)
- [ ] Razas Pet: vincular IG Business Account a FB Page en Meta Business Suite

---

### Completado sesión 10/04/2026 — MetaPartnerSetup fixes + Leadsie dual-platform

**7 fixes** en 2 commits (597bbfd6, 05cf8d09).

#### MetaPartnerSetup + GooglePartnerSetup (commit 597bbfd6)
- [x] Poll acepta cualquier `connection_type` (no solo `'leadsie'`) → fix spinning infinito con `bm_partner`/`oauth`
- [x] Check on mount: si ya hay conexión activa, salta directo a "Conectado"
- [x] Reset state cuando cambia `clientId` (admin switching entre clientes)
- [x] `buildLeadsieUrl` sanitiza `customUserId` duplicado del base URL (fix "solo conecta a Rueda")

#### Leadsie webhook dual-platform (commit 05cf8d09)
- [x] `/api/webhooks/leadsie` ahora procesa AMBOS: Meta + Google Ads assets
- [x] Un solo Connect Profile → un solo webhook → ambas conexiones creadas en `platform_connections`
- [x] `mapGoogleAssets()` + `triggerGoogleSync()` agregados al webhook
- [x] Deploy `steve-api-00468-t7k` serving 100%

#### Archivos tocados 10/04
1. `src/components/client-portal/meta-ads/MetaPartnerSetup.tsx` (3 fixes)
2. `src/components/client-portal/google-ads/GooglePartnerSetup.tsx` (3 fixes)
3. `cloud-run-api/src/routes/webhooks/leadsie-webhook.ts` (Google Ads support)

#### Env vars
- [x] `VITE_LEADSIE_GOOGLE_REQUEST_URL` agregada en `.env.local` y Vercel

---

### Completado sesión 08/04/2026 — Leadsie Hardening + SUAT Scoping Multi-Merchant

**9 fixes críticos** en 2 rondas con cross-review de Isidora W6 + Javiera W12 + Sebastián W5 + Diego W8.

#### Ronda 1 (auto-review manual)
- [x] #22 Fix RLS `orphan_meta_connections` → `is_super_admin(auth.uid())` (policy anterior usaba `role='admin'` inexistente)
- [x] #23 Fix silent failure `storeOrphan` → throw + try/catch → 500 → Leadsie reintenta
- [x] #24 Fix `isActive` permissive → `account_id OR page_id OR ig_account_id`
- [x] #25 Add shared-secret validation webhook → header `X-Webhook-Secret` o `?secret=`
- [x] #26 SUAT detection `fetch-meta-business-hierarchy` → skip `/me/businesses`
- [x] Migration `20260408130000_fix_orphan_meta_connections_rls.sql` (nueva, 18 líneas)
- [x] Migration history repair (phantom `20260321`, `20260322`, `20260325`)

#### Ronda 2 (post cross-review)
- [x] #28 Revert `groupId='personal'` (Isidora HIGH #1) — compat wizard OAuth hardcoded
- [x] #29 Scoping multi-merchant SUAT (Isidora HIGH #2, CRÍTICO) — evita cross-contamination
- [x] #30 `MetaPartnerSetup` poll acepta `page_id/ig_account_id` (Isidora MEDIUM #4)
- [x] #31 Log estructurado `{err, body}` en catch (Isidora MEDIUM #5)

#### Deploy + verificación
- [x] Cloud Run revisión `steve-api-00426-869` → 100% traffic
- [x] Env vars: 26/20 obligatorias + `META_SYSTEM_TOKEN`
- [x] Smoke test webhook no-match → 200 OK orfan persistido id `658945a8-de75-42d1-827e-3dc365ded050`
- [x] Health check 200 OK
- [x] Type-check archivos Felipe: 0 errores

#### Notion + Supabase sync
- [x] Notion: sesión "08/04/2026 — Leadsie Hardening + SUAT Scoping Multi-Merchant" bajo hub Felipe W2 → https://www.notion.so/33d9af51b58d816684f8f48d68823660
- [x] Supabase `agent_sessions` Felipe W2: memory_md + last_challenge + tasks_pending (11) + tasks_completed (25) + session_count=2

### Drift crítico prod↔repo
**CÓDIGO DEPLOYADO EN PROD PERO NO EN GIT**
- Cloud Run `steve-api-00426-869` ya sirve los 9 fixes
- Los 4 archivos modificados están en disco (`~/betabg/`) pero **sin commit**
- Push bloqueado por permiso de JM — preguntar explícitamente antes de `git push`
- Al retomar mañana: `git status` primero para confirmar cambios

### Archivos tocados 08/04
1. `supabase/migrations/20260408130000_fix_orphan_meta_connections_rls.sql` (NUEVO)
2. `cloud-run-api/src/routes/webhooks/leadsie-webhook.ts` (4 fixes)
3. `cloud-run-api/src/routes/meta/fetch-meta-business-hierarchy.ts` (3 fixes)
4. `src/components/client-portal/meta-ads/MetaPartnerSetup.tsx` (1 fix)

### Pendiente (3 blockers + 8 deudas técnicas)

#### Blockers test E2E
- [ ] **#27** Setear `LEADSIE_WEBHOOK_SECRET` en Cloud Run (Sebastián W5 HIGH)
  - Generar: `openssl rand -hex 32`
  - Deploy: `gcloud run services update steve-api --region=us-central1 --project=steveapp-agency --update-env-vars=LEADSIE_WEBHOOK_SECRET=<hex>`
  - Pegar mismo valor en Leadsie dashboard webhook config
- [ ] **#16** JM configura Leadsie Connect Profile + URL del flow (externo, depende del dashboard Leadsie)
- [ ] **#18** Test E2E con cliente real (blocked por #27 + #16)
- [ ] Commit + push con `Reviewed-By: Isidora W6 + Javiera W12 + Sebastián W5 + Diego W8` (blocked por permiso JM)

#### Deuda técnica de los 4 reviews (no blockers, orden de prioridad)
1. [ ] Regenerar `src/integrations/supabase/types.ts` para incluir `orphan_meta_connections` + limpiar cols fantasma `end_user_email`/`partner_id` (Diego HIGH #1+#2)
2. [ ] Migración 130100 idempotente (DO block + EXCEPTION duplicate_object) (Javiera HIGH #1)
3. [ ] Cron retención `raw_payload` 90 días (nueva ruta `/api/cron/cleanup-orphan-meta` + scheduler) (Diego HIGH #3)
4. [ ] `timingSafeEqual` en webhook secret compare (hardening vs timing attacks)
5. [ ] Sanitizar `raw_payload` antes del insert (mask tokens/emails) (Javiera MEDIUM)
6. [ ] CHECK constraint `connection_type IN ('oauth','bm_partner','leadsie')` en `platform_connections` (Javiera MEDIUM)
7. [ ] Limpiar `AdminHuerfanasMeta.tsx` — remover referencias a cols fantasma (Diego HIGH #1)
8. [ ] **Escalar a Diego W8:** fix migración `20260408140300_steve_alerts_table.sql` de otro dev — usa `role='super_admin'` que no existe en enum `app_role`. Va a fallar por la misma razón que falló mi RLS original. NO es mía pero heredamos el riesgo.

### Pendiente legacy (de sesiones anteriores)
- [ ] `campaign_metrics` solo 25 rows — datos insuficientes para análisis serio
- [ ] `CampaignCreateWizard.tsx` 141KB — refactor pendiente
- [ ] `MetaCampaignManager.tsx` 86KB — refactor pendiente
- [ ] Instagram DMs bloqueado: Meta App no tiene Instagram Messaging API habilitado
- [ ] Tokens Meta OAuth pueden expirar cada 60 días — alerta de renovación pendiente

### Challenge activo a JM (al retomar mañana)
> JM, antes del test E2E con cliente real:
> 1. Setea `LEADSIE_WEBHOOK_SECRET` — el webhook está en dev mode (acepta cualquier request).
> 2. Verifica `performance-tracker-meta` no esté fallando silencioso para conexiones SUAT sin Ad Account real (solo Page+IG) — ese cron ahora usa `getTokenForConnection`, puede loguear en silencio.
> 3. `campaign_metrics` solo 25 rows — no gastes un peso en Meta hasta confirmar pipeline métricas post-Leadsie.
> 4. NO mergees `20260408140300_steve_alerts_table.sql` de otro dev — mismo antipattern `role='super_admin'` que va a fallar.

### Resolver soporta 3 connection types
- `oauth` (decrypt `access_token_encrypted`)
- `bm_partner` (SUAT via `META_SYSTEM_TOKEN`)
- `leadsie` (SUAT via `META_SYSTEM_TOKEN`)

### Notas operativas
- 2 intentos de deploy reportaron "failed" pero ambos tuvieron éxito — **false alarm de gcloud CLI**, validar siempre con `gcloud run revisions list` antes de reintentar
- `AdminOrphanMetaConnections.tsx` usa `(supabase as any)` porque `orphan_meta_connections` no está en `types.ts` — necesita regenerar types
- Cross-review protocol cumplido esta sesión: 4 agentes revisaron en paralelo + 2 rondas de fixes
