/**
 * Shared Unlayer editor configuration for Steve Mail.
 * Used by CampaignBuilder, FlowBuilder, and UnlayerEmailEditor.
 *
 * Custom tools (steve_products, steve_discount) are registered via customJS
 * since Unlayer's registerTool API is only available inside the editor iframe.
 * See: public/unlayer-product-tool.js
 */
import { steveMailMergeTagsConfig } from './steveMailMergeTags';

export interface SteveMailEditorOptions {
  designTags?: Record<string, string>;
  mergeTagsOverride?: Record<string, any>;
}

// Pre-built rows that appear in the Blocks tab
const customBlocks = [
  {
    slug: 'steve_hero_banner',
    category: 'Steve Mail',
    name: 'Hero Banner',
    tags: ['steve', 'hero'],
    cells: [1],
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
  {
    slug: 'steve_producto_destacado',
    category: 'Steve Mail',
    name: 'Producto Destacado',
    tags: ['steve', 'producto'],
    cells: [1, 1],
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
  {
    slug: 'steve_discount_code',
    category: 'Steve Mail',
    name: 'Código de Descuento',
    tags: ['steve', 'descuento', 'cupón'],
    cells: [1],
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
  {
    slug: 'steve_footer_social',
    category: 'Steve Mail',
    name: 'Footer Social',
    tags: ['steve', 'footer', 'social'],
    cells: [1],
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
];

export const getSteveMailEditorOptions = (opts?: SteveMailEditorOptions) => {
  // Construct customJS URL — loads custom tools inside the Unlayer iframe
  const customJsUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/unlayer-product-tool.js`
    : '/unlayer-product-tool.js';

  return {
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
      `.blockbuilder-branding { display: none !important; }`,
    ],
    customJS: [customJsUrl],
    blocks: customBlocks,
    ...(opts?.mergeTagsOverride
      ? { mergeTags: opts.mergeTagsOverride }
      : steveMailMergeTagsConfig),
    ...(opts?.designTags ? { designTags: opts.designTags } : {}),
  };
};

/**
 * Post-init editor setup. Called in onReady.
 * Custom tools are registered via customJS (not here).
 */
export function registerSteveMailTools(_editor: any) {
  // Custom tools (steve_products, steve_discount) are registered via customJS
  // since registerTool is only available in the Unlayer iframe context.
  // Pre-built blocks are passed via the `blocks` editor option.
  // This function is kept as a hook for future post-init logic.
}
