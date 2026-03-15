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
        // Fix layout: force canvas to fill available space
        // The newsletter preset creates panels with inline styles that break flex layout
        const editorEl = containerRef.current;
        if (editorEl) {
          // Fix the editor container
          const gjsEditor = editorEl.querySelector('.gjs-editor') as HTMLElement;
          if (gjsEditor) {
            gjsEditor.style.display = 'flex';
            gjsEditor.style.flexDirection = 'column';
            gjsEditor.style.height = '100%';
            gjsEditor.style.overflow = 'hidden';
          }

          // Fix the editor row (canvas + sidebar)
          const editorRow = editorEl.querySelector('.gjs-editor-row') as HTMLElement;
          if (editorRow) {
            editorRow.style.display = 'flex';
            editorRow.style.flex = '1';
            editorRow.style.height = '100%';
            editorRow.style.overflow = 'hidden';
          }

          // Fix canvas to fill space
          const canvas = editorEl.querySelector('.gjs-cv-canvas') as HTMLElement;
          if (canvas) {
            canvas.style.flex = '1';
            canvas.style.height = '100%';
            canvas.style.width = 'auto';
            canvas.style.position = 'relative';
          }

          // Fix the right panel (blocks/traits/styles)
          const viewsContainer = editorEl.querySelector('.gjs-pn-views-container') as HTMLElement;
          if (viewsContainer) {
            viewsContainer.style.width = '240px';
            viewsContainer.style.minWidth = '240px';
            viewsContainer.style.height = '100%';
            viewsContainer.style.overflowY = 'auto';
            viewsContainer.style.borderLeft = '1px solid #27272a';
          }

          // Hide default top toolbar panels (we have our own)
          const panelsToHide = editorEl.querySelectorAll(
            '.gjs-pn-commands, .gjs-pn-options, .gjs-pn-devices-c'
          );
          panelsToHide.forEach((p) => {
            (p as HTMLElement).style.display = 'none';
          });

          // Open the blocks panel by default
          const blocksBtn = editorEl.querySelector('.gjs-pn-btn[data-tooltip="Open Blocks"]') as HTMLElement;
          if (blocksBtn) blocksBtn.click();

          // Fallback: try clicking the first view button to show blocks
          const viewBtns = editorEl.querySelectorAll('.gjs-pn-views .gjs-pn-btn');
          if (viewBtns.length > 0) {
            (viewBtns[viewBtns.length - 1] as HTMLElement).click();
          }

          // Refresh canvas to recalculate dimensions
          setTimeout(() => {
            editor.refresh();
          }, 200);
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
