import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import StudioEditor from '@grapesjs/studio-sdk/react';
import '@grapesjs/studio-sdk/style';
import type { Editor } from 'grapesjs';
import type { CreateEditorOptions } from '@grapesjs/studio-sdk';
import { getSteveTheme } from './grapes-theme';
import { steveBlocks, registerSteveBlocks } from './grapes-steve-blocks';
import { callApi } from '@/lib/api';

export interface UnlayerEditorRef {
  getHtml: () => Promise<string>;
  getProjectData: () => any;
  loadDesign: (design: any) => void;
  setHtml: (html: string) => void;
  insertHtml: (html: string) => void;
}

interface GrapesEmailEditorProps {
  onChange?: () => void;
  initialDesign?: any;
  onReady?: () => void;
  clientId?: string;
  brandColor?: string;
}

const LICENSE_KEY = import.meta.env.VITE_GRAPESJS_LICENSE_KEY || '';

// Spanish locale for the Studio SDK
const esLocale: Record<string, any> = {
  add: 'Agregar',
  delete: 'Eliminar',
  duplicate: 'Duplicar',
  rename: 'Renombrar',
  remove: 'Quitar',
  clear: 'Limpiar',
  select: 'Seleccionar',
  selectList: 'Seleccionar de lista',
  search: 'Buscar',
  update: 'Actualizar',
  updated: 'Actualizado',
  confirm: 'Confirmar',
  cancel: 'Cancelar',
  enable: 'Activar',
  disable: 'Desactivar',
  upload: 'Subir',
  close: 'Cerrar',
  load: 'Cargar',
  copy: 'Copiar',
  save: 'Guardar',
  error: 'Error',
  current: 'Actual',
  toggleCss: 'Alternar CSS',
  selectTarget: 'Seleccionar objetivo',
  noCode: 'Sin código',
  noItems: 'Sin elementos',
  confirmAction: '¿Estás seguro?',
  notItemsFound: 'No se encontraron elementos',
  actions: {
    componentOutline: { title: 'Contorno de componentes' },
    preview: { title: 'Vista previa' },
    fullscreen: { title: 'Pantalla completa' },
    showCode: { title: 'Ver código', exportButton: 'Exportar', content: 'Código' },
    undo: { title: 'Deshacer' },
    redo: { title: 'Rehacer' },
    save: { title: 'Guardar' },
    store: { title: 'Guardar' },
    open: { title: 'Abrir' },
    importCode: { title: 'Importar código', parseError: 'Error al parsear', content: 'Pega tu código aquí', button: 'Importar' },
    clearCanvas: { title: 'Limpiar canvas', content: '¿Estás seguro de que quieres limpiar todo el contenido?' },
    about: { title: 'Acerca de' },
    embed: { title: 'Embeber' },
    newProject: { title: 'Nuevo proyecto' },
    installApp: { title: 'Instalar app', installed: 'Instalado' },
  },
  blockManager: {
    notFound: 'No se encontraron bloques',
    blocks: 'Bloques',
    add: 'Agregar bloque',
    search: 'Buscar bloques...',
    labels: {
      section: 'Sección',
      column1: '1 Columna',
      column2: '2 Columnas',
      column3: '3 Columnas',
      'column3-7': '2 Columnas 3/7',
      gridRow: 'Fila',
      heading: 'Encabezado',
      divider: 'Divisor',
      imageBox: 'Imagen',
      linkBox: 'Enlace',
    },
    types: { regular: 'Bloques', symbols: 'Símbolos' },
    symbols: {
      notFound: 'No se encontraron símbolos',
      instancesProject: 'instancias en el proyecto',
      delete: 'Eliminar símbolo',
      deleteConfirm: '¿Eliminar este símbolo y todas sus instancias?',
    },
  },
  domComponents: {
    names: {
      section: 'Sección',
      gridRow: 'Fila',
      gridColumn: 'Columna',
      heading: 'Encabezado',
      divider: 'Divisor',
      imageBox: 'Imagen',
      linkBox: 'Enlace',
    },
  },
  traitManager: {
    empty: 'Selecciona un elemento para ver sus propiedades',
    panelLabel: 'Propiedades',
    traits: {
      labels: { loading: 'Cargando...', target: 'Destino', showList: 'Mostrar lista', customAttributes: 'Atributos personalizados' },
      attributes: {},
    },
  },
  styleManager: {
    panelLabel: 'Estilos',
    properties: {
      'font-family': 'Tipografía',
      'font-size': 'Tamaño de fuente',
      'font-weight': 'Peso de fuente',
      'letter-spacing': 'Espaciado de letras',
      'text-align': 'Alineación de texto',
      'text-decoration': 'Decoración de texto',
      'text-transform': 'Transformación de texto',
    },
  },
  layerManager: { layers: 'Capas' },
  deviceManager: { allDevices: 'Todos los dispositivos' },
  assetManager: {
    addUrl: 'Agregar URL',
    projectAssets: 'Recursos del proyecto',
    userAssets: 'Mis recursos',
    errorLoad: 'Error al cargar recursos',
    errorUpload: 'Error al subir',
    errorDelete: 'Error al eliminar',
    deleteConfirmQuestion: '¿Eliminar este recurso?',
    deleteConfirmExplanation: 'Esta acción no se puede deshacer',
    assetTypes: { all: 'Todos', image: 'Imágenes' },
    noProvider: 'No hay proveedor de recursos configurado',
  },
  storageManager: {
    errorLoad: 'Error al cargar el proyecto',
    errorStore: 'Error al guardar el proyecto',
  },
  selectorManager: {
    noSelecton: 'Sin selección',
    selectFromCanvas: 'Seleccionar del canvas',
    selection: 'Selección',
    selector: 'Selector',
    target: 'Objetivo',
    device: 'Dispositivo',
    state: 'Estado',
  },
  pageManager: {
    pages: 'Páginas',
    page: 'Página',
    newPage: 'Nueva página',
    add: 'Agregar',
    rename: 'Renombrar',
    duplicate: 'Duplicar',
    copy: 'Copiar',
    delete: 'Eliminar',
    deletePage: 'Eliminar página',
    confirmDelete: '¿Eliminar esta página?',
    homePage: 'Página principal',
    settings: { label: 'Configuración', title: 'Configuración de página', global: 'Global' },
  },
};

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
          // studio:projectFiles compiles MJML → full HTML email (may return Promise)
          let result = editor.runCommand('studio:projectFiles', { styles: 'inline' });
          if (result instanceof Promise) result = await result;
          if (result?.files) {
            const htmlFile = result.files.find(
              (f: any) => f.mimeType === 'text/html' || f.filename?.endsWith('.html')
            );
            if (htmlFile?.content) {
              const content = htmlFile.content instanceof Blob
                ? await htmlFile.content.text()
                : String(htmlFile.content);
              if (content && content.length > 50) return content;
            }
          }
          // Fallback: try getHtml with MJML inlined
          const html = editor.getHtml({ cleanId: true }) || '';
          // If it looks like raw MJML, wrap it minimally for rendering
          if (html.includes('<mj-') && !html.includes('<html')) {
            return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;margin:0;padding:20px;}</style></head><body>${html.replace(/<mj-[^>]*>/g, '<div>').replace(/<\/mj-[^>]*>/g, '</div>')}</body></html>`;
          }
          return html;
        } catch (err) {
          console.error('[GrapesEditor] getHtml error:', err);
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
        if (design?.body?.rows) {
          console.warn('[GrapesEditor] Unlayer design detected — skipping loadDesign');
          return;
        }
        editor.loadProjectData(design);
      },

      setHtml: (mjml: string) => {
        const editor = editorRef.current;
        if (!editor || !mjml) return;
        // Load MJML content directly into the editor canvas
        try {
          editor.setComponents(mjml);
        } catch (err) {
          console.warn('[GrapesEditor] setHtml/MJML error:', err);
        }
      },

      insertHtml: (html: string) => {
        const editor = editorRef.current;
        if (!editor) return;
        const wrapper = editor.getWrapper();
        if (!wrapper) return;

        const mjBody = wrapper.findType('mj-body')[0] || wrapper;
        mjBody.append(`<mj-section><mj-column><mj-raw>${html}</mj-raw></mj-column></mj-section>`);
      },
    }));

    const handleEditor = (editor: Editor) => {
      editorRef.current = editor;
    };

    const handleReady = (editor: Editor) => {
      editorRef.current = editor;

      // Register Steve blocks with brand color
      registerSteveBlocks(editor, brandColor);

      // Auto-select all text when starting to edit a text component
      // so the user can just type to replace "Put your text here"
      editor.on('rte:enable', () => {
        try {
          const rteEl = editor.RichTextEditor?.getContent?.();
          if (rteEl) {
            const sel = rteEl.ownerDocument?.defaultView?.getSelection?.() || window.getSelection();
            if (sel) {
              sel.selectAllChildren(rteEl);
            }
          }
        } catch {}
      });

      setReady(true);

      if (initialDesign && !initialDesignLoaded.current) {
        initialDesignLoaded.current = true;
        if (initialDesign?.body?.rows) {
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

    useEffect(() => {
      if (!ready || !editorRef.current || !initialDesign) return;
      if (initialDesignLoaded.current) return;
      initialDesignLoaded.current = true;
      if (initialDesign?.body?.rows) return;
      editorRef.current.loadProjectData(initialDesign);
    }, [ready, initialDesign]);

    const studioOptions: CreateEditorOptions = {
      licenseKey: LICENSE_KEY,
      project: {
        type: 'email',
        default: {
          pages: [{ name: 'Email', component: '<mjml><mj-body></mj-body></mjml>' }],
        },
      },
      storage: {
        type: 'self',
        autosaveChanges: 0,
        onSave: async () => {
          // Manual save — CampaignBuilder controls when to save
        },
        onLoad: async () => ({ project: {} }),
      },
      theme: 'light',
      customTheme: getSteveTheme(brandColor),
      blocks: {
        default: steveBlocks,
      },
      pages: false,
      settingsMenu: {
        about: false,
        embed: false,
        installApp: false,
        saveProject: false,
        loadProject: false,
        openProject: false,
      },
      i18n: {
        locales: {
          en: esLocale,
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
