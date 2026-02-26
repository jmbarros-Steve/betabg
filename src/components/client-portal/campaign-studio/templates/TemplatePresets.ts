// TemplatePresets — 6 predefined campaign types with their section layouts

import type { EmailSection } from './BrandHtmlGenerator';

export type CampaignType = 'best_sellers' | 'most_viewed' | 'collection' | 'new_arrivals' | 'promotional' | 'custom';

export interface CampaignTemplate {
  type: CampaignType;
  label: string;
  description: string;
  icon: string; // lucide icon name
  sections: EmailSection[];
  dataSource: 'klaviyo_ordered' | 'klaviyo_viewed' | 'shopify_collection' | 'shopify_newest' | 'manual';
  defaultProductCount: number;
  defaultLayout: string;
  defaultSubject: string;
  defaultTitle: string;
  defaultIntro: string;
  defaultCtaText: string;
}

export const CAMPAIGN_TEMPLATES: Record<CampaignType, CampaignTemplate> = {
  best_sellers: {
    type: 'best_sellers',
    label: 'Más Vendidos',
    description: 'Los productos más vendidos del período. Ideal para generar confianza y urgencia.',
    icon: 'TrendingUp',
    sections: [
      { type: 'header' },
      { type: 'title' },
      { type: 'intro' },
      { type: 'product_grid', props: { limit: 3, layout: 'horizontal', showPrice: true, showButton: true } },
      { type: 'cta' },
      { type: 'footer' },
    ],
    dataSource: 'klaviyo_ordered',
    defaultProductCount: 3,
    defaultLayout: 'horizontal',
    defaultSubject: '🔥 Los más vendidos de la semana',
    defaultTitle: 'Lo que todas aman',
    defaultIntro: 'Descubre los productos favoritos de nuestra comunidad. ¡No te quedes sin el tuyo!',
    defaultCtaText: 'Ver todos los productos',
  },

  most_viewed: {
    type: 'most_viewed',
    label: 'Más Vistos',
    description: 'Los productos que más están mirando. Perfecto para campañas semanales dinámicas.',
    icon: 'Eye',
    sections: [
      { type: 'header' },
      { type: 'title' },
      { type: 'product_grid', props: { limit: 4, layout: 'grid_2x2', showPrice: true, showButton: true } },
      { type: 'cta' },
      { type: 'footer' },
    ],
    dataSource: 'klaviyo_viewed',
    defaultProductCount: 4,
    defaultLayout: 'grid_2x2',
    defaultSubject: '👀 Lo que más están mirando esta semana',
    defaultTitle: 'Tendencia esta semana',
    defaultIntro: 'Estos son los productos que están captando todas las miradas.',
    defaultCtaText: 'Explorar tendencias',
  },

  collection: {
    type: 'collection',
    label: 'Colección',
    description: 'Destaca una colección completa de Shopify con productos seleccionados.',
    icon: 'Layers',
    sections: [
      { type: 'header' },
      { type: 'hero_image' },
      { type: 'title' },
      { type: 'intro' },
      { type: 'product_grid', props: { limit: 6, layout: 'grid_3x1', showPrice: true, showButton: true } },
      { type: 'cta' },
      { type: 'footer' },
    ],
    dataSource: 'shopify_collection',
    defaultProductCount: 6,
    defaultLayout: 'grid_3x1',
    defaultSubject: '✨ Descubre nuestra colección',
    defaultTitle: 'Colección Destacada',
    defaultIntro: 'Una selección curada especialmente para ti.',
    defaultCtaText: 'Ver colección completa',
  },

  new_arrivals: {
    type: 'new_arrivals',
    label: 'Novedades',
    description: 'Los productos más nuevos de la tienda. Genera expectativa y novedad.',
    icon: 'Sparkles',
    sections: [
      { type: 'hero_image' },
      { type: 'title' },
      { type: 'product_grid', props: { limit: 4, layout: 'grid_2x2', showPrice: true, showButton: true } },
      { type: 'cta' },
      { type: 'footer' },
    ],
    dataSource: 'shopify_newest',
    defaultProductCount: 4,
    defaultLayout: 'grid_2x2',
    defaultSubject: '🆕 Recién llegados que te van a encantar',
    defaultTitle: 'Lo nuevo que llegó',
    defaultIntro: 'Sé la primera en descubrir nuestras novedades.',
    defaultCtaText: 'Ver novedades',
  },

  promotional: {
    type: 'promotional',
    label: 'Promocional',
    description: 'Campaña con descuento o cupón. Ideal para cierres de mes o fechas especiales.',
    icon: 'Megaphone',
    sections: [
      { type: 'header' },
      { type: 'title' },
      { type: 'coupon' },
      { type: 'product_grid', props: { limit: 3, layout: 'horizontal', showPrice: true, showButton: true } },
      { type: 'cta' },
      { type: 'footer' },
    ],
    dataSource: 'manual',
    defaultProductCount: 3,
    defaultLayout: 'horizontal',
    defaultSubject: '🎉 ¡Oferta especial solo para ti!',
    defaultTitle: '¡Oferta Especial!',
    defaultIntro: 'Aprovecha este descuento exclusivo antes de que termine.',
    defaultCtaText: 'Ir a la tienda',
  },

  custom: {
    type: 'custom',
    label: 'Personalizado',
    description: 'Diseña tu email desde cero con bloques libres y tu identidad de marca.',
    icon: 'Paintbrush',
    sections: [
      { type: 'header' },
      { type: 'custom_blocks' },
      { type: 'footer' },
    ],
    dataSource: 'manual',
    defaultProductCount: 0,
    defaultLayout: 'horizontal',
    defaultSubject: '',
    defaultTitle: '',
    defaultIntro: '',
    defaultCtaText: 'Ver más',
  },
};

export const CAMPAIGN_TYPE_LIST: CampaignType[] = [
  'best_sellers',
  'most_viewed',
  'collection',
  'new_arrivals',
  'promotional',
  'custom',
];

export function getTemplate(type: CampaignType): CampaignTemplate {
  return CAMPAIGN_TEMPLATES[type];
}

// Color mapping for calendar cards
export const CAMPAIGN_TYPE_COLORS: Record<CampaignType, string> = {
  best_sellers: '#f59e0b',
  most_viewed: '#8b5cf6',
  collection: '#06b6d4',
  new_arrivals: '#10b981',
  promotional: '#ef4444',
  custom: '#6b7280',
};
