import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import EmailEditor, { EditorRef } from 'react-email-editor';
import { X, Save, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { unlayerMergeTagsConfig } from './klaviyoMergeTags';
import { htmlToUnlayerDesign, type UnlayerDesignJson } from './htmlToUnlayerDesign';
import { getSteveMailEditorOptions, registerSteveMailTools } from '@/components/client-portal/email/steveMailEditorConfig';

export interface EditorEmail {
  subject: string;
  previewText: string;
  htmlContent: string;
  designJson?: UnlayerDesignJson | null;
}

interface UnlayerEmailEditorProps {
  emails: EditorEmail[];
  onSave: (emails: EditorEmail[]) => void;
  onCancel: () => void;
}

export function UnlayerEmailEditor({ emails: initialEmails, onSave, onCancel }: UnlayerEmailEditorProps) {
  const emailEditorRef = useRef<EditorRef>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [emails, setEmails] = useState<EditorEmail[]>(() =>
    initialEmails.map((e) => ({
      ...e,
      designJson: e.designJson || htmlToUnlayerDesign(e.htmlContent),
    }))
  );
  const [editorReady, setEditorReady] = useState(false);
  const [saving, setSaving] = useState(false);

  // Memoize Unlayer options to prevent editor re-creation on every render
  const editorOptions = useMemo(
    () => getSteveMailEditorOptions({ mergeTagsOverride: unlayerMergeTagsConfig.mergeTags }),
    []
  );

  const currentEmail = emails[activeIndex];

  // Load design when editor becomes ready
  useEffect(() => {
    if (editorReady && currentEmail?.designJson) {
      emailEditorRef.current?.editor?.loadDesign(currentEmail.designJson as any);
    }
  }, [editorReady]);

  // Force react-email-editor internal divs to fill container height
  // The library sets hardcoded heights (500px/150px) on its wrapper divs
  useEffect(() => {
    if (!editorReady || !editorContainerRef.current) return;
    const container = editorContainerRef.current;
    // Target: container > react-email-editor-root > inner-flex-div
    const root = container.querySelector(':scope > div');
    if (root instanceof HTMLElement) {
      root.style.height = '100%';
      const inner = root.querySelector(':scope > div');
      if (inner instanceof HTMLElement) {
        inner.style.height = '100%';
      }
    }
  }, [editorReady]);

  const saveCurrentEmail = useCallback((): Promise<EditorEmail[]> => {
    return new Promise((resolve) => {
      const editor = emailEditorRef.current?.editor;
      if (!editor) {
        resolve(emails);
        return;
      }

      editor.saveDesign((design: any) => {
        editor.exportHtml(({ html }: { html: string }) => {
          const updated = emails.map((e, i) =>
            i === activeIndex ? { ...e, designJson: design, htmlContent: html } : e
          );
          setEmails(updated);
          resolve(updated);
        });
      });
    });
  }, [activeIndex, emails]);

  const handleTabChange = useCallback(
    async (newIndex: number) => {
      if (newIndex === activeIndex || !editorReady) return;

      // Save current email state
      const updated = await saveCurrentEmail();

      setActiveIndex(newIndex);
      // Load the new email design
      const nextDesign = updated[newIndex]?.designJson;
      if (nextDesign) {
        emailEditorRef.current?.editor?.loadDesign(nextDesign as any);
      }
    },
    [activeIndex, editorReady, saveCurrentEmail]
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const finalEmails = await saveCurrentEmail();
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

      {/* Unlayer editor */}
      <div className="flex-1 min-h-0 relative">
        <div ref={editorContainerRef} className="absolute inset-0">
          <EmailEditor
            ref={emailEditorRef}
            onReady={() => {
              setEditorReady(true);
            }}
            options={editorOptions}
            style={{ height: '100%' }}
          />
        </div>
      </div>
    </div>
  );
}
