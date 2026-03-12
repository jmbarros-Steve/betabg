/**
 * Shared Unlayer editor configuration for Steve Mail.
 * Used by CampaignBuilder, FlowBuilder, and UnlayerEmailEditor.
 *
 * Custom tools are registered in registerSteveMailTools() via editor.registerTool()
 * after the editor is ready. This is more reliable than customJS which can fail
 * silently due to CORS/iframe issues.
 */
import { steveMailMergeTagsConfig } from './steveMailMergeTags';

export interface SteveMailEditorOptions {
  designTags?: Record<string, string>;
  mergeTagsOverride?: Record<string, any>;
}

// Helper to create a single-row Unlayer design (the `data` field for blocks)
function makeBlockDesign(cells: number[], columns: any[]): any {
  return {
    counters: { u_column: columns.length + 1, u_row: 2, u_content_text: 10, u_content_image: 5, u_content_button: 5, u_content_heading: 5, u_content_divider: 3, u_content_social: 2 },
    body: {
      id: 'block_body',
      rows: [
        {
          id: 'block_row_1',
          cells,
          columns: columns.map((col: any, i: number) => ({
            id: `block_col_${i}`,
            contents: col.contents,
            values: col.values || { _meta: { htmlID: `u_column_${i + 1}`, htmlClassNames: 'u_column' } },
          })),
          values: {
            displayCondition: null,
            columns: false,
            backgroundColor: '',
            columnsBackgroundColor: '',
            backgroundImage: { url: '', fullWidth: true, repeat: 'no-repeat', size: 'custom', position: 'center' },
            padding: '0px',
            anchor: '',
            hideDesktop: false,
            _meta: { htmlID: 'u_row_1', htmlClassNames: 'u_row' },
            selectable: true,
            draggable: true,
            duplicatable: true,
            deletable: true,
            hideable: true,
          },
        },
      ],
      values: {
        popupPosition: 'center',
        popupWidth: '600px',
        popupHeight: 'auto',
        borderRadius: '10px',
        contentAlign: 'center',
        contentVerticalAlign: 'center',
        contentWidth: '600px',
        fontFamily: { label: 'Inter', value: "'Inter',sans-serif" },
        textColor: '#18181b',
        popupBackgroundColor: '#FFFFFF',
        popupBackgroundImage: { url: '', fullWidth: true, repeat: 'no-repeat', size: 'cover', position: 'center' },
        popupOverlay_backgroundColor: 'rgba(0, 0, 0, 0.1)',
        popupCloseButton_position: 'top-right',
        popupCloseButton_backgroundColor: '#DDDDDD',
        popupCloseButton_iconColor: '#000000',
        popupCloseButton_borderRadius: '0px',
        popupCloseButton_margin: '0px',
        popupCloseButton_action: { name: 'close_popup', attrs: { onClick: "document.querySelector('.u-popup-container').style.display = 'none';" } },
        backgroundColor: '#ffffff',
        backgroundImage: { url: '', fullWidth: true, repeat: 'no-repeat', size: 'custom', position: 'center' },
        preheaderText: '',
        linkStyle: { body: true, linkColor: '#6366f1', linkHoverColor: '#4f46e5', linkUnderline: true, linkHoverUnderline: true },
        _meta: { htmlID: 'u_body', htmlClassNames: 'u_body' },
      },
    },
  };
}

// Pre-built rows that appear in the Blocks tab
const customBlocks = [
  {
    id: 100001,
    category: 'Steve Mail',
    tags: ['steve', 'hero'],
    data: makeBlockDesign([1], [
      {
        contents: [
          {
            type: 'image',
            values: {
              containerPadding: '0px',
              anchor: '',
              src: { url: 'https://placehold.co/600x300/18181b/fafafa?text=Hero+Banner', width: 600, height: 300 },
              textAlign: 'center',
              altText: 'Hero Banner',
              action: { name: 'web', values: { href: '', target: '_blank' } },
              hideDesktop: false,
              displayCondition: null,
              _meta: { htmlID: 'u_content_image_1', htmlClassNames: 'u_content_image' },
              selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
            },
          },
          {
            type: 'heading',
            values: {
              containerPadding: '20px 30px 10px',
              anchor: '',
              headingType: 'h1',
              fontSize: '28px',
              textAlign: 'center',
              lineHeight: '140%',
              linkStyle: { inherit: true, linkColor: '#0000ee', linkHoverColor: '#0000ee', linkUnderline: true, linkHoverUnderline: true },
              hideDesktop: false,
              displayCondition: null,
              _meta: { htmlID: 'u_content_heading_1', htmlClassNames: 'u_content_heading' },
              selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
              text: '<span style="color: #18181b;">Tu Título Aquí</span>',
            },
          },
          {
            type: 'text',
            values: {
              containerPadding: '0px 30px 10px',
              anchor: '',
              textAlign: 'center',
              lineHeight: '160%',
              linkStyle: { inherit: true },
              hideDesktop: false,
              displayCondition: null,
              _meta: { htmlID: 'u_content_text_1', htmlClassNames: 'u_content_text' },
              selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
              text: '<p style="font-size: 14px; line-height: 160%;"><span style="color: #71717a;">Subtítulo descriptivo de tu campaña o promoción.</span></p>',
            },
          },
          {
            type: 'button',
            values: {
              containerPadding: '16px 30px 24px',
              anchor: '',
              href: { name: 'web', values: { href: '', target: '_blank' } },
              buttonColors: { color: '#ffffff', backgroundColor: '#18181b', hoverColor: '#ffffff', hoverBackgroundColor: '#333333' },
              size: { autoWidth: false, width: '60%' },
              textAlign: 'center',
              lineHeight: '120%',
              padding: '12px 24px',
              borderRadius: '6px',
              hideDesktop: false,
              displayCondition: null,
              _meta: { htmlID: 'u_content_button_1', htmlClassNames: 'u_content_button' },
              selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
              text: '<span style="font-size: 14px; line-height: 16.8px;">Comprar Ahora</span>',
              calculatedWidth: 360, calculatedHeight: 41,
            },
          },
        ],
      },
    ]),
  },
  {
    id: 100002,
    category: 'Steve Mail',
    tags: ['steve', 'producto'],
    data: makeBlockDesign([1, 1], [
      {
        contents: [
          {
            type: 'image',
            values: {
              containerPadding: '16px',
              anchor: '',
              src: { url: 'https://placehold.co/400x400/f4f4f5/a1a1aa?text=Producto', width: 400, height: 400 },
              textAlign: 'center',
              altText: 'Producto',
              action: { name: 'web', values: { href: '', target: '_blank' } },
              hideDesktop: false,
              displayCondition: null,
              _meta: { htmlID: 'u_content_image_2', htmlClassNames: 'u_content_image' },
              selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
            },
          },
        ],
      },
      {
        contents: [
          {
            type: 'heading',
            values: {
              containerPadding: '20px 16px 4px',
              anchor: '',
              headingType: 'h2',
              fontSize: '22px',
              textAlign: 'left',
              lineHeight: '140%',
              linkStyle: { inherit: true },
              hideDesktop: false,
              displayCondition: null,
              _meta: { htmlID: 'u_content_heading_2', htmlClassNames: 'u_content_heading' },
              selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
              text: '<span style="color: #18181b;">Nombre del Producto</span>',
            },
          },
          {
            type: 'text',
            values: {
              containerPadding: '0px 16px',
              anchor: '',
              textAlign: 'left',
              lineHeight: '160%',
              linkStyle: { inherit: true },
              hideDesktop: false,
              displayCondition: null,
              _meta: { htmlID: 'u_content_text_2', htmlClassNames: 'u_content_text' },
              selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
              text: '<p style="font-size: 18px; font-weight: 700; color: #18181b;">$99.99</p><p style="color: #71717a;">Descripción breve del producto destacado.</p>',
            },
          },
          {
            type: 'button',
            values: {
              containerPadding: '12px 16px 20px',
              anchor: '',
              href: { name: 'web', values: { href: '', target: '_blank' } },
              buttonColors: { color: '#ffffff', backgroundColor: '#18181b', hoverColor: '#ffffff', hoverBackgroundColor: '#333333' },
              size: { autoWidth: true, width: '100%' },
              textAlign: 'left',
              lineHeight: '120%',
              padding: '10px 24px',
              borderRadius: '6px',
              hideDesktop: false,
              displayCondition: null,
              _meta: { htmlID: 'u_content_button_2', htmlClassNames: 'u_content_button' },
              selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
              text: '<span style="font-size: 14px; line-height: 16.8px;">Ver Producto</span>',
              calculatedWidth: 127, calculatedHeight: 37,
            },
          },
        ],
      },
    ]),
  },
  {
    id: 100003,
    category: 'Steve Mail',
    tags: ['steve', 'descuento', 'cupón'],
    data: makeBlockDesign([1], [
      {
        contents: [
          {
            type: 'html',
            values: {
              containerPadding: '10px',
              anchor: '',
              html: `<div style="text-align:center;padding:24px;">
<div style="display:inline-block;border:2px dashed #d4d4d8;border-radius:12px;padding:24px 40px;background:#fafafa;">
<p style="margin:0 0 4px;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:1px;">Tu código de descuento</p>
<p style="margin:0 0 16px;font-size:28px;font-weight:700;color:#18181b;letter-spacing:3px;">DESCUENTO20</p>
<a href="#" style="display:inline-block;padding:10px 28px;background:#18181b;color:#fff;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">Usar Código</a>
</div>
</div>`,
              hideDesktop: false,
              displayCondition: null,
              _meta: { htmlID: 'u_content_html_1', htmlClassNames: 'u_content_html' },
              selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
            },
          },
        ],
      },
    ]),
  },
  {
    id: 100004,
    category: 'Steve Mail',
    tags: ['steve', 'footer', 'social'],
    data: makeBlockDesign([1], [
      {
        contents: [
          {
            type: 'divider',
            values: {
              containerPadding: '16px 30px',
              anchor: '',
              borderTopWidth: '1px',
              borderTopStyle: 'solid',
              borderTopColor: '#e4e4e7',
              width: '100%',
              textAlign: 'center',
              hideDesktop: false,
              displayCondition: null,
              _meta: { htmlID: 'u_content_divider_1', htmlClassNames: 'u_content_divider' },
              selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
            },
          },
          {
            type: 'social',
            values: {
              containerPadding: '8px 30px',
              anchor: '',
              icons: {
                iconType: 'circle',
                icons: [
                  { url: '#', name: 'Facebook', img: 'https://cdn.tools.unlayer.com/social/icons/circle/facebook.png' },
                  { url: '#', name: 'Instagram', img: 'https://cdn.tools.unlayer.com/social/icons/circle/instagram.png' },
                  { url: '#', name: 'Twitter', img: 'https://cdn.tools.unlayer.com/social/icons/circle/twitter.png' },
                ],
              },
              iconSize: '32px',
              iconSpacing: '8px',
              align: 'center',
              hideDesktop: false,
              displayCondition: null,
              _meta: { htmlID: 'u_content_social_1', htmlClassNames: 'u_content_social' },
              selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
            },
          },
          {
            type: 'text',
            values: {
              containerPadding: '8px 30px 16px',
              anchor: '',
              textAlign: 'center',
              lineHeight: '160%',
              linkStyle: { inherit: true },
              hideDesktop: false,
              displayCondition: null,
              _meta: { htmlID: 'u_content_text_3', htmlClassNames: 'u_content_text' },
              selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
              text: '<p style="font-size: 12px; color: #a1a1aa;">{{ brand_name }} — <a href="{{ unsubscribe_url }}" style="color: #a1a1aa;">Desuscribirse</a></p>',
            },
          },
        ],
      },
    ]),
  },
];

// ===== Spanish translations for Unlayer =====
const spanishTranslations = {
  'es-ES': {
    // Tabs
    'editor.content.title': 'Contenido',
    'editor.blocks.title': 'Bloques',
    'editor.body.title': 'General',
    'editor.images.title': 'Imágenes',
    'editor.uploads.title': 'Subidas',
    // Built-in tool names
    'tools.text.name': 'Texto',
    'tools.image.name': 'Imagen',
    'tools.button.name': 'Botón',
    'tools.divider.name': 'Divisor',
    'tools.heading.name': 'Título',
    'tools.html.name': 'HTML',
    'tools.menu.name': 'Menú',
    'tools.social.name': 'Redes Sociales',
    'tools.video.name': 'Video',
    'tools.timer.name': 'Temporizador',
    'tools.columns.name': 'Columnas',
    // Common properties
    'editor.action.label': 'Acción',
    'editor.action.web': 'Abrir sitio web',
    'editor.action.email': 'Enviar email',
    'editor.action.phone': 'Llamar teléfono',
    'editor.action.url': 'URL',
    'editor.align.label': 'Alineación',
    'editor.background_color.label': 'Color de fondo',
    'editor.border.label': 'Borde',
    'editor.border_radius.label': 'Radio del borde',
    'editor.color.label': 'Color',
    'editor.container_padding.label': 'Espaciado',
    'editor.font_family.label': 'Fuente',
    'editor.font_size.label': 'Tamaño de fuente',
    'editor.font_weight.label': 'Grosor de fuente',
    'editor.line_height.label': 'Altura de línea',
    'editor.link_color.label': 'Color del enlace',
    'editor.padding.label': 'Espaciado interno',
    'editor.text_align.label': 'Alineación de texto',
    'editor.text_color.label': 'Color de texto',
    'editor.width.label': 'Ancho',
    // Buttons
    'editor.button.text': 'Texto del botón',
    'editor.button.url': 'URL del botón',
    'editor.button.colors': 'Colores del botón',
    'editor.button.background_color': 'Color de fondo',
    'editor.button.text_color': 'Color de texto',
    'editor.button.hover_color': 'Color hover',
    'editor.button.border_radius': 'Radio del borde',
    'editor.button.padding': 'Espaciado interno',
    'editor.button.width': 'Ancho',
    // Image
    'editor.image.alt_text': 'Texto alternativo',
    'editor.image.url': 'URL de la imagen',
    'editor.image.upload': 'Subir imagen',
    // Row/Column
    'editor.row.label': 'Fila',
    'editor.column.label': 'Columna',
    'editor.columns.label': 'Columnas',
    'editor.row.background_color': 'Color de fondo',
    'editor.row.content_background_color': 'Color de contenido',
    'editor.row.background_image': 'Imagen de fondo',
    // Body
    'editor.body.background_color': 'Color de fondo',
    'editor.body.content_width': 'Ancho de contenido',
    'editor.body.font_family': 'Fuente',
    'editor.body.preheader': 'Texto de previsualización',
    // Actions
    'editor.done': 'Listo',
    'editor.cancel': 'Cancelar',
    'editor.save': 'Guardar',
    'editor.delete': 'Eliminar',
    'editor.duplicate': 'Duplicar',
    'editor.move_up': 'Mover arriba',
    'editor.move_down': 'Mover abajo',
    // Drag & drop
    'editor.drag_here': 'Arrastra contenido aquí',
    'editor.drop_here': 'Suelta aquí',
    // Search
    'editor.search': 'Buscar',
    'editor.search_placeholder': 'Buscar...',
    // Stock images
    'editor.stock_images.title': 'Imágenes de stock',
    'editor.stock_images.search': 'Buscar imágenes',
  },
};

export const getSteveMailEditorOptions = (opts?: SteveMailEditorOptions) => {
  return {
    displayMode: 'email' as const,
    locale: 'es-ES',
    translations: spanishTranslations,
    projectId: 1, // Required for some Unlayer features
    appearance: {
      theme: 'modern_light',
      panels: {
        tools: {
          dock: 'left' as const,
          collapsible: true,
        },
      },
    },
    features: {
      stockImages: { enabled: true, safeSearch: true },
      userUploads: true,
    },
    tools: {
      html: { enabled: true },
      image: { enabled: true },
      text: { enabled: true },
      button: {
        enabled: true,
        properties: {
          borderRadius: { value: '8px' },
          padding: { value: '14px 32px' },
          buttonColors: {
            value: {
              color: '#ffffff',
              backgroundColor: '#18181b',
              hoverColor: '#ffffff',
              hoverBackgroundColor: '#333333',
            },
          },
        },
      },
      divider: { enabled: true },
      heading: { enabled: true },
      menu: { enabled: true },
      social: { enabled: true },
      video: { enabled: true },
      columns: { enabled: true },
      timer: { enabled: true },
    },
    tabs: {
      content: { enabled: true },
      blocks: { enabled: true },
      body: { enabled: true },
      images: { enabled: true },
    },
    customCSS: [],
    customJS: ['/unlayer-product-tool.js'],
    blocks: customBlocks,
    ...(opts?.mergeTagsOverride
      ? { mergeTags: opts.mergeTagsOverride }
      : steveMailMergeTagsConfig),
    ...(opts?.designTags ? { designTags: opts.designTags } : {}),
  };
};

/**
 * No-op. Custom tools registered via customJS (public/unlayer-product-tool.js).
 */
export function registerSteveMailTools(_editor: any) {
  // Tools registered via customJS — see public/unlayer-product-tool.js
}
