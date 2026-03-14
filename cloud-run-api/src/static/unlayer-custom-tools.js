/**
 * Steve Mail — Unlayer Custom Tools
 *
 * Loaded via customJS option in the Unlayer editor iframe.
 * This is the ONLY way to register custom tools — registerTool is not
 * available via the React wrapper.
 *
 * Tools registered:
 *  - steve_products: Drag-and-drop product grid block
 *  - steve_discount: Discount/coupon code block
 *  - steve_countdown: Countdown timer block
 */

(function () {
  'use strict';

  try {
  console.log('[Steve Mail customJS] Script loaded. unlayer available:', typeof unlayer !== 'undefined');

  // Guard: only run inside Unlayer context
  if (typeof unlayer === 'undefined') {
    console.warn('[Steve Mail customJS] unlayer is undefined — not inside Unlayer iframe');
    return;
  }

  console.log('[Steve Mail customJS] Registering custom tools...');

  // ===== Product Grid Tool =====
  unlayer.registerTool({
    name: 'steve_products',
    label: 'Productos',
    icon: 'fa-shopping-bag',
    supportedDisplayModes: ['email'],
    values: {},
    options: {
      productType: {
        title: 'Tipo de Productos',
        position: 1,
        options: {
          productType: {
            label: 'Tipo',
            defaultValue: 'best_sellers',
            widget: 'dropdown',
            data: {
              options: [
                { label: 'Más vendidos', value: 'best_sellers' },
                { label: 'Nuevos', value: 'new_arrivals' },
                { label: 'Últimos vistos', value: 'recently_viewed' },
                { label: 'Carrito abandonado', value: 'abandoned_cart' },
                { label: 'Complementarios', value: 'complementary' },
                { label: 'Todos los productos', value: 'all' },
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
        },
      },
      display: {
        title: 'Mostrar',
        position: 2,
        options: {
          showPrice: { label: 'Mostrar precio', defaultValue: true, widget: 'toggle' },
          showButton: { label: 'Mostrar botón', defaultValue: true, widget: 'toggle' },
          buttonText: { label: 'Texto del botón', defaultValue: 'Comprar', widget: 'text' },
          buttonColor: { label: 'Color del botón', defaultValue: '#18181b', widget: 'color_picker' },
        },
      },
    },
    transformer: function (values, source) { return values; },
    renderer: {
      Viewer: unlayer.createViewer({
        render: function (values) {
          return generateProductGridHTML(values);
        },
      }),
      exporters: {
        email: function (values) {
          return generateProductGridHTML(values);
        },
      },
    },
  });
  console.log('[Steve Mail customJS] steve_products registered OK');

  // ===== Discount Code Tool =====
  unlayer.registerTool({
    name: 'steve_discount',
    label: 'Código de Descuento',
    icon: 'fa-tag',
    supportedDisplayModes: ['email'],
    values: {},
    options: {
      discount: {
        title: 'Descuento',
        position: 1,
        options: {
          discountSource: {
            label: 'Fuente del código',
            defaultValue: 'manual',
            widget: 'dropdown',
            data: {
              options: [
                { label: 'Escribir código manual', value: 'manual' },
                { label: 'Crear en Shopify (automático)', value: 'shopify_create' },
              ],
            },
          },
          discountCode: { label: 'Código (manual)', defaultValue: 'DESCUENTO20', widget: 'text' },
          discountType: {
            label: 'Tipo de descuento (Shopify)',
            defaultValue: 'percentage',
            widget: 'dropdown',
            data: {
              options: [
                { label: 'Porcentaje (%)', value: 'percentage' },
                { label: 'Monto fijo ($)', value: 'fixed_amount' },
                { label: 'Envío gratis', value: 'free_shipping' },
              ],
            },
          },
          discountValue: { label: 'Valor del descuento', defaultValue: '20', widget: 'text' },
          bgColor: { label: 'Color de fondo', defaultValue: '#fafafa', widget: 'color_picker' },
          textColor: { label: 'Color de texto', defaultValue: '#18181b', widget: 'color_picker' },
          borderColor: { label: 'Color de borde', defaultValue: '#d4d4d8', widget: 'color_picker' },
        },
      },
      cta: {
        title: 'Botón',
        position: 2,
        options: {
          ctaText: { label: 'Texto del botón', defaultValue: 'Usar Código', widget: 'text' },
          ctaUrl: { label: 'URL del botón', defaultValue: '', widget: 'text' },
          ctaColor: { label: 'Color del botón', defaultValue: '#18181b', widget: 'color_picker' },
        },
      },
    },
    transformer: function (values, source) { return values; },
    renderer: {
      Viewer: unlayer.createViewer({
        render: function (values) {
          return generateDiscountHTML(values);
        },
      }),
      exporters: {
        email: function (values) {
          return generateDiscountHTML(values);
        },
      },
    },
  });

  // ===== Countdown Timer Tool =====
  unlayer.registerTool({
    name: 'steve_countdown',
    label: 'Cuenta Regresiva',
    icon: 'fa-clock-o',
    supportedDisplayModes: ['email'],
    values: {},
    options: {
      countdown: {
        title: 'Cuenta Regresiva',
        position: 1,
        options: {
          endDate: {
            label: 'Fecha de término',
            defaultValue: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
            widget: 'text',
          },
          labelText: {
            label: 'Texto superior',
            defaultValue: 'La oferta termina en',
            widget: 'text',
          },
          expiredText: {
            label: 'Texto expirado',
            defaultValue: 'Esta oferta ha expirado',
            widget: 'text',
          },
        },
      },
      style: {
        title: 'Estilo',
        position: 2,
        options: {
          bgColor: {
            label: 'Color de fondo',
            defaultValue: '#18181b',
            widget: 'color_picker',
          },
          textColor: {
            label: 'Color de texto',
            defaultValue: '#ffffff',
            widget: 'color_picker',
          },
        },
      },
    },
    transformer: function (values, source) { return values; },
    renderer: {
      Viewer: unlayer.createViewer({
        render: function (values) {
          return generateCountdownHTML(values);
        },
      }),
      exporters: {
        email: function (values) {
          return generateCountdownHTML(values);
        },
      },
    },
  });

  // ===== Botón Diseñable Tool =====
  unlayer.registerTool({
    name: 'steve_button',
    label: 'Botón Diseño',
    icon: 'fa-hand-pointer-o',
    supportedDisplayModes: ['email'],
    values: {},
    options: {
      content: {
        title: 'Contenido',
        position: 1,
        options: {
          btnText: { label: 'Texto', defaultValue: 'Comprar Ahora', widget: 'text' },
          btnUrl: { label: 'URL de destino', defaultValue: '', widget: 'text' },
        },
      },
      design: {
        title: 'Diseño',
        position: 2,
        options: {
          btnStyle: {
            label: 'Estilo',
            defaultValue: 'filled',
            widget: 'dropdown',
            data: {
              options: [
                { label: 'Relleno', value: 'filled' },
                { label: 'Solo borde', value: 'outline' },
                { label: 'Píldora', value: 'pill' },
                { label: 'Sombra', value: 'shadow' },
                { label: 'Gradiente', value: 'gradient' },
              ],
            },
          },
          btnSize: {
            label: 'Tamaño',
            defaultValue: 'medium',
            widget: 'dropdown',
            data: {
              options: [
                { label: 'Pequeño', value: 'small' },
                { label: 'Mediano', value: 'medium' },
                { label: 'Grande', value: 'large' },
                { label: 'Ancho completo', value: 'full' },
              ],
            },
          },
          btnColor: { label: 'Color principal', defaultValue: '#18181b', widget: 'color_picker' },
          btnTextColor: { label: 'Color del texto', defaultValue: '#ffffff', widget: 'color_picker' },
          btnAlign: {
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
    },
    transformer: function (values, source) { return values; },
    renderer: {
      Viewer: unlayer.createViewer({
        render: function (values) {
          return generateButtonHTML(values);
        },
      }),
      exporters: {
        email: function (values) {
          return generateButtonHTML(values);
        },
      },
    },
  });

  // ===== HTML Generators =====

  function generateProductGridHTML(values) {
    var count = parseInt(values.productCount, 10) || 4;
    var cols = parseInt(values.columns, 10) || 2;
    var colWidth = Math.floor(100 / cols);
    var placeholderImg = 'https://placehold.co/280x280/f4f4f5/a1a1aa?text=Producto';
    var typeLabels = {
      best_sellers: 'Más vendidos',
      new_arrivals: 'Nuevos',
      recently_viewed: 'Últimos vistos',
      abandoned_cart: 'Carrito abandonado',
      complementary: 'Complementarios',
      all: 'Todos los productos',
    };

    var cells = '';
    for (var i = 0; i < count; i++) {
      cells += '<td style="width:' + colWidth + '%;padding:8px;vertical-align:top;text-align:center;">';
      cells += '<img src="' + placeholderImg + '" alt="Producto ' + (i + 1) + '" style="width:100%;max-width:280px;border-radius:8px;" />';
      cells += '<p style="margin:8px 0 4px;font-weight:600;font-size:14px;color:#18181b;">Producto ' + (i + 1) + '</p>';
      if (values.showPrice !== false) {
        cells += '<p style="margin:0 0 8px;font-size:13px;color:#71717a;">$XX.XX</p>';
      }
      if (values.showButton !== false) {
        cells += '<a href="#" style="display:inline-block;padding:8px 20px;background:' + (values.buttonColor || '#18181b') + ';color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500;">' + (values.buttonText || 'Comprar') + '</a>';
      }
      cells += '</td>';
      if ((i + 1) % cols === 0 && i + 1 < count) {
        cells += '</tr><tr>';
      }
    }

    return '<div data-steve-products="true" data-product-type="' + (values.productType || 'best_sellers') + '" data-product-count="' + count + '" data-columns="' + cols + '" data-show-price="' + (values.showPrice !== false) + '" data-show-button="' + (values.showButton !== false) + '" data-button-text="' + (values.buttonText || 'Comprar') + '" data-button-color="' + (values.buttonColor || '#18181b') + '">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">' +
        '<tr><td colspan="' + cols + '" style="padding:0 0 8px;text-align:center;">' +
          '<p style="margin:0;font-size:11px;color:#a1a1aa;text-transform:uppercase;letter-spacing:1px;">' + (typeLabels[values.productType] || 'Productos') + '</p>' +
        '</td></tr>' +
        '<tr>' + cells + '</tr>' +
      '</table>' +
    '</div>';
  }

  function generateDiscountHTML(values) {
    var source = values.discountSource || 'manual';
    var code = source === 'shopify_create' ? '{{ shopify_discount_code }}' : (values.discountCode || '{{ discount_code }}');
    var displayCode = source === 'shopify_create' ? ('STEVE-' + (values.discountType === 'free_shipping' ? 'ENVIO' : (values.discountValue || '20') + (values.discountType === 'percentage' ? '%OFF' : 'OFF'))) : code;
    var bg = values.bgColor || '#fafafa';
    var textColor = values.textColor || '#18181b';
    var border = values.borderColor || '#d4d4d8';
    var subtitle = source === 'shopify_create'
      ? (values.discountType === 'free_shipping' ? 'Envío gratis' : (values.discountType === 'percentage' ? values.discountValue + '% de descuento' : '$' + values.discountValue + ' de descuento'))
      : 'Tu código de descuento';
    var cta = '';
    if (values.ctaText) {
      cta = '<a href="' + (values.ctaUrl || '#') + '" style="display:inline-block;padding:10px 28px;background:' + (values.ctaColor || '#18181b') + ';color:#fff;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">' + values.ctaText + '</a>';
    }

    return '<div data-steve-discount="true" data-discount-code="' + code + '" data-discount-source="' + source + '" data-discount-type="' + (values.discountType || 'percentage') + '" data-discount-value="' + (values.discountValue || '20') + '" style="text-align:center;padding:24px;">' +
      '<div style="display:inline-block;border:2px dashed ' + border + ';border-radius:12px;padding:24px 40px;background:' + bg + ';">' +
        '<p style="margin:0 0 4px;font-size:12px;color:' + textColor + ';text-transform:uppercase;letter-spacing:1px;">' + subtitle + '</p>' +
        '<p style="margin:0 0 16px;font-size:28px;font-weight:700;color:' + textColor + ';letter-spacing:3px;">' + displayCode + '</p>' +
        cta +
      '</div>' +
    '</div>';
  }
  function generateButtonHTML(values) {
    var text = values.btnText || 'Comprar Ahora';
    var url = values.btnUrl || '#';
    var style = values.btnStyle || 'filled';
    var size = values.btnSize || 'medium';
    var color = values.btnColor || '#18181b';
    var textColor = values.btnTextColor || '#ffffff';
    var align = values.btnAlign || 'center';

    var sizeMap = {
      small: { padding: '8px 20px', fontSize: '13px' },
      medium: { padding: '14px 32px', fontSize: '15px' },
      large: { padding: '18px 48px', fontSize: '17px' },
      full: { padding: '16px 32px', fontSize: '16px' },
    };
    var s = sizeMap[size] || sizeMap.medium;

    var bgStyle = 'background:' + color + ';color:' + textColor + ';border:2px solid ' + color + ';';
    var borderRadius = '8px';
    var extraStyle = '';

    if (style === 'outline') {
      bgStyle = 'background:transparent;color:' + color + ';border:2px solid ' + color + ';';
    } else if (style === 'pill') {
      borderRadius = '50px';
    } else if (style === 'shadow') {
      extraStyle = 'box-shadow:0 4px 14px ' + color + '40;';
    } else if (style === 'gradient') {
      bgStyle = 'background:linear-gradient(135deg, ' + color + ', ' + color + 'cc);color:' + textColor + ';border:none;';
    }

    var displayStyle = size === 'full' ? 'display:block;width:100%;box-sizing:border-box;' : 'display:inline-block;';

    return '<div style="text-align:' + align + ';padding:16px 24px;">' +
      '<a href="' + url + '" style="' + displayStyle + 'padding:' + s.padding + ';font-size:' + s.fontSize + ';font-weight:600;' + bgStyle + 'border-radius:' + borderRadius + ';text-decoration:none;text-align:center;letter-spacing:0.5px;' + extraStyle + '">' + text + '</a>' +
    '</div>';
  }

  function generateCountdownHTML(values) {
    var endDate = values.endDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
    var labelText = values.labelText || 'La oferta termina en';
    var expiredText = values.expiredText || 'Esta oferta ha expirado';
    var bgColor = values.bgColor || '#18181b';
    var textColor = values.textColor || '#ffffff';

    // Unique ID so multiple countdowns on the same page don't clash
    var uid = 'cd_' + Math.random().toString(36).substr(2, 9);

    var digitBoxStyle = 'display:inline-block;min-width:56px;padding:10px 8px;margin:0 4px;' +
      'background:rgba(255,255,255,0.08);border-radius:8px;text-align:center;';
    var digitStyle = 'display:block;font-size:28px;font-weight:700;line-height:1.2;color:' + textColor + ';';
    var unitStyle = 'display:block;font-size:10px;text-transform:uppercase;letter-spacing:1px;' +
      'color:' + textColor + ';opacity:0.6;margin-top:4px;';

    return '<div data-steve-countdown="true" data-end-date="' + endDate + '" ' +
      'style="text-align:center;padding:28px 16px;background:' + bgColor + ';border-radius:12px;">' +
        '<p style="margin:0 0 16px;font-size:13px;font-weight:600;letter-spacing:1px;' +
          'text-transform:uppercase;color:' + textColor + ';opacity:0.75;">' + labelText + '</p>' +
        '<div id="' + uid + '" style="display:inline-block;">' +
          '<span style="' + digitBoxStyle + '">' +
            '<span class="cd-val" data-unit="days" style="' + digitStyle + '">00</span>' +
            '<span style="' + unitStyle + '">Días</span>' +
          '</span>' +
          '<span style="' + digitBoxStyle + '">' +
            '<span class="cd-val" data-unit="hours" style="' + digitStyle + '">00</span>' +
            '<span style="' + unitStyle + '">Horas</span>' +
          '</span>' +
          '<span style="' + digitBoxStyle + '">' +
            '<span class="cd-val" data-unit="minutes" style="' + digitStyle + '">00</span>' +
            '<span style="' + unitStyle + '">Min</span>' +
          '</span>' +
          '<span style="' + digitBoxStyle + '">' +
            '<span class="cd-val" data-unit="seconds" style="' + digitStyle + '">00</span>' +
            '<span style="' + unitStyle + '">Seg</span>' +
          '</span>' +
        '</div>' +
        '<p id="' + uid + '_expired" style="display:none;margin:8px 0 0;font-size:16px;font-weight:600;color:' + textColor + ';">' + expiredText + '</p>' +
        '<script>' +
          '(function(){' +
            'var end=new Date("' + endDate + '").getTime();' +
            'var wrap=document.getElementById("' + uid + '");' +
            'var expEl=document.getElementById("' + uid + '_expired");' +
            'if(!wrap)return;' +
            'function pad(n){return n<10?"0"+n:String(n);}' +
            'function tick(){' +
              'var diff=end-Date.now();' +
              'if(diff<=0){' +
                'wrap.style.display="none";' +
                'expEl.style.display="block";' +
                'return;' +
              '}' +
              'var d=Math.floor(diff/86400000);' +
              'var h=Math.floor((diff%86400000)/3600000);' +
              'var m=Math.floor((diff%3600000)/60000);' +
              'var s=Math.floor((diff%60000)/1000);' +
              'var vals=wrap.querySelectorAll(".cd-val");' +
              'for(var i=0;i<vals.length;i++){' +
                'var u=vals[i].getAttribute("data-unit");' +
                'if(u==="days")vals[i].textContent=pad(d);' +
                'if(u==="hours")vals[i].textContent=pad(h);' +
                'if(u==="minutes")vals[i].textContent=pad(m);' +
                'if(u==="seconds")vals[i].textContent=pad(s);' +
              '}' +
            '}' +
            'tick();setInterval(tick,1000);' +
          '})();' +
        '<\/script>' +
    '</div>';
  }

  console.log('[Steve Mail customJS] All tools registered successfully');
  } catch (err) {
    console.error('[Steve Mail customJS] FATAL ERROR:', err);
  }
})();
