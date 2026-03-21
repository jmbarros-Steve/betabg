import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import StudioEditor from '@grapesjs/studio-sdk/react';
import '@grapesjs/studio-sdk/style';
import type { Editor } from 'grapesjs';
import type { CreateEditorOptions } from '@grapesjs/studio-sdk';
import { getSteveTheme } from './grapes-theme';
import { steveBlocks } from './grapes-steve-blocks';
import { callApi } from '@/lib/api';

export interface UnlayerEditorRef {
  getHtml: () => Promise<string>;
  getProjectData: () => any;
  loadDesign: (design: any) => void;
  setHtml: (html: string) => void;
}

interface GrapesEmailEditorProps {
  onChange?: () => void;
  initialDesign?: any;
  onReady?: () => void;
  clientId?: string;
  brandColor?: string;
}

const LICENSE_KEY = import.meta.env.VITE_GRAPESJS_LICENSE_KEY || '';

const GrapesEmailEditor = forwardRef<UnlayerEditorRef, GrapesEmailEditorProps>(
  ({ onChange, initialDesign, onReady, clientId, brandColor }, ref) => {
    const editorRef = useRef<Editor | null>(null);
    const [ready, setReady] = useState(false);
    const initialDesignLoaded = useRef(false);

    // Pre-load Shopify products for custom blocks
    useEffect(() => {
      if (!clientId) return;
      (async () => {
        try {
          const { data } = await callApi<any>('email-product-recommendations', {
            body: { action: 'list_products', client_id: clientId },
          });
          if (data?.products) {
            (window as any).__steveProducts = data.products;
          }
        } catch {
          // Products are optional
        }
      })();
    }, [clientId]);

    useImperativeHandle(ref, () => ({
      getHtml: async () => {
        const editor = editorRef.current;
        if (!editor) return '';
        try {
          // Use studio:projectFiles to compile MJML → HTML
          const result = editor.runCommand('studio:projectFiles', { styles: 'inline' });
          if (result?.files) {
            const htmlFile = result.files.find(
              (f: any) => f.mimeType === 'text/html' || f.filename?.endsWith('.html')
            );
            if (htmlFile?.content) {
              return typeof htmlFile.content === 'string'
                ? htmlFile.content
                : await (htmlFile.content as Blob).text();
            }
          }
          // Fallback: get raw HTML from editor
          return editor.getHtml({ cleanId: true }) || '';
        } catch {
          return editor.getHtml({ cleanId: true }) || '';
        }
      },

      getProjectData: () => {
        const editor = editorRef.current;
        if (!editor) return null;
        return editor.getProjectData();
      },

      loadDesign: (design: any) => {
        const editor = editorRef.current;
        if (!editor || !design) return;

        // Detect Unlayer format and skip (incompatible)
        if (design?.body?.rows) {
          console.warn('[GrapesEditor] Unlayer design detected — skipping loadDesign');
          return;
        }

        editor.loadProjectData(design);
      },

      setHtml: (_html: string) => {
        // Legacy no-op
      },
    }));

    const handleEditor = (editor: Editor) => {
      editorRef.current = editor;
    };

    const handleReady = (editor: Editor) => {
      editorRef.current = editor;
      setReady(true);

      // Load initial design if provided
      if (initialDesign && !initialDesignLoaded.current) {
        initialDesignLoaded.current = true;
        if (initialDesign?.body?.rows) {
          // Unlayer format — ignore
          console.warn('[GrapesEditor] Unlayer design detected on ready — not loading');
        } else {
          editor.loadProjectData(initialDesign);
        }
      }

      onReady?.();
    };

    const handleUpdate = () => {
      onChange?.();
    };

    // Load design when it changes externally (e.g. AI generation, template selection)
    useEffect(() => {
      if (!ready || !editorRef.current || !initialDesign) return;
      if (initialDesignLoaded.current) return;
      initialDesignLoaded.current = true;

      if (initialDesign?.body?.rows) return; // Unlayer format
      editorRef.current.loadProjectData(initialDesign);
    }, [ready, initialDesign]);

    const studioOptions: CreateEditorOptions = {
      licenseKey: LICENSE_KEY,
      project: {
        type: 'email',
      },
      theme: 'light',
      customTheme: getSteveTheme(brandColor),
      blocks: {
        default: steveBlocks,
      },
      settingsMenu: {
        about: false,
        embed: false,
        installApp: false,
      },
      i18n: {
        locales: {
          en: {
            'blockManager.labels.Steve': 'Steve',
            'blockManager.labels.Variables': 'Variables',
          },
        },
      },
    };

    return (
      <div style={{ height: '100%', minHeight: '500px' }}>
        <StudioEditor
          options={studioOptions}
          onEditor={handleEditor}
          onReady={handleReady}
          onUpdate={handleUpdate}
        />
      </div>
    );
  },
);

GrapesEmailEditor.displayName = 'GrapesEmailEditor';

export default GrapesEmailEditor;
