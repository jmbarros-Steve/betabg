/**
 * Shared Unlayer editor configuration for Steve Mail.
 * Used by CampaignBuilder, FlowBuilder, and UnlayerEmailEditor.
 */
import { steveMailMergeTagsConfig } from './steveMailMergeTags';

export interface SteveMailEditorOptions {
  designTags?: Record<string, string>;
  mergeTagsOverride?: Record<string, any>;
}

export const getSteveMailEditorOptions = (opts?: SteveMailEditorOptions) => ({
  displayMode: 'email' as const,
  locale: 'es-ES',
  appearance: {
    theme: 'modern_dark',
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
    button: { enabled: true },
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
  customCSS: [
    `
    .blockbuilder-branding { display: none !important; }
    `,
  ],
  ...(opts?.mergeTagsOverride
    ? { mergeTags: opts.mergeTagsOverride }
    : steveMailMergeTagsConfig),
  ...(opts?.designTags ? { designTags: opts.designTags } : {}),
});

// ---------------------------------------------------------------------------
// Custom tool registration — called in each editor's onReady callback
// ---------------------------------------------------------------------------

function generateProductGridHTML(values: {
  productType: string;
  productCount: string;
  columns: string;
  showPrice: boolean;
  showButton: boolean;
  buttonText: string;
  buttonColor: string;
}): string {
  const count = parseInt(values.productCount, 10) || 4;
  const cols = parseInt(values.columns, 10) || 2;
  const colWidth = Math.floor(100 / cols);
  const placeholderImg =
    'https://placehold.co/280x280/f4f4f5/a1a1aa?text=Producto';

  const typeLabels: Record<string, string> = {
    best_sellers: 'Más vendidos',
    new_arrivals: 'Nuevos',
    complementary: 'Complementarios',
  };

  let cells = '';
  for (let i = 0; i < count; i++) {
    cells += `
      <td style="width:${colWidth}%;padding:8px;vertical-align:top;text-align:center;">
        <img src="${placeholderImg}" alt="Producto ${i + 1}" style="width:100%;max-width:280px;border-radius:8px;" />
        <p style="margin:8px 0 4px;font-weight:600;font-size:14px;color:#18181b;">Producto ${i + 1}</p>
        ${values.showPrice ? '<p style="margin:0 0 8px;font-size:13px;color:#71717a;">$XX.XX</p>' : ''}
        ${
          values.showButton
            ? `<a href="#" style="display:inline-block;padding:8px 20px;background:${values.buttonColor};color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500;">${values.buttonText}</a>`
            : ''
        }
      </td>`;
    if ((i + 1) % cols === 0 && i + 1 < count) {
      cells += '</tr><tr>';
    }
  }

  return `
    <div data-steve-products data-product-type="${values.productType}" data-product-count="${count}" data-columns="${cols}" data-show-price="${values.showPrice}" data-show-button="${values.showButton}" data-button-text="${values.buttonText}" data-button-color="${values.buttonColor}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td colspan="${cols}" style="padding:0 0 8px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#a1a1aa;text-transform:uppercase;letter-spacing:1px;">${typeLabels[values.productType] || 'Productos'}</p>
          </td>
        </tr>
        <tr>${cells}</tr>
      </table>
    </div>`;
}

function generateDiscountHTML(values: {
  discountCode: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  ctaText: string;
  ctaUrl: string;
  ctaColor: string;
}): string {
  return `
    <div data-steve-discount data-discount-code="${values.discountCode}" style="text-align:center;padding:24px;">
      <div style="display:inline-block;border:2px dashed ${values.borderColor};border-radius:12px;padding:24px 40px;background:${values.bgColor};">
        <p style="margin:0 0 4px;font-size:12px;color:${values.textColor};text-transform:uppercase;letter-spacing:1px;">Tu código de descuento</p>
        <p style="margin:0 0 16px;font-size:28px;font-weight:700;color:${values.textColor};letter-spacing:3px;">${values.discountCode || '{{ discount_code }}'}</p>
        ${
          values.ctaText
            ? `<a href="${values.ctaUrl || '#'}" style="display:inline-block;padding:10px 28px;background:${values.ctaColor};color:#fff;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">${values.ctaText}</a>`
            : ''
        }
      </div>
    </div>`;
}

// Pre-built rows that appear in the Blocks tab
const customBlocks = [
  {
    name: 'Hero Banner',
    tags: ['steve', 'hero'],
    category: 'Steve Mail',
    design: {
      columns: [
        {
          contents: [
            {
              type: 'image',
              values: {
                src: { url: 'https://placehold.co/600x300/18181b/fafafa?text=Hero+Banner', width: 600, height: 300 },
                action: { name: 'web', values: { href: '', target: '_blank' } },
                containerPadding: '0px',
              },
            },
            {
              type: 'heading',
              values: {
                text: 'Tu Título Aquí',
                headingType: 'h1',
                fontSize: '28px',
                textAlign: 'center',
                color: '#18181b',
                containerPadding: '20px 30px 10px',
              },
            },
            {
              type: 'text',
              values: {
                text: '<p style="text-align:center;color:#71717a;">Subtítulo descriptivo de tu campaña o promoción.</p>',
                containerPadding: '0px 30px',
              },
            },
            {
              type: 'button',
              values: {
                text: 'Comprar Ahora',
                href: { name: 'web', values: { href: '', target: '_blank' } },
                buttonColors: { color: '#ffffff', backgroundColor: '#18181b' },
                size: { autoWidth: false, width: '60%' },
                textAlign: 'center',
                lineHeight: '140%',
                borderRadius: '6px',
                padding: '12px 24px',
                containerPadding: '16px 30px 24px',
              },
            },
          ],
        },
      ],
    },
  },
  {
    name: 'Producto Destacado',
    tags: ['steve', 'producto'],
    category: 'Steve Mail',
    design: {
      columns: [
        {
          contents: [
            {
              type: 'image',
              values: {
                src: { url: 'https://placehold.co/400x400/f4f4f5/a1a1aa?text=Producto', width: 400, height: 400 },
                containerPadding: '16px',
              },
            },
          ],
        },
        {
          contents: [
            {
              type: 'heading',
              values: {
                text: 'Nombre del Producto',
                headingType: 'h2',
                fontSize: '22px',
                color: '#18181b',
                containerPadding: '20px 16px 4px',
              },
            },
            {
              type: 'text',
              values: {
                text: '<p style="font-size:18px;font-weight:700;color:#18181b;">$99.99</p><p style="color:#71717a;">Descripción breve del producto destacado.</p>',
                containerPadding: '0px 16px',
              },
            },
            {
              type: 'button',
              values: {
                text: 'Ver Producto',
                buttonColors: { color: '#ffffff', backgroundColor: '#18181b' },
                borderRadius: '6px',
                padding: '10px 24px',
                containerPadding: '12px 16px 20px',
              },
            },
          ],
        },
      ],
    },
  },
  {
    name: 'Código de Descuento',
    tags: ['steve', 'descuento', 'cupón'],
    category: 'Steve Mail',
    design: {
      columns: [
        {
          contents: [
            {
              type: 'text',
              values: {
                text: `<div style="text-align:center;padding:24px;">
                  <div style="display:inline-block;border:2px dashed #d4d4d8;border-radius:12px;padding:24px 40px;background:#fafafa;">
                    <p style="margin:0 0 4px;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:1px;">Tu código de descuento</p>
                    <p style="margin:0 0 16px;font-size:28px;font-weight:700;color:#18181b;letter-spacing:3px;">DESCUENTO20</p>
                    <a href="#" style="display:inline-block;padding:10px 28px;background:#18181b;color:#fff;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">Usar Código</a>
                  </div>
                </div>`,
                containerPadding: '0px',
              },
            },
          ],
        },
      ],
    },
  },
  {
    name: 'Footer Social',
    tags: ['steve', 'footer', 'social'],
    category: 'Steve Mail',
    design: {
      columns: [
        {
          contents: [
            {
              type: 'divider',
              values: {
                containerPadding: '16px 30px',
              },
            },
            {
              type: 'social',
              values: {
                icons: {
                  iconType: 'rounded',
                  icons: [
                    { name: 'Facebook', url: '#' },
                    { name: 'Instagram', url: '#' },
                    { name: 'Twitter', url: '#' },
                  ],
                },
                align: 'center',
                containerPadding: '8px 30px',
              },
            },
            {
              type: 'text',
              values: {
                text: '<p style="text-align:center;font-size:12px;color:#a1a1aa;">{{ brand_name }} — <a href="{{ unsubscribe_url }}" style="color:#a1a1aa;">Desuscribirse</a></p>',
                containerPadding: '8px 30px 16px',
              },
            },
          ],
        },
      ],
    },
  },
];

/**
 * Register Steve Mail custom tools (Products grid, Discount block).
 * Call this in each editor's onReady callback.
 */
export function registerSteveMailTools(editor: any) {
  if (!editor) return;

  // --- Product Grid Tool ---
  editor.registerTool({
    name: 'steve_products',
    label: 'Productos',
    icon: 'fa-shopping-bag',
    supportedDisplayModes: ['email'],
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
                { label: 'Más vendidos', value: 'best_sellers' },
                { label: 'Nuevos', value: 'new_arrivals' },
                { label: 'Complementarios', value: 'complementary' },
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
        title: 'Mostrar',
        position: 2,
        options: {
          showPrice: {
            label: 'Mostrar precio',
            defaultValue: true,
            widget: 'toggle',
          },
          showButton: {
            label: 'Mostrar botón',
            defaultValue: true,
            widget: 'toggle',
          },
          buttonText: {
            label: 'Texto del botón',
            defaultValue: 'Comprar',
            widget: 'text',
          },
          buttonColor: {
            label: 'Color del botón',
            defaultValue: '#18181b',
            widget: 'color_picker',
          },
        },
      },
    },
    transformer: (values: any, _source: any) => values,
    renderer: {
      Viewer: class {
        render(values: any) {
          return generateProductGridHTML({
            productType: values.productType || 'best_sellers',
            productCount: values.productCount || '4',
            columns: values.columns || '2',
            showPrice: values.showPrice !== false,
            showButton: values.showButton !== false,
            buttonText: values.buttonText || 'Comprar',
            buttonColor: values.buttonColor || '#18181b',
          });
        }
      },
      exporters: {
        email(values: any) {
          return generateProductGridHTML({
            productType: values.productType || 'best_sellers',
            productCount: values.productCount || '4',
            columns: values.columns || '2',
            showPrice: values.showPrice !== false,
            showButton: values.showButton !== false,
            buttonText: values.buttonText || 'Comprar',
            buttonColor: values.buttonColor || '#18181b',
          });
        },
      },
    },
  });

  // --- Discount Code Tool ---
  editor.registerTool({
    name: 'steve_discount',
    label: 'Código de Descuento',
    icon: 'fa-tag',
    supportedDisplayModes: ['email'],
    options: {
      discount: {
        title: 'Descuento',
        position: 1,
        options: {
          discountCode: {
            label: 'Código',
            defaultValue: 'DESCUENTO20',
            widget: 'text',
          },
          bgColor: {
            label: 'Color de fondo',
            defaultValue: '#fafafa',
            widget: 'color_picker',
          },
          textColor: {
            label: 'Color de texto',
            defaultValue: '#18181b',
            widget: 'color_picker',
          },
          borderColor: {
            label: 'Color de borde',
            defaultValue: '#d4d4d8',
            widget: 'color_picker',
          },
        },
      },
      cta: {
        title: 'Botón',
        position: 2,
        options: {
          ctaText: {
            label: 'Texto del botón',
            defaultValue: 'Usar Código',
            widget: 'text',
          },
          ctaUrl: {
            label: 'URL del botón',
            defaultValue: '',
            widget: 'text',
          },
          ctaColor: {
            label: 'Color del botón',
            defaultValue: '#18181b',
            widget: 'color_picker',
          },
        },
      },
    },
    transformer: (values: any, _source: any) => values,
    renderer: {
      Viewer: class {
        render(values: any) {
          return generateDiscountHTML({
            discountCode: values.discountCode || 'DESCUENTO20',
            bgColor: values.bgColor || '#fafafa',
            textColor: values.textColor || '#18181b',
            borderColor: values.borderColor || '#d4d4d8',
            ctaText: values.ctaText || 'Usar Código',
            ctaUrl: values.ctaUrl || '',
            ctaColor: values.ctaColor || '#18181b',
          });
        }
      },
      exporters: {
        email(values: any) {
          return generateDiscountHTML({
            discountCode: values.discountCode || 'DESCUENTO20',
            bgColor: values.bgColor || '#fafafa',
            textColor: values.textColor || '#18181b',
            borderColor: values.borderColor || '#d4d4d8',
            ctaText: values.ctaText || 'Usar Código',
            ctaUrl: values.ctaUrl || '',
            ctaColor: values.ctaColor || '#18181b',
          });
        },
      },
    },
  });

  // --- Load custom blocks (pre-built rows) ---
  customBlocks.forEach((block) => {
    editor.registerBlock?.(block);
  });
}
