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
        // The newsletter preset creates a flat layout: canvas small on top, panels below.
        // We restructure the DOM to: canvas fills height, blocks sidebar on the right.
        const el = containerRef.current;
        if (el) {
          const gjsEditor = el.querySelector('.gjs-editor') as HTMLElement;
          const canvas = el.querySelector('.gjs-cv-canvas') as HTMLElement;
          const viewsContainer = el.querySelector('.gjs-pn-views-container') as HTMLElement;
          const viewsPanel = el.querySelector('.gjs-pn-views') as HTMLElement;

          if (gjsEditor) {
            // Create a wrapper row div for canvas + sidebar
            const row = document.createElement('div');
            row.className = 'steve-editor-row';
            row.style.cssText = 'display:flex;flex:1;height:0;min-height:0;overflow:hidden;';

            // Move canvas into row
            if (canvas) {
              canvas.style.cssText = 'flex:1;height:100%;width:auto;position:relative;background:#f4f4f5;';
              row.appendChild(canvas);
            }

            // Create right sidebar from views
            const sidebar = document.createElement('div');
            sidebar.className = 'steve-editor-sidebar';
            sidebar.style.cssText = 'width:240px;min-width:240px;height:100%;overflow-y:auto;background:#18181b;border-left:1px solid #27272a;display:flex;flex-direction:column;';

            // Move view tabs into sidebar header
            if (viewsPanel) {
              viewsPanel.style.cssText = 'display:flex;padding:4px 8px;background:#18181b;border-bottom:1px solid #27272a;gap:2px;flex-shrink:0;';
              sidebar.appendChild(viewsPanel);
            }

            // Move views container (blocks/styles/traits content) into sidebar
            if (viewsContainer) {
              viewsContainer.style.cssText = 'flex:1;overflow-y:auto;background:#18181b;width:100%;';
              sidebar.appendChild(viewsContainer);
            }

            row.appendChild(sidebar);

            // Hide all default top panels
            const toHide = gjsEditor.querySelectorAll(
              '.gjs-pn-commands, .gjs-pn-options, .gjs-pn-devices-c'
            );
            toHide.forEach((p) => (p as HTMLElement).style.display = 'none');

            // Make editor a flex column
            gjsEditor.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;background:#18181b;font-family:Inter,sans-serif;font-size:13px;color:#fafafa;border:none;';

            // Append the row to editor (after hiding panels)
            gjsEditor.appendChild(row);
          }

          // Open blocks panel by default
          setTimeout(() => {
            const viewBtns = el.querySelectorAll('.gjs-pn-views .gjs-pn-btn');
            if (viewBtns.length > 0) {
              // Last button is typically "Blocks"
              (viewBtns[viewBtns.length - 1] as HTMLElement).click();
            }
            editor.refresh();
          }, 300);
        }

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
