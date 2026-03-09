/**
 * Converts raw HTML (from Steve-generated emails) into an Unlayer design JSON.
 *
 * MVP approach: wraps the entire HTML inside a single custom_html block.
 * This preserves 100% of Klaviyo template tags ({% for %}, {{ }}, {% catalog %}, etc.)
 * while still letting the user rearrange blocks or add new ones in Unlayer.
 */

export interface UnlayerDesignJson {
  counters: Record<string, number>;
  body: {
    id: string;
    rows: Array<{
      id: string;
      cells: number[];
      columns: Array<{
        id: string;
        contents: Array<{
          id: string;
          type: string;
          values: Record<string, any>;
        }>;
        values: Record<string, any>;
      }>;
      values: Record<string, any>;
    }>;
    headers: any[];
    footers: any[];
    values: Record<string, any>;
  };
}

let counter = 1;
function uid(): string {
  return `u_content_html_${counter++}`;
}

/**
 * Extracts the inner content of <body> from a full HTML document.
 * Unlayer's custom_html block can't render full HTML documents
 * (<!DOCTYPE>, <html>, <head>, <body> wrappers break rendering).
 * Also preserves any <style> blocks for responsive email CSS.
 */
function extractBodyContent(html: string): string {
  // Extract <style> blocks from <head> to preserve responsive CSS
  const styleBlocks: string[] = [];
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let styleMatch: RegExpExecArray | null;
  while ((styleMatch = styleRegex.exec(html)) !== null) {
    styleBlocks.push(styleMatch[0]);
  }

  // Extract body inner content
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) {
    const bodyContent = bodyMatch[1].trim();
    // Prepend style blocks so responsive CSS still works
    if (styleBlocks.length > 0) {
      return styleBlocks.join('\n') + '\n' + bodyContent;
    }
    return bodyContent;
  }
  return html;
}

export function htmlToUnlayerDesign(html: string): UnlayerDesignJson {
  counter = 1;
  const cleanHtml = extractBodyContent(html);

  const rowId = uid();
  const colId = uid();
  const contentId = uid();

  return {
    counters: { u_column: 1, u_row: 1, u_content_html: 1 },
    body: {
      id: uid(),
      rows: [
        {
          id: rowId,
          cells: [1],
          columns: [
            {
              id: colId,
              contents: [
                {
                  id: contentId,
                  type: 'html',
                  values: {
                    html: cleanHtml,
                    containerPadding: '0px',
                    anchor: '',
                    displayCondition: null,
                    _meta: {
                      htmlID: contentId,
                      htmlClassNames: 'u_content_html',
                    },
                  },
                },
              ],
              values: {
                backgroundColor: '',
                padding: '0px',
                border: {},
                borderRadius: '0px',
                _meta: { htmlID: colId, htmlClassNames: 'u_column' },
              },
            },
          ],
          values: {
            displayCondition: null,
            columns: false,
            backgroundColor: '',
            columnsBackgroundColor: '',
            backgroundImage: { url: '', fullWidth: true, repeat: 'no-repeat', size: 'custom', position: 'center' },
            padding: '0px',
            anchor: '',
            hideDesktop: false,
            _meta: { htmlID: rowId, htmlClassNames: 'u_row' },
            selectable: true,
            draggable: true,
            duplicatable: true,
            deletable: true,
            hideable: true,
          },
        },
      ],
      headers: [],
      footers: [],
      values: {
        popupPosition: 'center',
        popupWidth: '600px',
        popupHeight: 'auto',
        borderRadius: '10px',
        contentAlign: 'center',
        contentVerticalAlign: 'center',
        contentWidth: '600px',
        fontFamily: { label: 'Arial', value: 'arial,helvetica,sans-serif' },
        textColor: '#000000',
        popupBackgroundColor: '#FFFFFF',
        popupBackgroundImage: { url: '', fullWidth: true, repeat: 'no-repeat', size: 'cover', position: 'center' },
        popupOverlay_backgroundColor: 'rgba(0, 0, 0, 0.1)',
        popupCloseButton_position: 'top-right',
        popupCloseButton_backgroundColor: '#DDDDDD',
        popupCloseButton_iconColor: '#000000',
        popupCloseButton_borderRadius: '0px',
        popupCloseButton_margin: '0px',
        popupCloseButton_action: { name: 'close_popup', attrs: { onClick: "document.querySelector('.u-popup-container').style.display = 'none';" } },
        backgroundColor: '#f4f4f4',
        backgroundImage: { url: '', fullWidth: true, repeat: 'no-repeat', size: 'custom', position: 'center' },
        preheaderText: '',
        linkStyle: { body: true, linkColor: '#1a1a1a', linkHoverColor: '#C8A84E', linkUnderline: true, linkHoverUnderline: true },
        _meta: { htmlID: 'u_body', htmlClassNames: 'u_body' },
      },
    },
  };
}
