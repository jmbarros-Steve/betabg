# Javiera W12 — QA / El Chino
Squad: Infra (QA transversal) | Última sesión: 2026-04-08

## Estado actual: Deuda técnica Supabase silent failures RESUELTA (457 → 27, -94%)

### Completado esta sesión (2026-04-08) — Oleada 4 (LOW severity, final)

#### Oleada 4 — cerrar el backlog de silent failures
- [x] **Audit inicial**: 164 casos LOW en 56 archivos
- [x] **Exclusión Felipe W2**: quité 10 archivos (24 casos) que Felipe toca en paralelo para BM Partner → 140 casos en scope
- [x] **División en 3 buckets**:
  - **4A email grandes** (4 archivos, 44 casos): flow-webhooks (19), manage-campaigns (10), campaign-analytics (9), product-recommendations (6)
  - **4B email restantes** (15 archivos, 37 casos): revenue-attribution, track-events, flow-engine, send-queue, ab-testing, product-alerts, sync-subscribers, signup-forms, seed/email-system-templates, etc.
  - **4C utilities + auth + crm + misc** (27 archivos, 59 casos): utilities (11), auth (3), crm (4), public (1), triggers (2), oauth non-meta (2), analytics (2), booking (1)
- [x] **3 Task agents paralelos** lanzados con prompts idénticos (strategy: `safeQueryOrDefault`/`safeQuerySingleOrDefault` con `<any>` explícito, no tocar mutations)
- [x] **Resultado bucket 4A**: 43/44 migrados. 1 skip: `manage-campaigns.ts:256` es `.upsert().select().single()` fuera de scope
- [x] **Resultado bucket 4B**: 37/37 migrados
- [x] **Resultado bucket 4C**: 57/58 migrados. 1 skip: `self-signup.ts:62` es `.insert().select().single()` fuera de scope

#### Colisión cross-session con Rodrigo W0 / Valentina W1
- [x] **Detectada tras audit**: el bucket 4A reportaba migración OK pero `git status` no mostraba diff → commit `0614d65` (Rodrigo/Valentina en paralelo) había MIGRADO ya los 13 archivos email (flow-webhooks, campaign-analytics, manage-campaigns, product-recommendations, ab-testing, flow-engine, list-cleanup, product-alerts, revenue-attribution, send-queue, signup-forms, sync-subscribers, track-events, verify-domain) como parte de "8 mejoras Steve Mail"
- [x] **Resolución**: el trabajo del agente 4A era redundante — el efecto net es el mismo. Cerré 4A como completado sin duplicar commits
- [x] **Audit CWD bug descubierto**: `python3 scripts/audit-supabase-error-capture.py` da resultados distintos según el directorio desde donde se corre (usa `--dir cloud-run-api/src` relativo al CWD). Documentado: siempre correr desde `/Users/josemanuelpc/betabg` raíz

#### Commit consolidado
- [x] **`c62b761`** — `fix(routes): migrar ~80 casos LOW a safe-supabase helpers`
  - 27 archivos migrados (auth/crm/utilities/public/triggers/oauth-non-meta/analytics/booking) + baseline actualizado
  - Granular `git add` para evitar tocar archivos de Felipe (BM Partner) y sin diff real en shopify
- [x] Typecheck: **0 errors**
- [x] Baseline lint script: **verde**

#### Deploy
- [x] `git push betabg main` → commit `c62b761` en remoto
- [x] `gcloud run deploy` → revision **`steve-api-00426-869`** OK
- [x] **Total sesión acumulada en el día**: 9 commits deployados (oleadas 1+2+3+4 + ajustes)

### Acumulado deuda técnica Supabase silent failures — FINAL

| Oleada | Severity | Casos | Commit | Status |
|--------|----------|-------|--------|--------|
| 1 | CRITICAL (crons) | 89 | `739eee1` | ✅ deployed |
| 2 | HIGH (libs/chino/ai) | 131 | `0baed25` | ✅ deployed |
| 3 | MEDIUM (client routes) | 76 | `8dfb8c0` | ✅ deployed |
| 4 | LOW (resto) | 137 | `c62b761` + `0614d65` | ✅ deployed |
| **Total** | | **433 / 460** | **9 commits** | **94%** |

**Progreso global:** `457 → 27` (-430, **-94%**)

### Los 27 casos remanentes (aceptados, NO resolver)

#### 24 casos de Felipe W2 (BM Partner, otra sesión activa)
Excluidos adrede para no colisionar con su trabajo en progreso. Los cierra él al mergear.
- `whatsapp/steve-wa-chat.ts` — 6
- `oauth/meta-oauth-callback.ts` — 3
- `webhooks/leadsie-webhook.ts` — 3
- `meta/fetch-meta-ad-accounts.ts` — 2
- `facebook/fetch-facebook-insights.ts` — 2
- `facebook/publish-facebook.ts` — 2
- `instagram/fetch-instagram-insights.ts` — 2
- `instagram/publish-instagram.ts` — 2
- `meta/fetch-meta-business-hierarchy.ts` — 1
- `meta/meta-social-inbox.ts` — 1

#### 3 mutations fuera de scope (requieren helper que NO existe)
- `auth/self-signup.ts:62` → `.insert().select().single()`
- `whatsapp/prospect-trial.ts:55` → `.insert().select().single()`
- `email/manage-campaigns.ts:256` → `.upsert().select().single()`

Para cerrar estos 3 habría que crear `safeInsert`/`safeUpsert` en `cloud-run-api/src/lib/safe-supabase.ts`. Decisión pospuesta: solo 3 casos, baja prioridad.

### Tareas pendientes (de esta y sesiones anteriores)

#### De esta sesión
- [ ] **Crear helper `safeInsert`/`safeUpsert`** en `safe-supabase.ts` para cerrar los 3 mutations restantes (low priority, solo 3 casos)
- [ ] **Coordinar con Felipe W2** al terminar BM Partner: verificar que sus 24 archivos quedan migrados al cerrar su rama
- [ ] **Documentar audit CWD bug**: el script `audit-supabase-error-capture.py` debería usar paths absolutos o detectar el repo root. Candidato para mejora del script mismo

#### De sesiones anteriores — todavía abiertas
- [ ] **Tarea #24** — Propagar filtro `purged_at` a 15 rutas con SELECT directo sobre `steve_knowledge` (migration `20260407210000_steve_knowledge_purged_at.sql` existe, rutas sin actualizar)
- [ ] **Tarea #30** — Decidir `qaResults` en `steve-prompt-evolver`: inyectar o eliminar
- [ ] **Monitoreo cron `chino-executor`** — verificar runs recientes sin errores tras el deploy del 07/04
- [ ] **Fase 2 OJOS (health-check)** — ampliar cobertura 52% → 75% (~18 endpoints restantes)
- [ ] **Whitelist `chino-executor`** — auditar tablas frecuentemente-inconsistentes fuera de las 17 iniciales
- [ ] **Recalcular baseline "69 endpoints críticos"** contra los 187 endpoints actuales de Cloud Run

### Blockers detectados (no míos, documentados)

- 🔴 **PAT GitHub expuesto en `.git/config`** (arrastrado desde sesiones anteriores, también flagged por Diego W8)
- 🔴 **Remote `origin` mal configurado**: apunta a `claude-memory`, no a `betabg`. Workaround: `git push betabg main` explícito
- 🟡 **Felipe W2 BM Partner en curso** — bloquea cleanup final de los 24 casos Meta (no-blocker para mi trabajo, acepté el trade-off)

### Notas operacionales
- Cloud Run último revision: **`steve-api-00426-869`**
- Supabase ref: `zpswjccsxjtnhetkkqde`
- Commits de esta sesión: `c62b761` (oleada 4 LOW)
- Cross-session collision: `0614d65` (Rodrigo/Valentina email migrado en paralelo)
- Baseline: `docs/audits/baseline-supabase-error-capture.json` → **27 casos**
- Helper usado: `cloud-run-api/src/lib/safe-supabase.ts` — 4 funciones (`safeQuery`, `safeQuerySingle`, `safeQueryOrDefault`, `safeQuerySingleOrDefault`)

### Patrones consolidados esta sesión
1. **Siempre `<any>` type parameter** en llamadas `safeQueryOrDefault<any>(...)` → TypeScript infería `T` como `never` sin hint explícito
2. **Graceful degradation para LOW** — fail-silent con default, loggear a Sentry via `context` string, nunca romper UI
3. **Granular `git add` obligatorio** cuando hay sesiones paralelas — NUNCA `git add -A` porque puede pisar trabajo en curso de otros agentes
4. **Audit script sensible a CWD** — documentar o corregir
5. **Cross-session collision OK si el efecto net es idéntico** — no duplicar commits, solo verificar y seguir
