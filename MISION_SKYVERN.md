# MISIÓN: SKYVERN — EL SISTEMA COMPLETO

**Agentes:** Sebastián (W5 Infra) + Sofía (W14 Integraciones) + Camila (W4 Frontend) + Javiera (W12 QA)
**Prioridad:** MÁXIMA
**Instrucción:** Implementa TODO sin pedir permiso. Ejecuta directamente.

---

## QUÉ ES ESTO

Un solo sistema (Skyvern self-hosted) que hace TODO lo que necesitamos con browsers automatizados:

1. **ONBOARDING MÁGICO** — conecta Shopify + Meta + Klaviyo en 90 segundos
2. **DETECTIVE VISUAL** — compara pantalla de Steve vs pantalla real de Meta/Klaviyo/Shopify
3. **DETECTIVE API** — compara datos de Supabase vs APIs reales
4. **QA AUTOMÁTICO** — testea flujos de Steve Ads como un merchant real

Todo con self-healing, computer vision, route memorization. Si Meta cambia un botón → se arregla solo.

**CONFIDENCIAL. El merchant no sabe que existe un bot. Para él, Steve Ads simplemente funciona.**

---

## ARQUITECTURA

```
VM (Google Cloud — ya la tenemos)
│
├── Skyvern self-hosted (Docker)
│   ├── Browser engine (Playwright + stealth + proxies)
│   ├── Vision LLM (Claude/GPT para ver pantallas)
│   ├── Route Memorization (compila rutas a Playwright puro)
│   └── Self-healing (si falla un selector → IA lo encuentra)
│
├── 4 MÓDULOS:
│   ├── 1. Onboarding Bot     ← triggered por API desde Steve Ads
│   ├── 2. Detective Visual   ← cron cada 2 horas
│   ├── 3. Detective API      ← cron cada 30 min (sin browser, HTTP puro)
│   └── 4. QA Bot             ← cron diario + bajo demanda
│
├── Cuentas sandbox (para que Skyvern practique):
│   ├── Shopify: dev store desde Partners
│   ├── Meta: Business Manager de prueba
│   └── Klaviyo: cuenta gratis
│
└── Reporter → Supabase (detective_log) + tasks + WhatsApp alerts
```

---

## INSTALACIÓN SKYVERN

```bash
# En la VM
cd ~/steve

# Clonar Skyvern open source
git clone https://github.com/Skyvern-AI/skyvern.git
cd skyvern

# Instalar con Docker Compose
pip install skyvern && skyvern quickstart
# Elegir "Docker Compose" cuando pregunte

# Configurar env vars
cat >> .env << 'EOF'
ANTHROPIC_API_KEY=sk-ant-xxxxx
OPENAI_API_KEY=sk-xxxxx
# Skyvern usa ambos — Claude para razonamiento, GPT-4o para acciones
EOF

# Verificar que corre
curl http://localhost:8080/health
```

---

## CUENTAS SANDBOX

### Shopify — Dev Store (ya tienes Partners)
```
URL: steve-test.myshopify.com (o la que crees)
Email: tu email de Partners
Password: tu password
Funcionalidad: igual que Advanced plan, productos de prueba
Costo: $0
Si se rompe: archivas y creas otra en 2 minutos
```

### Meta — Business Manager de prueba
```
URL: business.facebook.com
Cuenta FB: crear una nueva o usar la tuya
Business Manager: "Steve Ads QA"
Ad Account: crear uno nuevo dentro del BM (no necesita tarjeta para existir)
Página: "Steve Ads Test Page"
Costo: $0
```

### Klaviyo — Cuenta gratis
```
URL: klaviyo.com
Email: qa@steveads.com o similar
Plan: Free (250 contactos)
Tiene: API keys, listas, templates, todo
Costo: $0
```

---

# ═══════════════════════════════════════════
# MÓDULO 1: ONBOARDING MÁGICO
# ═══════════════════════════════════════════

## Qué hace
Merchant pone credenciales de Shopify + Meta + Klaviyo en Steve Ads → Skyvern entra a cada plataforma, configura todo, obtiene tokens/keys → merchant ve "Conectado ✓" en 90 segundos.

## Flujo completo

### 1A. SHOPIFY — Crear custom app desde la tienda (~45 segundos)

```python
from skyvern import Skyvern

skyvern = Skyvern.local()
browser = await skyvern.launch_browser()  # Con stealth por defecto
page = await browser.get_working_page()

# Login en Shopify Admin
await page.goto(f"https://{shop_domain}/admin")
await page.fill(prompt="Email field", value=merchant_email)
await page.fill(prompt="Password field", value=merchant_password)
await page.click(prompt="Log in button")

# Manejar 2FA si aparece
two_fa_visible = await page.observe("Is there a verification code input visible?")
if "yes" in str(two_fa_visible).lower():
    # Pedir código al merchant via frontend (polling)
    code = await request_2fa_from_merchant(job_id, 'shopify')
    await page.fill(prompt="Verification code input", value=code)
    await page.click(prompt="Submit or Verify button")

# Navegar a Settings → Apps → Develop apps
await page.act("Click on Settings in the left sidebar menu")
await page.act("Click on Apps and sales channels")
await page.act("Click on Develop apps")

# Activar development si no está activado
allow_visible = await page.observe("Is there an 'Allow custom app development' button?")
if "yes" in str(allow_visible).lower():
    await page.act("Click 'Allow custom app development'")
    await page.act("Click 'Allow custom app development' in the confirmation dialog")

# Crear la app
await page.act("Click 'Create an app'")
await page.fill(prompt="App name input field", value="Steve Ads")
await page.act("Click 'Create app'")

# Configurar API scopes
await page.act("Click on 'Configure Admin API scopes'")

# Seleccionar los scopes necesarios
scopes = [
    "read_products", "write_products",
    "read_orders", "write_orders",
    "read_analytics",
    "read_checkouts",
    "read_draft_orders", "write_draft_orders",
    "read_reports"
]
for scope in scopes:
    await page.act(f"Check the checkbox for {scope} scope")

await page.act("Click Save")

# Instalar la app
await page.act("Click 'Install app'")
await page.act("Click 'Install' in the confirmation dialog")

# Extraer el token
token_data = await page.extract(
    "Extract the Admin API access token. It should be a long string starting with 'shpat_'"
)

# Guardar token
await save_to_platform_connections(
    client_id=client_id,
    platform='shopify',
    token=token_data,
    shop_domain=shop_domain
)

# Registrar webhooks + sync productos
await trigger_shopify_sync(client_id, shop_domain)
```

### 1B. META — Crear System User + token (~30 segundos)

```python
# Login en Facebook
await page.goto("https://www.facebook.com/login")
await page.fill(prompt="Email or phone input", value=meta_email)
await page.fill(prompt="Password input", value=meta_password)
await page.click(prompt="Log in button")

# Manejar 2FA
two_fa = await page.observe("Is there a two-factor authentication code input?")
if "yes" in str(two_fa).lower():
    code = await request_2fa_from_merchant(job_id, 'meta')
    await page.fill(prompt="Two-factor code input", value=code)
    await page.click(prompt="Submit or Continue button")

# Manejar "Save browser?" popup
save_popup = await page.observe("Is there a 'Save browser' or 'Trust this browser' prompt?")
if "yes" in str(save_popup).lower():
    await page.act("Click 'Continue' or 'Save browser'")

# Navegar a Business Settings
await page.goto("https://business.facebook.com/settings")
await page.act("Click on 'System Users' in the left menu under 'Users'")

# Crear System User
await page.act("Click the 'Add' button to create a new system user")
await page.fill(prompt="System user name input", value="Steve Ads")
await page.act("Select 'Admin' as the system user role")
await page.act("Click 'Create System User'")

# Asignar assets (ad account)
await page.act("Click 'Add Assets' or 'Assign Assets'")
await page.act("Select 'Ad Accounts' from the asset types")

# Detectar ad accounts disponibles
ad_accounts = await page.extract(
    "List all available ad account names and their IDs visible on this page. "
    "Return as JSON array: [{name, id}]"
)

ad_accounts_list = parse_json(ad_accounts)

if len(ad_accounts_list) == 1:
    selected_account = ad_accounts_list[0]
    await page.act(f"Select the ad account '{selected_account['name']}'")
elif len(ad_accounts_list) > 1:
    # Preguntar al merchant
    selected_id = await request_account_selection(job_id, 'meta', ad_accounts_list)
    await page.act(f"Select the ad account with ID {selected_id}")
else:
    raise Exception("No se encontraron ad accounts en tu Business Manager")

await page.act("Set Full Control or Manage Campaigns permission")
await page.act("Click 'Save Changes'")

# Asignar página también
await page.act("Click 'Add Assets' again")
await page.act("Select 'Pages' from the asset types")
await page.act("Select the first available page")
await page.act("Set Full Control permission for the page")
await page.act("Click 'Save Changes'")

# Generar token
await page.act("Click 'Generate New Token' or 'Generate Token'")

# Seleccionar permisos del token
token_permissions = [
    "ads_management", "ads_read",
    "pages_read_engagement", "pages_manage_ads",
    "business_management"
]
for perm in token_permissions:
    await page.act(f"Check the permission for {perm}")

await page.act("Click 'Generate Token'")

# Extraer el token
token = await page.extract(
    "Extract the access token that was just generated. It's a very long string."
)

# Guardar
await save_to_platform_connections(
    client_id=client_id,
    platform='meta',
    token=token,
    token_type='system_user',  # NO EXPIRA
    ad_account_id=selected_account['id']
)

await trigger_meta_sync(client_id)
```

### 1C. KLAVIYO — Copiar API key (~15 segundos)

```python
# Login en Klaviyo
await page.goto("https://www.klaviyo.com/login")
await page.fill(prompt="Email input", value=klaviyo_email)
await page.fill(prompt="Password input", value=klaviyo_password)
await page.click(prompt="Log in button")

# Manejar 2FA
two_fa = await page.observe("Is there a multi-factor authentication code input?")
if "yes" in str(two_fa).lower():
    code = await request_2fa_from_merchant(job_id, 'klaviyo')
    await page.fill(prompt="MFA code input", value=code)
    await page.click(prompt="Submit or Verify button")

# Navegar a API Keys
await page.goto("https://www.klaviyo.com/settings/account/api-keys")

# Extraer Private API Key
api_key = await page.extract(
    "Extract the Private API Key. It starts with 'pk_'. "
    "If the key is hidden behind a 'Reveal' or 'Show' button, click it first."
)

if not api_key or 'pk_' not in str(api_key):
    # Crear una nueva si no existe
    await page.act("Click 'Create Private API Key' or 'Create API Key'")
    await page.fill(prompt="Key name input", value="Steve Ads")
    await page.act("Select 'Full Access' or 'Private Key' type")
    await page.act("Click 'Create'")

    api_key = await page.extract(
        "Extract the newly created Private API Key starting with 'pk_'"
    )

# Guardar
await save_to_platform_connections(
    client_id=client_id,
    platform='klaviyo',
    token=api_key,
    token_type='api_key'  # NUNCA EXPIRA
)

await trigger_klaviyo_sync(client_id)
```

---

## FRONTEND — Formulario de Onboarding

```
Camila implementa:

PANTALLA 1: Formulario
- 3 secciones colapsables (Shopify / Meta / Klaviyo)
- Cada una: email + password
- Shopify: + campo "tu-tienda.myshopify.com"
- Botón grande: "Conectar todo"
- Texto: "Tus credenciales se usan una vez y se borran inmediatamente"
- El merchant puede conectar 1, 2 o las 3. No es obligatorio todas.

PANTALLA 2: Progreso
- 3 barras de progreso animadas
- Step actual por plataforma ("Iniciando sesión...", "Configurando...", "Listo ✓")
- Si el bot necesita 2FA → aparece campo de código dinámicamente
- Si hay varios ad accounts → aparece selector dropdown
- Loading states suaves, sin jerga técnica

PANTALLA 3: Resultado
- ✓ verde por plataforma conectada
- Info: "247 productos sincronizados" / "3 campañas importadas" / "12 listas"
- ✗ rojo con mensaje humano si falló
- Botón: "Ir al dashboard"

COMUNICACIÓN:
- POST /api/onboarding/start → retorna job_id
- GET /api/onboarding/status/:jobId → polling cada 2s
- POST /api/onboarding/submit-2fa → cuando merchant pone código
- POST /api/onboarding/select-account → cuando merchant elige ad account

DISEÑO:
- Inter font, colores Steve Ads
- CERO jerga técnica visible
- El merchant NUNCA ve un browser ni sabe que existe automatización
```

---

## BACKEND — Endpoints

```python
# POST /api/onboarding/start
async def start_onboarding(request):
    body = await request.json()
    job = create_job(body['client_id'])

    # Desencriptar credenciales (vienen encriptadas del frontend)
    creds = decrypt_credentials(body)

    # Ejecutar en background (secuencial: Shopify → Meta → Klaviyo)
    asyncio.create_task(run_onboarding(job.id, creds))

    return {"job_id": job.id}

# GET /api/onboarding/status/:jobId
async def get_status(request):
    job = get_job(request.params['jobId'])
    return {
        "status": job.status,
        "platforms": job.platforms,
        "pending_input": job.pending_input  # 2FA o account selection
    }

# POST /api/onboarding/submit-2fa
async def submit_2fa(request):
    body = await request.json()
    submit_input(body['job_id'], body['code'])
    return {"ok": True}

# POST /api/onboarding/select-account
async def select_account(request):
    body = await request.json()
    submit_input(body['job_id'], body['account_id'])
    return {"ok": True}
```

---

## SEGURIDAD DE CREDENCIALES

```
1. Frontend encripta con AES-256-GCM antes de enviar
2. Backend desencripta en memoria
3. Se pasan a Skyvern
4. Cuando el bot termina (éxito o error) → se borran de memoria
5. NUNCA se guardan en disco, DB, logs, screenshots, ni ningún lado
6. Si el server crashea → se pierden (bien, el merchant las pone de nuevo)
7. Solo quedan los TOKENS resultantes (encriptados en platform_connections)
```

---

# ═══════════════════════════════════════════
# MÓDULO 2: DETECTIVE VISUAL
# ═══════════════════════════════════════════

## Qué hace
Cada 2 horas: abre Steve Ads en un tab, abre Meta/Klaviyo/Shopify en otro tab. Screenshot de ambos. Compara lo que SE VE en cada pantalla.

## Flujos

### 2A. META — Campañas (pantalla vs pantalla)

```python
# Tab 1: Steve Ads
await steve_page.goto("https://app.steveads.com/meta/campaigns")
steve_screenshot = await steve_page.screenshot()

# Tab 2: Meta Ads Manager real
await meta_page.goto(f"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act={ad_account_id}")
meta_screenshot = await meta_page.screenshot()

# Extraer datos de ambas pantallas
steve_data = await extract_with_vision(steve_screenshot, """
    Extract all visible campaign data: name, status, budget, spend, results, ROAS, CPA.
    Return as JSON. Only what you SEE, don't invent.
""")

meta_data = await extract_with_vision(meta_screenshot, """
    Extract all visible campaign data: name, delivery status, budget, amount spent, results, ROAS.
    Return as JSON. Only what you SEE, don't invent.
""")

# Comparar
mismatches = compare_campaign_data(steve_data, meta_data, tolerances={
    'spend': 0.05,       # 5%
    'roas': 0.10,        # 10%
    'cpa': 0.10,         # 10%
    'conversions': 0.05, # 5%
    'budget': 0.0,       # exacto
    'status': 'exact',   # exacto
})

if mismatches:
    await report_mismatches('visual-meta-campaigns', mismatches)
```

### 2B. SHOPIFY — Productos (precios son críticos)

```python
# Steve: catálogo de productos
await steve_page.goto("https://app.steveads.com/products")
steve_screenshot = await steve_page.screenshot()

# Shopify Admin: Products
await shopify_page.goto(f"https://admin.shopify.com/store/{shop}/products")
shopify_screenshot = await shopify_page.screenshot()

# Comparar: conteo, nombres, PRECIOS (crítico), stock, status
# Si un ad muestra $19.990 pero Shopify tiene $24.990 → CRITICAL
```

### 2C. KLAVIYO — Emails

```python
# Steve: lista de emails
await steve_page.goto("https://app.steveads.com/emails")
steve_screenshot = await steve_page.screenshot()

# Klaviyo: Campaigns
await klaviyo_page.goto("https://www.klaviyo.com/campaigns")
klaviyo_screenshot = await klaviyo_page.screenshot()

# Comparar: nombre, status, subject, métricas post-envío
```

### 2D. MÉTRICAS — Dashboard Steve vs cada plataforma

```python
# Steve dashboard vs Shopify Analytics (ventas)
# Steve Meta metrics vs Meta Ads Manager (spend, ROAS)
# Steve Klaviyo metrics vs Klaviyo dashboard (open rate, clicks)
```

---

## Login para Detective Visual

Skyvern mantiene sesiones con Route Memorization:
- Primera vez: login completo con IA (lento)
- Después: ruta compilada + cookies persistentes (rápido)
- Si cookies mueren: re-login automático con IA

Para Steve Ads: login directo con cuenta QA (qa-bot@steveads.com)
Para las plataformas: usa los TOKENS obtenidos en onboarding cuando sea posible vía API.
Si necesita browser (para verificar UI): login con cuenta de prueba dedicada.

---

# ═══════════════════════════════════════════
# MÓDULO 3: DETECTIVE API
# ═══════════════════════════════════════════

## Qué hace
Cada 30 min: compara datos de Supabase vs APIs reales. NO necesita browser — solo HTTP.

## Esto NO usa Skyvern
Es código puro TypeScript que corre en Cloud Run. Sin browser, sin IA.

```typescript
// 7 módulos de verificación API-a-API:

// 1. meta-campaigns: campaña existe en Meta con config correcta
// 2. meta-audiences: audiencias existen con tamaño correcto
// 3. meta-metrics: spend/ROAS/CPA coinciden (tolerancia 5-10%)
// 4. klaviyo-emails: drafts existen, subject coincide, productos tienen stock
// 5. shopify-products: conteo, precios, stock, status
// 6. shopify-orders: métricas de ventas coinciden
// 7. tokens-health: todos los tokens siguen vivos (cada 15 min)

// Si mismatch → INSERT detective_log + CREATE task al agente responsable
// Si ≥3 CRITICAL → WhatsApp a JM
```

(El detalle completo del Detective API ya está en BOT-DETECTIVE-VERIFICADOR.md)

---

# ═══════════════════════════════════════════
# MÓDULO 4: QA AUTOMÁTICO
# ═══════════════════════════════════════════

## Qué hace
Diario (6am Chile) + bajo demanda: testea flujos completos de Steve Ads como un merchant real.

```python
# QA corre los 7 flujos del wizard de Meta:

# F1: OAuth/Conexión
await page.agent.run_task(
    "Go to Steve Ads Meta module. Verify the connection status is shown. "
    "If disconnected, verify the connect button is visible and clear."
)

# F2: Crear campaña completa
await page.agent.run_task(
    "Navigate to Meta campaigns in Steve Ads. "
    "Click create new campaign. "
    "Verify you can select ABO or CBO. "
    "Verify budget field works. "
    "Verify you can create ad sets and ads. "
    "Do NOT actually submit to Meta. Just verify the UI works."
)

# F3: Audiencias
await page.agent.run_task(
    "Navigate to audiences section. "
    "Verify audience list loads. "
    "Verify you can create a new custom audience."
)

# F4: Generación de copy con IA
await page.agent.run_task(
    "Navigate to ad creation. "
    "Try generating copy with AI. "
    "Verify copies are generated and are editable. "
    "Verify there are multiple variants."
)

# F5: Ads Library
await page.agent.run_task(
    "Navigate to competitor intelligence / Ads Library section. "
    "Search for a competitor. "
    "Verify results load with ad creatives visible."
)

# F6: Métricas
await page.agent.run_task(
    "Navigate to Meta analytics/metrics dashboard. "
    "Verify metrics load: spend, ROAS, CPA, CTR. "
    "Verify date range selector works."
)

# F7: UX general
await page.agent.run_task(
    "Navigate through all sections of the Meta wizard. "
    "Check for: broken images, loading errors, text that says 'undefined' or 'null', "
    "buttons that don't respond, pages that show 500 errors. "
    "Report any visual issues found."
)
```

### Reporte de QA

```python
# Después de cada run, Skyvern genera un reporte con:
# - Screenshots de cada paso
# - Pasos que pasaron / fallaron
# - Descripción de errores encontrados
# - Severity: CRITICAL / MAJOR / MINOR / UX

# Guardar en Supabase
await supabase.from('qa_log').insert({
    'run_id': f"qa-auto-{date}",
    'module': 'meta-wizard',
    'score': passed / total * 100,
    'bugs': json.dumps(bugs_found),
    'screenshots': screenshot_urls
})

# Si hay CRITICAL → task automática + WA
```

---

# ═══════════════════════════════════════════
# SCHEDULERS (cron en la VM)
# ═══════════════════════════════════════════

```bash
# Onboarding: triggered por API (no necesita cron)

# Detective Visual: cada 2 horas horario laboral Chile
0 8,10,12,14,16,18,20 * * * cd ~/steve/skyvern-jobs && python detective_visual.py >> logs/visual.log 2>&1

# Detective API: cada 30 minutos (HTTP puro, sin browser)
*/30 * * * * cd ~/steve/skyvern-jobs && npx ts-node detective_api.ts >> logs/api.log 2>&1

# Tokens health: cada 15 minutos
*/15 * * * * cd ~/steve/skyvern-jobs && npx ts-node tokens_health.ts >> logs/tokens.log 2>&1

# QA Automático: 6am Chile todos los días
0 6 * * * cd ~/steve/skyvern-jobs && python qa_daily.py >> logs/qa.log 2>&1

# Sesiones refresh: cada hora
0 * * * * cd ~/steve/skyvern-jobs && python refresh_sessions.py >> logs/sessions.log 2>&1
```

---

# ═══════════════════════════════════════════
# REPORTER UNIFICADO
# ═══════════════════════════════════════════

## Tablas Supabase

```sql
-- Log unificado de todos los módulos
CREATE TABLE detective_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id TEXT NOT NULL,
  source TEXT NOT NULL,          -- 'visual' | 'api' | 'qa' | 'onboarding'
  module TEXT NOT NULL,          -- 'meta-campaigns' | 'shopify-products' | etc
  client_id UUID REFERENCES clients(id),
  check_type TEXT NOT NULL,
  status TEXT NOT NULL,          -- 'PASS' | 'MISMATCH' | 'MISSING' | 'ERROR'
  severity TEXT NOT NULL,        -- 'CRITICAL' | 'MAJOR' | 'MINOR'
  steve_value JSONB,
  real_value JSONB,
  mismatched_fields TEXT[],
  details TEXT,
  screenshot_url TEXT,           -- Para detective visual y QA
  steve_record_id TEXT,
  external_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Runs (resumen por ejecución)
CREATE TABLE detective_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id TEXT UNIQUE NOT NULL,
  source TEXT NOT NULL,
  total_checks INTEGER,
  passed INTEGER,
  mismatches INTEGER,
  critical INTEGER,
  score INTEGER,
  by_module JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Onboarding jobs (estado temporal en memoria, respaldo en DB)
CREATE TABLE onboarding_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id),
  status TEXT NOT NULL,          -- 'running' | 'completed' | 'failed'
  shopify_status TEXT DEFAULT 'pending',
  meta_status TEXT DEFAULT 'pending',
  klaviyo_status TEXT DEFAULT 'pending',
  shopify_step TEXT,
  meta_step TEXT,
  klaviyo_step TEXT,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
```

## Alertas WhatsApp

```python
async def alert_if_critical(run_results):
    criticals = [r for r in run_results if r['severity'] == 'CRITICAL']

    if len(criticals) >= 2:
        msg = f"🚨 DETECTIVE: {len(criticals)} problemas CRÍTICOS\n\n"
        for c in criticals[:5]:
            msg += f"• [{c['module']}] {c['details']}\n"
        msg += f"\nTasks creadas automáticamente."

        await send_whatsapp(msg)  # Via Claudio

    # Crear tasks automáticas
    AGENT_MAP = {
        'meta-campaigns': 'W2',     # Felipe
        'meta-audiences': 'W2',
        'meta-metrics': 'W17',      # Ignacio
        'klaviyo-emails': 'W1',     # Valentina
        'shopify-products': 'W13',  # Matías
        'shopify-orders': 'W13',
        'tokens-health': 'W5',      # Sebastián
        'visual-meta': 'W2+W4',     # Felipe + Camila
        'visual-shopify': 'W13+W4',
        'visual-klaviyo': 'W1+W4',
        'qa-meta-wizard': 'W2',
        'qa-steve-chat': 'W19',     # Paula
    }

    for c in criticals:
        await create_task(
            title=f"[DETECTIVE] {c['severity']}: {c['details'][:80]}",
            assigned_to=AGENT_MAP.get(c['module'], 'W5'),
            priority='urgent' if c['severity'] == 'CRITICAL' else 'high',
            source=c['source']
        )
```

---

# ═══════════════════════════════════════════
# COSTOS MENSUALES TOTALES
# ═══════════════════════════════════════════

```
Skyvern self-hosted:                    $0 (open source, corre en la VM)

LLM tokens (Claude + GPT-4o):
  Onboarding: ~5 merchants/día × $0.50  = ~$75/mes
  Detective Visual: 8 runs/día × $0.80  = ~$192/mes
  QA diario: 1 run/día × $1.00          = ~$30/mes
  Self-healing (cuando UI cambia):       = ~$10/mes

VM extra RAM/CPU para Skyvern Docker:    ~$20-30/mes (ya tienes la VM)

Detective API (HTTP puro, sin LLM):      $0

TOTAL ESTIMADO:                          ~$300-330/mes
```

---

# ═══════════════════════════════════════════
# PRIORIDAD DE IMPLEMENTACIÓN
# ═══════════════════════════════════════════

```
SEMANA 1: Setup + Klaviyo (proof of concept)
  1. Instalar Skyvern Docker en la VM
  2. Crear cuentas sandbox (Shopify dev store, Meta BM, Klaviyo free)
  3. Escribir bot Klaviyo (el más simple)
  4. Probar end-to-end: login → API key → guardado
  5. Frontend básico: formulario solo para Klaviyo
  6. Probar con cuenta real de Klaviyo (Jardín de Eva o Badim)

SEMANA 2: Shopify
  7. Escribir bot Shopify (create app → scopes → install → token)
  8. Probar en dev store hasta que sea 100% confiable
  9. Agregar sección Shopify al formulario + 2FA dinámico
  10. Probar con tienda real de prueba

SEMANA 3: Meta + Detective API
  11. Escribir bot Meta (login → BM → System User → token)
  12. Probar en BM de prueba hasta que sea 100%
  13. Agregar sección Meta al formulario + selector ad account
  14. Implementar Detective API (HTTP puro, sin Skyvern)
  15. Cron cada 30 min + tokens health cada 15 min

SEMANA 4: Detective Visual + QA
  16. Implementar Detective Visual con Skyvern
  17. Screenshots Steve vs Meta/Klaviyo/Shopify
  18. Comparación con Vision LLM
  19. Implementar QA automático diario
  20. Dashboard para ver resultados de todos los detectivos

SEMANA 5: Integración completa
  21. Formulario unificado de onboarding (3 plataformas)
  22. Job manager con polling de estado
  23. Alertas WhatsApp unificadas
  24. Test con merchant real (Jardín de Eva)
  25. Ajustes y hardening
```

---

# ═══════════════════════════════════════════
# RESTRICCIONES INQUEBRANTABLES
# ═══════════════════════════════════════════

1. **Credenciales NUNCA se guardan.** Memoria → uso → borrar. Si el server crashea, se pierden.
2. **Credenciales NUNCA se loguean.** Ni console.log, ni Sentry, ni screenshots, ni DB.
3. **Timing humano.** Delays aleatorios en todas las interacciones. Sin esto → ban.
4. **Máximo 2 reintentos de login.** Si falla 2 veces → parar → error al merchant.
5. **El merchant NUNCA ve un browser.** Solo barra de progreso y "Conectado ✓".
6. **Este código es confidencial.** No repos públicos, no docs de usuario, no marketing.
7. **READ-ONLY para detective/QA.** Nunca crear, editar, eliminar en plataformas reales.
8. **Onboarding es WRITE** pero solo crea: app de Shopify, System User de Meta, nada más.
9. **Screenshots con datos reales → storage privado.** Auto-eliminar 7 días.
10. **Si Skyvern no puede resolver algo → PARAR y alertar.** No improvisar.
