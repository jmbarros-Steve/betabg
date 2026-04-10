# Solicitud Developer Token — Google Ads API
## Documento preparado para llenar el formulario en https://ads.google.com/aw/apicenter

---

## 1. DATOS DE LA EMPRESA

| Campo | Valor |
|-------|-------|
| **Company Name** | Steve - AI Performance Agency (BG Consult SpA) |
| **Company URL** | https://betabgnuevosupa.vercel.app |
| **API Contact Email** | jmbarros@bgconsult.cl |
| **Manager Account (MCC)** | *(crear si no existe — será la cuenta paraguas de Steve)* |
| **Access Level Solicitado** | **Basic Access** (15,000 ops/día, test + producción) |

---

## 2. DESCRIPCIÓN DEL PRODUCTO (para el formulario)

### Versión corta (para el campo del formulario — ~5 oraciones)

> **Steve** is an AI-powered marketing management platform for agencies and e-commerce brands in Latin America. We use the Google Ads API to:
>
> 1. **Read campaign performance metrics** (impressions, clicks, spend, conversions, ROAS, CPA, CTR) via GAQL queries through the `searchStream` endpoint, syncing data every 6 hours to provide unified cross-platform analytics dashboards alongside Meta Ads data.
>
> 2. **List and manage account connections** via `customers:listAccessibleCustomers` and `customers/{id}` endpoints, supporting MCC (Manager Account) hierarchies so agencies can connect multiple client ad accounts through a single authorization flow.
>
> 3. **Generate AI-optimized ad copy** for Google Ads campaigns (Search RSA, Display, Performance Max, Remarketing) using performance data from the API to inform content creation with character-limit compliance (30-char headlines, 90-char descriptions).
>
> We operate as a multi-tenant SaaS where each authenticated merchant connects their own Google Ads account via OAuth 2.0. All tokens are encrypted at rest with AES-256. We do NOT use the API for app conversion tracking, customer match, or remarketing list management — only for analytics, reporting, and campaign management on behalf of authenticated users.

---

## 3. DETALLE TÉCNICO COMPLETO (respaldo si Google pide más info)

### 3.1 Qué es Steve

Steve es una plataforma SaaS de marketing AI para agencias y marcas e-commerce en Latinoamérica. Centraliza la gestión de campañas publicitarias de múltiples plataformas (Meta Ads, Google Ads, Klaviyo, Shopify) en un solo dashboard con inteligencia artificial.

**Usuarios objetivo:**
- Agencias de marketing digital que manejan múltiples clientes
- Marcas e-commerce (Shopify) que quieren optimizar su inversión publicitaria
- Equipos de marketing internos que necesitan reportería cross-platform

**Mercado:** Chile y Latinoamérica (moneda principal: CLP)

### 3.2 Para qué usamos Google Ads API — 3 funcionalidades

#### A. Sincronización de métricas (READ-ONLY)

**Endpoint:** `googleads.googleapis.com/v18/customers/{id}/googleAds:searchStream`
**Método:** POST con GAQL query
**Frecuencia:** Cada 6 horas via cron job automatizado

**Query GAQL que ejecutamos:**
```sql
SELECT
  segments.date,
  metrics.impressions,
  metrics.clicks,
  metrics.cost_micros,
  metrics.conversions,
  metrics.conversions_value,
  metrics.average_cpc,
  metrics.ctr,
  metrics.cost_per_conversion
FROM customer
WHERE segments.date BETWEEN '{startDate}' AND '{endDate}'
ORDER BY segments.date DESC
```

**Ventana:** Últimos 30 días, rolling window.

**Métricas que extraemos:**
| Métrica | Uso en la plataforma |
|---------|---------------------|
| `impressions` | Dashboard de alcance, comparativa vs Meta |
| `clicks` | Dashboard de engagement |
| `cost_micros` | Gasto total convertido a CLP, cálculo de ROI |
| `conversions` | KPI principal de performance |
| `conversions_value` | Cálculo de ROAS (Return on Ad Spend) |
| `average_cpc` | Benchmark de eficiencia, alerta si sube >20% |
| `ctr` | Indicador de relevancia del anuncio |
| `cost_per_conversion` | CPA real, comparativa cross-platform |

**Qué hacemos con los datos:**
- Dashboard unificado Google Ads + Meta Ads en un solo lugar
- Comparativa cross-platform: ROAS Google vs ROAS Meta
- Alertas automáticas cuando métricas bajan (CTR drop, CPA spike)
- Reportes para clientes de la agencia
- Conversión automática de moneda a CLP (Chilean Peso)

#### B. Gestión de conexiones y cuentas (READ-ONLY)

**Endpoints:**
- `customers:listAccessibleCustomers` — listar cuentas accesibles
- `customers/{customerId}` — obtener detalles de cuenta (nombre, moneda, timezone)

**Uso:**
- Durante el flujo OAuth, descubrir qué cuentas de Google Ads tiene el merchant
- Soporte para MCC (Manager Account) — el merchant puede tener sub-cuentas
- Almacenar `customer_id` para llamadas futuras de métricas
- Detectar automáticamente la moneda de la cuenta para conversión a CLP

#### C. Generación de copy con IA (NO usa API de Google Ads directamente)

**Nota:** Esta funcionalidad usa Claude AI (Anthropic) para generar textos publicitarios optimizados para Google Ads. NO llama a la API de Google Ads — pero usa los datos de métricas (obtenidos vía API) para informar la generación.

**Tipos de campaña soportados:**
| Tipo | Formato de salida |
|------|------------------|
| **Search (RSA)** | 15 headlines (30 chars), 3 long headlines (90 chars), 4 descriptions (90 chars), sitelinks |
| **Display (GDN)** | Headlines + descriptions optimizados para awareness |
| **Performance Max** | Set variado para optimización algorítmica de Google |
| **Remarketing** | Copy enfocado en reconexión con visitantes previos |

**Cómo usa los datos de la API:**
- Lee métricas históricas para entender qué ángulos performan mejor
- Ajusta el copy según CTR y ROAS históricos del cliente
- Evita repetir ángulos con bajo performance score

### 3.3 Operaciones de escritura FUTURAS (roadmap)

**No implementadas actualmente, pero planificadas:**
- Crear campañas (`googleAds:mutate` con `CampaignOperation`)
- Pausar/activar campañas (cambio de `campaign.status`)
- Modificar presupuestos (`campaign_budget`)
- Gestión de keywords (agregar, pausar, cambiar match type)
- Gestión de bidding strategies (Target ROAS, Maximize Conversions)

**Estas operaciones requerirían upgrade a Standard Access en el futuro.**

### 3.4 Arquitectura de seguridad

| Aspecto | Implementación |
|---------|---------------|
| **Autenticación** | OAuth 2.0 Authorization Code Grant (offline access) |
| **Token storage** | AES-256 encryption at rest via PostgreSQL pgcrypto |
| **Token refresh** | Automático antes de cada llamada API (tokens expiran en 1 hora) |
| **CSRF** | State parameter validation en OAuth callback |
| **Multi-tenant isolation** | Row Level Security (RLS) en PostgreSQL — cada merchant solo ve sus datos |
| **API keys** | Server-side only — nunca expuestos al frontend |
| **Cron auth** | Secret header (`X-Cron-Secret`) para jobs automatizados |
| **Data retention** | 30 días rolling window de métricas |

### 3.5 Modelo de acceso: MCC (Manager Account)

**Modelo propuesto:**
- Steve opera un **MCC (Manager Account)** central
- Los merchants conectan sus cuentas de Google Ads al MCC de Steve via Leadsie (SaaS de onboarding)
- Un solo set de OAuth credentials del MCC sirve para todos los merchants
- Cada llamada API incluye el `customer-id` del merchant específico en el header `login-customer-id`
- **Zero cross-contamination:** cada merchant solo accede a sus propios datos via scoping por `customer_id`

**Equivalencia:**
- Es el mismo modelo que Google recomienda para agencias ("Agency access via MCC")
- El merchant puede revocar acceso en cualquier momento desde su panel de Google Ads

### 3.6 Compliance

| Requisito | Cumplimiento |
|-----------|-------------|
| No usamos para App Conversion Tracking | ✅ |
| No usamos para Remarketing List Management | ✅ |
| No usamos para Customer Match (PII) | ✅ |
| Usuarios pueden desconectar en cualquier momento | ✅ |
| No compartimos datos con terceros | ✅ |
| Tokens encriptados at rest | ✅ AES-256 |
| OAuth 2.0 estándar | ✅ |
| HTTPS only | ✅ |
| GDPR/privacy compliant | ✅ |

---

## 4. POR QUÉ BASIC ACCESS (no Explorer)

| Criterio | Explorer | Basic | Nuestra necesidad |
|----------|----------|-------|-------------------|
| Ops/día producción | 2,880 | 15,000 | ~5,000-10,000 (múltiples merchants × 4 syncs/día) |
| Test accounts | 15,000 | 15,000 | OK |
| Campaign management | ✅ | ✅ | Necesitamos |
| Reporting | ✅ | ✅ | Necesitamos |
| Keyword research | ❌ | ✅ | Planificado |

**Justificación:** Como plataforma multi-tenant (agencia con múltiples clientes), cada sync de métricas ejecuta queries por cada merchant conectado. Con 20+ merchants haciendo sync 4 veces al día, fácilmente superamos el límite de 2,880 ops/día de Explorer. Basic Access nos da margen para crecer.

---

## 5. STACK TÉCNICO (si Google pregunta)

| Componente | Tecnología |
|-----------|-----------|
| Frontend | React + TypeScript + Vite (Vercel) |
| Backend API | Hono + Node.js en Google Cloud Run |
| Edge Functions | Deno (Supabase) |
| Base de datos | PostgreSQL (Supabase) con RLS |
| Encriptación | pgcrypto (AES-256) |
| Auth | Supabase Auth + JWT |
| AI | Claude Sonnet 4.6 (Anthropic API) |
| Google API | Google Ads API v18, OAuth 2.0 |
| Hosting | Google Cloud Run (us-central1) + Vercel |
| Proyecto GCP | steveapp-agency |

---

## 6. CHECKLIST ANTES DE APLICAR

- [ ] Crear MCC (Manager Account) de Steve en ads.google.com/home/tools/manager-accounts/
- [ ] Ir a https://ads.google.com/aw/apicenter en el MCC
- [ ] Llenar formulario con datos de sección 1 y 2
- [ ] Verificar que https://betabgnuevosupa.vercel.app esté online y funcional
- [ ] Aceptar Terms and Conditions
- [ ] Esperar aprobación (Explorer: automático, Basic: ~2 días)
- [ ] Post-aprobación: copiar Developer Token del API Center
- [ ] Setear en Cloud Run: `GOOGLE_ADS_DEVELOPER_TOKEN`
- [ ] Crear OAuth credentials en Google Cloud Console (proyecto steveapp-agency)
- [ ] Habilitar Google Ads API en el proyecto GCP
- [ ] Setear en Cloud Run: `GOOGLE_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`
- [ ] Configurar Leadsie Connect Profile con MCC de Steve para Google Ads
- [ ] Test E2E: conectar cuenta → sync métricas → verificar dashboard
