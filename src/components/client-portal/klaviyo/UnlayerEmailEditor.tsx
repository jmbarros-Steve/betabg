import { useRef, useState, useCallback } from 'react';
import { X, Save, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { SteveMailEditor, type SteveMailEditorRef } from '../email/SteveMailEditor';

export interface EditorEmail {
  subject: string;
  previewText: string;
  htmlContent: string;
  designJson?: any | null;
}

interface UnlayerEmailEditorProps {
  emails: EditorEmail[];
  onSave: (emails: EditorEmail[]) => void;
  onCancel: () => void;
}

export function UnlayerEmailEditor({ emails: initialEmails, onSave, onCancel }: UnlayerEmailEditorProps) {
  const emailEditorRef = useRef<SteveMailEditorRef>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [emails, setEmails] = useState<EditorEmail[]>(() =>
    initialEmails.map((e) => ({ ...e }))
  );
  const [editorReady, setEditorReady] = useState(false);
  const [saving, setSaving] = useState(false);

  const currentEmail = emails[activeIndex];

  const handleEditorReady = useCallback(() => {
    setEditorReady(true);
    const email = initialEmails[0];
    if (email) {
      emailEditorRef.current?.loadDesign(email.htmlContent, email.designJson);
    }
  }, [initialEmails]);

  const saveCurrentEmail = useCallback((): EditorEmail[] => {
    const editor = emailEditorRef.current;
    if (!editor) return emails;

    const html = editor.getHtml();
    const projectData = editor.getProjectData();
    const updated = emails.map((e, i) =>
      i === activeIndex ? { ...e, designJson: projectData, htmlContent: html } : e
    );
    setEmails(updated);
    return updated;
  }, [activeIndex, emails]);

  const handleTabChange = useCallback(
    (newIndex: number) => {
      if (newIndex === activeIndex || !editorReady) return;

      // Save current email state
      const updated = saveCurrentEmail();

      setActiveIndex(newIndex);
      // Load the new email design
      const nextEmail = updated[newIndex];
      if (nextEmail) {
        emailEditorRef.current?.loadDesign(nextEmail.htmlContent, nextEmail.designJson);
      }
    },
    [activeIndex, editorReady, saveCurrentEmail]
  );

  const handleSave = useCallback(() => {
    setSaving(true);
    try {
      const finalEmails = saveCurrentEmail();
      onSave(finalEmails);
      toast.success('Emails guardados');
    } catch (err) {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  }, [saveCurrentEmail, onSave]);

  const updateField = (field: 'subject' | 'previewText', value: string) => {
    setEmails((prev) =>
      prev.map((e, i) => (i === activeIndex ? { ...e, [field]: value } : e))
    );
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/50 shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="w-4 h-4 mr-1" /> Cerrar
          </Button>
          <span className="text-sm font-medium text-muted-foreground">
            Editor de Emails ({emails.length})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-1" />
            {saving ? 'Guardando...' : 'Guardar y continuar'}
          </Button>
        </div>
      </div>

      {/* Email tabs */}
      {emails.length > 1 && (
        <div className="flex items-center gap-1 px-4 py-2 border-b bg-muted/30 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={activeIndex === 0}
            onClick={() => handleTabChange(activeIndex - 1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          {emails.map((email, idx) => (
            <Button
              key={idx}
              variant={idx === activeIndex ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => handleTabChange(idx)}
            >
              Email {idx + 1}
              {email.subject ? `: ${email.subject.slice(0, 25)}${email.subject.length > 25 ? '...' : ''}` : ''}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={activeIndex === emails.length - 1}
            onClick={() => handleTabChange(activeIndex + 1)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Subject + preview text */}
      <div className="flex items-center gap-4 px-4 py-2 border-b shrink-0">
        <div className="flex items-center gap-2 flex-1">
          <Label className="text-xs whitespace-nowrap">Asunto:</Label>
          <Input
            value={currentEmail?.subject || ''}
            onChange={(e) => updateField('subject', e.target.value)}
            className="h-8 text-sm"
            placeholder="Asunto del email"
          />
        </div>
        <div className="flex items-center gap-2 flex-1">
          <Label className="text-xs whitespace-nowrap">Preview:</Label>
          <Input
            value={currentEmail?.previewText || ''}
            onChange={(e) => updateField('previewText', e.target.value)}
            className="h-8 text-sm"
            placeholder="Texto de preview"
          />
        </div>
      </div>

      {/* GrapeJS editor */}
      <div className="flex-1 min-h-0 relative">
        <div className="absolute inset-0">
          <SteveMailEditor
            ref={emailEditorRef}
            onReady={handleEditorReady}
            style={{ height: '100%' }}
          />
        </div>
      </div>
    </div>
  );
}
