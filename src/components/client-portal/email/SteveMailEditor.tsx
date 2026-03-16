import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import grapesjs from 'grapesjs';
import grapesjsPresetNewsletter from 'grapesjs-preset-newsletter';
import DOMPurify from 'dompurify';
import { registerSteveBlocks } from './grapesjsCustomBlocks';
import { registerMergeTags } from './grapesjsMergeTags';
import { esLocale } from './grapesjsI18n';
import './grapejs-theme.css';

/** Sanitize HTML for email output — strip scripts, event handlers, iframes */
function sanitizeEmailHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: false,
    ALLOW_TAGS: [
      'table', 'tr', 'td', 'th', 'tbody', 'thead', 'tfoot', 'caption', 'colgroup', 'col',
      'div', 'span', 'p', 'a', 'img', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'b', 'i', 'u', 'strong', 'em', 'small', 'sub', 'sup', 'blockquote',
      'center', 'font', 'section', 'header', 'footer', 'nav', 'article',
    ],
    ALLOW_ATTR: [
      'style', 'class', 'id', 'src', 'href', 'alt', 'title', 'width', 'height',
      'border', 'cellpadding', 'cellspacing', 'align', 'valign', 'bgcolor',
      'target', 'rel', 'role', 'aria-label', 'aria-hidden',
      'data-steve-products', 'data-steve-discount', 'data-steve-condition',
      'data-product-type', 'data-product-count', 'data-columns',
      'data-show-price', 'data-show-button', 'data-button-text', 'data-button-color',
      'data-discount-source', 'data-discount-code', 'data-discount-type', 'data-discount-value',
      'data-merge-tag',
      'data-dynamic-feed',
      'data-steve-image',
      'data-steve-countdown',
    ],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus', 'onblur'],
  });
}

export interface SteveMailEditorRef {
  loadDesign(html: string, projectData?: any): void;
  getHtml(): string;
  getSelectedHtml(): string | null;
  getProjectData(): any;
  addComponents(html: string): void;
  setDevice(device: 'Desktop' | 'Mobile'): void;
  undo(): void;
  redo(): void;
  getEditor(): any;
}

interface SteveMailEditorProps {
  onReady?: () => void;
  style?: React.CSSProperties;
  clientId?: string;
}

const SteveMailEditor = forwardRef<SteveMailEditorRef, SteveMailEditorProps>(
  ({ onReady, style, clientId }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<any>(null);

    useImperativeHandle(ref, () => ({
      loadDesign(html: string, projectData?: any) {
        const editor = editorRef.current;
        if (!editor) return;
        if (projectData) {
          editor.loadProjectData(projectData);
        } else {
          editor.setComponents(html);
        }
      },

      getHtml(): string {
        const editor = editorRef.current;
        if (!editor) return '';
        const html = sanitizeEmailHtml(editor.getHtml());
        const css = editor.getCss();
        return [
          '<!DOCTYPE html>',
          '<html lang="es" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">',
          '<head>',
          '<meta charset="UTF-8">',
          '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
          '<meta http-equiv="X-UA-Compatible" content="IE=edge">',
          '<meta name="x-apple-disable-message-reformatting">',
          '<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">',
          '<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->',
          '<style>',
          '/* Email reset */',
          'body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}',
          'table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}',
          'img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none}',
          'body{margin:0;padding:0;width:100%!important;-webkit-font-smoothing:antialiased}',
          '/* Responsive */',
          '@media only screen and (max-width:620px){',
          '  .email-container{width:100%!important;max-width:100%!important}',
          '  .fluid{width:100%!important;max-width:100%!important;height:auto!important}',
          '  .stack-column{display:block!important;width:100%!important;max-width:100%!important}',
          '  .center-on-narrow{text-align:center!important;display:block!important;margin-left:auto!important;margin-right:auto!important;float:none!important}',
          '  table[class="body"] .content{padding:8px!important}',
          '}',
          '/* Dark mode support */',
          '@media (prefers-color-scheme:dark){',
          '  body,table,td{background-color:#1a1a1a!important;color:#e4e4e7!important}',
          '  h1,h2,h3,h4,h5,h6{color:#fafafa!important}',
          '  a{color:#818cf8!important}',
          '  .email-container{background-color:#27272a!important}',
          '  img{opacity:.9}',
          '}',
          ':root{color-scheme:light dark;supported-color-schemes:light dark}',
          css,
          '</style>',
          '</head>',
          '<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">',
          html,
          '</body>',
          '</html>',
        ].join('\n');
      },

      getSelectedHtml(): string | null {
        const editor = editorRef.current;
        if (!editor) return null;
        const selected = editor.getSelected();
        if (!selected) return null;
        return selected.toHTML();
      },

      getProjectData(): any {
        const editor = editorRef.current;
        if (!editor) return null;
        return editor.getProjectData();
      },

      addComponents(html: string) {
        const editor = editorRef.current;
        if (!editor) return;
        editor.addComponents(html);
      },

      setDevice(device: 'Desktop' | 'Mobile') {
        const editor = editorRef.current;
        if (!editor) return;
        editor.setDevice(device);
      },

      undo() {
        const editor = editorRef.current;
        if (!editor) return;
        editor.UndoManager.undo();
      },

      redo() {
        const editor = editorRef.current;
        if (!editor) return;
        editor.UndoManager.redo();
      },

      getEditor() {
        return editorRef.current;
      },
    }));

    useEffect(() => {
      if (!containerRef.current) return;

      // Calculate container height in pixels — '100%' fails if parent hasn't laid out yet
      const containerRect = containerRef.current.getBoundingClientRect();
      const initHeight = containerRect.height > 100 ? `${containerRect.height}px` : '100%';

      const editor = grapesjs.init({
        container: containerRef.current,
        fromElement: false,
        height: initHeight,
        width: 'auto',
        storageManager: false,
        plugins: [grapesjsPresetNewsletter, registerSteveBlocks, registerMergeTags],
        pluginsOpts: {
          [grapesjsPresetNewsletter as any]: {
            modalTitleImport: 'Importar HTML',
            modalBtnImport: 'Importar',
            importPlaceholder: '<table class="main-body"></table>',
            cellStyle: {
              'font-size': '14px',
              'font-family': 'Arial, Helvetica, sans-serif',
              color: '#333333',
            },
          },
        },
        i18n: {
          locale: 'es',
          messages: { es: esLocale },
        },
        canvas: {
          styles: [],
          // Inject white background into the canvas iframe body
          scripts: [
            `document.body.style.backgroundColor='#ffffff';document.body.style.margin='0';`,
          ],
        },
        deviceManager: {
          devices: [
            { name: 'Desktop', width: '600px' },
            { name: 'Mobile', width: '320px' },
          ],
        },
        blockManager: {
          appendOnClick: true,
        },
        styleManager: {
          sectors: [
            {
              name: 'Dimensiones',
              open: false,
              properties: [
                { property: 'width' },
                { property: 'max-width' },
                { property: 'height' },
                { property: 'padding' },
                { property: 'margin' },
              ],
            },
            {
              name: 'Tipograf\u00eda',
              open: false,
              properties: [
                { property: 'font-family' },
                { property: 'font-size' },
                { property: 'font-weight' },
                { property: 'color' },
                { property: 'line-height' },
                { property: 'text-align' },
                { property: 'text-decoration' },
              ],
            },
            {
              name: 'Fondo',
              open: false,
              properties: [
                { property: 'background-color' },
                { property: 'background-image' },
              ],
            },
            {
              name: 'Borde',
              open: false,
              properties: [
                { property: 'border' },
                { property: 'border-radius' },
              ],
            },
          ],
        },
        // Let the newsletter preset set up default panels, then we customize layout
      });

      editorRef.current = editor;

      // Store clientId on editor for plugins that need API access (e.g. Shopify product picker)
      if (clientId) {
        (editor as any).__steveClientId = clientId;
      }

      // Layout fix: GrapeJS newsletter preset stacks everything vertically.
      // We override to put canvas on the left and blocks sidebar on the right.
      // NOTE: editor.on('load') fires synchronously during init(), so we use
      // setTimeout to run after init completes and the DOM is ready.
      const el = containerRef.current;
      const SIDEBAR_W = 260;

      const forceLayout = () => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.height < 100) return; // container not laid out yet
        const editorEl = el.querySelector('.gjs-editor') as HTMLElement ?? el;
        const canvas = el.querySelector('.gjs-cv-canvas') as HTMLElement;
        const views = el.querySelector('.gjs-pn-views') as HTMLElement;
        const viewsCont = el.querySelector('.gjs-pn-views-container') as HTMLElement;
        const canvasW = rect.width - SIDEBAR_W;
        const canvasH = rect.height;

        editorEl.style.cssText = `position:relative;width:${rect.width}px;height:${canvasH}px;overflow:hidden;`;

        // Hide default command/option panels
        el.querySelectorAll('.gjs-pn-commands, .gjs-pn-options, .gjs-pn-devices-c').forEach((p) => {
          (p as HTMLElement).style.display = 'none';
        });

        if (canvas) {
          canvas.style.cssText = `position:absolute;top:0;left:0;width:${canvasW}px;height:${canvasH}px;background-color:#f4f4f5;`;
          const fw = canvas.querySelector('.gjs-frame-wrapper') as HTMLElement;
          const iframe = canvas.querySelector('iframe') as HTMLIFrameElement;
          if (fw) fw.style.cssText = `width:${canvasW}px;height:${canvasH}px;left:0;top:0;`;
          if (iframe) { iframe.style.width = `${canvasW}px`; iframe.style.height = `${canvasH}px`; }
        }
        if (views) {
          views.style.cssText = `position:absolute;top:0;left:${canvasW}px;width:${SIDEBAR_W}px;height:40px;z-index:5;display:flex;padding:6px 4px;gap:2px;background-color:#18181b;border-bottom:1px solid #27272a;`;
        }
        if (viewsCont) {
          viewsCont.style.cssText = `position:absolute;top:40px;left:${canvasW}px;width:${SIDEBAR_W}px;height:${canvasH - 40}px;overflow-y:auto;overflow-x:hidden;z-index:5;background-color:#18181b;display:block;visibility:visible;`;
          // Ensure child panels (traits, styles, blocks) fill the container
          viewsCont.querySelectorAll('.gjs-traits-cs, .gjs-sm-sectors, .gjs-blocks-cs').forEach((child) => {
            (child as HTMLElement).style.width = '100%';
          });
        }
      };

      // Auto-switch to traits panel when a component is selected
      editor.on('component:selected', () => {
        const selected = editor.getSelected();
        if (!selected) return;
        // If it's a Steve custom block, open traits (settings); otherwise open style manager
        const type = selected.get('type') || '';
        if (type.startsWith('steve-')) {
          editor.Panels.getButton('views', 'open-tm')?.set('active', true);
        } else {
          editor.Panels.getButton('views', 'open-sm')?.set('active', true);
        }
        // Ensure the views-container is visible after panel switch
        requestAnimationFrame(() => {
          const vc = el?.querySelector('.gjs-pn-views-container') as HTMLElement;
          if (vc) {
            vc.style.display = 'block';
            vc.style.visibility = 'visible';
          }
          // Ensure traits/styles panels inside views-container are visible
          const traitsSector = el?.querySelector('.gjs-trt-traits') as HTMLElement;
          if (traitsSector) traitsSector.style.display = '';
          const smSectors = el?.querySelector('.gjs-sm-sectors') as HTMLElement;
          if (smSectors) smSectors.style.display = '';
        });
      });

      // When nothing is selected, go back to blocks panel
      editor.on('component:deselected', () => {
        editor.Panels.getButton('views', 'open-blocks')?.set('active', true);
      });

      const applyAndRefresh = () => {
        forceLayout();
        // Open blocks panel by default
        editor.Panels.getButton('views', 'open-blocks')?.set('active', true);
        editor.refresh();
        requestAnimationFrame(forceLayout);
      };

      // Clear the default newsletter preset content — start with a blank canvas
      // and add a helpful placeholder so the user knows what to do.
      editor.on('load', () => {
        const comps = editor.getComponents();
        if (comps.length > 0) {
          // Remove the default newsletter template injected by the preset
          comps.reset();
        }
        // Add a minimal centered email wrapper with instructions
        editor.addComponents(`
          <table class="email-container" role="presentation" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;margin:0 auto;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
            <tr>
              <td style="padding:40px 30px;text-align:center;color:#a1a1aa;font-size:15px;line-height:1.6;">
                <p style="margin:0 0 8px;font-size:28px;">📧</p>
                <p style="margin:0 0 4px;font-weight:600;color:#71717a;">Arrastra bloques desde el panel derecho</p>
                <p style="margin:0;font-size:13px;">o usa el botón <strong>Plantillas</strong> de la barra superior para elegir un diseño</p>
              </td>
            </tr>
          </table>
        `);
      });

      // Apply at multiple timings to handle different load scenarios
      setTimeout(applyAndRefresh, 200);
      setTimeout(applyAndRefresh, 800);
      setTimeout(() => { forceLayout(); onReady?.(); }, 1200);

      // Re-apply on window resize
      const onResize = () => { forceLayout(); };
      window.addEventListener('resize', onResize);

      return () => {
        window.removeEventListener('resize', onResize);
        editor.destroy();
        editorRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          ...style,
        }}
      />
    );
  }
);

SteveMailEditor.displayName = 'SteveMailEditor';

export { SteveMailEditor };
export default SteveMailEditor;
