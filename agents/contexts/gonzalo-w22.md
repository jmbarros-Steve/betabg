# Gonzalo W22 — Contexto Operacional

## Tus Tablas (ownership directo)
| Tabla | Columnas clave | Estado |
|-------|---------------|--------|
| `subscription_plans` | id, name, slug (visual/estrategia/full), price_monthly (49990/99990/199990), credits_monthly, features (jsonb), is_active | ✅ Activo — 3 planes seedeados, RLS: public readable si is_active=true |
| `user_subscriptions` | user_id (UNIQUE), plan_id (FK→subscription_plans), status (active/inactive), credits_used, credits_reset_at, stripe_customer_id, stripe_subscription_id, current_period_start, current_period_end | ✅ Activo — trigger handle_new_user_with_plan auto-crea con plan 'visual' |
| `invoices` | user_id, client_id, invoice_number, month, year, total_hours, total_amount, status (draft/sent/paid) | ⚠️ Existe pero NO se usa en ningún endpoint |
| `client_financial_config` | client_id (UNIQUE), default_margin_percentage (30), use_shopify_costs, shopify_plan_cost, klaviyo_plan_cost, other_fixed_costs, payment_gateway_commission (3.5%), product_margins (jsonb) | ⚠️ Existe pero EERR incompleto |
| `merchant_upsell_opportunities` | client_id, type (add_klaviyo/add_meta/upgrade_plan/topup_credits), reason, metric_data (jsonb), wa_sent, wa_sent_at, outcome (accepted/declined/pending/ignored) | ✅ Activo — cron merchant-upsell inserta |
| `merchant_onboarding` | client_id, step (shopify_connected/meta_connected/klaviyo_connected/brief_completed), status (pending/in_progress/completed/skipped), wa_message_sent, reminder_count (máx 3), completed_at | ✅ Activo — cron onboarding-wa procesa |

## Tablas Shared (WA Credits — ownership principal: Paula W19)
| Tabla | Columnas clave | Nota |
|-------|---------------|------|
| `wa_credits` | client_id (UNIQUE), balance, total_purchased, total_used | Gonzalo lee para upsell topup_credits; Paula es dueña |
| `wa_credit_transactions` | client_id, type (topup/usage/refund/adjustment), amount, description, campaign_id, balance_after | Gonzalo lee para revenue; Paula es dueña |

## Tablas Legacy (deprecadas — NO tocar)
| Tabla | Nota |
|-------|------|
| `client_credits` | Legacy. creditos_disponibles/usados, plan='free_beta'. Reemplazada por wa_credits |
| `credit_transactions` | Legacy. accion + creditos_usados + costo_real_usd. Reemplazada por wa_credit_transactions |

## Tablas que Lees (de otros agentes)
| Tabla | Dueño | Para qué la lees |
|-------|-------|-----------------|
| `clients` | Diego W8 | Info merchant + churn_risk + whatsapp_phone para upsell |
| `platform_connections` | Diego W8 | Cuántas plataformas conectó (feature adoption, upsell triggers) |
| `platform_metrics` | Matías W13 | Revenue Shopify para calcular LTV y upsell |
| `campaign_metrics` | Felipe W2 / Ignacio W17 | Actividad del merchant (justifica plan) |
| `wa_prospects` | Paula W19 | Pipeline de ventas → conversión prospect→paid |
| `proposals` | Paula W19 | Propuestas enviadas vs convertidas |

## Funciones SQL Atómicas (que te importan)
| Función | Qué hace |
|---------|----------|
| `deduct_wa_credit(client_id, amount, description)` | Deducción atómica WA credits. Returns jsonb {success, error?, new_balance} |
| `deduct_credits(client_id, amount)` | Legacy. Returns TABLE(success, remaining) |

## Tus Archivos Frontend
| Archivo | Ruta | Líneas | Función |
|---------|------|--------|---------|
| `plan-features.ts` | `src/lib/` | 370 | CORE: PLAN_INFO, PLAN_TIERS, FEATURE_ACCESS (80+ features), TAB_MIN_PLAN, COMPARATIVA (15 módulos), canAccess(), canAccessTab() |
| `useUserPlan.tsx` | `src/hooks/` | 114 | Hook: carga plan usuario, super_admin='full', default='visual', override para admin viendo otro cliente |
| `AdminPlanes.tsx` | `src/pages/` | 173 | Panel admin: cards stats por plan + tabla comparativa |
| `BillingPanel.tsx` | `src/components/client-portal/` | 192 | UI suscripción: plan actual, opciones upgrade, botones Stripe checkout/portal |
| `UpgradeOverlay.tsx` | `src/components/client-portal/` | 56 | Overlay locked content + CTA upgrade + call HubSpot + WhatsApp |
| `PlanBadge.tsx` | `src/components/client-portal/` | 26 | Badge emoji + nombre del plan |
| `PlanGate.tsx` | `src/components/client-portal/` | 36 | Wrapper que bloquea contenido si plan insuficiente |

## Tus Edge Functions (Stripe)
| Función | Ruta | Líneas | Qué hace |
|---------|------|--------|----------|
| `stripe-checkout` | `supabase/functions/stripe-checkout/index.ts` | 115 | POST: Bearer JWT + plan_slug → busca/crea Stripe customer → crea checkout session → devuelve URL |
| `stripe-webhook` | `supabase/functions/stripe-webhook/index.ts` | 175 | POST: verifica signature → checkout.session.completed (inserta user_subscription), subscription.updated (actualiza período), subscription.deleted (downgrade a Visual) |
| `stripe-portal` | `supabase/functions/stripe-portal/index.ts` | 81 | POST: Bearer JWT → busca stripe_customer_id → crea billing portal session → devuelve URL |

## Stripe — Config
- **API:** v2024-06-20
- **Env vars requeridas:** STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_VISUAL, STRIPE_PRICE_ESTRATEGIA, STRIPE_PRICE_FULL
- **Webhook endpoint:** `https://zpswjccsxjtnhetkkqde.supabase.co/functions/v1/stripe-webhook`
- **Flujo checkout:** BillingPanel → POST /stripe-checkout → Stripe hosted checkout → webhook → user_subscriptions
- **Flujo portal:** BillingPanel → POST /stripe-portal → Stripe billing portal (nueva pestaña)

## Tus Crons
| Job | Schedule | Endpoint | Estado |
|-----|----------|----------|--------|
| `merchant-upsell-sunday` | `0 11 * * 0` (Dom 11am UTC) | /api/cron/merchant-upsell | ✅ Activo |
| `onboarding-wa-4h` | `0 */4 * * *` | /api/cron/onboarding-wa | ✅ Activo (shared con Paula W19) |
| `churn-risk-daily` | — | — | ❌ Pendiente crear |
| `plan-usage-weekly` | — | — | ❌ Pendiente crear |
| `upsell-trigger-daily` | — | — | ❌ Pendiente crear |

## Tus Archivos Backend
| Archivo | Ruta | Líneas | Función |
|---------|------|--------|---------|
| `merchant-upsell.ts` | `cloud-run-api/src/routes/cron/` | 222 | Cron semanal: analiza revenue 30d + conexiones → detecta oportunidades (add_klaviyo/add_meta/upgrade_plan/topup_credits) → WA con Haiku → inserta merchant_upsell_opportunities |
| `onboarding-wa.ts` | `cloud-run-api/src/routes/cron/` | 179 | Cron 4h: por cada step onboarding pendiente, detecta completión, envía felicitación o reminder (máx 3) con Haiku |
| `onboarding-bot.ts` | `cloud-run-api/src/routes/utilities/` | 100+ | POST /api/onboarding-bot: action="start" genera OAuth URLs, action="status" chequea progreso |

## Migraciones SQL Clave
| Archivo | Fecha | Función |
|---------|-------|---------|
| `20260327000001_plans_visual_estrategia_full.sql` | 27/3 | Crea 3 planes nuevos, elimina legacy |
| `20260402100001_onboarding_churn_upsell.sql` | 2/4 | Crea merchant_onboarding + merchant_upsell_opportunities + churn_risk en clients |
| `20260315000001_atomic_credit_deduction.sql` | 15/3 | Función atómica deduct_credits() |
| `20260402000000_wa_atomic_credits.sql` | 2/4 | Función atómica deduct_wa_credit() + increment_campaign_counter() |

## RLS Policies
| Tabla | Policy |
|-------|--------|
| `subscription_plans` | Public readable si is_active=true |
| `user_subscriptions` | Users leen solo la suya (auth.uid()=user_id); admins manejan todas |
| `merchant_onboarding` | Service role: full; Client: si client_id pertenece al user; Admin: has_role admin |
| `merchant_upsell_opportunities` | Service role: full; Admin: has_role admin |

## Planes Actuales
| Plan | Slug | Precio/mes (CLP) | Tier | Tagline | Icon |
|------|------|-------------------|------|---------|------|
| Visual | `visual` | $49.990 | 1 | Ve tus datos en un solo lugar | Eye |
| Estrategia | `estrategia` | $99.990 | 2 | Ve + Inteligencia de Steve IA | Brain |
| Full | `full` | $199.990 | 3 | Ve + Estrategia + Crea y Ejecuta | Rocket |

## Feature Matrix (resumen ejecutivo)
| Módulo | Visual | Estrategia | Full |
|--------|--------|-----------|------|
| Shopify | Ver (4 features) | = Visual | + Editar + Descuentos |
| Steve Chat | Consultas básicas | + Brand research + Recomendaciones | + Ejecutar acciones |
| Steve Estrategia | — | Diagnóstico + Plan + Competencia | + Ejecución automática |
| Meta Ads | Ver campañas + Social Inbox | + Análisis IA | + Crear/Editar |
| Klaviyo | Ver métricas/flows | = Visual | + Crear + Editor + Import |
| Instagram | Ver feed | + Análisis IA | + Publicar |
| Google Ads | Ver campañas | + Análisis IA | + Crear/Editar |
| Email | — | — | Todo |
| WhatsApp Clientes | — | — | Todo |
| Academy | Cursos básicos | + Avanzado | = Estrategia |
| Métricas | Dashboard | + Reportes avanzados + Weekly | = Estrategia |
| Chonga (Soporte) | Asistente IA | = Visual | + Imágenes |

## Dependencias
- **Necesitas de:** Paula W19 (prospect→paid conversion, WA credits data), Ignacio W17 (revenue data, weekly report), Matías W13 (Shopify revenue para LTV), Diego W8 (clients, connections)
- **Alimentas a:** Paula W19 (cuándo empujar upsell), Ignacio W17 (MRR para weekly report), Camila W4 (paywall UI components), JM (pricing decisions)

## Problemas Conocidos
| ID | Problema | Severidad |
|----|----------|-----------|
| P1 | STRIPE_PRICE_* env vars NO documentadas en deploy Cloud Run (viven en Supabase edge functions) | 🔴 Crítico |
| P2 | Trigger handle_new_user_with_plan puede duplicar user_subscriptions si se ejecuta más de una vez | 🟠 Alta |
| P3 | invoices table existe pero NO se usa en ningún endpoint | 🟡 Media |
| P4 | client_financial_config cargada pero EERR incompleto | 🟡 Media |
| P5 | onboarding-wa reminder_count nunca se resetea (máx 3 forever por step) | 🟢 Baja |
| P6 | client_credits y credit_transactions son legacy — verificar que nada las use activamente | 🟢 Baja |
| P7 | Sin data real de clientes pagados para optimizar pricing | ⚪ Informativo |
