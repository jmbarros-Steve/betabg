/**
 * Professional pre-built email templates for Steve Mail.
 * Each template is a full HTML string ready for GrapeJS.
 */

export interface EmailTemplate {
  id: string;
  name: string;
  category: 'welcome' | 'promo' | 'newsletter' | 'abandoned_cart' | 'product_launch' | 'seasonal';
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
  <h1 style="margin:0 0 16px;font-size:26px;font-weight:700;color:#18181b;">¡Bienvenido/a, {{ nombre }}!</h1>
  <p style="margin:0 0 24px;font-size:16px;color:#52525b;line-height:1.6;max-width:460px;display:inline-block;">Nos alegra mucho que te hayas unido. Estamos listos para ayudarte a encontrar lo que buscas.</p>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 36px;background:#18181b;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">Explorar la Tienda</a>
</td></tr>
<tr><td style="padding:0 32px 32px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="width:33%;padding:12px;text-align:center;vertical-align:top;">
      <div style="font-size:28px;margin-bottom:8px;">🛍️</div>
      <p style="margin:0;font-size:13px;color:#52525b;font-weight:600;">Productos Exclusivos</p>
    </td>
    <td style="width:33%;padding:12px;text-align:center;vertical-align:top;">
      <div style="font-size:28px;margin-bottom:8px;">🚚</div>
      <p style="margin:0;font-size:13px;color:#52525b;font-weight:600;">Envio Rapido</p>
    </td>
    <td style="width:33%;padding:12px;text-align:center;vertical-align:top;">
      <div style="font-size:28px;margin-bottom:8px;">💬</div>
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
  <p style="margin:0 0 20px;font-size:16px;color:#fecaca;">En toda la tienda — ¡no te lo pierdas!</p>
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
      <h3 style="margin:0 0 8px;font-size:17px;color:#18181b;">📌 Articulo Destacado</h3>
      <p style="margin:0 0 12px;font-size:14px;color:#52525b;line-height:1.5;">Un resumen del articulo o noticia mas relevante para tus suscriptores.</p>
      <a href="#" style="font-size:14px;color:#2563eb;text-decoration:none;font-weight:600;">Leer mas →</a>
    </td></tr>
    <tr><td style="padding:20px 0;border-top:1px solid #e4e4e7;">
      <h3 style="margin:0 0 8px;font-size:17px;color:#18181b;">🆕 Novedades en la Tienda</h3>
      <p style="margin:0 0 12px;font-size:14px;color:#52525b;line-height:1.5;">Nuevos productos, colecciones, o actualizaciones que tus clientes necesitan saber.</p>
      <a href="#" style="font-size:14px;color:#2563eb;text-decoration:none;font-weight:600;">Ver productos →</a>
    </td></tr>
    <tr><td style="padding:20px 0;border-top:1px solid #e4e4e7;">
      <h3 style="margin:0 0 8px;font-size:17px;color:#18181b;">💡 Tip de la Semana</h3>
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
  <div style="font-size:48px;margin-bottom:16px;">🛒</div>
  <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#18181b;">¡Olvidaste algo!</h1>
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
  <p style="margin:0;font-size:13px;color:#a1a1aa;">¿Necesitas ayuda? Respondenos directamente a este email.</p>
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
      <div style="width:48px;height:48px;margin:0 auto 12px;background:#f0e4ff;border-radius:12px;line-height:48px;font-size:20px;">✨</div>
      <p style="margin:0;font-size:14px;color:#18181b;font-weight:600;">Premium</p>
      <p style="margin:4px 0 0;font-size:12px;color:#71717a;">Materiales de primera</p>
    </td>
    <td style="width:33%;padding:12px;text-align:center;vertical-align:top;">
      <div style="width:48px;height:48px;margin:0 auto 12px;background:#f0e4ff;border-radius:12px;line-height:48px;font-size:20px;">🔥</div>
      <p style="margin:0;font-size:14px;color:#18181b;font-weight:600;">Exclusivo</p>
      <p style="margin:4px 0 0;font-size:12px;color:#71717a;">Edicion limitada</p>
    </td>
    <td style="width:33%;padding:12px;text-align:center;vertical-align:top;">
      <div style="width:48px;height:48px;margin:0 auto 12px;background:#f0e4ff;border-radius:12px;line-height:48px;font-size:20px;">🚀</div>
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
      <p style="margin:0;font-size:14px;color:#059669;font-weight:700;">2x1 — $29.990</p>
    </td>
  </tr></table>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

// ── Export all ───────────────────────────────────────────────────────────────

export const emailTemplates: EmailTemplate[] = [
  welcomeTemplate,
  promoTemplate,
  newsletterTemplate,
  abandonedCartTemplate,
  productLaunchTemplate,
  seasonalTemplate,
];

export function getTemplatesByCategory(category: string): EmailTemplate[] {
  return emailTemplates.filter(t => t.category === category);
}

export function getTemplateById(id: string): EmailTemplate | undefined {
  return emailTemplates.find(t => t.id === id);
}
