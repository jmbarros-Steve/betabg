import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

interface BrandData {
  name: string;
  logoUrl: string;
  storeUrl: string;
}

const KLAVIYO_BASE = 'https://a.klaviyo.com/api';

async function fetchLogoFromKlaviyo(apiKey: string): Promise<string> {
  try {
    const res = await fetch(`${KLAVIYO_BASE}/images/?page[size]=5&sort=-updated`, {
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        accept: 'application/json',
        revision: '2024-10-15',
      },
    });
    if (!res.ok) return '';
    const data: any = await res.json();
    const logo = (data.data || []).find(
      (img: any) => /logo/i.test(img.attributes?.name || '') && img.attributes?.image_url
    );
    return logo?.attributes?.image_url || '';
  } catch {
    return '';
  }
}

async function fetchClientBrand(
  serviceClient: any,
  clientId: string,
  apiKey: string,
  storeName?: string
): Promise<BrandData> {
  const { data: client } = await serviceClient
    .from('clients')
    .select('name, logo_url, website_url')
    .eq('id', clientId)
    .single();

  const storeUrl = client?.website_url || '';
  const brandName = storeName || client?.name || 'Tu Tienda';

  let logoUrl = '';
  if (client?.logo_url && !client.logo_url.includes('supabase.co/storage')) {
    logoUrl = client.logo_url;
  }
  if (!logoUrl) {
    logoUrl = await fetchLogoFromKlaviyo(apiKey);
  }

  return {
    name: brandName,
    logoUrl,
    storeUrl: storeUrl.startsWith('http') ? storeUrl : storeUrl ? `https://${storeUrl}` : '#',
  };
}

function getFlowEmailContent(flowType: string, stepIndex: number, brandName: string) {
  const defaults: Record<string, { heading: string; body: string; ctaText: string }[]> = {
    abandoned_cart: [
      { heading: `¡Olvidaste algo, {{ first_name|default:"" }}!`, body: `<p style="margin:0 0 16px;font-size:16px;color:#555;line-height:1.6;">Notamos que dejaste productos increíbles en tu carrito. ¡No los dejes escapar!</p>`, ctaText: 'Completar mi compra' },
      { heading: 'Tus productos te esperan', body: `<p style="margin:0 0 16px;font-size:16px;color:#555;line-height:1.6;">Los productos que elegiste siguen disponibles, pero no por mucho tiempo.</p>`, ctaText: 'Volver al carrito' },
      { heading: 'Última oportunidad', body: `<p style="margin:0 0 16px;font-size:16px;color:#555;line-height:1.6;">Tu carrito está por expirar. ¡Aprovecha ahora!</p>`, ctaText: 'Comprar ahora' },
    ],
    welcome_series: [
      { heading: `¡Bienvenido/a a ${brandName}!`, body: `<p style="margin:0 0 16px;font-size:16px;color:#555;line-height:1.6;">Estamos felices de tenerte. Conoce nuestra historia y lo que nos hace especiales.</p>`, ctaText: 'Conocer más' },
      { heading: 'Nuestros productos más populares', body: `<p style="margin:0 0 16px;font-size:16px;color:#555;line-height:1.6;">Descubre lo que más aman nuestros clientes.</p>`, ctaText: 'Ver productos' },
      { heading: 'Un regalo especial para ti', body: `<p style="margin:0 0 16px;font-size:16px;color:#555;line-height:1.6;">Queremos premiarte por ser parte de nuestra comunidad.</p>`, ctaText: 'Usar mi descuento' },
    ],
    post_purchase: [
      { heading: '¡Gracias por tu compra!', body: `<p style="margin:0 0 16px;font-size:16px;color:#555;line-height:1.6;">Tu pedido está en camino. Aquí tienes los detalles.</p>`, ctaText: 'Ver mi pedido' },
      { heading: '¿Cómo te fue con tu compra?', body: `<p style="margin:0 0 16px;font-size:16px;color:#555;line-height:1.6;">Tu opinión nos ayuda a mejorar. ¡Cuéntanos!</p>`, ctaText: 'Dejar reseña' },
    ],
  };

  const steps = defaults[flowType] || defaults.welcome_series!;
  const step = steps[stepIndex % steps.length];
  return step;
}

function generateProductBlockHtml(products: any[], productStrategy: string): string {
  if (productStrategy === 'cart_items') {
    return `
        <tr><td class="mobile-padding" style="padding:8px 40px 24px;">
          <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:20px;text-align:center;">
            <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#856404;">🛒 Productos del carrito</p>
            <p style="margin:0;font-size:13px;color:#856404;">Aquí aparecerán automáticamente los productos que el cliente dejó en su carrito (imagen, nombre, precio y cantidad).</p>
          </div>
        </td></tr>`;
  }

  if (!products || products.length === 0) return '';

  const productCells = products.slice(0, 3).map((p: any) => `
                <td width="33%" valign="top" style="padding:0 6px;text-align:center;">
                  <img src="${p.image_url || 'https://placehold.co/160x160/f5f5f5/999?text=Producto'}" alt="${p.title}" width="160" style="display:block;margin:0 auto 8px;border-radius:6px;border:1px solid #eee;max-width:100%;">
                  <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#1a1a1a;line-height:1.3;">${p.title}</p>
                  ${p.price ? `<p style="margin:0;font-size:14px;font-weight:700;color:#C8A84E;">$${p.price}</p>` : ''}
                </td>`).join('\n');

  return `
        <tr><td class="mobile-padding" style="padding:8px 40px 24px;">
          <p style="margin:0 0 16px;font-size:13px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:1px;">Productos destacados</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>${productCells}
            </tr>
          </table>
        </td></tr>`;
}

function generateDiscountBlockHtml(discount: { code: string; value: number; type: string; expiry?: string }): string {
  const descText = discount.type === 'percentage'
    ? `${discount.value}% de descuento`
    : discount.type === 'fixed_amount'
    ? `$${discount.value} de descuento`
    : 'Envío gratis';

  return `
        <tr><td class="mobile-padding" style="padding:8px 40px 24px;">
          <div style="background:#f8f6f0;border:2px dashed #C8A84E;border-radius:8px;padding:24px;text-align:center;">
            <p style="margin:0 0 4px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Tu código exclusivo</p>
            <p style="margin:0 0 8px;font-size:28px;font-weight:700;color:#1a1a1a;letter-spacing:3px;">${discount.code}</p>
            <p style="margin:0;font-size:14px;color:#555;">${descText}${discount.expiry ? ` · Válido hasta ${discount.expiry}` : ''}</p>
          </div>
        </td></tr>`;
}

function generateBrandedEmailHtml(
  brand: BrandData,
  config: {
    subject: string;
    previewText: string;
    flowType: string;
    stepIndex: number;
    totalSteps: number;
    products?: any[];
    productStrategy?: string;
    discount?: { code: string; value: number; type: string; expiry?: string } | null;
    discountEmailIndex?: number | null;
  }
): string {
  const { heading, body, ctaText } = getFlowEmailContent(config.flowType, config.stepIndex, brand.name);

  const logoBlock = brand.logoUrl
    ? `<img src="${brand.logoUrl}" alt="${brand.name}" width="150" style="display:block;margin:0 auto;">`
    : `<div style="font-size:24px;font-weight:700;color:#ffffff;letter-spacing:3px;font-family:Georgia,serif;text-align:center;">${brand.name.toUpperCase()}</div>`;

  // Product block: show on first email if productStrategy is set
  const showProducts = config.productStrategy && config.productStrategy !== 'none' && config.stepIndex === 0;
  const productBlock = showProducts
    ? generateProductBlockHtml(config.products || [], config.productStrategy!)
    : '';

  // Discount block: show on the designated email
  const showDiscount = config.discount && config.discountEmailIndex === config.stepIndex;
  const discountBlock = showDiscount ? generateDiscountBlockHtml(config.discount!) : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.subject}</title>
  <style>
    @media only screen and (max-width:620px) {
      .email-container { width:100% !important; }
      .fluid { width:100% !important; max-width:100% !important; height:auto !important; }
      .stack-column { display:block !important; width:100% !important; }
      .mobile-padding { padding-left:16px !important; padding-right:16px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;">
  ${config.previewText ? `<div style="display:none;max-height:0;overflow:hidden;">${config.previewText}</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;">
    <tr><td align="center" style="padding:24px 10px;">
      <table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">
        <tr><td style="background-color:#000000;padding:28px 30px 20px;text-align:center;">${logoBlock}</td></tr>
        <tr><td class="mobile-padding" style="padding:40px 40px 12px;">
          <h1 style="margin:0 0 24px;font-size:24px;font-weight:700;color:#1a1a1a;line-height:1.3;font-family:Georgia,serif;">${heading}</h1>
          ${body}
        </td></tr>
        ${productBlock}
        ${discountBlock}
        <tr><td align="center" style="padding:20px 40px 44px;">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr><td style="background-color:#1a1a1a;border-radius:30px;">
              <a href="${brand.storeUrl}" style="display:inline-block;padding:16px 44px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">${ctaText}</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:28px 40px 12px;text-align:center;">
          <p style="margin:0 0 4px;font-size:15px;color:#333;">Un abrazo,</p>
          <p style="margin:0;font-size:15px;font-weight:700;color:#1a1a1a;">El equipo de ${brand.name}</p>
        </td></tr>
        <tr><td style="padding:16px 40px 28px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#999;">
            <a href="{%unsubscribe%}" style="color:#999;text-decoration:underline;">Cancelar suscripción</a>
            &nbsp;·&nbsp;
            <a href="{%manage_preferences 'Manage Preferences'%}" style="color:#999;text-decoration:underline;">Preferencias</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();
}

export async function previewFlowEmails(c: Context) {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const serviceClient = getSupabaseAdmin();
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await serviceClient.auth.getUser(token);
    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const { connectionId, flowType, emails, products, discount, productStrategy, discountEmailIndex } = body;

    if (!connectionId) return c.json({ error: 'connectionId required' }, 400);
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return c.json({ error: 'emails array required' }, 400);
    }

    // Verify connection ownership
    const { data: connection, error: connError } = await serviceClient
      .from('platform_connections')
      .select('*, clients!inner(id, user_id, client_user_id)')
      .eq('id', connectionId)
      .eq('platform', 'klaviyo')
      .single();

    if (connError || !connection) {
      return c.json({ error: 'Connection not found' }, 404);
    }

    const clientData = connection.clients as { id: string; user_id: string; client_user_id: string | null };
    if (clientData.user_id !== user.id && clientData.client_user_id !== user.id) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    // Decrypt API key
    const { data: apiKey, error: decryptError } = await serviceClient
      .rpc('decrypt_platform_token', { encrypted_token: connection.api_key_encrypted });

    if (decryptError || !apiKey) {
      return c.json({ error: 'Token decryption failed' }, 500);
    }

    // Fetch brand data
    const brand = await fetchClientBrand(serviceClient, clientData.id, apiKey, connection.store_name);

    // Generate branded HTML for each email
    const previewEmails = emails.map((email: any, idx: number) => {
      const htmlContent = email.htmlContent || generateBrandedEmailHtml(brand, {
        subject: email.subject || `Email ${idx + 1}`,
        previewText: email.previewText || '',
        flowType: flowType || 'welcome_series',
        stepIndex: idx,
        totalSteps: emails.length,
        products: products || [],
        productStrategy: productStrategy || 'none',
        discount: discount || null,
        discountEmailIndex: discountEmailIndex ?? null,
      });

      return {
        subject: email.subject || `Email ${idx + 1}`,
        previewText: email.previewText || '',
        htmlContent,
      };
    });

    return c.json({ emails: previewEmails });
  } catch (error: unknown) {
    console.error('Error in preview-flow-emails:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return c.json({ error: message }, 500);
  }
}
