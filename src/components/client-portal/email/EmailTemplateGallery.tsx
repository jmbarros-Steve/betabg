import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, FileText, Sparkles, User } from 'lucide-react';
import { emailTemplates } from './emailTemplates';
import { callApi } from '@/lib/api';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EmailTemplateGalleryProps {
  clientId: string;
  onSelect: (designJson: any) => void;
  onClose: () => void;
  isOpen: boolean;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TemplateCategory = 'todas' | 'e-commerce' | 'bienvenida' | 'promocion' | 'newsletter' | 'carrito' | 'lanzamiento' | 'temporada' | 'custom';

interface SystemTemplate {
  id: string;
  name: string;
  category: Exclude<TemplateCategory, 'todas'>;
  thumbnailColor: string;
  design_json: any;
}

// ---------------------------------------------------------------------------
// Category metadata
// ---------------------------------------------------------------------------

const CATEGORIES: { key: TemplateCategory; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'e-commerce', label: 'E-commerce' },
  { key: 'bienvenida', label: 'Bienvenida' },
  { key: 'promocion', label: 'Promocion' },
  { key: 'newsletter', label: 'Newsletter' },
  { key: 'carrito', label: 'Carrito' },
  { key: 'lanzamiento', label: 'Lanzamiento' },
  { key: 'temporada', label: 'Temporada' },
  { key: 'custom', label: 'Mis Plantillas' },
];

const THUMBNAIL_COLORS: Record<string, string> = {
  'e-commerce': '#3b82f6',
  bienvenida: '#22c55e',
  newsletter: '#a855f7',
  promocion: '#ef4444',
  carrito: '#f59e0b',
  lanzamiento: '#7c3aed',
  temporada: '#059669',
  custom: '#71717a',
};

// ---------------------------------------------------------------------------
// Helper: build an Unlayer content module
// ---------------------------------------------------------------------------

function textModule(html: string, id: string, extra: Record<string, any> = {}) {
  return {
    type: 'text',
    values: {
      containerPadding: '16px',
      anchor: '',
      textAlign: 'left',
      lineHeight: '160%',
      linkStyle: { inherit: true, linkColor: '#0000ee', linkHoverColor: '#0000ee', linkUnderline: true, linkHoverUnderline: true },
      hideDesktop: false,
      hideMobile: false,
      displayCondition: null,
      _meta: { htmlID: id, htmlClassNames: id },
      selectable: true,
      draggable: true,
      duplicatable: true,
      deletable: true,
      text: html,
      ...extra,
    },
  };
}

function headingModule(text: string, id: string, extra: Record<string, any> = {}) {
  return {
    type: 'heading',
    values: {
      containerPadding: '16px',
      anchor: '',
      headingType: 'h1',
      fontFamily: { label: 'Arial', value: 'arial,helvetica,sans-serif' },
      fontSize: '28px',
      textAlign: 'center',
      lineHeight: '140%',
      linkStyle: { inherit: true, linkColor: '#0000ee', linkHoverColor: '#0000ee', linkUnderline: true, linkHoverUnderline: true },
      hideDesktop: false,
      hideMobile: false,
      displayCondition: null,
      _meta: { htmlID: id, htmlClassNames: id },
      selectable: true,
      draggable: true,
      duplicatable: true,
      deletable: true,
      text: text,
      ...extra,
    },
  };
}

function buttonModule(text: string, href: string, id: string, extra: Record<string, any> = {}) {
  return {
    type: 'button',
    values: {
      containerPadding: '16px',
      anchor: '',
      href: { name: 'web', values: { href, target: '_blank' } },
      buttonColors: { color: '#ffffff', backgroundColor: '#18181b', hoverColor: '#ffffff', hoverBackgroundColor: '#3f3f46' },
      size: { autoWidth: false, width: '100%' },
      textAlign: 'center',
      lineHeight: '120%',
      padding: '14px 28px',
      border: {},
      borderRadius: '6px',
      hideDesktop: false,
      hideMobile: false,
      displayCondition: null,
      _meta: { htmlID: id, htmlClassNames: id },
      selectable: true,
      draggable: true,
      duplicatable: true,
      deletable: true,
      text: `<strong>${text}</strong>`,
      calculatedWidth: 568,
      calculatedHeight: 45,
      ...extra,
    },
  };
}

function imageModule(src: string, alt: string, id: string, extra: Record<string, any> = {}) {
  return {
    type: 'image',
    values: {
      containerPadding: '0px',
      anchor: '',
      src: { url: src, width: 600, height: 300 },
      textAlign: 'center',
      altText: alt,
      action: { name: 'web', values: { href: '', target: '_blank' } },
      hideDesktop: false,
      hideMobile: false,
      displayCondition: null,
      _meta: { htmlID: id, htmlClassNames: id },
      selectable: true,
      draggable: true,
      duplicatable: true,
      deletable: true,
      ...extra,
    },
  };
}

function dividerModule(id: string) {
  return {
    type: 'divider',
    values: {
      containerPadding: '16px',
      anchor: '',
      border: { borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: '#e4e4e7' },
      textAlign: 'center',
      hideDesktop: false,
      hideMobile: false,
      displayCondition: null,
      _meta: { htmlID: id, htmlClassNames: id },
      selectable: true,
      draggable: true,
      duplicatable: true,
      deletable: true,
    },
  };
}

function socialModule(id: string) {
  return {
    type: 'social',
    values: {
      containerPadding: '16px',
      anchor: '',
      icons: {
        iconType: 'circle-black',
        icons: [
          { name: 'Facebook', url: 'https://facebook.com/' },
          { name: 'Instagram', url: 'https://instagram.com/' },
          { name: 'Twitter', url: 'https://twitter.com/' },
        ],
      },
      textAlign: 'center',
      hideDesktop: false,
      hideMobile: false,
      displayCondition: null,
      _meta: { htmlID: id, htmlClassNames: id },
      selectable: true,
      draggable: true,
      duplicatable: true,
      deletable: true,
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: wrap content modules in a row
// ---------------------------------------------------------------------------

function makeRow(contents: any[], rowId: string, columnProps: Record<string, any> = {}, rowValues: Record<string, any> = {}) {
  return {
    cells: [1],
    columns: [
      {
        contents,
        values: {
          backgroundColor: '',
          padding: '0px',
          border: {},
          borderRadius: '0px',
          _meta: { htmlID: `${rowId}_col`, htmlClassNames: `${rowId}_col` },
          ...columnProps,
        },
      },
    ],
    values: {
      displayCondition: null,
      columns: false,
      backgroundColor: '',
      columnsBackgroundColor: '#ffffff',
      backgroundImage: { url: '', fullWidth: true, repeat: false, center: true, cover: false },
      padding: '0px',
      anchor: '',
      hideDesktop: false,
      hideMobile: false,
      noStackMobile: false,
      _meta: { htmlID: rowId, htmlClassNames: rowId },
      selectable: true,
      draggable: true,
      duplicatable: true,
      deletable: true,
      ...rowValues,
    },
  };
}

function makeMultiColumnRow(columnContents: any[][], rowId: string, rowValues: Record<string, any> = {}) {
  const cells = columnContents.map(() => 1);
  const columns = columnContents.map((contents, i) => ({
    contents,
    values: {
      backgroundColor: '',
      padding: '0px',
      border: {},
      borderRadius: '0px',
      _meta: { htmlID: `${rowId}_col${i}`, htmlClassNames: `${rowId}_col${i}` },
    },
  }));

  return {
    cells,
    columns,
    values: {
      displayCondition: null,
      columns: false,
      backgroundColor: '',
      columnsBackgroundColor: '#ffffff',
      backgroundImage: { url: '', fullWidth: true, repeat: false, center: true, cover: false },
      padding: '0px',
      anchor: '',
      hideDesktop: false,
      hideMobile: false,
      noStackMobile: false,
      _meta: { htmlID: rowId, htmlClassNames: rowId },
      selectable: true,
      draggable: true,
      duplicatable: true,
      deletable: true,
      ...rowValues,
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: wrap rows into a full design
// ---------------------------------------------------------------------------

function makeDesign(rows: any[], counters: Record<string, number>) {
  return {
    body: {
      rows,
      values: {
        backgroundColor: '#f4f4f5',
        backgroundImage: { url: '', fullWidth: true, repeat: false, center: true, cover: false },
        contentWidth: '600px',
        contentAlign: 'center',
        fontFamily: { label: 'Arial', value: 'arial,helvetica,sans-serif' },
        preheaderText: '',
        linkStyle: { body: true, linkColor: '#18181b', linkHoverColor: '#3f3f46', linkUnderline: true, linkHoverUnderline: true },
        _meta: { htmlID: 'u_body', htmlClassNames: 'u_body' },
      },
    },
    counters,
  };
}

// ---------------------------------------------------------------------------
// Standard header row (logo placeholder)
// ---------------------------------------------------------------------------

function headerRow(_title: string) {
  return makeRow(
    [
      imageModule('https://placehold.co/200x60/18181b/ffffff?text=LOGO', 'Logo', 'u_img_logo', { containerPadding: '24px' }),
    ],
    'u_row_header',
    {},
    { columnsBackgroundColor: '#18181b' }
  );
}

function footerRow() {
  return makeRow(
    [
      socialModule('u_social_footer'),
      textModule(
        '<p style="font-size:12px;color:#71717a;text-align:center;">&copy; 2026 Tu Marca. Todos los derechos reservados.<br/><a href="{{unsubscribe_url}}" style="color:#71717a;">Desuscribirse</a></p>',
        'u_text_footer'
      ),
    ],
    'u_row_footer',
    {},
    { columnsBackgroundColor: '#f4f4f5' }
  );
}

// ---------------------------------------------------------------------------
// Blank template design
// ---------------------------------------------------------------------------

const BLANK_DESIGN = makeDesign(
  [
    makeRow(
      [
        textModule('<p style="text-align:center;color:#a1a1aa;font-size:14px;">Arrastra bloques aqui para empezar a disenar tu email.</p>', 'u_text_blank', { containerPadding: '48px 16px' }),
      ],
      'u_row_blank'
    ),
  ],
  { u_row: 1, u_column: 1, u_content_text: 1 }
);

// ---------------------------------------------------------------------------
// 15 system templates (categories merged: abandono->e-commerce, winback->promocion)
// ---------------------------------------------------------------------------

const SYSTEM_TEMPLATES: SystemTemplate[] = [
  // --- BIENVENIDA ---
  {
    id: 'tpl_welcome_basic',
    name: 'Bienvenida Basica',
    category: 'bienvenida',
    thumbnailColor: THUMBNAIL_COLORS.bienvenida,
    design_json: makeDesign(
      [
        headerRow('Tu Marca'),
        makeRow(
          [
            headingModule('Bienvenido a nuestra comunidad', 'u_heading_1', { fontSize: '32px', containerPadding: '32px 16px 8px' }),
            textModule(
              '<p style="text-align:center;font-size:16px;color:#3f3f46;">Estamos encantados de tenerte con nosotros. Explora nuestros productos y encuentra todo lo que necesitas para ti.</p>',
              'u_text_1',
              { containerPadding: '8px 32px 16px' }
            ),
            buttonModule('Explorar la Tienda', 'https://tutienda.com', 'u_btn_1', { containerPadding: '8px 80px 32px' }),
          ],
          'u_row_1'
        ),
        footerRow(),
      ],
      { u_row: 3, u_column: 3, u_content_text: 3, u_content_heading: 1, u_content_button: 1, u_content_image: 1, u_content_social: 1, u_content_divider: 0 }
    ),
  },
  {
    id: 'tpl_welcome_discount',
    name: 'Bienvenida con Descuento',
    category: 'bienvenida',
    thumbnailColor: THUMBNAIL_COLORS.bienvenida,
    design_json: makeDesign(
      [
        headerRow('Tu Marca'),
        makeRow(
          [
            headingModule('Te damos la bienvenida', 'u_heading_1', { fontSize: '30px', containerPadding: '32px 16px 8px' }),
            textModule(
              '<p style="text-align:center;font-size:16px;color:#3f3f46;">Gracias por unirte. Como regalo de bienvenida, te ofrecemos un descuento exclusivo en tu primera compra.</p>',
              'u_text_1',
              { containerPadding: '8px 32px' }
            ),
          ],
          'u_row_1'
        ),
        makeRow(
          [
            textModule(
              '<div style="text-align:center;padding:24px;background-color:#f0fdf4;border:2px dashed #22c55e;border-radius:8px;margin:0 32px;"><p style="font-size:14px;color:#71717a;margin:0 0 8px;">Tu codigo de descuento:</p><p style="font-size:32px;font-weight:bold;color:#18181b;margin:0;letter-spacing:4px;">WELCOME15</p><p style="font-size:14px;color:#71717a;margin:8px 0 0;">15% de descuento en tu primer pedido</p></div>',
              'u_text_coupon',
              { containerPadding: '16px' }
            ),
            buttonModule('Usar mi Descuento', 'https://tutienda.com?coupon=WELCOME15', 'u_btn_1', { containerPadding: '16px 80px 32px' }),
          ],
          'u_row_2'
        ),
        footerRow(),
      ],
      { u_row: 4, u_column: 4, u_content_text: 4, u_content_heading: 1, u_content_button: 1, u_content_image: 1, u_content_social: 1, u_content_divider: 0 }
    ),
  },
  // --- E-COMMERCE (includes former "abandono" templates) ---
  {
    id: 'tpl_cart_abandoned',
    name: 'Carrito Abandonado',
    category: 'e-commerce',
    thumbnailColor: THUMBNAIL_COLORS['e-commerce'],
    design_json: makeDesign(
      [
        headerRow('Tu Marca'),
        makeRow(
          [
            headingModule('Olvidaste algo en tu carrito', 'u_heading_1', { fontSize: '28px', containerPadding: '32px 16px 8px' }),
            textModule(
              '<p style="text-align:center;font-size:16px;color:#3f3f46;">Vimos que dejaste productos en tu carrito. No te preocupes, los guardamos para ti.</p>',
              'u_text_1',
              { containerPadding: '8px 32px' }
            ),
          ],
          'u_row_1'
        ),
        makeRow(
          [
            imageModule('https://placehold.co/560x200/f4f4f5/71717a?text=Productos+del+Carrito', 'Productos del carrito', 'u_img_products', { containerPadding: '16px 20px' }),
            dividerModule('u_divider_1'),
            textModule(
              '<table style="width:100%;border-collapse:collapse;"><tr><td style="padding:12px;font-size:14px;"><strong>Producto Ejemplo</strong><br/><span style="color:#71717a;">Talla: M | Color: Negro</span></td><td style="padding:12px;text-align:right;font-size:16px;font-weight:bold;">$49.990</td></tr></table>',
              'u_text_cart',
              { containerPadding: '0px 16px' }
            ),
            dividerModule('u_divider_2'),
            textModule(
              '<p style="text-align:center;font-size:14px;color:#ef4444;font-weight:bold;">Los productos tienen disponibilidad limitada</p>',
              'u_text_urgency',
              { containerPadding: '8px 16px' }
            ),
            buttonModule('Completar mi Compra', 'https://tutienda.com/cart', 'u_btn_1', {
              containerPadding: '8px 80px 32px',
              buttonColors: { color: '#ffffff', backgroundColor: '#f97316', hoverColor: '#ffffff', hoverBackgroundColor: '#ea580c' },
            }),
          ],
          'u_row_2'
        ),
        footerRow(),
      ],
      { u_row: 4, u_column: 4, u_content_text: 5, u_content_heading: 1, u_content_button: 1, u_content_image: 2, u_content_social: 1, u_content_divider: 2 }
    ),
  },
  {
    id: 'tpl_cart_incentive',
    name: 'Carrito con Incentivo',
    category: 'e-commerce',
    thumbnailColor: THUMBNAIL_COLORS['e-commerce'],
    design_json: makeDesign(
      [
        headerRow('Tu Marca'),
        makeRow(
          [
            headingModule('Tu carrito te espera', 'u_heading_1', { fontSize: '28px', containerPadding: '32px 16px 8px' }),
            textModule(
              '<p style="text-align:center;font-size:16px;color:#3f3f46;">Tus productos favoritos aun estan disponibles. Y tenemos una sorpresa para ti:</p>',
              'u_text_1',
              { containerPadding: '8px 32px' }
            ),
          ],
          'u_row_1'
        ),
        makeRow(
          [
            textModule(
              '<div style="text-align:center;padding:20px;background:linear-gradient(135deg,#fff7ed,#ffedd5);border-radius:8px;margin:0 20px;"><p style="font-size:14px;color:#9a3412;margin:0 0 4px;">Descuento exclusivo</p><p style="font-size:40px;font-weight:bold;color:#ea580c;margin:0;">10% OFF</p><p style="font-size:13px;color:#9a3412;margin:4px 0 0;">Usa el codigo: <strong>VUELVE10</strong></p></div>',
              'u_text_discount',
              { containerPadding: '8px 16px' }
            ),
            textModule(
              '<p style="text-align:center;font-size:13px;color:#ef4444;">Oferta valida por 24 horas</p>',
              'u_text_timer',
              { containerPadding: '4px 16px' }
            ),
          ],
          'u_row_2'
        ),
        makeRow(
          [
            imageModule('https://placehold.co/560x180/f4f4f5/71717a?text=Tus+Productos', 'Productos', 'u_img_products', { containerPadding: '16px 20px' }),
            buttonModule('Recuperar mi Carrito', 'https://tutienda.com/cart?coupon=VUELVE10', 'u_btn_1', {
              containerPadding: '8px 80px 32px',
              buttonColors: { color: '#ffffff', backgroundColor: '#ea580c', hoverColor: '#ffffff', hoverBackgroundColor: '#c2410c' },
            }),
          ],
          'u_row_3'
        ),
        footerRow(),
      ],
      { u_row: 5, u_column: 5, u_content_text: 5, u_content_heading: 1, u_content_button: 1, u_content_image: 2, u_content_social: 1, u_content_divider: 0 }
    ),
  },
  {
    id: 'tpl_new_product',
    name: 'Lanzamiento de Producto',
    category: 'e-commerce',
    thumbnailColor: THUMBNAIL_COLORS['e-commerce'],
    design_json: makeDesign(
      [
        headerRow('Tu Marca'),
        makeRow(
          [
            textModule(
              '<p style="text-align:center;font-size:12px;letter-spacing:3px;color:#3b82f6;text-transform:uppercase;margin:0;">Nuevo Lanzamiento</p>',
              'u_text_label',
              { containerPadding: '24px 16px 8px' }
            ),
            headingModule('Producto Revolucionario', 'u_heading_1', { fontSize: '32px', containerPadding: '4px 16px 8px' }),
            textModule(
              '<p style="text-align:center;font-size:16px;color:#3f3f46;">El producto que estabas esperando ya esta aqui. Disenado para superar todas tus expectativas.</p>',
              'u_text_intro',
              { containerPadding: '8px 32px 16px' }
            ),
          ],
          'u_row_1'
        ),
        makeRow(
          [
            imageModule('https://placehold.co/600x400/eff6ff/3b82f6?text=Nuevo+Producto+Hero', 'Nuevo producto', 'u_img_hero', { containerPadding: '0px' }),
          ],
          'u_row_hero'
        ),
        makeRow(
          [
            headingModule('Caracteristicas', 'u_heading_2', { fontSize: '20px', containerPadding: '24px 16px 16px' }),
          ],
          'u_row_feat_label'
        ),
        makeMultiColumnRow(
          [
            [
              textModule('<div style="text-align:center;padding:16px;"><p style="font-size:28px;margin:0;">&#9733;</p><p style="font-size:14px;font-weight:bold;color:#18181b;margin:8px 0 4px;">Alta Calidad</p><p style="font-size:13px;color:#71717a;margin:0;">Materiales premium seleccionados cuidadosamente.</p></div>', 'u_text_f1'),
            ],
            [
              textModule('<div style="text-align:center;padding:16px;"><p style="font-size:28px;margin:0;">&#9889;</p><p style="font-size:14px;font-weight:bold;color:#18181b;margin:8px 0 4px;">Rendimiento</p><p style="font-size:13px;color:#71717a;margin:0;">Optimizado para ofrecer el mejor resultado.</p></div>', 'u_text_f2'),
            ],
            [
              textModule('<div style="text-align:center;padding:16px;"><p style="font-size:28px;margin:0;">&#128274;</p><p style="font-size:14px;font-weight:bold;color:#18181b;margin:8px 0 4px;">Garantia</p><p style="font-size:13px;color:#71717a;margin:0;">2 anos de garantia incluidos con tu compra.</p></div>', 'u_text_f3'),
            ],
          ],
          'u_row_features'
        ),
        makeRow(
          [
            textModule(
              '<p style="text-align:center;font-size:14px;color:#71717a;">Precio de lanzamiento</p><p style="text-align:center;font-size:36px;font-weight:bold;color:#18181b;margin:0;">$89.990</p>',
              'u_text_price',
              { containerPadding: '16px' }
            ),
            buttonModule('Comprar Ahora', 'https://tutienda.com/producto-nuevo', 'u_btn_1', {
              containerPadding: '8px 80px 32px',
              buttonColors: { color: '#ffffff', backgroundColor: '#3b82f6', hoverColor: '#ffffff', hoverBackgroundColor: '#2563eb' },
            }),
          ],
          'u_row_cta'
        ),
        footerRow(),
      ],
      { u_row: 8, u_column: 10, u_content_text: 8, u_content_heading: 2, u_content_button: 1, u_content_image: 2, u_content_social: 1, u_content_divider: 0 }
    ),
  },
  {
    id: 'tpl_best_sellers',
    name: 'Productos Mas Vendidos',
    category: 'e-commerce',
    thumbnailColor: THUMBNAIL_COLORS['e-commerce'],
    design_json: makeDesign(
      [
        headerRow('Tu Marca'),
        makeRow(
          [
            headingModule('Nuestros Mas Vendidos', 'u_heading_1', { fontSize: '28px', containerPadding: '24px 16px 8px' }),
            textModule(
              '<p style="text-align:center;font-size:15px;color:#71717a;">Los productos favoritos de nuestros clientes. No te quedes sin el tuyo.</p>',
              'u_text_intro',
              { containerPadding: '4px 32px 16px' }
            ),
          ],
          'u_row_1'
        ),
        makeMultiColumnRow(
          [
            [
              imageModule('https://placehold.co/280x280/f4f4f5/71717a?text=Best+1', 'Producto 1', 'u_img_p1'),
              textModule('<p style="text-align:center;font-size:13px;font-weight:bold;color:#18181b;margin:8px 0 2px;">Clasico Premium</p><p style="text-align:center;font-size:16px;font-weight:bold;color:#3b82f6;">$49.990</p>', 'u_text_p1', { containerPadding: '8px 12px' }),
            ],
            [
              imageModule('https://placehold.co/280x280/f4f4f5/71717a?text=Best+2', 'Producto 2', 'u_img_p2'),
              textModule('<p style="text-align:center;font-size:13px;font-weight:bold;color:#18181b;margin:8px 0 2px;">Edicion Limitada</p><p style="text-align:center;font-size:16px;font-weight:bold;color:#3b82f6;">$69.990</p>', 'u_text_p2', { containerPadding: '8px 12px' }),
            ],
          ],
          'u_row_grid1'
        ),
        makeMultiColumnRow(
          [
            [
              imageModule('https://placehold.co/280x280/f4f4f5/71717a?text=Best+3', 'Producto 3', 'u_img_p3'),
              textModule('<p style="text-align:center;font-size:13px;font-weight:bold;color:#18181b;margin:8px 0 2px;">Sport Series</p><p style="text-align:center;font-size:16px;font-weight:bold;color:#3b82f6;">$59.990</p>', 'u_text_p3', { containerPadding: '8px 12px' }),
            ],
            [
              imageModule('https://placehold.co/280x280/f4f4f5/71717a?text=Best+4', 'Producto 4', 'u_img_p4'),
              textModule('<p style="text-align:center;font-size:13px;font-weight:bold;color:#18181b;margin:8px 0 2px;">Coleccion Urban</p><p style="text-align:center;font-size:16px;font-weight:bold;color:#3b82f6;">$44.990</p>', 'u_text_p4', { containerPadding: '8px 12px' }),
            ],
          ],
          'u_row_grid2'
        ),
        makeRow(
          [
            buttonModule('Ver Todos los Productos', 'https://tutienda.com/productos', 'u_btn_1', {
              containerPadding: '16px 80px 32px',
              buttonColors: { color: '#ffffff', backgroundColor: '#3b82f6', hoverColor: '#ffffff', hoverBackgroundColor: '#2563eb' },
            }),
          ],
          'u_row_cta'
        ),
        footerRow(),
      ],
      { u_row: 7, u_column: 11, u_content_text: 7, u_content_heading: 1, u_content_button: 1, u_content_image: 5, u_content_social: 1, u_content_divider: 0 }
    ),
  },
  {
    id: 'tpl_review_request',
    name: 'Solicitud de Resena',
    category: 'e-commerce',
    thumbnailColor: THUMBNAIL_COLORS['e-commerce'],
    design_json: makeDesign(
      [
        headerRow('Tu Marca'),
        makeRow(
          [
            headingModule('Como fue tu experiencia?', 'u_heading_1', { fontSize: '26px', containerPadding: '32px 16px 8px' }),
            textModule(
              '<p style="text-align:center;font-size:15px;color:#3f3f46;">Tu opinion es muy importante para nosotros y para otros compradores. Cuentanos que te parecio tu compra reciente.</p>',
              'u_text_intro',
              { containerPadding: '8px 32px 16px' }
            ),
          ],
          'u_row_1'
        ),
        makeRow(
          [
            imageModule('https://placehold.co/200x200/f4f4f5/71717a?text=Tu+Producto', 'Tu producto', 'u_img_product', { containerPadding: '16px', src: { url: 'https://placehold.co/200x200/f4f4f5/71717a?text=Tu+Producto', width: 200, height: 200 } }),
            textModule(
              '<p style="text-align:center;font-size:14px;font-weight:bold;color:#18181b;">Producto Comprado</p><p style="text-align:center;font-size:13px;color:#71717a;">Pedido #12345 | 5 de Marzo, 2026</p>',
              'u_text_product',
              { containerPadding: '0px 16px 16px' }
            ),
          ],
          'u_row_product'
        ),
        makeRow(
          [
            textModule(
              '<p style="text-align:center;font-size:40px;letter-spacing:8px;margin:0;">&#9733;&#9733;&#9733;&#9733;&#9733;</p><p style="text-align:center;font-size:14px;color:#71717a;">Toca para calificar</p>',
              'u_text_stars',
              { containerPadding: '8px 16px' }
            ),
            buttonModule('Dejar mi Resena', 'https://tutienda.com/review', 'u_btn_1', {
              containerPadding: '8px 80px 16px',
              buttonColors: { color: '#ffffff', backgroundColor: '#3b82f6', hoverColor: '#ffffff', hoverBackgroundColor: '#2563eb' },
            }),
            textModule(
              '<p style="text-align:center;font-size:13px;color:#a1a1aa;">Solo te tomara 1 minuto</p>',
              'u_text_note',
              { containerPadding: '0px 16px 32px' }
            ),
          ],
          'u_row_stars'
        ),
        footerRow(),
      ],
      { u_row: 5, u_column: 5, u_content_text: 6, u_content_heading: 1, u_content_button: 1, u_content_image: 2, u_content_social: 1, u_content_divider: 0 }
    ),
  },
  {
    id: 'tpl_thank_you',
    name: 'Gracias por tu Compra',
    category: 'e-commerce',
    thumbnailColor: THUMBNAIL_COLORS['e-commerce'],
    design_json: makeDesign(
      [
        headerRow('Tu Marca'),
        makeRow(
          [
            textModule(
              '<p style="text-align:center;font-size:48px;margin:0;">&#10004;&#65039;</p>',
              'u_text_check',
              { containerPadding: '32px 16px 0px' }
            ),
            headingModule('Gracias por tu compra!', 'u_heading_1', { fontSize: '28px', containerPadding: '8px 16px' }),
            textModule(
              '<p style="text-align:center;font-size:16px;color:#3f3f46;">Tu pedido ha sido confirmado y esta siendo preparado. Te notificaremos cuando sea enviado.</p>',
              'u_text_intro',
              { containerPadding: '8px 32px 16px' }
            ),
          ],
          'u_row_1'
        ),
        makeRow(
          [
            textModule(
              '<div style="background-color:#f4f4f5;border-radius:8px;padding:20px;margin:0 20px;"><p style="font-size:14px;font-weight:bold;color:#18181b;margin:0 0 12px;">Resumen del Pedido #12345</p><table style="width:100%;border-collapse:collapse;font-size:14px;"><tr style="border-bottom:1px solid #e4e4e7;"><td style="padding:8px 0;color:#3f3f46;">Producto Ejemplo x1</td><td style="padding:8px 0;text-align:right;font-weight:bold;">$49.990</td></tr><tr style="border-bottom:1px solid #e4e4e7;"><td style="padding:8px 0;color:#3f3f46;">Envio</td><td style="padding:8px 0;text-align:right;color:#16a34a;">Gratis</td></tr><tr><td style="padding:12px 0;font-weight:bold;font-size:16px;">Total</td><td style="padding:12px 0;text-align:right;font-weight:bold;font-size:16px;">$49.990</td></tr></table></div>',
              'u_text_order',
              { containerPadding: '8px 16px 16px' }
            ),
            buttonModule('Ver mi Pedido', 'https://tutienda.com/orders/12345', 'u_btn_1', {
              containerPadding: '0px 80px 16px',
            }),
            dividerModule('u_divider_1'),
          ],
          'u_row_order'
        ),
        makeRow(
          [
            headingModule('Tambien te puede gustar', 'u_heading_2', { fontSize: '20px', containerPadding: '16px 16px 12px' }),
          ],
          'u_row_cross_label'
        ),
        makeMultiColumnRow(
          [
            [
              imageModule('https://placehold.co/180x180/f4f4f5/71717a?text=Sugerido+1', 'Sugerido 1', 'u_img_s1'),
              textModule('<p style="text-align:center;font-size:13px;font-weight:bold;">Accesorio A</p><p style="text-align:center;font-size:14px;color:#3b82f6;">$19.990</p>', 'u_text_s1', { containerPadding: '4px 8px 16px' }),
            ],
            [
              imageModule('https://placehold.co/180x180/f4f4f5/71717a?text=Sugerido+2', 'Sugerido 2', 'u_img_s2'),
              textModule('<p style="text-align:center;font-size:13px;font-weight:bold;">Accesorio B</p><p style="text-align:center;font-size:14px;color:#3b82f6;">$24.990</p>', 'u_text_s2', { containerPadding: '4px 8px 16px' }),
            ],
            [
              imageModule('https://placehold.co/180x180/f4f4f5/71717a?text=Sugerido+3', 'Sugerido 3', 'u_img_s3'),
              textModule('<p style="text-align:center;font-size:13px;font-weight:bold;">Accesorio C</p><p style="text-align:center;font-size:14px;color:#3b82f6;">$14.990</p>', 'u_text_s3', { containerPadding: '4px 8px 16px' }),
            ],
          ],
          'u_row_cross_sell'
        ),
        footerRow(),
      ],
      { u_row: 7, u_column: 10, u_content_text: 9, u_content_heading: 2, u_content_button: 1, u_content_image: 4, u_content_social: 1, u_content_divider: 1 }
    ),
  },
  // --- PROMOCION (includes former "winback" templates) ---
  {
    id: 'tpl_promo_flash',
    name: 'Venta Flash',
    category: 'promocion',
    thumbnailColor: THUMBNAIL_COLORS.promocion,
    design_json: makeDesign(
      [
        makeRow(
          [
            textModule(
              '<p style="text-align:center;font-size:12px;color:#fecaca;letter-spacing:2px;text-transform:uppercase;margin:0;">Oferta por tiempo limitado</p>',
              'u_text_pretitle',
              { containerPadding: '24px 16px 8px' }
            ),
            headingModule('FLASH SALE', 'u_heading_1', {
              fontSize: '48px',
              color: '#ffffff',
              containerPadding: '0px 16px',
            }),
            textModule(
              '<p style="text-align:center;font-size:64px;font-weight:bold;color:#fef2f2;margin:0;">50% OFF</p>',
              'u_text_discount',
              { containerPadding: '8px 16px' }
            ),
            textModule(
              '<div style="text-align:center;"><table style="margin:0 auto;border-collapse:collapse;"><tr><td style="padding:8px 16px;text-align:center;background:#7f1d1d;border-radius:6px;margin:0 4px;"><span style="font-size:24px;font-weight:bold;color:#ffffff;">12</span><br/><span style="font-size:10px;color:#fecaca;">HORAS</span></td><td style="padding:0 8px;color:#fecaca;font-size:24px;">:</td><td style="padding:8px 16px;text-align:center;background:#7f1d1d;border-radius:6px;"><span style="font-size:24px;font-weight:bold;color:#ffffff;">45</span><br/><span style="font-size:10px;color:#fecaca;">MIN</span></td><td style="padding:0 8px;color:#fecaca;font-size:24px;">:</td><td style="padding:8px 16px;text-align:center;background:#7f1d1d;border-radius:6px;"><span style="font-size:24px;font-weight:bold;color:#ffffff;">30</span><br/><span style="font-size:10px;color:#fecaca;">SEG</span></td></tr></table></div>',
              'u_text_countdown',
              { containerPadding: '16px' }
            ),
            buttonModule('Comprar Ahora', 'https://tutienda.com/sale', 'u_btn_1', {
              containerPadding: '16px 80px 32px',
              buttonColors: { color: '#dc2626', backgroundColor: '#ffffff', hoverColor: '#dc2626', hoverBackgroundColor: '#fef2f2' },
            }),
          ],
          'u_row_hero',
          {},
          { columnsBackgroundColor: '#dc2626' }
        ),
        makeRow(
          [
            headingModule('Productos Destacados', 'u_heading_2', { fontSize: '22px', containerPadding: '24px 16px 16px' }),
          ],
          'u_row_label'
        ),
        makeMultiColumnRow(
          [
            [
              imageModule('https://placehold.co/280x280/f4f4f5/71717a?text=Producto+1', 'Producto 1', 'u_img_p1'),
              textModule('<p style="text-align:center;font-size:14px;font-weight:bold;color:#18181b;">Producto Premium</p><p style="text-align:center;"><span style="text-decoration:line-through;color:#a1a1aa;font-size:14px;">$79.990</span> <span style="color:#dc2626;font-size:18px;font-weight:bold;">$39.995</span></p>', 'u_text_p1'),
            ],
            [
              imageModule('https://placehold.co/280x280/f4f4f5/71717a?text=Producto+2', 'Producto 2', 'u_img_p2'),
              textModule('<p style="text-align:center;font-size:14px;font-weight:bold;color:#18181b;">Producto Estrella</p><p style="text-align:center;"><span style="text-decoration:line-through;color:#a1a1aa;font-size:14px;">$59.990</span> <span style="color:#dc2626;font-size:18px;font-weight:bold;">$29.995</span></p>', 'u_text_p2'),
            ],
          ],
          'u_row_products'
        ),
        footerRow(),
      ],
      { u_row: 5, u_column: 7, u_content_text: 8, u_content_heading: 2, u_content_button: 1, u_content_image: 3, u_content_social: 1, u_content_divider: 0 }
    ),
  },
  {
    id: 'tpl_promo_season',
    name: 'Promocion de Temporada',
    category: 'promocion',
    thumbnailColor: THUMBNAIL_COLORS.promocion,
    design_json: makeDesign(
      [
        headerRow('Tu Marca'),
        makeRow(
          [
            imageModule('https://placehold.co/600x300/fef2f2/dc2626?text=Coleccion+Verano+2026', 'Coleccion Verano', 'u_img_hero', { containerPadding: '0px' }),
          ],
          'u_row_hero'
        ),
        makeRow(
          [
            headingModule('Nueva Coleccion de Verano', 'u_heading_1', { fontSize: '26px', containerPadding: '24px 16px 8px' }),
            textModule(
              '<p style="text-align:center;font-size:16px;color:#3f3f46;">Descubre nuestras novedades de temporada con hasta <strong style="color:#dc2626;">30% de descuento</strong> en prendas seleccionadas.</p>',
              'u_text_intro',
              { containerPadding: '8px 32px 16px' }
            ),
          ],
          'u_row_intro'
        ),
        makeMultiColumnRow(
          [
            [
              imageModule('https://placehold.co/280x350/fdf2f8/be185d?text=Vestidos', 'Vestidos', 'u_img_cat1'),
              textModule('<p style="text-align:center;font-size:14px;font-weight:bold;margin-top:8px;">Vestidos</p><p style="text-align:center;font-size:13px;color:#dc2626;">Desde $29.990</p>', 'u_text_cat1'),
            ],
            [
              imageModule('https://placehold.co/280x350/eff6ff/2563eb?text=Camisas', 'Camisas', 'u_img_cat2'),
              textModule('<p style="text-align:center;font-size:14px;font-weight:bold;margin-top:8px;">Camisas</p><p style="text-align:center;font-size:13px;color:#dc2626;">Desde $19.990</p>', 'u_text_cat2'),
            ],
          ],
          'u_row_grid1'
        ),
        makeMultiColumnRow(
          [
            [
              imageModule('https://placehold.co/280x350/f0fdf4/16a34a?text=Accesorios', 'Accesorios', 'u_img_cat3'),
              textModule('<p style="text-align:center;font-size:14px;font-weight:bold;margin-top:8px;">Accesorios</p><p style="text-align:center;font-size:13px;color:#dc2626;">Desde $9.990</p>', 'u_text_cat3'),
            ],
            [
              imageModule('https://placehold.co/280x350/fefce8/ca8a04?text=Calzado', 'Calzado', 'u_img_cat4'),
              textModule('<p style="text-align:center;font-size:14px;font-weight:bold;margin-top:8px;">Calzado</p><p style="text-align:center;font-size:13px;color:#dc2626;">Desde $39.990</p>', 'u_text_cat4'),
            ],
          ],
          'u_row_grid2'
        ),
        makeRow(
          [
            buttonModule('Ver Toda la Coleccion', 'https://tutienda.com/verano', 'u_btn_1', { containerPadding: '16px 80px 32px' }),
          ],
          'u_row_cta'
        ),
        footerRow(),
      ],
      { u_row: 8, u_column: 12, u_content_text: 7, u_content_heading: 1, u_content_button: 1, u_content_image: 6, u_content_social: 1, u_content_divider: 0 }
    ),
  },
  {
    id: 'tpl_winback_30',
    name: 'Te Extranamos',
    category: 'promocion',
    thumbnailColor: THUMBNAIL_COLORS.promocion,
    design_json: makeDesign(
      [
        headerRow('Tu Marca'),
        makeRow(
          [
            textModule(
              '<p style="text-align:center;font-size:48px;margin:0;">&#128148;</p>',
              'u_text_emoji',
              { containerPadding: '32px 16px 0px' }
            ),
            headingModule('Te extranamos', 'u_heading_1', { fontSize: '30px', containerPadding: '8px 16px' }),
            textModule(
              '<p style="text-align:center;font-size:16px;color:#3f3f46;">Hace tiempo que no nos visitas y queremos saber como estas. Tenemos novedades que creemos te van a encantar.</p>',
              'u_text_1',
              { containerPadding: '8px 32px 16px' }
            ),
          ],
          'u_row_1'
        ),
        makeRow(
          [
            textModule(
              '<div style="text-align:center;padding:24px;background-color:#fffbeb;border:2px dashed #f59e0b;border-radius:8px;margin:0 32px;"><p style="font-size:14px;color:#92400e;margin:0 0 8px;">Un regalo especial para ti:</p><p style="font-size:36px;font-weight:bold;color:#d97706;margin:0;">20% OFF</p><p style="font-size:14px;color:#92400e;margin:8px 0 0;">Codigo: <strong>VUELVE20</strong></p></div>',
              'u_text_offer',
              { containerPadding: '8px 16px' }
            ),
            buttonModule('Volver a la Tienda', 'https://tutienda.com?coupon=VUELVE20', 'u_btn_1', {
              containerPadding: '16px 80px 16px',
              buttonColors: { color: '#ffffff', backgroundColor: '#d97706', hoverColor: '#ffffff', hoverBackgroundColor: '#b45309' },
            }),
            textModule(
              '<p style="text-align:center;font-size:13px;color:#a1a1aa;">Oferta valida por 7 dias</p>',
              'u_text_expiry',
              { containerPadding: '0px 16px 32px' }
            ),
          ],
          'u_row_2'
        ),
        footerRow(),
      ],
      { u_row: 4, u_column: 4, u_content_text: 6, u_content_heading: 1, u_content_button: 1, u_content_image: 1, u_content_social: 1, u_content_divider: 0 }
    ),
  },
  {
    id: 'tpl_winback_vip',
    name: 'Oferta Exclusiva VIP',
    category: 'promocion',
    thumbnailColor: THUMBNAIL_COLORS.promocion,
    design_json: makeDesign(
      [
        makeRow(
          [
            imageModule('https://placehold.co/600x80/18181b/d4af37?text=VIP+EXCLUSIVE', 'VIP', 'u_img_vip_banner', { containerPadding: '0px' }),
          ],
          'u_row_banner',
          {},
          { columnsBackgroundColor: '#18181b' }
        ),
        makeRow(
          [
            textModule(
              '<p style="text-align:center;font-size:12px;letter-spacing:3px;color:#d4af37;text-transform:uppercase;margin:0;">Exclusivo para ti</p>',
              'u_text_label',
              { containerPadding: '32px 16px 8px' }
            ),
            headingModule('Te mereces lo mejor', 'u_heading_1', { fontSize: '28px', containerPadding: '8px 16px' }),
            textModule(
              '<p style="text-align:center;font-size:16px;color:#3f3f46;">Como cliente VIP, hemos preparado una oferta unica solo para ti. Porque valoramos tu fidelidad.</p>',
              'u_text_intro',
              { containerPadding: '8px 32px 16px' }
            ),
          ],
          'u_row_1'
        ),
        makeRow(
          [
            textModule(
              '<div style="text-align:center;padding:28px;background:linear-gradient(135deg,#18181b,#3f3f46);border-radius:12px;margin:0 20px;"><p style="font-size:14px;color:#d4af37;margin:0 0 8px;letter-spacing:2px;">DESCUENTO VIP</p><p style="font-size:48px;font-weight:bold;color:#ffffff;margin:0;">30% OFF</p><p style="font-size:14px;color:#a1a1aa;margin:8px 0 0;">En toda la tienda sin minimo de compra</p></div>',
              'u_text_offer',
              { containerPadding: '8px 16px' }
            ),
            textModule(
              '<p style="text-align:center;font-size:14px;color:#18181b;margin-top:12px;">Tu codigo personal:</p><p style="text-align:center;font-size:24px;font-weight:bold;color:#18181b;letter-spacing:4px;">VIP30GOLD</p>',
              'u_text_code',
              { containerPadding: '8px 32px' }
            ),
            buttonModule('Acceder a mi Descuento VIP', 'https://tutienda.com?coupon=VIP30GOLD', 'u_btn_1', {
              containerPadding: '16px 60px 32px',
              buttonColors: { color: '#18181b', backgroundColor: '#d4af37', hoverColor: '#18181b', hoverBackgroundColor: '#b8972e' },
            }),
          ],
          'u_row_2'
        ),
        footerRow(),
      ],
      { u_row: 4, u_column: 4, u_content_text: 6, u_content_heading: 1, u_content_button: 1, u_content_image: 2, u_content_social: 1, u_content_divider: 0 }
    ),
  },
  // --- NEWSLETTER ---
  {
    id: 'tpl_newsletter_clean',
    name: 'Newsletter con Articulos',
    category: 'newsletter',
    thumbnailColor: THUMBNAIL_COLORS.newsletter,
    design_json: makeDesign(
      [
        headerRow('Tu Marca'),
        makeRow(
          [
            headingModule('Lo Nuevo esta Semana', 'u_heading_1', { fontSize: '26px', containerPadding: '24px 16px 8px' }),
            textModule(
              '<p style="text-align:center;font-size:14px;color:#71717a;">Las noticias y novedades mas importantes de la semana.</p>',
              'u_text_intro',
              { containerPadding: '4px 32px 16px' }
            ),
          ],
          'u_row_1'
        ),
        makeRow(
          [
            imageModule('https://placehold.co/560x240/e0e7ff/4338ca?text=Articulo+1', 'Articulo 1', 'u_img_art1', { containerPadding: '0px' }),
            textModule(
              '<h2 style="font-size:20px;margin:16px 0 8px;color:#18181b;">Tendencias de Primavera 2026</h2><p style="font-size:14px;color:#3f3f46;margin:0 0 12px;">Descubre las tendencias que van a dominar esta temporada. Colores, texturas y siluetas que no te puedes perder.</p><a href="#" style="font-size:14px;color:#4338ca;font-weight:bold;text-decoration:none;">Leer mas &rarr;</a>',
              'u_text_art1',
              { containerPadding: '16px 20px' }
            ),
            dividerModule('u_divider_1'),
          ],
          'u_row_art1'
        ),
        makeRow(
          [
            imageModule('https://placehold.co/560x240/fce7f3/be185d?text=Articulo+2', 'Articulo 2', 'u_img_art2', { containerPadding: '0px' }),
            textModule(
              '<h2 style="font-size:20px;margin:16px 0 8px;color:#18181b;">Guia de Cuidado de Piel</h2><p style="font-size:14px;color:#3f3f46;margin:0 0 12px;">Los mejores tips para mantener tu piel hidratada durante el cambio de estacion. Productos recomendados incluidos.</p><a href="#" style="font-size:14px;color:#be185d;font-weight:bold;text-decoration:none;">Leer mas &rarr;</a>',
              'u_text_art2',
              { containerPadding: '16px 20px' }
            ),
            dividerModule('u_divider_2'),
          ],
          'u_row_art2'
        ),
        makeRow(
          [
            imageModule('https://placehold.co/560x240/ecfdf5/059669?text=Articulo+3', 'Articulo 3', 'u_img_art3', { containerPadding: '0px' }),
            textModule(
              '<h2 style="font-size:20px;margin:16px 0 8px;color:#18181b;">Recetas Saludables</h2><p style="font-size:14px;color:#3f3f46;margin:0 0 12px;">5 recetas faciles y nutritivas que puedes preparar en menos de 30 minutos. Perfectas para el dia a dia.</p><a href="#" style="font-size:14px;color:#059669;font-weight:bold;text-decoration:none;">Leer mas &rarr;</a>',
              'u_text_art3',
              { containerPadding: '16px 20px 24px' }
            ),
          ],
          'u_row_art3'
        ),
        footerRow(),
      ],
      { u_row: 7, u_column: 7, u_content_text: 8, u_content_heading: 1, u_content_button: 0, u_content_image: 4, u_content_social: 1, u_content_divider: 2 }
    ),
  },
  {
    id: 'tpl_newsletter_minimal',
    name: 'Newsletter Editorial',
    category: 'newsletter',
    thumbnailColor: THUMBNAIL_COLORS.newsletter,
    design_json: makeDesign(
      [
        makeRow(
          [
            textModule(
              '<p style="text-align:center;font-size:12px;letter-spacing:3px;color:#a1a1aa;text-transform:uppercase;margin:0;">Tu Marca</p>',
              'u_text_brand',
              { containerPadding: '32px 16px 8px' }
            ),
            dividerModule('u_divider_top'),
          ],
          'u_row_header'
        ),
        makeRow(
          [
            textModule(
              '<h1 style="font-size:36px;font-weight:300;text-align:center;color:#18181b;line-height:1.3;margin:0;">Reflexiones de la Semana</h1>',
              'u_text_title',
              { containerPadding: '24px 40px 8px' }
            ),
            textModule(
              '<p style="text-align:center;font-size:13px;color:#a1a1aa;">10 de Marzo, 2026</p>',
              'u_text_date',
              { containerPadding: '0px 16px 16px' }
            ),
            dividerModule('u_divider_1'),
            textModule(
              '<p style="font-size:16px;line-height:1.8;color:#3f3f46;">Querido lector,</p><p style="font-size:16px;line-height:1.8;color:#3f3f46;">Esta semana hemos estado reflexionando sobre la importancia de crear conexiones autenticas con nuestros clientes. En un mundo saturado de notificaciones, el valor de un mensaje bien pensado es incalculable.</p><p style="font-size:16px;line-height:1.8;color:#3f3f46;">Creemos firmemente que cada interaccion es una oportunidad para generar confianza y construir relaciones duraderas.</p>',
              'u_text_body1',
              { containerPadding: '16px 40px' }
            ),
            textModule(
              '<p style="font-size:16px;line-height:1.8;color:#3f3f46;"><strong>Lo que aprendimos:</strong></p><ul style="font-size:16px;line-height:1.8;color:#3f3f46;padding-left:20px;"><li>La autenticidad supera la perfeccion</li><li>Menos frecuencia, mas valor en cada envio</li><li>Las historias conectan mas que las promociones</li></ul>',
              'u_text_body2',
              { containerPadding: '8px 40px' }
            ),
            textModule(
              '<p style="font-size:16px;line-height:1.8;color:#3f3f46;">Hasta la proxima semana,<br/><strong>El equipo de Tu Marca</strong></p>',
              'u_text_signoff',
              { containerPadding: '16px 40px 24px' }
            ),
            dividerModule('u_divider_2'),
          ],
          'u_row_content'
        ),
        makeRow(
          [
            textModule(
              '<p style="text-align:center;font-size:12px;color:#a1a1aa;">&copy; 2026 Tu Marca<br/><a href="{{unsubscribe_url}}" style="color:#a1a1aa;">Desuscribirse</a></p>',
              'u_text_footer',
              { containerPadding: '16px' }
            ),
          ],
          'u_row_footer',
          {},
          { columnsBackgroundColor: '#f4f4f5' }
        ),
      ],
      { u_row: 3, u_column: 3, u_content_text: 7, u_content_heading: 0, u_content_button: 0, u_content_image: 0, u_content_social: 0, u_content_divider: 3 }
    ),
  },
  {
    id: 'tpl_brand_story',
    name: 'Historia de Marca',
    category: 'newsletter',
    thumbnailColor: THUMBNAIL_COLORS.newsletter,
    design_json: makeDesign(
      [
        makeRow(
          [
            imageModule('https://placehold.co/600x350/18181b/ffffff?text=Nuestra+Historia', 'Hero', 'u_img_hero', { containerPadding: '0px' }),
          ],
          'u_row_hero'
        ),
        makeRow(
          [
            textModule(
              '<p style="text-align:center;font-size:12px;letter-spacing:3px;color:#a855f7;text-transform:uppercase;margin:0;">Nuestra Historia</p>',
              'u_text_label',
              { containerPadding: '32px 16px 8px' }
            ),
            headingModule('Mas que una marca, una mision', 'u_heading_1', { fontSize: '28px', containerPadding: '4px 16px 8px' }),
            textModule(
              '<p style="font-size:16px;line-height:1.8;color:#3f3f46;text-align:center;">Todo comenzo con una idea simple: crear productos que realmente hagan una diferencia en la vida de las personas. Desde nuestro primer dia, nos comprometimos a combinar calidad excepcional con un proposito mas grande.</p>',
              'u_text_story1',
              { containerPadding: '8px 40px 16px' }
            ),
          ],
          'u_row_1'
        ),
        makeMultiColumnRow(
          [
            [
              imageModule('https://placehold.co/280x200/faf5ff/7c3aed?text=Artesanal', 'Artesanal', 'u_img_s1', { containerPadding: '8px' }),
            ],
            [
              imageModule('https://placehold.co/280x200/f0fdf4/16a34a?text=Sustentable', 'Sustentable', 'u_img_s2', { containerPadding: '8px' }),
            ],
          ],
          'u_row_images'
        ),
        makeRow(
          [
            textModule(
              '<p style="font-size:16px;line-height:1.8;color:#3f3f46;text-align:center;">Cada producto que creamos es el resultado de meses de investigacion, pruebas y amor por los detalles. Trabajamos directamente con artesanos locales, garantizando condiciones justas y materiales sustentables.</p>',
              'u_text_story2',
              { containerPadding: '16px 40px' }
            ),
            textModule(
              '<blockquote style="border-left:4px solid #a855f7;padding:12px 20px;margin:8px 40px;font-style:italic;color:#3f3f46;font-size:18px;">"Creemos que cada compra es un voto por el mundo que queremos construir."</blockquote>',
              'u_text_quote',
              { containerPadding: '8px 16px' }
            ),
            textModule(
              '<p style="font-size:16px;line-height:1.8;color:#3f3f46;text-align:center;">Gracias por ser parte de esta historia. Juntos estamos construyendo algo extraordinario.</p>',
              'u_text_story3',
              { containerPadding: '16px 40px 16px' }
            ),
            buttonModule('Conoce Nuestros Productos', 'https://tutienda.com/nosotros', 'u_btn_1', {
              containerPadding: '8px 80px 32px',
              buttonColors: { color: '#ffffff', backgroundColor: '#a855f7', hoverColor: '#ffffff', hoverBackgroundColor: '#9333ea' },
            }),
          ],
          'u_row_2'
        ),
        footerRow(),
      ],
      { u_row: 5, u_column: 7, u_content_text: 7, u_content_heading: 1, u_content_button: 1, u_content_image: 4, u_content_social: 1, u_content_divider: 0 }
    ),
  },
  // --- GrapeJS HTML Templates (from emailTemplates.ts) ---
  ...emailTemplates.map((t) => {
    const categoryMap: Record<string, Exclude<TemplateCategory, 'todas'>> = {
      welcome: 'bienvenida',
      promo: 'promocion',
      newsletter: 'newsletter',
      abandoned_cart: 'carrito',
      product_launch: 'lanzamiento',
      seasonal: 'temporada',
    };
    return {
      id: t.id,
      name: t.name,
      category: categoryMap[t.category] || ('e-commerce' as Exclude<TemplateCategory, 'todas'>),
      thumbnailColor: THUMBNAIL_COLORS[categoryMap[t.category]] || '#3b82f6',
      design_json: t.html, // HTML string — handled by CampaignBuilder
    };
  }),
];

// ---------------------------------------------------------------------------
// Skeleton Card for loading state
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="h-48 bg-zinc-100 animate-pulse" />
        <div className="p-4">
          <div className="h-4 bg-zinc-100 rounded animate-pulse w-3/4" />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EmailTemplateGallery({ clientId, onSelect, onClose, isOpen }: EmailTemplateGalleryProps) {
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory>('todas');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewTemplate, setPreviewTemplate] = useState<SystemTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [savedTemplates, setSavedTemplates] = useState<SystemTemplate[]>([]);

  // Fetch custom templates from API
  const fetchSavedTemplates = useCallback(async () => {
    try {
      const { data } = await callApi<any>('email-templates', {
        body: { action: 'list', client_id: clientId },
      });
      if (data?.templates) {
        const mapped: SystemTemplate[] = data.templates
          .filter((t: any) => !t.is_system)
          .map((t: any) => ({
            id: t.id,
            name: t.name,
            category: 'custom' as Exclude<TemplateCategory, 'todas'>,
            thumbnailColor: '#71717a',
            design_json: t.design_json || t.html_preview || t.base_html,
            _isSaved: true,
          }));
        setSavedTemplates(mapped);
      }
    } catch {
      // Silently ignore — gallery works without saved templates
    }
  }, [clientId]);

  // Reset state when dialog opens, fetch saved templates
  useEffect(() => {
    if (isOpen) {
      setSelectedCategory('todas');
      setSearchQuery('');
      setPreviewTemplate(null);
      setIsLoading(true);
      fetchSavedTemplates().finally(() => setIsLoading(false));
    }
  }, [isOpen, fetchSavedTemplates]);

  const allTemplates = useMemo(() => [...SYSTEM_TEMPLATES, ...savedTemplates], [savedTemplates]);

  // Count templates per category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cat of CATEGORIES) {
      if (cat.key === 'todas') {
        counts[cat.key] = allTemplates.length;
      } else {
        counts[cat.key] = allTemplates.filter((t) => t.category === cat.key).length;
      }
    }
    return counts;
  }, [allTemplates]);

  const filteredTemplates = useMemo(() => {
    return allTemplates.filter((tpl) => {
      const matchesCategory = selectedCategory === 'todas' || tpl.category === selectedCategory;
      const matchesSearch =
        searchQuery.trim() === '' ||
        tpl.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery, allTemplates]);

  function handleSelectBlank() {
    onSelect(BLANK_DESIGN);
  }

  function handleSelectTemplate(template: SystemTemplate) {
    onSelect(template.design_json);
  }

  return (
    <>
      {/* Main Gallery Dialog */}
      <Dialog open={isOpen && !previewTemplate} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle className="text-xl font-bold">Galeria de Plantillas</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Selecciona una plantilla para tu email
            </DialogDescription>
          </DialogHeader>

          {/* Search */}
          <div className="px-6 pt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar plantillas..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Category tabs with counts */}
          <div className="px-6 pt-3 flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <Button
                key={cat.key}
                size="sm"
                variant={selectedCategory === cat.key ? 'default' : 'outline'}
                onClick={() => setSelectedCategory(cat.key)}
                className="text-xs gap-1.5"
              >
                {cat.label}
                <span className={`text-[10px] rounded-full px-1.5 py-0.5 min-w-[20px] text-center ${
                  selectedCategory === cat.key
                    ? 'bg-white/20 text-white'
                    : 'bg-zinc-100 text-zinc-500'
                }`}>
                  {categoryCounts[cat.key] || 0}
                </span>
              </Button>
            ))}
          </div>

          {/* Template grid */}
          <ScrollArea className="flex-1 px-6 pb-6 pt-3">
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-2">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-2">
                  {/* Blank template always first */}
                  <Card
                    className="cursor-pointer group hover:ring-2 hover:ring-primary transition-all overflow-hidden"
                    onClick={handleSelectBlank}
                  >
                    <CardContent className="p-0">
                      <div className="h-48 flex items-center justify-center bg-zinc-50 border-b border-dashed border-zinc-300">
                        <div className="text-center">
                          <FileText className="h-10 w-10 text-zinc-400 mx-auto mb-3" />
                          <p className="text-sm font-medium text-zinc-500">Empezar en Blanco</p>
                        </div>
                      </div>
                      <div className="p-4">
                        <p className="text-sm font-semibold text-foreground">En Blanco</p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Template cards */}
                  {filteredTemplates.map((tpl) => (
                    <Card
                      key={tpl.id}
                      className="cursor-pointer group hover:ring-2 hover:ring-primary transition-all overflow-hidden"
                      onClick={() => setPreviewTemplate(tpl)}
                    >
                      <CardContent className="p-0">
                        {/* Thumbnail */}
                        <div
                          className="h-48 flex items-center justify-center relative overflow-hidden"
                          style={{ backgroundColor: tpl.thumbnailColor + '18' }}
                        >
                          <div className="text-center px-4">
                            {(tpl as any)._isSaved ? (
                              <User className="h-8 w-8 mx-auto mb-3 text-zinc-500" />
                            ) : (
                              <Sparkles className="h-8 w-8 mx-auto mb-3" style={{ color: tpl.thumbnailColor }} />
                            )}
                            <p className="text-base font-semibold" style={{ color: tpl.thumbnailColor }}>
                              {tpl.name}
                            </p>
                            {(tpl as any)._isSaved && (
                              <p className="text-xs text-zinc-400 mt-1">Guardada</p>
                            )}
                          </div>
                          {/* Hover overlay */}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <p className="text-white text-sm font-medium">Ver vista previa</p>
                          </div>
                        </div>

                        {/* Name only */}
                        <div className="p-4">
                          <p className="text-sm font-semibold text-foreground truncate">{tpl.name}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Empty state */}
                {filteredTemplates.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Search className="h-10 w-10 text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">
                      No hay plantillas en esta categoria todavia.
                    </p>
                  </div>
                )}
              </>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Preview Modal */}
      <Dialog open={!!previewTemplate} onOpenChange={(open) => { if (!open) setPreviewTemplate(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle className="text-lg font-bold">
              {previewTemplate?.name}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Vista previa de la plantilla
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 px-6 py-4">
            {/* Render a visual representation of the template */}
            <div className="border rounded-lg overflow-hidden bg-zinc-100">
              {typeof previewTemplate?.design_json === 'string' ? (
                /* GrapeJS HTML template — render directly */
                <div
                  className="bg-white mx-auto"
                  style={{ maxWidth: 600 }}
                  dangerouslySetInnerHTML={{ __html: previewTemplate.design_json }}
                />
              ) : (
              <div className="bg-white mx-auto" style={{ maxWidth: 600 }}>
                {previewTemplate?.design_json?.body?.rows?.map((row: any, rowIdx: number) => (
                  <div
                    key={rowIdx}
                    style={{
                      backgroundColor: row.values?.columnsBackgroundColor || '#ffffff',
                      padding: row.values?.padding || '0px',
                    }}
                  >
                    {row.columns?.map((col: any, colIdx: number) => (
                      <div key={colIdx}>
                        {col.contents?.map((content: any, cIdx: number) => {
                          if (content.type === 'heading') {
                            return (
                              <div
                                key={cIdx}
                                style={{
                                  padding: content.values?.containerPadding || '16px',
                                  textAlign: (content.values?.textAlign || 'center') as any,
                                  fontSize: content.values?.fontSize || '28px',
                                  fontWeight: 'bold',
                                  color: content.values?.color || '#18181b',
                                  lineHeight: content.values?.lineHeight || '140%',
                                }}
                              >
                                {content.values?.text}
                              </div>
                            );
                          }
                          if (content.type === 'text') {
                            return (
                              <div
                                key={cIdx}
                                style={{ padding: content.values?.containerPadding || '16px' }}
                                dangerouslySetInnerHTML={{ __html: content.values?.text || '' }}
                              />
                            );
                          }
                          if (content.type === 'button') {
                            const bc = content.values?.buttonColors || {};
                            return (
                              <div key={cIdx} style={{ padding: content.values?.containerPadding || '16px', textAlign: 'center' }}>
                                <div
                                  style={{
                                    display: 'inline-block',
                                    width: '100%',
                                    maxWidth: 400,
                                    padding: content.values?.padding || '14px 28px',
                                    backgroundColor: bc.backgroundColor || '#18181b',
                                    color: bc.color || '#ffffff',
                                    borderRadius: content.values?.borderRadius || '6px',
                                    textAlign: 'center',
                                    fontWeight: 'bold',
                                    fontSize: '14px',
                                  }}
                                  dangerouslySetInnerHTML={{ __html: content.values?.text || '' }}
                                />
                              </div>
                            );
                          }
                          if (content.type === 'image') {
                            const src = typeof content.values?.src === 'string' ? content.values.src : content.values?.src?.url;
                            return (
                              <div key={cIdx} style={{ padding: content.values?.containerPadding || '0px', textAlign: 'center' }}>
                                <img
                                  src={src}
                                  alt={content.values?.altText || ''}
                                  style={{ maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto' }}
                                />
                              </div>
                            );
                          }
                          if (content.type === 'divider') {
                            const b = content.values?.border || {};
                            return (
                              <div key={cIdx} style={{ padding: content.values?.containerPadding || '16px' }}>
                                <hr style={{ border: 'none', borderTop: `${b.borderTopWidth || '1px'} ${b.borderTopStyle || 'solid'} ${b.borderTopColor || '#e4e4e7'}` }} />
                              </div>
                            );
                          }
                          if (content.type === 'social') {
                            return (
                              <div key={cIdx} style={{ padding: content.values?.containerPadding || '16px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
                                  {content.values?.icons?.icons?.map((icon: any, iIdx: number) => (
                                    <span key={iIdx} style={{ fontSize: 12, color: '#71717a' }}>{icon.name}</span>
                                  ))}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              )}
            </div>
          </ScrollArea>

          {/* Preview actions */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t">
            <Button variant="outline" onClick={() => setPreviewTemplate(null)}>
              Cerrar
            </Button>
            <Button
              onClick={() => {
                if (previewTemplate) {
                  handleSelectTemplate(previewTemplate);
                  setPreviewTemplate(null);
                }
              }}
            >
              Usar plantilla
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
