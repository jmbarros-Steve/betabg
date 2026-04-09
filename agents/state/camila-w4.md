# Camila W4 — Estado Actual

**Última sesión:** 2026-04-08

## Trabajo completado hoy (sesión con JM)

### Tarea — Integrar GrapesJS Editor en Campaign Studio ✅

**Contexto:** Los 2 wizards del Campaign Studio (campañas y flows) generaban HTML automático pero NO tenían edición visual drag & drop. El módulo Steve Mail ya tiene `GrapesEmailEditor.tsx` (GrapesJS Studio SDK) con bloques custom de Steve (productos, cupones, reviews, social, variables). Objetivo: usar el mismo editor en ambos wizards.

**Estado previo:**
- `CampaignCreationWizard` → Step 2 (PreviewEditor) solo mostraba iframe estático, no editable.
- `FlowWizard` → Step 2 (FlowEditStep) usaba `UnlayerEmailEditor` → `BlocksEditorWrapper` → `EmailBlockEditor` (editor custom de bloques, NO GrapesJS).

**Implementación entregada:**

1. **Wrapper nuevo `GrapesStudioEmailEditor`** (`src/components/client-portal/campaign-studio/shared/GrapesStudioEmailEditor.tsx`)
   - Fullscreen (`fixed inset-0 z-[100]`), mismo z-index que `UnlayerEmailEditor`.
   - Soporte multi-email con tabs (navegación con ChevronLeft/Right entre emails de un flow).
   - Inputs de subject y previewText por encima del editor.
   - Al cambiar de tab: `getHtml()` + `getProjectData()` del email actual, `setHtml()`/`loadDesign()` del siguiente.
   - Al guardar: exporta todos los emails con `htmlContent` + `designJson` → `onSave(updatedEmails)`.
   - Props: `{ emails, onSave, onCancel, clientId?, brandColor? }`.
   - Export del type `EditorEmail` desde este archivo (source of truth).

2. **`FlowEditStep.tsx` refactor**
   - Swap del import: ya no importa `UnlayerEmailEditor` sino `GrapesStudioEmailEditor`.
   - Patrón "render at root level" cuando `showEditor=true` (evita z-index / transform issues): retorna el editor directamente, fuera del layout del step.
   - Mantiene las cards de resumen de emails con badge "Editado" cuando el htmlContent difiere del generado.
   - Agregada prop `clientId` a `FlowEditStepProps`.

3. **`FlowWizard.tsx` pasa clientId a FlowEditStep**
   - Cambio puntual: `<FlowEditStep ... clientId={clientId} />`.
   - Import de `EditorEmail` cambió desde `../../klaviyo/UnlayerEmailEditor` a `../shared/GrapesStudioEmailEditor` (nuevo source of truth).

4. **`CampaignCreationWizard.tsx` — nuevo step "Editar"**
   - Steps: 4 → 5: `['Tipo', 'Contenido', 'Editar', 'Preview', 'Programar']`.
   - Agregado `designJson` al `CampaignData` + en `buildInitialData()` (ambos branches: nuevo y editCampaign).
   - Step 2 ("Editar") muestra card de intro con botón "Abrir editor" + escape "Saltar y usar template original".
   - Cuando `step===2` y se clickea "Siguiente": `setShowGrapesEditor(true)` en vez de avanzar step.
   - Editor renderizado **fuera del `DialogContent`** (portal natural de React, como sibling dentro del `Dialog`) para que el fullscreen no quede confinado al dialog.
   - Al guardar del editor: actualiza `htmlContent`, `designJson`, `subject`, `previewText` del campaignData → avanza a step 3 (Preview).
   - Al cancelar: cierra editor, se queda en step 2.
   - `effectiveHtml = campaignData.htmlContent || htmlContent` — la versión editada tiene prioridad sobre la generada. Preview y SchedulePublish usan `effectiveHtml`.
   - `canAdvance` extendido a 5 steps.

5. **`PreviewEditor.tsx` — respeta HTML editado**
   - `useEffect` de sincronización con HTML generado ahora solo sobrescribe si `!campaignData.designJson`. Esto preserva la edición del usuario al volver a Preview desde otro step.
   - Botón "Regenerar" limpia ambos: `onUpdate({ htmlContent: '', designJson: null })` → vuelve a usar el generado.

**Verificación:**
- `npx tsc --noEmit` → limpio, sin errores.
- NO se ha commiteado ni pusheado ni deployado.

## Files modificados esta sesión
- `src/components/client-portal/campaign-studio/shared/GrapesStudioEmailEditor.tsx` — **NEW** (wrapper fullscreen multi-email con tabs + subject/preview inputs, usa `GrapesEmailEditor` del módulo email)
- `src/components/client-portal/campaign-studio/flows/steps/FlowEditStep.tsx` — swap a GrapesStudioEmailEditor, render at root, agregado clientId
- `src/components/client-portal/campaign-studio/flows/FlowWizard.tsx` — pasa clientId a FlowEditStep, import de EditorEmail desde el nuevo wrapper
- `src/components/client-portal/campaign-studio/create/CampaignCreationWizard.tsx` — 5 steps (nuevo "Editar"), designJson en state, editor fullscreen fuera del Dialog, effectiveHtml
- `src/components/client-portal/campaign-studio/create/PreviewEditor.tsx` — useEffect respeta designJson, botón Regenerar limpia ambos

## Pendientes / Follow-ups

### Pendientes de esta tarea
- **Code review**: falta pasar por Isidora W6 (frontend/UX, estados de carga, edge cases del editor fullscreen). No commiteado aún.
- **Prueba e2e manual** en dev:
  1. Campaign Studio > Crear Campaña > llegar a "Editar" → GrapesJS fullscreen con HTML generado → editar drag & drop → Guardar → Preview muestra cambios → Programar.
  2. Campaign Studio > Flows > crear flow > "Editar" → GrapesJS fullscreen con emails del flow (con tabs si >1) → editar → Publicar.
  3. Verificar que los bloques custom de Steve (productos, cupones, etc.) cargan correctamente dentro del editor embebido en Campaign Studio.
  4. Verificar que `designJson` persiste al navegar Step 2 ↔ Step 3 ↔ Step 4 sin perder la edición.

### Hardening pendiente (no bloqueante)
- **Iframe sandbox en `campaign-studio/`**: `PreviewEditor.tsx:118` usa `sandbox="allow-same-origin allow-scripts"`. Valentina W1 ya hizo el hardening en `client-portal/email/` (Tarea 7, sesión 2026-04-08) sacando `allow-scripts`. Queda pendiente una auditoría equivalente en `campaign-studio/` para consistencia de seguridad. Candidato a coordinar con Rodrigo W0 o Valentina W1.

### Problemas conocidos heredados (de context)
- 130+ componentes sin design system consistente.
- Onboarding se rompe en paso 3 sin platform_connection.
- Botones que no hacen nada.
- Mobile responsive inconsistente.

## Coordinación cruzada
- **Valentina W1 (Steve Mail)**: dueña de `GrapesEmailEditor.tsx` (el editor base reusado). NO modifiqué su archivo — solo lo importo. Ya confirmó en su sesión 2026-04-08 (Tarea 6) que `brandColor` prop fluye end-to-end a `grapes-steve-blocks.ts` → `grapes-theme.ts`, así que los bloques custom heredan color del cliente correctamente también cuando se embebe desde Campaign Studio.
- **Rodrigo W0 (Klaviyo)**: `UnlayerEmailEditor.tsx` (el viejo editor que reemplazamos en FlowEditStep) sigue viviendo en `src/components/client-portal/klaviyo/` — NO lo borré porque puede usarse en otros lugares (pendiente verificar referencias antes de deprecar).
