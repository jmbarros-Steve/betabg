import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import grapesjs from 'grapesjs';
import grapesjsPresetNewsletter from 'grapesjs-preset-newsletter';
import { registerSteveBlocks } from './grapesjsCustomBlocks';
import { registerMergeTags } from './grapesjsMergeTags';
import { esLocale } from './grapesjsI18n';
import './grapejs-theme.css';

export interface SteveMailEditorRef {
  loadDesign(html: string, projectData?: any): void;
  getHtml(): string;
  getProjectData(): any;
  addComponents(html: string): void;
}

interface SteveMailEditorProps {
  onReady?: () => void;
  style?: React.CSSProperties;
}

const SteveMailEditor = forwardRef<SteveMailEditorRef, SteveMailEditorProps>(
  ({ onReady, style }, ref) => {
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
        const html = editor.getHtml();
        const css = editor.getCss();
        return [
          '<!DOCTYPE html>',
          '<html lang="es">',
          '<head>',
          '<meta charset="UTF-8">',
          '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
          '<meta http-equiv="X-UA-Compatible" content="IE=edge">',
          '<style>',
          css,
          '</style>',
          '</head>',
          '<body style="margin:0;padding:0;background-color:#f4f4f4;">',
          html,
          '</body>',
          '</html>',
        ].join('\n');
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
    }));

    useEffect(() => {
      if (!containerRef.current) return;

      const editor = grapesjs.init({
        container: containerRef.current,
        fromElement: false,
        height: '100%',
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
        // Configure panels for clean layout
        panels: { defaults: [] },
      });

      editorRef.current = editor;

      editor.on('load', () => {
        const el = containerRef.current;
        if (!el) { onReady?.(); return; }

        const SIDEBAR_W = 220;

        const forceLayout = () => {
          const rect = el.getBoundingClientRect();
          const editorEl = el.querySelector('.gjs-editor') as HTMLElement;
          const canvas = el.querySelector('.gjs-cv-canvas') as HTMLElement;
          const views = el.querySelector('.gjs-pn-views') as HTMLElement;
          const viewsCont = el.querySelector('.gjs-pn-views-container') as HTMLElement;
          const canvasW = rect.width - SIDEBAR_W;
          const canvasH = rect.height;

          if (editorEl) {
            editorEl.style.cssText = `position:relative;width:${rect.width}px;height:${rect.height}px;overflow:hidden;`;
          }
          // Hide default command/option panels
          el.querySelectorAll('.gjs-pn-commands, .gjs-pn-options, .gjs-pn-devices-c').forEach((p) => {
            (p as HTMLElement).style.cssText = 'display:none !important;height:0 !important;';
          });
          if (canvas) {
            canvas.style.cssText = `position:absolute;top:0;left:0;width:${canvasW}px;height:${canvasH}px;background-color:#f4f4f5;`;
          }
          if (views) {
            views.style.cssText = `position:absolute;top:0;left:${canvasW}px;width:${SIDEBAR_W}px;height:40px;z-index:5;display:flex;padding:6px 4px;gap:2px;background-color:#18181b;border-bottom:1px solid #27272a;`;
          }
          if (viewsCont) {
            viewsCont.style.cssText = `position:absolute;top:40px;left:${canvasW}px;width:${SIDEBAR_W}px;height:${canvasH - 40}px;overflow-y:auto;z-index:5;background-color:#18181b;`;
          }
        };

        // Apply layout, open blocks, then refresh so GrapeJS recalculates iframe
        setTimeout(() => {
          forceLayout();
          // Open blocks panel (last view tab)
          const viewBtns = el.querySelectorAll('.gjs-pn-views .gjs-pn-btn');
          if (viewBtns.length > 0) {
            (viewBtns[viewBtns.length - 1] as HTMLElement).click();
          }
          // Refresh recalculates iframe to fit canvas
          editor.refresh();
          // Re-apply layout after refresh (in case GrapeJS overrode our styles)
          requestAnimationFrame(() => {
            forceLayout();
            editor.refresh();
          });
        }, 100);

        // Re-apply on window resize
        const onResize = () => { forceLayout(); editor.refresh(); };
        window.addEventListener('resize', onResize);

        // Store cleanup ref
        const origDestroy = editor.destroy.bind(editor);
        editor.destroy = () => {
          window.removeEventListener('resize', onResize);
          origDestroy();
        };

        onReady?.();
      });

      return () => {
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
