# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Steve Ads** is a multi-tenant SaaS marketing consulting platform. It features an AI chatbot ("Steve"), multi-channel ad management (Shopify, Meta, Google Ads, Klaviyo), competitor analysis, and creative asset generation. The stack is React + TypeScript (frontend) with Supabase (PostgreSQL + Edge Functions) as the backend.

## Commands

```bash
npm run dev        # Dev server at localhost:8080
npm run build      # Production build
npm run lint       # ESLint
npm test           # Run Vitest tests once
npm run test:watch # Run Vitest in watch mode
```

**Supabase (backend):**
```bash
npx supabase db push                          # Apply DB migrations
supabase functions deploy <function-name>     # Deploy a single edge function
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
- **`src/integrations/supabase/`** — Auto-generated Supabase client and TypeScript types. Do not edit manually.

### Backend (Supabase)

- **`supabase/functions/`** — 38 Deno serverless Edge Functions. Each function manually verifies JWT via a shared `getClaims()` helper (Supabase `verify_jwt = false` in config.toml).
- **`supabase/migrations/`** — 44 SQL migration files. New DB changes must go through migration files.

### Multi-Tenancy & Security

- Row-Level Security (RLS) enforces tenant isolation at the database layer.
- Three user roles: **super_admin**, **admin**, **client**. Shopify merchants are always treated as `client`.
- The `effectiveClientId` pattern is used throughout to filter data per tenant.
- Platform OAuth tokens are stored encrypted (AES-256 via pgcrypto).
- Super admin is restricted to `jmbarros@bgconsult.cl`.

### Data Flow

```
Component → useAuth / useUserRole / React Query
    → supabase.from() or supabase.functions.invoke()
    → Edge Function (JWT verified) → PostgreSQL (RLS enforced)
    → React Query cache → UI update
```

### AI Integration

- **Steve chat** (`supabase/functions/steve-chat`): Claude Opus 4.6 for strategic advisory.
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

### Environment Variables

Frontend (in `.env`, managed by Lovable):
```
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_PROJECT_ID
```

Backend secrets are managed in the Supabase dashboard (not in the repo): `ANTHROPIC_API_KEY`, `FAL_API_KEY`, `REPLICATE_API_KEY`, `FIRECRAWL_API_KEY`, Shopify/Meta/Google credentials.

### Deployment

- Frontend auto-deploys via Vercel on git push to `main`.
- Supabase migrations apply via `npx supabase db push`.
- Edge functions deploy individually with `npx supabase functions deploy <name> --no-verify-jwt --project-ref zpswjccsxjtnhetkkqde`.
- Production URL: Vercel (previously `betabg.lovable.app`).
