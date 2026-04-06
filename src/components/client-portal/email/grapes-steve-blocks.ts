import type { BlockProperties, Editor } from 'grapesjs';

const icons = {
  product: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
  productRec: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="7" height="10" rx="1"/><rect x="9" y="3" width="7" height="10" rx="1"/><rect x="17" y="3" width="7" height="10" rx="1"/><line x1="1" y1="16" x2="24" y2="16"/></svg>',
  cart: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>',
  coupon: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="2" cy="12" r="2"/><circle cx="22" cy="12" r="2"/><line x1="10" y1="8" x2="10" y2="16" stroke-dasharray="2 2"/></svg>',
  logo: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="4"/></svg>',
  review: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  social: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
  variable: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h6l-2 10h6"/><path d="M15 7h5"/><path d="M15 17h5"/></svg>',
};

function getSteveBlockDefs(brandColor: string): BlockProperties[] {
  const c = brandColor || '#6C47FF';
  return [
    {
      id: 'steve-product',
      label: 'Producto',
      category: 'Steve',
      media: icons.product,
      activate: true,
      select: true,
      content: `<mj-image src="https://placehold.co/300x300/f5f5f5/666?text=Producto" alt="Producto" width="300px" />
<mj-text font-size="18px" font-weight="bold" align="center" padding="10px 0 5px">Nombre del Producto</mj-text>
<mj-text font-size="16px" color="#888888" align="center" padding="0">$29.990</mj-text>
<mj-button background-color="${c}" color="#ffffff" href="#" align="center" border-radius="6px">Comprar ahora</mj-button>`,
    },
    {
      id: 'steve-product-rec',
      label: 'Recomendados',
      category: 'Steve',
      media: icons.productRec,
      activate: true,
      select: true,
      content: `<mj-text font-size="22px" font-weight="bold" align="center" padding-bottom="10px">Productos Recomendados</mj-text>
<mj-raw>
<div data-steve-products="true" data-dynamic-feed="true" data-product-type="best_sellers" data-product-count="4" data-columns="2" data-button-text="Ver producto" data-button-color="${c}" style="border:2px dashed ${c};border-radius:8px;padding:30px;text-align:center;color:${c};font-size:14px;">
Productos dinamicos - se cargan al enviar (best_sellers x4)
</div>
</mj-raw>`,
    },
    {
      id: 'steve-cart-products',
      label: 'Carrito Abandonado',
      category: 'Steve',
      media: icons.cart,
      activate: true,
      select: true,
      content: `<mj-text font-size="22px" font-weight="bold" align="center" padding-bottom="10px">Olvidaste esto en tu carrito</mj-text>
<mj-raw>
<div data-steve-products="true" data-dynamic-feed="true" data-product-type="abandoned_cart" data-product-count="4" data-columns="2" data-show-price="true" data-button-text="Completar compra" data-button-color="${c}" style="border:2px dashed ${c};border-radius:8px;padding:30px;text-align:center;color:${c};font-size:14px;">
Productos del carrito - se reemplazan automaticamente con los productos reales al enviar
</div>
</mj-raw>`,
    },
    {
      id: 'steve-coupon',
      label: 'Cupón Shopify',
      category: 'Steve',
      media: icons.coupon,
      activate: true,
      select: true,
      content: `<mj-raw>
<div data-steve-discount="true" data-discount-mode="shopify_create" data-discount-type="percentage" data-discount-value="10" data-expiration-days="7" style="border:2px dashed ${c};border-radius:8px;padding:24px;text-align:center;margin:16px 0;">
  <p style="margin:0 0 6px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:2px;font-family:Arial,sans-serif;">Código exclusivo para ti</p>
  <p style="margin:0;font-size:30px;font-weight:900;color:${c};letter-spacing:4px;font-family:monospace;">[[DISCOUNT_CODE]]</p>
  <p style="margin:8px 0 0;font-size:13px;color:#888;font-family:Arial,sans-serif;">10% de descuento · Válido 7 días</p>
</div>
</mj-raw>
<mj-button background-color="${c}" color="#ffffff" href="{{ cart.url }}" align="center" border-radius="6px">Usar cupón ahora</mj-button>`,
    },
    {
      id: 'steve-logo',
      label: 'Logo',
      category: 'Steve',
      media: icons.logo,
      activate: true,
      select: true,
      content: `<mj-image src="https://placehold.co/200x60/ffffff/333?text=LOGO" alt="Logo" width="200px" align="center" href="#" />`,
    },
    {
      id: 'steve-review',
      label: 'Reseña',
      category: 'Steve',
      media: icons.review,
      activate: true,
      select: true,
      content: `<mj-text font-size="20px" align="center" padding-bottom="5px">&#11088;&#11088;&#11088;&#11088;&#11088;</mj-text>
<mj-text font-size="15px" font-style="italic" align="center" color="#555555" padding="5px 20px">"Excelente producto, superó mis expectativas."</mj-text>
<mj-text font-size="13px" color="#999999" align="center" padding-top="10px">— María González</mj-text>`,
    },
    {
      id: 'steve-social',
      label: 'Redes Sociales',
      category: 'Steve',
      media: icons.social,
      activate: true,
      select: true,
      content: `<mj-social font-size="12px" icon-size="24px" mode="horizontal" align="center">
<mj-social-element name="instagram" href="https://instagram.com/">Instagram</mj-social-element>
<mj-social-element name="facebook" href="https://facebook.com/">Facebook</mj-social-element>
<mj-social-element name="web" href="https://tutienda.com">Web</mj-social-element>
</mj-social>`,
    },
    {
      id: 'merge-first-name',
      label: 'Nombre',
      category: 'Variables',
      media: icons.variable,
      activate: true,
      select: true,
      content: '<mj-text>{{ first_name }}</mj-text>',
    },
    {
      id: 'merge-email',
      label: 'Email',
      category: 'Variables',
      media: icons.variable,
      activate: true,
      select: true,
      content: '<mj-text>{{ email }}</mj-text>',
    },
    {
      id: 'merge-brand-name',
      label: 'Marca',
      category: 'Variables',
      media: icons.variable,
      activate: true,
      select: true,
      content: '<mj-text>{{ brand_name }}</mj-text>',
    },
    {
      id: 'merge-unsubscribe',
      label: 'Desuscribir',
      category: 'Variables',
      media: icons.variable,
      activate: true,
      select: true,
      content: '<mj-text><a href="{{ unsubscribe_url }}">Desuscribirme</a></mj-text>',
    },
    {
      id: 'merge-shop-url',
      label: 'Tienda',
      category: 'Variables',
      media: icons.variable,
      activate: true,
      select: true,
      content: '<mj-text><a href="{{ shop_url }}">Visitar tienda</a></mj-text>',
    },
    {
      id: 'merge-brand-color',
      label: 'Color Marca',
      category: 'Variables',
      media: icons.variable,
      activate: true,
      select: true,
      content: `<mj-text color="${c}">Texto con color de marca</mj-text>`,
    },
  ];
}

// Static export for blocks.default (fallback color)
export const steveBlocks = getSteveBlockDefs('#6C47FF');

/**
 * Register Steve blocks with brand color after editor is ready.
 */
export function registerSteveBlocks(editor: Editor, brandColor?: string) {
  const bm = editor.Blocks;
  const blocks = getSteveBlockDefs(brandColor || '#6C47FF');
  for (const block of blocks) {
    if (!block.id) continue;
    // Remove existing (default color) and re-add with brand color
    if (bm.get(block.id)) bm.remove(block.id);
    bm.add(block.id, block);
  }
}
