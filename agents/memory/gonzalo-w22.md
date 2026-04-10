# Gonzalo W22 — Journal

## 2026-04-10: Creación del Agente

### Decisiones
- **Gonzalo W22** creado como Revenue Manager / CRO, dueño exclusivo de los planes de venta de Steve Ads
- Squad: Ventas (junto a Paula W19 e Ignacio W17)
- Scope claro: Paula VENDE, Gonzalo DEFINE QUÉ se vende y a qué precio, Ignacio MIDE el resultado

### Descubrimientos (día 0)
- **Stripe YA está integrado** — 3 edge functions funcionales (checkout, webhook, portal) con API v2024-06-20
- **BillingPanel.tsx ya existe** (192 líneas) con botones de checkout y portal
- **PlanGate.tsx y UpgradeOverlay.tsx ya existen** — paywalls básicos funcionales
- **merchant-upsell cron ya existe** y corre domingos — analiza revenue + conexiones → WA personalizado con Haiku
- **client_credits y credit_transactions son LEGACY** — reemplazadas por wa_credits/wa_credit_transactions
- **invoices table existe pero nadie la usa** — evaluar si deprecar o activar
- **Trigger handle_new_user_with_plan** auto-asigna plan Visual a nuevos usuarios — riesgo de duplicación
- **80+ features mapeadas en FEATURE_ACCESS** — 15 módulos en COMPARATIVA
- **STRIPE_PRICE_* env vars** NO están documentadas en el deploy checklist de Cloud Run (viven en Supabase edge functions)

### Arquitectura encontrada
```
BillingPanel.tsx → POST /stripe-checkout (edge function)
                → Stripe hosted checkout
                → stripe-webhook → user_subscriptions UPDATE
                → useUserPlan.tsx re-fetch → PlanGate/UpgradeOverlay react

merchant-upsell (Dom) → analiza clients → WA con Haiku → merchant_upsell_opportunities
onboarding-wa (4h) → merchant_onboarding steps → WA reminders (máx 3)
```

### Pendiente verificar
- ¿STRIPE_SECRET_KEY está seteada en Supabase secrets?
- ¿Hay clientes reales pagando?
- ¿PlanGate.tsx está wrapping todas las secciones correctas?
- ¿Feature matrix refleja features nuevas post-creación?
