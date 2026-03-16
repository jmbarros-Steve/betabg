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

function dynamicFeedHTML(
  feedType: string,
  count: string,
  columns: string,
  title: string,
): string {
  return `<div data-steve-products="true" data-product-type="${feedType}" data-product-count="${count}" data-columns="${columns}" data-show-price="true" data-show-button="true" data-button-text="Comprar" data-button-color="#18181b" data-dynamic-feed="true" style="padding:16px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
    <tr><td style="padding:0 0 16px;text-align:center;">
      <p style="margin:0 0 4px;font-size:11px;color:#a1a1aa;text-transform:uppercase;letter-spacing:1px;">Productos dinamicos</p>
      <p style="margin:0;font-size:18px;font-weight:700;color:#18181b;">${title}</p>
    </td></tr>
    <tr><td style="padding:20px;text-align:center;background:#fafafa;border-radius:8px;border:1px dashed #d4d4d8;">
      <p style="margin:0 0 4px;font-size:14px;color:#71717a;">${count} productos · ${columns} columna${parseInt(columns) > 1 ? 's' : ''}</p>
      <p style="margin:0;font-size:12px;color:#a1a1aa;">Se personalizan automaticamente con datos de Shopify al enviar</p>
    </td></tr>
  </table>
</div>`;
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
  // CUSTOM TRAIT: Shopify Product Image Picker
  // Fetches products from shopify_products and lets user pick one to set image
  // =========================================================================
  editor.TraitManager.addType('shopify-product-picker', {
    createInput({ trait }: any) {
      const el = document.createElement('div');
      el.innerHTML = `
        <select class="gjs-field" style="width:100%;padding:4px 6px;font-size:12px;background:#27272a;color:#fafafa;border:1px solid #3f3f46;border-radius:4px;">
          <option value="">Elegir producto de Shopify...</option>
          <option value="__loading" disabled>Cargando productos...</option>
        </select>
      `;
      const select = el.querySelector('select') as HTMLSelectElement;

      // Fetch Shopify products
      const clientId = (editor as any).__steveClientId;
      if (clientId) {
        import('@/lib/api').then(({ callApi }) => {
          callApi('fetch-shopify-products', {
            body: { client_id: clientId, limit: 30 },
          }).then(({ data }: any) => {
            // Remove loading option
            const loadingOpt = select.querySelector('option[value="__loading"]');
            if (loadingOpt) loadingOpt.remove();

            const products = data?.products || data || [];
            if (products.length === 0) {
              const opt = document.createElement('option');
              opt.value = '';
              opt.disabled = true;
              opt.textContent = 'No hay productos';
              select.appendChild(opt);
              return;
            }
            for (const p of products) {
              if (!p.image_url) continue;
              const opt = document.createElement('option');
              opt.value = JSON.stringify({ image_url: p.image_url, title: p.title, handle: p.handle });
              opt.textContent = `${p.title} ($${Number(p.price || 0).toLocaleString('es-CL')})`;
              select.appendChild(opt);
            }
          }).catch(() => {
            const loadingOpt = select.querySelector('option[value="__loading"]');
            if (loadingOpt) loadingOpt.textContent = 'Error cargando productos';
          });
        });
      } else {
        const loadingOpt = select.querySelector('option[value="__loading"]');
        if (loadingOpt) loadingOpt.textContent = 'clientId no disponible';
      }

      // On change, update image src and alt
      select.addEventListener('change', () => {
        if (!select.value) return;
        try {
          const product = JSON.parse(select.value);
          const component = editor.getSelected();
          if (component) {
            component.set('imgSrc', product.image_url);
            component.set('imgAlt', product.title || 'Producto');
            if (product.handle) {
              const domain = (editor as any).__steveShopDomain || '';
              if (domain) {
                component.set('imgLink', `https://${domain}/products/${product.handle}`);
              }
            }
          }
        } catch { /* ignore parse errors */ }
      });

      return el;
    },
  });

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

  // =========================================================================
  // 5. SOCIAL LINKS
  // =========================================================================
  editor.BlockManager.add('steve-social', {
    label: 'Redes Sociales',
    category: 'E-Commerce',
    content: `<div style="text-align:center;padding:20px 16px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
    <a href="https://facebook.com" style="display:inline-block;margin:0 6px;" title="Facebook">
      <img src="https://cdn-icons-png.flaticon.com/32/733/733547.png" alt="Facebook" width="32" height="32" style="border:0;" />
    </a>
    <a href="https://instagram.com" style="display:inline-block;margin:0 6px;" title="Instagram">
      <img src="https://cdn-icons-png.flaticon.com/32/733/733558.png" alt="Instagram" width="32" height="32" style="border:0;" />
    </a>
    <a href="https://twitter.com" style="display:inline-block;margin:0 6px;" title="X / Twitter">
      <img src="https://cdn-icons-png.flaticon.com/32/733/733579.png" alt="Twitter" width="32" height="32" style="border:0;" />
    </a>
    <a href="https://tiktok.com" style="display:inline-block;margin:0 6px;" title="TikTok">
      <img src="https://cdn-icons-png.flaticon.com/32/3046/3046121.png" alt="TikTok" width="32" height="32" style="border:0;" />
    </a>
    <a href="https://wa.me/" style="display:inline-block;margin:0 6px;" title="WhatsApp">
      <img src="https://cdn-icons-png.flaticon.com/32/733/733585.png" alt="WhatsApp" width="32" height="32" style="border:0;" />
    </a>
  </td></tr></table>
</div>`,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg>`,
  });

  // =========================================================================
  // 6. EMAIL HEADER
  // =========================================================================
  editor.BlockManager.add('steve-header', {
    label: 'Header',
    category: 'Estructura',
    content: `<div style="background-color:#18181b;padding:24px 32px;text-align:center;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td align="center">
      <img src="https://placehold.co/160x48/18181b/fafafa?text=TU+LOGO" alt="Logo" style="max-height:48px;border:0;" />
    </td>
  </tr><tr>
    <td align="center" style="padding-top:12px;">
      <a href="#" style="color:#a1a1aa;text-decoration:none;font-size:13px;margin:0 10px;">Inicio</a>
      <a href="#" style="color:#a1a1aa;text-decoration:none;font-size:13px;margin:0 10px;">Tienda</a>
      <a href="#" style="color:#a1a1aa;text-decoration:none;font-size:13px;margin:0 10px;">Ofertas</a>
      <a href="#" style="color:#a1a1aa;text-decoration:none;font-size:13px;margin:0 10px;">Contacto</a>
    </td>
  </tr></table>
</div>`,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>`,
  });

  // =========================================================================
  // 7. EMAIL FOOTER
  // =========================================================================
  editor.BlockManager.add('steve-footer', {
    label: 'Footer',
    category: 'Estructura',
    content: `<div style="background-color:#f4f4f5;padding:32px 24px;text-align:center;border-top:1px solid #e4e4e7;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center">
      <p style="margin:0 0 8px;font-size:13px;color:#71717a;">{{ empresa }} — {{ direccion }}</p>
      <p style="margin:0 0 16px;font-size:12px;color:#a1a1aa;">Recibiste este email porque estas suscrito a nuestro newsletter.</p>
      <a href="{{ unsubscribe_url }}" style="font-size:12px;color:#2563eb;text-decoration:underline;">Desuscribirse</a>
      <span style="color:#d4d4d8;margin:0 8px;">|</span>
      <a href="{{ preferences_url }}" style="font-size:12px;color:#2563eb;text-decoration:underline;">Preferencias</a>
    </td></tr>
  </table>
</div>`,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="15" x2="21" y2="15"/></svg>`,
  });

  // =========================================================================
  // 8. IMAGE WITH CAPTION (configurable component)
  // =========================================================================
  editor.Components.addType('steve-image', {
    isComponent(el: HTMLElement) {
      return el?.getAttribute?.('data-steve-image') === 'true';
    },
    model: {
      defaults: {
        tagName: 'div',
        droppable: false,
        traits: [
          {
            type: 'shopify-product-picker',
            name: 'shopifyProduct',
            label: 'Producto de Shopify',
          },
          {
            type: 'text',
            name: 'imgSrc',
            label: 'URL de Imagen',
            placeholder: 'https://... o sube una imagen',
            changeProp: true,
          },
          {
            type: 'text',
            name: 'imgAlt',
            label: 'Texto alternativo',
            changeProp: true,
          },
          {
            type: 'text',
            name: 'imgLink',
            label: 'URL al hacer click',
            placeholder: 'https://tu-tienda.com/producto',
            changeProp: true,
          },
          {
            type: 'text',
            name: 'imgCaption',
            label: 'Caption (pie de imagen)',
            changeProp: true,
          },
          {
            type: 'select',
            name: 'imgMaxWidth',
            label: 'Ancho maximo',
            options: [
              { id: '280', label: 'Pequeno (280px)' },
              { id: '400', label: 'Mediano (400px)' },
              { id: '560', label: 'Grande (560px)' },
              { id: '100%', label: 'Completo' },
            ],
            changeProp: true,
          },
          {
            type: 'select',
            name: 'imgBorderRadius',
            label: 'Bordes',
            options: [
              { id: '0', label: 'Sin redondeo' },
              { id: '8', label: 'Redondeado' },
              { id: '16', label: 'Muy redondeado' },
              { id: '50%', label: 'Circular' },
            ],
            changeProp: true,
          },
          {
            type: 'select',
            name: 'imgAlign',
            label: 'Alineacion',
            options: [
              { id: 'left', label: 'Izquierda' },
              { id: 'center', label: 'Centro' },
              { id: 'right', label: 'Derecha' },
            ],
            changeProp: true,
          },
        ],
        imgSrc: 'https://placehold.co/560x320/e4e4e7/71717a?text=Tu+Imagen',
        imgAlt: 'Imagen',
        imgLink: '',
        imgCaption: '',
        imgMaxWidth: '560',
        imgBorderRadius: '8',
        imgAlign: 'center',
      },
      init(this: any) {
        this.on('change:imgSrc change:imgAlt change:imgLink change:imgCaption change:imgMaxWidth change:imgBorderRadius change:imgAlign', this.updateContent);
        this.updateContent();
      },
      updateContent(this: any) {
        const src = this.get('imgSrc') || 'https://placehold.co/560x320/e4e4e7/71717a?text=Tu+Imagen';
        const alt = this.get('imgAlt') || 'Imagen';
        const link = this.get('imgLink') || '';
        const caption = this.get('imgCaption') || '';
        const maxW = this.get('imgMaxWidth') || '560';
        const radius = this.get('imgBorderRadius') || '8';
        const align = this.get('imgAlign') || 'center';

        const mw = maxW === '100%' ? '100%' : `${maxW}px`;
        const br = radius === '50%' ? '50%' : `${radius}px`;
        const imgTag = `<img src="${src}" alt="${alt}" style="width:100%;max-width:${mw};border-radius:${br};display:block;" />`;
        const wrapped = link ? `<a href="${link}" target="_blank" style="display:inline-block;">${imgTag}</a>` : imgTag;
        const captionHtml = caption ? `<p style="margin:12px 0 0;font-size:13px;color:#71717a;font-style:italic;">${caption}</p>` : '';

        const html = `<div data-steve-image="true" style="padding:16px;text-align:${align};">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="${align}">
    ${wrapped}
    ${captionHtml}
  </td></tr></table>
</div>`;
        this.set('content', '');
        this.components(html);
      },
      toHTML(this: any) {
        const src = this.get('imgSrc') || 'https://placehold.co/560x320/e4e4e7/71717a?text=Tu+Imagen';
        const alt = this.get('imgAlt') || 'Imagen';
        const link = this.get('imgLink') || '';
        const caption = this.get('imgCaption') || '';
        const maxW = this.get('imgMaxWidth') || '560';
        const radius = this.get('imgBorderRadius') || '8';
        const align = this.get('imgAlign') || 'center';
        const mw = maxW === '100%' ? '100%' : `${maxW}px`;
        const br = radius === '50%' ? '50%' : `${radius}px`;
        const imgTag = `<img src="${src}" alt="${alt}" style="width:100%;max-width:${mw};border-radius:${br};display:block;" />`;
        const wrapped = link ? `<a href="${link}" target="_blank" style="display:inline-block;">${imgTag}</a>` : imgTag;
        const captionHtml = caption ? `<p style="margin:12px 0 0;font-size:13px;color:#71717a;font-style:italic;">${caption}</p>` : '';
        return `<div data-steve-image="true" style="padding:16px;text-align:${align};"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="${align}">${wrapped}${captionHtml}</td></tr></table></div>`;
      },
    },
  });

  editor.BlockManager.add('steve-image-caption', {
    label: 'Imagen',
    category: 'Contenido',
    content: { type: 'steve-image' },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
  });

  // =========================================================================
  // 9. RICH TEXT BLOCK
  // =========================================================================
  editor.BlockManager.add('steve-rich-text', {
    label: 'Texto Enriquecido',
    category: 'Contenido',
    content: `<div style="padding:20px 32px;">
  <h2 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#18181b;line-height:1.3;">Tu titulo va aqui</h2>
  <p style="margin:0 0 12px;font-size:15px;color:#3f3f46;line-height:1.6;">Este es un bloque de texto enriquecido. Haz doble click para editar. Puedes agregar <strong>negritas</strong>, <em>italicas</em>, <a href="#" style="color:#2563eb;text-decoration:underline;">enlaces</a> y mas.</p>
  <p style="margin:0;font-size:15px;color:#3f3f46;line-height:1.6;">Usa este bloque para escribir parrafos de contenido, descripciones de productos, o cualquier texto largo que necesite formato.</p>
</div>`,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  });

  // =========================================================================
  // 10. DIVIDER
  // =========================================================================
  editor.BlockManager.add('steve-divider', {
    label: 'Separador',
    category: 'Contenido',
    content: `<div style="padding:16px 32px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="border-bottom:1px solid #e4e4e7;font-size:1px;line-height:1px;">&nbsp;</td>
  </tr></table>
</div>`,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/></svg>`,
  });

  // =========================================================================
  // 11. SPACER
  // =========================================================================
  editor.BlockManager.add('steve-spacer', {
    label: 'Espacio',
    category: 'Contenido',
    content: `<div style="height:32px;font-size:1px;line-height:1px;">&nbsp;</div>`,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="8 9 12 5 16 9"/><polyline points="8 15 12 19 16 15"/></svg>`,
  });

  // =========================================================================
  // 12. TWO COLUMNS
  // =========================================================================
  editor.BlockManager.add('steve-two-cols', {
    label: '2 Columnas',
    category: 'Estructura',
    content: `<div style="padding:16px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="width:50%;padding:8px;vertical-align:top;">
      <p style="margin:0;font-size:15px;color:#3f3f46;line-height:1.6;">Contenido columna izquierda. Haz doble click para editar.</p>
    </td>
    <td style="width:50%;padding:8px;vertical-align:top;">
      <p style="margin:0;font-size:15px;color:#3f3f46;line-height:1.6;">Contenido columna derecha. Haz doble click para editar.</p>
    </td>
  </tr></table>
</div>`,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>`,
  });

  // =========================================================================
  // 13. THREE COLUMNS
  // =========================================================================
  editor.BlockManager.add('steve-three-cols', {
    label: '3 Columnas',
    category: 'Estructura',
    content: `<div style="padding:16px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="width:33.33%;padding:8px;vertical-align:top;text-align:center;">
      <img src="https://placehold.co/160x160/e4e4e7/71717a?text=1" alt="" style="width:100%;max-width:160px;border-radius:8px;" />
      <p style="margin:8px 0 0;font-size:14px;color:#3f3f46;">Columna 1</p>
    </td>
    <td style="width:33.33%;padding:8px;vertical-align:top;text-align:center;">
      <img src="https://placehold.co/160x160/e4e4e7/71717a?text=2" alt="" style="width:100%;max-width:160px;border-radius:8px;" />
      <p style="margin:8px 0 0;font-size:14px;color:#3f3f46;">Columna 2</p>
    </td>
    <td style="width:33.33%;padding:8px;vertical-align:top;text-align:center;">
      <img src="https://placehold.co/160x160/e4e4e7/71717a?text=3" alt="" style="width:100%;max-width:160px;border-radius:8px;" />
      <p style="margin:8px 0 0;font-size:14px;color:#3f3f46;">Columna 3</p>
    </td>
  </tr></table>
</div>`,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>`,
  });

  // =========================================================================
  // 14. HERO / BANNER
  // =========================================================================
  editor.BlockManager.add('steve-hero', {
    label: 'Hero Banner',
    category: 'Estructura',
    content: `<div style="background-color:#18181b;background-image:linear-gradient(135deg,#18181b 0%,#3f3f46 100%);padding:48px 32px;text-align:center;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
    <h1 style="margin:0 0 12px;font-size:28px;font-weight:700;color:#ffffff;line-height:1.2;">Tu Titulo Principal</h1>
    <p style="margin:0 0 24px;font-size:16px;color:#a1a1aa;line-height:1.5;max-width:480px;">Subtitulo o descripcion breve que acompana al titulo del banner.</p>
    <a href="#" style="display:inline-block;padding:14px 32px;background:#2563eb;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">Llamada a la Accion</a>
  </td></tr></table>
</div>`,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
  });

  // =========================================================================
  // 15. DYNAMIC PRODUCT FEED
  // =========================================================================
  editor.Components.addType('steve-dynamic-feed', {
    isComponent(el: HTMLElement) {
      return el?.getAttribute?.('data-dynamic-feed') === 'true';
    },
    model: {
      defaults: {
        tagName: 'div',
        droppable: false,
        traits: [
          {
            type: 'select',
            name: 'feedType',
            label: 'Tipo de Feed',
            options: [
              { id: 'best_sellers', label: 'Best Sellers' },
              { id: 'recently_viewed', label: 'Ultimos Vistos' },
              { id: 'new_arrivals', label: 'Recomendados / Nuevos' },
              { id: 'back_in_stock', label: 'Back in Stock' },
              { id: 'complementary', label: 'Complementarios' },
              { id: 'abandoned_cart', label: 'Carrito Abandonado' },
            ],
            changeProp: true,
          },
          {
            type: 'select',
            name: 'feedCount',
            label: 'Cantidad',
            options: [
              { id: '2', label: '2' },
              { id: '3', label: '3' },
              { id: '4', label: '4' },
              { id: '6', label: '6' },
              { id: '8', label: '8' },
            ],
            changeProp: true,
          },
          {
            type: 'select',
            name: 'feedColumns',
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
            name: 'feedShowPrice',
            label: 'Mostrar Precio',
            changeProp: true,
          },
          {
            type: 'text',
            name: 'feedButtonText',
            label: 'Texto del Boton',
            changeProp: true,
          },
        ],
        feedType: 'best_sellers',
        feedCount: '4',
        feedColumns: '2',
        feedShowPrice: true,
        feedButtonText: 'Comprar',
      },
      init(this: any) {
        this.on('change:feedType change:feedCount change:feedColumns change:feedShowPrice change:feedButtonText', this.updateContent);
        this.updateContent();
      },
      updateContent(this: any) {
        const feedType = this.get('feedType') || 'best_sellers';
        const count = this.get('feedCount') || '4';
        const cols = this.get('feedColumns') || '2';
        const feedLabels: Record<string, string> = {
          best_sellers: 'Los mas vendidos',
          recently_viewed: 'Ultimos vistos',
          new_arrivals: 'Recomendados para ti',
          back_in_stock: 'De vuelta en stock',
          complementary: 'Tambien te puede gustar',
          abandoned_cart: 'Olvidaste algo en tu carrito',
        };
        const html = dynamicFeedHTML(feedType, count, cols, feedLabels[feedType] || 'Productos');
        this.set('content', '');
        this.components(html);
      },
      toHTML(this: any) {
        const feedType = this.get('feedType') || 'best_sellers';
        const count = this.get('feedCount') || '4';
        const cols = this.get('feedColumns') || '2';
        const showPrice = this.get('feedShowPrice') !== false;
        const buttonText = this.get('feedButtonText') || 'Comprar';
        return `<div data-steve-products="true" data-product-type="${feedType}" data-product-count="${count}" data-columns="${cols}" data-show-price="${showPrice}" data-show-button="true" data-button-text="${buttonText}" data-button-color="#18181b" data-dynamic-feed="true" style="padding:16px;"><!-- Dynamic feed: ${feedType} --></div>`;
      },
    },
  });

  editor.BlockManager.add('steve-dynamic-feed', {
    label: 'Feed Dinamico',
    category: 'E-Commerce',
    content: { type: 'steve-dynamic-feed' },
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`,
  });

  // =========================================================================
  // 16. IMAGE + TEXT SIDE BY SIDE
  // =========================================================================
  editor.BlockManager.add('steve-img-text', {
    label: 'Imagen + Texto',
    category: 'Contenido',
    content: `<div style="padding:16px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="width:45%;padding:8px;vertical-align:middle;">
      <img src="https://placehold.co/280x280/e4e4e7/71717a?text=Imagen" alt="" style="width:100%;max-width:280px;border-radius:8px;display:block;" />
    </td>
    <td style="width:55%;padding:8px 8px 8px 20px;vertical-align:middle;">
      <h3 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#18181b;">Titulo del Producto</h3>
      <p style="margin:0 0 16px;font-size:14px;color:#52525b;line-height:1.5;">Descripcion breve del producto o contenido destacado que quieras mostrar al lado de la imagen.</p>
      <a href="#" style="display:inline-block;padding:10px 24px;background:#18181b;color:#ffffff;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">Ver Mas</a>
    </td>
  </tr></table>
</div>`,
    media: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="14" y1="8" x2="19" y2="8"/><line x1="14" y1="12" x2="19" y2="12"/><line x1="14" y1="16" x2="17" y2="16"/></svg>`,
  });
}
