# QA Playbooks — Steve Ads

Guia de testing manual con Playwright MCP o ejecucion interactiva.

## Setup MCP (para testing interactivo con Claude Code)

Configurar en `~/betabg/.claude/settings.json`:
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--headed"]
    }
  }
}
```

## Credenciales de Test

- **Cliente:** patricio.correa@jardindeeva.cl / Jardin2026
- **Admin:** jmbarros@bgconsult.cl (super_admin)
- **URL prod:** https://betabgnuevosupa.vercel.app
- **API:** https://steve-api-850416724643.us-central1.run.app

---

## Playbook 1: Login & Auth Flow

1. Navegar a /auth
2. Ingresar email cliente
3. Ingresar password
4. Verificar redireccion a /portal
5. Verificar nombre del cliente visible
6. Verificar tabs: conexiones, metricas, campanas
7. Screenshot

**Criterio de exito:** Login < 5s, redirect correcto, no errores en consola.

---

## Playbook 2: Meta Ads Integration

1. Login como cliente
2. Navegar a /portal → tab Meta Ads
3. Verificar jerarquia Business carga
4. Seleccionar un Ad Account
5. Verificar campanas con metricas (ROAS, CPC, CPM)
6. Click "Sincronizar" → verificar lastSyncAt actualizado
7. Verificar scopes completos (useMetaScopes)
8. Screenshot

**Criterio de exito:** Campanas visibles, metricas numericas, sync < 30s.

---

## Playbook 3: Klaviyo Integration

1. Login como cliente
2. /portal → tab Conexiones
3. Verificar Klaviyo conectado
4. Verificar API key funcional
5. Sincronizar datos → verificar metricas
6. Verificar top products por engagement
7. Verificar flows sincronizados
8. Screenshot

**Criterio de exito:** Conexion activa, metricas presentes, sync < 30s.

---

## Playbook 4: Steve Mail

1. Login como cliente
2. /portal → tab Steve Mail
3. Verificar templates propios cargan
4. Verificar importar templates desde Klaviyo
5. Abrir editor → verificar drag & drop
6. Verificar metricas por campana (open rate, click rate)
7. Verificar metricas por flujo
8. Verificar calendario
9. Probar generacion con AI
10. Screenshot

**Criterio de exito:** Editor funcional, metricas visibles, AI responde < 30s.

---

## Playbook 5: Shopify Integration

1. Login como cliente
2. /portal → conexiones → Shopify connected
3. Verificar productos sincronizados
4. Verificar metricas (ventas, ordenes)
5. Screenshot

---

## Playbook 6: Steve Chat (AI)

1. Login como cliente
2. /portal → Steve Chat
3. Enviar "Analiza mis campanas de esta semana"
4. Verificar respuesta (no timeout, no error)
5. Verificar persistencia entre tabs
6. Enviar mensaje con contexto brief
7. Screenshot

**Criterio de exito:** Respuesta < 30s, chat persistente, respuesta coherente.

---

## Playbook 7: Campaign Creation

1. Login como cliente
2. /portal → Campanas → Crear nueva
3. Wizard: seleccionar Meta, objetivo, audiencia
4. Generar copy con AI
5. Preview
6. Guardar como borrador
7. Screenshot cada paso

---

## Playbook 8: Error & Edge Cases

1. Acceder /dashboard sin admin → verificar redirect
2. Acceder /portal sin client → verificar mensaje
3. Token expirado → verificar auto-refresh o redirect
4. Inputs invalidos → verificar Zod validation
5. Screenshot cada error state

---

## Playbook 9: Cross-Integration Data Flow

1. Sync Meta → metricas en dashboard
2. Sync Shopify → revenue en ROAS
3. Sync Klaviyo → email metrics
4. Steve Chat con datos recien sincronizados
5. Generar reporte multi-plataforma
