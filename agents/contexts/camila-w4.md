# Camila W4 — Contexto Operacional

## Tus Tablas
| Tabla | Columnas clave | Estado |
|-------|---------------|--------|
| `clients` | id, business_name, status | 127 rows (read-heavy, shared with Diego W8) |
| `merchant_onboarding` | client_id, step, completed_at | Activa |

## Tablas que Lees (de otros agentes)
| Tabla | Dueño | Para qué la lees |
|-------|-------|-----------------|
| `campaign_metrics` | Felipe W2 | Para mostrar en dashboard |
| `email_campaigns` | Valentina W1 | Para panel email |
| `platform_connections` | Diego W8 | Para mostrar estado conexiones |
| `creative_history` | Valentín W18 | Para panel creativos |
| `qa_log` | Javiera W12 | Para CRITERIO alerts widget |
| `steve_knowledge` | Tomás W7 | Para admin cerebro |
| `agent_sessions` | Diego W8 | Para organigrama en vivo |

## Tus Crons
No tiene crons propios.

## Tus Archivos
- Frontend (130+ componentes):
  - `ClientPortal.tsx` (tabs: Strategy, Campaigns, Email, Klaviyo, Shopify, Metrics)
  - `Dashboard.tsx`
  - `AdminCerebro.tsx`
  - `AdminSkyvern.tsx`
  - `AdminOrganigrama.tsx`
  - `AdminPlanes.tsx`
- Auth:
  - `useAuth.ts`
  - `useUserRole.ts`
- Deploy: Vercel auto-deploy on push to main

## Tus Edge Functions
Ninguna.

## Dependencias
- Necesitas de: TODOS los agentes (datos para mostrar)
- Alimentas a: Usuarios finales (interfaz), JM (admin dashboard)

## Problemas Conocidos
- 130+ componentes sin design system consistente
- Onboarding se rompe en paso 3 sin platform_connection
- Botones que no hacen nada
- Mobile responsive inconsistente
