# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Steve Ads** is a multi-tenant SaaS marketing consulting platform. It features an AI chatbot ("Steve"), multi-channel ad management (Shopify, Meta, Google Ads, Klaviyo), competitor analysis, and creative asset generation. The stack is React + TypeScript (frontend) with Google Cloud Run (Hono + Node.js) as the API backend and Supabase (PostgreSQL) as the database.

## Commands

```bash
npm run dev        # Dev server at localhost:8080
npm run build      # Production build
npm run lint       # ESLint
npm test           # Run Vitest tests once
npm run test:watch # Run Vitest in watch mode
```

**Cloud Run API (backend):**
```bash
cd cloud-run-api && npm run build    # Type-check + compile
cd cloud-run-api && npm run dev      # Local dev server
# Deploy:
gcloud run deploy steve-api --source . --project steveapp-agency --region us-central1
```

**Supabase (database only):**
```bash
npx supabase db push                 # Apply DB migrations
```

## Architecture

### Frontend

- **`src/App.tsx`** — Root: wraps providers (`QueryClientProvider` → `AuthProvider` → `TooltipProvider`) and defines all 27 routes.
- **`src/pages/`** — Page-level components mapping to routes (`/portal`, `/dashboard`, `/auth`, etc.)
- **`src/components/`** — Organized by feature area:
  - `ui/` — shadcn/ui base components (do not modify)
  - `client-portal/` — 12-tab client dashboard
  - `dashboard/` — Admin panel tabs
  - `landing/` — Public marketing pages
  - `shopify/` — Shopify OAuth + merchant onboarding
- **`src/hooks/`** — Key hooks:
  - `useAuth()` — Session, signIn/signUp/signOut
  - `useUserRole()` — Role checking, client data fetching; returns `effectiveClientId`
  - `useSecurityContext()` — Multi-tenancy enforcement
- **`src/lib/api.ts`** — `callApi()` function — all backend calls go through Google Cloud Run.
- **`src/integrations/supabase/`** — Auto-generated Supabase client and TypeScript types. Do not edit manually.

### Backend (Google Cloud Run)

- **`cloud-run-api/`** — Hono + Node.js API server with 64 route handlers.
  - `src/index.ts` — Hono app entry point + health check
  - `src/middleware/` — CORS, JWT auth, error handler
  - `src/lib/supabase.ts` — Supabase client factory (admin + user)
  - `src/routes/` — Route handlers organized by domain:
    - `auth/` — self-signup, admin-create-client, create-client-user
    - `oauth/` — meta-oauth-callback, google-ads-oauth-callback
    - `ai/` — steve-chat, steve-strategy, generate-meta-copy, generate-image, etc. (12 handlers)
    - `analytics/` — sync-competitor-ads, deep-dive-competitor, etc. (4 handlers)
    - `shopify/` — fetch-analytics/products/collections, create-discount, sync-metrics, OAuth install/callback, webhooks (10 handlers)
    - `meta/` — check-scopes, manage-campaign/audiences/pixel, social-inbox, sync-metrics, etc. (9 handlers)
    - `klaviyo/` — store-connection, manage-flows, push-emails, sync-metrics, etc. (8 handlers)
    - `google/` — sync-google-ads-metrics (1 handler)
    - `utilities/` — chonga-support, export-all-data, generate-copy, train-steve, etc. (15 handlers)
- **Cloud Run URL:** `https://steve-api-850416724643.us-central1.run.app`
- **GCP Project:** `steveapp-agency`

### Database (Supabase)

- **`supabase/migrations/`** — SQL migration files. New DB changes must go through migration files.
- Supabase is used for PostgreSQL + Auth + Realtime only (no Edge Functions in production).
- **Project ref:** `zpswjccsxjtnhetkkqde`

### Multi-Tenancy & Security

- Row-Level Security (RLS) enforces tenant isolation at the database layer.
- Three user roles: **super_admin**, **admin**, **client**. Shopify merchants are always treated as `client`.
- The `effectiveClientId` pattern is used throughout to filter data per tenant.
- Platform OAuth tokens are stored encrypted (AES-256 via pgcrypto).
- Super admin is restricted to `jmbarros@bgconsult.cl`.

### Data Flow

```
Component → useAuth / useUserRole / React Query
    → callApi() (src/lib/api.ts)
    → Google Cloud Run (Hono, JWT verified)
    → Supabase PostgreSQL (RLS enforced)
    → React Query cache → UI update
```

### AI Integration

- **Steve chat** (`cloud-run-api/src/routes/ai/steve-chat.ts`): Claude Opus 4.6 for strategic advisory.
- **Copy generation** (`generate-copy`, `generate-meta-copy`, `generate-google-copy`): Claude Sonnet 4.6.
- **Image generation**: Fal.ai (Flux Pro).
- **Video generation**: Replicate (Kling AI v1.5).
- **Web scraping**: Firecrawl for competitor analysis.

### Key Conventions

- Path alias `@/` maps to `src/`. Use it for all imports within `src/`.
- TypeScript is configured loosely (no `strict`, no `noUnusedLocals`).
- Tailwind CSS uses HSL CSS custom properties defined in `src/index.css` — use semantic tokens (`bg-background`, `text-foreground`, etc.) rather than hardcoded colors.
- Toast notifications use Sonner (`import { toast } from "sonner"`).
- Forms use React Hook Form + Zod for validation.
- All backend calls use `callApi('function-name', { body: {...} })` — never call `supabase.functions.invoke()` directly.
- Cloud Run route handlers follow the pattern: `export async function handlerName(c: Context) { ... }` with `c.json()` for responses.

### Environment Variables

Frontend (in `.env`):
```
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_PROJECT_ID
VITE_API_URL                    # Cloud Run URL (required)
```

Backend secrets are managed in GCP Secret Manager: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `FAL_API_KEY`, `REPLICATE_API_KEY`, `FIRECRAWL_API_KEY`, Shopify/Meta/Google credentials.

### Deployment

- Frontend auto-deploys via Vercel on git push to `main`.
- Backend deploys via `gcloud run deploy` from `cloud-run-api/` directory.
- Supabase migrations apply via `npx supabase db push`.
- Production URL: Vercel (previously `betabg.lovable.app`).
