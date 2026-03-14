/**
 * Shared Unlayer editor configuration for Steve Mail.
 * Used by CampaignBuilder, FlowBuilder, and UnlayerEmailEditor.
 *
 * Custom tools are registered via registerSteveMailTools() after the editor
 * is ready. We use editor.registerTool() from the React side — NOT customJS,
 * which fails silently due to CORS/iframe issues.
 */
import { steveMailMergeTagsConfig } from './steveMailMergeTags';

export interface SteveMailEditorOptions {
  designTags?: Record<string, string>;
  mergeTagsOverride?: Record<string, any>;
}

export interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  image_url: string;
  price: string;
  url: string;
  product_type?: string;
}

// Helper to create a single-row Unlayer design (the `data` field for blocks)
function makeBlockDesign(cells: number[], columns: any[]): any {
  return {
    counters: { u_column: columns.length + 1, u_row: 2, u_content_text: 10, u_content_image: 5, u_content_button: 5, u_content_heading: 5, u_content_divider: 3, u_content_social: 2 },
    body: {
      id: 'block_body',
      rows: [
        {
          id: 'block_row_1',
          cells,
          columns: columns.map((col: any, i: number) => ({
            id: `block_col_${i}`,
            contents: col.contents,
            values: col.values || { _meta: { htmlID: `u_column_${i + 1}`, htmlClassNames: 'u_column' } },
          })),
          values: {
            displayCondition: null,
            columns: false,
            backgroundColor: '',
            columnsBackgroundColor: '',
            backgroundImage: { url: '', fullWidth: true, repeat: 'no-repeat', size: 'custom', position: 'center' },
            padding: '0px',
            anchor: '',
            hideDesktop: false,
            _meta: { htmlID: 'u_row_1', htmlClassNames: 'u_row' },
            selectable: true,
            draggable: true,
            duplicatable: true,
            deletable: true,
            hideable: true,
          },
        },
      ],
      values: {
        popupPosition: 'center',
        popupWidth: '600px',
        popupHeight: 'auto',
        borderRadius: '10px',
        contentAlign: 'center',
        contentVerticalAlign: 'center',
        contentWidth: '600px',
        fontFamily: { label: 'Inter', value: "'Inter',sans-serif" },
        textColor: '#18181b',
        popupBackgroundColor: '#FFFFFF',
        popupBackgroundImage: { url: '', fullWidth: true, repeat: 'no-repeat', size: 'cover', position: 'center' },
        popupOverlay_backgroundColor: 'rgba(0, 0, 0, 0.1)',
        popupCloseButton_position: 'top-right',
        popupCloseButton_backgroundColor: '#DDDDDD',
        popupCloseButton_iconColor: '#000000',
        popupCloseButton_borderRadius: '0px',
        popupCloseButton_margin: '0px',
        popupCloseButton_action: { name: 'close_popup', attrs: { onClick: "document.querySelector('.u-popup-container').style.display = 'none';" } },
        backgroundColor: '#ffffff',
        backgroundImage: { url: '', fullWidth: true, repeat: 'no-repeat', size: 'custom', position: 'center' },
        preheaderText: '',
        linkStyle: { body: true, linkColor: '#6366f1', linkHoverColor: '#4f46e5', linkUnderline: true, linkHoverUnderline: true },
        _meta: { htmlID: 'u_body', htmlClassNames: 'u_body' },
      },
    },
  };
}

// Pre-built rows that appear in the Blocks tab
const customBlocks = [
  {
    id: 100001,
    category: 'Steve Mail',
    tags: ['steve', 'hero'],
    data: makeBlockDesign([1], [
      {
        contents: [
          {
            type: 'image',
            values: {
              containerPadding: '0px',
              anchor: '',
              src: { url: 'https://placehold.co/600x300/18181b/fafafa?text=Hero+Banner', width: 600, height: 300 },
              textAlign: 'center',
              altText: 'Hero Banner',
              action: { name: 'web', values: { href: '', target: '_blank' } },
              hideDesktop: false,
              displayCondition: null,
              _meta: { htmlID: 'u_content_image_1', htmlClassNames: 'u_content_image' },
              selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
            },
          },
          {
            type: 'heading',
            values: {
              containerPadding: '20px 30px 10px',
              anchor: '',
              headingType: 'h1',
              fontSize: '28px',
              textAlign: 'center',
              lineHeight: '140%',
              linkStyle: { inherit: true, linkColor: '#0000ee', linkHoverColor: '#0000ee', linkUnderline: true, linkHoverUnderline: true },
              hideDesktop: false,
              displayCondition: null,
              _meta: { htmlID: 'u_content_heading_1', htmlClassNames: 'u_content_heading' },
              selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
              text: '<span style="color: #18181b;">Tu Titulo Aqui</span>',
            },
          },
          {
            type: 'text',
            values: {
              containerPadding: '0px 30px 10px',
              anchor: '',
              textAlign: 'center',
              lineHeight: '160%',
              linkStyle: { inherit: true },
              hideDesktop: false,
              displayCondition: null,
              _meta: { htmlID: 'u_content_text_1', htmlClassNames: 'u_content_text' },
              selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
              text: '<p style="font-size: 14px; line-height: 160%;"><span style="color: #71717a;">Subtitulo descriptivo de tu campana o promocion.</span></p>',
            },
          },
          {
            type: 'button',
            values: {
              containerPadding: '16px 30px 24px',
              anchor: '',
              href: { name: 'web', values: { href: '', target: '_blank' } },
              buttonColors: { color: '#ffffff', backgroundColor: '#18181b', hoverColor: '#ffffff', hoverBackgroundColor: '#333333' },
              size: { autoWidth: false, width: '60%' },
              textAlign: 'center',
              lineHeight: '120%',
              padding: '12px 24px',
              borderRadius: '6px',
              hideDesktop: false,
              displayCondition: null,
              _meta: { htmlID: 'u_content_button_1', htmlClassNames: 'u_content_button' },
              selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
              text: '<span style="font-size: 14px; line-height: 16.8px;">Comprar Ahora</span>',
              calculatedWidth: 360, calculatedHeight: 41,
            },
          },
        ],
      },
    ]),
  },
  {
    id: 100002,
    category: 'Steve Mail',
    tags: ['steve', 'producto'],
    data: makeBlockDesign([1, 1], [
      {
        contents: [
          {
            type: 'image',
            values: {
              containerPadding: '16px',
              anchor: '',
              src: { url: 'https://placehold.co/400x400/f4f4f5/a1a1aa?text=Producto', width: 400, height: 400 },
              textAlign: 'center',
              altText: 'Producto',
              action: { name: 'web', values: { href: '', target: '_blank' } },
              hideDesktop: false,
              displayCondition: null,
              _meta: { htmlID: 'u_content_image_2', htmlClassNames: 'u_content_image' },
              selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
            },
          },
        ],
      },
      {
        contents: [
          {
            type: 'heading',
            values: {
              containerPadding: '20px 16px 4px',
              anchor: '',
              headingType: 'h2',
              fontSize: '22px',
              textAlign: 'left',
              lineHeight: '140%',
              linkStyle: { inherit: true },
              hideDesktop: false,
              displayCondition: null,
              _meta: { htmlID: 'u_content_heading_2', htmlClassNames: 'u_content_heading' },
              selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
              text: '<span style="color: #18181b;">Nombre del Producto</span>',
            },
          },
          {
            type: 'text',
            values: {
              containerPadding: '0px 16px',
              anchor: '',
              textAlign: 'left',
              lineHeight: '160%',
              linkStyle: { inherit: true },
              hideDesktop: false,
              displayCondition: null,
              _meta: { htmlID: 'u_content_text_2', htmlClassNames: 'u_content_text' },
              selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
              text: '<p style="font-size: 18px; font-weight: 700; color: #18181b;">$99.99</p><p style="color: #71717a;">Descripcion breve del producto destacado.</p>',
            },
          },
          {
            type: 'button',
            values: {
              containerPadding: '12px 16px 20px',
              anchor: '',
              href: { name: 'web', values: { href: '', target: '_blank' } },
              buttonColors: { color: '#ffffff', backgroundColor: '#18181b', hoverColor: '#ffffff', hoverBackgroundColor: '#333333' },
              size: { autoWidth: true, width: '100%' },
              textAlign: 'left',
              lineHeight: '120%',
              padding: '10px 24px',
              borderRadius: '6px',
              hideDesktop: false,
              displayCondition: null,
              _meta: { htmlID: 'u_content_button_2', htmlClassNames: 'u_content_button' },
              selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
              text: '<span style="font-size: 14px; line-height: 16.8px;">Ver Producto</span>',
              calculatedWidth: 127, calculatedHeight: 37,
            },
          },
        ],
      },
    ]),
  },
  {
    id: 100003,
    category: 'Steve Mail',
    tags: ['steve', 'descuento', 'cupon'],
    data: makeBlockDesign([1], [
      {
        contents: [
          {
            type: 'html',
            values: {
              containerPadding: '10px',
              anchor: '',
              html: `<div style="text-align:center;padding:24px;">
<div style="display:inline-block;border:2px dashed #d4d4d8;border-radius:12px;padding:24px 40px;background:#fafafa;">
<p style="margin:0 0 4px;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:1px;">Tu codigo de descuento</p>
<p style="margin:0 0 16px;font-size:28px;font-weight:700;color:#18181b;letter-spacing:3px;">DESCUENTO20</p>
<a href="#" style="display:inline-block;padding:10px 28px;background:#18181b;color:#fff;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">Usar Codigo</a>
</div>
</div>`,
              hideDesktop: false,
              displayCondition: null,
              _meta: { htmlID: 'u_content_html_1', htmlClassNames: 'u_content_html' },
              selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
            },
          },
        ],
      },
    ]),
  },
  {
    id: 100004,
    category: 'Steve Mail',
    tags: ['steve', 'footer', 'social'],
    data: makeBlockDesign([1], [
      {
        contents: [
          {
            type: 'divider',
            values: {
              containerPadding: '16px 30px',
              anchor: '',
              borderTopWidth: '1px',
              borderTopStyle: 'solid',
              borderTopColor: '#e4e4e7',
              width: '100%',
              textAlign: 'center',
              hideDesktop: false,
              displayCondition: null,
              _meta: { htmlID: 'u_content_divider_1', htmlClassNames: 'u_content_divider' },
              selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
            },
          },
          {
            type: 'social',
            values: {
              containerPadding: '8px 30px',
              anchor: '',
              icons: {
                iconType: 'circle',
                icons: [
                  { url: '#', name: 'Facebook', img: 'https://cdn.tools.unlayer.com/social/icons/circle/facebook.png' },
                  { url: '#', name: 'Instagram', img: 'https://cdn.tools.unlayer.com/social/icons/circle/instagram.png' },
                  { url: '#', name: 'Twitter', img: 'https://cdn.tools.unlayer.com/social/icons/circle/twitter.png' },
                ],
              },
              iconSize: '32px',
              iconSpacing: '8px',
              align: 'center',
              hideDesktop: false,
              displayCondition: null,
              _meta: { htmlID: 'u_content_social_1', htmlClassNames: 'u_content_social' },
              selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
            },
          },
          {
            type: 'text',
            values: {
              containerPadding: '8px 30px 16px',
              anchor: '',
              textAlign: 'center',
              lineHeight: '160%',
              linkStyle: { inherit: true },
              hideDesktop: false,
              displayCondition: null,
              _meta: { htmlID: 'u_content_text_3', htmlClassNames: 'u_content_text' },
              selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
              text: '<p style="font-size: 12px; color: #a1a1aa;">{{ brand_name }} — <a href="{{ unsubscribe_url }}" style="color: #a1a1aa;">Desuscribirse</a></p>',
            },
          },
        ],
      },
    ]),
  },
];

// ===== Spanish translations for Unlayer =====
const spanishTranslations = {
  'es-ES': {
    // Tabs
    'editor.content.title': 'Contenido',
    'editor.blocks.title': 'Bloques',
    'editor.body.title': 'General',
    'editor.images.title': 'Imagenes',
    'editor.uploads.title': 'Subidas',
    // Built-in tool names
    'tools.text.name': 'Texto',
    'tools.image.name': 'Imagen',
    'tools.button.name': 'Boton',
    'tools.divider.name': 'Divisor',
    'tools.heading.name': 'Titulo',
    'tools.html.name': 'HTML',
    'tools.menu.name': 'Menu',
    'tools.social.name': 'Redes Sociales',
    'tools.video.name': 'Video',
    'tools.timer.name': 'Temporizador',
    'tools.columns.name': 'Columnas',
    // Common properties
    'editor.action.label': 'Accion',
    'editor.action.web': 'Abrir sitio web',
    'editor.action.email': 'Enviar email',
    'editor.action.phone': 'Llamar telefono',
    'editor.action.url': 'URL',
    'editor.align.label': 'Alineacion',
    'editor.background_color.label': 'Color de fondo',
    'editor.border.label': 'Borde',
    'editor.border_radius.label': 'Radio del borde',
    'editor.color.label': 'Color',
    'editor.container_padding.label': 'Espaciado',
    'editor.font_family.label': 'Fuente',
    'editor.font_size.label': 'Tamano de fuente',
    'editor.font_weight.label': 'Grosor de fuente',
    'editor.line_height.label': 'Altura de linea',
    'editor.link_color.label': 'Color del enlace',
    'editor.padding.label': 'Espaciado interno',
    'editor.text_align.label': 'Alineacion de texto',
    'editor.text_color.label': 'Color de texto',
    'editor.width.label': 'Ancho',
    // Buttons
    'editor.button.text': 'Texto del boton',
    'editor.button.url': 'URL del boton',
    'editor.button.colors': 'Colores del boton',
    'editor.button.background_color': 'Color de fondo',
    'editor.button.text_color': 'Color de texto',
    'editor.button.hover_color': 'Color hover',
    'editor.button.border_radius': 'Radio del borde',
    'editor.button.padding': 'Espaciado interno',
    'editor.button.width': 'Ancho',
    // Image
    'editor.image.alt_text': 'Texto alternativo',
    'editor.image.url': 'URL de la imagen',
    'editor.image.upload': 'Subir imagen',
    // Row/Column
    'editor.row.label': 'Fila',
    'editor.column.label': 'Columna',
    'editor.columns.label': 'Columnas',
    'editor.row.background_color': 'Color de fondo',
    'editor.row.content_background_color': 'Color de contenido',
    'editor.row.background_image': 'Imagen de fondo',
    // Body
    'editor.body.background_color': 'Color de fondo',
    'editor.body.content_width': 'Ancho de contenido',
    'editor.body.font_family': 'Fuente',
    'editor.body.preheader': 'Texto de previsualizacion',
    // Actions
    'editor.done': 'Listo',
    'editor.cancel': 'Cancelar',
    'editor.save': 'Guardar',
    'editor.delete': 'Eliminar',
    'editor.duplicate': 'Duplicar',
    'editor.move_up': 'Mover arriba',
    'editor.move_down': 'Mover abajo',
    // Drag & drop
    'editor.drag_here': 'Arrastra contenido aqui',
    'editor.drop_here': 'Suelta aqui',
    // Search
    'editor.search': 'Buscar',
    'editor.search_placeholder': 'Buscar...',
    // Stock images
    'editor.stock_images.title': 'Imagenes de stock',
    'editor.stock_images.search': 'Buscar imagenes',
  },
};

export const getSteveMailEditorOptions = (opts?: SteveMailEditorOptions) => {
  return {
    displayMode: 'email' as const,
    locale: 'es-ES',
    translations: spanishTranslations,
    projectId: 1,
    appearance: {
      theme: 'modern_light',
      panels: {
        tools: {
          dock: 'left' as const,
          collapsible: true,
        },
      },
    },
    features: {
      stockImages: { enabled: true, safeSearch: true },
      userUploads: true,
    },
    tools: {
      html: { enabled: true },
      image: { enabled: true },
      text: { enabled: true },
      button: {
        enabled: true,
        properties: {
          borderRadius: { value: '8px' },
          padding: { value: '14px 32px' },
          buttonColors: {
            value: {
              color: '#ffffff',
              backgroundColor: '#18181b',
              hoverColor: '#ffffff',
              hoverBackgroundColor: '#333333',
            },
          },
        },
      },
      divider: { enabled: true },
      heading: { enabled: true },
      menu: { enabled: true },
      social: { enabled: true },
      video: { enabled: true },
      columns: { enabled: true },
      timer: { enabled: true },
    },
    tabs: {
      content: { enabled: true },
      blocks: { enabled: true },
      body: { enabled: true },
      images: { enabled: true },
    },
    customCSS: [],
    customJS: [],
    blocks: customBlocks,
    ...(opts?.mergeTagsOverride
      ? { mergeTags: opts.mergeTagsOverride }
      : steveMailMergeTagsConfig),
    ...(opts?.designTags ? { designTags: opts.designTags } : {}),
  };
};

// ---------------------------------------------------------------------------
// HTML generators for custom tools (same logic as the old customJS file,
// but now with real Shopify product data)
// ---------------------------------------------------------------------------

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatCLP(price: string): string {
  const num = parseFloat(price || '0');
  return num.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 });
}

function generateProductGridHTML(values: any, products: ShopifyProduct[]): string {
  const count = parseInt(values.productCount, 10) || 4;
  const cols = parseInt(values.columns, 10) || 2;
  const colWidth = Math.floor(100 / cols);
  const typeLabels: Record<string, string> = {
    best_sellers: 'Mas vendidos',
    new_arrivals: 'Nuevos',
    recently_viewed: 'Ultimos vistos',
    abandoned_cart: 'Carrito abandonado',
    complementary: 'Complementarios',
    all: 'Todos los productos',
  };

  const showPrice = values.showPrice !== false;
  const showButton = values.showButton !== false;
  const buttonText = values.buttonText || 'Comprar';
  const buttonColor = values.buttonColor || '#18181b';
  const productType = values.productType || 'best_sellers';
  const label = typeLabels[productType] || 'Productos';

  // Use real products if available, otherwise show placeholders
  const hasRealProducts = products.length > 0;
  const displayProducts = hasRealProducts ? products.slice(0, count) : Array.from({ length: count }, (_, i) => i);

  let cells = '';
  for (let i = 0; i < displayProducts.length; i++) {
    const p = hasRealProducts ? (displayProducts[i] as ShopifyProduct) : null;
    const imgSrc = p?.image_url || `https://placehold.co/280x280/f4f4f5/a1a1aa?text=Producto+${i + 1}`;
    const title = p?.title || `Producto ${i + 1}`;
    const price = p ? formatCLP(p.price) : '$XX.XXX';
    const url = p?.url || '#';

    cells += `<td style="width:${colWidth}%;padding:8px;vertical-align:top;text-align:center;">`;
    cells += `<a href="${escapeAttr(url)}" style="text-decoration:none;"><img src="${escapeAttr(imgSrc)}" alt="${escapeAttr(title)}" style="width:100%;max-width:280px;border-radius:8px;display:block;margin:0 auto;" /></a>`;
    cells += `<p style="margin:8px 0 4px;font-weight:600;font-size:14px;color:#18181b;"><a href="${escapeAttr(url)}" style="text-decoration:none;color:#18181b;">${escapeAttr(title)}</a></p>`;
    if (showPrice) {
      cells += `<p style="margin:0 0 8px;font-size:13px;color:#71717a;">${price}</p>`;
    }
    if (showButton) {
      cells += `<a href="${escapeAttr(url)}" style="display:inline-block;padding:8px 20px;background:${buttonColor};color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500;">${escapeAttr(buttonText)}</a>`;
    }
    cells += '</td>';
    if ((i + 1) % cols === 0 && i + 1 < displayProducts.length) {
      cells += '</tr><tr>';
    }
  }

  // Abandoned cart special case: show informative placeholder
  if (productType === 'abandoned_cart') {
    return `<div data-steve-products="true" data-product-type="abandoned_cart" data-columns="${cols}" style="padding:16px;">` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">` +
        `<tr><td style="padding:0 0 12px;text-align:center;"><p style="margin:0;font-size:11px;color:#a1a1aa;text-transform:uppercase;letter-spacing:1px;">Carrito abandonado</p></td></tr>` +
        `<tr><td style="padding:24px;text-align:center;background:#fafafa;border-radius:8px;border:1px dashed #d4d4d8;">` +
          `<p style="margin:0 0 4px;font-size:14px;color:#71717a;">Los productos del carrito de cada contacto</p>` +
          `<p style="margin:0;font-size:12px;color:#a1a1aa;">Se personalizan automaticamente al enviar</p>` +
        `</td></tr>` +
      `</table>` +
    `</div>`;
  }

  return `<div data-steve-products="true" data-product-type="${productType}" data-product-count="${count}" data-columns="${cols}" data-show-price="${showPrice}" data-show-button="${showButton}" data-button-text="${escapeAttr(buttonText)}" data-button-color="${buttonColor}">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">` +
      `<tr><td colspan="${cols}" style="padding:0 0 8px;text-align:center;">` +
        `<p style="margin:0;font-size:11px;color:#a1a1aa;text-transform:uppercase;letter-spacing:1px;">${label}</p>` +
      `</td></tr>` +
      `<tr>${cells}</tr>` +
    `</table>` +
  `</div>`;
}

function generateDiscountHTML(values: any): string {
  const source = values.discountSource || 'manual';
  const code = source === 'shopify_create' ? '{{ shopify_discount_code }}' : (values.discountCode || '{{ discount_code }}');
  const displayCode = source === 'shopify_create'
    ? ('STEVE-' + (values.discountType === 'free_shipping' ? 'ENVIO' : (values.discountValue || '20') + (values.discountType === 'percentage' ? '%OFF' : 'OFF')))
    : code;
  const bg = values.bgColor || '#fafafa';
  const textColor = values.textColor || '#18181b';
  const border = values.borderColor || '#d4d4d8';
  const subtitle = source === 'shopify_create'
    ? (values.discountType === 'free_shipping' ? 'Envio gratis' : (values.discountType === 'percentage' ? values.discountValue + '% de descuento' : '$' + values.discountValue + ' de descuento'))
    : 'Tu codigo de descuento';
  let cta = '';
  if (values.ctaText) {
    cta = `<a href="${escapeAttr(values.ctaUrl || '#')}" style="display:inline-block;padding:10px 28px;background:${values.ctaColor || '#18181b'};color:#fff;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">${escapeAttr(values.ctaText)}</a>`;
  }

  return `<div data-steve-discount="true" data-discount-code="${escapeAttr(code)}" data-discount-source="${source}" data-discount-type="${values.discountType || 'percentage'}" data-discount-value="${values.discountValue || '20'}" style="text-align:center;padding:24px;">` +
    `<div style="display:inline-block;border:2px dashed ${border};border-radius:12px;padding:24px 40px;background:${bg};">` +
      `<p style="margin:0 0 4px;font-size:12px;color:${textColor};text-transform:uppercase;letter-spacing:1px;">${subtitle}</p>` +
      `<p style="margin:0 0 16px;font-size:28px;font-weight:700;color:${textColor};letter-spacing:3px;">${displayCode}</p>` +
      cta +
    `</div>` +
  `</div>`;
}

function generateButtonHTML(values: any): string {
  const text = values.btnText || 'Comprar Ahora';
  const url = values.btnUrl || '#';
  const style = values.btnStyle || 'filled';
  const size = values.btnSize || 'medium';
  const color = values.btnColor || '#18181b';
  const textColor = values.btnTextColor || '#ffffff';
  const align = values.btnAlign || 'center';

  const sizeMap: Record<string, { padding: string; fontSize: string }> = {
    small: { padding: '8px 20px', fontSize: '13px' },
    medium: { padding: '14px 32px', fontSize: '15px' },
    large: { padding: '18px 48px', fontSize: '17px' },
    full: { padding: '16px 32px', fontSize: '16px' },
  };
  const s = sizeMap[size] || sizeMap.medium;

  let bgStyle = `background:${color};color:${textColor};border:2px solid ${color};`;
  let borderRadius = '8px';
  let extraStyle = '';

  if (style === 'outline') {
    bgStyle = `background:transparent;color:${color};border:2px solid ${color};`;
  } else if (style === 'pill') {
    borderRadius = '50px';
  } else if (style === 'shadow') {
    extraStyle = `box-shadow:0 4px 14px ${color}40;`;
  } else if (style === 'gradient') {
    bgStyle = `background:linear-gradient(135deg, ${color}, ${color}cc);color:${textColor};border:none;`;
  }

  const displayStyle = size === 'full' ? 'display:block;width:100%;box-sizing:border-box;' : 'display:inline-block;';

  return `<div style="text-align:${align};padding:16px 24px;">` +
    `<a href="${escapeAttr(url)}" style="${displayStyle}padding:${s.padding};font-size:${s.fontSize};font-weight:600;${bgStyle}border-radius:${borderRadius};text-decoration:none;text-align:center;letter-spacing:0.5px;${extraStyle}">${escapeAttr(text)}</a>` +
  `</div>`;
}

function generateCountdownHTML(values: any): string {
  const endDate = values.endDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
  const labelText = values.labelText || 'La oferta termina en';
  const expiredText = values.expiredText || 'Esta oferta ha expirado';
  const bgColor = values.bgColor || '#18181b';
  const textColor = values.textColor || '#ffffff';

  const uid = 'cd_' + Math.random().toString(36).substr(2, 9);
  const digitBoxStyle = `display:inline-block;min-width:56px;padding:10px 8px;margin:0 4px;background:rgba(255,255,255,0.08);border-radius:8px;text-align:center;`;
  const digitStyle = `display:block;font-size:28px;font-weight:700;line-height:1.2;color:${textColor};`;
  const unitStyle = `display:block;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:${textColor};opacity:0.6;margin-top:4px;`;

  return `<div data-steve-countdown="true" data-end-date="${endDate}" style="text-align:center;padding:28px 16px;background:${bgColor};border-radius:12px;">` +
    `<p style="margin:0 0 16px;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:${textColor};opacity:0.75;">${escapeAttr(labelText)}</p>` +
    `<div id="${uid}" style="display:inline-block;">` +
      `<span style="${digitBoxStyle}"><span class="cd-val" data-unit="days" style="${digitStyle}">00</span><span style="${unitStyle}">Dias</span></span>` +
      `<span style="${digitBoxStyle}"><span class="cd-val" data-unit="hours" style="${digitStyle}">00</span><span style="${unitStyle}">Horas</span></span>` +
      `<span style="${digitBoxStyle}"><span class="cd-val" data-unit="minutes" style="${digitStyle}">00</span><span style="${unitStyle}">Min</span></span>` +
      `<span style="${digitBoxStyle}"><span class="cd-val" data-unit="seconds" style="${digitStyle}">00</span><span style="${unitStyle}">Seg</span></span>` +
    `</div>` +
    `<p id="${uid}_expired" style="display:none;margin:8px 0 0;font-size:16px;font-weight:600;color:${textColor};">${escapeAttr(expiredText)}</p>` +
    `<script>(function(){var end=new Date("${endDate}").getTime();var wrap=document.getElementById("${uid}");var expEl=document.getElementById("${uid}_expired");if(!wrap)return;function pad(n){return n<10?"0"+n:String(n);}function tick(){var diff=end-Date.now();if(diff<=0){wrap.style.display="none";expEl.style.display="block";return;}var d=Math.floor(diff/86400000);var h=Math.floor((diff%86400000)/3600000);var m=Math.floor((diff%3600000)/60000);var s=Math.floor((diff%60000)/1000);var vals=wrap.querySelectorAll(".cd-val");for(var i=0;i<vals.length;i++){var u=vals[i].getAttribute("data-unit");if(u==="days")vals[i].textContent=pad(d);if(u==="hours")vals[i].textContent=pad(h);if(u==="minutes")vals[i].textContent=pad(m);if(u==="seconds")vals[i].textContent=pad(s);}}tick();setInterval(tick,1000);})();<\/script>` +
  `</div>`;
}

// ---------------------------------------------------------------------------
// Register custom tools via editor.registerTool() — called from React side
// ---------------------------------------------------------------------------

/**
 * Register Steve Mail custom tools on the Unlayer editor instance.
 * Must be called AFTER editor.onReady fires.
 *
 * @param editor - The Unlayer editor instance (from emailEditorRef.current.editor)
 * @param products - Shopify product catalog (fetched by the parent component)
 */
export function registerSteveMailTools(editor: any, products: ShopifyProduct[] = []) {
  if (!editor) {
    console.warn('[Steve Mail] Cannot register tools — editor is null');
    return;
  }

  try {
    // ===== Productos =====
    editor.registerTool({
      name: 'steve_products',
      label: 'Productos',
      icon: 'fa-shopping-bag',
      supportedDisplayModes: ['email'],
      values: {},
      options: {
        productType: {
          title: 'Tipo de Productos',
          position: 1,
          options: {
            productType: {
              label: 'Tipo',
              defaultValue: 'best_sellers',
              widget: 'dropdown',
              data: {
                options: [
                  { label: 'Mas vendidos', value: 'best_sellers' },
                  { label: 'Nuevos', value: 'new_arrivals' },
                  { label: 'Ultimos vistos', value: 'recently_viewed' },
                  { label: 'Carrito abandonado', value: 'abandoned_cart' },
                  { label: 'Complementarios', value: 'complementary' },
                  { label: 'Todos los productos', value: 'all' },
                ],
              },
            },
            productCount: {
              label: 'Cantidad',
              defaultValue: '4',
              widget: 'dropdown',
              data: {
                options: [
                  { label: '2 productos', value: '2' },
                  { label: '3 productos', value: '3' },
                  { label: '4 productos', value: '4' },
                  { label: '6 productos', value: '6' },
                ],
              },
            },
            columns: {
              label: 'Columnas',
              defaultValue: '2',
              widget: 'dropdown',
              data: {
                options: [
                  { label: '1 columna', value: '1' },
                  { label: '2 columnas', value: '2' },
                  { label: '3 columnas', value: '3' },
                ],
              },
            },
          },
        },
        display: {
          title: 'Apariencia',
          position: 2,
          options: {
            showPrice: { label: 'Mostrar precio', defaultValue: true, widget: 'toggle' },
            showButton: { label: 'Mostrar boton', defaultValue: true, widget: 'toggle' },
            buttonText: { label: 'Texto del boton', defaultValue: 'Comprar', widget: 'text' },
            buttonColor: { label: 'Color del boton', defaultValue: '#18181b', widget: 'color_picker' },
          },
        },
      },
      transformer: (values: any, _source: any) => values,
      renderer: {
        Viewer: editor.createViewer({
          render: (values: any) => generateProductGridHTML(values, products),
        }),
        exporters: {
          email: (values: any) => generateProductGridHTML(values, products),
        },
      },
    });

    // ===== Codigo de Descuento =====
    editor.registerTool({
      name: 'steve_discount',
      label: 'Codigo Descuento',
      icon: 'fa-tag',
      supportedDisplayModes: ['email'],
      values: {},
      options: {
        discount: {
          title: 'Descuento',
          position: 1,
          options: {
            discountSource: {
              label: 'Fuente del codigo',
              defaultValue: 'manual',
              widget: 'dropdown',
              data: {
                options: [
                  { label: 'Escribir codigo manual', value: 'manual' },
                  { label: 'Crear en Shopify (automatico)', value: 'shopify_create' },
                ],
              },
            },
            discountCode: { label: 'Codigo (manual)', defaultValue: 'DESCUENTO20', widget: 'text' },
            discountType: {
              label: 'Tipo de descuento (Shopify)',
              defaultValue: 'percentage',
              widget: 'dropdown',
              data: {
                options: [
                  { label: 'Porcentaje (%)', value: 'percentage' },
                  { label: 'Monto fijo ($)', value: 'fixed_amount' },
                  { label: 'Envio gratis', value: 'free_shipping' },
                ],
              },
            },
            discountValue: { label: 'Valor del descuento', defaultValue: '20', widget: 'text' },
            bgColor: { label: 'Color de fondo', defaultValue: '#fafafa', widget: 'color_picker' },
            textColor: { label: 'Color de texto', defaultValue: '#18181b', widget: 'color_picker' },
            borderColor: { label: 'Color de borde', defaultValue: '#d4d4d8', widget: 'color_picker' },
          },
        },
        cta: {
          title: 'Boton',
          position: 2,
          options: {
            ctaText: { label: 'Texto del boton', defaultValue: 'Usar Codigo', widget: 'text' },
            ctaUrl: { label: 'URL del boton', defaultValue: '', widget: 'text' },
            ctaColor: { label: 'Color del boton', defaultValue: '#18181b', widget: 'color_picker' },
          },
        },
      },
      transformer: (values: any, _source: any) => values,
      renderer: {
        Viewer: editor.createViewer({
          render: (values: any) => generateDiscountHTML(values),
        }),
        exporters: {
          email: (values: any) => generateDiscountHTML(values),
        },
      },
    });

    // ===== Cuenta Regresiva =====
    editor.registerTool({
      name: 'steve_countdown',
      label: 'Cuenta Regresiva',
      icon: 'fa-clock-o',
      supportedDisplayModes: ['email'],
      values: {},
      options: {
        countdown: {
          title: 'Cuenta Regresiva',
          position: 1,
          options: {
            endDate: {
              label: 'Fecha de termino',
              defaultValue: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
              widget: 'text',
            },
            labelText: { label: 'Texto superior', defaultValue: 'La oferta termina en', widget: 'text' },
            expiredText: { label: 'Texto expirado', defaultValue: 'Esta oferta ha expirado', widget: 'text' },
          },
        },
        style: {
          title: 'Estilo',
          position: 2,
          options: {
            bgColor: { label: 'Color de fondo', defaultValue: '#18181b', widget: 'color_picker' },
            textColor: { label: 'Color de texto', defaultValue: '#ffffff', widget: 'color_picker' },
          },
        },
      },
      transformer: (values: any, _source: any) => values,
      renderer: {
        Viewer: editor.createViewer({
          render: (values: any) => generateCountdownHTML(values),
        }),
        exporters: {
          email: (values: any) => generateCountdownHTML(values),
        },
      },
    });

    // ===== Boton con Estilos =====
    editor.registerTool({
      name: 'steve_button',
      label: 'Boton Diseno',
      icon: 'fa-hand-pointer-o',
      supportedDisplayModes: ['email'],
      values: {},
      options: {
        content: {
          title: 'Contenido',
          position: 1,
          options: {
            btnText: { label: 'Texto', defaultValue: 'Comprar Ahora', widget: 'text' },
            btnUrl: { label: 'URL de destino', defaultValue: '', widget: 'text' },
          },
        },
        design: {
          title: 'Diseno',
          position: 2,
          options: {
            btnStyle: {
              label: 'Estilo',
              defaultValue: 'filled',
              widget: 'dropdown',
              data: {
                options: [
                  { label: 'Relleno', value: 'filled' },
                  { label: 'Solo borde', value: 'outline' },
                  { label: 'Pildora', value: 'pill' },
                  { label: 'Sombra', value: 'shadow' },
                  { label: 'Gradiente', value: 'gradient' },
                ],
              },
            },
            btnSize: {
              label: 'Tamano',
              defaultValue: 'medium',
              widget: 'dropdown',
              data: {
                options: [
                  { label: 'Pequeno', value: 'small' },
                  { label: 'Mediano', value: 'medium' },
                  { label: 'Grande', value: 'large' },
                  { label: 'Ancho completo', value: 'full' },
                ],
              },
            },
            btnColor: { label: 'Color principal', defaultValue: '#18181b', widget: 'color_picker' },
            btnTextColor: { label: 'Color del texto', defaultValue: '#ffffff', widget: 'color_picker' },
            btnAlign: {
              label: 'Alineacion',
              defaultValue: 'center',
              widget: 'dropdown',
              data: {
                options: [
                  { label: 'Izquierda', value: 'left' },
                  { label: 'Centro', value: 'center' },
                  { label: 'Derecha', value: 'right' },
                ],
              },
            },
          },
        },
      },
      transformer: (values: any, _source: any) => values,
      renderer: {
        Viewer: editor.createViewer({
          render: (values: any) => generateButtonHTML(values),
        }),
        exporters: {
          email: (values: any) => generateButtonHTML(values),
        },
      },
    });

    console.log('[Steve Mail] 4 custom tools registered successfully');
  } catch (err) {
    console.error('[Steve Mail] Failed to register custom tools:', err);
  }
}
