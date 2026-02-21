# Steve Ads — Stack Técnico y Contextual Completo

> Documento de referencia para desarrolladores full-stack que asuman el producto.  
> Última actualización: 2026-02-21

---

## 1. VISIÓN DEL PRODUCTO

**Steve Ads** es una plataforma SaaS de consultoría de marketing digital desarrollada por **Consultoría BG** (Chile). Combina inteligencia artificial con integraciones de plataformas publicitarias para ofrecer a clientes un portal unificado de gestión de ads, estrategia de marca y e-commerce.

### Propuesta de valor
- **Asistente IA "Steve"**: Chatbot estratégico que analiza métricas, genera copys publicitarios, crea briefs de marca y hace recomendaciones basadas en fase de negocio del cliente
- **Multi-plataforma**: Conecta Shopify, Meta Ads, Google Ads y Klaviyo en un solo dashboard
- **Inteligencia competitiva**: Web scraping + análisis AI de competidores (SEO, keywords, ads de Meta Ad Library)
- **Generación de activos**: Copys, imágenes (Fal.ai/Flux Pro) y videos (Replicate/Kling AI) para campañas
- **Portal de cliente + Dashboard admin**: Arquitectura multitenancy con aislamiento estricto de datos

### Usuarios
1. **Super Admin** (jmbarros@bgconsult.cl): Control total, puede ver cualquier cliente
2. **Clientes regulares**: Acceden solo a sus propios datos vía portal
3. **Merchants Shopify**: Usuarios que se registran automáticamente al instalar la app de Shopify

---

## 2. STACK TECNOLÓGICO

### Frontend
| Tecnología | Versión | Uso |
|---|---|---|
| **React** | ^18.3.1 | Framework UI |
| **TypeScript** | (bundled) | Tipado estático |
| **Vite** | (config: vite.config.ts) | Build tool + HMR |
| **React Router DOM** | ^6.30.1 | Routing SPA |
| **TanStack React Query** | ^5.83.0 | Cache y fetching |
| **Tailwind CSS** | (postcss) | Utility-first CSS |
| **shadcn/ui** | (components/ui/) | Componentes base (Radix UI) |
| **Framer Motion** | ^12.27.3 | Animaciones |
| **Recharts** | ^2.15.4 | Gráficos y métricas |
| **Lucide React** | ^0.462.0 | Iconos |
| **Zod** | ^3.25.76 | Validación de formularios |
| **React Hook Form** | ^7.61.1 | Gestión de formularios |
| **jsPDF** | ^4.0.0 | Generación de PDFs |
| **react-markdown** | ^10.1.0 | Renderizado de Markdown (chat Steve) |
| **Sonner** | ^1.7.4 | Toast notifications |

### Backend (Supabase / Lovable Cloud)
| Componente | Detalle |
|---|---|
| **PostgreSQL** | Base de datos relacional con RLS |
| **Supabase Auth** | Email/password + Google OAuth (Lovable Cloud Auth) |
| **Supabase Edge Functions** | ~40 funciones Deno serverless |
| **Supabase Storage** | Bucket `client-assets` (público) |
| **pgcrypto** | Encriptación AES-256 de tokens en DB |

### Servicios Externos
| Servicio | Secret | Uso |
|---|---|---|
| **Anthropic Claude** | `ANTHROPIC_API_KEY` | IA principal (Opus para estrategia, Sonnet para copys) |
| **Fal.ai** | `FAL_API_KEY` | Generación de imágenes (Flux Pro) |
| **Replicate** | `REPLICATE_API_KEY` | Generación de videos (Kling AI v1.5) |
| **Firecrawl** | `FIRECRAWL_API_KEY` (connector) | Web scraping para análisis de competencia |
| **Shopify** | `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_WEBHOOK_SECRET` | OAuth, API de tienda, webhooks |
| **Meta** | `META_APP_ID`, `META_APP_SECRET` | OAuth y API de Meta Ads |
| **Google Ads** | `GOOGLE_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN` | OAuth y API de Google Ads |

---

## 3. ARQUITECTURA DE LA APLICACIÓN

### Diagrama de flujo de alto nivel

```
┌─────────────────────────────────────────────────────┐
│                   FRONTEND (React SPA)               │
│                                                      │
│  Landing (/)  →  Auth (/auth)  →  Portal (/portal)  │
│                                   Dashboard (/dashboard) │
│                                                      │
│  supabase.functions.invoke()  ←→  supabase.from()   │
└──────────────────┬───────────────────────────────────┘
                   │ HTTPS
┌──────────────────▼───────────────────────────────────┐
│              SUPABASE (Lovable Cloud)                 │
│                                                      │
│  ┌─────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  Auth    │  │ Edge Funcs   │  │  PostgreSQL    │  │
│  │  (JWT)   │  │ (~40 Deno)   │  │  + RLS + pgcrypto│ │
│  └─────────┘  └──────┬───────┘  └────────────────┘  │
│                      │                               │
│              ┌───────▼────────┐                      │
│              │ External APIs  │                      │
│              │ Anthropic,Meta │                      │
│              │ Shopify,Google │                      │
│              │ Fal,Replicate  │                      │
│              │ Firecrawl      │                      │
│              └────────────────┘                      │
└──────────────────────────────────────────────────────┘
```

### Rutas de la aplicación

| Ruta | Acceso | Descripción |
|---|---|---|
| `/` | Público | Landing page (Navbar, Hero, Footer) |
| `/auth` | Público | Login/Signup/Forgot + Google OAuth |
| `/portal` | Client/Admin | Portal del cliente (12 tabs) |
| `/portal/:clientId` | Super Admin only | Vista admin del portal de un cliente |
| `/dashboard` | Admin only | Panel administrativo (9 tabs) |
| `/steve` | Público (legacy) | Página de Steve |
| `/blog` | Público | Blog |
| `/shopify` `/shopify-app` | Público | Página de la app de Shopify |
| `/connect-shopify` | Auth | Conectar tienda Shopify |
| `/oauth/meta/callback` | Sistema | Callback OAuth Meta |
| `/oauth/shopify/callback` | Sistema | Callback OAuth Shopify |
| `/oauth/google-ads/callback` | Sistema | Callback OAuth Google Ads |
| `/centro-estudios` | Público | Centro de estudios |
| `/servicios-corporativos` | Público | Servicios corporativos |
| `/terminos` `/privacidad` `/eliminacion-datos` | Público | Legal |
| `/faq` `/changelog` `/tutorial` `/documentacion` | Público | Soporte |

---

## 4. MODELO DE DATOS

### Esquema de base de datos (33 tablas)

#### Core
| Tabla | Descripción |
|---|---|
| `clients` | Registro principal de cada cliente. `user_id` = dueño, `client_user_id` = usuario del cliente, `shop_domain` = tienda Shopify |
| `user_roles` | Roles (`admin`/`client`) + flag `is_super_admin`. NUNCA en tabla profiles |
| `oauth_states` | Nonces CSRF para flujo OAuth Shopify (TTL 10 min) |

#### Plataformas y Métricas
| Tabla | Descripción |
|---|---|
| `platform_connections` | Conexiones a Shopify/Meta/Google/Klaviyo por cliente. Tokens encriptados con pgcrypto |
| `platform_metrics` | Métricas agregadas (ventas, pedidos, etc.) por conexión |
| `campaign_metrics` | Métricas de campañas publicitarias (impressions, clicks, spend, ROAS, etc.) |
| `campaign_recommendations` | Recomendaciones AI por campaña |

#### Steve IA
| Tabla | Descripción |
|---|---|
| `steve_conversations` | Conversaciones del chatbot por cliente |
| `steve_messages` | Mensajes individuales (role: user/assistant) |
| `steve_knowledge` | Base de conocimiento editable del admin |
| `steve_bugs` | Correcciones de comportamiento del chatbot |
| `steve_training_examples` | Ejemplos de entrenamiento (escenarios + análisis correcto) |
| `steve_training_feedback` | Feedback sobre recomendaciones generadas |
| `steve_feedback` | Evaluaciones del brief estratégico (7 secciones) |

#### Marca y Competencia
| Tabla | Descripción |
|---|---|
| `brand_research` | Investigaciones de marca (SEO, keywords, competencia) almacenadas como JSONB |
| `buyer_personas` | Buyer personas generados por IA |
| `competitor_tracking` | Competidores rastreados (IG handle, meta_page_id, deep_dive_data) |
| `competitor_ads` | Anuncios de competidores extraídos de Meta Ad Library |

#### Contenido y Creativos
| Tabla | Descripción |
|---|---|
| `ad_creatives` | Creativos publicitarios con formato DCT 3-2-2 (JSONB: dct_copies, dct_titulos, etc.) |
| `ad_assets` | Activos individuales (imágenes/videos) vinculados a creativos |
| `client_assets` | Galería de assets de marca (logos, fotos de producto) |
| `saved_meta_copies` | Copys de Meta Ads guardados |
| `saved_google_copies` | Copys de Google Ads guardados |

#### Klaviyo
| Tabla | Descripción |
|---|---|
| `klaviyo_email_plans` | Planes de email marketing (flows + campañas) |

#### Financiero y Suscripciones
| Tabla | Descripción |
|---|---|
| `client_financial_config` | Configuración financiera (márgenes, costos fijos, comisiones) |
| `client_credits` | Saldo de créditos por cliente |
| `credit_transactions` | Historial de consumo de créditos |
| `subscription_plans` | Planes de suscripción disponibles |
| `user_subscriptions` | Suscripciones activas de usuarios |

#### Admin
| Tabla | Descripción |
|---|---|
| `time_entries` | Registro de horas de trabajo |
| `invoices` | Facturación a clientes |
| `blog_posts` | Posts del blog |
| `study_resources` | Recursos educativos |

### Enums
- `app_role`: `'admin'` | `'client'`
- `platform_type`: `'shopify'` | `'meta'` | `'google'` | `'klaviyo'`

### Funciones de base de datos críticas
| Función | Tipo | Propósito |
|---|---|---|
| `has_role(_user_id, _role)` | SECURITY DEFINER | Verifica si un usuario tiene un rol (evita recursión RLS) |
| `is_super_admin(_user_id)` | SECURITY DEFINER | Verifica super admin |
| `is_shopify_user(_user_id)` | SECURITY DEFINER | Verifica si es merchant Shopify |
| `can_access_shop(_user_id, _shop_domain)` | SECURITY DEFINER | Valida acceso a tienda específica |
| `get_user_shop_domain(_user_id)` | SECURITY DEFINER | Obtiene shop_domain del usuario |
| `encrypt_platform_token(raw_token)` | SECURITY DEFINER | Encripta token con pgcrypto (AES-256) |
| `decrypt_platform_token(encrypted_token)` | SECURITY DEFINER | Desencripta token |
| `handle_new_user()` | TRIGGER | Auto-crea registro en `clients` + `user_roles` al registrarse |
| `update_updated_at_column()` | TRIGGER | Actualiza `updated_at` automáticamente |

---

## 5. SEGURIDAD

### Multitenancy
- **RLS (Row Level Security)** habilitado en TODAS las tablas
- Aislamiento por `client_id` → `clients.user_id = auth.uid()` OR `clients.client_user_id = auth.uid()`
- Merchants Shopify aislados por `shop_domain` validado contra `can_access_shop()`
- Super admin tiene bypass vía `is_super_admin(auth.uid())` en políticas PERMISIVAS

### Autenticación
- Email/password con validación Zod (min 8 chars, mayúsculas, minúsculas, números, símbolos)
- Google OAuth vía Lovable Cloud Auth (`@lovable.dev/cloud-auth-js`)
- Shopify OAuth: Authorization Code Grant con CSRF protection (nonce en `oauth_states`)
- Magic links para sesiones de Shopify merchants

### Tokens y Credenciales
- Tokens de plataformas encriptados at-rest con `pgcrypto.pgp_sym_encrypt`
- Clave de encriptación: `md5('platform_tokens_secret_key_2024')` como fallback
- Tokens NUNCA expuestos al frontend; se envían vía Edge Functions y se almacenan encriptados

### Reglas de acceso por rol
| Acción | Super Admin | Admin | Client | Shopify User |
|---|---|---|---|---|
| Dashboard (`/dashboard`) | ✅ | ✅ | ❌ | ❌ (SIEMPRE redirigido) |
| Portal (`/portal`) | ✅ (con clientId) | ❌ | ✅ | ✅ |
| Ver datos de otros clientes | ✅ | ❌ | ❌ | ❌ |
| Gestionar roles | ✅ | ❌ | ❌ | ❌ |

---

## 6. EDGE FUNCTIONS (~40 funciones Deno)

### Configuración
- Todas tienen `verify_jwt = false` en `supabase/config.toml` (autenticación manual via JWT en headers)
- Las funciones verifican auth internamente con `supabase.auth.getClaims()` (no `getUser()`)

### Categorías

#### IA y Generación de Contenido
| Función | Modelo IA | Descripción |
|---|---|---|
| `steve-chat` | Claude Opus 4 | Chatbot estratégico principal |
| `analyze-brand-strategy` | Claude Opus 4 | Genera brief estratégico completo |
| `analyze-brand-research` | Claude (via Anthropic) | Análisis SEO/Keywords |
| `analyze-ad-image` | Claude Opus 4 | Análisis de imágenes publicitarias |
| `generate-copy` | Claude Sonnet 4 | Generación de copys genéricos |
| `generate-meta-copy` | Claude Sonnet 4 | Copys específicos para Meta Ads |
| `generate-google-copy` | Claude Sonnet 4 | Copys para Google Ads |
| `generate-brief-visual` | Claude Sonnet 4 | Briefs visuales para creativos |
| `generate-campaign-recommendations` | Claude Sonnet 4 | Recomendaciones de campaña |
| `generate-image` | Fal.ai (Flux Pro) | Generación de imágenes |
| `generate-video` | Replicate (Kling AI) | Generación de videos |
| `check-video-status` | Replicate | Polling de estado de video |
| `train-steve` | Claude Sonnet 4 | Entrenamiento del modelo |
| `analyze-brand` | Claude + Firecrawl | Análisis integral de marca + competencia |
| `deep-dive-competitor` | Claude + Firecrawl | Análisis profundo de competidores |

#### Integraciones OAuth
| Función | Plataforma |
|---|---|
| `shopify-install` | Inicio del flujo OAuth Shopify |
| `shopify-oauth-callback` | Callback OAuth Shopify (intercambio de code por token) |
| `shopify-session-validate` | Validación de sesión Shopify (magic link) |
| `meta-oauth-callback` | Callback OAuth Meta |
| `google-ads-oauth-callback` | Callback OAuth Google Ads |

#### Sincronización de Datos
| Función | Fuente |
|---|---|
| `sync-shopify-metrics` | Shopify API → platform_metrics |
| `sync-meta-metrics` | Meta Ads API → campaign_metrics |
| `sync-google-ads-metrics` | Google Ads API (GAQL) → campaign_metrics |
| `sync-klaviyo-metrics` | Klaviyo API → platform_metrics |
| `sync-campaign-metrics` | Agregación cross-platform |
| `sync-competitor-ads` | Meta Ad Library → competitor_ads |

#### Shopify Operations
| Función | Uso |
|---|---|
| `fetch-shopify-products` | Lista de productos de la tienda |
| `fetch-shopify-analytics` | Analíticas de Shopify |
| `create-shopify-discount` | Crea códigos de descuento |
| `shopify-fulfillment-webhooks` | Webhooks de fulfillment |
| `shopify-gdpr-webhooks` | Webhooks GDPR obligatorios |

#### Meta Ads
| Función | Uso |
|---|---|
| `fetch-meta-ad-accounts` | Lista cuentas publicitarias |
| `fetch-campaign-adsets` | Adsets de campañas |

#### Utilidades
| Función | Uso |
|---|---|
| `store-platform-connection` | Almacena conexiones de forma segura |
| `store-klaviyo-connection` | Almacena API key de Klaviyo |
| `klaviyo-push-emails` | Envía emails via Klaviyo |
| `create-client-user` | Crea usuario para un cliente |
| `chonga-support` | Bot de soporte auxiliar |

---

## 7. COMPONENTES DEL FRONTEND

### Estructura de directorios

```
src/
├── assets/           # Imágenes, logos, avatares
├── components/
│   ├── ui/           # shadcn/ui (50+ componentes base)
│   ├── landing/      # Navbar, HeroSection, Footer, etc.
│   ├── client-portal/  # Componentes del portal (20+)
│   │   ├── metrics/    # Sub-componentes de métricas
│   │   └── ...
│   ├── dashboard/    # Componentes del admin dashboard
│   └── shopify/      # Pantallas de Shopify
├── hooks/
│   ├── useAuth.tsx       # Context de autenticación
│   ├── useUserRole.tsx   # Roles y permisos
│   ├── useSecurityContext.tsx
│   ├── useShopifyAuthFetch.tsx
│   └── use-mobile.tsx
├── integrations/
│   ├── supabase/     # client.ts (auto-gen), types.ts (auto-gen)
│   └── lovable/      # Cloud Auth (auto-gen)
├── lib/
│   ├── utils.ts      # cn() helper
│   └── password-validation.ts
├── pages/            # 20+ páginas
└── index.css         # Design system tokens
```

### Portal del Cliente (12 tabs)
| Tab | Componente | Funcionalidad |
|---|---|---|
| Métricas | `ClientPortalMetrics` | Dashboard financiero (POAS, CAC, MER, P&L, cohorts) |
| Shopify | `ShopifyDashboard` | Dashboard de Shopify (productos, pedidos, analytics) |
| Campañas | `CampaignAnalyticsPanel` | Métricas de campañas publicitarias |
| Conexiones | `ClientPortalConnections` | Gestión de conexiones OAuth |
| Brief | `BrandBriefView` | Brief estratégico generado por IA (7 secciones) |
| Competencia | `CompetitorAdsPanel` | Monitoreo de anuncios de competidores |
| Deep Dive | `CompetitorDeepDivePanel` | Análisis profundo de competidores |
| Steve | `SteveChat` | Chat con IA estratégica |
| Meta Ads | `CopyGenerator` | Generación de copys + creativos DCT 3-2-2 |
| Google Ads | `GoogleAdsGenerator` | Generación de copys para Google |
| Klaviyo | `KlaviyoPlanner` | Planificación de email marketing |
| Configuración | `FinancialConfigPanel` | Márgenes, costos fijos, comisiones |

### Dashboard Admin (9 tabs)
| Tab | Componente |
|---|---|
| Resumen | `DashboardStats` |
| Métricas | `ClientMetricsPanel` |
| Clientes | `AdminClientsPanel` |
| Horas | `TimeEntryPanel` |
| Recibos | `InvoicesPanel` |
| Plataformas | `PlatformConnectionsPanel` |
| Steve IA | `SteveKnowledgePanel` + `SteveTrainingPanel` + `SteveTrainingChat` |
| Blog | `BlogPanel` |
| Centro Estudios | `StudyResourcesPanel` |

---

## 8. DESIGN SYSTEM

### Tipografía
- **Display**: Montserrat (300-700)
- **Body**: Inter (400-600)

### Colores (HSL tokens en `index.css`)
- **Primary**: `230 50% 55%` (azul profesional)
- **Background**: `230 30% 96%` (light) / `230 30% 10%` (dark)
- **Success**: `142 76% 36%`
- **Warning**: `38 92% 50%`
- **Destructive**: `0 84% 60%`

### Convenciones CSS
- **NUNCA** usar colores directos (`text-white`, `bg-black`)
- Siempre usar tokens semánticos (`text-foreground`, `bg-background`, `text-primary`)
- Todos los colores deben ser HSL

---

## 9. FLUJOS CRÍTICOS

### Registro de usuario
```
1. Usuario llega a /auth
2. Se registra con email/password o Google OAuth
3. Trigger `handle_new_user()` en DB:
   → Crea registro en `clients` (user_id = client_user_id = new user id)
   → Asigna rol 'client' en `user_roles`
4. Frontend detecta rol → redirige a /portal
```

### Flujo OAuth de Shopify
```
1. Merchant va a /connect-shopify
2. Frontend llama a shopify-install Edge Function
3. Edge Function genera nonce CSRF, guarda en oauth_states (TTL 10 min)
4. Redirige a Shopify para autorización
5. Shopify callback → shopify-oauth-callback Edge Function
6. Valida HMAC (timingSafeEqual) + nonce CSRF
7. Intercambia code por access_token
8. Encripta token con pgcrypto, guarda en platform_connections
9. Crea usuario via magic link (shopify-session-validate)
10. Registra webhooks automáticamente (uninstalled, fulfillment)
```

### Generación de Brief Estratégico
```
1. Cliente chatea con Steve (/portal → tab Steve)
2. Steve hace 9 preguntas de onboarding
3. Al completar, llama a analyze-brand-strategy
4. Claude Opus analiza y genera brief (7 secciones):
   - Resumen Ejecutivo, ADN de Marca, Análisis Financiero
   - Buyer Persona, Análisis Competitivo, Posicionamiento
   - Plan de 90 días (7 Accionables SCR + MECE)
5. Se muestra en tab Brief con feedback panel
```

### Formato DCT 3-2-2 (Meta Ads)
```
1. IA genera 10 variaciones de copy
2. Usuario selecciona 3 copys
3. IA genera 6 briefs visuales (ciclando los 3 copys)
4. Usuario selecciona 3 briefs favoritos
5. Sistema genera assets en paralelo (Promise.allSettled)
6. Cada asset se guarda independientemente en ad_assets
7. Resultado: 3 copys + 2 títulos + 2 descripciones + 3 imágenes
```

---

## 10. SISTEMA DE CRÉDITOS

| Acción | Créditos | Costo USD |
|---|---|---|
| 3 variaciones de copy + brief visual | 1 | $0.01 |
| Generación de imagen | 2 | $0.05 |
| Generación de video | 10 | $0.50 |

- Nuevos clientes: plan `free_beta` con 99,999 créditos
- Verificación pre-ejecución en `client_credits`
- Registro en `credit_transactions` con costo real USD

---

## 11. REGLAS DE NEGOCIO POR FASE

Steve aplica restricciones estratégicas según la fase del negocio del cliente:

| Fase | Estrategias permitidas |
|---|---|
| **Inicial** | Solo Broad Retargeting + Producto Ancla. NO prospección fría |
| **Crecimiento** | + Prospección fría básica |
| **Escalado** | + Campañas Maestras + Catálogos Dinámicos |
| **Avanzada** | Framework completo + Partnership Ads + Advantage+ |

Métrica principal: **GPT** (Ganancia Bruta por Transacción)

---

## 12. MODELOS DE IA UTILIZADOS

| Modelo | Uso | Acceso |
|---|---|---|
| `claude-opus-4-6` | Steve chat, análisis estratégico, visión | API directa Anthropic |
| `claude-sonnet-4-6` | Copys, recomendaciones, briefs visuales, training | API directa Anthropic |
| Flux Pro (Fal.ai) | Generación de imágenes publicitarias | API Key `FAL_API_KEY` |
| Kling AI v1.5 (Replicate) | Generación de videos | API Key `REPLICATE_API_KEY` |
| Firecrawl | Web scraping para análisis SEO/competencia | Connector managed |

**Nota**: Se usa API directa de Anthropic (NO el gateway de Lovable) para control total de modelos y separación de system prompt.

---

## 13. STORAGE

### Bucket: `client-assets` (público)
- Rutas: `{clientId}/uploaded/` (subidos por usuario) y `{clientId}/generated/` (generados por IA)
- Tipos: logos, fotos de producto, imágenes generadas, videos

---

## 14. DEPLOYMENT

| Componente | Plataforma |
|---|---|
| Frontend | Lovable Cloud (auto-deploy) |
| Backend (DB, Auth, Storage) | Lovable Cloud (Supabase managed) |
| Edge Functions | Auto-deploy al guardar |
| URL Producción | `betabg.lovable.app` |

### Variables de entorno (auto-gestionadas)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

### Secrets del backend
Ver sección 2 (Servicios Externos) para lista completa de API keys.

---

## 15. CONSIDERACIONES PARA EL DESARROLLADOR

### Lo que NO puedes modificar directamente
- `src/integrations/supabase/client.ts` (auto-generado)
- `src/integrations/supabase/types.ts` (auto-generado desde DB)
- `supabase/config.toml` (auto-generado)
- `.env` (auto-generado)
- `package.json` (solo via herramientas de dependencias)

### Patrones importantes
1. **Siempre usar `effectiveClientId`** como filtro en queries (multitenancy)
2. **Edge Functions verifican auth internamente** con `getClaims()`, no `getUser()`
3. **Tokens de plataformas**: encrypt antes de INSERT, decrypt solo en Edge Functions
4. **RLS policies**: Cada tabla tiene políticas separadas para client, shopify user y super admin
5. **Los Shopify users NUNCA pueden ser admin**, incluso si tienen el rol en la tabla

### Archivos clave para entender el proyecto
1. `src/App.tsx` — Todas las rutas
2. `src/hooks/useAuth.tsx` — Context de autenticación
3. `src/hooks/useUserRole.tsx` — Lógica de roles y permisos
4. `src/pages/ClientPortal.tsx` — Portal completo del cliente
5. `src/pages/Dashboard.tsx` — Panel admin
6. `src/pages/Auth.tsx` — Login/Signup/OAuth
7. `src/index.css` — Design system tokens
8. `public/database-export.sql` — Schema completo de la DB

### Costos operativos estimados
- $0.16 - $0.53 USD por usuario/mes (Edge Functions + DB + Gemini/Claude API)
- Margen de ganancia proyectado: 97-98% en planes pagados

---

## 16. ROADMAP (Fases futuras)

### Fase 2: Diferenciadores (~100-150 créditos Lovable)
- Creación directa de campañas via Meta/Google Marketing APIs
- A/B testing de creativos
- Predicciones de rendimiento con IA

### Fase 3: Moonshot (~200-300 créditos Lovable)
- **Autopilot Mode**: Escalado automático de presupuesto
- Generación completa de creativos con IA
- Atribución multi-touch

---

*Este documento cubre la totalidad del stack técnico y conceptual del proyecto Steve Ads / Consultoría BG al 21 de febrero de 2026.*
