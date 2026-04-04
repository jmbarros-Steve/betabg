# Convenciones Compartidas — Todos los Agentes

## Naming Conventions
| Qué | Convención | Ejemplo |
|-----|-----------|---------|
| Rutas API | kebab-case | `/api/sync-meta-metrics` |
| Funciones | camelCase | `syncAllMetrics` |
| Archivos handler | kebab-case | `sync-meta-metrics.ts` |
| Componentes React | PascalCase | `MetaCampaignManager.tsx` |
| Tablas SQL | snake_case | `campaign_metrics` |
| Columnas SQL | snake_case | `user_id`, `created_at` |
| Env vars | UPPER_SNAKE | `CRON_SECRET` |
| Interfaces TS | PascalCase | `ChatMessage` |

## Import Aliases (@/)
```typescript
import { Button } from '@/components/ui/button';      // shadcn (NO TOCAR)
import { useAuth } from '@/hooks/useAuth';             // hooks custom
import { supabase } from '@/integrations/supabase/client'; // DB client
import { cn } from '@/lib/utils';                      // utilities
import { Send, Loader2 } from 'lucide-react';          // icons
```
Backend (Cloud Run): extensiones `.js` obligatorias para ESM.

## Auth en Endpoints
- **Páginas React**: `useAuth()` + `useUserRole()` → redirect si no autorizado
- **API con JWT**: `authMiddleware` en la ruta
- **Crons**: header `X-Cron-Secret` (sin JWT)
- **Webhooks públicos**: HMAC verification (Shopify, Twilio, SES)
- **Interno**: header `X-Internal-Key` con service role key

## Cross-Review Protocol (Resumen)
**NINGÚN agente hace commit sin review de otro.**

| Tipo de cambio | Reviewer |
|---------------|----------|
| Backend (rutas, crons, libs) | **Isidora W6** — lógica, edge cases, error handling |
| Frontend (componentes, páginas) | **Isidora W6** — UX, estados de carga |
| SQL (migraciones, RLS) | **Javiera W12** — integridad, seguridad, rollback |
| Edge Functions | **Javiera W12** — CORS, auth, imports |
| Full-stack | **Isidora + Javiera** — cada una su parte |

**Excepciones** (NO requieren review): cambios solo a `.md` o `.html`

## Archivos Prohibidos (NO TOCAR)
- `src/integrations/supabase/` — auto-generado por Supabase
- `src/components/ui/` — shadcn, se actualiza con CLI
- Archivos >30KB — leer completo antes de modificar

## Archivos Grandes (>30KB)
| Archivo | Tamaño |
|---------|--------|
| `src/components/client-portal/BrandBriefView.tsx` | 287KB |
| `src/components/client-portal/meta-ads/CampaignCreateWizard.tsx` | 141KB |
| `src/components/client-portal/email/emailTemplates.ts` | 107KB |
| `src/components/client-portal/meta-ads/MetaCampaignManager.tsx` | 86KB |
| `src/components/client-portal/email/CampaignBuilder.tsx` | 81KB |
| `cloud-run-api/src/routes/ai/steve-chat.ts` | 120KB |
| `cloud-run-api/src/routes/ai/generate-meta-copy.ts` | 71KB |
| `cloud-run-api/src/routes/meta/manage-meta-campaign.ts` | 56KB |
| `cloud-run-api/src/routes/whatsapp/steve-wa-chat.ts` | 55KB |
| `src/integrations/supabase/types.ts` | 54KB (NO EDITAR) |

## Deploy Commands
- **Frontend**: `git add . && git commit -m "mensaje" && git push origin main` → auto-deploy Vercel
- **Backend**: `cd cloud-run-api && gcloud run deploy steve-api --source . --project steveapp-agency --region us-central1`
- **Database**: `npx supabase db push`
- **Crons**: `gcloud scheduler jobs create http NOMBRE --schedule="CRON" --uri="https://steve-api-850416724643.us-central1.run.app/api/cron/RUTA" --http-method=POST --headers="X-Cron-Secret=steve-cron-secret-2024,Content-Type=application/json" --location=us-central1 --project=steveapp-agency`

## SYNC a Supabase (todos los agentes)
Después de cada bloque de trabajo, PATCH a `agent_sessions`:
```bash
curl -s -X PATCH "https://zpswjccsxjtnhetkkqde.supabase.co/rest/v1/agent_sessions?agent_code=eq.CODIGO" \
  -H "apikey: SERVICE_ROLE_KEY" -H "Authorization: Bearer SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d '{ CAMPOS }'
```
Reemplazar CODIGO con w0, w2, w5, etc. Sync después de: activación, tarea completada, descubrimiento, challenge.

## Bug → Task (OBLIGATORIO)
Cuando encuentres un bug severity critical/major/high → insertar INMEDIATAMENTE en tabla `tasks` de Supabase.

## Super Admin
- Email: jmbarros@bgconsult.cl
