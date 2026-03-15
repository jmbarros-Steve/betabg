/**
 * Professional pre-built email templates for Steve Mail.
 * Each template is a full HTML string ready for GrapeJS.
 * 55 templates across 11 categories.
 */

export interface EmailTemplate {
  id: string;
  name: string;
  category: 'welcome' | 'promo' | 'newsletter' | 'abandoned_cart' | 'product_launch' | 'seasonal' | 'win_back' | 'post_purchase' | 'review_request' | 'back_in_stock' | 'birthday';
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

// ── Welcome (5) ─────────────────────────────────────────────────────────────

const welcome01: EmailTemplate = {
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

const welcome02: EmailTemplate = {
  id: 'welcome-02',
  name: 'Bienvenida con Descuento',
  category: 'welcome',
  thumbnail: 'https://placehold.co/280x180/22c55e/ffffff?text=Bienvenida+%25',
  description: 'Bienvenida con codigo de descuento para primera compra',
  html: `${WRAPPER_OPEN}
<tr><td style="background-color:#18181b;padding:24px 32px;text-align:center;">
  <img src="https://placehold.co/140x42/18181b/fafafa?text=LOGO" alt="Logo" style="max-height:42px;" />
</td></tr>
<tr><td style="padding:40px 32px;text-align:center;">
  <h1 style="margin:0 0 12px;font-size:26px;font-weight:700;color:#18181b;">¡Hola, {{ nombre }}!</h1>
  <p style="margin:0 0 24px;font-size:16px;color:#52525b;line-height:1.6;">Bienvenido/a a nuestra comunidad. Para celebrar, te regalamos un descuento en tu primera compra.</p>
  <div style="display:inline-block;padding:20px 32px;background:#f0fdf4;border:2px dashed #22c55e;border-radius:12px;margin-bottom:24px;">
    <p style="margin:0 0 4px;font-size:12px;color:#16a34a;text-transform:uppercase;letter-spacing:1px;">Tu codigo de bienvenida</p>
    <p style="margin:0;font-size:28px;font-weight:800;color:#15803d;letter-spacing:3px;">WELCOME15</p>
    <p style="margin:6px 0 0;font-size:14px;color:#22c55e;font-weight:600;">15% de descuento</p>
  </div>
  <br/>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 36px;background:#22c55e;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">Usar Mi Descuento</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const welcome03: EmailTemplate = {
  id: 'welcome-03',
  name: 'Bienvenida VIP',
  category: 'welcome',
  thumbnail: 'https://placehold.co/280x180/18181b/d4af37?text=VIP',
  description: 'Bienvenida premium con tono exclusivo y lujoso',
  html: `${WRAPPER_OPEN}
<tr><td style="background:linear-gradient(135deg,#18181b 0%,#1c1917 100%);padding:48px 32px;text-align:center;border-bottom:3px solid #d4af37;">
  <img src="https://placehold.co/140x42/18181b/d4af37?text=LOGO" alt="Logo" style="max-height:42px;" />
</td></tr>
<tr><td style="padding:40px 32px;text-align:center;background:#fffbeb;">
  <p style="margin:0 0 8px;font-size:12px;color:#d4af37;text-transform:uppercase;letter-spacing:3px;font-weight:600;">Exclusivo</p>
  <h1 style="margin:0 0 16px;font-size:28px;font-weight:700;color:#18181b;">Bienvenido al Club VIP, {{ nombre }}</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6;max-width:440px;display:inline-block;">Has sido seleccionado para acceder a nuestra experiencia premium. Disfruta de beneficios exclusivos, acceso anticipado a colecciones y atencion personalizada.</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;"><tr>
    <td style="width:33%;padding:12px;text-align:center;vertical-align:top;">
      <p style="margin:0;font-size:24px;">👑</p>
      <p style="margin:4px 0 0;font-size:13px;color:#78716c;font-weight:600;">Acceso Anticipado</p>
    </td>
    <td style="width:33%;padding:12px;text-align:center;vertical-align:top;">
      <p style="margin:0;font-size:24px;">🎁</p>
      <p style="margin:4px 0 0;font-size:13px;color:#78716c;font-weight:600;">Regalos Exclusivos</p>
    </td>
    <td style="width:33%;padding:12px;text-align:center;vertical-align:top;">
      <p style="margin:0;font-size:24px;">✨</p>
      <p style="margin:4px 0 0;font-size:13px;color:#78716c;font-weight:600;">Envio Prioritario</p>
    </td>
  </tr></table>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 36px;background:#18181b;color:#d4af37;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;border:1px solid #d4af37;">Acceder al Club</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const welcome04: EmailTemplate = {
  id: 'welcome-04',
  name: 'Bienvenida Minimalista',
  category: 'welcome',
  thumbnail: 'https://placehold.co/280x180/fafafa/18181b?text=Minimal',
  description: 'Bienvenida limpia y enfocada en texto',
  html: `${WRAPPER_OPEN}
<tr><td style="padding:48px 40px;text-align:left;">
  <img src="https://placehold.co/100x30/ffffff/18181b?text=LOGO" alt="Logo" style="max-height:30px;margin-bottom:32px;" />
  <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#18181b;">Hola {{ nombre }},</h1>
  <p style="margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.7;">Gracias por unirte a nuestra comunidad. Estamos felices de tenerte aqui.</p>
  <p style="margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.7;">En nuestra tienda encontraras productos cuidadosamente seleccionados pensando en ti. Creemos en la calidad, la simplicidad y la buena experiencia.</p>
  <p style="margin:0 0 28px;font-size:15px;color:#52525b;line-height:1.7;">Si tienes alguna pregunta, simplemente responde a este email.</p>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:12px 28px;background:#18181b;color:#ffffff;border-radius:4px;text-decoration:none;font-size:14px;font-weight:600;">Visitar la Tienda</a>
  <p style="margin:24px 0 0;font-size:14px;color:#71717a;">— El equipo de {{ empresa }}</p>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const welcome05: EmailTemplate = {
  id: 'welcome-05',
  name: 'Bienvenida con Productos',
  category: 'welcome',
  thumbnail: 'https://placehold.co/280x180/22c55e/ffffff?text=Productos',
  description: 'Bienvenida que muestra productos destacados',
  html: `${WRAPPER_OPEN}
<tr><td style="background-color:#18181b;padding:24px 32px;text-align:center;">
  <img src="https://placehold.co/140x42/18181b/fafafa?text=LOGO" alt="Logo" style="max-height:42px;" />
</td></tr>
<tr><td style="padding:36px 32px 20px;text-align:center;">
  <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#18181b;">¡Bienvenido/a, {{ nombre }}!</h1>
  <p style="margin:0 0 4px;font-size:15px;color:#52525b;line-height:1.6;">Mira lo que tenemos preparado para ti:</p>
</td></tr>
<tr><td style="padding:0 24px 12px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="width:33%;padding:8px;text-align:center;vertical-align:top;">
      <img src="https://placehold.co/160x160/f4f4f5/52525b?text=Prod+1" alt="" style="width:100%;border-radius:8px;" />
      <p style="margin:8px 0 2px;font-size:13px;font-weight:600;color:#18181b;">Bestseller</p>
      <p style="margin:0;font-size:13px;color:#22c55e;font-weight:700;">$24.990</p>
    </td>
    <td style="width:33%;padding:8px;text-align:center;vertical-align:top;">
      <img src="https://placehold.co/160x160/f4f4f5/52525b?text=Prod+2" alt="" style="width:100%;border-radius:8px;" />
      <p style="margin:8px 0 2px;font-size:13px;font-weight:600;color:#18181b;">Nuevo</p>
      <p style="margin:0;font-size:13px;color:#22c55e;font-weight:700;">$19.990</p>
    </td>
    <td style="width:33%;padding:8px;text-align:center;vertical-align:top;">
      <img src="https://placehold.co/160x160/f4f4f5/52525b?text=Prod+3" alt="" style="width:100%;border-radius:8px;" />
      <p style="margin:8px 0 2px;font-size:13px;font-weight:600;color:#18181b;">Popular</p>
      <p style="margin:0;font-size:13px;color:#22c55e;font-weight:700;">$34.990</p>
    </td>
  </tr></table>
</td></tr>
<tr><td style="padding:16px 32px 32px;text-align:center;">
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 36px;background:#22c55e;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">Ver Toda la Tienda</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

// ── Abandoned Cart (5) ──────────────────────────────────────────────────────

const abandonedCart01: EmailTemplate = {
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

const abandonedCart02: EmailTemplate = {
  id: 'abandoned-cart-02',
  name: 'Carrito Urgente',
  category: 'abandoned_cart',
  thumbnail: 'https://placehold.co/280x180/ea580c/ffffff?text=Urgente',
  description: 'Recuperacion con urgencia — stock agotandose',
  html: `${WRAPPER_OPEN}
<tr><td style="background:#ea580c;padding:12px 32px;text-align:center;">
  <p style="margin:0;font-size:13px;color:#ffffff;font-weight:700;letter-spacing:1px;">⚠️ STOCK LIMITADO — TUS PRODUCTOS SE ESTAN AGOTANDO</p>
</td></tr>
<tr><td style="background-color:#18181b;padding:20px 32px;text-align:center;">
  <img src="https://placehold.co/120x36/18181b/fafafa?text=LOGO" alt="Logo" style="max-height:36px;" />
</td></tr>
<tr><td style="padding:36px 32px;text-align:center;">
  <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#18181b;">{{ nombre }}, ¡tu carrito te espera!</h1>
  <p style="margin:0 0 20px;font-size:15px;color:#52525b;line-height:1.6;">Quedan pocas unidades de lo que elegiste. No dejes que otro se lo lleve.</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:2px solid #ea580c;border-radius:8px;margin-bottom:20px;">
    <tr>
      <td style="padding:16px;width:80px;"><img src="https://placehold.co/80x80/fff7ed/ea580c?text=!" alt="" style="width:80px;border-radius:6px;" /></td>
      <td style="padding:16px;">
        <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#18181b;">Tu Producto</p>
        <p style="margin:0;font-size:13px;color:#ea580c;font-weight:600;">Solo quedan 3 unidades</p>
      </td>
      <td style="padding:16px;text-align:right;"><p style="margin:0;font-size:16px;font-weight:700;color:#18181b;">$29.990</p></td>
    </tr>
  </table>
  <a href="{{ checkout_url }}" style="display:inline-block;padding:14px 40px;background:#ea580c;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:700;">Asegurar Mi Compra</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const abandonedCart03: EmailTemplate = {
  id: 'abandoned-cart-03',
  name: 'Carrito con Descuento',
  category: 'abandoned_cart',
  thumbnail: 'https://placehold.co/280x180/f59e0b/18181b?text=Carrito+%25',
  description: 'Recuperacion de carrito con incentivo de descuento',
  html: `${WRAPPER_OPEN}
<tr><td style="background-color:#18181b;padding:20px 32px;text-align:center;">
  <img src="https://placehold.co/120x36/18181b/fafafa?text=LOGO" alt="Logo" style="max-height:36px;" />
</td></tr>
<tr><td style="padding:36px 32px;text-align:center;">
  <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#18181b;">¿Todavia lo estas pensando?</h1>
  <p style="margin:0 0 20px;font-size:15px;color:#52525b;line-height:1.6;">Hola {{ nombre }}, te damos un empujoncito con un descuento especial.</p>
  <div style="display:inline-block;padding:16px 28px;background:#fffbeb;border:2px dashed #f59e0b;border-radius:10px;margin-bottom:24px;">
    <p style="margin:0 0 4px;font-size:11px;color:#b45309;text-transform:uppercase;letter-spacing:1px;">Descuento exclusivo</p>
    <p style="margin:0;font-size:28px;font-weight:800;color:#d97706;letter-spacing:2px;">CART10</p>
    <p style="margin:4px 0 0;font-size:13px;color:#f59e0b;">10% extra en tu carrito</p>
  </div>
</td></tr>
<tr><td style="padding:0 32px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e4e4e7;border-radius:8px;">
    <tr>
      <td style="padding:16px;width:80px;"><img src="https://placehold.co/80x80/f4f4f5/71717a?text=P1" alt="" style="width:80px;border-radius:6px;" /></td>
      <td style="padding:16px;"><p style="margin:0;font-size:15px;font-weight:600;color:#18181b;">Tu Producto</p></td>
      <td style="padding:16px;text-align:right;">
        <p style="margin:0;font-size:13px;color:#a1a1aa;text-decoration:line-through;">$29.990</p>
        <p style="margin:2px 0 0;font-size:16px;font-weight:700;color:#d97706;">$26.991</p>
      </td>
    </tr>
  </table>
</td></tr>
<tr><td style="padding:24px 32px 32px;text-align:center;">
  <a href="{{ checkout_url }}" style="display:inline-block;padding:14px 40px;background:#f59e0b;color:#18181b;border-radius:6px;text-decoration:none;font-size:15px;font-weight:700;">Comprar con Descuento</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const abandonedCart04: EmailTemplate = {
  id: 'abandoned-cart-04',
  name: 'Carrito Simple',
  category: 'abandoned_cart',
  thumbnail: 'https://placehold.co/280x180/fafafa/f59e0b?text=Simple',
  description: 'Recordatorio minimalista de carrito abandonado',
  html: `${WRAPPER_OPEN}
<tr><td style="padding:48px 40px;text-align:left;">
  <img src="https://placehold.co/100x30/ffffff/18181b?text=LOGO" alt="Logo" style="max-height:30px;margin-bottom:32px;" />
  <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#18181b;">Hola {{ nombre }},</h1>
  <p style="margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.7;">Notamos que dejaste algo en tu carrito. ¿Te gustaria completar tu compra?</p>
  <p style="margin:0 0 28px;font-size:15px;color:#52525b;line-height:1.7;">Tu carrito sigue guardado y listo para ti.</p>
  <a href="{{ checkout_url }}" style="display:inline-block;padding:12px 28px;background:#f59e0b;color:#18181b;border-radius:4px;text-decoration:none;font-size:14px;font-weight:700;">Ir a Mi Carrito</a>
  <p style="margin:24px 0 0;font-size:13px;color:#a1a1aa;">Si tienes preguntas, responde a este email.</p>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const abandonedCart05: EmailTemplate = {
  id: 'abandoned-cart-05',
  name: 'Carrito con Recomendaciones',
  category: 'abandoned_cart',
  thumbnail: 'https://placehold.co/280x180/f59e0b/ffffff?text=Recomendados',
  description: 'Carrito abandonado con productos relacionados',
  html: `${WRAPPER_OPEN}
<tr><td style="background-color:#18181b;padding:20px 32px;text-align:center;">
  <img src="https://placehold.co/120x36/18181b/fafafa?text=LOGO" alt="Logo" style="max-height:36px;" />
</td></tr>
<tr><td style="padding:32px;text-align:center;">
  <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#18181b;">Tu carrito te esta esperando</h1>
  <p style="margin:0 0 20px;font-size:15px;color:#52525b;">Hola {{ nombre }}, aqui esta lo que dejaste:</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e4e4e7;border-radius:8px;margin-bottom:12px;">
    <tr>
      <td style="padding:12px;width:60px;"><img src="https://placehold.co/60x60/f4f4f5/71717a?text=P1" alt="" style="width:60px;border-radius:6px;" /></td>
      <td style="padding:12px;"><p style="margin:0;font-size:14px;font-weight:600;color:#18181b;">Producto en Carrito</p></td>
      <td style="padding:12px;text-align:right;"><p style="margin:0;font-size:15px;font-weight:700;color:#18181b;">$29.990</p></td>
    </tr>
  </table>
  <a href="{{ checkout_url }}" style="display:inline-block;padding:14px 36px;background:#f59e0b;color:#18181b;border-radius:6px;text-decoration:none;font-size:15px;font-weight:700;margin-bottom:8px;">Completar Compra</a>
</td></tr>
<tr><td style="padding:0 32px 32px;">
  <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#18181b;text-align:center;">Tambien te podria gustar</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="width:33%;padding:6px;text-align:center;vertical-align:top;">
      <img src="https://placehold.co/140x140/f4f4f5/71717a?text=Rec+1" alt="" style="width:100%;border-radius:6px;" />
      <p style="margin:6px 0 0;font-size:12px;font-weight:600;color:#18181b;">Recomendado 1</p>
      <p style="margin:2px 0 0;font-size:12px;color:#f59e0b;font-weight:700;">$19.990</p>
    </td>
    <td style="width:33%;padding:6px;text-align:center;vertical-align:top;">
      <img src="https://placehold.co/140x140/f4f4f5/71717a?text=Rec+2" alt="" style="width:100%;border-radius:6px;" />
      <p style="margin:6px 0 0;font-size:12px;font-weight:600;color:#18181b;">Recomendado 2</p>
      <p style="margin:2px 0 0;font-size:12px;color:#f59e0b;font-weight:700;">$24.990</p>
    </td>
    <td style="width:33%;padding:6px;text-align:center;vertical-align:top;">
      <img src="https://placehold.co/140x140/f4f4f5/71717a?text=Rec+3" alt="" style="width:100%;border-radius:6px;" />
      <p style="margin:6px 0 0;font-size:12px;font-weight:600;color:#18181b;">Recomendado 3</p>
      <p style="margin:2px 0 0;font-size:12px;color:#f59e0b;font-weight:700;">$14.990</p>
    </td>
  </tr></table>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

// ── Promo (5) ───────────────────────────────────────────────────────────────

const promo01: EmailTemplate = {
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

const promo02: EmailTemplate = {
  id: 'promo-02',
  name: 'Descuento Exclusivo VIP',
  category: 'promo',
  thumbnail: 'https://placehold.co/280x180/e11d48/ffffff?text=VIP+%25',
  description: 'Promocion exclusiva para clientes VIP',
  html: `${WRAPPER_OPEN}
<tr><td style="background:linear-gradient(135deg,#e11d48 0%,#be123c 100%);padding:12px 32px;text-align:center;">
  <p style="margin:0;font-size:11px;color:#fecdd3;letter-spacing:2px;text-transform:uppercase;">Acceso exclusivo para miembros</p>
</td></tr>
<tr><td style="background-color:#18181b;padding:36px 32px;text-align:center;">
  <p style="margin:0 0 8px;font-size:12px;color:#fda4af;letter-spacing:2px;text-transform:uppercase;">Solo para ti</p>
  <h1 style="margin:0 0 12px;font-size:36px;font-weight:800;color:#ffffff;">25% Descuento VIP</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#a1a1aa;">Hola {{ nombre }}, por ser parte de nuestros clientes mas fieles.</p>
  <div style="display:inline-block;padding:14px 28px;background:#e11d48;border-radius:8px;margin-bottom:20px;">
    <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:3px;">VIP25</p>
  </div><br/>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 36px;background:#ffffff;color:#e11d48;border-radius:6px;text-decoration:none;font-size:15px;font-weight:700;">Comprar Ahora</a>
</td></tr>
<tr><td style="padding:32px;text-align:center;">
  <p style="margin:0;font-size:13px;color:#71717a;">Valido por 48 horas. No acumulable con otras promociones.</p>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const promo03: EmailTemplate = {
  id: 'promo-03',
  name: 'Liquidacion',
  category: 'promo',
  thumbnail: 'https://placehold.co/280x180/dc2626/ffffff?text=SALE',
  description: 'Gran liquidacion con multiples categorias',
  html: `${WRAPPER_OPEN}
<tr><td style="background:#dc2626;padding:40px 32px;text-align:center;">
  <h1 style="margin:0 0 8px;font-size:42px;font-weight:900;color:#ffffff;letter-spacing:2px;">LIQUIDACION</h1>
  <p style="margin:0 0 4px;font-size:20px;color:#fecaca;font-weight:700;">Hasta 60% de descuento</p>
  <p style="margin:0;font-size:14px;color:#fca5a5;">Solo hasta agotar stock</p>
</td></tr>
<tr><td style="padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="width:33%;padding:8px;text-align:center;vertical-align:top;">
      <img src="https://placehold.co/160x160/fef2f2/dc2626?text=-40%25" alt="" style="width:100%;border-radius:8px;" />
      <p style="margin:8px 0 0;font-size:13px;font-weight:600;color:#18181b;">Ropa</p>
    </td>
    <td style="width:33%;padding:8px;text-align:center;vertical-align:top;">
      <img src="https://placehold.co/160x160/fef2f2/dc2626?text=-50%25" alt="" style="width:100%;border-radius:8px;" />
      <p style="margin:8px 0 0;font-size:13px;font-weight:600;color:#18181b;">Accesorios</p>
    </td>
    <td style="width:33%;padding:8px;text-align:center;vertical-align:top;">
      <img src="https://placehold.co/160x160/fef2f2/dc2626?text=-60%25" alt="" style="width:100%;border-radius:8px;" />
      <p style="margin:8px 0 0;font-size:13px;font-weight:600;color:#18181b;">Hogar</p>
    </td>
  </tr></table>
</td></tr>
<tr><td style="padding:8px 32px 32px;text-align:center;">
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 40px;background:#dc2626;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:700;">Ver Liquidacion</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const promo04: EmailTemplate = {
  id: 'promo-04',
  name: 'Compra 2 Lleva 3',
  category: 'promo',
  thumbnail: 'https://placehold.co/280x180/e11d48/ffffff?text=2x3',
  description: 'Promocion de bundle — compra 2 y lleva 3',
  html: `${WRAPPER_OPEN}
<tr><td style="background-color:#18181b;padding:20px 32px;text-align:center;">
  <img src="https://placehold.co/120x36/18181b/fafafa?text=LOGO" alt="Logo" style="max-height:36px;" />
</td></tr>
<tr><td style="padding:40px 32px;text-align:center;">
  <div style="display:inline-block;width:120px;height:120px;background:#fef2f2;border-radius:50%;line-height:120px;margin-bottom:16px;">
    <span style="font-size:36px;font-weight:900;color:#e11d48;">2×3</span>
  </div>
  <h1 style="margin:0 0 12px;font-size:26px;font-weight:700;color:#18181b;">Compra 2, Lleva 3</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6;">Hola {{ nombre }}, el tercer producto corre por nuestra cuenta. Aplica en toda la tienda.</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;"><tr>
    <td style="width:33%;padding:8px;text-align:center;"><img src="https://placehold.co/140x140/f4f4f5/71717a?text=1" alt="" style="width:100%;border-radius:8px;" /></td>
    <td style="width:33%;padding:8px;text-align:center;"><img src="https://placehold.co/140x140/f4f4f5/71717a?text=2" alt="" style="width:100%;border-radius:8px;" /></td>
    <td style="width:33%;padding:8px;text-align:center;"><img src="https://placehold.co/140x140/fef2f2/e11d48?text=GRATIS" alt="" style="width:100%;border-radius:8px;border:2px solid #e11d48;" /></td>
  </tr></table>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 36px;background:#e11d48;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">Aprovechar Oferta</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const promo05: EmailTemplate = {
  id: 'promo-05',
  name: 'Cuenta Regresiva',
  category: 'promo',
  thumbnail: 'https://placehold.co/280x180/dc2626/ffffff?text=TIMER',
  description: 'Promocion con cuenta regresiva para generar urgencia',
  html: `${WRAPPER_OPEN}
<tr><td style="background:#18181b;padding:36px 32px;text-align:center;">
  <img src="https://placehold.co/120x36/18181b/fafafa?text=LOGO" alt="Logo" style="max-height:36px;margin-bottom:20px;" />
  <p style="margin:0 0 8px;font-size:12px;color:#fca5a5;text-transform:uppercase;letter-spacing:2px;">Oferta termina en</p>
  <table cellpadding="0" cellspacing="0" border="0" align="center"><tr>
    <td style="padding:0 6px;text-align:center;">
      <div style="background:#dc2626;border-radius:8px;padding:12px 16px;min-width:50px;"><p style="margin:0;font-size:28px;font-weight:800;color:#fff;">24</p></div>
      <p style="margin:4px 0 0;font-size:10px;color:#a1a1aa;">HORAS</p>
    </td>
    <td style="color:#dc2626;font-size:24px;font-weight:700;">:</td>
    <td style="padding:0 6px;text-align:center;">
      <div style="background:#dc2626;border-radius:8px;padding:12px 16px;min-width:50px;"><p style="margin:0;font-size:28px;font-weight:800;color:#fff;">00</p></div>
      <p style="margin:4px 0 0;font-size:10px;color:#a1a1aa;">MIN</p>
    </td>
    <td style="color:#dc2626;font-size:24px;font-weight:700;">:</td>
    <td style="padding:0 6px;text-align:center;">
      <div style="background:#dc2626;border-radius:8px;padding:12px 16px;min-width:50px;"><p style="margin:0;font-size:28px;font-weight:800;color:#fff;">00</p></div>
      <p style="margin:4px 0 0;font-size:10px;color:#a1a1aa;">SEG</p>
    </td>
  </tr></table>
</td></tr>
<tr><td style="padding:32px;text-align:center;">
  <h1 style="margin:0 0 12px;font-size:28px;font-weight:800;color:#18181b;">40% de Descuento</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;">{{ nombre }}, esta oferta no se repite. Usa el codigo antes de que expire.</p>
  <div style="display:inline-block;padding:12px 24px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;margin-bottom:20px;">
    <p style="margin:0;font-size:20px;font-weight:700;color:#dc2626;letter-spacing:3px;">TIMER40</p>
  </div><br/>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 40px;background:#dc2626;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:700;">Comprar Ahora</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

// ── Newsletter (5) ──────────────────────────────────────────────────────────

const newsletter01: EmailTemplate = {
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
<tr><td style="padding:0;"><img src="https://placehold.co/600x280/e4e4e7/71717a?text=Imagen+Destacada" alt="" style="width:100%;display:block;" /></td></tr>
<tr><td style="padding:32px;">
  <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#18181b;">Tu resumen semanal</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6;">Hola {{ nombre }}, aqui tienes las novedades mas importantes de esta semana.</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e4e4e7;">
    <tr><td style="padding:20px 0;">
      <h3 style="margin:0 0 8px;font-size:17px;color:#18181b;">Articulo Destacado</h3>
      <p style="margin:0 0 12px;font-size:14px;color:#52525b;line-height:1.5;">Un resumen del articulo o noticia mas relevante para tus suscriptores.</p>
      <a href="#" style="font-size:14px;color:#2563eb;text-decoration:none;font-weight:600;">Leer mas →</a>
    </td></tr>
    <tr><td style="padding:20px 0;border-top:1px solid #e4e4e7;">
      <h3 style="margin:0 0 8px;font-size:17px;color:#18181b;">Novedades en la Tienda</h3>
      <p style="margin:0 0 12px;font-size:14px;color:#52525b;line-height:1.5;">Nuevos productos, colecciones, o actualizaciones importantes.</p>
      <a href="#" style="font-size:14px;color:#2563eb;text-decoration:none;font-weight:600;">Ver productos →</a>
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

const newsletter02: EmailTemplate = {
  id: 'newsletter-02',
  name: 'Newsletter con Productos',
  category: 'newsletter',
  thumbnail: 'https://placehold.co/280x180/3b82f6/ffffff?text=Productos',
  description: 'Newsletter enfocado en mostrar productos nuevos',
  html: `${WRAPPER_OPEN}
<tr><td style="background-color:#2563eb;padding:24px 32px;text-align:center;">
  <img src="https://placehold.co/120x36/2563eb/ffffff?text=LOGO" alt="Logo" style="max-height:36px;" />
</td></tr>
<tr><td style="padding:32px;text-align:center;">
  <p style="margin:0 0 4px;font-size:12px;color:#2563eb;text-transform:uppercase;letter-spacing:2px;">Novedades</p>
  <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#18181b;">Lo Nuevo de la Semana</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;">Hola {{ nombre }}, mira lo que acaba de llegar.</p>
</td></tr>
<tr><td style="padding:0 24px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="width:50%;padding:8px;text-align:center;vertical-align:top;">
        <img src="https://placehold.co/240x240/eff6ff/2563eb?text=Nuevo+1" alt="" style="width:100%;border-radius:8px;" />
        <p style="margin:8px 0 2px;font-size:14px;font-weight:600;color:#18181b;">Producto Nuevo</p>
        <p style="margin:0;font-size:14px;color:#2563eb;font-weight:700;">$34.990</p>
      </td>
      <td style="width:50%;padding:8px;text-align:center;vertical-align:top;">
        <img src="https://placehold.co/240x240/eff6ff/2563eb?text=Nuevo+2" alt="" style="width:100%;border-radius:8px;" />
        <p style="margin:8px 0 2px;font-size:14px;font-weight:600;color:#18181b;">Recien Llegado</p>
        <p style="margin:0;font-size:14px;color:#2563eb;font-weight:700;">$29.990</p>
      </td>
    </tr>
    <tr>
      <td style="width:50%;padding:8px;text-align:center;vertical-align:top;">
        <img src="https://placehold.co/240x240/eff6ff/2563eb?text=Nuevo+3" alt="" style="width:100%;border-radius:8px;" />
        <p style="margin:8px 0 2px;font-size:14px;font-weight:600;color:#18181b;">Tendencia</p>
        <p style="margin:0;font-size:14px;color:#2563eb;font-weight:700;">$44.990</p>
      </td>
      <td style="width:50%;padding:8px;text-align:center;vertical-align:top;">
        <img src="https://placehold.co/240x240/eff6ff/2563eb?text=Nuevo+4" alt="" style="width:100%;border-radius:8px;" />
        <p style="margin:8px 0 2px;font-size:14px;font-weight:600;color:#18181b;">Exclusivo</p>
        <p style="margin:0;font-size:14px;color:#2563eb;font-weight:700;">$39.990</p>
      </td>
    </tr>
  </table>
</td></tr>
<tr><td style="padding:24px 32px 32px;text-align:center;">
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 36px;background:#2563eb;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">Ver Todo lo Nuevo</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const newsletter03: EmailTemplate = {
  id: 'newsletter-03',
  name: 'Newsletter Editorial',
  category: 'newsletter',
  thumbnail: 'https://placehold.co/280x180/1e3a5f/ffffff?text=Editorial',
  description: 'Newsletter de contenido editorial y blog',
  html: `${WRAPPER_OPEN}
<tr><td style="padding:32px 32px 0;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td><img src="https://placehold.co/100x30/ffffff/18181b?text=BLOG" alt="Logo" style="max-height:30px;" /></td>
    <td align="right" style="font-size:12px;color:#a1a1aa;">{{ fecha }}</td>
  </tr></table>
</td></tr>
<tr><td style="padding:24px 32px;">
  <hr style="border:none;border-top:2px solid #2563eb;width:40px;margin:0 0 24px;" />
  <h1 style="margin:0 0 16px;font-size:28px;font-weight:700;color:#18181b;line-height:1.3;">El Titulo de Tu Articulo Principal Va Aqui</h1>
  <p style="margin:0 0 20px;font-size:15px;color:#52525b;line-height:1.7;">Hola {{ nombre }}, esta semana exploramos las tendencias que estan definiendo la industria y compartimos consejos practicos para tu negocio.</p>
  <img src="https://placehold.co/536x300/e4e4e7/71717a?text=Imagen+Editorial" alt="" style="width:100%;border-radius:8px;margin-bottom:20px;" />
  <p style="margin:0 0 20px;font-size:15px;color:#52525b;line-height:1.7;">Un extracto del articulo que enganche al lector y lo motive a seguir leyendo en tu sitio web. Puede incluir datos relevantes o una pregunta provocativa.</p>
  <a href="#" style="font-size:15px;color:#2563eb;text-decoration:none;font-weight:600;">Continuar leyendo →</a>
</td></tr>
<tr><td style="padding:0 32px 32px;">
  <hr style="border:none;border-top:1px solid #e4e4e7;margin:0 0 24px;" />
  <h3 style="margin:0 0 16px;font-size:16px;color:#18181b;">Mas Articulos</h3>
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:8px 0;"><a href="#" style="font-size:14px;color:#2563eb;text-decoration:none;font-weight:600;">Articulo secundario numero uno →</a></td></tr>
    <tr><td style="padding:8px 0;border-top:1px solid #f4f4f5;"><a href="#" style="font-size:14px;color:#2563eb;text-decoration:none;font-weight:600;">Articulo secundario numero dos →</a></td></tr>
    <tr><td style="padding:8px 0;border-top:1px solid #f4f4f5;"><a href="#" style="font-size:14px;color:#2563eb;text-decoration:none;font-weight:600;">Articulo secundario numero tres →</a></td></tr>
  </table>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const newsletter04: EmailTemplate = {
  id: 'newsletter-04',
  name: 'Newsletter Curado',
  category: 'newsletter',
  thumbnail: 'https://placehold.co/280x180/2563eb/ffffff?text=Curado',
  description: 'Newsletter con links curados y recomendaciones',
  html: `${WRAPPER_OPEN}
<tr><td style="background:#2563eb;padding:24px 32px;text-align:center;">
  <h1 style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">Seleccion Semanal</h1>
  <p style="margin:4px 0 0;font-size:13px;color:#bfdbfe;">{{ fecha }}</p>
</td></tr>
<tr><td style="padding:32px;">
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;">Hola {{ nombre }}, aqui va nuestra seleccion curada de la semana.</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:16px;background:#eff6ff;border-radius:8px;margin-bottom:12px;">
      <p style="margin:0 0 4px;font-size:11px;color:#2563eb;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Lectura #1</p>
      <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#18181b;">Titulo del primer recurso curado</p>
      <p style="margin:0 0 8px;font-size:13px;color:#52525b;line-height:1.5;">Breve descripcion de por que este recurso es relevante para tu audiencia.</p>
      <a href="#" style="font-size:13px;color:#2563eb;font-weight:600;text-decoration:none;">Leer →</a>
    </td></tr>
    <tr><td style="height:12px;"></td></tr>
    <tr><td style="padding:16px;background:#f4f4f5;border-radius:8px;">
      <p style="margin:0 0 4px;font-size:11px;color:#2563eb;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Lectura #2</p>
      <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#18181b;">Titulo del segundo recurso curado</p>
      <p style="margin:0 0 8px;font-size:13px;color:#52525b;line-height:1.5;">Otra recomendacion cuidadosamente seleccionada para tu comunidad.</p>
      <a href="#" style="font-size:13px;color:#2563eb;font-weight:600;text-decoration:none;">Leer →</a>
    </td></tr>
    <tr><td style="height:12px;"></td></tr>
    <tr><td style="padding:16px;background:#eff6ff;border-radius:8px;">
      <p style="margin:0 0 4px;font-size:11px;color:#2563eb;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Lectura #3</p>
      <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#18181b;">Titulo del tercer recurso curado</p>
      <p style="margin:0 0 8px;font-size:13px;color:#52525b;line-height:1.5;">Un tercer enlace interesante que complementa los anteriores.</p>
      <a href="#" style="font-size:13px;color:#2563eb;font-weight:600;text-decoration:none;">Leer →</a>
    </td></tr>
  </table>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const newsletter05: EmailTemplate = {
  id: 'newsletter-05',
  name: 'Newsletter con Video',
  category: 'newsletter',
  thumbnail: 'https://placehold.co/280x180/3b82f6/ffffff?text=Video',
  description: 'Newsletter centrado en contenido de video',
  html: `${WRAPPER_OPEN}
<tr><td style="background-color:#18181b;padding:20px 32px;text-align:center;">
  <img src="https://placehold.co/120x36/18181b/fafafa?text=LOGO" alt="Logo" style="max-height:36px;" />
</td></tr>
<tr><td style="padding:32px;text-align:center;">
  <p style="margin:0 0 4px;font-size:12px;color:#3b82f6;text-transform:uppercase;letter-spacing:2px;">Nuevo video</p>
  <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#18181b;">¡Mira Nuestro Ultimo Video!</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6;">Hola {{ nombre }}, preparamos contenido nuevo que no te puedes perder.</p>
</td></tr>
<tr><td style="padding:0 32px;">
  <a href="#" style="display:block;position:relative;text-decoration:none;">
    <img src="https://placehold.co/536x300/18181b/ffffff?text=▶+Video+Thumbnail" alt="Video" style="width:100%;border-radius:8px;display:block;" />
  </a>
</td></tr>
<tr><td style="padding:24px 32px;">
  <h2 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#18181b;">Titulo del Video</h2>
  <p style="margin:0 0 20px;font-size:14px;color:#52525b;line-height:1.6;">Una descripcion breve de lo que encontraran en este video y por que deberian verlo.</p>
  <a href="#" style="display:inline-block;padding:12px 28px;background:#3b82f6;color:#ffffff;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">Ver Video</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

// ── Win-back (5) ────────────────────────────────────────────────────────────

const winBack01: EmailTemplate = {
  id: 'win-back-01',
  name: 'Te Extrañamos',
  category: 'win_back',
  thumbnail: 'https://placehold.co/280x180/8b5cf6/ffffff?text=Te+Extra%C3%B1amos',
  description: 'Re-engagement clasico para clientes inactivos',
  html: `${WRAPPER_OPEN}
<tr><td style="background:linear-gradient(135deg,#8b5cf6 0%,#6d28d9 100%);padding:40px 32px;text-align:center;">
  <img src="https://placehold.co/120x36/8b5cf6/ffffff?text=LOGO" alt="Logo" style="max-height:36px;margin-bottom:20px;" />
  <h1 style="margin:0 0 12px;font-size:28px;font-weight:700;color:#ffffff;">Te Extrañamos, {{ nombre }}</h1>
  <p style="margin:0;font-size:15px;color:#ddd6fe;line-height:1.6;">Hace tiempo que no nos visitas y queremos saber como estas.</p>
</td></tr>
<tr><td style="padding:32px;text-align:center;">
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6;">Hemos estado trabajando en cosas nuevas que creemos te van a encantar. ¿Nos das otra oportunidad?</p>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 36px;background:#8b5cf6;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">Volver a la Tienda</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const winBack02: EmailTemplate = {
  id: 'win-back-02',
  name: 'Te Extrañamos con Descuento',
  category: 'win_back',
  thumbnail: 'https://placehold.co/280x180/6366f1/ffffff?text=Descuento',
  description: 'Win-back con incentivo de descuento',
  html: `${WRAPPER_OPEN}
<tr><td style="background:#6366f1;padding:36px 32px;text-align:center;">
  <img src="https://placehold.co/120x36/6366f1/ffffff?text=LOGO" alt="Logo" style="max-height:36px;margin-bottom:16px;" />
  <h1 style="margin:0 0 8px;font-size:26px;font-weight:700;color:#ffffff;">¡Vuelve, {{ nombre }}!</h1>
  <p style="margin:0;font-size:15px;color:#c7d2fe;">Te tenemos un regalo especial.</p>
</td></tr>
<tr><td style="padding:32px;text-align:center;">
  <div style="display:inline-block;padding:20px 32px;background:#eef2ff;border:2px dashed #6366f1;border-radius:12px;margin-bottom:24px;">
    <p style="margin:0 0 4px;font-size:11px;color:#4f46e5;text-transform:uppercase;letter-spacing:1px;">Tu codigo especial</p>
    <p style="margin:0;font-size:28px;font-weight:800;color:#6366f1;letter-spacing:3px;">VUELVE20</p>
    <p style="margin:6px 0 0;font-size:14px;color:#818cf8;">20% de descuento en tu proxima compra</p>
  </div>
  <p style="margin:0 0 24px;font-size:14px;color:#52525b;">Valido por 7 dias. Solo para ti.</p>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 36px;background:#6366f1;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">Usar Mi Descuento</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const winBack03: EmailTemplate = {
  id: 'win-back-03',
  name: 'Novedades desde tu Ultima Visita',
  category: 'win_back',
  thumbnail: 'https://placehold.co/280x180/8b5cf6/ffffff?text=Novedades',
  description: 'Muestra lo nuevo desde la ultima visita del cliente',
  html: `${WRAPPER_OPEN}
<tr><td style="background-color:#18181b;padding:20px 32px;text-align:center;">
  <img src="https://placehold.co/120x36/18181b/fafafa?text=LOGO" alt="Logo" style="max-height:36px;" />
</td></tr>
<tr><td style="padding:32px;text-align:center;">
  <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#18181b;">Mira lo Que Te Has Perdido</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;">Hola {{ nombre }}, desde tu ultima visita hemos sumado muchas novedades.</p>
</td></tr>
<tr><td style="padding:0 24px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="width:33%;padding:8px;text-align:center;vertical-align:top;">
      <img src="https://placehold.co/160x160/f5f3ff/8b5cf6?text=Nuevo" alt="" style="width:100%;border-radius:8px;" />
      <p style="margin:8px 0 0;font-size:13px;font-weight:600;color:#18181b;">Novedad 1</p>
    </td>
    <td style="width:33%;padding:8px;text-align:center;vertical-align:top;">
      <img src="https://placehold.co/160x160/f5f3ff/8b5cf6?text=Nuevo" alt="" style="width:100%;border-radius:8px;" />
      <p style="margin:8px 0 0;font-size:13px;font-weight:600;color:#18181b;">Novedad 2</p>
    </td>
    <td style="width:33%;padding:8px;text-align:center;vertical-align:top;">
      <img src="https://placehold.co/160x160/f5f3ff/8b5cf6?text=Nuevo" alt="" style="width:100%;border-radius:8px;" />
      <p style="margin:8px 0 0;font-size:13px;font-weight:600;color:#18181b;">Novedad 3</p>
    </td>
  </tr></table>
</td></tr>
<tr><td style="padding:24px 32px 32px;text-align:center;">
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 36px;background:#8b5cf6;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">Explorar Novedades</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const winBack04: EmailTemplate = {
  id: 'win-back-04',
  name: 'Feedback',
  category: 'win_back',
  thumbnail: 'https://placehold.co/280x180/6366f1/ffffff?text=Feedback',
  description: 'Pregunta al cliente por que dejo de visitarnos',
  html: `${WRAPPER_OPEN}
<tr><td style="background-color:#18181b;padding:20px 32px;text-align:center;">
  <img src="https://placehold.co/120x36/18181b/fafafa?text=LOGO" alt="Logo" style="max-height:36px;" />
</td></tr>
<tr><td style="padding:40px 32px;text-align:center;">
  <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#18181b;">¿Que Podemos Mejorar?</h1>
  <p style="margin:0 0 28px;font-size:15px;color:#52525b;line-height:1.6;">Hola {{ nombre }}, notamos que hace tiempo no nos visitas. Tu opinion nos importa mucho.</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="padding:8px;text-align:center;"><a href="#" style="display:block;padding:14px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;text-decoration:none;font-size:14px;color:#6366f1;font-weight:600;">No encontre lo que buscaba</a></td>
    </tr>
    <tr>
      <td style="padding:8px;text-align:center;"><a href="#" style="display:block;padding:14px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;text-decoration:none;font-size:14px;color:#6366f1;font-weight:600;">Los precios eran altos</a></td>
    </tr>
    <tr>
      <td style="padding:8px;text-align:center;"><a href="#" style="display:block;padding:14px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;text-decoration:none;font-size:14px;color:#6366f1;font-weight:600;">Tuve una mala experiencia</a></td>
    </tr>
    <tr>
      <td style="padding:8px;text-align:center;"><a href="#" style="display:block;padding:14px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;text-decoration:none;font-size:14px;color:#6366f1;font-weight:600;">Solo estaba mirando</a></td>
    </tr>
  </table>
  <p style="margin:20px 0 0;font-size:13px;color:#a1a1aa;">Tu feedback nos ayuda a ser mejores.</p>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const winBack05: EmailTemplate = {
  id: 'win-back-05',
  name: 'Ultima Oportunidad',
  category: 'win_back',
  thumbnail: 'https://placehold.co/280x180/4f46e5/ffffff?text=Ultima',
  description: 'Ultimo intento antes de remover de la lista',
  html: `${WRAPPER_OPEN}
<tr><td style="background:#4f46e5;padding:8px 32px;text-align:center;">
  <p style="margin:0;font-size:12px;color:#c7d2fe;font-weight:600;">ULTIMA OPORTUNIDAD</p>
</td></tr>
<tr><td style="background-color:#18181b;padding:20px 32px;text-align:center;">
  <img src="https://placehold.co/120x36/18181b/fafafa?text=LOGO" alt="Logo" style="max-height:36px;" />
</td></tr>
<tr><td style="padding:40px 32px;text-align:center;">
  <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#18181b;">{{ nombre }}, ¿Nos Despedimos?</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6;">Hace mucho que no interactuas con nosotros. Si no deseas seguir recibiendo emails, lo entendemos. Pero si quieres quedarte, simplemente haz clic abajo.</p>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 36px;background:#4f46e5;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;margin-bottom:12px;">Quiero Seguir Suscrito</a>
  <p style="margin:16px 0 0;font-size:13px;color:#a1a1aa;">Si no haces clic, te removeremos de la lista en 7 dias.</p>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

// ── Post-purchase (5) ───────────────────────────────────────────────────────

const postPurchase01: EmailTemplate = {
  id: 'post-purchase-01',
  name: 'Gracias por tu Compra',
  category: 'post_purchase',
  thumbnail: 'https://placehold.co/280x180/0ea5e9/ffffff?text=Gracias',
  description: 'Confirmacion y agradecimiento post-compra',
  html: `${WRAPPER_OPEN}
<tr><td style="background:#0ea5e9;padding:32px;text-align:center;">
  <img src="https://placehold.co/120x36/0ea5e9/ffffff?text=LOGO" alt="Logo" style="max-height:36px;margin-bottom:16px;" />
  <h1 style="margin:0 0 8px;font-size:26px;font-weight:700;color:#ffffff;">¡Gracias, {{ nombre }}!</h1>
  <p style="margin:0;font-size:15px;color:#e0f2fe;">Tu compra ha sido confirmada.</p>
</td></tr>
<tr><td style="padding:32px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e4e4e7;border-radius:8px;">
    <tr><td style="padding:16px;background:#f0f9ff;border-radius:8px 8px 0 0;">
      <p style="margin:0;font-size:13px;color:#0369a1;font-weight:600;">Resumen de tu pedido</p>
    </td></tr>
    <tr><td style="padding:16px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding:8px 0;"><p style="margin:0;font-size:14px;color:#18181b;">Producto Ejemplo x1</p></td>
          <td style="padding:8px 0;text-align:right;"><p style="margin:0;font-size:14px;font-weight:600;color:#18181b;">$29.990</p></td>
        </tr>
        <tr><td colspan="2" style="border-top:1px solid #e4e4e7;padding:12px 0 0;">
          <table width="100%"><tr>
            <td><p style="margin:0;font-size:15px;font-weight:700;color:#18181b;">Total</p></td>
            <td align="right"><p style="margin:0;font-size:18px;font-weight:700;color:#0ea5e9;">$29.990</p></td>
          </tr></table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</td></tr>
<tr><td style="padding:0 32px 32px;text-align:center;">
  <p style="margin:0 0 16px;font-size:14px;color:#52525b;">Te enviaremos un email cuando tu pedido sea despachado.</p>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:12px 28px;background:#0ea5e9;color:#ffffff;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">Seguir Comprando</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const postPurchase02: EmailTemplate = {
  id: 'post-purchase-02',
  name: 'Tu Pedido en Camino',
  category: 'post_purchase',
  thumbnail: 'https://placehold.co/280x180/06b6d4/ffffff?text=Envio',
  description: 'Notificacion de envio con tracking',
  html: `${WRAPPER_OPEN}
<tr><td style="background-color:#18181b;padding:20px 32px;text-align:center;">
  <img src="https://placehold.co/120x36/18181b/fafafa?text=LOGO" alt="Logo" style="max-height:36px;" />
</td></tr>
<tr><td style="padding:36px 32px;text-align:center;">
  <div style="font-size:48px;margin-bottom:12px;">📦</div>
  <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#18181b;">¡Tu Pedido Va en Camino!</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;">Hola {{ nombre }}, tu paquete fue despachado y esta viajando hacia ti.</p>
  <div style="display:inline-block;padding:16px 24px;background:#ecfeff;border:1px solid #a5f3fc;border-radius:8px;margin-bottom:24px;">
    <p style="margin:0 0 4px;font-size:11px;color:#0891b2;text-transform:uppercase;letter-spacing:1px;">Numero de seguimiento</p>
    <p style="margin:0;font-size:18px;font-weight:700;color:#06b6d4;letter-spacing:1px;">TRACK123456789</p>
  </div><br/>
  <a href="#" style="display:inline-block;padding:14px 36px;background:#06b6d4;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">Rastrear Mi Pedido</a>
</td></tr>
<tr><td style="padding:0 32px 32px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e4e4e7;padding-top:20px;">
    <tr>
      <td style="padding:16px 0;width:33%;text-align:center;">
        <div style="width:32px;height:32px;background:#06b6d4;border-radius:50%;margin:0 auto 8px;line-height:32px;color:#fff;font-size:14px;font-weight:700;">✓</div>
        <p style="margin:0;font-size:12px;color:#06b6d4;font-weight:600;">Confirmado</p>
      </td>
      <td style="padding:16px 0;width:33%;text-align:center;">
        <div style="width:32px;height:32px;background:#06b6d4;border-radius:50%;margin:0 auto 8px;line-height:32px;color:#fff;font-size:14px;font-weight:700;">✓</div>
        <p style="margin:0;font-size:12px;color:#06b6d4;font-weight:600;">Despachado</p>
      </td>
      <td style="padding:16px 0;width:33%;text-align:center;">
        <div style="width:32px;height:32px;background:#e4e4e7;border-radius:50%;margin:0 auto 8px;line-height:32px;color:#a1a1aa;font-size:14px;">○</div>
        <p style="margin:0;font-size:12px;color:#a1a1aa;">Entregado</p>
      </td>
    </tr>
  </table>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const postPurchase03: EmailTemplate = {
  id: 'post-purchase-03',
  name: 'Tips de Uso',
  category: 'post_purchase',
  thumbnail: 'https://placehold.co/280x180/0ea5e9/ffffff?text=Tips',
  description: 'Consejos para aprovechar al maximo el producto',
  html: `${WRAPPER_OPEN}
<tr><td style="background-color:#18181b;padding:20px 32px;text-align:center;">
  <img src="https://placehold.co/120x36/18181b/fafafa?text=LOGO" alt="Logo" style="max-height:36px;" />
</td></tr>
<tr><td style="padding:36px 32px;text-align:center;">
  <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#18181b;">Saca el Maximo a tu Compra</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;">Hola {{ nombre }}, aqui van algunos tips para aprovechar tu producto al 100%.</p>
</td></tr>
<tr><td style="padding:0 32px 32px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:16px;background:#f0f9ff;border-radius:8px;margin-bottom:8px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="width:48px;vertical-align:top;"><div style="width:40px;height:40px;background:#0ea5e9;border-radius:10px;text-align:center;line-height:40px;color:#fff;font-weight:700;">1</div></td>
        <td style="padding-left:12px;">
          <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#18181b;">Primer Paso</p>
          <p style="margin:0;font-size:13px;color:#52525b;line-height:1.5;">Descripcion del primer tip o paso de uso del producto.</p>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="height:8px;"></td></tr>
    <tr><td style="padding:16px;background:#f0f9ff;border-radius:8px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="width:48px;vertical-align:top;"><div style="width:40px;height:40px;background:#0ea5e9;border-radius:10px;text-align:center;line-height:40px;color:#fff;font-weight:700;">2</div></td>
        <td style="padding-left:12px;">
          <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#18181b;">Segundo Paso</p>
          <p style="margin:0;font-size:13px;color:#52525b;line-height:1.5;">Descripcion del segundo tip o consejo para mejor uso.</p>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="height:8px;"></td></tr>
    <tr><td style="padding:16px;background:#f0f9ff;border-radius:8px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="width:48px;vertical-align:top;"><div style="width:40px;height:40px;background:#0ea5e9;border-radius:10px;text-align:center;line-height:40px;color:#fff;font-weight:700;">3</div></td>
        <td style="padding-left:12px;">
          <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#18181b;">Tercer Paso</p>
          <p style="margin:0;font-size:13px;color:#52525b;line-height:1.5;">Descripcion del tercer tip para sacarle todo el provecho.</p>
        </td>
      </tr></table>
    </td></tr>
  </table>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const postPurchase04: EmailTemplate = {
  id: 'post-purchase-04',
  name: 'Productos Complementarios',
  category: 'post_purchase',
  thumbnail: 'https://placehold.co/280x180/06b6d4/ffffff?text=Cross-sell',
  description: 'Cross-sell con productos complementarios',
  html: `${WRAPPER_OPEN}
<tr><td style="background-color:#18181b;padding:20px 32px;text-align:center;">
  <img src="https://placehold.co/120x36/18181b/fafafa?text=LOGO" alt="Logo" style="max-height:36px;" />
</td></tr>
<tr><td style="padding:32px;text-align:center;">
  <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#18181b;">Completa tu Experiencia</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;">Hola {{ nombre }}, estos productos van perfecto con tu ultima compra.</p>
</td></tr>
<tr><td style="padding:0 24px 24px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="width:33%;padding:8px;text-align:center;vertical-align:top;">
      <img src="https://placehold.co/160x160/ecfeff/06b6d4?text=Comp+1" alt="" style="width:100%;border-radius:8px;" />
      <p style="margin:8px 0 2px;font-size:13px;font-weight:600;color:#18181b;">Complemento 1</p>
      <p style="margin:0;font-size:13px;color:#06b6d4;font-weight:700;">$14.990</p>
    </td>
    <td style="width:33%;padding:8px;text-align:center;vertical-align:top;">
      <img src="https://placehold.co/160x160/ecfeff/06b6d4?text=Comp+2" alt="" style="width:100%;border-radius:8px;" />
      <p style="margin:8px 0 2px;font-size:13px;font-weight:600;color:#18181b;">Complemento 2</p>
      <p style="margin:0;font-size:13px;color:#06b6d4;font-weight:700;">$19.990</p>
    </td>
    <td style="width:33%;padding:8px;text-align:center;vertical-align:top;">
      <img src="https://placehold.co/160x160/ecfeff/06b6d4?text=Comp+3" alt="" style="width:100%;border-radius:8px;" />
      <p style="margin:8px 0 2px;font-size:13px;font-weight:600;color:#18181b;">Complemento 3</p>
      <p style="margin:0;font-size:13px;color:#06b6d4;font-weight:700;">$24.990</p>
    </td>
  </tr></table>
</td></tr>
<tr><td style="padding:0 32px 32px;text-align:center;">
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 36px;background:#06b6d4;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">Ver Productos</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const postPurchase05: EmailTemplate = {
  id: 'post-purchase-05',
  name: 'Programa de Referidos',
  category: 'post_purchase',
  thumbnail: 'https://placehold.co/280x180/0ea5e9/ffffff?text=Referidos',
  description: 'Invita a un amigo y ambos ganan',
  html: `${WRAPPER_OPEN}
<tr><td style="background:linear-gradient(135deg,#0ea5e9 0%,#0284c7 100%);padding:36px 32px;text-align:center;">
  <h1 style="margin:0 0 8px;font-size:26px;font-weight:700;color:#ffffff;">Comparte y Gana</h1>
  <p style="margin:0;font-size:15px;color:#bae6fd;">Invita a un amigo y ambos reciben un descuento.</p>
</td></tr>
<tr><td style="padding:32px;text-align:center;">
  <p style="margin:0 0 20px;font-size:15px;color:#52525b;line-height:1.6;">Hola {{ nombre }}, gracias por tu compra. ¿Conoces a alguien que tambien amaria nuestros productos?</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;"><tr>
    <td style="width:50%;padding:12px;text-align:center;">
      <div style="padding:20px;background:#f0f9ff;border-radius:10px;">
        <p style="margin:0 0 4px;font-size:24px;">🎁</p>
        <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#18181b;">Tu Amigo Recibe</p>
        <p style="margin:0;font-size:20px;font-weight:800;color:#0ea5e9;">15% OFF</p>
      </div>
    </td>
    <td style="width:50%;padding:12px;text-align:center;">
      <div style="padding:20px;background:#f0f9ff;border-radius:10px;">
        <p style="margin:0 0 4px;font-size:24px;">🎉</p>
        <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#18181b;">Tu Recibes</p>
        <p style="margin:0;font-size:20px;font-weight:800;color:#0ea5e9;">15% OFF</p>
      </div>
    </td>
  </tr></table>
  <div style="display:inline-block;padding:12px 24px;background:#e0f2fe;border-radius:6px;margin-bottom:20px;">
    <p style="margin:0;font-size:11px;color:#0369a1;text-transform:uppercase;">Tu link de referido</p>
    <p style="margin:4px 0 0;font-size:14px;font-weight:700;color:#0ea5e9;">{{ tienda_url }}?ref=TUCODIGO</p>
  </div><br/>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 36px;background:#0ea5e9;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">Compartir con Amigos</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

// ── Review Request (5) ──────────────────────────────────────────────────────

const reviewRequest01: EmailTemplate = {
  id: 'review-request-01',
  name: 'Dejanos tu Opinion',
  category: 'review_request',
  thumbnail: 'https://placehold.co/280x180/eab308/ffffff?text=Opinion',
  description: 'Solicitud simple de resena',
  html: `${WRAPPER_OPEN}
<tr><td style="background-color:#18181b;padding:20px 32px;text-align:center;">
  <img src="https://placehold.co/120x36/18181b/fafafa?text=LOGO" alt="Logo" style="max-height:36px;" />
</td></tr>
<tr><td style="padding:40px 32px;text-align:center;">
  <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#18181b;">¿Que Te Parecio?</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6;">Hola {{ nombre }}, nos encantaria saber tu opinion sobre tu compra reciente.</p>
  <img src="https://placehold.co/120x120/fefce8/eab308?text=★" alt="" style="width:120px;border-radius:12px;margin-bottom:20px;" />
  <br/>
  <a href="#" style="display:inline-block;padding:14px 36px;background:#eab308;color:#18181b;border-radius:6px;text-decoration:none;font-size:15px;font-weight:700;">Dejar Mi Opinion</a>
  <p style="margin:16px 0 0;font-size:13px;color:#a1a1aa;">Solo toma 1 minuto.</p>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const reviewRequest02: EmailTemplate = {
  id: 'review-request-02',
  name: 'Califica tu Compra',
  category: 'review_request',
  thumbnail: 'https://placehold.co/280x180/f59e0b/ffffff?text=Estrellas',
  description: 'Solicitud de calificacion con estrellas',
  html: `${WRAPPER_OPEN}
<tr><td style="background-color:#18181b;padding:20px 32px;text-align:center;">
  <img src="https://placehold.co/120x36/18181b/fafafa?text=LOGO" alt="Logo" style="max-height:36px;" />
</td></tr>
<tr><td style="padding:36px 32px;text-align:center;">
  <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#18181b;">Califica tu Experiencia</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;">Hola {{ nombre }}, ¿como calificarias tu ultima compra?</p>
  <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin-bottom:24px;"><tr>
    <td style="padding:0 6px;"><a href="#" style="text-decoration:none;font-size:36px;">⭐</a></td>
    <td style="padding:0 6px;"><a href="#" style="text-decoration:none;font-size:36px;">⭐</a></td>
    <td style="padding:0 6px;"><a href="#" style="text-decoration:none;font-size:36px;">⭐</a></td>
    <td style="padding:0 6px;"><a href="#" style="text-decoration:none;font-size:36px;">⭐</a></td>
    <td style="padding:0 6px;"><a href="#" style="text-decoration:none;font-size:36px;">⭐</a></td>
  </tr></table>
  <p style="margin:0 0 20px;font-size:14px;color:#71717a;">Haz clic en las estrellas para calificar</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e4e4e7;border-radius:8px;">
    <tr>
      <td style="padding:12px;width:60px;"><img src="https://placehold.co/60x60/fefce8/eab308?text=P" alt="" style="width:60px;border-radius:6px;" /></td>
      <td style="padding:12px;"><p style="margin:0;font-size:14px;font-weight:600;color:#18181b;">Tu Producto Comprado</p><p style="margin:4px 0 0;font-size:12px;color:#71717a;">Comprado el {{ fecha }}</p></td>
    </tr>
  </table>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const reviewRequest03: EmailTemplate = {
  id: 'review-request-03',
  name: 'Tu Opinion con Descuento',
  category: 'review_request',
  thumbnail: 'https://placehold.co/280x180/eab308/18181b?text=Opinion+%25',
  description: 'Resena a cambio de un descuento',
  html: `${WRAPPER_OPEN}
<tr><td style="background:#eab308;padding:12px 32px;text-align:center;">
  <p style="margin:0;font-size:13px;color:#18181b;font-weight:700;">DEJANOS TU OPINION Y RECIBE UN 10% DE DESCUENTO</p>
</td></tr>
<tr><td style="background-color:#18181b;padding:20px 32px;text-align:center;">
  <img src="https://placehold.co/120x36/18181b/fafafa?text=LOGO" alt="Logo" style="max-height:36px;" />
</td></tr>
<tr><td style="padding:36px 32px;text-align:center;">
  <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#18181b;">Tu Opinion Vale</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6;">Hola {{ nombre }}, cuentanos que te parecio tu compra y recibe un 10% en tu proximo pedido.</p>
  <div style="display:inline-block;padding:16px 24px;background:#fefce8;border:2px dashed #eab308;border-radius:10px;margin-bottom:24px;">
    <p style="margin:0 0 4px;font-size:11px;color:#a16207;text-transform:uppercase;">Recompensa por tu resena</p>
    <p style="margin:0;font-size:22px;font-weight:800;color:#eab308;">10% OFF</p>
  </div><br/>
  <a href="#" style="display:inline-block;padding:14px 36px;background:#eab308;color:#18181b;border-radius:6px;text-decoration:none;font-size:15px;font-weight:700;">Escribir Mi Resena</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const reviewRequest04: EmailTemplate = {
  id: 'review-request-04',
  name: 'Fotos de tu Compra',
  category: 'review_request',
  thumbnail: 'https://placehold.co/280x180/f59e0b/ffffff?text=UGC',
  description: 'Solicitud de fotos y contenido generado por usuario',
  html: `${WRAPPER_OPEN}
<tr><td style="background-color:#18181b;padding:20px 32px;text-align:center;">
  <img src="https://placehold.co/120x36/18181b/fafafa?text=LOGO" alt="Logo" style="max-height:36px;" />
</td></tr>
<tr><td style="padding:36px 32px;text-align:center;">
  <div style="font-size:48px;margin-bottom:12px;">📸</div>
  <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#18181b;">¡Muestra tu Compra!</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6;">Hola {{ nombre }}, nos encantaria ver como usas tu producto. Comparte una foto y podrias aparecer en nuestras redes.</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;"><tr>
    <td style="width:33%;padding:6px;"><img src="https://placehold.co/150x150/fefce8/f59e0b?text=📷" alt="" style="width:100%;border-radius:8px;" /></td>
    <td style="width:33%;padding:6px;"><img src="https://placehold.co/150x150/fefce8/f59e0b?text=📷" alt="" style="width:100%;border-radius:8px;" /></td>
    <td style="width:33%;padding:6px;"><img src="https://placehold.co/150x150/fefce8/f59e0b?text=📷" alt="" style="width:100%;border-radius:8px;" /></td>
  </tr></table>
  <a href="#" style="display:inline-block;padding:14px 36px;background:#f59e0b;color:#18181b;border-radius:6px;text-decoration:none;font-size:15px;font-weight:700;">Subir Mis Fotos</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const reviewRequest05: EmailTemplate = {
  id: 'review-request-05',
  name: 'NPS Survey',
  category: 'review_request',
  thumbnail: 'https://placehold.co/280x180/eab308/ffffff?text=NPS',
  description: 'Encuesta Net Promoter Score',
  html: `${WRAPPER_OPEN}
<tr><td style="background-color:#18181b;padding:20px 32px;text-align:center;">
  <img src="https://placehold.co/120x36/18181b/fafafa?text=LOGO" alt="Logo" style="max-height:36px;" />
</td></tr>
<tr><td style="padding:36px 32px;text-align:center;">
  <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#18181b;">¿Nos Recomendarias?</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6;">Hola {{ nombre }}, en una escala del 0 al 10, ¿que tan probable es que nos recomiendes a un amigo?</p>
  <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin-bottom:24px;"><tr>
    <td style="padding:0 2px;"><a href="#" style="display:inline-block;width:36px;height:36px;line-height:36px;background:#fef2f2;color:#dc2626;border-radius:6px;text-decoration:none;font-size:13px;font-weight:700;">0</a></td>
    <td style="padding:0 2px;"><a href="#" style="display:inline-block;width:36px;height:36px;line-height:36px;background:#fef2f2;color:#dc2626;border-radius:6px;text-decoration:none;font-size:13px;font-weight:700;">1</a></td>
    <td style="padding:0 2px;"><a href="#" style="display:inline-block;width:36px;height:36px;line-height:36px;background:#fef2f2;color:#dc2626;border-radius:6px;text-decoration:none;font-size:13px;font-weight:700;">2</a></td>
    <td style="padding:0 2px;"><a href="#" style="display:inline-block;width:36px;height:36px;line-height:36px;background:#fef2f2;color:#dc2626;border-radius:6px;text-decoration:none;font-size:13px;font-weight:700;">3</a></td>
    <td style="padding:0 2px;"><a href="#" style="display:inline-block;width:36px;height:36px;line-height:36px;background:#fef2f2;color:#dc2626;border-radius:6px;text-decoration:none;font-size:13px;font-weight:700;">4</a></td>
    <td style="padding:0 2px;"><a href="#" style="display:inline-block;width:36px;height:36px;line-height:36px;background:#fef2f2;color:#dc2626;border-radius:6px;text-decoration:none;font-size:13px;font-weight:700;">5</a></td>
    <td style="padding:0 2px;"><a href="#" style="display:inline-block;width:36px;height:36px;line-height:36px;background:#fffbeb;color:#eab308;border-radius:6px;text-decoration:none;font-size:13px;font-weight:700;">6</a></td>
    <td style="padding:0 2px;"><a href="#" style="display:inline-block;width:36px;height:36px;line-height:36px;background:#fffbeb;color:#eab308;border-radius:6px;text-decoration:none;font-size:13px;font-weight:700;">7</a></td>
    <td style="padding:0 2px;"><a href="#" style="display:inline-block;width:36px;height:36px;line-height:36px;background:#f0fdf4;color:#22c55e;border-radius:6px;text-decoration:none;font-size:13px;font-weight:700;">8</a></td>
    <td style="padding:0 2px;"><a href="#" style="display:inline-block;width:36px;height:36px;line-height:36px;background:#f0fdf4;color:#22c55e;border-radius:6px;text-decoration:none;font-size:13px;font-weight:700;">9</a></td>
    <td style="padding:0 2px;"><a href="#" style="display:inline-block;width:36px;height:36px;line-height:36px;background:#f0fdf4;color:#22c55e;border-radius:6px;text-decoration:none;font-size:13px;font-weight:700;">10</a></td>
  </tr></table>
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="text-align:left;font-size:11px;color:#a1a1aa;">Nada probable</td>
    <td style="text-align:right;font-size:11px;color:#a1a1aa;">Muy probable</td>
  </tr></table>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

// ── Back-in-stock (5) ───────────────────────────────────────────────────────

const backInStock01: EmailTemplate = {
  id: 'back-in-stock-01',
  name: 'Ya Esta Disponible',
  category: 'back_in_stock',
  thumbnail: 'https://placehold.co/280x180/10b981/ffffff?text=Disponible',
  description: 'Producto de vuelta en stock',
  html: `${WRAPPER_OPEN}
<tr><td style="background-color:#10b981;padding:12px 32px;text-align:center;">
  <p style="margin:0;font-size:13px;color:#ffffff;font-weight:700;letter-spacing:1px;">¡DE VUELTA EN STOCK!</p>
</td></tr>
<tr><td style="background-color:#18181b;padding:20px 32px;text-align:center;">
  <img src="https://placehold.co/120x36/18181b/fafafa?text=LOGO" alt="Logo" style="max-height:36px;" />
</td></tr>
<tr><td style="padding:32px;text-align:center;">
  <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#18181b;">¡Ya Esta Disponible!</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;">Hola {{ nombre }}, el producto que querias ya esta de vuelta.</p>
  <img src="https://placehold.co/300x300/f0fdf4/10b981?text=Producto" alt="" style="width:100%;max-width:300px;border-radius:12px;margin-bottom:16px;" />
  <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#18181b;">Nombre del Producto</p>
  <p style="margin:0 0 20px;font-size:20px;font-weight:800;color:#10b981;">$39.990</p>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 36px;background:#10b981;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">Comprar Ahora</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const backInStock02: EmailTemplate = {
  id: 'back-in-stock-02',
  name: 'Stock Limitado',
  category: 'back_in_stock',
  thumbnail: 'https://placehold.co/280x180/059669/ffffff?text=Limitado',
  description: 'De vuelta en stock con urgencia por unidades limitadas',
  html: `${WRAPPER_OPEN}
<tr><td style="background:#059669;padding:12px 32px;text-align:center;">
  <p style="margin:0;font-size:13px;color:#ffffff;font-weight:700;">⚡ STOCK MUY LIMITADO — NO ESPERES</p>
</td></tr>
<tr><td style="background-color:#18181b;padding:20px 32px;text-align:center;">
  <img src="https://placehold.co/120x36/18181b/fafafa?text=LOGO" alt="Logo" style="max-height:36px;" />
</td></tr>
<tr><td style="padding:32px;text-align:center;">
  <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#18181b;">Volvio, Pero por Poco</h1>
  <p style="margin:0 0 20px;font-size:15px;color:#52525b;">{{ nombre }}, solo llegaron unas pocas unidades.</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:2px solid #059669;border-radius:10px;margin-bottom:20px;">
    <tr>
      <td style="padding:16px;width:100px;"><img src="https://placehold.co/100x100/f0fdf4/059669?text=Prod" alt="" style="width:100px;border-radius:8px;" /></td>
      <td style="padding:16px;">
        <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#18181b;">Producto Popular</p>
        <p style="margin:0 0 8px;font-size:20px;font-weight:800;color:#059669;">$39.990</p>
        <p style="margin:0;font-size:13px;color:#dc2626;font-weight:600;">Solo quedan 5 unidades</p>
      </td>
    </tr>
  </table>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 40px;background:#059669;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:700;">Asegurar el Mio</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const backInStock03: EmailTemplate = {
  id: 'back-in-stock-03',
  name: 'Alerta de Precio',
  category: 'back_in_stock',
  thumbnail: 'https://placehold.co/280x180/10b981/ffffff?text=Precio',
  description: 'Notificacion de baja de precio',
  html: `${WRAPPER_OPEN}
<tr><td style="background-color:#18181b;padding:20px 32px;text-align:center;">
  <img src="https://placehold.co/120x36/18181b/fafafa?text=LOGO" alt="Logo" style="max-height:36px;" />
</td></tr>
<tr><td style="padding:36px 32px;text-align:center;">
  <div style="font-size:48px;margin-bottom:12px;">🏷️</div>
  <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#18181b;">¡Bajo de Precio!</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;">Hola {{ nombre }}, un producto que te interesa ahora cuesta menos.</p>
  <img src="https://placehold.co/240x240/f0fdf4/10b981?text=Producto" alt="" style="width:240px;border-radius:12px;margin-bottom:16px;" />
  <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#18181b;">Nombre del Producto</p>
  <p style="margin:0 0 20px;font-size:16px;">
    <span style="color:#a1a1aa;text-decoration:line-through;font-size:14px;">$49.990</span>
    <span style="color:#10b981;font-weight:800;font-size:22px;margin-left:8px;">$34.990</span>
  </p>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 36px;background:#10b981;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">Ver Oferta</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const backInStock04: EmailTemplate = {
  id: 'back-in-stock-04',
  name: 'Tu Lista de Deseos',
  category: 'back_in_stock',
  thumbnail: 'https://placehold.co/280x180/059669/ffffff?text=Wishlist',
  description: 'Producto de la lista de deseos disponible',
  html: `${WRAPPER_OPEN}
<tr><td style="background-color:#18181b;padding:20px 32px;text-align:center;">
  <img src="https://placehold.co/120x36/18181b/fafafa?text=LOGO" alt="Logo" style="max-height:36px;" />
</td></tr>
<tr><td style="padding:36px 32px;text-align:center;">
  <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#18181b;">¡Tu Deseo se Hizo Realidad! 💚</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;">{{ nombre }}, un producto de tu lista de deseos esta disponible.</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #d1fae5;border-radius:10px;background:#f0fdf4;margin-bottom:20px;">
    <tr>
      <td style="padding:16px;width:100px;"><img src="https://placehold.co/100x100/ffffff/059669?text=♡" alt="" style="width:100px;border-radius:8px;" /></td>
      <td style="padding:16px;">
        <p style="margin:0 0 4px;font-size:11px;color:#059669;text-transform:uppercase;letter-spacing:1px;">De tu lista de deseos</p>
        <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#18181b;">Producto Deseado</p>
        <p style="margin:0;font-size:18px;font-weight:800;color:#059669;">$34.990</p>
      </td>
    </tr>
  </table>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 36px;background:#059669;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">Comprar Ahora</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const backInStock05: EmailTemplate = {
  id: 'back-in-stock-05',
  name: 'Pre-order',
  category: 'back_in_stock',
  thumbnail: 'https://placehold.co/280x180/10b981/ffffff?text=Pre-order',
  description: 'Apertura de pre-venta para producto proximo',
  html: `${WRAPPER_OPEN}
<tr><td style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);padding:40px 32px;text-align:center;">
  <p style="margin:0 0 8px;font-size:12px;color:#a7f3d0;text-transform:uppercase;letter-spacing:2px;">Preventa exclusiva</p>
  <h1 style="margin:0 0 12px;font-size:28px;font-weight:700;color:#ffffff;">Reserva Antes que Todos</h1>
  <p style="margin:0;font-size:15px;color:#a7f3d0;">Se el primero en tener este producto.</p>
</td></tr>
<tr><td style="padding:32px;text-align:center;">
  <img src="https://placehold.co/400x300/f0fdf4/10b981?text=Proximo+Producto" alt="" style="width:100%;max-width:400px;border-radius:12px;margin-bottom:20px;" />
  <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#18181b;">Nuevo Producto — Edicion Limitada</p>
  <p style="margin:0 0 4px;font-size:14px;color:#71717a;">Fecha de envio estimada: Abril 2026</p>
  <p style="margin:0 0 24px;font-size:22px;font-weight:800;color:#10b981;">$49.990</p>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 40px;background:#10b981;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:700;">Reservar Ahora</a>
  <p style="margin:16px 0 0;font-size:13px;color:#a1a1aa;">Sin cargo hasta el envio.</p>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

// ── Birthday (5) ────────────────────────────────────────────────────────────

const birthday01: EmailTemplate = {
  id: 'birthday-01',
  name: 'Feliz Cumpleanos',
  category: 'birthday',
  thumbnail: 'https://placehold.co/280x180/ec4899/ffffff?text=Cumple',
  description: 'Saludo clasico de cumpleanos',
  html: `${WRAPPER_OPEN}
<tr><td style="background:linear-gradient(135deg,#ec4899 0%,#db2777 100%);padding:40px 32px;text-align:center;">
  <div style="font-size:48px;margin-bottom:12px;">🎂</div>
  <h1 style="margin:0 0 8px;font-size:30px;font-weight:800;color:#ffffff;">¡Feliz Cumpleanos, {{ nombre }}!</h1>
  <p style="margin:0;font-size:15px;color:#fbcfe8;">Hoy es tu dia y queremos celebrarlo contigo.</p>
</td></tr>
<tr><td style="padding:32px;text-align:center;">
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6;">De parte de todo el equipo de {{ empresa }}, te deseamos un dia increible lleno de alegria.</p>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 36px;background:#ec4899;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">Ver Sorpresas</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const birthday02: EmailTemplate = {
  id: 'birthday-02',
  name: 'Cumpleanos con Regalo',
  category: 'birthday',
  thumbnail: 'https://placehold.co/280x180/f472b6/ffffff?text=Regalo',
  description: 'Cumpleanos con codigo de descuento como regalo',
  html: `${WRAPPER_OPEN}
<tr><td style="background:linear-gradient(135deg,#f472b6 0%,#ec4899 100%);padding:36px 32px;text-align:center;">
  <div style="font-size:48px;margin-bottom:12px;">🎁</div>
  <h1 style="margin:0 0 8px;font-size:28px;font-weight:800;color:#ffffff;">¡Tu Regalo de Cumpleanos!</h1>
  <p style="margin:0;font-size:15px;color:#fce7f3;">{{ nombre }}, tenemos algo especial para ti.</p>
</td></tr>
<tr><td style="padding:32px;text-align:center;">
  <p style="margin:0 0 20px;font-size:15px;color:#52525b;">Para celebrar tu dia, te regalamos un descuento exclusivo.</p>
  <div style="display:inline-block;padding:20px 32px;background:#fdf2f8;border:2px dashed #ec4899;border-radius:12px;margin-bottom:24px;">
    <p style="margin:0 0 4px;font-size:11px;color:#be185d;text-transform:uppercase;letter-spacing:1px;">Tu regalo</p>
    <p style="margin:0;font-size:32px;font-weight:900;color:#ec4899;letter-spacing:2px;">CUMPLE25</p>
    <p style="margin:6px 0 0;font-size:14px;color:#f472b6;font-weight:600;">25% de descuento</p>
  </div><br/>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 36px;background:#ec4899;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">Usar Mi Regalo</a>
  <p style="margin:16px 0 0;font-size:13px;color:#a1a1aa;">Valido por 7 dias.</p>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const birthday03: EmailTemplate = {
  id: 'birthday-03',
  name: 'Cumpleanos VIP',
  category: 'birthday',
  thumbnail: 'https://placehold.co/280x180/18181b/ec4899?text=VIP+Cumple',
  description: 'Experiencia premium de cumpleanos',
  html: `${WRAPPER_OPEN}
<tr><td style="background:#18181b;padding:40px 32px;text-align:center;border-bottom:3px solid #ec4899;">
  <img src="https://placehold.co/120x36/18181b/ec4899?text=LOGO" alt="Logo" style="max-height:36px;margin-bottom:20px;" />
  <p style="margin:0 0 8px;font-size:12px;color:#ec4899;text-transform:uppercase;letter-spacing:3px;">Celebracion exclusiva</p>
  <h1 style="margin:0 0 8px;font-size:28px;font-weight:700;color:#ffffff;">Feliz Cumpleanos, {{ nombre }}</h1>
  <p style="margin:0;font-size:15px;color:#a1a1aa;">Mereces lo mejor en tu dia especial.</p>
</td></tr>
<tr><td style="padding:32px;text-align:center;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;"><tr>
    <td style="width:33%;padding:12px;text-align:center;">
      <p style="margin:0 0 4px;font-size:24px;">✨</p>
      <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#18181b;">30% OFF</p>
      <p style="margin:0;font-size:12px;color:#71717a;">En toda la tienda</p>
    </td>
    <td style="width:33%;padding:12px;text-align:center;">
      <p style="margin:0 0 4px;font-size:24px;">🚚</p>
      <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#18181b;">Envio Gratis</p>
      <p style="margin:0;font-size:12px;color:#71717a;">Sin minimo</p>
    </td>
    <td style="width:33%;padding:12px;text-align:center;">
      <p style="margin:0 0 4px;font-size:24px;">🎁</p>
      <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#18181b;">Gift Wrap</p>
      <p style="margin:0;font-size:12px;color:#71717a;">Empaque especial</p>
    </td>
  </tr></table>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 36px;background:#ec4899;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">Celebrar Ahora</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const birthday04: EmailTemplate = {
  id: 'birthday-04',
  name: 'Cumpleanos Anticipado',
  category: 'birthday',
  thumbnail: 'https://placehold.co/280x180/ec4899/ffffff?text=Anticipado',
  description: 'Oferta anticipada antes del cumpleanos',
  html: `${WRAPPER_OPEN}
<tr><td style="background-color:#18181b;padding:20px 32px;text-align:center;">
  <img src="https://placehold.co/120x36/18181b/fafafa?text=LOGO" alt="Logo" style="max-height:36px;" />
</td></tr>
<tr><td style="padding:40px 32px;text-align:center;">
  <p style="margin:0 0 8px;font-size:12px;color:#ec4899;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Se acerca tu dia</p>
  <h1 style="margin:0 0 12px;font-size:26px;font-weight:700;color:#18181b;">¡Tu Cumpleanos Esta Cerca!</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6;">Hola {{ nombre }}, queremos empezar la celebracion antes. Aqui va un adelanto de tu regalo.</p>
  <div style="display:inline-block;padding:16px 28px;background:#fdf2f8;border:1px solid #fbcfe8;border-radius:10px;margin-bottom:24px;">
    <p style="margin:0 0 4px;font-size:11px;color:#be185d;text-transform:uppercase;">Disponible desde ya</p>
    <p style="margin:0;font-size:24px;font-weight:800;color:#ec4899;">20% OFF</p>
    <p style="margin:4px 0 0;font-size:12px;color:#f472b6;">Codigo: PRECUMPLE20</p>
  </div><br/>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 36px;background:#ec4899;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">Empezar a Celebrar</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const birthday05: EmailTemplate = {
  id: 'birthday-05',
  name: 'Semana de Cumpleanos',
  category: 'birthday',
  thumbnail: 'https://placehold.co/280x180/f472b6/ffffff?text=Semana',
  description: 'Celebracion extendida durante toda la semana',
  html: `${WRAPPER_OPEN}
<tr><td style="background:linear-gradient(135deg,#ec4899 0%,#a855f7 100%);padding:36px 32px;text-align:center;">
  <p style="margin:0 0 8px;font-size:40px;">🎉</p>
  <h1 style="margin:0 0 8px;font-size:28px;font-weight:800;color:#ffffff;">¡Semana de Cumpleanos!</h1>
  <p style="margin:0;font-size:15px;color:#fce7f3;">{{ nombre }}, un dia no es suficiente para celebrar.</p>
</td></tr>
<tr><td style="padding:32px;text-align:center;">
  <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6;">Esta semana es toda tuya. Disfruta de beneficios especiales cada dia.</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:8px;"><div style="padding:12px 16px;background:#fdf2f8;border-radius:8px;"><table width="100%"><tr><td style="font-size:14px;font-weight:600;color:#18181b;">Lunes — Envio Gratis</td><td align="right" style="font-size:18px;">📦</td></tr></table></div></td></tr>
    <tr><td style="padding:8px;"><div style="padding:12px 16px;background:#fdf2f8;border-radius:8px;"><table width="100%"><tr><td style="font-size:14px;font-weight:600;color:#18181b;">Miercoles — 15% OFF</td><td align="right" style="font-size:18px;">💰</td></tr></table></div></td></tr>
    <tr><td style="padding:8px;"><div style="padding:12px 16px;background:#fdf2f8;border-radius:8px;"><table width="100%"><tr><td style="font-size:14px;font-weight:600;color:#18181b;">Viernes — 25% OFF</td><td align="right" style="font-size:18px;">🔥</td></tr></table></div></td></tr>
    <tr><td style="padding:8px;"><div style="padding:12px 16px;background:#fdf2f8;border-radius:8px;"><table width="100%"><tr><td style="font-size:14px;font-weight:600;color:#18181b;">Domingo — Regalo Sorpresa</td><td align="right" style="font-size:18px;">🎁</td></tr></table></div></td></tr>
  </table>
  <br/>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 36px;background:#ec4899;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">Celebrar Toda la Semana</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

// ── Seasonal (5) ────────────────────────────────────────────────────────────

const seasonal01: EmailTemplate = {
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

const seasonal02: EmailTemplate = {
  id: 'seasonal-02',
  name: 'Black Friday',
  category: 'seasonal',
  thumbnail: 'https://placehold.co/280x180/18181b/f59e0b?text=BLACK+FRIDAY',
  description: 'Template para Black Friday con impacto visual',
  html: `${WRAPPER_OPEN}
<tr><td style="background:#18181b;padding:48px 32px;text-align:center;">
  <p style="margin:0 0 8px;font-size:14px;color:#f59e0b;text-transform:uppercase;letter-spacing:4px;font-weight:700;">No te lo pierdas</p>
  <h1 style="margin:0 0 8px;font-size:48px;font-weight:900;color:#ffffff;letter-spacing:2px;">BLACK FRIDAY</h1>
  <p style="margin:0 0 4px;font-size:22px;color:#f59e0b;font-weight:700;">Hasta 70% de descuento</p>
  <p style="margin:0 0 24px;font-size:14px;color:#71717a;">Solo 24 horas — {{ fecha }}</p>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:16px 40px;background:#f59e0b;color:#18181b;border-radius:6px;text-decoration:none;font-size:16px;font-weight:800;">COMPRAR AHORA</a>
</td></tr>
<tr><td style="padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="width:33%;padding:8px;text-align:center;vertical-align:top;">
      <img src="https://placehold.co/160x160/18181b/f59e0b?text=-50%25" alt="" style="width:100%;border-radius:8px;" />
      <p style="margin:6px 0 0;font-size:13px;font-weight:600;color:#18181b;">Electronica</p>
    </td>
    <td style="width:33%;padding:8px;text-align:center;vertical-align:top;">
      <img src="https://placehold.co/160x160/18181b/f59e0b?text=-60%25" alt="" style="width:100%;border-radius:8px;" />
      <p style="margin:6px 0 0;font-size:13px;font-weight:600;color:#18181b;">Moda</p>
    </td>
    <td style="width:33%;padding:8px;text-align:center;vertical-align:top;">
      <img src="https://placehold.co/160x160/18181b/f59e0b?text=-70%25" alt="" style="width:100%;border-radius:8px;" />
      <p style="margin:6px 0 0;font-size:13px;font-weight:600;color:#18181b;">Hogar</p>
    </td>
  </tr></table>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const seasonal03: EmailTemplate = {
  id: 'seasonal-03',
  name: 'Navidad',
  category: 'seasonal',
  thumbnail: 'https://placehold.co/280x180/dc2626/ffffff?text=Navidad',
  description: 'Template navideno con espiritu festivo',
  html: `${WRAPPER_OPEN}
<tr><td style="background:linear-gradient(135deg,#dc2626 0%,#991b1b 100%);padding:40px 32px;text-align:center;">
  <p style="margin:0 0 8px;font-size:36px;">🎄</p>
  <h1 style="margin:0 0 8px;font-size:32px;font-weight:800;color:#ffffff;">¡Feliz Navidad!</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#fecaca;">Encuentra el regalo perfecto para todos.</p>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 36px;background:#ffffff;color:#dc2626;border-radius:6px;text-decoration:none;font-size:15px;font-weight:700;">Ver Regalos</a>
</td></tr>
<tr><td style="padding:32px;text-align:center;">
  <h2 style="margin:0 0 20px;font-size:20px;color:#18181b;">Ideas de Regalo</h2>
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="width:33%;padding:8px;text-align:center;vertical-align:top;">
      <img src="https://placehold.co/150x150/fef2f2/dc2626?text=Para+El" alt="" style="width:100%;border-radius:8px;" />
      <p style="margin:8px 0 0;font-size:13px;font-weight:600;color:#18181b;">Para El</p>
    </td>
    <td style="width:33%;padding:8px;text-align:center;vertical-align:top;">
      <img src="https://placehold.co/150x150/fef2f2/dc2626?text=Para+Ella" alt="" style="width:100%;border-radius:8px;" />
      <p style="margin:8px 0 0;font-size:13px;font-weight:600;color:#18181b;">Para Ella</p>
    </td>
    <td style="width:33%;padding:8px;text-align:center;vertical-align:top;">
      <img src="https://placehold.co/150x150/fef2f2/dc2626?text=Ninos" alt="" style="width:100%;border-radius:8px;" />
      <p style="margin:8px 0 0;font-size:13px;font-weight:600;color:#18181b;">Para Ninos</p>
    </td>
  </tr></table>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const seasonal04: EmailTemplate = {
  id: 'seasonal-04',
  name: 'Dia de la Madre',
  category: 'seasonal',
  thumbnail: 'https://placehold.co/280x180/ec4899/ffffff?text=Mama',
  description: 'Template para el Dia de la Madre',
  html: `${WRAPPER_OPEN}
<tr><td style="background:linear-gradient(135deg,#ec4899 0%,#be185d 100%);padding:40px 32px;text-align:center;">
  <p style="margin:0 0 8px;font-size:36px;">💐</p>
  <h1 style="margin:0 0 8px;font-size:30px;font-weight:800;color:#ffffff;">Dia de la Madre</h1>
  <p style="margin:0 0 24px;font-size:15px;color:#fce7f3;">Sorprende a mama con algo especial.</p>
</td></tr>
<tr><td style="padding:32px;text-align:center;">
  <p style="margin:0 0 20px;font-size:15px;color:#52525b;line-height:1.6;">Hola {{ nombre }}, encontra el regalo ideal para la persona mas importante.</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="width:50%;padding:8px;text-align:center;vertical-align:top;">
      <img src="https://placehold.co/240x240/fdf2f8/ec4899?text=Regalo+1" alt="" style="width:100%;border-radius:8px;" />
      <p style="margin:8px 0 2px;font-size:14px;font-weight:600;color:#18181b;">Set de Regalo</p>
      <p style="margin:0;font-size:14px;color:#ec4899;font-weight:700;">$34.990</p>
    </td>
    <td style="width:50%;padding:8px;text-align:center;vertical-align:top;">
      <img src="https://placehold.co/240x240/fdf2f8/ec4899?text=Regalo+2" alt="" style="width:100%;border-radius:8px;" />
      <p style="margin:8px 0 2px;font-size:14px;font-weight:600;color:#18181b;">Experiencia Especial</p>
      <p style="margin:0;font-size:14px;color:#ec4899;font-weight:700;">$49.990</p>
    </td>
  </tr></table>
</td></tr>
<tr><td style="padding:0 32px 32px;text-align:center;">
  <a href="{{ tienda_url }}" style="display:inline-block;padding:14px 36px;background:#ec4899;color:#ffffff;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600;">Ver Regalos para Mama</a>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

const seasonal05: EmailTemplate = {
  id: 'seasonal-05',
  name: 'Cyber Monday',
  category: 'seasonal',
  thumbnail: 'https://placehold.co/280x180/2563eb/ffffff?text=CYBER',
  description: 'Template para Cyber Monday',
  html: `${WRAPPER_OPEN}
<tr><td style="background:#0f172a;padding:48px 32px;text-align:center;">
  <p style="margin:0 0 8px;font-size:14px;color:#60a5fa;text-transform:uppercase;letter-spacing:4px;font-weight:700;">Solo online</p>
  <h1 style="margin:0 0 8px;font-size:44px;font-weight:900;color:#ffffff;">CYBER MONDAY</h1>
  <p style="margin:0 0 4px;font-size:20px;color:#60a5fa;font-weight:700;">Hasta 65% de descuento</p>
  <p style="margin:0 0 24px;font-size:14px;color:#64748b;">Ofertas exclusivas por 24 horas</p>
  <a href="{{ tienda_url }}" style="display:inline-block;padding:16px 40px;background:#2563eb;color:#ffffff;border-radius:6px;text-decoration:none;font-size:16px;font-weight:800;">VER OFERTAS</a>
</td></tr>
<tr><td style="padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="width:50%;padding:8px;text-align:center;vertical-align:top;">
        <img src="https://placehold.co/240x240/0f172a/2563eb?text=-50%25" alt="" style="width:100%;border-radius:8px;" />
        <p style="margin:8px 0 0;font-size:13px;font-weight:600;color:#18181b;">Tecnologia</p>
      </td>
      <td style="width:50%;padding:8px;text-align:center;vertical-align:top;">
        <img src="https://placehold.co/240x240/0f172a/2563eb?text=-65%25" alt="" style="width:100%;border-radius:8px;" />
        <p style="margin:8px 0 0;font-size:13px;font-weight:600;color:#18181b;">Lifestyle</p>
      </td>
    </tr>
  </table>
</td></tr>
${FOOTER}
${WRAPPER_CLOSE}`,
};

// ── Product Launch (1) ──────────────────────────────────────────────────────

const productLaunch01: EmailTemplate = {
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

// ── Export all ───────────────────────────────────────────────────────────────

export const emailTemplates: EmailTemplate[] = [
  // Welcome (5)
  welcome01, welcome02, welcome03, welcome04, welcome05,
  // Abandoned Cart (5)
  abandonedCart01, abandonedCart02, abandonedCart03, abandonedCart04, abandonedCart05,
  // Promo (5)
  promo01, promo02, promo03, promo04, promo05,
  // Newsletter (5)
  newsletter01, newsletter02, newsletter03, newsletter04, newsletter05,
  // Win-back (5)
  winBack01, winBack02, winBack03, winBack04, winBack05,
  // Post-purchase (5)
  postPurchase01, postPurchase02, postPurchase03, postPurchase04, postPurchase05,
  // Review Request (5)
  reviewRequest01, reviewRequest02, reviewRequest03, reviewRequest04, reviewRequest05,
  // Back-in-stock (5)
  backInStock01, backInStock02, backInStock03, backInStock04, backInStock05,
  // Birthday (5)
  birthday01, birthday02, birthday03, birthday04, birthday05,
  // Seasonal (5)
  seasonal01, seasonal02, seasonal03, seasonal04, seasonal05,
  // Product Launch (1)
  productLaunch01,
];

export function getTemplatesByCategory(category: string): EmailTemplate[] {
  return emailTemplates.filter(t => t.category === category);
}

export function getTemplateById(id: string): EmailTemplate | undefined {
  return emailTemplates.find(t => t.id === id);
}
