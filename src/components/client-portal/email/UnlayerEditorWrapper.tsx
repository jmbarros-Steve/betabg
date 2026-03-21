import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import EmailEditor, { EditorRef, type EmailEditorProps } from 'react-email-editor';
import { callApi } from '@/lib/api';
import customToolsCode from '@/assets/unlayer-custom-tools.js?raw';

export interface UnlayerEditorRef {
  getHtml: () => Promise<string>;
  getProjectData: () => any;
  loadDesign: (design: any) => void;
  setHtml: (html: string) => void;
}

interface UnlayerEditorWrapperProps {
  onChange?: () => void;
  initialDesign?: any;
  onReady?: () => void;
  clientId?: string;
}

const editorOptions: EmailEditorProps['options'] = {
  appearance: {
    theme: 'light',
    panels: {
      tools: {
        dock: 'left',
      },
    },
  },
  tools: {
    form: { enabled: false },
    menu: { enabled: false },
    video: { enabled: true },
  },
  mergeTags: {
    first_name: { name: 'Nombre', value: '{{first_name}}' },
    email: { name: 'Email', value: '{{email}}' },
    unsubscribe_url: { name: 'Link desuscribir', value: '{{unsubscribe_url}}' },
  },
  features: {
    textEditor: {
      spellChecker: true,
    },
  },
  customJS: [customToolsCode],
  locale: 'es-ES',
};

const UnlayerEditorWrapper = forwardRef<UnlayerEditorRef, UnlayerEditorWrapperProps>(
  ({ onChange, initialDesign, onReady, clientId }, ref) => {
    const editorRef = useRef<EditorRef>(null);
    const latestDesignRef = useRef<any>(initialDesign || null);

    // Pre-load Shopify products for custom tools (steve_product_rec, etc.)
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
          // Products are optional — custom tools degrade gracefully
        }
      })();
    }, [clientId]);

    const syncDesignSnapshot = () => {
      const editor = editorRef.current?.editor;
      if (!editor) return;
      editor.saveDesign((design: any) => {
        latestDesignRef.current = design;
      });
    };

    useEffect(() => {
      if (!initialDesign || !editorRef.current?.editor) return;
      editorRef.current.editor.loadDesign(initialDesign);
      latestDesignRef.current = initialDesign;
    }, [initialDesign]);

    useImperativeHandle(ref, () => ({
      getHtml: () => {
        const editor = editorRef.current?.editor;
        if (!editor) return Promise.resolve('');
        return new Promise((resolve) => {
          editor.exportHtml((data: any) => {
            latestDesignRef.current = data?.design ?? latestDesignRef.current;
            resolve(data?.html || '');
          });
        });
      },
      getProjectData: () => latestDesignRef.current,
      loadDesign: (design: any) => {
        const editor = editorRef.current?.editor;
        if (!editor || !design) return;
        editor.loadDesign(design);
        latestDesignRef.current = design;
      },
      setHtml: (_html: string) => {
        // Legacy no-op: Unlayer works with design JSON
      },
    }));

    const handleReady = () => {
      const editor = editorRef.current?.editor;
      if (!editor) return;

      if (initialDesign) {
        editor.loadDesign(initialDesign);
        latestDesignRef.current = initialDesign;
      } else {
        syncDesignSnapshot();
      }

      editor.addEventListener('design:updated', () => {
        syncDesignSnapshot();
        onChange?.();
      });

      onReady?.();
    };

    return (
      <div style={{ height: '100%', minHeight: '500px' }}>
        <EmailEditor ref={editorRef} onReady={handleReady} options={editorOptions} />
      </div>
    );
  },
);

UnlayerEditorWrapper.displayName = 'UnlayerEditorWrapper';

export default UnlayerEditorWrapper;
