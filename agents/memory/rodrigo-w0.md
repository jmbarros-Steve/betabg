# Rodrigo W0 — Journal de Klaviyo

## 2026-04-06 — Integración GrapesJS en Campaign Studio (Flows y Campañas)

### Contexto
Campaign Studio tiene 2 wizards: uno para crear campañas y otro para flows de email automation. Ambos generaban HTML automático pero no permitían edición visual drag & drop. El módulo Steve Mail ya tenía un editor GrapesJS completo (`GrapesEmailEditor.tsx`) con bloques custom de Steve (productos, cupones, reviews, social, variables).

### Qué se hizo
Se integró el editor GrapesJS Studio SDK en ambos wizards de Campaign Studio, reemplazando el editor de bloques custom (`UnlayerEmailEditor` / `BlocksEditorWrapper`).

### Cambios realizados

**Nuevo componente:**
- `src/components/client-portal/campaign-studio/shared/GrapesStudioEmailEditor.tsx` — Wrapper fullscreen con soporte multi-email (tabs), inputs subject/previewText, botones guardar/cancelar. Usa `GrapesEmailEditor` como motor.

**Wizard de Flows (FlowWizard):**
- `FlowEditStep.tsx` — Swap de `UnlayerEmailEditor` a `GrapesStudioEmailEditor`, agregado prop `clientId`
- `FlowWizard.tsx` — Pasa `clientId` a FlowEditStep, import de `EditorEmail` actualizado
- `FlowContentStep.tsx` — Import de `EditorEmail` actualizado al nuevo path

**Wizard de Campañas (CampaignCreationWizard):**
- Steps de 4 → 5: `Tipo > Contenido > Editar > Preview > Programar`
- Agregado `designJson` a `CampaignData` para persistir el proyecto GrapesJS
- Step 2 (Editar): abre GrapesJS fullscreen fuera del Dialog (z-index 100)
- Al guardar: actualiza `htmlContent` + `designJson`, avanza a Preview
- Botón "Saltar y usar template original" para omitir edición
- HTML editado por usuario tiene prioridad sobre el generado automáticamente

**PreviewEditor:**
- No sobrescribe `htmlContent` si el usuario ya editó via GrapesJS (`designJson` presente)
- Botón "Regenerar" limpia `designJson` para volver al template original

### Resultado
- Compilación TypeScript limpia (0 errores)
- Testeado en Jardín de Eva — funcional
- Commit `0ce80f1` en main, push + deploy a Vercel

### Archivos tocados (5 editados + 1 nuevo)
- `campaign-studio/shared/GrapesStudioEmailEditor.tsx` — NUEVO
- `campaign-studio/flows/steps/FlowEditStep.tsx` — Editado
- `campaign-studio/flows/steps/FlowContentStep.tsx` — Editado
- `campaign-studio/flows/FlowWizard.tsx` — Editado
- `campaign-studio/create/CampaignCreationWizard.tsx` — Editado
- `campaign-studio/create/PreviewEditor.tsx` — Editado

### Documentación
- Notion: Rodrigo W0 página + sesión creadas
- MD local: agents/memory/rodrigo-w0.md (este archivo)

---

## Aprendizajes

### GrapesJS en Campaign Studio
- `GrapesEmailEditor` usa `getHtml()` async (compila MJML → HTML via `studio:projectFiles`)
- Al cambiar entre emails (tabs): exportar HTML + projectData del actual, cargar el siguiente con `loadDesign()` o `setHtml()`
- El editor funciona fullscreen (fixed inset-0 z-[100]) para evitar conflictos con el Dialog del wizard
- `designJson` permite restaurar el estado del editor entre sesiones
