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
