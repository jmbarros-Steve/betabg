/**
 * Merge tag definitions for Unlayer editor — Steve Mail.
 * Uses simple {{ tag }} syntax. Organized by category for easy discovery.
 *
 * Each tag includes a `sample` field used for preview rendering.
 */

export const steveMailMergeTags = {
  contacto: {
    name: 'Contacto',
    mergeTags: {
      nombre: { name: 'Nombre', value: '{{ nombre }}', sample: 'María' },
      apellido: { name: 'Apellido', value: '{{ apellido }}', sample: 'González' },
      nombre_completo: { name: 'Nombre completo', value: '{{ nombre_completo }}', sample: 'María González' },
      email: { name: 'Email del contacto', value: '{{ email }}', sample: 'maria@ejemplo.com' },
    },
  },
  tienda: {
    name: 'Mi Tienda',
    mergeTags: {
      empresa: { name: 'Nombre de mi marca', value: '{{ empresa }}', sample: 'Tu Marca' },
      tienda_url: { name: 'URL de mi tienda', value: '{{ tienda_url }}', sample: 'https://tutienda.com' },
      color_marca: { name: 'Color principal de marca', value: '{{ color_marca }}', sample: '#18181b' },
    },
  },
  compras: {
    name: 'Historial de Compras',
    mergeTags: {
      total_orders: { name: 'Cantidad de pedidos', value: '{{ total_orders }}', sample: '5' },
      total_spent: { name: 'Total gastado (dinero)', value: '{{ total_spent }}', sample: '$125.990' },
      last_order_date: { name: 'Fecha del último pedido', value: '{{ last_order_date }}', sample: '10 Mar 2026' },
      days_since_last_order: { name: 'Días desde última compra', value: '{{ days_since_last_order }}', sample: '2' },
    },
  },
  carrito: {
    name: 'Carrito Abandonado',
    mergeTags: {
      cart_url: { name: 'Link al carrito', value: '{{ cart_url }}', sample: '#' },
      cart_total: { name: 'Total del carrito', value: '{{ cart_total }}', sample: '$49.990' },
      cart_items_count: { name: 'Cantidad de items', value: '{{ cart_items_count }}', sample: '3' },
      cart_first_item_name: { name: 'Nombre del primer producto', value: '{{ cart_first_item_name }}', sample: 'Polera Básica' },
      cart_first_item_image: { name: 'Imagen del primer producto', value: '{{ cart_first_item_image }}', sample: 'https://placehold.co/280x280/f4f4f5/a1a1aa?text=Producto' },
    },
  },
  productos: {
    name: 'Productos y Descuentos',
    mergeTags: {
      product_recommendations: { name: 'Bloque de productos recomendados', value: '{{ product_recommendations }}', sample: '[Productos recomendados]' },
      discount_code: { name: 'Código de descuento', value: '{{ discount_code }}', sample: 'STEVE20' },
      product_name: { name: 'Nombre del producto', value: '{{ product_name }}', sample: 'Producto Ejemplo' },
      product_price: { name: 'Precio del producto', value: '{{ product_price }}', sample: '$29.990' },
      product_image: { name: 'URL imagen del producto', value: '{{ product_image }}', sample: 'https://placehold.co/280x280/f4f4f5/a1a1aa?text=Producto' },
      product_url: { name: 'Link al producto', value: '{{ product_url }}', sample: '#' },
    },
  },
  suscripcion: {
    name: 'Suscripción',
    mergeTags: {
      unsubscribe_url: { name: 'Link para desuscribirse', value: '{{ unsubscribe_url }}', sample: '#' },
      subscriber_tags: { name: 'Tags del contacto', value: '{{ subscriber_tags }}', sample: 'vip, frecuente' },
      subscribed_date: { name: 'Fecha en que se suscribió', value: '{{ subscribed_date }}', sample: '1 Ene 2026' },
    },
  },
  fechas: {
    name: 'Fechas',
    mergeTags: {
      current_date: { name: 'Fecha de hoy', value: '{{ current_date }}', sample: '12 Mar 2026' },
      current_month: { name: 'Mes actual', value: '{{ current_month }}', sample: 'Marzo' },
      current_year: { name: 'Año actual', value: '{{ current_year }}', sample: '2026' },
    },
  },
};

export const steveMailMergeTagsConfig = {
  mergeTags: steveMailMergeTags,
};
