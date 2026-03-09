/**
 * Merge tag definitions for Unlayer editor,
 * matching Klaviyo template variables.
 */

export const klaviyoMergeTags = {
  personalización: {
    name: 'Personalización',
    mergeTags: {
      first_name: { name: 'Nombre', value: '{{ first_name|default:"" }}' },
      last_name: { name: 'Apellido', value: '{{ last_name|default:"" }}' },
      email: { name: 'Email', value: '{{ email }}' },
      full_name: { name: 'Nombre completo', value: '{{ first_name|default:"" }} {{ last_name|default:"" }}' },
    },
  },
  tienda: {
    name: 'Tienda',
    mergeTags: {
      store_url: { name: 'URL de la tienda', value: '{{ organization.url }}' },
      store_name: { name: 'Nombre de la tienda', value: '{{ organization.name }}' },
    },
  },
  carrito: {
    name: 'Carrito abandonado',
    mergeTags: {
      checkout_url: { name: 'URL del checkout', value: '{{ event.extra.checkout_url }}' },
      total_price: { name: 'Precio total', value: '{{ event.extra.total_price }}' },
      item_count: { name: 'Cantidad de items', value: '{{ event.extra.line_items|length }}' },
    },
  },
  suscripcion: {
    name: 'Suscripción',
    mergeTags: {
      unsubscribe: { name: 'Desuscribirse', value: '{%unsubscribe%}' },
      manage_preferences: { name: 'Preferencias', value: "{%manage_preferences 'Manage Preferences'%}" },
      view_in_browser: { name: 'Ver en navegador', value: '{%view_in_browser%}' },
    },
  },
};

export const unlayerMergeTagsConfig = {
  mergeTags: klaviyoMergeTags,
};
