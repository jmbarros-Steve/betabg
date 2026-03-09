import { type FlowTemplate } from './FlowTemplates';
import { FlowWizard } from './FlowWizard';

interface FlowDetailProps {
  template: FlowTemplate;
  clientId: string;
  open: boolean;
  onClose: () => void;
  onFlowCreated?: () => void;
}

export function FlowDetail({ template, clientId, open, onClose, onFlowCreated }: FlowDetailProps) {
  if (!open) return null;

  return (
    <FlowWizard
      template={template}
      clientId={clientId}
      onClose={onClose}
      onFlowCreated={onFlowCreated}
    />
  );
}
