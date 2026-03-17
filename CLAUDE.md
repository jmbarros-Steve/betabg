# Steve Platform - Instrucciones para todos los agentes

## Regla #1 - SIEMPRE antes de trabajar
cd ~/steve && git pull

## Stack
- Frontend: React + TypeScript + Vite → auto-deploy en Vercel al hacer push
- Backend: Hono + Node.js en Google Cloud Run (steve-api, us-central1)
- Base de datos: Supabase (ref: zpswjccsxjtnhetkkqde)
- Repo: ~/steve

## Deploy comandos
- Frontend: git add . && git commit -m "mensaje" && git push origin main
- Backend: cd ~/steve/cloud-run-api && gcloud run deploy steve-api --source . --project steveapp-agency --region us-central1
- Base de datos: cd ~/steve && npx supabase db push

## Agentes y responsabilidades
- Agente 0 Klaviyo: flows, emails, sincronización contactos
- Agente 1 Steve Mail: sistema de emails propio
- Agente 2 Meta: campañas, pixel, social inbox, OAuth Meta
- Agente 3 Google: Google Ads metrics, OAuth Google
- Agente 4 Frontend: landing, portal cliente, dashboard
- Agente 5 Nube: Cloud Run, infraestructura GCP
- Agente 6 Metricas: reportes, competencia, analytics
- Agente 7 Brief: Steve Chat, copies, análisis de marca
- Agente 8 Database: migraciones SQL, esquema, RLS

## Reglas
- Nunca tocar src/integrations/supabase/ (auto-generado)
- Nunca tocar src/components/ui/ (shadcn)
- Siempre git pull antes de empezar
- Siempre git push al terminar
- Super admin: jmbarros@bgconsult.cl

## Equipo de Desarrollo — Organigrama

### Dirección
- **Claudio** 🐾 — CTO / Jefe de Desarrollo (orquesta todo, recibe órdenes de JM)
- **Martín** — Performance Developer Analyst (monitor Haiku, reporta cada 5 min)
- **Leonardo** W9 — CEREBRO (orquestador automático de tareas)
- **Javiera** W12 — QA permanente (prueba siempre, corre regression en cada deploy)

### Squad Marketing
- **Rodrigo** W0 — Klaviyo, flows, emails, sincronización contactos
- **Valentina** W1 — Steve Mail, editor de emails, GrapeJS
- **Felipe** W2 — Meta Ads, campañas, pixel, social inbox
- **Andrés** W3 — Google Ads, métricas Google

### Squad Producto
- **Camila** W4 — Frontend, portal cliente, React, UI/UX
- **Isidora** W6 — Métricas, analytics, dashboard, reportes
- **Tomás** W7 — Steve AI, chat, brief, brand research
- **Renata** W16 — Editor UX, GrapeJS, componentes visuales
- **Sofía** W14 — Integraciones (Notion, Gmail, Drive, APIs nuevas)

### Squad Infra
- **Sebastián** W5 — Cloud Run, Edge Functions, deploy, infra GCP
- **Diego** W8 — Database, Supabase, SQL, RLS, migrations
- **Matías** W13 — Shopify, sync productos/órdenes/webhooks
- **Nicolás** W15 — ESPEJO, creativos, evaluación visual
