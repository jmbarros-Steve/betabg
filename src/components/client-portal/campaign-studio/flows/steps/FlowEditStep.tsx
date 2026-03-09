import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, ArrowLeft, Paintbrush } from 'lucide-react';
import { type FlowTemplate } from '../FlowTemplates';
import { type FlowWizardState } from '../FlowWizard';
import { UnlayerEmailEditor, type EditorEmail } from '../../../klaviyo/UnlayerEmailEditor';

interface FlowEditStepProps {
  template: FlowTemplate;
  state: FlowWizardState;
  updateState: (partial: Partial<FlowWizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function FlowEditStep({ template, state, updateState, onNext, onBack }: FlowEditStepProps) {
  const [showEditor, setShowEditor] = useState(false);

  const handleOpenEditor = () => {
    setShowEditor(true);
  };

  const handleEditorSave = (updated: EditorEmail[]) => {
    updateState({ editedEmails: updated });
    setShowEditor(false);
  };

  const handleEditorCancel = () => {
    setShowEditor(false);
  };

  const hasEdited = state.editedEmails.length > 0 && state.editedEmails.some(
    (e, i) => e.htmlContent !== state.generatedEmails[i]?.htmlContent
  );

  // Editor is rendered at root level to avoid z-index / transform issues
  if (showEditor) {
    return (
      <UnlayerEmailEditor
        emails={state.editedEmails.length > 0 ? state.editedEmails : state.generatedEmails}
        onSave={handleEditorSave}
        onCancel={handleEditorCancel}
      />
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Editar emails</h2>
        <p className="text-sm text-muted-foreground">
          Usa el editor visual para personalizar el diseño de cada email. Puedes arrastrar bloques, cambiar colores, imagenes y textos.
        </p>
      </div>

      {/* Email summary cards */}
      <div className="space-y-3">
        {(state.editedEmails.length > 0 ? state.editedEmails : state.generatedEmails).map((email, idx) => (
          <div key={idx} className="flex items-center gap-4 p-4 border rounded-lg bg-muted/20">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
              {idx + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{email.subject}</p>
              <p className="text-xs text-muted-foreground truncate">{email.previewText}</p>
            </div>
            {hasEdited && idx < state.editedEmails.length && state.editedEmails[idx].htmlContent !== state.generatedEmails[idx]?.htmlContent && (
              <span className="text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Editado</span>
            )}
          </div>
        ))}
      </div>

      {/* Open editor button */}
      <div className="flex justify-center py-4">
        <Button onClick={handleOpenEditor} size="lg" className="gap-2">
          <Paintbrush className="w-4 h-4" />
          {hasEdited ? 'Editar de nuevo' : 'Abrir editor visual'}
        </Button>
      </div>

      {hasEdited && (
        <p className="text-center text-sm text-green-600">
          Los emails han sido editados. Puedes continuar o volver a editarlos.
        </p>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Atras
        </Button>
        <Button onClick={onNext} size="lg">
          Siguiente: Publicar
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
