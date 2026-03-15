/**
 * Professional pre-built email templates for Steve Mail.
 * Each template is a full HTML string ready for GrapeJS.
 */

export interface EmailTemplate {
  id: string;
  name: string;
  category: 'welcome' | 'promo' | 'newsletter' | 'abandoned_cart' | 'product_launch' | 'seasonal' | 'thank_you' | 'review_request' | 'restock' | 'birthday' | 'loyalty' | 'referral' | 'winback' | 'announcement';
  thumbnail: string;
  description: string;
  html: string;
}

// ── Shared styles ───────────────────────────────────────────────────────────

const WRAPPER_OPEN = `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;max-width:600px;width:100%;">`;
const WRAPPER_CLOSE = `</table></td></tr></table>`;

const FOOTER = `<tr><td style="background-color:#f4f4f5;padding:24px 32px;text-align:center;border-top:1px solid #e4e4e7;">
  <p style="margin:0 0 6px;font-size:13px;color:#71717a;">{{ empresa }}</p>
  <p style="margin:0 0 12px;font-size:12px;color:#a1a1aa;">Recibiste este email porque estas suscrito a nuestro newsletter.</p>
  <a href="{{ unsubscribe_url }}" style="font-size:12px;color:#2563eb;text-decoration:underline;">Desuscribirse</a>
  <span style="color:#d4d4d8;margin:0 8px;">|</span>
  <a href="{{ preferences_url }}" style="font-size:12px;color:#2563eb;text-decoration:underline;">Preferencias</a>
</td></tr>`;

// ── Welcome ─────────────────────────────────────────────────────────────────

const welcomeTemplate: EmailTemplate = {
  id: 'welcome-01',
  name: 'Bienvenida Elegante',
  category: 'welcome',
  thumbnail: 'https://placehold.co/280x180/18181b/fafafa?text=Bienvenida',
  description: 'Email de bienvenida con logo, mensaje personalizado y CTA',
  html: `${WRAPPER_OPEN}
<tr><td style="background-color:#18181b;padding:32px;text-align:center;">
  <img src="https://placehold.co/160x48/18181b/fafafa?text=TU+LOGO" alt="Logo" style="max-height:48px;" />
</td></tr>
<tr><td style="padding:40px 32px;text-align:center;">
  <h1 style="margin:0 0 16px;font-size:26px;font-weight:700;color:#18181b;">Bienvenido/a, {{ nombre }}!</h1>
  <p style="margin:0 0 24px;font-size:16px;color:#52525b;line-height:1.6;max-width:460px;display:inline-block;">Nos alegra mucho que te hayas unido. Estamos listos para ayudarte a encontrar lo que buscas.</p>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 36px;background:#18181b;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">Explorar la Tienda</a>
</td></tr>
<tr><td style="padding:0 32px 32px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="width:33%;padding:12px;text-align:center;vertical-align:top;">
      <p style="margin:0 0 8px;font-size:28px;">&#128717;</p>
      <p style="margin:0;font-size:13px;color:#52525b;font-weight:600;">Productos Exclusivos</p>
    </td>
    <td style="width:33%;padding:12px;text-align:center;vertical-align:top;">
      <p style="margin:0 0 8px;font-size:28px;">&#128666;</p>
      <p style="margin:0;font-size:13px;color:#52525b;font-weight:600;">Envio Rapido</p>
    </td>
    <td style="width:33%;padding:12px;text-align:center;vertical-align:top;">
      <p style="margin:0 0 8px;font-size:28px;">&#128172;</p>
      <p style="margin:0;font-size:13px;color:#52525b;font-weight:600;">Soporte 24/7</p>
    </td>
  </tr></table>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

// ── Promo / Sale ────────────────────────────────────────────────────────────

const promoTemplate: EmailTemplate = {
  id: 'promo-01',
  name: 'Promocion Flash',
  category: 'promo',
  thumbnail: 'https://placehold.co/280x180/dc2626/ffffff?text=PROMO',
  description: 'Template de promocion con descuento destacado y productos',
  html: `${WRAPPER_OPEN}
<tr><td style="background:linear-gradient(135deg,#dc2626 0%,#b91c1c 100%);padding:40px 32px;text-align:center;">
  <p style="margin:0 0 8px;font-size:13px;color:#fecaca;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Solo por tiempo limitado</p>
  <h1 style="margin:0 0 8px;font-size:48px;font-weight:800;color:#ffffff;">30% OFF</h1>
  <p style="margin:0 0 20px;font-size:16px;color:#fecaca;">En toda la tienda</p>
  <div style="display:inline-block;padding:12px 24px;background:rgba(255,255,255,0.15);border:2px dashed #fecaca;border-radius:8px;">
    <p style="margin:0;font-size:11px;color:#fecaca;text-transform:uppercase;letter-spacing:1px;">Tu codigo</p>
    <p style="margin:4px 0 0;font-size:24px;font-weight:700;color:#ffffff;letter-spacing:3px;">FLASH30</p>
  </div>
</td></tr>
<tr><td style="padding:32px;text-align:center;">
  <h2 style="margin:0 0 20px;font-size:20px;color:#18181b;">Productos Destacados</h2>
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="width:50%;padding:8px;text-align:center;vertical-align:top;">
      <img src="https://placehold.co/240x240/f4f4f5/71717a?text=Producto+1" alt="" style="width:100%;max-width:240px;border-radius:8px;" />
      <p style="margin:8px 0 0;font-size:14px;color:#18181b;font-weight:600;">Producto Estrella</p>
      <p style="margin:4px 0 0;font-size:14px;"><span style="color:#a1a1aa;text-decoration:line-through;">$49.990</span> <span style="color:#dc2626;font-weight:700;">$34.990</span></p>
    </td>
    <td style="width:50%;padding:8px;text-align:center;vertical-align:top;">
      <img src="https://placehold.co/240x240/f4f4f5/71717a?text=Producto+2" alt="" style="width:100%;max-width:240px;border-radius:8px;" />
      <p style="margin:8px 0 0;font-size:14px;color:#18181b;font-weight:600;">Mas Vendido</p>
      <p style="margin:4px 0 0;font-size:14px;"><span style="color:#a1a1aa;text-decoration:line-through;">$39.990</span> <span style="color:#dc2626;font-weight:700;">$27.990</span></p>
    </td>
  </tr></table>
</td></tr>
<tr><td style="padding:0 32px 32px;text-align:center;">
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 40px;background:#dc2626;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">Comprar con Descuento</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

// ── Newsletter ──────────────────────────────────────────────────────────────

const newsletterTemplate: EmailTemplate = {
  id: 'newsletter-01',
  name: 'Newsletter Semanal',
  category: 'newsletter',
  thumbnail: 'https://placehold.co/280x180/2563eb/ffffff?text=Newsletter',
  description: 'Newsletter con articulos, imagen destacada y secciones',
  html: `${WRAPPER_OPEN}
<tr><td style="background-color:#18181b;padding:20px 32px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td><img src="https://placehold.co/120x36/18181b/fafafa?text=LOGO" alt="Logo" style="max-height:36px;" /></td>
    <td align="right" style="font-size:13px;color:#a1a1aa;">{{ fecha }}</td>
  </tr></table>
</td></tr>
<tr><td style="padding:0;">
  <img src="https://placehold.co/600x280/e4e4e7/71717a?text=Imagen+Destacada" alt="" style="width:100%;display:block;" />
</td></tr>
<tr><td style="padding:32px;">
  <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#18181b;">Tu resumen semanal</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6;">Hola {{ nombre }}, aqui tienes las novedades mas importantes de esta semana.</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e4e4e7;">
    <tr><td style="padding:20px 0;">
      <h3 style="margin:0 0 8px;font-size:17px;color:#18181b;">Articulo Destacado</h3>
      <p style="margin:0 0 12px;font-size:14px;color:#52525b;line-height:1.5;">Un resumen del articulo o noticia mas relevante para tus suscriptores.</p>
      <a href="#" style="font-size:14px;color:#2563eb;text-decoration:none;font-weight:600;">Leer mas &rarr;</a>
    </td></tr>
    <tr><td style="padding:20px 0;border-top:1px solid #e4e4e7;">
      <h3 style="margin:0 0 8px;font-size:17px;color:#18181b;">Novedades en la Tienda</h3>
      <p style="margin:0 0 12px;font-size:14px;color:#52525b;line-height:1.5;">Nuevos productos, colecciones, o actualizaciones que tus clientes necesitan saber.</p>
      <a href="#" style="font-size:14px;color:#2563eb;text-decoration:none;font-weight:600;">Ver productos &rarr;</a>
    </td></tr>
    <tr><td style="padding:20px 0;border-top:1px solid #e4e4e7;">
      <h3 style="margin:0 0 8px;font-size:17px;color:#18181b;">Tip de la Semana</h3>
      <p style="margin:0;font-size:14px;color:#52525b;line-height:1.5;">Un consejo util relacionado con tus productos o la industria.</p>
    </td></tr>
  </table>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

// ── Abandoned Cart ──────────────────────────────────────────────────────────

const abandonedCartTemplate: EmailTemplate = {
  id: 'abandoned-cart-01',
  name: 'Carrito Abandonado',
  category: 'abandoned_cart',
  thumbnail: 'https://placehold.co/280x180/f59e0b/ffffff?text=Carrito',
  description: 'Recupera ventas con un recordatorio del carrito abandonado',
  html: `${WRAPPER_OPEN}
<tr><td style="background-color:#18181b;padding:20px 32px;text-align:center;">
  <img src="https://placehold.co/120x36/18181b/fafafa?text=LOGO" alt="Logo" style="max-height:36px;" />
</td></tr>
<tr><td style="padding:40px 32px;text-align:center;">
  <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#18181b;">Olvidaste algo!</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6;">Hola {{ nombre }}, dejaste productos en tu carrito. Los guardamos para ti.</p>
</td></tr>
<tr><td style="padding:0 32px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e4e4e7;border-radius:8px;">
    <tr>
      <td style="padding:16px;width:80px;">
        <img src="https://placehold.co/80x80/f4f4f5/71717a?text=P1" alt="" style="width:80px;border-radius:6px;" />
      </td>
      <td style="padding:16px;">
        <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#18181b;">Producto del Carrito</p>
        <p style="margin:0;font-size:13px;color:#71717a;">Cantidad: 1</p>
      </td>
      <td style="padding:16px;text-align:right;">
        <p style="margin:0;font-size:16px;font-weight:700;color:#18181b;">$29.990</p>
      </td>
    </tr>
    <tr><td colspan="3" style="border-top:1px solid #e4e4e7;padding:16px;text-align:right;">
      <p style="margin:0;font-size:13px;color:#71717a;">Total</p>
      <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#18181b;">$29.990</p>
    </td></tr>
  </table>
</td></tr>
<tr><td style="padding:24px 32px 12px;text-align:center;">
  <a href="{{ checkout_url }}" style="display:inline-block;padding:14px 40px;background:#f59e0b;color:#18181b;border-radius:6px;text-decoration:none;font-size:15px;font-weight:700;">Completar Compra</a>
</td></tr>
<tr><td style="padding:0 32px 32px;text-align:center;">
  <p style="margin:0;font-size:13px;color:#a1a1aa;">Necesitas ayuda? Respondenos directamente a este email.</p>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

// ── Product Launch ──────────────────────────────────────────────────────────

const productLaunchTemplate: EmailTemplate = {
  id: 'product-launch-01',
  name: 'Lanzamiento de Producto',
  category: 'product_launch',
  thumbnail: 'https://placehold.co/280x180/7c3aed/ffffff?text=Lanzamiento',
  description: 'Anuncia un nuevo producto con impacto visual',
  html: `${WRAPPER_OPEN}
<tr><td style="background:linear-gradient(135deg,#7c3aed 0%,#4f46e5 100%);padding:40px 32px;text-align:center;">
  <p style="margin:0 0 8px;font-size:12px;color:#c4b5fd;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Nuevo</p>
  <h1 style="margin:0 0 12px;font-size:32px;font-weight:800;color:#ffffff;line-height:1.2;">Presentamos Nuestro<br/>Nuevo Producto</h1>
  <p style="margin:0 0 24px;font-size:16px;color:#c4b5fd;line-height:1.5;">Lo que estabas esperando finalmente llego.</p>
</td></tr>
<tr><td style="padding:0;text-align:center;">
  <img src="https://placehold.co/600x400/f4f4f5/71717a?text=Producto+Hero" alt="" style="width:100%;display:block;" />
</td></tr>
<tr><td style="padding:32px;text-align:center;">
  <h2 style="margin:0 0 16px;font-size:22px;color:#18181b;">Caracteristicas Principales</h2>
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="width:33%;padding:12px;text-align:center;vertical-align:top;">
      <div style="width:48px;height:48px;margin:0 auto 12px;background:#f0e4ff;border-radius:12px;line-height:48px;font-size:20px;">&#10024;</div>
      <p style="margin:0;font-size:14px;color:#18181b;font-weight:600;">Premium</p>
      <p style="margin:4px 0 0;font-size:12px;color:#71717a;">Materiales de primera</p>
    </td>
    <td style="width:33%;padding:12px;text-align:center;vertical-align:top;">
      <div style="width:48px;height:48px;margin:0 auto 12px;background:#f0e4ff;border-radius:12px;line-height:48px;font-size:20px;">&#128293;</div>
      <p style="margin:0;font-size:14px;color:#18181b;font-weight:600;">Exclusivo</p>
      <p style="margin:4px 0 0;font-size:12px;color:#71717a;">Edicion limitada</p>
    </td>
    <td style="width:33%;padding:12px;text-align:center;vertical-align:top;">
      <div style="width:48px;height:48px;margin:0 auto 12px;background:#f0e4ff;border-radius:12px;line-height:48px;font-size:20px;">&#128640;</div>
      <p style="margin:0;font-size:14px;color:#18181b;font-weight:600;">Envio Express</p>
      <p style="margin:4px 0 0;font-size:12px;color:#71717a;">Entrega en 24h</p>
    </td>
  </tr></table>
</td></tr>
<tr><td style="padding:0 32px 32px;text-align:center;">
  <p style="margin:0 0 4px;font-size:14px;color:#71717a;">Desde</p>
  <p style="margin:0 0 20px;font-size:32px;font-weight:800;color:#18181b;">$49.990</p>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 40px;background:#7c3aed;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">Comprar Ahora</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

// ── Seasonal / Holiday ──────────────────────────────────────────────────────

const seasonalTemplate: EmailTemplate = {
  id: 'seasonal-01',
  name: 'Temporada Especial',
  category: 'seasonal',
  thumbnail: 'https://placehold.co/280x180/059669/ffffff?text=Temporada',
  description: 'Template adaptable para cualquier temporada o festividad',
  html: `${WRAPPER_OPEN}
<tr><td style="background:linear-gradient(135deg,#059669 0%,#047857 100%);padding:48px 32px;text-align:center;">
  <p style="margin:0 0 12px;font-size:14px;color:#a7f3d0;letter-spacing:2px;text-transform:uppercase;">Temporada Especial</p>
  <h1 style="margin:0 0 16px;font-size:36px;font-weight:800;color:#ffffff;">Ofertas de Temporada</h1>
  <p style="margin:0 0 24px;font-size:16px;color:#a7f3d0;line-height:1.5;">Aprovecha nuestros precios especiales por tiempo limitado</p>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 36px;background:#ffffff;color:#059669;border-radius:6px;text-decoration:none;font-size:15px;font-weight:700;">Ver Ofertas</a>
</td></tr>
<tr><td style="padding:32px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="width:50%;padding:8px;text-align:center;vertical-align:top;">
      <img src="https://placehold.co/240x240/f4f4f5/71717a?text=Oferta+1" alt="" style="width:100%;max-width:240px;border-radius:8px;" />
      <p style="margin:8px 0 4px;font-size:14px;color:#18181b;font-weight:600;">Producto de Temporada</p>
      <p style="margin:0;font-size:14px;color:#059669;font-weight:700;">Desde $19.990</p>
    </td>
    <td style="width:50%;padding:8px;text-align:center;vertical-align:top;">
      <img src="https://placehold.co/240x240/f4f4f5/71717a?text=Oferta+2" alt="" style="width:100%;max-width:240px;border-radius:8px;" />
      <p style="margin:8px 0 4px;font-size:14px;color:#18181b;font-weight:600;">Pack Especial</p>
      <p style="margin:0;font-size:14px;color:#059669;font-weight:700;">2x1 - $29.990</p>
    </td>
  </tr></table>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

// ── Thank You ───────────────────────────────────────────────────────────────

const thankYouTemplate: EmailTemplate = {
  id: 'thank-you-01',
  name: 'Gracias por tu Compra',
  category: 'thank_you',
  thumbnail: 'https://placehold.co/280x180/059669/ffffff?text=Gracias',
  description: 'Agradecimiento post-compra con resumen del pedido',
  html: `${WRAPPER_OPEN}
<tr><td style="background-color:#18181b;padding:20px 32px;text-align:center;">
  <img src="https://placehold.co/120x36/18181b/fafafa?text=LOGO" alt="Logo" style="max-height:36px;" />
</td></tr>
<tr><td style="padding:40px 32px;text-align:center;">
  <div style="width:64px;height:64px;margin:0 auto 16px;background:#dcfce7;border-radius:50%;line-height:64px;font-size:28px;">&#10004;</div>
  <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#18181b;">Gracias por tu compra!</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6;">Hola {{ nombre }}, tu pedido ha sido confirmado y esta en camino.</p>
</td></tr>
<tr><td style="padding:0 32px 24px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e4e4e7;border-radius:8px;">
    <tr><td style="padding:16px;background:#f9fafb;border-radius:8px 8px 0 0;">
      <p style="margin:0;font-size:14px;font-weight:600;color:#18181b;">Resumen del Pedido</p>
    </td></tr>
    <tr><td style="padding:16px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding:8px 0;font-size:14px;color:#52525b;">Producto ejemplo x1</td>
          <td style="padding:8px 0;font-size:14px;color:#18181b;text-align:right;font-weight:600;">$29.990</td>
        </tr>
        <tr><td colspan="2" style="border-top:1px solid #e4e4e7;"></td></tr>
        <tr>
          <td style="padding:8px 0;font-size:14px;color:#52525b;">Envio</td>
          <td style="padding:8px 0;font-size:14px;color:#059669;text-align:right;font-weight:600;">Gratis</td>
        </tr>
        <tr><td colspan="2" style="border-top:1px solid #e4e4e7;"></td></tr>
        <tr>
          <td style="padding:8px 0;font-size:16px;font-weight:700;color:#18181b;">Total</td>
          <td style="padding:8px 0;font-size:16px;font-weight:700;color:#18181b;text-align:right;">$29.990</td>
        </tr>
      </table>
    </td></tr>
  </table>
</td></tr>
<tr><td style="padding:0 32px 32px;text-align:center;">
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 36px;background:#18181b;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">Ver mi Pedido</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const thankYouRecommendationsTemplate: EmailTemplate = {
  id: 'thank-you-02',
  name: 'Gracias + Recomendaciones',
  category: 'thank_you',
  thumbnail: 'https://placehold.co/280x180/2563eb/ffffff?text=Gracias+Recs',
  description: 'Agradecimiento con productos recomendados',
  html: `${WRAPPER_OPEN}
<tr><td style="background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);padding:32px;text-align:center;">
  <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#ffffff;">Gracias, {{ nombre }}!</h1>
  <p style="margin:0;font-size:15px;color:#bfdbfe;">Tu pedido esta confirmado. Mientras esperas, mira esto:</p>
</td></tr>
<tr><td style="padding:32px;">
  <h2 style="margin:0 0 20px;font-size:18px;color:#18181b;text-align:center;">Te puede interesar</h2>
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="width:33%;padding:6px;text-align:center;vertical-align:top;">
      <img src="https://placehold.co/170x170/f4f4f5/71717a?text=Rec+1" alt="" style="width:100%;border-radius:8px;" />
      <p style="margin:8px 0 2px;font-size:13px;font-weight:600;color:#18181b;">Complemento A</p>
      <p style="margin:0;font-size:13px;color:#2563eb;font-weight:700;">$19.990</p>
    </td>
    <td style="width:33%;padding:6px;text-align:center;vertical-align:top;">
      <img src="https://placehold.co/170x170/f4f4f5/71717a?text=Rec+2" alt="" style="width:100%;border-radius:8px;" />
      <p style="margin:8px 0 2px;font-size:13px;font-weight:600;color:#18181b;">Complemento B</p>
      <p style="margin:0;font-size:13px;color:#2563eb;font-weight:700;">$24.990</p>
    </td>
    <td style="width:33%;padding:6px;text-align:center;vertical-align:top;">
      <img src="https://placehold.co/170x170/f4f4f5/71717a?text=Rec+3" alt="" style="width:100%;border-radius:8px;" />
      <p style="margin:8px 0 2px;font-size:13px;font-weight:600;color:#18181b;">Complemento C</p>
      <p style="margin:0;font-size:13px;color:#2563eb;font-weight:700;">$14.990</p>
    </td>
  </tr></table>
</td></tr>
<tr><td style="padding:0 32px 32px;text-align:center;">
  <a href="{{ tienda_url }}" style="display:inline-block;padding:12px 32px;background:#2563eb;color:#ffffff;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">Ver Todos</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

// ── Review Request ──────────────────────────────────────────────────────────

const reviewRequestTemplate: EmailTemplate = {
  id: 'review-01',
  name: 'Solicitud de Resena',
  category: 'review_request',
  thumbnail: 'https://placehold.co/280x180/eab308/ffffff?text=Resena',
  description: 'Pide una resena del producto comprado',
  html: `${WRAPPER_OPEN}
<tr><td style="background-color:#18181b;padding:20px 32px;text-align:center;">
  <img src="https://placehold.co/120x36/18181b/fafafa?text=LOGO" alt="Logo" style="max-height:36px;" />
</td></tr>
<tr><td style="padding:40px 32px;text-align:center;">
  <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#18181b;">Como te fue con tu compra?</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6;">Hola {{ nombre }}, tu opinion nos ayuda a mejorar. Cuentanos que te parecio.</p>
  <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 24px;">
    <tr>
      <td style="padding:0 6px;font-size:36px;cursor:pointer;">&#9733;</td>
      <td style="padding:0 6px;font-size:36px;cursor:pointer;">&#9733;</td>
      <td style="padding:0 6px;font-size:36px;cursor:pointer;">&#9733;</td>
      <td style="padding:0 6px;font-size:36px;cursor:pointer;">&#9733;</td>
      <td style="padding:0 6px;font-size:36px;cursor:pointer;">&#9733;</td>
    </tr>
  </table>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 36px;background:#eab308;color:#18181b;border-radius:6px;text-decoration:none;font-size:15px;font-weight:700;">Dejar mi Resena</a>
</td></tr>
<tr><td style="padding:0 32px 32px;text-align:center;">
  <p style="margin:0;font-size:13px;color:#a1a1aa;">Solo toma 1 minuto. Tu feedback es muy valioso para nosotros.</p>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const surveyTemplate: EmailTemplate = {
  id: 'review-02',
  name: 'Encuesta Rapida',
  category: 'review_request',
  thumbnail: 'https://placehold.co/280x180/8b5cf6/ffffff?text=Encuesta',
  description: 'Encuesta NPS rapida con escala 1-10',
  html: `${WRAPPER_OPEN}
<tr><td style="background:linear-gradient(135deg,#8b5cf6 0%,#6d28d9 100%);padding:40px 32px;text-align:center;">
  <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#ffffff;">Queremos saber tu opinion</h1>
  <p style="margin:0;font-size:15px;color:#ddd6fe;">{{ nombre }}, nos recomendarias a un amigo?</p>
</td></tr>
<tr><td style="padding:32px;text-align:center;">
  <p style="margin:0 0 16px;font-size:14px;color:#52525b;">Del 1 al 10, que tan probable es que nos recomiendes?</p>
  <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
    <tr>
      <td style="padding:4px;"><a href="#" style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;border-radius:8px;background:#fef2f2;color:#dc2626;font-weight:700;font-size:14px;text-decoration:none;">1</a></td>
      <td style="padding:4px;"><a href="#" style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;border-radius:8px;background:#fef2f2;color:#dc2626;font-weight:700;font-size:14px;text-decoration:none;">2</a></td>
      <td style="padding:4px;"><a href="#" style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;border-radius:8px;background:#fef2f2;color:#dc2626;font-weight:700;font-size:14px;text-decoration:none;">3</a></td>
      <td style="padding:4px;"><a href="#" style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;border-radius:8px;background:#fefce8;color:#ca8a04;font-weight:700;font-size:14px;text-decoration:none;">4</a></td>
      <td style="padding:4px;"><a href="#" style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;border-radius:8px;background:#fefce8;color:#ca8a04;font-weight:700;font-size:14px;text-decoration:none;">5</a></td>
      <td style="padding:4px;"><a href="#" style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;border-radius:8px;background:#fefce8;color:#ca8a04;font-weight:700;font-size:14px;text-decoration:none;">6</a></td>
      <td style="padding:4px;"><a href="#" style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;border-radius:8px;background:#fefce8;color:#ca8a04;font-weight:700;font-size:14px;text-decoration:none;">7</a></td>
      <td style="padding:4px;"><a href="#" style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;border-radius:8px;background:#f0fdf4;color:#16a34a;font-weight:700;font-size:14px;text-decoration:none;">8</a></td>
      <td style="padding:4px;"><a href="#" style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;border-radius:8px;background:#f0fdf4;color:#16a34a;font-weight:700;font-size:14px;text-decoration:none;">9</a></td>
      <td style="padding:4px;"><a href="#" style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;border-radius:8px;background:#f0fdf4;color:#16a34a;font-weight:700;font-size:14px;text-decoration:none;">10</a></td>
    </tr>
  </table>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;"><tr>
    <td style="text-align:left;font-size:11px;color:#a1a1aa;">Nada probable</td>
    <td style="text-align:right;font-size:11px;color:#a1a1aa;">Muy probable</td>
  </tr></table>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

// ── Restock / Back in Stock ─────────────────────────────────────────────────

const restockTemplate: EmailTemplate = {
  id: 'restock-01',
  name: 'Producto de Vuelta',
  category: 'restock',
  thumbnail: 'https://placehold.co/280x180/0891b2/ffffff?text=De+Vuelta',
  description: 'Notificacion de producto disponible nuevamente',
  html: `${WRAPPER_OPEN}
<tr><td style="background-color:#18181b;padding:20px 32px;text-align:center;">
  <img src="https://placehold.co/120x36/18181b/fafafa?text=LOGO" alt="Logo" style="max-height:36px;" />
</td></tr>
<tr><td style="padding:32px;text-align:center;">
  <div style="display:inline-block;padding:6px 16px;background:#ecfeff;border-radius:20px;margin-bottom:16px;">
    <p style="margin:0;font-size:12px;font-weight:700;color:#0891b2;text-transform:uppercase;letter-spacing:1px;">De vuelta en stock</p>
  </div>
  <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#18181b;">El producto que querias ya esta disponible!</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;">Hola {{ nombre }}, buenas noticias: el producto que estabas esperando volvio.</p>
</td></tr>
<tr><td style="padding:0 32px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
    <tr><td style="padding:0;text-align:center;">
      <img src="https://placehold.co/536x300/f4f4f5/71717a?text=Producto" alt="" style="width:100%;display:block;" />
    </td></tr>
    <tr><td style="padding:20px;text-align:center;">
      <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#18181b;">Nombre del Producto</p>
      <p style="margin:0 0 16px;font-size:20px;font-weight:800;color:#0891b2;">$39.990</p>
      <a href="{{ tienda_url }}" style="display:inline-block;padding:12px 32px;background:#0891b2;color:#ffffff;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">Comprar Ahora</a>
    </td></tr>
  </table>
</td></tr>
<tr><td style="padding:16px 32px 32px;text-align:center;">
  <p style="margin:0;font-size:13px;color:#a1a1aa;">Stock limitado. No esperes demasiado!</p>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

// ── Birthday ────────────────────────────────────────────────────────────────

const birthdayTemplate: EmailTemplate = {
  id: 'birthday-01',
  name: 'Feliz Cumpleanos',
  category: 'birthday',
  thumbnail: 'https://placehold.co/280x180/ec4899/ffffff?text=Cumpleanos',
  description: 'Email de cumpleanos con descuento especial',
  html: `${WRAPPER_OPEN}
<tr><td style="background:linear-gradient(135deg,#ec4899 0%,#db2777 100%);padding:48px 32px;text-align:center;">
  <p style="margin:0 0 8px;font-size:48px;">&#127874;</p>
  <h1 style="margin:0 0 12px;font-size:28px;font-weight:800;color:#ffffff;">Feliz Cumpleanos, {{ nombre }}!</h1>
  <p style="margin:0 0 24px;font-size:16px;color:#fbcfe8;line-height:1.5;">Para celebrar tu dia especial, tenemos un regalo para ti</p>
  <div style="display:inline-block;padding:16px 32px;background:rgba(255,255,255,0.2);border-radius:12px;">
    <p style="margin:0 0 4px;font-size:12px;color:#fbcfe8;text-transform:uppercase;letter-spacing:1px;">Tu descuento exclusivo</p>
    <p style="margin:0;font-size:36px;font-weight:800;color:#ffffff;">20% OFF</p>
  </div>
</td></tr>
<tr><td style="padding:32px;text-align:center;">
  <div style="display:inline-block;padding:12px 24px;background:#fdf2f8;border:2px dashed #ec4899;border-radius:8px;margin-bottom:24px;">
    <p style="margin:0;font-size:11px;color:#be185d;text-transform:uppercase;">Codigo</p>
    <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#ec4899;letter-spacing:3px;">CUMPLE20</p>
  </div>
  <p style="display:block;margin:0 0 24px;font-size:14px;color:#71717a;">Valido por 7 dias desde hoy</p>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 40px;background:#ec4899;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">Usar mi Descuento</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

// ── Loyalty / VIP ───────────────────────────────────────────────────────────

const loyaltyVIPTemplate: EmailTemplate = {
  id: 'loyalty-01',
  name: 'Cliente VIP',
  category: 'loyalty',
  thumbnail: 'https://placehold.co/280x180/ca8a04/ffffff?text=VIP',
  description: 'Reconocimiento VIP con beneficios exclusivos',
  html: `${WRAPPER_OPEN}
<tr><td style="background:linear-gradient(135deg,#ca8a04 0%,#a16207 100%);padding:40px 32px;text-align:center;">
  <p style="margin:0 0 12px;font-size:36px;">&#11088;</p>
  <p style="margin:0 0 4px;font-size:12px;color:#fef08a;text-transform:uppercase;letter-spacing:3px;font-weight:600;">Exclusivo</p>
  <h1 style="margin:0 0 12px;font-size:28px;font-weight:800;color:#ffffff;">Eres Cliente VIP, {{ nombre }}!</h1>
  <p style="margin:0;font-size:15px;color:#fef08a;">Gracias por ser un cliente leal. Disfruta tus beneficios exclusivos.</p>
</td></tr>
<tr><td style="padding:32px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="padding:16px;text-align:center;border:1px solid #fef08a;border-radius:8px;background:#fffbeb;">
        <p style="margin:0 0 4px;font-size:28px;font-weight:800;color:#ca8a04;">15%</p>
        <p style="margin:0;font-size:12px;color:#92400e;">Descuento permanente</p>
      </td>
      <td style="width:12px;"></td>
      <td style="padding:16px;text-align:center;border:1px solid #fef08a;border-radius:8px;background:#fffbeb;">
        <p style="margin:0 0 4px;font-size:28px;font-weight:800;color:#ca8a04;">&#128666;</p>
        <p style="margin:0;font-size:12px;color:#92400e;">Envio gratis siempre</p>
      </td>
      <td style="width:12px;"></td>
      <td style="padding:16px;text-align:center;border:1px solid #fef08a;border-radius:8px;background:#fffbeb;">
        <p style="margin:0 0 4px;font-size:28px;font-weight:800;color:#ca8a04;">&#127381;</p>
        <p style="margin:0;font-size:12px;color:#92400e;">Acceso anticipado</p>
      </td>
    </tr>
  </table>
</td></tr>
<tr><td style="padding:0 32px 32px;text-align:center;">
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 40px;background:#ca8a04;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">Explorar VIP</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const loyaltyPointsTemplate: EmailTemplate = {
  id: 'loyalty-02',
  name: 'Balance de Puntos',
  category: 'loyalty',
  thumbnail: 'https://placehold.co/280x180/7c3aed/ffffff?text=Puntos',
  description: 'Resumen de puntos acumulados y recompensas',
  html: `${WRAPPER_OPEN}
<tr><td style="background-color:#18181b;padding:20px 32px;text-align:center;">
  <img src="https://placehold.co/120x36/18181b/fafafa?text=LOGO" alt="Logo" style="max-height:36px;" />
</td></tr>
<tr><td style="padding:32px;text-align:center;">
  <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#18181b;">Tu Balance de Puntos</h1>
  <p style="margin:0 0 24px;font-size:14px;color:#52525b;">Hola {{ nombre }}, asi va tu programa de recompensas:</p>
  <div style="display:inline-block;padding:24px 48px;background:linear-gradient(135deg,#7c3aed 0%,#6d28d9 100%);border-radius:16px;">
    <p style="margin:0 0 4px;font-size:12px;color:#c4b5fd;text-transform:uppercase;letter-spacing:1px;">Puntos disponibles</p>
    <p style="margin:0;font-size:40px;font-weight:800;color:#ffffff;">2,450</p>
  </div>
</td></tr>
<tr><td style="padding:0 32px 24px;">
  <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#18181b;">Canjea tus puntos:</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="padding:12px;border:1px solid #e4e4e7;border-radius:8px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td><p style="margin:0;font-size:14px;font-weight:600;color:#18181b;">500 pts = $5.000 dcto</p></td>
          <td style="text-align:right;"><a href="#" style="font-size:12px;color:#7c3aed;font-weight:600;text-decoration:none;">Canjear &rarr;</a></td>
        </tr></table>
      </td>
    </tr>
    <tr><td style="height:8px;"></td></tr>
    <tr>
      <td style="padding:12px;border:1px solid #e4e4e7;border-radius:8px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td><p style="margin:0;font-size:14px;font-weight:600;color:#18181b;">1000 pts = $12.000 dcto</p></td>
          <td style="text-align:right;"><a href="#" style="font-size:12px;color:#7c3aed;font-weight:600;text-decoration:none;">Canjear &rarr;</a></td>
        </tr></table>
      </td>
    </tr>
    <tr><td style="height:8px;"></td></tr>
    <tr>
      <td style="padding:12px;border:1px solid #e4e4e7;border-radius:8px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td><p style="margin:0;font-size:14px;font-weight:600;color:#18181b;">2000 pts = Envio gratis</p></td>
          <td style="text-align:right;"><a href="#" style="font-size:12px;color:#7c3aed;font-weight:600;text-decoration:none;">Canjear &rarr;</a></td>
        </tr></table>
      </td>
    </tr>
  </table>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

// ── Referral ────────────────────────────────────────────────────────────────

const referralTemplate: EmailTemplate = {
  id: 'referral-01',
  name: 'Invita a un Amigo',
  category: 'referral',
  thumbnail: 'https://placehold.co/280x180/0ea5e9/ffffff?text=Referidos',
  description: 'Programa de referidos con recompensa doble',
  html: `${WRAPPER_OPEN}
<tr><td style="background:linear-gradient(135deg,#0ea5e9 0%,#0284c7 100%);padding:40px 32px;text-align:center;">
  <h1 style="margin:0 0 12px;font-size:26px;font-weight:800;color:#ffffff;">Invita y Gana!</h1>
  <p style="margin:0;font-size:15px;color:#bae6fd;">Comparte tu codigo y ambos ganan $10.000 de descuento</p>
</td></tr>
<tr><td style="padding:32px;text-align:center;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="width:50%;padding:16px;text-align:center;border-right:1px solid #e4e4e7;">
      <p style="margin:0 0 8px;font-size:36px;">&#127873;</p>
      <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#18181b;">Tu recibes</p>
      <p style="margin:0;font-size:20px;font-weight:800;color:#0ea5e9;">$10.000</p>
    </td>
    <td style="width:50%;padding:16px;text-align:center;">
      <p style="margin:0 0 8px;font-size:36px;">&#128588;</p>
      <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#18181b;">Tu amigo recibe</p>
      <p style="margin:0;font-size:20px;font-weight:800;color:#0ea5e9;">$10.000</p>
    </td>
  </tr></table>
</td></tr>
<tr><td style="padding:0 32px 24px;text-align:center;">
  <p style="margin:0 0 12px;font-size:14px;color:#52525b;">Tu codigo personal de referido:</p>
  <div style="display:inline-block;padding:14px 32px;background:#f0f9ff;border:2px dashed #0ea5e9;border-radius:8px;">
    <p style="margin:0;font-size:22px;font-weight:700;color:#0284c7;letter-spacing:3px;">AMIGO-{{ nombre }}</p>
  </div>
</td></tr>
<tr><td style="padding:0 32px 32px;text-align:center;">
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 40px;background:#0ea5e9;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">Compartir Ahora</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

// ── Winback ─────────────────────────────────────────────────────────────────

const winbackTemplate: EmailTemplate = {
  id: 'winback-01',
  name: 'Te Extraniamos',
  category: 'winback',
  thumbnail: 'https://placehold.co/280x180/6366f1/ffffff?text=Te+Extraniamos',
  description: 'Recupera clientes inactivos con descuento',
  html: `${WRAPPER_OPEN}
<tr><td style="background-color:#18181b;padding:20px 32px;text-align:center;">
  <img src="https://placehold.co/120x36/18181b/fafafa?text=LOGO" alt="Logo" style="max-height:36px;" />
</td></tr>
<tr><td style="padding:40px 32px;text-align:center;">
  <p style="margin:0 0 16px;font-size:48px;">&#128148;</p>
  <h1 style="margin:0 0 12px;font-size:26px;font-weight:700;color:#18181b;">Te extraniamos, {{ nombre }}</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6;">Ha pasado un tiempo desde tu ultima visita. Preparamos algo especial para tu regreso.</p>
  <div style="display:inline-block;padding:16px 32px;background:#eef2ff;border-radius:12px;margin-bottom:24px;">
    <p style="margin:0 0 4px;font-size:12px;color:#4338ca;text-transform:uppercase;">Descuento de bienvenida</p>
    <p style="margin:0;font-size:32px;font-weight:800;color:#6366f1;">25% OFF</p>
    <p style="margin:4px 0 0;font-size:12px;color:#6366f1;font-weight:600;">Codigo: VUELVE25</p>
  </div>
  <p style="display:block;margin:0 0 24px;font-size:14px;color:#71717a;">Valido solo esta semana</p>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 40px;background:#6366f1;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">Volver a la Tienda</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const winbackUrgencyTemplate: EmailTemplate = {
  id: 'winback-02',
  name: 'Ultima Oportunidad',
  category: 'winback',
  thumbnail: 'https://placehold.co/280x180/dc2626/ffffff?text=Ultima+Chance',
  description: 'Urgencia para recuperar clientes inactivos',
  html: `${WRAPPER_OPEN}
<tr><td style="background:#18181b;padding:32px;text-align:center;">
  <p style="margin:0 0 8px;font-size:13px;color:#fca5a5;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Ultima oportunidad</p>
  <h1 style="margin:0 0 12px;font-size:28px;font-weight:800;color:#ffffff;">Tu descuento vence hoy</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#a1a1aa;">{{ nombre }}, este es tu ultimo chance de usar tu 25% de descuento</p>
  <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 24px;">
    <tr>
      <td style="padding:8px 12px;background:rgba(255,255,255,0.1);border-radius:8px;text-align:center;">
        <p style="margin:0;font-size:24px;font-weight:800;color:#ffffff;">23</p>
        <p style="margin:0;font-size:10px;color:#a1a1aa;">HORAS</p>
      </td>
      <td style="padding:0 8px;font-size:24px;color:#a1a1aa;">:</td>
      <td style="padding:8px 12px;background:rgba(255,255,255,0.1);border-radius:8px;text-align:center;">
        <p style="margin:0;font-size:24px;font-weight:800;color:#ffffff;">59</p>
        <p style="margin:0;font-size:10px;color:#a1a1aa;">MIN</p>
      </td>
      <td style="padding:0 8px;font-size:24px;color:#a1a1aa;">:</td>
      <td style="padding:8px 12px;background:rgba(255,255,255,0.1);border-radius:8px;text-align:center;">
        <p style="margin:0;font-size:24px;font-weight:800;color:#ffffff;">59</p>
        <p style="margin:0;font-size:10px;color:#a1a1aa;">SEG</p>
      </td>
    </tr>
  </table>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 40px;background:#dc2626;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:700;">Usar Descuento Ahora</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

// ── Announcement ────────────────────────────────────────────────────────────

const announcementNewTemplate: EmailTemplate = {
  id: 'announcement-01',
  name: 'Nueva Coleccion',
  category: 'announcement',
  thumbnail: 'https://placehold.co/280x180/18181b/fafafa?text=Coleccion',
  description: 'Anuncia una nueva coleccion o categoria',
  html: `${WRAPPER_OPEN}
<tr><td style="padding:0;">
  <img src="https://placehold.co/600x350/e4e4e7/71717a?text=Nueva+Coleccion" alt="" style="width:100%;display:block;" />
</td></tr>
<tr><td style="padding:32px;text-align:center;">
  <p style="margin:0 0 8px;font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:2px;">Acaba de llegar</p>
  <h1 style="margin:0 0 12px;font-size:28px;font-weight:800;color:#18181b;">Nueva Coleccion Otono 2026</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6;max-width:460px;display:inline-block;">Descubre las piezas que van a definir la temporada. Disenios exclusivos, materiales premium.</p>
</td></tr>
<tr><td style="padding:0 32px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="width:50%;padding:6px;text-align:center;">
      <img src="https://placehold.co/260x320/f4f4f5/71717a?text=Look+1" alt="" style="width:100%;border-radius:8px;" />
    </td>
    <td style="width:50%;padding:6px;text-align:center;">
      <img src="https://placehold.co/260x320/f4f4f5/71717a?text=Look+2" alt="" style="width:100%;border-radius:8px;" />
    </td>
  </tr></table>
</td></tr>
<tr><td style="padding:24px 32px 32px;text-align:center;">
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 40px;background:#18181b;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">Ver Coleccion</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const announcementEventTemplate: EmailTemplate = {
  id: 'announcement-02',
  name: 'Evento Especial',
  category: 'announcement',
  thumbnail: 'https://placehold.co/280x180/7c3aed/ffffff?text=Evento',
  description: 'Invitacion a evento o lanzamiento en vivo',
  html: `${WRAPPER_OPEN}
<tr><td style="background:linear-gradient(135deg,#7c3aed 0%,#6d28d9 50%,#4f46e5 100%);padding:48px 32px;text-align:center;">
  <p style="margin:0 0 8px;font-size:12px;color:#c4b5fd;text-transform:uppercase;letter-spacing:3px;">Te invitamos</p>
  <h1 style="margin:0 0 16px;font-size:32px;font-weight:800;color:#ffffff;line-height:1.2;">Evento Exclusivo<br/>de Lanzamiento</h1>
  <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 24px;">
    <tr>
      <td style="padding:12px 20px;background:rgba(255,255,255,0.15);border-radius:8px;">
        <p style="margin:0;font-size:12px;color:#c4b5fd;">FECHA</p>
        <p style="margin:4px 0 0;font-size:16px;font-weight:700;color:#ffffff;">15 Abril, 2026</p>
      </td>
      <td style="width:12px;"></td>
      <td style="padding:12px 20px;background:rgba(255,255,255,0.15);border-radius:8px;">
        <p style="margin:0;font-size:12px;color:#c4b5fd;">HORA</p>
        <p style="margin:4px 0 0;font-size:16px;font-weight:700;color:#ffffff;">19:00 hrs</p>
      </td>
    </tr>
  </table>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 40px;background:#ffffff;color:#7c3aed;border-radius:6px;text-decoration:none;font-size:15px;font-weight:700;">Confirmar Asistencia</a>
</td></tr>
<tr><td style="padding:32px;text-align:center;">
  <p style="margin:0 0 8px;font-size:15px;color:#52525b;line-height:1.6;">Habra productos exclusivos, descuentos especiales y sorpresas.</p>
  <p style="margin:0;font-size:14px;color:#a1a1aa;">Cupos limitados. Reserva tu lugar.</p>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

// ── Black Friday ────────────────────────────────────────────────────────────

const blackFridayTemplate: EmailTemplate = {
  id: 'promo-02',
  name: 'Black Friday',
  category: 'promo',
  thumbnail: 'https://placehold.co/280x180/18181b/f59e0b?text=BLACK+FRIDAY',
  description: 'Mega venta Black Friday con multiples ofertas',
  html: `${WRAPPER_OPEN}
<tr><td style="background:#18181b;padding:48px 32px;text-align:center;">
  <p style="margin:0 0 8px;font-size:14px;color:#f59e0b;text-transform:uppercase;letter-spacing:4px;font-weight:700;">Solo hoy</p>
  <h1 style="margin:0 0 8px;font-size:48px;font-weight:900;color:#ffffff;letter-spacing:-1px;">BLACK FRIDAY</h1>
  <p style="margin:0 0 24px;font-size:20px;color:#f59e0b;font-weight:700;">Hasta 60% de descuento</p>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 40px;background:#f59e0b;color:#18181b;border-radius:6px;text-decoration:none;font-size:15px;font-weight:800;">COMPRAR AHORA</a>
</td></tr>
<tr><td style="padding:24px 32px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="width:33%;padding:8px;text-align:center;vertical-align:top;">
        <img src="https://placehold.co/160x160/f4f4f5/71717a?text=40%25+OFF" alt="" style="width:100%;border-radius:8px;" />
        <p style="margin:8px 0 2px;font-size:13px;font-weight:600;color:#18181b;">Categoria 1</p>
        <p style="margin:0;font-size:14px;font-weight:800;color:#dc2626;">-40%</p>
      </td>
      <td style="width:33%;padding:8px;text-align:center;vertical-align:top;">
        <img src="https://placehold.co/160x160/f4f4f5/71717a?text=50%25+OFF" alt="" style="width:100%;border-radius:8px;" />
        <p style="margin:8px 0 2px;font-size:13px;font-weight:600;color:#18181b;">Categoria 2</p>
        <p style="margin:0;font-size:14px;font-weight:800;color:#dc2626;">-50%</p>
      </td>
      <td style="width:33%;padding:8px;text-align:center;vertical-align:top;">
        <img src="https://placehold.co/160x160/f4f4f5/71717a?text=60%25+OFF" alt="" style="width:100%;border-radius:8px;" />
        <p style="margin:8px 0 2px;font-size:13px;font-weight:600;color:#18181b;">Categoria 3</p>
        <p style="margin:0;font-size:14px;font-weight:800;color:#dc2626;">-60%</p>
      </td>
    </tr>
  </table>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

// ── Export all ───────────────────────────────────────────────────────────────

export const emailTemplates: EmailTemplate[] = [
  welcomeTemplate,
  promoTemplate,
  blackFridayTemplate,
  newsletterTemplate,
  abandonedCartTemplate,
  productLaunchTemplate,
  seasonalTemplate,
  thankYouTemplate,
  thankYouRecommendationsTemplate,
  reviewRequestTemplate,
  surveyTemplate,
  restockTemplate,
  birthdayTemplate,
  loyaltyVIPTemplate,
  loyaltyPointsTemplate,
  referralTemplate,
  winbackTemplate,
  winbackUrgencyTemplate,
  announcementNewTemplate,
  announcementEventTemplate,
];

export function getTemplatesByCategory(category: string): EmailTemplate[] {
  return emailTemplates.filter(t => t.category === category);
}

export function getTemplateById(id: string): EmailTemplate | undefined {
  return emailTemplates.find(t => t.id === id);
}
