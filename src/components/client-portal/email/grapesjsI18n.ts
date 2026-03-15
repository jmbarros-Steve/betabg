/**
 * Spanish (es) locale for GrapeJS email editor.
 *
 * Structure follows the GrapeJS i18n system.
 * Reference: https://github.com/GrapesJS/grapesjs/blob/master/src/i18n/locale/en.js
 */

const traitInputAttr = { placeholder: 'ej. Texto aquí' };

export const esLocale: Record<string, any> = {
  assetManager: {
    addButton: 'Agregar imagen',
    inputPlh: 'http://ruta/a/la/imagen.jpg',
    modalTitle: 'Seleccionar imagen',
    uploadTitle: 'Arrastra archivos aquí o haz clic para subir',
  },
  blockManager: {
    labels: {
      // Basic
      'text': 'Texto',
      'image': 'Imagen',
      'video': 'Video',
      'map': 'Mapa',
      'link': 'Enlace',
      'link-block': 'Bloque de enlace',
      'quote': 'Cita',
      'text-basic': 'Texto básico',
      // Layout
      'column1': '1 Columna',
      'column2': '2 Columnas',
      'column3': '3 Columnas',
      'column3-7': '2 Columnas 3/7',
      // Extra
      'countdown': 'Cuenta regresiva',
      'custom-code': 'Código personalizado',
      // Forms
      'form': 'Formulario',
      'input': 'Campo de texto',
      'textarea': 'Área de texto',
      'select': 'Selector',
      'button': 'Botón',
      'label': 'Etiqueta',
      'checkbox': 'Casilla de verificación',
      'radio': 'Botón de radio',
      // Email / Newsletter
      'sect100': 'Sección 1 Columna',
      'sect50': 'Sección 1/2',
      'sect30': 'Sección 1/3',
      'sect37': 'Sección 3/7',
      'divider': 'Divisor',
      'social': 'Redes sociales',
      'social-link': 'Enlace social',
      'grid-items': 'Cuadrícula',
      'list-items': 'Lista',
      'hero': 'Hero',
    },
    categories: {
      'Basic': 'Básico',
      'Extra': 'Extra',
      'Forms': 'Formularios',
      'Layout': 'Diseño',
    },
  },
  domComponents: {
    names: {
      '': 'Caja',
      wrapper: 'Cuerpo',
      text: 'Texto',
      comment: 'Comentario',
      image: 'Imagen',
      video: 'Video',
      label: 'Etiqueta',
      link: 'Enlace',
      map: 'Mapa',
      tfoot: 'Pie de tabla',
      tbody: 'Cuerpo de tabla',
      thead: 'Encabezado de tabla',
      table: 'Tabla',
      row: 'Fila de tabla',
      cell: 'Celda de tabla',
      section: 'Sección',
      body: 'Cuerpo',
    },
  },
  deviceManager: {
    device: 'Dispositivo',
    devices: {
      desktop: 'Escritorio',
      tablet: 'Tableta',
      mobileLandscape: 'Móvil horizontal',
      mobilePortrait: 'Móvil vertical',
    },
  },
  panels: {
    buttons: {
      titles: {
        preview: 'Vista previa',
        fullscreen: 'Pantalla completa',
        'sw-visibility': 'Ver componentes',
        'export-template': 'Ver código',
        'open-sm': 'Abrir gestor de estilos',
        'open-tm': 'Configuración',
        'open-layers': 'Abrir gestor de capas',
        'open-blocks': 'Abrir bloques',
      },
    },
  },
  selectorManager: {
    label: 'Clases',
    selected: 'Seleccionado',
    emptyState: '- Estado -',
    states: {
      hover: 'Hover',
      active: 'Clic',
      'nth-of-type(2n)': 'Par/Impar',
    },
  },
  styleManager: {
    empty: 'Selecciona un elemento para usar el gestor de estilos',
    layer: 'Capa',
    fileButton: 'Imágenes',
    sectors: {
      general: 'General',
      layout: 'Diseño',
      typography: 'Tipografía',
      decorations: 'Decoraciones',
      extra: 'Extra',
      flex: 'Flex',
      dimension: 'Dimensión',
    },
    // Properties — includes both top-level and sub-properties
    properties: {
      // General / Layout
      'float': 'Flotación',
      'display': 'Visualización',
      'position': 'Posición',
      'top': 'Superior',
      'right': 'Derecha',
      'left': 'Izquierda',
      'bottom': 'Inferior',
      'overflow': 'Desbordamiento',
      'overflow-x': 'Desbordamiento X',
      'overflow-y': 'Desbordamiento Y',

      // Dimension
      'width': 'Ancho',
      'height': 'Altura',
      'max-width': 'Ancho máximo',
      'max-height': 'Altura máxima',
      'min-width': 'Ancho mínimo',
      'min-height': 'Altura mínima',
      'margin': 'Margen',
      'margin-top': 'Margen superior',
      'margin-right': 'Margen derecho',
      'margin-bottom': 'Margen inferior',
      'margin-left': 'Margen izquierdo',
      'padding': 'Relleno',
      'padding-top': 'Relleno superior',
      'padding-right': 'Relleno derecho',
      'padding-bottom': 'Relleno inferior',
      'padding-left': 'Relleno izquierdo',

      // Margin/Padding sub-properties (composite)
      'margin-top-sub': 'Superior',
      'margin-right-sub': 'Derecha',
      'margin-bottom-sub': 'Inferior',
      'margin-left-sub': 'Izquierda',
      'padding-top-sub': 'Superior',
      'padding-right-sub': 'Derecha',
      'padding-bottom-sub': 'Inferior',
      'padding-left-sub': 'Izquierda',

      // Typography
      'font-family': 'Familia tipográfica',
      'font-size': 'Tamaño de fuente',
      'font-weight': 'Peso de fuente',
      'letter-spacing': 'Espaciado de letras',
      'color': 'Color',
      'line-height': 'Interlineado',
      'text-align': 'Alineación de texto',
      'text-decoration': 'Decoración de texto',
      'text-transform': 'Transformación de texto',
      'font-style': 'Estilo de fuente',
      'vertical-align': 'Alineación vertical',
      'white-space': 'Espacios en blanco',
      'word-spacing': 'Espaciado de palabras',
      'text-indent': 'Sangría de texto',

      // Text shadow
      'text-shadow': 'Sombra de texto',
      'text-shadow-h': 'X',
      'text-shadow-v': 'Y',
      'text-shadow-blur': 'Desenfoque',
      'text-shadow-color': 'Color',

      // Decorations — Border
      'border': 'Borde',
      'border-width': 'Grosor del borde',
      'border-style': 'Estilo del borde',
      'border-color': 'Color del borde',
      'border-radius': 'Radio del borde',
      'border-top-left': 'Borde superior izquierdo',
      'border-top-right': 'Borde superior derecho',
      'border-bottom-left': 'Borde inferior izquierdo',
      'border-bottom-right': 'Borde inferior derecho',
      'border-radius-top-left': 'Radio superior izquierdo',
      'border-radius-top-right': 'Radio superior derecho',
      'border-radius-bottom-left': 'Radio inferior izquierdo',
      'border-radius-bottom-right': 'Radio inferior derecho',

      // Border sub-properties (composite)
      'border-width-sub': 'Grosor',
      'border-style-sub': 'Estilo',
      'border-color-sub': 'Color',
      'border-top-left-radius-sub': 'Superior izquierdo',
      'border-top-right-radius-sub': 'Superior derecho',
      'border-bottom-right-radius-sub': 'Inferior derecho',
      'border-bottom-left-radius-sub': 'Inferior izquierdo',

      // Box shadow
      'box-shadow': 'Sombra de caja',
      'box-shadow-h': 'X',
      'box-shadow-v': 'Y',
      'box-shadow-blur': 'Desenfoque',
      'box-shadow-spread': 'Extensión',
      'box-shadow-color': 'Color',
      'box-shadow-type': 'Tipo',

      // Background
      'background': 'Fondo',
      'background-color': 'Color de fondo',
      'background-image': 'Imagen de fondo',
      'background-repeat': 'Repetir fondo',
      'background-position': 'Posición de fondo',
      'background-attachment': 'Fijación de fondo',
      'background-size': 'Tamaño de fondo',

      // Background sub-properties (composite)
      'background-image-sub': 'Imagen',
      'background-repeat-sub': 'Repetir',
      'background-position-sub': 'Posición',
      'background-attachment-sub': 'Fijación',
      'background-size-sub': 'Tamaño',

      // Extra
      'opacity': 'Opacidad',
      'cursor': 'Cursor',

      // Transition
      'transition': 'Transición',
      'transition-property': 'Propiedad de transición',
      'transition-duration': 'Duración de transición',
      'transition-timing-function': 'Función de tiempo de transición',
      'transition-delay': 'Retraso de transición',

      // Transition sub-properties (composite)
      'transition-property-sub': 'Propiedad',
      'transition-duration-sub': 'Duración',
      'transition-timing-function-sub': 'Función de tiempo',

      // Transform
      'transform': 'Transformación',
      'transform-rotate-x': 'Rotar X',
      'transform-rotate-y': 'Rotar Y',
      'transform-rotate-z': 'Rotar Z',
      'transform-scale-x': 'Escalar X',
      'transform-scale-y': 'Escalar Y',
      'transform-scale-z': 'Escalar Z',

      // Perspective
      'perspective': 'Perspectiva',

      // Flex
      'flex-direction': 'Dirección flex',
      'flex-wrap': 'Ajuste flex',
      'justify-content': 'Justificar contenido',
      'align-items': 'Alinear elementos',
      'align-content': 'Alinear contenido',
      'order': 'Orden',
      'flex-basis': 'Base flex',
      'flex-grow': 'Crecimiento flex',
      'flex-shrink': 'Contracción flex',
      'align-self': 'Alineación propia',
    },
  },
  traitManager: {
    empty: 'Selecciona un elemento para ver sus propiedades',
    label: 'Propiedades del componente',
    categories: {},
    traits: {
      labels: {
        id: 'Identificador',
        alt: 'Texto alternativo',
        title: 'Título',
        href: 'Enlace',
        target: 'Destino',
        name: 'Nombre',
        placeholder: 'Texto de ejemplo',
        value: 'Valor',
        type: 'Tipo',
        required: 'Requerido',
        checked: 'Marcado',
        method: 'Método',
        action: 'Acción',
        for: 'Para',
        src: 'Fuente',
        autoplay: 'Reproducción automática',
        loop: 'Repetir',
        controls: 'Controles',
        poster: 'Póster',
        provider: 'Proveedor',
        videoId: 'ID del video',
      },
      attributes: {
        id: traitInputAttr,
        alt: traitInputAttr,
        title: traitInputAttr,
        href: { placeholder: 'ej. https://google.com' },
        name: traitInputAttr,
        placeholder: { placeholder: 'ej. Escribe aquí...' },
        value: traitInputAttr,
      },
      options: {
        target: {
          false: 'Misma ventana',
          _blank: 'Nueva ventana',
        },
        type: {
          text: 'Texto',
          email: 'Correo electrónico',
          password: 'Contraseña',
          number: 'Número',
          submit: 'Enviar',
          reset: 'Reiniciar',
          button: 'Botón',
        },
        method: {
          get: 'GET',
          post: 'POST',
        },
      },
    },
  },
  storageManager: {
    recover: '¿Deseas recuperar los cambios no guardados?',
  },
  // Commands / context menu actions
  commands: {
    'tlb-delete': 'Eliminar',
    'tlb-clone': 'Duplicar',
    'tlb-move': 'Mover',
    'select-parent': 'Seleccionar padre',
  },
  // Rich Text Editor
  rte: {
    bold: 'Negrita',
    italic: 'Cursiva',
    underline: 'Subrayado',
    strikethrough: 'Tachado',
    link: 'Enlace',
    'ordered-list': 'Lista ordenada',
    'unordered-list': 'Lista desordenada',
    indent: 'Aumentar sangría',
    outdent: 'Disminuir sangría',
    'font-size': 'Tamaño de fuente',
    'font-color': 'Color de fuente',
    'hilite-color': 'Color de resaltado',
    'line-height': 'Interlineado',
    superscript: 'Superíndice',
    subscript: 'Subíndice',
    'insert-horizontal-rule': 'Insertar línea horizontal',
    'wrap': 'Envolver',
  },
  // General UI
  general: {
    noElement: 'Ningún elemento seleccionado',
    selected: 'Seleccionado',
    styles: 'Estilos',
    settings: 'Configuración',
    layers: 'Capas',
    blocks: 'Bloques',
    save: 'Guardar',
    cancel: 'Cancelar',
    delete: 'Eliminar',
    move: 'Mover',
    clone: 'Duplicar',
    selectParent: 'Seleccionar padre',
  },
};
