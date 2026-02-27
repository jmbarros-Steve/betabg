// BrandHtmlGenerator — Pure TypeScript email HTML generator with brand identity
// Generates table-based, email-client-compatible HTML with inline styles

import type { EmailBlock } from '../../email-blocks/blockTypes';
import { renderBlockToHtml } from '../../email-blocks/blockRenderer';

export interface BrandIdentity {
  colors: {
    primary: string;
    accent: string;
    secondaryBg: string;
    footerBg: string;
    border: string;
    text: string;
    textLight: string;
  };
  fonts: {
    heading: string;
    headingType: string;
    body: string;
    bodyType: string;
  };
  buttons: {
    borderRadius: number;
    height: number;
    style: string;
  };
  aesthetic: string;
  logoUrl: string;
  shopUrl: string;
  socialLinks?: {
    instagram?: string;
    facebook?: string;
    tiktok?: string;
    twitter?: string;
    youtube?: string;
    pinterest?: string;
    whatsapp?: string;
  };
  farewellMessage?: string;
  senderName?: string;
}

export interface ProductItem {
  title: string;
  image_url: string;
  price: string;
  handle: string;
  url: string;
  count?: number;
  compareAtPrice?: string;
}

export interface EmailSection {
  type: 'header' | 'hero_image' | 'title' | 'intro' | 'product_grid' | 'coupon' | 'cta' | 'farewell' | 'social' | 'footer' | 'custom_blocks' | 'divider' | 'spacer';
  props?: Record<string, any>;
}

const DEFAULT_BRAND: BrandIdentity = {
  colors: {
    primary: '#1a1a2e',
    accent: '#e94560',
    secondaryBg: '#fef2f4',
    footerBg: '#f4f4f8',
    border: '#e5e7eb',
    text: '#1a1a2e',
    textLight: '#6b7280',
  },
  fonts: {
    heading: 'Inter',
    headingType: 'sans-serif',
    body: 'Inter',
    bodyType: 'sans-serif',
  },
  buttons: { borderRadius: 8, height: 44, style: 'rounded' },
  aesthetic: 'Modern Clean',
  logoUrl: '',
  shopUrl: '',
};

function googleFontsImport(brand: BrandIdentity): string {
  const families = [brand.fonts.heading, brand.fonts.body]
    .filter(Boolean)
    .map(f => f.replace(/\s+/g, '+'))
    .join('&family=');
  return families
    ? `<link href="https://fonts.googleapis.com/css2?family=${families}:wght@400;600;700&display=swap" rel="stylesheet" />`
    : '';
}

function headingFont(brand: BrandIdentity): string {
  return `'${brand.fonts.heading}', ${brand.fonts.headingType || 'sans-serif'}`;
}

function bodyFont(brand: BrandIdentity): string {
  return `'${brand.fonts.body}', ${brand.fonts.bodyType || 'sans-serif'}`;
}

/* ------------------------------------------------------------------ */
/*  Helpers: hex to rgba for subtle overlays                          */
/* ------------------------------------------------------------------ */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ------------------------------------------------------------------ */
/*  renderButton                                                      */
/* ------------------------------------------------------------------ */
function renderButton(text: string, url: string, brand: BrandIdentity): string {
  const br = brand.buttons.borderRadius;
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
    <tr><td align="center" style="background-color:${brand.colors.accent};border-radius:${br}px;">
      <a href="${url}" target="_blank" style="display:inline-block;padding:16px 44px;color:#ffffff;font-family:${bodyFont(brand)};font-size:16px;font-weight:600;text-decoration:none;border-radius:${br}px;letter-spacing:0.3px;min-height:${brand.buttons.height}px;line-height:${brand.buttons.height - 28}px;">
        ${text}
      </a>
    </td></tr>
  </table>`;
}

/* ------------------------------------------------------------------ */
/*  renderProductGrid                                                 */
/* ------------------------------------------------------------------ */
function renderProductGrid(
  products: ProductItem[],
  layout: string,
  brand: BrandIdentity,
  showPrice = true,
  showButton = true,
  buttonText = 'Comprar'
): string {
  if (!products.length) return '';

  const br = brand.buttons.borderRadius;

  // Build price HTML helper
  const priceHtml = (p: ProductItem, fontSize: string, marginBottom: string): string => {
    if (!showPrice || !p.price) return '';
    if (p.compareAtPrice) {
      return `<p style="margin:0 0 ${marginBottom};font-family:${bodyFont(brand)};font-size:${fontSize};color:${brand.colors.textLight};line-height:1.4;"><span style="text-decoration:line-through;color:${brand.colors.textLight};opacity:0.6;">${p.compareAtPrice}</span> <span style="color:${brand.colors.accent};font-weight:600;">${p.price}</span></p>`;
    }
    return `<p style="margin:0 0 ${marginBottom};font-family:${bodyFont(brand)};font-size:${fontSize};color:${brand.colors.textLight};line-height:1.4;">${p.price}</p>`;
  };

  // ---- Horizontal layout: 1 product per row, image left + details right ----
  if (layout === 'horizontal') {
    return products.map(p => {
      const imgUrl = p.image_url?.includes('_400x') ? p.image_url : p.image_url?.replace(/\.(jpg|png|webp)/, '_400x.$1') || '';
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
  <tr>
    <td style="width:180px;vertical-align:top;">
      <a href="${p.url}" target="_blank">
        <img src="${imgUrl}" alt="${p.title}" style="width:180px;height:180px;object-fit:cover;border-radius:12px;display:block;" />
      </a>
    </td>
    <td style="vertical-align:top;padding:8px 0 8px 20px;">
      <p style="margin:0 0 6px;font-family:${headingFont(brand)};font-size:16px;font-weight:600;color:${brand.colors.text};line-height:1.3;">${p.title}</p>
      ${priceHtml(p, '15px', '16px')}
      ${showButton ? `<a href="${p.url}" target="_blank" style="display:inline-block;background:${brand.colors.accent};color:#fff;padding:12px 28px;border-radius:${br}px;text-decoration:none;font-family:${bodyFont(brand)};font-size:14px;font-weight:600;">${buttonText}</a>` : ''}
    </td>
  </tr>
</table>`;
    }).join('');
  }

  // ---- Grid layouts: 2x2 or 3x1 ----
  const cols = layout === 'grid_2x2' ? 2 : layout === 'grid_3x1' ? 3 : Math.min(products.length, 3);
  const rows: ProductItem[][] = [];
  for (let i = 0; i < products.length; i += cols) {
    rows.push(products.slice(i, i + cols));
  }

  const widthPct = Math.floor(100 / cols);

  return rows.map(row => {
    const cells = row.map(p => {
      const imgUrl = p.image_url?.includes('_400x') ? p.image_url : p.image_url?.replace(/\.(jpg|png|webp)/, '_400x.$1') || '';
      return `<td style="width:${widthPct}%;vertical-align:top;padding:12px;text-align:center;">
        ${imgUrl ? `<a href="${p.url}" target="_blank"><img src="${imgUrl}" alt="${p.title}" style="width:100%;height:auto;border-radius:12px;margin-bottom:12px;display:block;" /></a>` : ''}
        <p style="margin:0 0 4px;font-family:${headingFont(brand)};font-size:15px;font-weight:600;color:${brand.colors.text};line-height:1.3;">${p.title}</p>
        ${priceHtml(p, '14px', '12px')}
        ${showButton ? `<a href="${p.url}" target="_blank" style="display:inline-block;background:${brand.colors.accent};color:#fff;padding:10px 20px;border-radius:${br}px;text-decoration:none;font-family:${bodyFont(brand)};font-size:13px;font-weight:600;">${buttonText}</a>` : ''}
      </td>`;
    }).join('');

    const emptyCount = cols - row.length;
    const emptyCells = Array(emptyCount).fill(`<td style="width:${widthPct}%;"></td>`).join('');

    return `<table style="width:100%;border-collapse:collapse;"><tr>${cells}${emptyCells}</tr></table>`;
  }).join('');
}

/* ------------------------------------------------------------------ */
/*  renderHeader                                                      */
/* ------------------------------------------------------------------ */
function renderHeader(brand: BrandIdentity): string {
  if (!brand.logoUrl) return '';

  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${brand.colors.primary};">
    <tr><td style="padding:32px 40px;text-align:center;border-bottom:1px solid ${hexToRgba(brand.colors.border, 0.2)};">
      <img src="${brand.logoUrl}" alt="" style="max-height:60px;max-width:240px;" />
    </td></tr>
  </table>`;
}

/* ------------------------------------------------------------------ */
/*  renderSocialLinks                                                 */
/* ------------------------------------------------------------------ */
function renderSocialLinks(brand: BrandIdentity): string {
  const links = brand.socialLinks || {};
  const socialItems: { name: string; url: string; label: string }[] = [];

  if (links.instagram) socialItems.push({ name: 'instagram', url: links.instagram, label: 'Instagram' });
  if (links.facebook) socialItems.push({ name: 'facebook', url: links.facebook, label: 'Facebook' });
  if (links.tiktok) socialItems.push({ name: 'tiktok', url: links.tiktok, label: 'TikTok' });
  if (links.twitter) socialItems.push({ name: 'twitter', url: links.twitter, label: 'Twitter' });
  if (links.youtube) socialItems.push({ name: 'youtube', url: links.youtube, label: 'YouTube' });
  if (links.pinterest) socialItems.push({ name: 'pinterest', url: links.pinterest, label: 'Pinterest' });

  if (socialItems.length === 0) return '';

  const linkHtml = socialItems.map(s =>
    `<a href="${s.url}" target="_blank" style="display:inline-block;padding:8px 16px;margin:4px;border-radius:20px;background:${brand.colors.secondaryBg};color:${brand.colors.text};font-size:13px;font-weight:500;text-decoration:none;font-family:${bodyFont(brand)};">${s.label}</a>`
  ).join('');

  return `<table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:24px 48px;text-align:center;border-top:1px solid ${brand.colors.border};">
      ${linkHtml}
    </td></tr>
  </table>`;
}

/* ------------------------------------------------------------------ */
/*  renderFarewell                                                    */
/* ------------------------------------------------------------------ */
function renderFarewell(brand: BrandIdentity): string {
  // Don't render farewell section if neither message nor sender is set
  if (!brand.farewellMessage && !brand.senderName) return '';

  const message = brand.farewellMessage || '';
  const sender = brand.senderName || '{{ organization.name }}';
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${brand.colors.secondaryBg};">
    <tr><td style="padding:36px 48px 16px;text-align:center;">
      <hr style="border:none;border-top:1px solid ${brand.colors.border};margin:0 auto 24px;width:60px;" />
      ${message ? `<p style="margin:0 0 12px;font-family:${bodyFont(brand)};font-size:15px;color:${brand.colors.textLight};line-height:1.7;font-style:italic;">${message}</p>` : ''}
      <p style="margin:0;font-family:${headingFont(brand)};font-size:16px;font-weight:600;color:${brand.colors.text};">
        &mdash; ${sender}
      </p>
    </td></tr>
  </table>`;
}

/* ------------------------------------------------------------------ */
/*  renderFooter                                                      */
/* ------------------------------------------------------------------ */
function renderFooter(brand: BrandIdentity): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${brand.colors.footerBg};border-top:1px solid ${brand.colors.border};">
    <tr><td style="padding:32px 48px;text-align:center;font-family:${bodyFont(brand)};font-size:12px;color:${brand.colors.textLight};line-height:1.8;">
      <p style="margin:0 0 8px;">{{ organization.name }}</p>
      <p style="margin:0 0 12px;">{{ organization.address }}</p>
      <p style="margin:0;">
        <a href="{{ manage_preferences_url }}" style="color:${brand.colors.accent};text-decoration:none;font-weight:500;">Preferencias</a>
        &nbsp;&nbsp;&middot;&nbsp;&nbsp;
        <a href="{{ unsubscribe_url }}" style="color:${brand.colors.accent};text-decoration:none;font-weight:500;">Desuscribirse</a>
      </p>
    </td></tr>
  </table>`;
}

/* ------------------------------------------------------------------ */
/*  renderDivider                                                     */
/* ------------------------------------------------------------------ */
function renderDivider(brand: BrandIdentity, props?: Record<string, any>): string {
  const color = props?.color || brand.colors.border;
  const style = props?.style || 'solid';
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:8px 24px;">
      <hr style="border:none;border-top:1px ${style} ${color};margin:0;" />
    </td></tr>
  </table>`;
}

/* ------------------------------------------------------------------ */
/*  renderSpacer                                                      */
/* ------------------------------------------------------------------ */
function renderSpacer(props?: Record<string, any>): string {
  const height = props?.height || 24;
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="height:${height}px;font-size:1px;line-height:1px;">&nbsp;</td></tr>
  </table>`;
}

/* ================================================================== */
/*  GenerateEmailOptions & main generator                             */
/* ================================================================== */

export interface GenerateEmailOptions {
  brand: BrandIdentity;
  sections: EmailSection[];
  products?: ProductItem[];
  customBlocks?: EmailBlock[];
  title?: string;
  introText?: string;
  heroImageUrl?: string;
  ctaText?: string;
  ctaUrl?: string;
  couponCode?: string;
  couponDescription?: string;
  couponExpiry?: string;
  previewText?: string;
}

export function generateBrandEmail(options: GenerateEmailOptions): string {
  const brand = { ...DEFAULT_BRAND, ...options.brand };
  const products = options.products || [];

  const sectionHtml = options.sections.map(section => {
    switch (section.type) {
      case 'header':
        return renderHeader(brand);

      case 'hero_image':
        return options.heroImageUrl
          ? `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td>
              <a href="${options.ctaUrl || brand.shopUrl}" target="_blank">
                <img src="${options.heroImageUrl}" alt="" style="width:100%;display:block;" />
              </a>
            </td></tr></table>`
          : '';

      case 'title':
        return `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="padding:40px 48px 12px;text-align:center;">
            <h1 style="margin:0;font-family:${headingFont(brand)};font-size:36px;font-weight:700;color:${brand.colors.text};line-height:1.2;letter-spacing:-0.5px;">
              ${options.title || ''}
            </h1>
          </td>
        </tr></table>`;

      case 'intro':
        return `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="padding:0 48px 36px;text-align:center;">
            <p style="margin:0;font-family:${bodyFont(brand)};font-size:16px;color:${brand.colors.textLight};line-height:1.8;">
              ${options.introText || ''}
            </p>
          </td>
        </tr></table>`;

      case 'product_grid': {
        const layout = section.props?.layout || 'horizontal';
        const limit = section.props?.limit || products.length;
        const slicedProducts = products.slice(0, limit);
        return `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="padding:8px 32px;">
            ${renderProductGrid(slicedProducts, layout, brand, section.props?.showPrice !== false, section.props?.showButton !== false, section.props?.buttonText || 'Comprar')}
          </td>
        </tr></table>`;
      }

      case 'coupon':
        return `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="padding:24px 40px;">
            <div style="border:2px dashed ${brand.colors.border};border-radius:16px;padding:32px;text-align:center;background:${brand.colors.secondaryBg};">
              <p style="margin:0 0 12px;font-family:${bodyFont(brand)};font-size:15px;color:${brand.colors.textLight};line-height:1.5;">${options.couponDescription || ''}</p>
              <p style="margin:0 0 16px;font-family:${headingFont(brand)};font-size:36px;font-weight:700;color:${brand.colors.primary};letter-spacing:4px;">${options.couponCode || ''}</p>
              ${options.couponExpiry ? `<p style="margin:0 0 16px;font-family:${bodyFont(brand)};font-size:13px;color:${brand.colors.textLight};">Valido hasta: ${options.couponExpiry}</p>` : ''}
              ${renderButton('Usar cupon', `${brand.shopUrl}/discount/${options.couponCode || ''}`, brand)}
            </div>
          </td>
        </tr></table>`;

      case 'cta':
        return `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="padding:36px 48px;text-align:center;">
            ${renderButton(options.ctaText || 'Ver mas', options.ctaUrl || brand.shopUrl, brand)}
          </td>
        </tr></table>`;

      case 'farewell':
        return renderFarewell(brand);

      case 'social':
        return renderSocialLinks(brand);

      case 'divider':
        return renderDivider(brand, section.props);

      case 'spacer':
        return renderSpacer(section.props);

      case 'footer':
        return renderFooter(brand);

      case 'custom_blocks': {
        const blocks = options.customBlocks || [];
        const templateColors = {
          primary: brand.colors.primary,
          secondary: brand.colors.secondaryBg,
          accent: brand.colors.accent,
          button: brand.colors.accent,
          buttonText: '#ffffff',
          font: bodyFont(brand),
        };
        return blocks.map(b => renderBlockToHtml(b, templateColors)).join('');
      }

      default:
        return '';
    }
  }).join('\n');

  // Hidden preheader text for email clients
  const preheader = options.previewText
    ? `<div style="display:none;font-size:1px;color:#f6f6f9;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${options.previewText}${'&nbsp;&zwnj;'.repeat(30)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <!--[if mso]>
  <xml>
    <o:OfficeDocumentSettings>
      <o:AllowPNG/>
      <o:PixelsPerInch>96</o:PixelsPerInch>
    </o:OfficeDocumentSettings>
  </xml>
  <![endif]-->
  ${googleFontsImport(brand)}
  <style>
    body { margin:0; padding:0; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table { border-spacing:0; mso-table-lspace:0pt; mso-table-rspace:0pt; }
    td { padding:0; }
    img { border:0; display:block; outline:none; text-decoration:none; max-width:100%; -ms-interpolation-mode:bicubic; }
    a { color:${brand.colors.accent}; }
    @media only screen and (max-width: 600px) {
      .email-container { width:100% !important; }
      td[class="mobile-full"] { display:block !important; width:100% !important; }
      h1 { font-size:28px !important; }
      td { padding-left:16px !important; padding-right:16px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f6f6f9;font-family:${bodyFont(brand)};-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f6f6f9;">
    <tr><td align="center" style="padding:24px 0;">
      <!--[if mso]>
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td>
      <![endif]-->
      <table class="email-container" role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr><td>
${sectionHtml}
        </td></tr>
      </table>
      <!--[if mso]>
      </td></tr></table>
      <![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
}
