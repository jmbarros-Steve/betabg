import { type EmailBlock, type BlockType } from './blockTypes';

/**
 * Parse legacy HTML email content into structured EmailBlock[] array.
 * Uses the browser DOMParser to walk the HTML tree and convert elements
 * to their corresponding block types.
 */
export function htmlToBlocks(html: string): EmailBlock[] {
  if (!html || !html.trim()) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Extract email body content — skip the document wrapper
  const body = extractEmailBody(doc);
  if (!body || !body.childNodes.length) {
    // If nothing parseable, return single html block
    return [makeBlock('html', { code: html })];
  }

  const blocks: EmailBlock[] = [];
  const children = Array.from(body.childNodes);

  for (const node of children) {
    const parsed = parseNode(node);
    if (parsed) blocks.push(...parsed);
  }

  // If parser produced nothing useful, fallback to html block
  if (blocks.length === 0) {
    return [makeBlock('html', { code: html })];
  }

  return blocks;
}

/** Extract the innermost email content container from a full HTML document */
function extractEmailBody(doc: Document): Element | null {
  // Try to find the email container table (common pattern: table with max-width:600px)
  const tables = doc.querySelectorAll('table');
  for (const table of Array.from(tables)) {
    const style = table.getAttribute('style') || '';
    const cls = table.getAttribute('class') || '';
    if (
      style.includes('600px') ||
      cls.includes('email-container') ||
      cls.includes('email-body') ||
      cls.includes('container')
    ) {
      // Find the innermost td that contains the actual content
      const tds = table.querySelectorAll('td');
      if (tds.length > 0) {
        // Use the first td that has real content
        for (const td of Array.from(tds)) {
          if (td.children.length > 0 || (td.textContent || '').trim().length > 20) {
            return td;
          }
        }
      }
    }
  }

  // Fallback: use body element directly
  return doc.body;
}

/** Parse a single DOM node into one or more EmailBlock */
function parseNode(node: Node): EmailBlock[] | null {
  // Skip text nodes that are only whitespace
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent || '').trim();
    if (!text) return null;
    return [makeBlock('text', { content: `<p>${escapeHtml(text)}</p>`, align: 'left', fontSize: 14, color: '#333333' })];
  }

  // Skip comment nodes
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const style = el.getAttribute('style') || '';

  // ── data-steve-* blocks ──
  if (el.getAttribute('data-steve-products') === 'true') {
    return [parseProductBlock(el)];
  }
  if (el.getAttribute('data-steve-discount') === 'true') {
    return [parseCouponBlock(el)];
  }

  // ── <img> → image block ──
  if (tag === 'img') {
    return [parseImageFromEl(el)];
  }

  // ── <hr> → divider block ──
  if (tag === 'hr') {
    return [makeBlock('divider', {
      style: 'solid',
      color: extractStyleProp(style, 'border-top-color') || extractStyleProp(style, 'border-color') || '#e5e7eb',
      thickness: parseInt(extractStyleProp(style, 'border-top-width') || '1') || 1,
      width: '100%',
      marginTop: 16,
      marginBottom: 16,
    })];
  }

  // ── Headings ──
  if (/^h[1-6]$/.test(tag)) {
    const fontSize = { h1: 28, h2: 24, h3: 20, h4: 18, h5: 16, h6: 14 }[tag] || 16;
    return [makeBlock('text', {
      content: `<${tag}>${el.innerHTML}</${tag}>`,
      align: extractAlign(style) || 'left',
      fontSize,
      color: extractStyleProp(style, 'color') || '#111111',
    })];
  }

  // ── <a> that looks like a button (has background-color + padding) ──
  if (tag === 'a' && looksLikeButton(el)) {
    return [parseButtonFromLink(el)];
  }

  // ── <table> — could be columns, product grid, or data table ──
  if (tag === 'table') {
    return parseTable(el);
  }

  // ── <div> container — recursively parse children ──
  if (tag === 'div' || tag === 'section' || tag === 'td' || tag === 'center') {
    // Check if it's essentially a spacer (empty div with height)
    const height = parseInt(extractStyleProp(style, 'height') || '0');
    if (height > 0 && !el.textContent?.trim() && el.children.length === 0) {
      return [makeBlock('spacer', { height })];
    }

    // If this div just wraps a single image, treat as image block
    if (el.children.length === 1) {
      const child = el.children[0];
      if (child.tagName.toLowerCase() === 'img') {
        return [parseImageFromEl(child, extractAlign(style))];
      }
      // Div wrapping a single link that's a button
      if (child.tagName.toLowerCase() === 'a' && looksLikeButton(child)) {
        return [parseButtonFromLink(child, extractAlign(style))];
      }
      // Div wrapping a link that wraps an image (clickable image)
      if (child.tagName.toLowerCase() === 'a' && child.children.length === 1 && child.children[0].tagName.toLowerCase() === 'img') {
        const imgBlock = parseImageFromEl(child.children[0], extractAlign(style));
        imgBlock.props.link = child.getAttribute('href') || '';
        return [imgBlock];
      }
    }

    // Check if this div contains a mix of elements — parse children individually
    const childBlocks: EmailBlock[] = [];
    for (const child of Array.from(el.childNodes)) {
      const parsed = parseNode(child);
      if (parsed) childBlocks.push(...parsed);
    }

    // If we got child blocks, check if they should be wrapped in a section
    if (childBlocks.length > 0) {
      const bg = extractStyleProp(style, 'background-color') || extractStyleProp(style, 'background');
      if (bg && bg !== '#ffffff' && bg !== '#fff' && bg !== 'white' && bg !== 'transparent') {
        // Wrap in section block with background
        return [makeBlock('section', {
          bgColor: bg,
          paddingTop: parseInt(extractStyleProp(style, 'padding-top') || extractStyleProp(style, 'padding') || '20') || 20,
          paddingBottom: parseInt(extractStyleProp(style, 'padding-bottom') || extractStyleProp(style, 'padding') || '20') || 20,
          paddingLeft: parseInt(extractStyleProp(style, 'padding-left') || extractStyleProp(style, 'padding') || '20') || 20,
          paddingRight: parseInt(extractStyleProp(style, 'padding-right') || extractStyleProp(style, 'padding') || '20') || 20,
          children: childBlocks,
        })];
      }
      return childBlocks;
    }

    // Empty div — skip
    if (!el.textContent?.trim()) return null;

    // Div with only text content
    return [makeBlock('text', {
      content: el.innerHTML,
      align: extractAlign(style) || 'left',
      fontSize: parseInt(extractStyleProp(style, 'font-size') || '14') || 14,
      color: extractStyleProp(style, 'color') || '#333333',
    })];
  }

  // ── <p> → text block ──
  if (tag === 'p') {
    const text = (el.textContent || '').trim();
    if (!text) return null;
    return [makeBlock('text', {
      content: `<p>${el.innerHTML}</p>`,
      align: extractAlign(style) || 'left',
      fontSize: parseInt(extractStyleProp(style, 'font-size') || '14') || 14,
      color: extractStyleProp(style, 'color') || '#333333',
    })];
  }

  // ── <ul>/<ol> → text block ──
  if (tag === 'ul' || tag === 'ol') {
    return [makeBlock('text', {
      content: el.outerHTML,
      align: 'left',
      fontSize: 14,
      color: '#333333',
    })];
  }

  // ── <style>, <meta>, <title>, <link>, <head> — skip ──
  if (['style', 'meta', 'title', 'link', 'head', 'script', 'br'].includes(tag)) {
    return null;
  }

  // ── Fallback: wrap unknown elements as html block ──
  const outerHtml = el.outerHTML;
  if (outerHtml && outerHtml.trim()) {
    return [makeBlock('html', { code: outerHtml })];
  }

  return null;
}

// ─── Element Parsers ─────────────────────────────────────────

function parseImageFromEl(el: Element, parentAlign?: string): EmailBlock {
  return makeBlock('image', {
    src: el.getAttribute('src') || '',
    alt: el.getAttribute('alt') || '',
    width: el.getAttribute('width') || extractStyleProp(el.getAttribute('style') || '', 'width') || '100%',
    align: parentAlign || 'center',
    link: '',
    paddingTop: 10,
    paddingBottom: 10,
  });
}

function parseButtonFromLink(el: Element, parentAlign?: string): EmailBlock {
  const style = el.getAttribute('style') || '';
  return makeBlock('button', {
    text: (el.textContent || '').trim() || 'Botón',
    url: el.getAttribute('href') || '#',
    bgColor: extractStyleProp(style, 'background-color') || extractStyleProp(style, 'background') || '#000000',
    textColor: extractStyleProp(style, 'color') || '#ffffff',
    borderRadius: parseInt(extractStyleProp(style, 'border-radius') || '4') || 4,
    align: parentAlign || extractAlign(style) || 'center',
    width: 'auto',
    paddingV: parseInt(extractStyleProp(style, 'padding-top') || extractStyleProp(style, 'padding')?.split(' ')[0] || '14') || 14,
    paddingH: parseInt(extractStyleProp(style, 'padding-left') || extractStyleProp(style, 'padding')?.split(' ')[1] || '32') || 32,
  });
}

function parseProductBlock(el: Element): EmailBlock {
  return makeBlock('product', {
    productMode: 'dynamic',
    dynamicType: el.getAttribute('data-product-type') || 'best_sellers',
    productsCount: parseInt(el.getAttribute('data-product-count') || '3') || 3,
    showPrice: el.getAttribute('data-show-price') !== 'false',
    showButton: el.getAttribute('data-show-button') !== 'false',
    buttonText: el.getAttribute('data-button-text') || 'Comprar',
  });
}

function parseCouponBlock(el: Element): EmailBlock {
  return makeBlock('coupon', {
    discountMode: el.getAttribute('data-discount-mode') || 'manual',
    discountType: el.getAttribute('data-discount-type') || 'percentage',
    discountValue: el.getAttribute('data-discount-value') || '',
    code: el.getAttribute('data-discount-code') || '',
    expirationDays: el.getAttribute('data-expiration-days') || '',
    description: '',
    buttonText: 'Usar cupón',
  });
}

function parseTable(el: Element): EmailBlock[] {
  const rows = el.querySelectorAll(':scope > tbody > tr, :scope > tr');
  if (rows.length === 0) return [makeBlock('html', { code: el.outerHTML })];

  // Check if this is a layout table (columns) — single row with multiple tds that contain blocks
  if (rows.length === 1) {
    const tds = rows[0].querySelectorAll(':scope > td');
    if (tds.length >= 2) {
      // Check if tds contain structured content (not just data cells)
      const hasBlockContent = Array.from(tds).some(td =>
        td.querySelector('img, a, div, p, h1, h2, h3, table') !== null
      );
      if (hasBlockContent) {
        // This is a columns/split layout
        const columns = Array.from(tds).map(td => {
          const childBlocks: EmailBlock[] = [];
          for (const child of Array.from(td.childNodes)) {
            const parsed = parseNode(child);
            if (parsed) childBlocks.push(...parsed);
          }
          return childBlocks;
        });

        if (columns.length === 2) {
          // Detect proportions from width styles
          const w1 = extractStyleProp(tds[0].getAttribute('style') || '', 'width');
          let layout = '50/50';
          if (w1) {
            const pct = parseInt(w1);
            if (pct <= 30) layout = '25/75';
            else if (pct <= 40) layout = '33/67';
            else if (pct >= 60 && pct < 70) layout = '67/33';
            else if (pct >= 70) layout = '75/25';
          }
          return [makeBlock('split', { layout, columns })];
        }

        if (columns.length === 3) {
          return [makeBlock('split', { layout: '33/33/33', columns })];
        }

        // Generic columns
        return [makeBlock('columns', {
          count: columns.length,
          proportions: columns.map(() => Math.floor(100 / columns.length)).join('/'),
          columns,
        })];
      }
    }
  }

  // Check if this looks like a data table (has th elements or structured rows)
  const hasHeaders = el.querySelector('th') !== null;
  if (hasHeaders || rows.length >= 2) {
    const data: string[][] = [];
    for (const row of Array.from(rows)) {
      const cells = row.querySelectorAll('th, td');
      data.push(Array.from(cells).map(c => (c.textContent || '').trim()));
    }
    if (data.length > 0 && data[0].length > 0 && data[0].some(c => c.length > 0)) {
      return [makeBlock('table', {
        data,
        headerBgColor: '#000000',
        headerTextColor: '#ffffff',
        showBorders: true,
      })];
    }
  }

  // Fallback: parse table contents recursively
  const blocks: EmailBlock[] = [];
  for (const row of Array.from(rows)) {
    const tds = row.querySelectorAll(':scope > td');
    for (const td of Array.from(tds)) {
      for (const child of Array.from(td.childNodes)) {
        const parsed = parseNode(child);
        if (parsed) blocks.push(...parsed);
      }
    }
  }
  return blocks.length > 0 ? blocks : [makeBlock('html', { code: el.outerHTML })];
}

// ─── Helpers ─────────────────────────────────────────────────

function makeBlock(type: BlockType, props: Record<string, any>): EmailBlock {
  return {
    id: crypto.randomUUID(),
    type,
    props,
  };
}

function looksLikeButton(el: Element): boolean {
  const style = el.getAttribute('style') || '';
  const hasBg = /background(-color)?:\s*[^;]*[#rgb]/.test(style);
  const hasPadding = /padding/.test(style);
  const hasDecoration = /text-decoration:\s*none/.test(style);
  const isShort = (el.textContent || '').trim().length < 60;
  return hasBg && hasPadding && isShort && (hasDecoration || hasBg);
}

function extractStyleProp(style: string, prop: string): string {
  if (!style) return '';
  // Handle shorthand 'background' when looking for 'background-color'
  const regex = new RegExp(`(?:^|;)\\s*${prop.replace('-', '\\-')}\\s*:\\s*([^;!]+)`, 'i');
  const match = style.match(regex);
  return match ? match[1].trim() : '';
}

function extractAlign(style: string): string {
  const align = extractStyleProp(style, 'text-align');
  if (align && ['left', 'center', 'right'].includes(align)) return align;
  return '';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
