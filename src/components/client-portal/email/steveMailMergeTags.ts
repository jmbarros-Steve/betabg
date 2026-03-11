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
    },
  },
  tienda: {
    name: 'Tienda',
    mergeTags: {
      brand_name: { name: 'Nombre de la marca', value: '{{ brand_name }}' },
      shop_url: { name: 'URL de la tienda', value: '{{ shop_url }}' },
    },
  },
  carrito: {
    name: 'Carrito abandonado',
    mergeTags: {
      cart_url: { name: 'URL del carrito', value: '{{ cart_url }}' },
      cart_total: { name: 'Total del carrito', value: '{{ cart_total }}' },
    },
  },
  productos: {
    name: 'Productos',
    mergeTags: {
      product_recommendations: { name: 'Recomendaciones de productos', value: '{{ product_recommendations }}' },
      discount_code: { name: 'Código de descuento', value: '{{ discount_code }}' },
    },
  },
  suscripcion: {
    name: 'Suscripción',
    mergeTags: {
      unsubscribe_url: { name: 'Link de desuscripción', value: '{{ unsubscribe_url }}' },
    },
  },
};

export const steveMailMergeTagsConfig = {
  mergeTags: steveMailMergeTags,
};
