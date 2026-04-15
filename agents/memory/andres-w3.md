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

**Estado Leadsie (09/04/2026):**
- Deploy prod: steve-api-00426-869 (100% traffic) con 9 fixes
- Git: código SIN commit/push — drift activo prod↔repo
- Blockers E2E: #27 LEADSIE_WEBHOOK_SECRET, #16 JM config Connect Profile, #18 test E2E
- 8 items deuda técnica pendientes

### Documento Google Ads API Application
- Creado en `docs/google-ads-api-application.md`
- Cubre: datos empresa, descripción producto, detalle técnico, seguridad, compliance, checklist
- Access level: Basic (15,000 ops/día) — justificado por multi-tenant agency model
- 3 funcionalidades declaradas: metrics sync (GAQL searchStream), account management (listAccessibleCustomers), AI copy generation (usa datos de la API, no la API directamente)
- Compliance: NO app conversion tracking, NO remarketing lists, NO customer match

### Investigación: Leadsie para Google Ads — SÍ SE PUEDE

**Leadsie soporta Google Ads.** Confirmado en leadsie.com/integrations/google.

**Cómo funciona:**
- Merchant recibe link Leadsie → se loguea en Google → selecciona las cuentas Google Ads que quiere compartir
- El acceso se otorga al **MCC (Manager Account)** de Steve, NO como usuario individual
- El merchant NO comparte contraseñas — Leadsie maneja el flujo OAuth internamente
- El acceso **NO expira** a menos que el merchant lo revoque manualmente
- Leadsie soporta webhooks para Google Ads ("trigger automations after you receive access")
- Soporta `customUserId` en la URL (mismo patrón que Meta)

**Plataformas Google soportadas por Leadsie:**
1. Google Ads (con MCC)
2. Google Analytics (GA4 + Universal)
3. Google Tag Manager
4. Google Search Console
5. Google Business Profile
6. Google Merchant Center
7. YouTube

**¿Cómo accedemos a la API de Google Ads vía MCC?**
- Un MCC (Manager Account) puede hacer llamadas API a TODAS las sub-cuentas bajo su jerarquía
- Se necesita UN developer token aprobado en el MCC (5-14 días de aprobación)
- OAuth2 credentials del MCC → refresh token del MCC → API calls con `customer_id` del merchant
- NO necesitamos OAuth individual por merchant — el MCC tiene acceso programático a todas las sub-cuentas

**Flujo propuesto Google Ads via Leadsie + MCC:**
```
1. Frontend GooglePartnerSetup.tsx → abre Leadsie con ?customUserId={client_id}
2. Merchant aprueba acceso Google Ads al MCC de Steve
3. Leadsie POST webhook → /api/webhooks/leadsie-google con body.user = client_id
4. Webhook persiste en platform_connections (platform='google', connection_type='leadsie')
   + guarda customer_id de Google Ads del merchant
5. getTokenForConnection() detecta platform='google' + type='leadsie'
   → retorna OAuth token del MCC (env var o refresh token del MCC)
6. API calls con developer token + MCC OAuth + customer_id del merchant
```

**Ventaja vs OAuth individual:**
- Un solo token (MCC) para todos los merchants (como SUAT de Meta)
- No hay tokens expirando por merchant (como SUAT, el MCC refresh se mantiene centralmente)
- Mismos antipatrones aplican: scoping por customer_id, nunca listar TODAS las cuentas

**Lo que necesitamos (ANTES de implementar):**
1. Crear MCC de Steve en Google Ads (si no existe)
2. Solicitar developer token en el MCC (5-14 días aprobación)
3. Crear OAuth2 credentials del MCC en Google Cloud Console
4. Configurar Leadsie Connect Profile para Google Ads con el MCC de Steve
5. Implementar webhook handler + resolver en getTokenForConnection()
6. Setear env vars: GOOGLE_MCC_CUSTOMER_ID, GOOGLE_MCC_REFRESH_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN

## Sesión 10/04/2026 — Tier 1 + Tier 2 + Fix Pipeline

### Tier 1: Campañas + Reglas Automáticas
- 6 archivos nuevos, 3 modificados, 2075 líneas
- Tablas: `google_automated_rules` + `google_rule_execution_log` (con RLS + indexes)
- `manage-google-campaign.ts`: pause/resume/update_budget/list_details
- `manage-google-rules.ts`: CRUD reglas
- `execute-google-rules.ts`: cron cada hora
- Frontend: `GoogleCampaignManager.tsx` + `GoogleAutomatedRules.tsx` (5 presets + historial)
- `GoogleAdsTab.tsx` modificado: 4 tabs (Analíticas / Campañas / Reglas / Copys)
- Deploy completo: Supabase + Cloud Run + Vercel + Cloud Scheduler
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
- Deploy: rev 00478

## Sesión 12/04/2026 — Tier 3: Shared Lib + PMAX + Steve AI

### Lo que se hizo (6 fases en una sesión)
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
