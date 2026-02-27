// TemplatePresets — 6 predefined campaign types with their section layouts
// Every template includes: header, content, farewell, social links, footer

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

// Common ending for ALL templates: farewell + social links + footer
const COMMON_ENDING: EmailSection[] = [
  { type: 'spacer', props: { height: 8 } },
  { type: 'farewell' },
  { type: 'social' },
  { type: 'footer' },
];

export const CAMPAIGN_TEMPLATES: Record<CampaignType, CampaignTemplate> = {
  best_sellers: {
    type: 'best_sellers',
    label: 'Mas Vendidos',
    description: 'Los productos mas vendidos del periodo. Ideal para generar confianza y urgencia con social proof.',
    icon: 'TrendingUp',
    sections: [
      { type: 'header' },
      { type: 'hero_image' },
      { type: 'title' },
      { type: 'intro' },
      { type: 'product_grid', props: { limit: 3, layout: 'horizontal', showPrice: true, showButton: true } },
      { type: 'cta' },
      ...COMMON_ENDING,
    ],
    dataSource: 'klaviyo_ordered',
    defaultProductCount: 3,
    defaultLayout: 'horizontal',
    defaultSubject: 'Los mas vendidos de la semana',
    defaultTitle: 'Lo que todas aman',
    defaultIntro: 'Descubre los productos favoritos de nuestra comunidad. No te quedes sin el tuyo.',
    defaultCtaText: 'Ver todos los productos',
  },

  most_viewed: {
    type: 'most_viewed',
    label: 'Mas Vistos',
    description: 'Los productos que mas estan mirando. Perfecto para campanas semanales dinamicas con datos reales.',
    icon: 'Eye',
    sections: [
      { type: 'header' },
      { type: 'hero_image' },
      { type: 'title' },
      { type: 'intro' },
      { type: 'product_grid', props: { limit: 4, layout: 'grid_2x2', showPrice: true, showButton: true } },
      { type: 'cta' },
      ...COMMON_ENDING,
    ],
    dataSource: 'klaviyo_viewed',
    defaultProductCount: 4,
    defaultLayout: 'grid_2x2',
    defaultSubject: 'Lo que mas estan mirando',
    defaultTitle: 'Tendencia esta semana',
    defaultIntro: 'Estos son los productos que estan captando todas las miradas.',
    defaultCtaText: 'Explorar tendencias',
  },

  collection: {
    type: 'collection',
    label: 'Coleccion',
    description: 'Destaca una coleccion de Shopify con hero image y productos seleccionados.',
    icon: 'Layers',
    sections: [
      { type: 'header' },
      { type: 'hero_image' },
      { type: 'title' },
      { type: 'intro' },
      { type: 'divider' },
      { type: 'product_grid', props: { limit: 6, layout: 'grid_3x1', showPrice: true, showButton: true } },
      { type: 'cta' },
      ...COMMON_ENDING,
    ],
    dataSource: 'shopify_collection',
    defaultProductCount: 6,
    defaultLayout: 'grid_3x1',
    defaultSubject: 'Descubre nuestra coleccion',
    defaultTitle: 'Coleccion Destacada',
    defaultIntro: 'Una seleccion curada especialmente para ti.',
    defaultCtaText: 'Ver coleccion completa',
  },

  new_arrivals: {
    type: 'new_arrivals',
    label: 'Novedades',
    description: 'Los productos mas nuevos de la tienda. Genera expectativa y novedad con tu audiencia.',
    icon: 'Sparkles',
    sections: [
      { type: 'header' },
      { type: 'hero_image' },
      { type: 'title' },
      { type: 'intro' },
      { type: 'product_grid', props: { limit: 4, layout: 'grid_2x2', showPrice: true, showButton: true } },
      { type: 'cta' },
      ...COMMON_ENDING,
    ],
    dataSource: 'shopify_newest',
    defaultProductCount: 4,
    defaultLayout: 'grid_2x2',
    defaultSubject: 'Recien llegados que te van a encantar',
    defaultTitle: 'Lo nuevo que llego',
    defaultIntro: 'Se la primera en descubrir nuestras novedades.',
    defaultCtaText: 'Ver novedades',
  },

  promotional: {
    type: 'promotional',
    label: 'Promocional',
    description: 'Campana con descuento o cupon. Ideal para cierres de mes, fechas especiales o flash sales.',
    icon: 'Megaphone',
    sections: [
      { type: 'header' },
      { type: 'hero_image' },
      { type: 'title' },
      { type: 'intro' },
      { type: 'coupon' },
      { type: 'product_grid', props: { limit: 3, layout: 'horizontal', showPrice: true, showButton: true } },
      { type: 'cta' },
      ...COMMON_ENDING,
    ],
    dataSource: 'manual',
    defaultProductCount: 3,
    defaultLayout: 'horizontal',
    defaultSubject: 'Oferta especial solo para ti',
    defaultTitle: 'Oferta Especial',
    defaultIntro: 'Aprovecha este descuento exclusivo antes de que termine.',
    defaultCtaText: 'Ir a la tienda',
  },

  custom: {
    type: 'custom',
    label: 'Personalizado',
    description: 'Disena tu email desde cero con bloques libres, tu identidad de marca y ayuda de Steve.',
    icon: 'Paintbrush',
    sections: [
      { type: 'header' },
      { type: 'hero_image' },
      { type: 'custom_blocks' },
      ...COMMON_ENDING,
    ],
    dataSource: 'manual',
    defaultProductCount: 0,
    defaultLayout: 'horizontal',
    defaultSubject: '',
    defaultTitle: '',
    defaultIntro: '',
    defaultCtaText: 'Ver mas',
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

// Color mapping for calendar cards and badges
export const CAMPAIGN_TYPE_COLORS: Record<CampaignType, string> = {
  best_sellers: '#f59e0b',
  most_viewed: '#8b5cf6',
  collection: '#06b6d4',
  new_arrivals: '#10b981',
  promotional: '#ef4444',
  custom: '#6b7280',
};
