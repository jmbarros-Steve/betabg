import type { Editor } from 'grapesjs';

const STEVE_CATEGORY = 'Steve';
const VARIABLES_CATEGORY = 'Variables';

// SVG icons for each block
const icons = {
  product: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
  productRec: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="7" height="10" rx="1"/><rect x="9" y="3" width="7" height="10" rx="1"/><rect x="17" y="3" width="7" height="10" rx="1"/><line x1="1" y1="16" x2="24" y2="16"/></svg>',
  coupon: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="2" cy="12" r="2"/><circle cx="22" cy="12" r="2"/><line x1="10" y1="8" x2="10" y2="16" stroke-dasharray="2 2"/></svg>',
  logo: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="4"/></svg>',
  review: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  social: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
  variable: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h6l-2 10h6"/><path d="M15 7h5"/><path d="M15 17h5"/></svg>',
};

export function steveBlocksPlugin(editor: Editor) {
  const bm = editor.Blocks;

  // ─── Steve Custom Blocks ───

  // 1. Producto Shopify
  bm.add('steve-product', {
    label: 'Producto',
    category: STEVE_CATEGORY,
    media: icons.product,
    content: `<mj-section padding="20px">
  <mj-column>
    <mj-image src="https://placehold.co/300x300/f5f5f5/666?text=Producto" alt="Producto" width="300px" />
    <mj-text font-size="18px" font-weight="bold" align="center" padding="10px 0 5px">Nombre del Producto</mj-text>
    <mj-text font-size="16px" color="#888888" align="center" padding="0">$29.990</mj-text>
    <mj-button background-color="#6C47FF" color="#ffffff" href="#" align="center" border-radius="6px" padding="15px 0">
      Comprar ahora
    </mj-button>
  </mj-column>
</mj-section>`,
  });

  // 2. Productos Recomendados (dinámico)
  bm.add('steve-product-rec', {
    label: 'Recomendados',
    category: STEVE_CATEGORY,
    media: icons.productRec,
    content: `<mj-section padding="20px">
  <mj-column>
    <mj-text font-size="22px" font-weight="bold" align="center" padding-bottom="10px">Productos Recomendados</mj-text>
    <mj-raw>
      <div data-steve-products="true" data-dynamic-feed="true" data-product-type="best_sellers" data-product-count="4" data-columns="2" data-button-text="Ver producto" data-button-color="#6C47FF" style="border: 2px dashed #6C47FF; border-radius: 8px; padding: 30px; text-align: center; color: #6C47FF; font-size: 14px;">
        &#x1f6d2; Productos dinámicos — se cargan al enviar (best_sellers x4)
      </div>
    </mj-raw>
  </mj-column>
</mj-section>`,
  });

  // 3. Cupón
  bm.add('steve-coupon', {
    label: 'Cupón',
    category: STEVE_CATEGORY,
    media: icons.coupon,
    content: `<mj-section padding="20px" background-color="#f9f5ff" border="2px dashed #6C47FF" border-radius="8px">
  <mj-column>
    <mj-text font-size="14px" color="#6C47FF" align="center" text-transform="uppercase" letter-spacing="2px">Código de descuento</mj-text>
    <mj-text font-size="28px" font-weight="bold" align="center" color="#6C47FF" padding="5px 0">STEVE20</mj-text>
    <mj-text font-size="14px" color="#888888" align="center">20% de descuento en tu próxima compra</mj-text>
    <mj-text font-size="12px" color="#aaaaaa" align="center" padding-top="5px">Válido hasta el 31/12/2026</mj-text>
    <mj-button background-color="#6C47FF" color="#ffffff" href="#" align="center" border-radius="6px" padding="15px 0">
      Usar cupón
    </mj-button>
  </mj-column>
</mj-section>`,
  });

  // 4. Logo
  bm.add('steve-logo', {
    label: 'Logo',
    category: STEVE_CATEGORY,
    media: icons.logo,
    content: `<mj-section padding="20px 0">
  <mj-column>
    <mj-image src="https://placehold.co/200x60/ffffff/333?text=LOGO" alt="Logo" width="200px" align="center" href="#" />
  </mj-column>
</mj-section>`,
  });

  // 5. Reseña
  bm.add('steve-review', {
    label: 'Reseña',
    category: STEVE_CATEGORY,
    media: icons.review,
    content: `<mj-section padding="20px" background-color="#fffbeb">
  <mj-column>
    <mj-text font-size="20px" align="center" padding-bottom="5px">&#11088;&#11088;&#11088;&#11088;&#11088;</mj-text>
    <mj-text font-size="15px" font-style="italic" align="center" color="#555555" padding="5px 20px">
      "Excelente producto, superó mis expectativas. Lo recomiendo totalmente."
    </mj-text>
    <mj-text font-size="13px" color="#999999" align="center" padding-top="10px">— María González</mj-text>
  </mj-column>
</mj-section>`,
  });

  // 6. Redes Sociales
  bm.add('steve-social', {
    label: 'Redes Sociales',
    category: STEVE_CATEGORY,
    media: icons.social,
    content: `<mj-section padding="10px 0">
  <mj-column>
    <mj-social font-size="12px" icon-size="24px" mode="horizontal" align="center">
      <mj-social-element name="instagram" href="https://instagram.com/">Instagram</mj-social-element>
      <mj-social-element name="facebook" href="https://facebook.com/">Facebook</mj-social-element>
      <mj-social-element name="web" href="https://tutienda.com">Web</mj-social-element>
    </mj-social>
  </mj-column>
</mj-section>`,
  });

  // ─── Merge Tags (Variables) ───

  bm.add('merge-first-name', {
    label: 'Nombre',
    category: VARIABLES_CATEGORY,
    media: icons.variable,
    content: '<mj-text>{{ first_name }}</mj-text>',
  });

  bm.add('merge-email', {
    label: 'Email',
    category: VARIABLES_CATEGORY,
    media: icons.variable,
    content: '<mj-text>{{ email }}</mj-text>',
  });

  bm.add('merge-brand-name', {
    label: 'Marca',
    category: VARIABLES_CATEGORY,
    media: icons.variable,
    content: '<mj-text>{{ brand_name }}</mj-text>',
  });

  bm.add('merge-unsubscribe', {
    label: 'Desuscribir',
    category: VARIABLES_CATEGORY,
    media: icons.variable,
    content: '<mj-text><a href="{{ unsubscribe_url }}">Desuscribirme</a></mj-text>',
  });

  bm.add('merge-shop-url', {
    label: 'Tienda',
    category: VARIABLES_CATEGORY,
    media: icons.variable,
    content: '<mj-text><a href="{{ shop_url }}">Visitar tienda</a></mj-text>',
  });

  bm.add('merge-brand-color', {
    label: 'Color Marca',
    category: VARIABLES_CATEGORY,
    media: icons.variable,
    content: '<mj-text color="{{ brand_color }}">Texto con color de marca</mj-text>',
  });
}
