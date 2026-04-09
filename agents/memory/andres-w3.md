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
