/**
 * Converts raw HTML (from Steve-generated branded emails) into an Unlayer design JSON
 * using NATIVE Unlayer blocks (image, heading, text, button) for full drag-and-drop editing.
 *
 * Parses the predictable HTML structure from generateBrandedEmailHtml() into separate blocks.
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
  return `u_content_${counter++}`;
}

/** Extract text between a given HTML tag */
function extractTag(html: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = html.match(re);
  return m ? m[1].trim() : '';
}

/** Extract src from first img tag */
function extractImgSrc(html: string): string {
  const m = html.match(/<img[^>]+src="([^"]+)"/i);
  return m ? m[1] : '';
}

/** Extract href and text from the CTA link (the styled <a> inside the button table) */
function extractCta(html: string): { text: string; url: string } {
  // The CTA is: <a href="URL" style="...display:inline-block;padding:16px...">TEXT</a>
  const m = html.match(/<a\s+href="([^"]+)"[^>]*style="[^"]*display:\s*inline-block[^"]*"[^>]*>([^<]+)<\/a>/i);
  if (m) return { url: m[1], text: m[2].trim() };
  return { url: '#', text: 'Ver mas' };
}

/** Extract brand name from the logo text fallback div */
function extractBrandText(html: string): string {
  // The fallback logo is: <div style="...letter-spacing:3px...">BRAND NAME</div>
  const m = html.match(/<div[^>]*letter-spacing[^>]*>([^<]+)<\/div>/i);
  return m ? m[1].trim() : '';
}

/** Create a single-column row with one content block */
function makeRow(content: { id: string; type: string; values: Record<string, any> }, rowBg?: string): any {
  const rowId = uid();
  const colId = uid();
  return {
    id: rowId,
    cells: [1],
    columns: [{
      id: colId,
      contents: [content],
      values: {
        backgroundColor: '',
        padding: '0px',
        border: {},
        borderRadius: '0px',
        _meta: { htmlID: colId, htmlClassNames: 'u_column' },
      },
    }],
    values: {
      displayCondition: null,
      columns: false,
      backgroundColor: rowBg || '',
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
  };
}

export function htmlToUnlayerDesign(html: string): UnlayerDesignJson {
  counter = 1;

  const rows: any[] = [];

  // --- Parse the branded email HTML ---
  const logoUrl = extractImgSrc(html);
  const brandText = extractBrandText(html);
  const heading = extractTag(html, 'h1');
  const cta = extractCta(html);

  // Extract body paragraphs (the <p> tags inside the body section, skip hidden preview)
  const bodyParagraphs: string[] = [];
  const pRegex = /<p[^>]*style="[^"]*font-size:16px[^"]*"[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch: RegExpExecArray | null;
  while ((pMatch = pRegex.exec(html)) !== null) {
    bodyParagraphs.push(pMatch[1].trim());
  }
  const bodyHtml = bodyParagraphs.length > 0
    ? bodyParagraphs.map(p => `<p style="margin:0 0 16px;font-size:16px;color:#555555;line-height:1.6;">${p}</p>`).join('')
    : '<p style="margin:0;font-size:16px;color:#555555;line-height:1.6;">Contenido del email</p>';

  // 1. HEADER ROW - Logo on black background
  if (logoUrl) {
    const imgId = uid();
    rows.push(makeRow({
      id: imgId,
      type: 'image',
      values: {
        containerPadding: '28px 30px 20px',
        anchor: '',
        src: { url: logoUrl, width: 150, height: 'auto' },
        textAlign: 'center',
        altText: brandText || 'Logo',
        action: { name: 'web', values: { href: '', target: '_blank' } },
        displayCondition: null,
        _meta: { htmlID: imgId, htmlClassNames: 'u_content_image' },
      },
    }, '#000000'));
  } else if (brandText) {
    const htmlId = uid();
    rows.push(makeRow({
      id: htmlId,
      type: 'text',
      values: {
        containerPadding: '28px 30px 20px',
        anchor: '',
        fontSize: '24px',
        color: '#ffffff',
        textAlign: 'center',
        lineHeight: '140%',
        text: `<p style="font-size:24px;font-weight:700;letter-spacing:3px;font-family:Georgia,serif;">${brandText}</p>`,
        displayCondition: null,
        _meta: { htmlID: htmlId, htmlClassNames: 'u_content_text' },
      },
    }, '#000000'));
  }

  // 2. HEADING ROW
  if (heading) {
    const headingId = uid();
    rows.push(makeRow({
      id: headingId,
      type: 'heading',
      values: {
        containerPadding: '40px 40px 10px',
        anchor: '',
        headingType: 'h1',
        fontSize: '24px',
        color: '#1a1a1a',
        textAlign: 'left',
        lineHeight: '130%',
        fontFamily: { label: 'Georgia', value: 'georgia,serif' },
        fontWeight: 700,
        text: heading,
        displayCondition: null,
        _meta: { htmlID: headingId, htmlClassNames: 'u_content_heading' },
      },
    }));
  }

  // 3. BODY TEXT ROW
  const textId = uid();
  rows.push(makeRow({
    id: textId,
    type: 'text',
    values: {
      containerPadding: '10px 40px 10px',
      anchor: '',
      fontSize: '16px',
      color: '#555555',
      textAlign: 'left',
      lineHeight: '160%',
      text: bodyHtml,
      displayCondition: null,
      _meta: { htmlID: textId, htmlClassNames: 'u_content_text' },
    },
  }));

  // 4. CTA BUTTON ROW
  const btnId = uid();
  rows.push(makeRow({
    id: btnId,
    type: 'button',
    values: {
      containerPadding: '20px 40px 44px',
      anchor: '',
      href: { name: 'web', values: { href: cta.url, target: '_blank' } },
      buttonColors: { color: '#ffffff', backgroundColor: '#1a1a1a', hoverColor: '#ffffff', hoverBackgroundColor: '#333333' },
      size: { autoWidth: true, width: '100%' },
      textAlign: 'center',
      lineHeight: '120%',
      padding: '16px 44px',
      borderRadius: '30px',
      text: `<span style="font-size:15px;font-weight:600;">${cta.text}</span>`,
      calculatedWidth: 220,
      calculatedHeight: 48,
      displayCondition: null,
      _meta: { htmlID: btnId, htmlClassNames: 'u_content_button' },
    },
  }));

  // 5. SIGNATURE ROW
  const sigId = uid();
  rows.push(makeRow({
    id: sigId,
    type: 'text',
    values: {
      containerPadding: '28px 40px 12px',
      anchor: '',
      fontSize: '15px',
      color: '#333333',
      textAlign: 'center',
      lineHeight: '140%',
      text: `<p style="margin:0 0 4px;font-size:15px;color:#333;">Un abrazo,</p><p style="margin:0;font-size:15px;font-weight:700;color:#1a1a1a;">El equipo de ${brandText || 'Tu Marca'}</p>`,
      displayCondition: null,
      _meta: { htmlID: sigId, htmlClassNames: 'u_content_text' },
    },
  }));

  // 6. FOOTER ROW - Unsubscribe links
  const footerId = uid();
  rows.push(makeRow({
    id: footerId,
    type: 'text',
    values: {
      containerPadding: '16px 40px 28px',
      anchor: '',
      fontSize: '11px',
      color: '#999999',
      textAlign: 'center',
      lineHeight: '140%',
      text: '<p style="font-size:11px;color:#999;"><a href="{%unsubscribe%}" style="color:#999;text-decoration:underline;">Cancelar suscripcion</a>&nbsp;&middot;&nbsp;<a href="{%manage_preferences \'Manage Preferences\'%}" style="color:#999;text-decoration:underline;">Preferencias</a></p>',
      displayCondition: null,
      _meta: { htmlID: footerId, htmlClassNames: 'u_content_text' },
    },
  }));

  return {
    counters: { u_column: rows.length, u_row: rows.length, u_content_text: 4, u_content_heading: 1, u_content_image: 1, u_content_button: 1 },
    body: {
      id: uid(),
      rows,
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
