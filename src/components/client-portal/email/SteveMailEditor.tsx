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
      });

      editorRef.current = editor;

      editor.on('load', () => {
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
