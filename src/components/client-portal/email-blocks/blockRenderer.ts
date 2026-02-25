import { type EmailBlock } from './blockTypes';

// Render a single block to email-compatible HTML (tables, inline styles)
export function renderBlockToHtml(block: EmailBlock, templateColors?: {
  primary: string; secondary: string; accent: string; button: string; buttonText: string; font: string;
}): string {
  const p = block.props;
  const font = templateColors?.font || 'Arial, sans-serif';

  switch (block.type) {
    case 'text':
      return `<div style="font-family:${font};font-size:${p.fontSize || 14}px;color:${p.color || '#333'};text-align:${p.align || 'left'};line-height:1.6;padding:8px 0;">${p.content || ''}</div>`;

    case 'image':
      const img = `<img src="${p.src || 'https://placehold.co/600x300/e2e8f0/64748b?text=Imagen'}" alt="${p.alt || ''}" style="max-width:100%;width:${p.width || '100%'};display:block;border-radius:4px;" />`;
      const imgWrapped = p.link ? `<a href="${p.link}" target="_blank">${img}</a>` : img;
      return `<div style="text-align:${p.align || 'center'};padding-top:${p.paddingTop || 0}px;padding-bottom:${p.paddingBottom || 0}px;">${imgWrapped}</div>`;

    case 'button': {
      const bg = p.bgColor || templateColors?.button || '#000';
      const tc = p.textColor || templateColors?.buttonText || '#fff';
      return `<div style="text-align:${p.align || 'center'};padding:16px 0;">
        <a href="${p.url || '#'}" target="_blank" style="display:inline-block;background-color:${bg};color:${tc};padding:${p.paddingV || 14}px ${p.paddingH || 32}px;border-radius:${p.borderRadius || 4}px;text-decoration:none;font-weight:600;font-family:${font};font-size:15px;${p.width === '100%' ? 'width:100%;text-align:center;box-sizing:border-box;' : p.width === '50%' ? 'width:50%;text-align:center;box-sizing:border-box;' : ''}">${p.text || 'Botón'}</a>
      </div>`;
    }

    case 'header_bar':
      return `<div style="background-color:${p.bgColor || '#000'};color:${p.textColor || '#fff'};padding:12px 20px;text-align:center;font-size:${p.fontSize || 14}px;font-family:${font};font-weight:600;">${p.icon ? p.icon + ' ' : ''}${p.text || ''}</div>`;

    case 'drop_shadow': {
      const intensityMap: Record<string, string> = { soft: '0 2px 8px', medium: '0 4px 16px', strong: '0 8px 32px' };
      const shadow = intensityMap[p.intensity || 'medium'] || intensityMap.medium;
      const pos = p.position === 'top' ? 'margin-bottom' : 'margin-top';
      return `<div style="height:1px;${pos}:-1px;box-shadow:${shadow} ${p.color || '#000'}33;"></div>`;
    }

    case 'divider':
      return `<div style="margin-top:${p.marginTop || 16}px;margin-bottom:${p.marginBottom || 16}px;text-align:center;">
        <hr style="border:none;border-top:${p.thickness || 1}px ${p.style || 'solid'} ${p.color || '#e5e7eb'};width:${p.width || '100%'};display:inline-block;" />
      </div>`;

    case 'social_links': {
      const platforms: { key: string; label: string; icon: string }[] = [
        { key: 'facebook', label: 'Facebook', icon: 'f' },
        { key: 'instagram', label: 'Instagram', icon: '📷' },
        { key: 'tiktok', label: 'TikTok', icon: '🎵' },
        { key: 'twitter', label: 'X', icon: '𝕏' },
        { key: 'youtube', label: 'YouTube', icon: '▶' },
        { key: 'linkedin', label: 'LinkedIn', icon: 'in' },
        { key: 'pinterest', label: 'Pinterest', icon: 'P' },
        { key: 'whatsapp', label: 'WhatsApp', icon: '💬' },
      ];
      const size = p.iconSize === 'small' ? 28 : p.iconSize === 'large' ? 44 : 36;
      const links = platforms
        .filter(pl => p[pl.key])
        .map(pl => `<a href="${p[pl.key]}" target="_blank" style="display:inline-block;width:${size}px;height:${size}px;line-height:${size}px;text-align:center;background:#333;color:#fff;border-radius:50%;margin:0 4px;text-decoration:none;font-size:${size * 0.45}px;" title="${pl.label}">${pl.icon}</a>`)
        .join('');
      return links ? `<div style="text-align:${p.align || 'center'};padding:16px 0;">${links}</div>` : '<div style="text-align:center;padding:16px;color:#999;font-size:12px;">Configura tus redes sociales</div>';
    }

    case 'spacer':
      return `<div style="height:${p.height || 30}px;"></div>`;

    case 'product':
      return `<div style="padding:16px 0;font-family:${font};">
        ${p.imageUrl ? `<div style="text-align:center;margin-bottom:12px;"><img src="${p.imageUrl}" alt="${p.name || ''}" style="max-width:100%;border-radius:8px;" /></div>` : ''}
        <h3 style="margin:0 0 8px;font-size:18px;color:#111;">${p.name || 'Producto'}</h3>
        ${p.showPrice !== false && p.price ? `<p style="margin:0 0 8px;font-size:16px;font-weight:700;color:${templateColors?.primary || '#000'};">${p.price}</p>` : ''}
        ${p.showDescription !== false && p.description ? `<p style="margin:0 0 12px;font-size:14px;color:#666;">${p.description}</p>` : ''}
        ${p.showButton !== false ? `<div style="text-align:center;"><a href="${p.link || '#'}" style="display:inline-block;background:${templateColors?.button || '#000'};color:${templateColors?.buttonText || '#fff'};padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:600;">${p.buttonText || 'Comprar'}</a></div>` : ''}
      </div>`;

    case 'coupon':
      return `<div style="border:2px dashed #ccc;border-radius:8px;padding:24px;text-align:center;background:#f9fafb;font-family:${font};">
        <p style="margin:0 0 8px;font-size:13px;color:#666;">${p.description || ''}</p>
        <p style="margin:0 0 12px;font-size:28px;font-weight:800;color:#111;letter-spacing:3px;">${p.code || 'CÓDIGO'}</p>
        ${p.expiresAt ? `<p style="margin:0 0 12px;font-size:12px;color:#999;">Válido hasta: ${p.expiresAt}</p>` : ''}
        <a href="${p.shopUrl || '#'}/discount/${p.code || ''}" style="display:inline-block;background:${templateColors?.button || '#000'};color:${templateColors?.buttonText || '#fff'};padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:600;">${p.buttonText || 'Usar cupón'}</a>
      </div>`;

    case 'table': {
      const data = p.data || [['', ''], ['', '']];
      const rows = data.map((row: string[], ri: number) => {
        const tag = ri === 0 ? 'th' : 'td';
        const bgStyle = ri === 0 ? `background:${p.headerBgColor || '#000'};color:${p.headerTextColor || '#fff'};` : '';
        const cells = row.map((cell: string) => `<${tag} style="padding:10px 12px;${bgStyle}${p.showBorders ? `border:1px solid #ddd;` : ''}">${cell}</${tag}>`).join('');
        return `<tr>${cells}</tr>`;
      }).join('');
      return `<table style="width:100%;border-collapse:collapse;font-family:${font};font-size:14px;">${rows}</table>`;
    }

    case 'review':
      return `<div style="padding:20px;font-family:${font};text-align:center;">
        <div style="font-size:24px;margin-bottom:8px;">${'⭐'.repeat(p.rating || 5)}</div>
        <p style="font-style:italic;font-size:16px;color:#333;margin:0 0 12px;">"${p.reviewText || ''}"</p>
        <p style="font-size:14px;color:#666;margin:0;font-weight:600;">— ${p.customerName || 'Cliente'}</p>
      </div>`;

    case 'video': {
      const thumb = p.thumbnailUrl || (p.url ? `https://img.youtube.com/vi/${(p.url.match(/(?:v=|youtu\.be\/)([^&]+)/) || [])[1] || ''}/hqdefault.jpg` : '');
      return `<div style="text-align:center;padding:16px 0;">
        <a href="${p.url || '#'}" target="_blank" style="display:inline-block;position:relative;">
          <img src="${thumb || 'https://placehold.co/600x340/1a1a2e/e94560?text=Video'}" alt="Video" style="max-width:100%;border-radius:8px;" />
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:60px;height:60px;background:rgba(0,0,0,0.7);border-radius:50%;display:flex;align-items:center;justify-content:center;">
            <div style="width:0;height:0;border-left:20px solid #fff;border-top:12px solid transparent;border-bottom:12px solid transparent;margin-left:4px;"></div>
          </div>
        </a>
      </div>`;
    }

    case 'html':
      return p.code || '';

    case 'columns': {
      const cols = p.columns || [[], []];
      const count = cols.length;
      const widthPct = Math.floor(100 / count);
      const colsHtml = cols.map((colBlocks: EmailBlock[]) => {
        const inner = colBlocks.map((b: EmailBlock) => renderBlockToHtml(b, templateColors)).join('');
        return `<td style="width:${widthPct}%;vertical-align:top;padding:4px 8px;">${inner || '<p style="color:#ccc;text-align:center;font-size:12px;">Arrastra bloques aquí</p>'}</td>`;
      }).join('');
      return `<table style="width:100%;border-collapse:collapse;"><tr>${colsHtml}</tr></table>`;
    }

    case 'split': {
      const layouts: Record<string, number[]> = {
        '50/50': [50, 50], '33/67': [33, 67], '67/33': [67, 33],
        '33/33/33': [33, 33, 34], '25/75': [25, 75], '75/25': [75, 25],
      };
      const widths = layouts[p.layout] || [50, 50];
      const cols = p.columns || [[], []];
      const colsHtml = widths.map((w, i) => {
        const inner = (cols[i] || []).map((b: EmailBlock) => renderBlockToHtml(b, templateColors)).join('');
        return `<td style="width:${w}%;vertical-align:top;padding:4px 8px;">${inner || '<p style="color:#ccc;text-align:center;font-size:12px;">Columna</p>'}</td>`;
      }).join('');
      return `<table style="width:100%;border-collapse:collapse;"><tr>${colsHtml}</tr></table>`;
    }

    case 'section': {
      const inner = (p.children || []).map((b: EmailBlock) => renderBlockToHtml(b, templateColors)).join('');
      return `<div style="background:${p.bgColor || '#f9fafb'};padding:${p.paddingTop || 20}px ${p.paddingRight || 20}px ${p.paddingBottom || 20}px ${p.paddingLeft || 20}px;${p.borderWidth ? `border:${p.borderWidth}px solid ${p.borderColor || '#ddd'};` : ''}${p.borderRadius ? `border-radius:${p.borderRadius}px;` : ''}">${inner || '<p style="color:#ccc;text-align:center;font-size:12px;">Arrastra bloques aquí</p>'}</div>`;
    }

    default:
      return `<div style="padding:10px;color:#999;">[Bloque: ${block.type}]</div>`;
  }
}
