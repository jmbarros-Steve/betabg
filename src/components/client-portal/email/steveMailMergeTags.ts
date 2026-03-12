/**
 * Merge tag definitions for Unlayer editor — Steve Mail.
 * Uses simple {{ tag }} syntax (not Klaviyo's Jinja-style syntax).
 */

export const steveMailMergeTags = {
  personalización: {
    name: 'Personalización',
    mergeTags: {
      first_name: { name: 'Nombre', value: '{{ first_name }}' },
      last_name: { name: 'Apellido', value: '{{ last_name }}' },
      email: { name: 'Email', value: '{{ email }}' },
      full_name: { name: 'Nombre completo', value: '{{ full_name }}' },
    },
  },
  tienda: {
    name: 'Tienda',
    mergeTags: {
      brand_name: { name: 'Nombre de la marca', value: '{{ brand_name }}' },
      shop_url: { name: 'URL de la tienda', value: '{{ shop_url }}' },
      brand_color: { name: 'Color de marca', value: '{{ brand_color }}' },
    },
  },
  compras: {
    name: 'Historial de compras',
    mergeTags: {
      total_orders: { name: 'Total de pedidos', value: '{{ total_orders }}' },
      total_spent: { name: 'Total gastado', value: '{{ total_spent }}' },
      last_order_date: { name: 'Fecha último pedido', value: '{{ last_order_date }}' },
      days_since_last_order: { name: 'Días desde último pedido', value: '{{ days_since_last_order }}' },
    },
  },
  carrito: {
    name: 'Carrito abandonado',
    mergeTags: {
      cart_url: { name: 'URL del carrito', value: '{{ cart_url }}' },
      cart_total: { name: 'Total del carrito', value: '{{ cart_total }}' },
      cart_items_count: { name: 'Items en el carrito', value: '{{ cart_items_count }}' },
    },
  },
  productos: {
    name: 'Productos',
    mergeTags: {
      product_recommendations: { name: 'Recomendaciones de productos', value: '{{ product_recommendations }}' },
      discount_code: { name: 'Código de descuento', value: '{{ discount_code }}' },
      product_name: { name: 'Nombre del producto', value: '{{ product_name }}' },
      product_price: { name: 'Precio del producto', value: '{{ product_price }}' },
      product_image: { name: 'Imagen del producto', value: '{{ product_image }}' },
      product_url: { name: 'URL del producto', value: '{{ product_url }}' },
    },
  },
  suscripcion: {
    name: 'Suscripción',
    mergeTags: {
      unsubscribe_url: { name: 'Link de desuscripción', value: '{{ unsubscribe_url }}' },
      subscriber_tags: { name: 'Tags del suscriptor', value: '{{ subscriber_tags }}' },
      subscribed_date: { name: 'Fecha de suscripción', value: '{{ subscribed_date }}' },
    },
  },
};

export const steveMailMergeTagsConfig = {
  mergeTags: steveMailMergeTags,
};
