// Steve Ads — Custom Unlayer Tools
// Registered automatically when the editor loads via customJS option.
console.log('[Steve] Custom tools loading...', typeof unlayer);

// ─── 1. PRODUCTO ─────────────────────────────────────────────
unlayer.registerTool({
  name: 'steve_product',
  label: 'Producto',
  icon: 'fa-shopping-bag',
  supportedDisplayModes: ['email'],
  options: {
    content: {
      title: 'Contenido',
      position: 1,
      options: {
        productName: {
          label: 'Nombre del producto',
          defaultValue: 'Nombre del Producto',
          widget: 'text',
        },
        productPrice: {
          label: 'Precio',
          defaultValue: '$29.990',
          widget: 'text',
        },
        productImage: {
          label: 'URL de imagen',
          defaultValue: '',
          widget: 'image',
        },
        productUrl: {
          label: 'URL del producto',
          defaultValue: '#',
          widget: 'text',
        },
        buttonText: {
          label: 'Texto del botón',
          defaultValue: 'Comprar ahora',
          widget: 'text',
        },
      },
    },
    styling: {
      title: 'Estilos',
      position: 2,
      options: {
        buttonColor: {
          label: 'Color del botón',
          defaultValue: '#2563eb',
          widget: 'color_picker',
        },
        textColor: {
          label: 'Color del texto',
          defaultValue: '#1a1a1a',
          widget: 'color_picker',
        },
        backgroundColor: {
          label: 'Fondo',
          defaultValue: '#ffffff',
          widget: 'color_picker',
        },
      },
    },
  },
  values: {},
  renderer: {
    Viewer: unlayer.createViewer({
      render: function (values) {
        var imgSrc = (values.productImage && values.productImage.url) || '';
        var imgHtml = imgSrc
          ? '<img src="' + imgSrc + '" alt="' + values.productName + '" style="width:100%;max-width:280px;border-radius:8px;display:block;margin:0 auto;" />'
          : '<div style="width:280px;height:280px;background:#f4f4f5;border-radius:8px;display:flex;align-items:center;justify-content:center;margin:0 auto;color:#a1a1aa;font-size:14px;">Sin imagen</div>';
        return '<table width="100%" cellpadding="0" cellspacing="0" style="background:' + values.backgroundColor + ';"><tr><td style="padding:20px;text-align:center;">' +
          imgHtml +
          '<p style="margin:12px 0 4px;font-weight:700;font-size:16px;color:' + values.textColor + ';">' + values.productName + '</p>' +
          '<p style="margin:0 0 12px;font-size:18px;color:' + values.textColor + ';">' + values.productPrice + '</p>' +
          '<a href="' + values.productUrl + '" style="display:inline-block;padding:10px 28px;background:' + values.buttonColor + ';color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">' + values.buttonText + '</a>' +
          '</td></tr></table>';
      },
    }),
    exporters: {
      email: function (values) {
        var imgSrc = (values.productImage && values.productImage.url) || '';
        var imgHtml = imgSrc
          ? '<img src="' + imgSrc + '" alt="' + values.productName + '" width="280" style="width:280px;max-width:100%;border-radius:8px;display:block;margin:0 auto;" />'
          : '';
        return '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + values.backgroundColor + ';"><tr><td align="center" style="padding:20px;">' +
          imgHtml +
          '<p style="margin:12px 0 4px;font-weight:700;font-size:16px;color:' + values.textColor + ';">' + values.productName + '</p>' +
          '<p style="margin:0 0 12px;font-size:18px;color:' + values.textColor + ';">' + values.productPrice + '</p>' +
          '<table cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="border-radius:6px;background:' + values.buttonColor + ';"><a href="' + values.productUrl + '" style="display:inline-block;padding:10px 28px;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;">' + values.buttonText + '</a></td></tr></table>' +
          '</td></tr></table>';
      },
    },
    head: {
      css: function () { return ''; },
      js: function () { return ''; },
    },
  },
});

// ─── 2. CUPÓN ────────────────────────────────────────────────
unlayer.registerTool({
  name: 'steve_coupon',
  label: 'Cupón',
  icon: 'fa-ticket',
  supportedDisplayModes: ['email'],
  options: {
    content: {
      title: 'Contenido',
      position: 1,
      options: {
        couponCode: {
          label: 'Código del cupón',
          defaultValue: 'DESCUENTO20',
          widget: 'text',
        },
        discountText: {
          label: 'Texto del descuento',
          defaultValue: '20% de descuento en tu próxima compra',
          widget: 'text',
        },
        expiryText: {
          label: 'Texto de expiración',
          defaultValue: 'Válido hasta el 31 de este mes',
          widget: 'text',
        },
        buttonText: {
          label: 'Texto del botón',
          defaultValue: 'Usar cupón',
          widget: 'text',
        },
        buttonUrl: {
          label: 'URL del botón',
          defaultValue: '#',
          widget: 'text',
        },
      },
    },
    styling: {
      title: 'Estilos',
      position: 2,
      options: {
        backgroundColor: {
          label: 'Color de fondo',
          defaultValue: '#fef3c7',
          widget: 'color_picker',
        },
        borderColor: {
          label: 'Color del borde',
          defaultValue: '#f59e0b',
          widget: 'color_picker',
        },
        buttonColor: {
          label: 'Color del botón',
          defaultValue: '#f59e0b',
          widget: 'color_picker',
        },
      },
    },
  },
  values: {},
  renderer: {
    Viewer: unlayer.createViewer({
      render: function (values) {
        return '<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:20px;">' +
          '<div style="background:' + values.backgroundColor + ';border:2px dashed ' + values.borderColor + ';border-radius:12px;padding:24px;text-align:center;">' +
          '<p style="margin:0 0 8px;font-size:14px;color:#92400e;">' + values.discountText + '</p>' +
          '<p style="margin:0 0 12px;font-size:28px;font-weight:800;letter-spacing:4px;color:#92400e;font-family:monospace;">' + values.couponCode + '</p>' +
          '<p style="margin:0 0 16px;font-size:12px;color:#a16207;">' + values.expiryText + '</p>' +
          '<a href="' + values.buttonUrl + '" style="display:inline-block;padding:10px 28px;background:' + values.buttonColor + ';color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">' + values.buttonText + '</a>' +
          '</div>' +
          '</td></tr></table>';
      },
    }),
    exporters: {
      email: function (values) {
        return '<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:20px;">' +
          '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + values.backgroundColor + ';border:2px dashed ' + values.borderColor + ';border-radius:12px;"><tr><td style="padding:24px;text-align:center;">' +
          '<p style="margin:0 0 8px;font-size:14px;color:#92400e;">' + values.discountText + '</p>' +
          '<p style="margin:0 0 12px;font-size:28px;font-weight:800;letter-spacing:4px;color:#92400e;font-family:monospace;">' + values.couponCode + '</p>' +
          '<p style="margin:0 0 16px;font-size:12px;color:#a16207;">' + values.expiryText + '</p>' +
          '<table cellpadding="0" cellspacing="0" border="0" align="center"><tr><td style="border-radius:6px;background:' + values.buttonColor + ';"><a href="' + values.buttonUrl + '" style="display:inline-block;padding:10px 28px;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;">' + values.buttonText + '</a></td></tr></table>' +
          '</td></tr></table>' +
          '</td></tr></table>';
      },
    },
    head: {
      css: function () { return ''; },
      js: function () { return ''; },
    },
  },
});

// ─── 3. RESEÑA ───────────────────────────────────────────────
unlayer.registerTool({
  name: 'steve_review',
  label: 'Reseña',
  icon: 'fa-star',
  supportedDisplayModes: ['email'],
  options: {
    content: {
      title: 'Contenido',
      position: 1,
      options: {
        stars: {
          label: 'Estrellas (1-5)',
          defaultValue: '5',
          widget: 'counter',
        },
        reviewText: {
          label: 'Texto de la reseña',
          defaultValue: '¡Excelente producto! Superó todas mis expectativas. Lo recomiendo 100%.',
          widget: 'text',
        },
        customerName: {
          label: 'Nombre del cliente',
          defaultValue: 'Cliente Satisfecho',
          widget: 'text',
        },
      },
    },
    styling: {
      title: 'Estilos',
      position: 2,
      options: {
        starColor: {
          label: 'Color de estrellas',
          defaultValue: '#f59e0b',
          widget: 'color_picker',
        },
        backgroundColor: {
          label: 'Color de fondo',
          defaultValue: '#fafafa',
          widget: 'color_picker',
        },
        textColor: {
          label: 'Color del texto',
          defaultValue: '#374151',
          widget: 'color_picker',
        },
      },
    },
  },
  values: {},
  renderer: {
    Viewer: unlayer.createViewer({
      render: function (values) {
        var count = Math.min(5, Math.max(1, parseInt(values.stars) || 5));
        var starsHtml = '';
        for (var i = 0; i < 5; i++) {
          starsHtml += '<span style="color:' + (i < count ? values.starColor : '#d1d5db') + ';font-size:24px;">&#9733;</span>';
        }
        return '<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:20px;">' +
          '<div style="background:' + values.backgroundColor + ';border-radius:12px;padding:24px;text-align:center;">' +
          '<div style="margin-bottom:12px;">' + starsHtml + '</div>' +
          '<p style="margin:0 0 12px;font-size:15px;font-style:italic;color:' + values.textColor + ';line-height:1.5;">"' + values.reviewText + '"</p>' +
          '<p style="margin:0;font-size:13px;font-weight:600;color:' + values.textColor + ';">— ' + values.customerName + '</p>' +
          '</div>' +
          '</td></tr></table>';
      },
    }),
    exporters: {
      email: function (values) {
        var count = Math.min(5, Math.max(1, parseInt(values.stars) || 5));
        var starsHtml = '';
        for (var i = 0; i < 5; i++) {
          starsHtml += '<span style="color:' + (i < count ? values.starColor : '#d1d5db') + ';font-size:24px;">&#9733;</span>';
        }
        return '<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:20px;">' +
          '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + values.backgroundColor + ';border-radius:12px;"><tr><td style="padding:24px;text-align:center;">' +
          '<div style="margin-bottom:12px;">' + starsHtml + '</div>' +
          '<p style="margin:0 0 12px;font-size:15px;font-style:italic;color:' + values.textColor + ';line-height:1.5;">&ldquo;' + values.reviewText + '&rdquo;</p>' +
          '<p style="margin:0;font-size:13px;font-weight:600;color:' + values.textColor + ';">&mdash; ' + values.customerName + '</p>' +
          '</td></tr></table>' +
          '</td></tr></table>';
      },
    },
    head: {
      css: function () { return ''; },
      js: function () { return ''; },
    },
  },
});

// ─── 4. REDES SOCIALES ──────────────────────────────────────
// Helper for recommendation type labels (used by steve_product_rec)
function getRecLabel(type) {
  var labels = {
    best_sellers: 'Más vendidos',
    new_arrivals: 'Nuevos productos',
    recently_viewed: 'Vistos recientemente',
    abandoned_cart: 'Carrito abandonado',
    complementary: 'Complementarios',
    personalized: 'Personalizados',
    all: 'Todos los productos',
  };
  return labels[type] || type;
}

unlayer.registerTool({
  name: 'steve_social',
  label: 'Redes',
  icon: 'fa-share-alt',
  supportedDisplayModes: ['email'],
  options: {
    content: {
      title: 'Links',
      position: 1,
      options: {
        instagramUrl: {
          label: 'Instagram URL',
          defaultValue: '#',
          widget: 'text',
        },
        facebookUrl: {
          label: 'Facebook URL',
          defaultValue: '#',
          widget: 'text',
        },
        tiktokUrl: {
          label: 'TikTok URL',
          defaultValue: '#',
          widget: 'text',
        },
        websiteUrl: {
          label: 'Sitio web URL',
          defaultValue: '#',
          widget: 'text',
        },
      },
    },
    styling: {
      title: 'Estilos',
      position: 2,
      options: {
        iconColor: {
          label: 'Color de íconos',
          defaultValue: '#6b7280',
          widget: 'color_picker',
        },
        backgroundColor: {
          label: 'Color de fondo',
          defaultValue: '#ffffff',
          widget: 'color_picker',
        },
      },
    },
  },
  values: {},
  renderer: {
    Viewer: unlayer.createViewer({
      render: function (values) {
        var c = values.iconColor || '#6b7280';
        // SVG icons inline (no external URLs)
        var igSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="' + c + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>';
        var fbSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="' + c + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>';
        var ttSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="' + c + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/></svg>';
        var webSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="' + c + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';

        var links = '';
        if (values.instagramUrl && values.instagramUrl !== '#') links += '<a href="' + values.instagramUrl + '" style="display:inline-block;margin:0 8px;text-decoration:none;">' + igSvg + '</a>';
        if (values.facebookUrl && values.facebookUrl !== '#') links += '<a href="' + values.facebookUrl + '" style="display:inline-block;margin:0 8px;text-decoration:none;">' + fbSvg + '</a>';
        if (values.tiktokUrl && values.tiktokUrl !== '#') links += '<a href="' + values.tiktokUrl + '" style="display:inline-block;margin:0 8px;text-decoration:none;">' + ttSvg + '</a>';
        if (values.websiteUrl && values.websiteUrl !== '#') links += '<a href="' + values.websiteUrl + '" style="display:inline-block;margin:0 8px;text-decoration:none;">' + webSvg + '</a>';

        if (!links) links = '<a href="#" style="display:inline-block;margin:0 8px;">' + igSvg + '</a><a href="#" style="display:inline-block;margin:0 8px;">' + fbSvg + '</a><a href="#" style="display:inline-block;margin:0 8px;">' + ttSvg + '</a>';

        return '<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:16px;text-align:center;background:' + values.backgroundColor + ';">' +
          '<p style="margin:0 0 12px;font-size:13px;color:#6b7280;">Síguenos en redes</p>' +
          links +
          '</td></tr></table>';
      },
    }),
    exporters: {
      email: function (values) {
        var c = values.iconColor || '#6b7280';
        // For email, use simple text-based links since SVG support varies
        var links = '';
        if (values.instagramUrl && values.instagramUrl !== '#') links += '<td style="padding:0 8px;"><a href="' + values.instagramUrl + '" style="color:' + c + ';text-decoration:none;font-size:13px;font-weight:600;">Instagram</a></td>';
        if (values.facebookUrl && values.facebookUrl !== '#') links += '<td style="padding:0 8px;"><a href="' + values.facebookUrl + '" style="color:' + c + ';text-decoration:none;font-size:13px;font-weight:600;">Facebook</a></td>';
        if (values.tiktokUrl && values.tiktokUrl !== '#') links += '<td style="padding:0 8px;"><a href="' + values.tiktokUrl + '" style="color:' + c + ';text-decoration:none;font-size:13px;font-weight:600;">TikTok</a></td>';
        if (values.websiteUrl && values.websiteUrl !== '#') links += '<td style="padding:0 8px;"><a href="' + values.websiteUrl + '" style="color:' + c + ';text-decoration:none;font-size:13px;font-weight:600;">Web</a></td>';

        if (!links) links = '<td style="padding:0 8px;"><span style="color:#9ca3af;font-size:13px;">Configura tus redes</span></td>';

        return '<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:16px;background:' + values.backgroundColor + ';">' +
          '<p style="margin:0 0 12px;font-size:13px;color:#6b7280;">S&iacute;guenos en redes</p>' +
          '<table cellpadding="0" cellspacing="0" border="0"><tr>' + links + '</tr></table>' +
          '</td></tr></table>';
      },
    },
    head: {
      css: function () { return ''; },
      js: function () { return ''; },
    },
  },
});

// ─── 5. RECOMENDADOS (Dinámico — Shopify) ───────────────────
unlayer.registerTool({
  name: 'steve_product_rec',
  label: 'Recomendados',
  icon: 'fa-magic',
  supportedDisplayModes: ['email'],
  options: {
    config: {
      title: 'Configuración',
      position: 1,
      options: {
        recType: {
          label: 'Tipo de recomendación',
          defaultValue: 'best_sellers',
          widget: 'dropdown',
          data: {
            options: [
              { label: 'Más vendidos', value: 'best_sellers' },
              { label: 'Nuevos productos', value: 'new_arrivals' },
              { label: 'Vistos recientemente', value: 'recently_viewed' },
              { label: 'Carrito abandonado', value: 'abandoned_cart' },
              { label: 'Complementarios', value: 'complementary' },
              { label: 'Personalizados', value: 'personalized' },
            ],
          },
        },
        productCount: {
          label: 'Cantidad',
          defaultValue: '4',
          widget: 'dropdown',
          data: {
            options: [
              { label: '2 productos', value: '2' },
              { label: '3 productos', value: '3' },
              { label: '4 productos', value: '4' },
              { label: '6 productos', value: '6' },
            ],
          },
        },
        columns: {
          label: 'Columnas',
          defaultValue: '2',
          widget: 'dropdown',
          data: {
            options: [
              { label: '1 columna', value: '1' },
              { label: '2 columnas', value: '2' },
              { label: '3 columnas', value: '3' },
            ],
          },
        },
        title: {
          label: 'Título',
          defaultValue: 'Recomendados para ti',
          widget: 'text',
        },
        buttonText: {
          label: 'Texto botón',
          defaultValue: 'Ver producto',
          widget: 'text',
        },
      },
    },
    styling: {
      title: 'Estilos',
      position: 2,
      options: {
        buttonColor: {
          label: 'Color botón',
          defaultValue: '#2563eb',
          widget: 'color_picker',
        },
        backgroundColor: {
          label: 'Fondo',
          defaultValue: '#ffffff',
          widget: 'color_picker',
        },
      },
    },
  },
  values: {},
  renderer: {
    Viewer: unlayer.createViewer({
      render: function (values) {
        var bg = values.backgroundColor || '#ffffff';
        var title = values.title || 'Recomendados para ti';
        var count = values.productCount || '4';
        var cols = values.columns || '2';
        var type = values.recType || 'best_sellers';
        return '<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:20px;text-align:center;background:' + bg + ';border:2px dashed #2563eb;border-radius:12px;">' +
          '<p style="margin:0 0 8px;font-weight:700;font-size:16px;color:#2563eb;">' + title + '</p>' +
          '<p style="margin:0 0 8px;color:#6b7280;font-size:14px;">' + count + ' productos &middot; ' + getRecLabel(type) + ' &middot; ' + cols + ' columnas</p>' +
          '<p style="margin:0;font-size:12px;color:#9ca3af;">Los productos se personalizan autom&aacute;ticamente para cada suscriptor al enviar</p>' +
          '</td></tr></table>';
      },
    }),
    exporters: {
      email: function (values) {
        var type = values.recType || 'best_sellers';
        var count = values.productCount || '4';
        var cols = values.columns || '2';
        var btnText = values.buttonText || 'Ver producto';
        var btnColor = values.buttonColor || '#2563eb';
        var title = values.title || 'Recomendados para ti';
        return '<div data-steve-products="true" ' +
          'data-product-type="' + type + '" ' +
          'data-product-count="' + count + '" ' +
          'data-columns="' + cols + '" ' +
          'data-show-price="true" ' +
          'data-button-text="' + btnText + '" ' +
          'data-button-color="' + btnColor + '" ' +
          'data-title="' + title + '">' +
          '</div>';
      },
    },
    head: {
      css: function () { return ''; },
      js: function () { return ''; },
    },
  },
});

// ─── 6. LOGO ────────────────────────────────────────────────
unlayer.registerTool({
  name: 'steve_logo',
  label: 'Logo',
  icon: 'fa-certificate',
  supportedDisplayModes: ['email'],
  options: {
    content: {
      title: 'Logo',
      position: 1,
      options: {
        logoImage: {
          label: 'Imagen del logo',
          defaultValue: '',
          widget: 'image',
        },
        logoWidth: {
          label: 'Ancho (px)',
          defaultValue: '150',
          widget: 'text',
        },
        logoAlt: {
          label: 'Texto alternativo',
          defaultValue: 'Logo',
          widget: 'text',
        },
        logoLink: {
          label: 'URL de destino',
          defaultValue: '#',
          widget: 'text',
        },
        align: {
          label: 'Alineación',
          defaultValue: 'center',
          widget: 'dropdown',
          data: {
            options: [
              { label: 'Izquierda', value: 'left' },
              { label: 'Centro', value: 'center' },
              { label: 'Derecha', value: 'right' },
            ],
          },
        },
      },
    },
    styling: {
      title: 'Estilos',
      position: 2,
      options: {
        backgroundColor: {
          label: 'Color de fondo',
          defaultValue: '#ffffff',
          widget: 'color_picker',
        },
        paddingTop: {
          label: 'Padding superior',
          defaultValue: '20',
          widget: 'text',
        },
        paddingBottom: {
          label: 'Padding inferior',
          defaultValue: '20',
          widget: 'text',
        },
      },
    },
  },
  values: {},
  renderer: {
    Viewer: unlayer.createViewer({
      render: function (values) {
        var imgSrc = (values.logoImage && values.logoImage.url) || '';
        var w = values.logoWidth || '150';
        var alt = values.logoAlt || 'Logo';
        var link = values.logoLink || '#';
        var align = values.align || 'center';
        var bg = values.backgroundColor || '#ffffff';
        var pt = values.paddingTop || '20';
        var pb = values.paddingBottom || '20';

        if (!imgSrc) {
          return '<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:' + pt + 'px 20px ' + pb + 'px;text-align:' + align + ';background:' + bg + ';">' +
            '<div style="display:inline-block;width:' + w + 'px;height:60px;background:#f4f4f5;border-radius:8px;line-height:60px;color:#a1a1aa;font-size:13px;text-align:center;">Sube tu logo</div>' +
            '</td></tr></table>';
        }

        return '<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:' + pt + 'px 20px ' + pb + 'px;text-align:' + align + ';background:' + bg + ';">' +
          '<a href="' + link + '" style="text-decoration:none;">' +
          '<img src="' + imgSrc + '" alt="' + alt + '" width="' + w + '" style="width:' + w + 'px;max-width:100%;height:auto;display:inline-block;" />' +
          '</a>' +
          '</td></tr></table>';
      },
    }),
    exporters: {
      email: function (values) {
        var imgSrc = (values.logoImage && values.logoImage.url) || '';
        if (!imgSrc) return '';
        var w = values.logoWidth || '150';
        var alt = values.logoAlt || 'Logo';
        var link = values.logoLink || '#';
        var align = values.align || 'center';
        var bg = values.backgroundColor || '#ffffff';
        var pt = values.paddingTop || '20';
        var pb = values.paddingBottom || '20';
        var marginStyle = align === 'center' ? 'margin:0 auto;' : (align === 'right' ? 'margin-left:auto;' : '');

        return '<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="' + align + '" style="padding:' + pt + 'px 20px ' + pb + 'px;background:' + bg + ';">' +
          '<a href="' + link + '" style="text-decoration:none;">' +
          '<img src="' + imgSrc + '" alt="' + alt + '" width="' + w + '" style="width:' + w + 'px;max-width:100%;height:auto;display:block;' + marginStyle + '" />' +
          '</a>' +
          '</td></tr></table>';
      },
    },
    head: {
      css: function () { return ''; },
      js: function () { return ''; },
    },
  },
});
