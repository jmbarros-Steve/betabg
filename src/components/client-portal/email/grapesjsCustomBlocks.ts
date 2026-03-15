/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Custom GrapeJS blocks for e-commerce email editor.
 *
 * Registers 4 block types (Products, Discount, Countdown, Button) that output
 * HTML with `data-steve-*` attributes. The backend (email-html-processor.ts)
 * parses these attributes at send time and replaces them with real data.
 *
 * NOTE: GrapeJS component model methods (init, updateContent, toHTML) run with
 * `this` bound to a Backbone Model at runtime. We use explicit `self: any`
 * casts to satisfy TypeScript.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function productGridHTML(
  count: number,
  columns: number,
  showPrice: boolean,
  showButton: boolean,
  buttonText: string,
  buttonColor: string,
  productType: string,
): string {
  const colWidth = Math.floor(100 / columns);
  let cells = '';
  for (let i = 0; i < count; i++) {
    const priceBlock = showPrice
      ? `<p style="margin:8px 0 0;font-size:16px;font-weight:700;color:#18181b;">$99.990</p>`
      : '';
    const btnBlock = showButton
      ? `<a href="#" style="display:inline-block;margin-top:12px;padding:10px 24px;background:${buttonColor};color:#ffffff;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">${buttonText}</a>`
      : '';
    cells += `<td style="width:${colWidth}%;padding:8px;vertical-align:top;text-align:center;">
      <img src="https://placehold.co/280x280/f4f4f5/a1a1aa?text=Producto" alt="Producto" style="width:100%;max-width:280px;border-radius:8px;" />
      <p style="margin:8px 0 0;font-size:14px;color:#18181b;font-weight:600;">Producto ${i + 1}</p>
      ${priceBlock}
      ${btnBlock}
    </td>`;
  }

  // Break into rows based on columns
  let rows = '';
  const cellArr = cells.split('</td>').filter(c => c.trim());
  for (let r = 0; r < cellArr.length; r += columns) {
    const rowCells = cellArr.slice(r, r + columns).map(c => c + '</td>').join('');
    rows += `<tr>${rowCells}</tr>`;
  }

  return `<div data-steve-products="true" data-product-type="${productType}" data-product-count="${count}" data-columns="${columns}" data-show-price="${showPrice}" data-show-button="${showButton}" data-button-text="${buttonText}" data-button-color="${buttonColor}" style="padding:16px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
    ${rows}
  </table>
</div>`;
}

function discountHTML(
  code: string,
  source: string,
  type: string,
  value: string,
  bgColor: string,
  textColor: string,
  borderColor: string,
  ctaText: string,
  ctaUrl: string,
  ctaColor: string,
): string {
  const displayValue =
    type === 'free_shipping'
      ? 'Envio Gratis'
      : type === 'percentage'
        ? `${value}% OFF`
        : `$${value} OFF`;

  return `<div data-steve-discount="true" data-discount-code="${code}" data-discount-source="${source}" data-discount-type="${type}" data-discount-value="${value}" style="text-align:center;padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
    <tr><td align="center">
      <table cellpadding="0" cellspacing="0" border="0" style="border:2px dashed ${borderColor};border-radius:12px;background:${bgColor};">
        <tr><td style="padding:24px 40px;text-align:center;">
          <p style="margin:0 0 4px;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:1px;">Tu codigo de descuento</p>
          <p style="margin:0 0 4px;font-size:14px;color:#71717a;">${displayValue}</p>
          <p style="margin:0 0 16px;font-size:28px;font-weight:700;color:${textColor};letter-spacing:3px;">${code}</p>
          <a href="${ctaUrl || '#'}" style="display:inline-block;padding:10px 28px;background:${ctaColor};color:#ffffff;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">${ctaText}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</div>`;
}

function countdownHTML(
  endDate: string,
  labelText: string,
  expiredText: string,
  bgColor: string,
  textColor: string,
): string {
  const boxStyle = `display:inline-block;width:60px;padding:12px 0;margin:0 4px;background:${bgColor};border-radius:8px;text-align:center;`;
  const numStyle = `font-size:24px;font-weight:700;color:${textColor};line-height:1;`;
  const lblStyle = `font-size:10px;color:${textColor};opacity:0.7;text-transform:uppercase;letter-spacing:1px;margin-top:4px;`;

  return `<div data-steve-countdown="true" data-end-date="${endDate}" style="text-align:center;padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
    <tr><td align="center">
      <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#18181b;">${labelText}</p>
      <table cellpadding="0" cellspacing="0" border="0" style="display:inline-table;">
        <tr>
          <td style="${boxStyle}">
            <div style="${numStyle}">00</div>
            <div style="${lblStyle}">Dias</div>
          </td>
          <td style="${boxStyle}">
            <div style="${numStyle}">00</div>
            <div style="${lblStyle}">Horas</div>
          </td>
          <td style="${boxStyle}">
            <div style="${numStyle}">00</div>
            <div style="${lblStyle}">Min</div>
          </td>
          <td style="${boxStyle}">
            <div style="${numStyle}">00</div>
            <div style="${lblStyle}">Seg</div>
          </td>
        </tr>
      </table>
      <!--[if false]><p style="margin:16px 0 0;font-size:14px;color:#71717a;">${expiredText}</p><![endif]-->
    </td></tr>
  </table>
</div>`;
}

function styledButtonHTML(
  text: string,
  url: string,
  style: string,
  size: string,
  color: string,
  textColor: string,
  align: string,
): string {
  let padding = '12px 28px';
  let fontSize = '14px';
  let width = 'auto';
  switch (size) {
    case 'small':
      padding = '8px 20px';
      fontSize = '13px';
      break;
    case 'large':
      padding = '16px 36px';
      fontSize = '16px';
      break;
    case 'full':
      padding = '14px 28px';
      width = '100%';
      break;
  }

  let bg = color;
  let border = 'none';
  let txtColor = textColor;
  let borderRadius = '6px';
  let shadow = '';
  let bgGrad = '';

  switch (style) {
    case 'outline':
      bg = 'transparent';
      border = `2px solid ${color}`;
      txtColor = color;
      break;
    case 'pill':
      borderRadius = '50px';
      break;
    case 'shadow':
      shadow = `box-shadow:0 4px 14px rgba(0,0,0,0.15);`;
      break;
    case 'gradient':
      bgGrad = `background:linear-gradient(135deg, ${color}, ${lightenColor(color)});`;
      bg = color; // fallback
      break;
  }

  const textAlign =
    align === 'left' ? 'left' : align === 'right' ? 'right' : 'center';

  const inlineStyle = [
    `display:inline-block`,
    `padding:${padding}`,
    `background:${bg}`,
    bgGrad,
    `color:${txtColor}`,
    `border:${border}`,
    `border-radius:${borderRadius}`,
    `text-decoration:none`,
    `font-size:${fontSize}`,
    `font-weight:600`,
    shadow,
    width !== 'auto' ? `width:${width};text-align:center;box-sizing:border-box` : '',
  ]
    .filter(Boolean)
    .join(';');

  return `<div style="text-align:${textAlign};padding:16px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
    <tr><td align="${textAlign}">
      <a href="${url || '#'}" style="${inlineStyle}">${text}</a>
    </td></tr>
  </table>
</div>`;
}

/** Lighten a hex color for gradient effect */
function lightenColor(hex: string): string {
  const h = hex.replace('#', '');
  const num = parseInt(h, 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + 60);
  const g = Math.min(255, ((num >> 8) & 0xff) + 60);
  const b = Math.min(255, (num & 0xff) + 60);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Default end-date: 7 days from now */
function defaultEndDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 16);
}

// ---------------------------------------------------------------------------
// Main registration function
// ---------------------------------------------------------------------------

export function registerSteveBlocks(editor: any): void {
  // =========================================================================
  // 1. PRODUCT GRID
  // =========================================================================
  editor.Components.addType('steve-products', {
    isComponent(el: HTMLElement) {
      return el?.getAttribute?.('data-steve-products') === 'true';
    },
    model: {
      defaults: {
        tagName: 'div',
        droppable: false,
        traits: [
          {
            type: 'select',
            name: 'productType',
            label: 'Tipo de Producto',
            options: [
              { id: 'best_sellers', label: 'Mas vendidos' },
              { id: 'new_arrivals', label: 'Nuevos' },
              { id: 'recently_viewed', label: 'Ultimos vistos' },
              { id: 'abandoned_cart', label: 'Carrito abandonado' },
              { id: 'complementary', label: 'Complementarios' },
              { id: 'all', label: 'Todos' },
            ],
            changeProp: true,
          },
          {
            type: 'select',
            name: 'productCount',
            label: 'Cantidad de Productos',
            options: [
              { id: '2', label: '2' },
              { id: '3', label: '3' },
              { id: '4', label: '4' },
              { id: '6', label: '6' },
            ],
            changeProp: true,
          },
          {
            type: 'select',
            name: 'columns',
            label: 'Columnas',
            options: [
              { id: '1', label: '1' },
              { id: '2', label: '2' },
              { id: '3', label: '3' },
            ],
            changeProp: true,
          },
          {
            type: 'checkbox',
            name: 'showPrice',
            label: 'Mostrar Precio',
            changeProp: true,
          },
          {
            type: 'checkbox',
            name: 'showButton',
            label: 'Mostrar Boton',
            changeProp: true,
          },
          {
            type: 'text',
            name: 'buttonText',
            label: 'Texto del Boton',
            changeProp: true,
          },
          {
            type: 'color',
            name: 'buttonColor',
            label: 'Color del Boton',
            changeProp: true,
          },
        ],
        productType: 'best_sellers',
        productCount: '4',
        columns: '2',
        showPrice: true,
        showButton: true,
        buttonText: 'Comprar',
        buttonColor: '#18181b',
      },
      init(this: any) {
        this.on('change:productType change:productCount change:columns change:showPrice change:showButton change:buttonText change:buttonColor', this.updateContent);
        this.updateContent();
      },
      updateContent(this: any) {
        const html = productGridHTML(
          parseInt(this.get('productCount') || '4', 10),
          parseInt(this.get('columns') || '2', 10),
          this.get('showPrice') !== false,
          this.get('showButton') !== false,
          this.get('buttonText') || 'Comprar',
          this.get('buttonColor') || '#18181b',
          this.get('productType') || 'best_sellers',
        );
        this.set('content', '');
        this.components(html);
      },
      toHTML(this: any) {
        return productGridHTML(
          parseInt(this.get('productCount') || '4', 10),
          parseInt(this.get('columns') || '2', 10),
          this.get('showPrice') !== false,
          this.get('showButton') !== false,
          this.get('buttonText') || 'Comprar',
          this.get('buttonColor') || '#18181b',
          this.get('productType') || 'best_sellers',
        );
      },
    },
  });

  editor.BlockManager.add('steve-products', {
    label: 'Productos',
    category: 'E-Commerce',
    content: { type: 'steve-products' },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>`,
  });

  // =========================================================================
  // 2. DISCOUNT CODE
  // =========================================================================
  editor.Components.addType('steve-discount', {
    isComponent(el: HTMLElement) {
      return el?.getAttribute?.('data-steve-discount') === 'true';
    },
    model: {
      defaults: {
        tagName: 'div',
        droppable: false,
        traits: [
          {
            type: 'select',
            name: 'discountSource',
            label: 'Origen del Codigo',
            options: [
              { id: 'manual', label: 'Codigo manual' },
              { id: 'shopify_create', label: 'Crear en Shopify automatico' },
            ],
            changeProp: true,
          },
          {
            type: 'text',
            name: 'discountCode',
            label: 'Codigo de Descuento',
            changeProp: true,
          },
          {
            type: 'select',
            name: 'discountType',
            label: 'Tipo de Descuento',
            options: [
              { id: 'percentage', label: 'Porcentaje' },
              { id: 'fixed_amount', label: 'Monto fijo' },
              { id: 'free_shipping', label: 'Envio gratis' },
            ],
            changeProp: true,
          },
          {
            type: 'text',
            name: 'discountValue',
            label: 'Valor del Descuento',
            changeProp: true,
          },
          {
            type: 'color',
            name: 'bgColor',
            label: 'Color de Fondo',
            changeProp: true,
          },
          {
            type: 'color',
            name: 'textColor',
            label: 'Color del Texto',
            changeProp: true,
          },
          {
            type: 'color',
            name: 'borderColor',
            label: 'Color del Borde',
            changeProp: true,
          },
          {
            type: 'text',
            name: 'ctaText',
            label: 'Texto del Boton',
            changeProp: true,
          },
          {
            type: 'text',
            name: 'ctaUrl',
            label: 'URL del Boton',
            changeProp: true,
          },
          {
            type: 'color',
            name: 'ctaColor',
            label: 'Color del Boton',
            changeProp: true,
          },
        ],
        discountSource: 'manual',
        discountCode: 'DESCUENTO20',
        discountType: 'percentage',
        discountValue: '20',
        bgColor: '#fafafa',
        textColor: '#18181b',
        borderColor: '#d4d4d8',
        ctaText: 'Usar Codigo',
        ctaUrl: '',
        ctaColor: '#18181b',
      },
      init(this: any) {
        this.on(
          'change:discountSource change:discountCode change:discountType change:discountValue change:bgColor change:textColor change:borderColor change:ctaText change:ctaUrl change:ctaColor',
          this.updateContent,
        );
        this.updateContent();
      },
      updateContent(this: any) {
        const html = discountHTML(
          this.get('discountCode') || 'DESCUENTO20',
          this.get('discountSource') || 'manual',
          this.get('discountType') || 'percentage',
          this.get('discountValue') || '20',
          this.get('bgColor') || '#fafafa',
          this.get('textColor') || '#18181b',
          this.get('borderColor') || '#d4d4d8',
          this.get('ctaText') || 'Usar Codigo',
          this.get('ctaUrl') || '',
          this.get('ctaColor') || '#18181b',
        );
        this.set('content', '');
        this.components(html);
      },
      toHTML(this: any) {
        return discountHTML(
          this.get('discountCode') || 'DESCUENTO20',
          this.get('discountSource') || 'manual',
          this.get('discountType') || 'percentage',
          this.get('discountValue') || '20',
          this.get('bgColor') || '#fafafa',
          this.get('textColor') || '#18181b',
          this.get('borderColor') || '#d4d4d8',
          this.get('ctaText') || 'Usar Codigo',
          this.get('ctaUrl') || '',
          this.get('ctaColor') || '#18181b',
        );
      },
    },
  });

  editor.BlockManager.add('steve-discount', {
    label: 'Descuento',
    category: 'E-Commerce',
    content: { type: 'steve-discount' },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
  });

  // =========================================================================
  // 3. COUNTDOWN TIMER
  // =========================================================================
  editor.Components.addType('steve-countdown', {
    isComponent(el: HTMLElement) {
      return el?.getAttribute?.('data-steve-countdown') === 'true';
    },
    model: {
      defaults: {
        tagName: 'div',
        droppable: false,
        traits: [
          {
            type: 'text',
            name: 'endDate',
            label: 'Fecha de Fin (ISO)',
            changeProp: true,
          },
          {
            type: 'text',
            name: 'labelText',
            label: 'Texto Superior',
            changeProp: true,
          },
          {
            type: 'text',
            name: 'expiredText',
            label: 'Texto Expirado',
            changeProp: true,
          },
          {
            type: 'color',
            name: 'bgColor',
            label: 'Color de Fondo',
            changeProp: true,
          },
          {
            type: 'color',
            name: 'textColor',
            label: 'Color del Texto',
            changeProp: true,
          },
        ],
        endDate: defaultEndDate(),
        labelText: 'La oferta termina en',
        expiredText: 'Esta oferta ha expirado',
        bgColor: '#18181b',
        textColor: '#ffffff',
      },
      init(this: any) {
        this.on(
          'change:endDate change:labelText change:expiredText change:bgColor change:textColor',
          this.updateContent,
        );
        this.updateContent();
      },
      updateContent(this: any) {
        const html = countdownHTML(
          this.get('endDate') || defaultEndDate(),
          this.get('labelText') || 'La oferta termina en',
          this.get('expiredText') || 'Esta oferta ha expirado',
          this.get('bgColor') || '#18181b',
          this.get('textColor') || '#ffffff',
        );
        this.set('content', '');
        this.components(html);
      },
      toHTML(this: any) {
        return countdownHTML(
          this.get('endDate') || defaultEndDate(),
          this.get('labelText') || 'La oferta termina en',
          this.get('expiredText') || 'Esta oferta ha expirado',
          this.get('bgColor') || '#18181b',
          this.get('textColor') || '#ffffff',
        );
      },
    },
  });

  editor.BlockManager.add('steve-countdown', {
    label: 'Cuenta Regresiva',
    category: 'E-Commerce',
    content: { type: 'steve-countdown' },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  });

  // =========================================================================
  // 4. STYLED BUTTON
  // =========================================================================
  editor.Components.addType('steve-button', {
    isComponent(el: HTMLElement) {
      return el?.closest?.('[data-gjs-type="steve-button"]') != null;
    },
    model: {
      defaults: {
        tagName: 'div',
        droppable: false,
        traits: [
          {
            type: 'text',
            name: 'btnText',
            label: 'Texto del Boton',
            changeProp: true,
          },
          {
            type: 'text',
            name: 'btnUrl',
            label: 'URL del Boton',
            changeProp: true,
          },
          {
            type: 'select',
            name: 'btnStyle',
            label: 'Estilo',
            options: [
              { id: 'filled', label: 'Relleno' },
              { id: 'outline', label: 'Solo borde' },
              { id: 'pill', label: 'Pildora' },
              { id: 'shadow', label: 'Sombra' },
              { id: 'gradient', label: 'Gradiente' },
            ],
            changeProp: true,
          },
          {
            type: 'select',
            name: 'btnSize',
            label: 'Tamano',
            options: [
              { id: 'small', label: 'Pequeno' },
              { id: 'medium', label: 'Mediano' },
              { id: 'large', label: 'Grande' },
              { id: 'full', label: 'Ancho completo' },
            ],
            changeProp: true,
          },
          {
            type: 'color',
            name: 'btnColor',
            label: 'Color del Boton',
            changeProp: true,
          },
          {
            type: 'color',
            name: 'btnTextColor',
            label: 'Color del Texto',
            changeProp: true,
          },
          {
            type: 'select',
            name: 'btnAlign',
            label: 'Alineacion',
            options: [
              { id: 'left', label: 'Izquierda' },
              { id: 'center', label: 'Centro' },
              { id: 'right', label: 'Derecha' },
            ],
            changeProp: true,
          },
        ],
        btnText: 'Comprar Ahora',
        btnUrl: '',
        btnStyle: 'filled',
        btnSize: 'medium',
        btnColor: '#18181b',
        btnTextColor: '#ffffff',
        btnAlign: 'center',
      },
      init(this: any) {
        this.on(
          'change:btnText change:btnUrl change:btnStyle change:btnSize change:btnColor change:btnTextColor change:btnAlign',
          this.updateContent,
        );
        this.updateContent();
      },
      updateContent(this: any) {
        const html = styledButtonHTML(
          this.get('btnText') || 'Comprar Ahora',
          this.get('btnUrl') || '',
          this.get('btnStyle') || 'filled',
          this.get('btnSize') || 'medium',
          this.get('btnColor') || '#18181b',
          this.get('btnTextColor') || '#ffffff',
          this.get('btnAlign') || 'center',
        );
        this.set('content', '');
        this.components(html);
      },
      toHTML(this: any) {
        return styledButtonHTML(
          this.get('btnText') || 'Comprar Ahora',
          this.get('btnUrl') || '',
          this.get('btnStyle') || 'filled',
          this.get('btnSize') || 'medium',
          this.get('btnColor') || '#18181b',
          this.get('btnTextColor') || '#ffffff',
          this.get('btnAlign') || 'center',
        );
      },
    },
  });

  editor.BlockManager.add('steve-button', {
    label: 'Boton Diseno',
    category: 'E-Commerce',
    content: { type: 'steve-button' },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"/></svg>`,
  });
}
