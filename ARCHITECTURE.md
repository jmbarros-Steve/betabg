# Steve Platform — Arquitectura Completa

> Documento generado: 15 de marzo de 2026
> Super admin: jmbarros@bgconsult.cl
> Base de datos: Supabase (ref: zpswjccsxjtnhetkkqde)

---

## Tabla de Contenidos

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Estructura del Proyecto](#2-estructura-del-proyecto)
3. [Stack Tecnológico](#3-stack-tecnológico)
4. [Base de Datos](#4-base-de-datos)
5. [API Backend (Cloud Run)](#5-api-backend-cloud-run)
6. [Edge Functions (Supabase)](#6-edge-functions-supabase)
7. [Frontend](#7-frontend)
8. [Integraciones](#8-integraciones)
9. [Autenticación y Seguridad](#9-autenticación-y-seguridad)
10. [Deploy](#10-deploy)
11. [Dependencias](#11-dependencias)

---

## 1. Resumen Ejecutivo

**Steve** es una plataforma SaaS de automatización de marketing impulsada por IA, diseñada para ecommerce (Shopify). Integra Meta Ads, Google Ads, Klaviyo y Shopify en un solo portal. Incluye un sistema propio de email marketing (Steve Mail), generación de copys con IA, análisis de competencia, y métricas financieras.

**Arquitectura general:**

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (Vercel)                         │
│              React + TypeScript + Vite + Tailwind            │
│                  Auto-deploy al push a main                  │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS + JWT
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   BACKEND (Cloud Run)                        │
│              Hono + Node.js + TypeScript                      │
│           steve-api, us-central1, Puerto 8080                │
└──────┬───────────────┬───────────────┬──────────────────────┘
       │               │               │
       ▼               ▼               ▼
┌────────────┐  ┌────────────┐  ┌──────────────────┐
│  Supabase  │  │ APIs Ext.  │  │ Google Cloud      │
│  PostgreSQL│  │ Meta,Google│  │ Tasks (colas)     │
│  Auth,RLS  │  │ Shopify    │  │ Storage           │
│  Storage   │  │ Klaviyo    │  │                    │
│  Edge Fns  │  │ Anthropic  │  │                    │
└────────────┘  └────────────┘  └──────────────────┘
```

---

## 2. Estructura del Proyecto

```
~/steve/
├── CLAUDE.md                          # Instrucciones para agentes IA
├── ARCHITECTURE.md                    # Este documento
├── package.json                       # Dependencias frontend
├── index.html                         # Entry point HTML
├── vite.config.ts                     # Configuración Vite (puerto 8080, alias @/)
├── tsconfig.json                      # TypeScript base (paths: @/* → ./src/*)
├── tsconfig.app.json                  # TS frontend (ES2020, react-jsx)
├── tsconfig.node.json                 # TS build tools (ES2022, strict)
├── tailwind.config.ts                 # Tailwind (dark mode, HSL variables, animaciones)
├── postcss.config.js                  # PostCSS + autoprefixer
├── eslint.config.js                   # ESLint
├── vitest.config.ts                   # Unit tests
├── playwright.config.ts              # E2E tests
├── vercel.json                        # SPA rewrites para React Router
├── components.json                    # Registro shadcn/ui
│
├── src/                               # ===== FRONTEND =====
│   ├── main.tsx                       # React root render
│   ├── App.tsx                        # Router + Providers (QueryClient, Auth, Tooltip)
│   ├── index.css                      # Estilos globales
│   ├── lib/
│   │   ├── api.ts                     # callApi() — cliente API unificado
│   │   ├── utils.ts                   # cn() (clsx + tailwind-merge)
│   │   ├── password-validation.ts     # Validación de contraseñas
│   │   └── pdf-font.ts               # Fuentes para PDF
│   ├── hooks/
│   │   ├── useAuth.tsx                # Contexto de autenticación
│   │   ├── useUserRole.tsx            # Roles (admin/client/super_admin)
│   │   ├── useSecurityContext.tsx      # Contexto de seguridad multi-tenant
│   │   ├── useMetaScopes.tsx          # Verificación scopes Meta
│   │   ├── useBriefContext.tsx        # Estado del brief de marca
│   │   ├── useShopifyAuthFetch.tsx    # Fetch autenticado Shopify
│   │   ├── useShopifyPreviewProducts.tsx
│   │   ├── useReveal.ts              # Mostrar/ocultar contraseñas
│   │   ├── use-mobile.tsx            # Detección dispositivo móvil
│   │   └── use-toast.ts              # Notificaciones toast
│   ├── pages/                         # 23 páginas (ver sección Frontend)
│   ├── components/                    # 221+ componentes (ver sección Frontend)
│   ├── integrations/
│   │   ├── supabase/                  # AUTO-GENERADO, NO MODIFICAR
│   │   │   ├── client.ts             # Singleton Supabase
│   │   │   └── types.ts              # Tipos generados de la BD
│   │   └── lovable/                   # SDK Lovable
│   └── assets/fonts/                  # Fuentes custom
│
├── cloud-run-api/                     # ===== BACKEND =====
│   ├── package.json                   # Deps: hono, supabase, resend, cloud-tasks
│   ├── tsconfig.json                  # ES2022, strict, output ./dist
│   ├── Dockerfile                     # Multi-stage Node 20
│   ├── cloudbuild.yaml                # Cloud Build config
│   ├── src/
│   │   ├── index.ts                   # Entry: Hono app, CORS, error handler, port 8080
│   │   ├── middleware/
│   │   │   ├── auth.ts                # JWT middleware
│   │   │   ├── cors.ts                # CORS policy
│   │   │   ├── error-handler.ts       # Error handler global
│   │   │   └── shopify-hmac.ts        # Verificación HMAC Shopify
│   │   ├── routes/                    # 90+ endpoints (ver sección API)
│   │   │   └── index.ts              # Registro de rutas en 5 fases
│   │   └── lib/
│   │       ├── supabase.ts            # Cliente Supabase (service role)
│   │       ├── meta-fetch.ts          # Wrapper Meta Graph API
│   │       ├── template-engine.ts     # Motor Nunjucks para emails
│   │       └── email-html-processor.ts # Procesamiento HTML email
│
├── supabase/                          # ===== BASE DE DATOS =====
│   ├── config.toml                    # Config proyecto (verify_jwt = false en la mayoría)
│   ├── migrations/                    # 68 archivos de migración SQL
│   └── functions/                     # 70 Edge Functions (Deno)
│       ├── _shared/                   # Utilidades compartidas
│       └── {function-name}/index.ts   # Una función por directorio
│
├── e2e/                               # Tests E2E (Playwright)
├── docs/                              # Documentación adicional
└── public/                            # Assets estáticos (favicon, robots.txt, logos)
```

---

## 3. Stack Tecnológico

### Frontend
| Tecnología | Versión | Uso |
|------------|---------|-----|
| React | 18.3.1 | UI framework |
| TypeScript | 5.8.3 | Tipado estático |
| Vite | 5.4.19 | Build tool + HMR |
| React Router | 6.30.1 | Routing SPA |
| TanStack React Query | 5.83.0 | Server state management |
| Tailwind CSS | 3.4.17 | Estilos utilitarios |
| Radix UI | 25+ paquetes | Componentes accesibles (shadcn) |
| Framer Motion | 12.27.3 | Animaciones |
| GrapeJS | 0.22.14 | Editor visual de emails |
| Recharts | 2.15.4 | Gráficos |
| Zod | 3.25.76 | Validación de schemas |
| jsPDF | 4.0.0 | Generación PDF |
| Lucide React | 0.462.0 | Iconos |

### Backend
| Tecnología | Versión | Uso |
|------------|---------|-----|
| Hono | 4.6.0 | Framework HTTP (edge-first) |
| @hono/node-server | 1.13.7 | Servidor Node.js |
| @supabase/supabase-js | 2.90.1 | Cliente BD + Auth |
| @google-cloud/tasks | 6.2.1 | Cola de tareas async |
| Resend | 6.9.3 | Envío de emails |
| Nunjucks | 3.2.4 | Motor de templates |

### Infraestructura
| Servicio | Uso |
|----------|-----|
| Vercel | Hosting frontend (auto-deploy) |
| Google Cloud Run | Backend API (steve-api, us-central1) |
| Supabase | PostgreSQL + Auth + Storage + Edge Functions |
| Google Cloud Tasks | Tareas programadas (emails, A/B tests) |

### APIs Externas
| API | Uso |
|-----|-----|
| Anthropic Claude | Generación de copys, análisis de marca, chat IA |
| Meta Graph API v18-21 | Campañas, audiencias, pixel, social inbox |
| Google Ads API | Métricas de campañas |
| Shopify Admin API | Productos, órdenes, descuentos, webhooks |
| Klaviyo API | Email marketing, flujos, métricas |
| Replicate | Generación de video |
| Firecrawl | Web scraping para análisis de competencia |
| Resend / AWS SES | Envío transaccional de emails |

---

## 4. Base de Datos

### 4.1 Tipos Personalizados

```sql
CREATE TYPE app_role AS ENUM ('admin', 'client');
CREATE TYPE platform_type AS ENUM ('shopify', 'meta', 'google', 'klaviyo');
```

### 4.2 Funciones de Base de Datos

#### Encriptación (pgcrypto)
- `encrypt_platform_token(raw_token TEXT) → TEXT` — AES-256
- `decrypt_platform_token(encrypted_token TEXT) → TEXT` — Desencriptar

#### Roles y Acceso (SECURITY DEFINER)
- `has_role(_user_id UUID, _role app_role) → BOOLEAN`
- `is_super_admin(_user_id UUID) → BOOLEAN`
- `is_shopify_user(_user_id UUID) → BOOLEAN`
- `can_access_shop(_user_id UUID, _shop_domain TEXT) → BOOLEAN`
- `get_user_shop_domain(_user_id UUID) → TEXT`

#### Triggers
- `handle_new_user()` — En INSERT a auth.users: crea registro en clients + asigna rol 'client'
- `update_updated_at_column()` — Actualiza updated_at automáticamente

### 4.3 Tablas Principales

#### **clients** — Entidad base de negocio/cliente
| Columna | Tipo | Notas |
|---------|------|-------|
| id | UUID | PK |
| user_id | UUID | NOT NULL — admin/consultor dueño |
| client_user_id | UUID | FK → auth.users — cuenta propia del cliente |
| name | TEXT | NOT NULL |
| email | TEXT | |
| company | TEXT | |
| hourly_rate | DECIMAL(10,2) | DEFAULT 0 |
| shop_domain | TEXT | Dominio Shopify (aislamiento multi-tenant) |
| logo_url | TEXT | |
| website_url | TEXT | |
| fase_negocio | TEXT | startup, scaling, etc. |
| presupuesto_ads | BIGINT | Presupuesto publicitario |
| brand_identity | JSONB | Colores, fuentes, estética |
| onboarding_step | INTEGER | 1-4, NULL = completado |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**RLS:** Usuarios ven sus propios clientes; super_admins ven todos.

---

#### **user_roles** — Control de acceso basado en roles
| Columna | Tipo | Notas |
|---------|------|-------|
| id | UUID | PK |
| user_id | UUID | FK → auth.users, NOT NULL |
| role | app_role | 'admin' o 'client' |
| is_super_admin | BOOLEAN | DEFAULT FALSE |
| created_at | TIMESTAMPTZ | |

**Unique:** (user_id, role)

---

#### **platform_connections** — Credenciales API de plataformas
| Columna | Tipo | Notas |
|---------|------|-------|
| id | UUID | PK |
| client_id | UUID | FK → clients |
| platform | platform_type | 'shopify', 'meta', 'google', 'klaviyo' |
| store_name | TEXT | Nombre legible |
| store_url | TEXT | URL de la tienda |
| account_id | TEXT | ID de cuenta en la plataforma |
| is_active | BOOLEAN | DEFAULT true |
| last_sync_at | TIMESTAMPTZ | |
| shop_domain | TEXT | Aislamiento multi-tenant |
| access_token_encrypted | TEXT | Token OAuth encriptado (AES-256) |
| refresh_token_encrypted | TEXT | Refresh token encriptado |
| api_key_encrypted | TEXT | API key encriptada (Klaviyo) |
| business_id | TEXT | Meta Business Manager ID |
| portfolio_name | TEXT | Nombre del portafolio Meta |
| page_id | TEXT | Facebook Page ID |
| ig_account_id | TEXT | Instagram Business Account ID |
| pixel_id | TEXT | Meta Pixel ID |
| shopify_client_id | TEXT | OAuth app ID per-client |
| shopify_client_secret_encrypted | TEXT | Secreto OAuth encriptado |
| created_at, updated_at | TIMESTAMPTZ | |

**Unique:** (client_id, platform)

---

#### **platform_metrics** — Métricas diarias por plataforma
| Columna | Tipo | Notas |
|---------|------|-------|
| id | UUID | PK |
| connection_id | UUID | FK → platform_connections |
| metric_date | DATE | |
| metric_type | TEXT | 'revenue', 'orders', 'sessions', 'ad_spend', 'impressions', 'clicks', 'roas' |
| metric_value | NUMERIC | |
| currency | TEXT | DEFAULT 'USD' |
| shop_domain | TEXT | |

**Unique:** (connection_id, metric_date, metric_type)

---

#### **campaign_metrics** — Rendimiento por campaña
| Columna | Tipo | Notas |
|---------|------|-------|
| id | UUID | PK |
| connection_id | UUID | FK → platform_connections |
| campaign_id | TEXT | ID en la plataforma |
| campaign_name | TEXT | |
| platform | TEXT | 'meta' o 'google' |
| metric_date | DATE | |
| impressions, clicks, reach, spend | NUMERIC | |
| conversions, conversion_value | NUMERIC | |
| ctr, cpc, cpm, roas | NUMERIC | |
| campaign_status | TEXT | 'ACTIVE', 'PAUSED', 'ARCHIVED' |
| currency | TEXT | DEFAULT 'USD' |
| shop_domain | TEXT | |

**Unique:** (connection_id, campaign_id, metric_date)

---

#### **adset_metrics** — Métricas a nivel Ad Set (testing 3:2:2)
| Columna | Tipo | Notas |
|---------|------|-------|
| id | UUID | PK |
| connection_id | UUID | FK → platform_connections |
| campaign_id, adset_id | TEXT | |
| campaign_name, adset_name | TEXT | |
| platform | TEXT | DEFAULT 'meta' |
| metric_date | DATE | |
| impressions, clicks | BIGINT | |
| spend, conversions, conversion_value | NUMERIC | |
| ctr, cpc, cpm, roas | NUMERIC | |
| currency | TEXT | DEFAULT 'CLP' |
| shop_domain | TEXT | |

---

#### **campaign_recommendations** — Insights IA por campaña
| Columna | Tipo | Notas |
|---------|------|-------|
| id | UUID | PK |
| campaign_id | TEXT | |
| connection_id | UUID | FK → platform_connections |
| platform | TEXT | 'meta' o 'google' |
| recommendation_type | TEXT | |
| recommendation_text | TEXT | |
| priority | TEXT | 'low', 'medium', 'high', 'critical' |
| is_dismissed | BOOLEAN | DEFAULT false |
| shop_domain | TEXT | |

---

### 4.4 Tablas Financieras

#### **client_financial_config** — Configuración de precios y márgenes
| Columna | Tipo | Notas |
|---------|------|-------|
| client_id | UUID | UNIQUE, FK → clients |
| default_margin_percentage | NUMERIC | DEFAULT 30 |
| use_shopify_costs | BOOLEAN | |
| shopify_plan_cost | NUMERIC | Mensual |
| klaviyo_plan_cost | NUMERIC | Mensual |
| other_fixed_costs | NUMERIC | |
| payment_gateway_commission | NUMERIC | DEFAULT 3.5% |
| shipping_cost_per_order | NUMERIC | |
| shopify_commission_percentage | NUMERIC | |
| manual_google_spend | NUMERIC | |
| product_margins | JSONB | {sku: margin%} |
| fixed_cost_items | JSONB | [{name, amount}] |

#### **time_entries** — Registro de horas facturables
| Columna | Tipo | Notas |
|---------|------|-------|
| client_id | UUID | FK → clients |
| description | TEXT | |
| hours | DECIMAL(5,2) | |
| date | DATE | |
| billed | BOOLEAN | DEFAULT false |

#### **invoices** — Facturación
| Columna | Tipo | Notas |
|---------|------|-------|
| client_id | UUID | FK → clients |
| invoice_number | TEXT | |
| month, year | INTEGER | |
| total_hours | DECIMAL(10,2) | |
| total_amount | DECIMAL(12,2) | |
| status | TEXT | 'draft', 'sent', 'paid' |

---

### 4.5 Tablas de Suscripción y Créditos

#### **subscription_plans** — Planes de Steve
| Plan | Créditos/mes | Precio |
|------|-------------|--------|
| Free | 10 | $0 |
| Starter | 50 | — |
| Pro | 150 | — |
| Agency | Ilimitados | — |

#### **user_subscriptions** — Suscripción activa del usuario
- plan_id (FK → subscription_plans), status, credits_used, credits_reset_at
- stripe_customer_id, stripe_subscription_id (preparado para Stripe)

#### **client_credits** — Sistema legacy de créditos por cliente
- creditos_disponibles (DEFAULT 99999), creditos_usados, plan

#### **credit_transactions** — Log de uso de créditos
- accion, creditos_usados, costo_real_usd

---

### 4.6 Tablas de IA y Contenido

#### **buyer_personas** — Brief de marca
| Columna | Tipo | Notas |
|---------|------|-------|
| client_id | UUID | UNIQUE, FK → clients |
| persona_data | JSONB | Insights de marca |
| is_complete | BOOLEAN | |

#### **steve_conversations** — Historial de chat
- conversation_type: 'brief' (Q&A) o 'estrategia' (free-form)

#### **steve_messages** — Mensajes individuales
- role: 'user', 'assistant', 'system'

#### **ad_creatives** — Copys y briefs generados
- funnel (tofu/mofu/bofu), formato (static/video), angulo
- titulo, texto_principal, descripcion, cta
- brief_visual (JSONB), prompt_generacion, asset_url
- estado: 'borrador', 'aprobado', 'en_pauta'
- dct_copies, dct_titulos, dct_descripciones, dct_briefs, dct_imagenes (JSONB)

#### **ad_assets** — Assets de creativos
- creative_id (FK → ad_creatives), asset_url, tipo ('imagen'/'video')

#### **client_assets** — Imágenes del cliente
- tipo: 'producto', 'lifestyle', 'logo', 'otro'

#### **saved_meta_copies** / **saved_google_copies** — Copys guardados
- headlines[], primary_texts[], descriptions[] (TEXT arrays)

#### **steve_feedback** — Feedback sobre contenido generado
- content_type, rating (1-5), feedback_text

#### **ad_references** — Biblioteca de inspiración
- angulo, image_url, visual_patterns (JSONB), quality_score (1-10)

#### **steve_knowledge** — Base de conocimiento admin
- categoria, titulo, contenido, activo, orden

#### **steve_bugs** — Errores comunes a evitar
- categoria, descripcion, ejemplo_malo, ejemplo_bueno

#### **steve_training_feedback** / **steve_training_examples** — Datos de entrenamiento

#### **learning_queue** — Cola de aprendizaje
- source_type ('video', 'article', 'blog'), status, transcription

---

### 4.7 Tablas de Investigación y Competencia

#### **brand_research** — Análisis de competencia y SEO
- research_type: 'competitor_analysis', 'seo_audit', 'ads_library', 'keywords'
- research_data (JSONB)
- **Unique:** (client_id, research_type)

#### **competitor_tracking** — Competidores monitoreados
- ig_handle, meta_page_id, deep_dive_data (JSONB), store_url
- **Unique:** (client_id, ig_handle)

#### **competitor_ads** — Anuncios de competidores (Meta Ad Library)
- ad_library_id, ad_text, ad_headline, image_url, video_url
- ad_type ('image'/'video'/'carousel'), cta_type, days_running

---

### 4.8 Tablas de Steve Mail (Email Marketing)

#### **email_subscribers** — Lista de contactos
| Columna | Tipo | Notas |
|---------|------|-------|
| client_id | UUID | FK → clients |
| email | TEXT | |
| first_name, last_name | TEXT | |
| source | TEXT | 'shopify_customer', 'shopify_order', 'shopify_abandoned', 'manual', 'form' |
| shopify_customer_id | TEXT | |
| status | TEXT | 'subscribed', 'unsubscribed', 'bounced', 'complained' |
| tags | TEXT[] | |
| custom_fields | JSONB | |
| total_orders | INT | |
| total_spent | NUMERIC(12,2) | |
| last_order_at | TIMESTAMPTZ | |

**Unique:** (client_id, email)

#### **email_templates** — Templates de email
- primary_color, secondary_color, accent_color, button_color
- font_family, logo_url, header_html, footer_html, base_html
- content_blocks (JSONB), assets (JSONB), is_default

#### **email_campaigns** — Campañas de email
- template_id (FK), subject, preview_text, from_name, from_email
- html_content, final_html, design_json (JSONB)
- status: 'draft', 'scheduled', 'sending', 'sent', 'cancelled'
- audience_filter (JSONB), total_recipients, sent_count
- recommendation_config (JSONB), product_data (JSONB)
- scheduled_at, sent_at, month_plan_id

#### **email_flows** — Flujos de automatización
- trigger_type: 'abandoned_cart', 'welcome', 'post_purchase', 'winback', 'browse_abandonment', 'back_in_stock', 'price_drop'
- status: 'draft', 'active', 'paused'
- steps (JSONB): [{subject, html_content, delay_seconds, conditions}]
- settings (JSONB): {quiet_hours_start, quiet_hours_end, frequency_cap, exit_on_purchase}

#### **email_flow_enrollments** — Inscripciones en flujos
- flow_id, subscriber_id, client_id
- status: 'active', 'completed', 'cancelled', 'converted'
- current_step, next_send_at, cloud_task_name

#### **email_events** — Tracking de emails
- event_type: 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed', 'converted'
- ab_variant: 'a' o 'b'
- metadata (JSONB): {url, user_agent, ip, order_id, revenue}

#### **email_domains** — Verificación de dominios
- domain, status ('pending'/'verified'/'failed')
- resend_domain_id, dkim_tokens[], dns_records (JSONB)

#### **email_ab_tests** — Testing A/B
- variant_b_subject, variant_b_html_content, variant_b_design_json
- test_percentage (5-50%), winning_metric ('open_rate'/'click_rate'/'revenue')
- test_duration_hours (1-72), winner ('a'/'b')
- cloud_task_name (Google Cloud Tasks)

#### **product_alerts** — Alertas de stock y precio
- alert_type: 'back_in_stock', 'price_drop'
- product_id, variant_id, original_price

#### **email_forms** — Formularios de captura
- form_type: 'popup', 'slide_in', 'inline', 'full_page'
- design (JSONB), trigger_rules (JSONB)
- incentive_type: 'discount_code', 'free_shipping', 'none'
- total_views, total_submissions, script_tag_id

---

### 4.9 Tablas de Planificación

#### **campaign_month_plans** — Planificación mensual
- month (1-12), year (2024-2030), status, notes
- **Unique:** (client_id, month, year)

#### **klaviyo_email_plans** — Planificación de flujos Klaviyo
- flow_type: 'welcome_series', 'abandoned_cart', 'customer_winback', 'campaign'
- status: 'draft', 'pending_review', 'approved', 'implemented'
- emails (JSONB): definición de secuencia

---

### 4.10 Tablas de Automatización Meta

#### **meta_automated_rules** — Reglas automáticas
- condition (JSONB), action (JSONB)
- apply_to: 'ALL_CAMPAIGNS' o IDs específicos
- check_frequency, trigger_count, last_triggered_at

#### **meta_rule_execution_log** — Log de ejecuciones
- action_type, details, metrics_snapshot (JSONB)

---

### 4.11 OAuth y Seguridad

#### **oauth_states** — Prevención CSRF para OAuth
- nonce (UNIQUE), shop_domain, client_id
- expires_at: DEFAULT now() + 10 minutos

---

### 4.12 Storage Buckets (Supabase)

| Bucket | Acceso | Contenido |
|--------|--------|-----------|
| client-assets | Público | Fotos de producto, logos |
| ad-references | Público | Biblioteca de inspiración |
| email-assets | Público | Assets de templates email |

---

### 4.13 Row-Level Security (RLS)

**Todas las tablas tienen RLS habilitado.** Patrones principales:

1. **Multi-tenant Shopify:** Aislamiento por `shop_domain`
2. **Legacy Client:** Acceso por `client_id`
3. **Super Admin Bypass:** `is_super_admin()` ve todo
4. **Separación User vs Client:** `user_id` (consultor) vs `client_user_id` (cliente)

---

## 5. API Backend (Cloud Run)

### 5.1 Arquitectura

- **Framework:** Hono v4.6.0
- **Runtime:** Node.js 20 en Docker
- **Puerto:** 8080
- **Health check:** `GET /health → { status: 'ok', version, timestamp }`

### 5.2 Middleware

| Middleware | Función |
|-----------|---------|
| `cors.ts` | CORS policy para todas las rutas |
| `auth.ts` | Validación JWT (extrae user del token) |
| `error-handler.ts` | Manejo global de errores |
| `shopify-hmac.ts` | Verificación HMAC timing-safe de webhooks Shopify |

### 5.3 Registro de Rutas (5 Fases)

#### Fase 1: Utilidades (bajo riesgo, JSON in/out)

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `/api/chonga-support` | POST | JWT | Chatbot de soporte (personaje Chonga) |
| `/api/parse-email-html` | POST | JWT | Parsear HTML de email |
| `/api/check-video-status` | POST | JWT | Estado de generación de video (Replicate) |
| `/api/export-all-data` | POST | JWT | Exportar toda la BD |
| `/api/export-database` | POST | x-export-key | Exportar BD completa con paginación |
| `/api/learn-from-source` | POST | JWT | Aprender de fuente externa |
| `/api/train-steve` | POST | JWT | Training feedback |
| `/api/analyze-ad-image` | POST | JWT | Análisis IA de creativos |
| `/api/generate-brief-visual` | POST | JWT | Generar brief visual |
| `/api/generate-copy` | POST | JWT | Generar copy genérico |
| `/api/generate-google-copy` | POST | JWT | Generar copy Google Ads |
| `/api/generate-campaign-recommendations` | POST | JWT | Recomendaciones IA |
| `/api/process-queue-item` | POST | JWT | Procesar cola |
| `/api/process-transcription` | POST | JWT | Transcripción de audio |

#### Fase 2: IA y Analytics

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `/api/steve-chat` | POST | JWT | Chat IA |
| `/api/steve-strategy` | POST | JWT | Generación de estrategia |
| `/api/steve-email-content` | POST | JWT | Contenido email IA |
| `/api/steve-send-time-analysis` | POST | JWT | Optimización hora de envío |
| `/api/steve-bulk-analyze` | POST | JWT | Análisis masivo |
| `/api/generate-meta-copy` | POST | JWT | Copy Meta Ads |
| `/api/generate-image` | POST | JWT | Generación imagen IA |
| `/api/generate-video` | POST | JWT | Generación video IA |
| `/api/generate-mass-campaigns` | POST | JWT | Campañas masivas |
| `/api/analyze-brand` | POST | JWT | DEPRECATED (410 Gone) |
| `/api/analyze-brand-research` | POST | JWT | Fase 1: investigación |
| `/api/analyze-brand-strategy` | POST | JWT | Fase 2: estrategia (12 secciones paralelas) |
| `/api/edit-image-gemini` | POST | JWT | Edición imagen (Gemini) |
| `/api/sync-competitor-ads` | POST | JWT | Sincronizar ads competencia |
| `/api/deep-dive-competitor` | POST | JWT | Análisis profundo competidor |
| `/api/fetch-campaign-adsets` | POST | JWT | Obtener ad sets Meta |
| `/api/meta-adset-action` | POST | JWT | Acciones sobre ad sets |
| `/api/sync-campaign-metrics` | POST | JWT | Sync métricas campaña |

#### Fase 3: Integraciones de Plataforma

**Klaviyo (9 endpoints):**
| Endpoint | Descripción |
|----------|-------------|
| `/api/fetch-klaviyo-top-products` | Top productos por eventos |
| `/api/store-klaviyo-connection` | Guardar conexión |
| `/api/import-klaviyo-templates` | Importar templates |
| `/api/upload-klaviyo-drafts` | Subir borradores |
| `/api/klaviyo-manage-flows` | Gestionar flujos |
| `/api/klaviyo-push-emails` | Enviar emails |
| `/api/klaviyo-smart-format` | Formateo inteligente |
| `/api/sync-klaviyo-metrics` | Sync métricas |
| `/api/preview-flow-emails` | Preview de flujos |

**Meta (11 endpoints):**
| Endpoint | Descripción |
|----------|-------------|
| `/api/check-meta-scopes` | Verificar permisos |
| `/api/fetch-meta-ad-accounts` | Listar cuentas publicitarias |
| `/api/fetch-meta-business-hierarchy` | Jerarquía Business Manager |
| `/api/manage-meta-audiences` | Gestión de audiencias |
| `/api/manage-meta-campaign` | CRUD campañas |
| `/api/manage-meta-pixel` | Configuración pixel |
| `/api/meta-social-inbox` | Mensajes DM/comentarios |
| `/api/meta-data-deletion` | Webhook GDPR (sin JWT) |
| `/api/sync-meta-metrics` | Sync métricas |
| `/api/manage-meta-rules` | Reglas automatizadas |
| `/api/meta-targeting-search` | Búsqueda de targeting |

**Shopify (7 endpoints):**
| Endpoint | Descripción |
|----------|-------------|
| `/api/fetch-shopify-analytics` | Métricas de tienda |
| `/api/fetch-shopify-products` | Listado de productos |
| `/api/fetch-shopify-collections` | Colecciones |
| `/api/create-shopify-discount` | Crear descuento |
| `/api/shopify-session-validate` | Validar sesión (sin JWT) |
| `/api/sync-shopify-metrics` | Sync métricas |
| `/api/store-shopify-credentials` | Guardar credenciales |

**Otros:**
| Endpoint | Descripción |
|----------|-------------|
| `/api/sync-google-ads-metrics` | Métricas Google Ads |
| `/api/store-platform-connection` | Guardar conexión genérica |

#### Fase 4: Auth y OAuth

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `/api/self-signup` | POST | Ninguno | Registro público |
| `/api/admin-create-client` | POST | Secret key | Creación admin de clientes |
| `/api/create-client-user` | POST | JWT | Crear usuario-cliente |
| `/api/meta-oauth-callback` | POST | JWT | Callback OAuth Meta |
| `/api/google-ads-oauth-callback` | POST | JWT | Callback OAuth Google |
| `/api/shopify-install` | GET | Ninguno | Redireccion instalación Shopify |
| `/api/shopify-oauth-callback` | ALL | Ninguno | Callback OAuth Shopify |
| `/api/shopify-fulfillment-webhooks` | POST | HMAC | Webhooks de fulfillment |
| `/api/shopify-gdpr-webhooks` | POST | HMAC | Webhooks GDPR |

#### Fase 5: Steve Mail (25+ endpoints)

**Autenticados (JWT):**
| Endpoint | Descripción |
|----------|-------------|
| `/api/send-email` | Enviar email transaccional |
| `/api/sync-email-subscribers` | Sincronizar suscriptores |
| `/api/manage-email-campaigns` | CRUD campañas |
| `/api/manage-email-flows` | CRUD flujos |
| `/api/query-email-subscribers` | Consultar suscriptores |
| `/api/verify-email-domain` | Verificar dominio |
| `/api/email-campaign-analytics` | Métricas de campañas |
| `/api/generate-steve-mail-content` | Contenido IA |
| `/api/email-product-recommendations` | Recomendaciones producto |
| `/api/email-templates` | Gestión templates |
| `/api/universal-blocks` | Bloques reutilizables |
| `/api/email-ab-testing` | Testing A/B |
| `/api/execute-ab-test-winner` | Ejecutar ganador (Cloud Tasks) |
| `/api/email-signup-forms` | Gestión formularios |

**Públicos (sin JWT):**
| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/email-product-alerts` | POST | Suscripción alertas |
| `/api/email-product-alert-widget` | GET | Widget JS para tienda |
| `/api/email-signup-form-public` | POST | Submit formulario público |
| `/api/email-form-widget` | GET | Widget JS formulario |
| `/api/email-track/open` | GET | Pixel de apertura |
| `/api/email-track/click` | GET | Tracking clics + redirect |
| `/api/email-unsubscribe` | GET | Desuscripción |
| `/api/email-ses-webhooks` | POST | Bounces/quejas AWS SES |
| `/api/email-flow-webhooks` | POST | Triggers Shopify (HMAC) |
| `/api/email-flow-execute` | POST | Ejecución flujo (Cloud Tasks) |
| `/api/execute-scheduled-campaign` | POST | Campaña programada (Cloud Tasks) |

---

## 6. Edge Functions (Supabase)

70 Edge Functions en Deno. La mayoría tienen `verify_jwt = false` en config.toml (la autenticación se maneja a nivel de aplicación).

### Funciones Clave

#### Análisis de Marca (2 fases)
1. **`analyze-brand-research`** — Fase 1: Scraping web del cliente + competidores con Firecrawl, detección IA de competidores con Claude
2. **`analyze-brand-strategy`** — Fase 2: Genera 12 secciones estratégicas en 3 olas paralelas con Claude Sonnet

#### Generación IA
- **`generate-copy`** / **`generate-meta-copy`** / **`generate-google-copy`** — Copys para anuncios
- **`generate-image`** — Generación de imágenes IA
- **`generate-video`** — Generación de video (Replicate)
- **`generate-mass-campaigns`** — Creación masiva de campañas
- **`generate-campaign-recommendations`** — Recomendaciones IA

#### Competencia
- **`deep-dive-competitor`** — Análisis técnico: plataforma, tracking scripts, pricing, meta tags
- **`sync-competitor-ads`** — Sincronizar desde Meta Ad Library

#### Reglas Meta
- **`execute-meta-rules`** — Evalúa condiciones (CPA, ROAS, CTR, SPEND) y ejecuta acciones (PAUSE, INCREASE_BUDGET, DECREASE_BUDGET, SCALE)

#### Soporte
- **`chonga-support`** — Chatbot IA con personalidad de bulldog inglés (Claude Haiku)

---

## 7. Frontend

### 7.1 Rutas

```
/ o /steve              → Steve.tsx (Landing page)
/auth                   → Auth.tsx (Login/Signup/Reset)
/dashboard              → Dashboard.tsx (Solo admin)
/portal                 → ClientPortal.tsx (App principal)
/portal/:clientId       → ClientPortal.tsx (Admin viendo cliente)
/oauth/meta/callback    → OAuthMetaCallback.tsx
/oauth/shopify/callback → OAuthShopifyCallback.tsx
/oauth/google-ads/callback → OAuthGoogleAdsCallback.tsx
/blog                   → Blog.tsx
/centro-estudios        → CentroEstudios.tsx
/servicios-corporativos → ServiciosCorporativos.tsx
/faq, /changelog, /tutorial → Páginas informativas
/terminos, /privacidad  → Legal
/*                      → NotFound.tsx (404)
```

### 7.2 Flujo de Navegación

```
VISITANTE → / (Landing) → /auth (Login) → /portal (Cliente) o /dashboard (Admin)

Lógica de tab por defecto en /portal:
  ├─ Sin conexiones  → Tab "Conexiones"
  ├─ Sin brief       → Tab "Steve" (crear brief)
  └─ Con todo        → Tab "Métricas"

Si onboarding_step != null → Overlay OnboardingWizard (bloquea interacción)
```

### 7.3 Tabs del Portal Cliente

**Tabs Primarios:**
1. **Steve** → `SteveChat.tsx` — Chat IA para generar brief de marca
2. **Brief** → `BrandBriefView.tsx` — Ver/exportar análisis de marca (PDF con jsPDF)
3. **Métricas** → `ClientPortalMetrics.tsx` — Dashboard de analytics con 14 sub-componentes
4. **Conexiones** → `ClientPortalConnections.tsx` — Setup OAuth de plataformas
5. **Configuración** → `FinancialConfigPanel.tsx` — Márgenes, costos, configuración

**Tabs Secundarios (menú dropdown):**
6. **Shopify** → `ShopifyDashboard.tsx` — Productos, órdenes, inventario
7. **Campañas** → `CampaignAnalyticsPanel.tsx` — Rendimiento de campañas
8. **Competencia** → `CompetitorAdsPanel.tsx` — Espionaje de anuncios
9. **Deep Dive** → `CompetitorDeepDivePanel.tsx` — Análisis profundo
10. **Estrategia** → `SteveEstrategia.tsx` — Recomendaciones estratégicas
11. **Meta Ads** → `MetaAdsManager.tsx` — Campañas Meta/Facebook
12. **Google Ads** → `GoogleAdsGenerator.tsx` — Copy Google Ads
13. **Klaviyo** → `CampaignStudio.tsx` — Email marketing Klaviyo
14. **Steve Mail** → `EmailMarketing.tsx` — Sistema email propio

### 7.4 Componentes Principales por Módulo

#### Métricas (`components/client-portal/metrics/`)
- `MetricsCharts.tsx` — Gráficos de línea/barra
- `TopSkusPanel.tsx` — Productos más vendidos
- `AbandonedCartsPanel.tsx` — Carritos abandonados
- `ConversionLtvPanel.tsx` — LTV por segmento
- `ProfitMetricsPanel.tsx` — Margen bruto, COGS
- `ProfitLossPanel.tsx` — Estado P&L
- `CohortAnalysisPanel.tsx` — Retención por cohorte
- `SmartInsightsPanel.tsx` — Insights IA
- `BusinessHealthScore.tsx` — KPI de salud
- `DayOfWeekChart.tsx` — Ventas por día
- `ConversionFunnelPanel.tsx` — Embudo

#### Campaign Studio - Klaviyo (`components/client-portal/campaign-studio/`)
- `TemplatesPanel` — Galería de templates
- `CampaignCreationWizard` — Wizard de creación
- `MonthlyCalendar` — Calendario de campañas
- `MonthlyPlannerWizard` — Planificación mensual
- `BulkUploadWizard` — Importación masiva
- `FlowsPanel` — Flujos de automatización
- `MetricsInsights` — Rendimiento
- `SteveKlaviyoChat` — Chat IA para Klaviyo

#### Steve Mail (`components/client-portal/email/`)
- `CampaignBuilder.tsx` — Diseñar y enviar emails
- `SteveMailEditor.tsx` — Editor visual principal
- `EmailTemplateGallery.tsx` — Browser de templates
- `FlowBuilder.tsx` — Constructor de flujos
- `DomainSetup.tsx` — Verificación DNS
- `GlobalStylesPanel.tsx` — Estilos globales CSS
- `ImageEditorPanel.tsx` — Editor de imágenes
- `ConditionalBlockPanel.tsx` — Lógica condicional
- `ProductBlockPanel.tsx` — Bloques de producto
- `UniversalBlocksPanel.tsx` — Bloques reutilizables

**Tipos de bloques email:** text, image, split, button, header_bar, divider, social_links, spacer, product, coupon, table, review, video, html, columns, section, product_grid

#### Meta Ads (`components/client-portal/meta-ads/`)
- `MetaCampaignManager.tsx` — CRUD campañas
- `MetaAudienceManager.tsx` — Audiencias
- `MetaAnalyticsDashboard.tsx` — Métricas
- `MetaSocialInbox.tsx` — DMs y comentarios
- `MetaAutomatedRules.tsx` — Reglas automáticas
- `CampaignCreateWizard.tsx` — Wizard de creación
- `PixelSetupWizard.tsx` — Configuración pixel
- `MetaConnectionWizard.tsx` — OAuth setup

#### Dashboard Admin (`components/dashboard/`)
- `DashboardStats.tsx` — KPIs (clientes, horas, revenue)
- `AdminClientsPanel.tsx` — Gestión de clientes
- `ClientMetricsPanel.tsx` — Analytics por cliente
- `PlatformConnectionsPanel.tsx` — Estado conexiones
- `SteveTrainingChat.tsx` — Entrenamiento IA interactivo
- `KnowledgeRulesExplorer.tsx` — Base de conocimiento
- `BlogPanel.tsx` — Gestión blog
- `TimeEntryPanel.tsx` — Tracking de horas
- `InvoicesPanel.tsx` — Facturación

#### Landing (`components/steve-landing/`)
- `SteveNavbar.tsx`, `SteveHero.tsx`, `FeatureBento.tsx`
- `ProductShowcase.tsx`, `HowItWorks.tsx`, `PricingSection.tsx`
- `StatsSection.tsx`, `TestimonialsSection.tsx`, `StevePersonality.tsx`
- `LogoBar.tsx`, `FinalCTA.tsx`, `SteveFooter.tsx`

### 7.5 API Client

**`src/lib/api.ts`** — Cliente unificado:
```typescript
callApi(functionName, { method, body, headers }) → ApiResponse<T>
// Ruta: VITE_API_URL/api/{functionName}
// Incluye JWT automáticamente via Authorization header
// Retorna { data: T | null, error: string | null }
```

### 7.6 State Management

- **No Redux/Zustand** — Usa React Context + local state
- **AuthContext** (useAuth) — Sesión de usuario
- **MetaBusinessContext** — Assets y portafolios Meta
- **React Query** — Server state (cache, refetch, invalidation)
- **localStorage** — Persistencia de onboarding, tours

---

## 8. Integraciones

### 8.1 Meta / Facebook

**Flujo OAuth:**
```
Frontend → Redirect a facebook.com/dialog/oauth
         → Scopes: ads_read, ads_management, catalog_management, pages_read_engagement...
         → state = {clientId}

Facebook → Redirect a /oauth/meta/callback?code=...&state=...

Frontend → OAuthMetaCallback.tsx extrae code + state
         → Llama meta-oauth-callback con { code, client_id, redirect_uri }

Backend  → Intercambia code por token
         → Obtiene long-lived token (60 días)
         → Encripta token con encrypt_platform_token()
         → Guarda en platform_connections
         → Retorna lista de ad accounts
```

**Verificación de scopes:** `useMetaScopes` hook mapea scopes a features:
- `ads_read` → Métricas
- `ads_management` → Campañas, Audiencias, Pixel
- `pages_read_engagement` → Pages, Social Inbox

**Meta API Wrapper** (`meta-fetch.ts`):
- `metaApiFetch(path, token)` — Fetch crudo
- `metaApiJson<T>(path, token)` — Con parsing JSON
- `metaApiPaginateAll<T>(path, token)` — Paginación completa
- Token SIEMPRE en header Authorization (nunca en query params)
- Retry automático en 429 (rate limit)

**Datos que sincroniza:**
- Métricas de campaña (impressions, clicks, spend, conversions, ROAS)
- Ad sets y ads individuales
- Audiencias custom y lookalike
- Pixel events
- Social inbox (mensajes y comentarios)
- Anuncios de competencia (Ad Library)

---

### 8.2 Google Ads

**Flujo OAuth:**
```
Frontend → Redirect a accounts.google.com/o/oauth2/v2/auth
         → Scope: https://www.googleapis.com/auth/adwords
         → response_type=code

Google   → Redirect a /oauth/google-ads/callback?code=...

Frontend → Llama google-ads-oauth-callback con { code, client_id }

Backend  → Intercambia code por access_token + refresh_token
         → Encripta ambos tokens
         → Lista customers accesibles
         → Guarda en platform_connections (platform='google')
```

**Datos que sincroniza:**
- Métricas de campañas Google Ads (impressions, clicks, spend, conversions)

---

### 8.3 Shopify

**Dos modos de OAuth:**

**Modo 1: Per-Client (recomendado)**
```
Cliente crea app en Shopify Partners
→ Frontend llama /api/store-shopify-credentials con { clientId, installLink, shopifyClientSecret, shopDomain }
→ Backend encripta secreto, guarda en platform_connections (is_active: false)
→ Cliente instala la app desde Shopify
→ Shopify redirect a /oauth/shopify/callback?code=...&shop=...&hmac=...
→ Backend verifica HMAC (timing-safe), intercambia token
→ Registra webhooks automáticamente
→ Actualiza platform_connections (is_active: true)
```

**Modo 2: Centralizado (fallback)**
- Usa `SHOPIFY_CLIENT_ID` y `SHOPIFY_CLIENT_SECRET` globales
- Crea usuario + cliente automáticamente si no existen

**Webhooks registrados automáticamente:**
| Topic | URL |
|-------|-----|
| `app/uninstalled` | `/api/shopify-gdpr-webhooks` |
| `orders/fulfilled`, `orders/partially_fulfilled`, `orders/cancelled` | `/api/shopify-fulfillment-webhooks` |
| `checkouts/create`, `customers/create`, `orders/create`, `products/update` | `/api/email-flow-webhooks` |

**Datos que sincroniza:**
- Productos, colecciones, inventario
- Órdenes, clientes, checkouts abandonados
- Métricas: revenue, orders, sessions
- Top SKUs, UTM performance, sales by channel

---

### 8.4 Klaviyo

**Autenticación por API Key (sin OAuth):**
```
Frontend → Usuario ingresa API key de Klaviyo
         → Llama /api/store-klaviyo-connection con { client_id, api_key }

Backend  → Valida key llamando a la API de Klaviyo
         → Encripta key con encrypt_platform_token()
         → Guarda en platform_connections (platform='klaviyo')
```

**Datos que sincroniza:**
- Templates de email
- Flujos de automatización
- Métricas de email/SMS
- Productos más vendidos (por eventos)
- Borradores de campañas

---

### 8.5 Anthropic Claude

Usado para todas las funciones IA:
- **Claude Opus 4.6** — Análisis de imágenes de anuncios
- **Claude Sonnet 4** — Generación de estrategia (12 secciones paralelas), copys, análisis
- **Claude Haiku** — Chatbot de soporte (Chonga)

Patrón: Inyecta base de conocimiento (`steve_knowledge`) + bugs a evitar (`steve_bugs`) en el system prompt.

---

### 8.6 Otros Servicios

| Servicio | Uso |
|----------|-----|
| Replicate | Generación de video |
| Firecrawl | Web scraping (HTML + Markdown) para análisis de competencia |
| Resend | Envío de emails (Steve Mail) |
| AWS SES | Bounces/quejas vía webhooks |
| Google Cloud Tasks | Cola de tareas: emails programados, A/B tests, ejecución de flujos |

---

## 9. Autenticación y Seguridad

### 9.1 Flujo de Autenticación

```
1. Usuario → /auth → signUp() o signIn()
2. Supabase Auth → Crea JWT
3. Frontend almacena session.access_token
4. Todas las llamadas API incluyen Authorization: Bearer {JWT}
5. Backend valida JWT con authMiddleware
6. Endpoints especiales: webhooks (HMAC), formularios públicos (sin auth), export (x-export-key)
```

### 9.2 Sistema de Roles

| Rol | Acceso | Determinación |
|-----|--------|--------------|
| **Super Admin** | Todo. Puede ver cualquier cliente. | `is_super_admin = true` en user_roles |
| **Admin** | Dashboard admin | `role = 'admin'` en user_roles |
| **Client** | Solo su propio portal | `role = 'client'` en user_roles |
| **Shopify User** | Portal cliente (siempre client, nunca admin) | Detectado por `is_shopify_user()` |

**Lógica de prioridad:**
```
1. super_admin → siempre admin
2. shopify_user → siempre client (nunca admin, incluso con rol admin)
3. has_role('admin') → admin
4. has_role('client') → client
```

### 9.3 Verificación de Propiedad de Cliente

Todos los endpoints que aceptan `client_id` verifican ownership:

```typescript
const { data: client } = await supabase
  .from('clients')
  .select('id, client_user_id')
  .eq('id', client_id);

if (client.client_user_id !== userId) {
  return c.json({ error: 'Access denied' }, 403);
}
```

### 9.4 Seguridad de Tokens

- Tokens encriptados en reposo (AES-256 via pgcrypto)
- Tokens en header Authorization (nunca en query params)
- Short-lived tokens intercambiados por long-lived
- Refresh automático de tokens Meta
- Verificación HMAC timing-safe para webhooks Shopify
- State parameter + nonce para prevención CSRF en OAuth

### 9.5 Multi-tenancy

- **Aislamiento por shop_domain** para usuarios Shopify
- **Aislamiento por client_id** para clientes legacy
- **RLS en todas las tablas** con bypass para super_admins
- **OAuth state nonces** expiran en 10 minutos

---

## 10. Deploy

### 10.1 Frontend (Vercel)

```bash
# Auto-deploy al push a main
cd ~/steve
git add . && git commit -m "mensaje" && git push origin main
```

- **Build:** `npm run build` (Vite)
- **Output:** `/dist`
- **Config:** `vercel.json` con SPA rewrites
- **Variables de entorno:**
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_API_URL` (URL del Cloud Run API)

### 10.2 Backend (Google Cloud Run)

```bash
cd ~/steve/cloud-run-api
gcloud run deploy steve-api --source . \
  --project steveapp-agency \
  --region us-central1
```

- **Dockerfile:** Multi-stage build con Node 20
- **Puerto:** 8080
- **Variables de entorno necesarias:**

| Variable | Descripción |
|----------|-------------|
| `PORT` | 8080 (default) |
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key |
| `SUPABASE_ANON_KEY` | Anon key |
| `META_APP_ID` | Facebook App ID |
| `META_APP_SECRET` | Facebook App Secret |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `GOOGLE_ADS_CLIENT_SECRET` | Google OAuth Secret |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Google Ads Developer Token |
| `SHOPIFY_CLIENT_ID` | Shopify App Client ID |
| `SHOPIFY_CLIENT_SECRET` | Shopify App Secret |
| `FRONTEND_URL` | URL del frontend (para CORS y redirects) |
| `ANTHROPIC_API_KEY` | API key Anthropic/Claude |
| `RESEND_API_KEY` | API key Resend (email) |
| `REPLICATE_API_TOKEN` | API key Replicate (video) |
| `FIRECRAWL_API_KEY` | API key Firecrawl (scraping) |
| `GCP_PROJECT_ID` | Google Cloud project |
| `GCP_LOCATION` | us-central1 |

### 10.3 Base de Datos (Supabase)

```bash
cd ~/steve
npx supabase db push       # Aplicar migraciones
npx supabase functions deploy  # Deploy edge functions
```

### 10.4 Resumen de Deploy

| Componente | Plataforma | Trigger | Comando |
|------------|-----------|---------|---------|
| Frontend | Vercel | Push a main | `git push origin main` |
| Backend | Cloud Run | Manual | `gcloud run deploy steve-api --source .` |
| BD | Supabase | Manual | `npx supabase db push` |
| Edge Functions | Supabase | Manual | `npx supabase functions deploy` |

---

## 11. Dependencias

### 11.1 Frontend (package.json)

**Core:**
- `react@18.3.1`, `react-dom@18.3.1` — UI framework
- `react-router-dom@6.30.1` — Routing SPA
- `@tanstack/react-query@5.83.0` — Server state + cache
- `@supabase/supabase-js@2.90.1` — BD + Auth

**Formularios y Validación:**
- `react-hook-form@7.61.1` — Estado de formularios
- `@hookform/resolvers@3.10.0` — Resolvers Zod
- `zod@3.25.76` — Validación de schemas

**UI (shadcn + Radix):**
- 25+ paquetes `@radix-ui/*` — Componentes accesibles
- `tailwindcss@3.4.17` — Estilos utilitarios
- `tailwindcss-animate@1.0.7` — Animaciones
- `tailwind-merge@2.6.0` — Merge de clases
- `class-variance-authority@0.7.1` — Variantes de componentes
- `clsx@2.1.1` — Concatenación de clases
- `lucide-react@0.462.0` — Iconos
- `framer-motion@12.27.3` — Animaciones
- `cmdk@1.1.1` — Command palette
- `sonner@1.7.4` — Toast notifications
- `next-themes@0.3.0` — Dark mode
- `vaul@0.9.9` — Drawer

**Email Editor:**
- `grapesjs@0.22.14` — Editor visual drag-and-drop
- `grapesjs-preset-newsletter@1.0.2` — Preset email

**Contenido:**
- `react-markdown@10.1.0` — Renderizar markdown
- `remark-gfm@4.0.1` — GitHub-flavored markdown
- `recharts@2.15.4` — Gráficos
- `embla-carousel-react@8.6.0` — Carrusel

**Utilidades:**
- `date-fns@3.6.0` — Manipulación de fechas
- `react-day-picker@8.10.1` — Calendario
- `jspdf@4.0.0` — Generación PDF
- `input-otp@1.4.2` — Input OTP

**Testing:**
- `@playwright/test@1.57.0` — E2E tests
- `vitest@3.2.4` — Unit tests

### 11.2 Backend (cloud-run-api/package.json)

**Producción:**
- `hono@4.6.0` — Framework HTTP
- `@hono/node-server@1.13.7` — Servidor Node.js
- `@supabase/supabase-js@2.90.1` — BD + Auth
- `@google-cloud/tasks@6.2.1` — Cola de tareas
- `resend@6.9.3` — Servicio email
- `nunjucks@3.2.4` — Motor de templates

**Desarrollo:**
- `typescript@5.8.3` — Compilador
- `tsx@4.19.0` — Runner TypeScript
- `@types/node@20.17.0`, `@types/nunjucks@3.2.6`

---

## Apéndice: Archivos que NO se deben modificar

| Path | Razón |
|------|-------|
| `src/integrations/supabase/` | Auto-generado por Supabase |
| `src/components/ui/` | Componentes shadcn (se re-generan) |
| `node_modules/` | Dependencias instaladas |
| `dist/` | Output de build |

---

*Generado automáticamente — Marzo 2026*
