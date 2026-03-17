import { forwardRef, useImperativeHandle, useState, useCallback, useEffect } from 'react';
import EmailBlockEditor from '../email-blocks/EmailBlockEditor';
import { renderBlockToHtml } from '../email-blocks/blockRenderer';
import { type EmailBlock } from '../email-blocks/blockTypes';
import DOMPurify from 'dompurify';

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

export interface BlocksEditorRef {
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

interface BlocksEditorWrapperProps {
  onReady?: () => void;
  onChange?: () => void;
  style?: React.CSSProperties;
  clientId?: string;
}

const BlocksEditorWrapper = forwardRef<BlocksEditorRef, BlocksEditorWrapperProps>(
  ({ onReady, onChange, style, clientId }, ref) => {
    const [blocks, setBlocks] = useState<EmailBlock[]>([]);

    useEffect(() => {
      const timer = setTimeout(() => onReady?.(), 100);
      return () => clearTimeout(timer);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleBlocksChange = useCallback((newBlocks: EmailBlock[]) => {
      setBlocks(newBlocks);
      onChange?.();
    }, [onChange]);

    const renderFullHtml = useCallback((currentBlocks: EmailBlock[]) => {
      const bodyHtml = sanitizeEmailHtml(
        currentBlocks.map(b => renderBlockToHtml(b)).join('')
      );
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
        '</style>',
        '</head>',
        '<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">',
        '<table class="email-container" role="presentation" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;margin:0 auto;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;">',
        '<tr><td>',
        bodyHtml,
        '</td></tr>',
        '</table>',
        '</body>',
        '</html>',
      ].join('\n');
    }, []);

    useImperativeHandle(ref, () => ({
      loadDesign(html: string, projectData?: any) {
        if (projectData?.blocks && Array.isArray(projectData.blocks)) {
          setBlocks(projectData.blocks);
        } else if (html && html.trim()) {
          // Legacy HTML content — wrap in a single html block
          setBlocks([{
            id: crypto.randomUUID(),
            type: 'html',
            props: { code: html },
          }]);
        } else {
          setBlocks([]);
        }
      },

      getHtml(): string {
        return renderFullHtml(blocks);
      },

      getSelectedHtml(): string | null {
        return null;
      },

      getProjectData(): any {
        return { blocks };
      },

      addComponents(html: string) {
        setBlocks(prev => [
          ...prev,
          { id: crypto.randomUUID(), type: 'html' as const, props: { code: html } },
        ]);
      },

      setDevice() {
        // Device toggle is handled internally by EmailBlockEditor
      },

      undo() {
        // Not implemented — EmailBlockEditor manages its own state
      },

      redo() {
        // Not implemented — EmailBlockEditor manages its own state
      },

      getEditor() {
        return null;
      },
    }));

    return (
      <div style={{ height: '100%', ...style }}>
        <EmailBlockEditor
          blocks={blocks}
          onChange={handleBlocksChange}
          clientId={clientId}
        />
      </div>
    );
  }
);

BlocksEditorWrapper.displayName = 'BlocksEditorWrapper';

export { BlocksEditorWrapper };
export default BlocksEditorWrapper;
