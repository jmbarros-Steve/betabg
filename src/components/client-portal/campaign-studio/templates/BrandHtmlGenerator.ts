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
}

export interface ProductItem {
  title: string;
  image_url: string;
  price: string;
  handle: string;
  url: string;
  count?: number;
}

export interface EmailSection {
  type: 'header' | 'hero_image' | 'title' | 'intro' | 'product_grid' | 'coupon' | 'cta' | 'footer' | 'custom_blocks';
  props?: Record<string, any>;
}

const DEFAULT_BRAND: BrandIdentity = {
  colors: {
    primary: '#193a43',
    accent: '#ff5b00',
    secondaryBg: '#ffece1',
    footerBg: '#f4f4f8',
    border: '#e0e6f4',
    text: '#193a43',
    textLight: '#6b7280',
  },
  fonts: {
    heading: 'Kaisei Tokumin',
    headingType: 'serif',
    body: 'Anonymous Pro',
    bodyType: 'monospace',
  },
  buttons: { borderRadius: 24, height: 48, style: 'pill' },
  aesthetic: 'Modern Botanical Artisan',
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
  return `'${brand.fonts.heading}', ${brand.fonts.headingType || 'serif'}`;
}

function bodyFont(brand: BrandIdentity): string {
  return `'${brand.fonts.body}', ${brand.fonts.bodyType || 'sans-serif'}`;
}

function renderButton(text: string, url: string, brand: BrandIdentity): string {
  const br = brand.buttons.borderRadius;
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
    <tr><td align="center" style="background-color:${brand.colors.accent};border-radius:${br}px;">
      <a href="${url}" target="_blank" style="display:inline-block;padding:14px 36px;color:#ffffff;font-family:${bodyFont(brand)};font-size:15px;font-weight:600;text-decoration:none;border-radius:${br}px;min-height:${brand.buttons.height}px;line-height:${brand.buttons.height - 28}px;">
        ${text}
      </a>
    </td></tr>
  </table>`;
}

function renderProductGrid(products: ProductItem[], layout: string, brand: BrandIdentity, showPrice = true, showButton = true, buttonText = 'Comprar'): string {
  if (!products.length) return '';

  const cols = layout === 'grid_2x2' ? 2 : layout === 'grid_3x1' ? 3 : Math.min(products.length, 3);
  const rows: ProductItem[][] = [];
  for (let i = 0; i < products.length; i += cols) {
    rows.push(products.slice(i, i + cols));
  }

  const widthPct = Math.floor(100 / cols);

  return rows.map(row => {
    const cells = row.map(p => {
      const imgUrl = p.image_url?.includes('_400x') ? p.image_url : p.image_url?.replace(/\.(jpg|png|webp)/, '_400x.$1') || '';
      return `<td style="width:${widthPct}%;vertical-align:top;padding:8px;text-align:center;">
        ${imgUrl ? `<a href="${p.url}" target="_blank"><img src="${imgUrl}" alt="${p.title}" style="max-width:100%;border-radius:8px;margin-bottom:8px;" /></a>` : ''}
        <p style="margin:0 0 4px;font-family:${headingFont(brand)};font-size:14px;font-weight:600;color:${brand.colors.text};">${p.title}</p>
        ${showPrice && p.price ? `<p style="margin:0 0 8px;font-family:${bodyFont(brand)};font-size:14px;color:${brand.colors.textLight};">${p.price}</p>` : ''}
        ${showButton ? `<a href="${p.url}" target="_blank" style="display:inline-block;background:${brand.colors.accent};color:#fff;padding:10px 24px;border-radius:${brand.buttons.borderRadius}px;text-decoration:none;font-family:${bodyFont(brand)};font-size:13px;font-weight:600;">${buttonText}</a>` : ''}
      </td>`;
    }).join('');

    // Pad remaining cells if row is shorter than cols
    const emptyCount = cols - row.length;
    const emptyCells = Array(emptyCount).fill(`<td style="width:${widthPct}%;"></td>`).join('');

    return `<table style="width:100%;border-collapse:collapse;"><tr>${cells}${emptyCells}</tr></table>`;
  }).join('');
}

function renderHeader(brand: BrandIdentity): string {
  const logo = brand.logoUrl
    ? `<img src="${brand.logoUrl}" alt="" style="max-height:48px;max-width:200px;" />`
    : '';
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${brand.colors.primary};">
    <tr><td style="padding:20px 24px;text-align:center;">
      ${logo}
    </td></tr>
  </table>`;
}

function renderFooter(brand: BrandIdentity): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${brand.colors.footerBg};border-top:1px solid ${brand.colors.border};">
    <tr><td style="padding:24px;text-align:center;font-family:${bodyFont(brand)};font-size:12px;color:${brand.colors.textLight};line-height:1.6;">
      <p style="margin:0 0 8px;">{{ organization.name }}</p>
      <p style="margin:0 0 8px;">{{ organization.address }}</p>
      <p style="margin:0;">
        <a href="{{ manage_preferences_url }}" style="color:${brand.colors.accent};text-decoration:underline;">Preferencias</a>
        &nbsp;|&nbsp;
        <a href="{{ unsubscribe_url }}" style="color:${brand.colors.accent};text-decoration:underline;">Desuscribirse</a>
      </p>
    </td></tr>
  </table>`;
}

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
              <img src="${options.heroImageUrl}" alt="" style="width:100%;display:block;" />
            </td></tr></table>`
          : '';

      case 'title':
        return `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="padding:32px 24px 8px;text-align:center;">
            <h1 style="margin:0;font-family:${headingFont(brand)};font-size:28px;font-weight:700;color:${brand.colors.text};line-height:1.3;">
              ${options.title || ''}
            </h1>
          </td>
        </tr></table>`;

      case 'intro':
        return `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="padding:12px 24px 24px;text-align:center;">
            <p style="margin:0;font-family:${bodyFont(brand)};font-size:15px;color:${brand.colors.textLight};line-height:1.6;">
              ${options.introText || ''}
            </p>
          </td>
        </tr></table>`;

      case 'product_grid': {
        const layout = section.props?.layout || 'horizontal';
        const limit = section.props?.limit || products.length;
        const slicedProducts = products.slice(0, limit);
        return `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="padding:8px 16px;">
            ${renderProductGrid(slicedProducts, layout, brand, section.props?.showPrice !== false, section.props?.showButton !== false, section.props?.buttonText || 'Comprar')}
          </td>
        </tr></table>`;
      }

      case 'coupon':
        return `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="padding:16px 24px;">
            <div style="border:2px dashed ${brand.colors.border};border-radius:12px;padding:24px;text-align:center;background:${brand.colors.secondaryBg};">
              <p style="margin:0 0 8px;font-family:${bodyFont(brand)};font-size:14px;color:${brand.colors.textLight};">${options.couponDescription || ''}</p>
              <p style="margin:0 0 12px;font-family:${headingFont(brand)};font-size:32px;font-weight:700;color:${brand.colors.primary};letter-spacing:3px;">${options.couponCode || ''}</p>
              ${options.couponExpiry ? `<p style="margin:0 0 12px;font-family:${bodyFont(brand)};font-size:12px;color:${brand.colors.textLight};">Válido hasta: ${options.couponExpiry}</p>` : ''}
              ${renderButton('Usar cupón', `${brand.shopUrl}/discount/${options.couponCode || ''}`, brand)}
            </div>
          </td>
        </tr></table>`;

      case 'cta':
        return `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="padding:24px;text-align:center;">
            ${renderButton(options.ctaText || 'Ver más', options.ctaUrl || brand.shopUrl, brand)}
          </td>
        </tr></table>`;

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

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  ${googleFontsImport(brand)}
  <style>
    body { margin:0; padding:0; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table { border-spacing:0; }
    td { padding:0; }
    img { border:0; display:block; outline:none; text-decoration:none; }
    @media only screen and (max-width: 600px) {
      .email-container { width:100% !important; }
      td[class="mobile-full"] { display:block !important; width:100% !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f8;font-family:${bodyFont(brand)};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f8;">
    <tr><td align="center" style="padding:16px 0;">
      <table class="email-container" role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td>
${sectionHtml}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
