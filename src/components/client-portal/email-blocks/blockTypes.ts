// Block type definitions for the Email Block Editor
// Each block type maps to a Klaviyo-compatible email block

export type BlockType =
  | 'text'
  | 'image'
  | 'split'
  | 'button'
  | 'header_bar'
  | 'drop_shadow'
  | 'divider'
  | 'social_links'
  | 'spacer'
  | 'product'
  | 'coupon'
  | 'table'
  | 'review'
  | 'video'
  | 'html'
  | 'columns'
  | 'section';

export interface EmailBlock {
  id: string;
  type: BlockType;
  props: Record<string, any>;
  children?: EmailBlock[]; // For columns/section/split
}

// Default props for each block type
export const BLOCK_DEFAULTS: Record<BlockType, Record<string, any>> = {
  text: {
    content: '<p>Escribe tu texto aquí...</p>',
    align: 'left',
    fontSize: 14,
    color: '#333333',
  },
  image: {
    src: '',
    alt: '',
    width: '100%',
    align: 'center',
    link: '',
    paddingTop: 10,
    paddingBottom: 10,
  },
  split: {
    layout: '50/50',
    columns: [[], []], // Each column is an array of EmailBlock
  },
  button: {
    text: 'Comprar ahora',
    url: '',
    bgColor: '#000000',
    textColor: '#ffffff',
    borderRadius: 4,
    align: 'center',
    width: 'auto',
    paddingV: 14,
    paddingH: 32,
  },
  header_bar: {
    text: '🔥 SALE — ¡Última oportunidad!',
    bgColor: '#000000',
    textColor: '#ffffff',
    fontSize: 14,
    icon: '',
  },
  drop_shadow: {
    position: 'bottom',
    color: '#000000',
    intensity: 'medium',
  },
  divider: {
    style: 'solid',
    color: '#e5e7eb',
    thickness: 1,
    width: '100%',
    marginTop: 16,
    marginBottom: 16,
  },
  social_links: {
    facebook: '',
    instagram: '',
    tiktok: '',
    twitter: '',
    youtube: '',
    linkedin: '',
    pinterest: '',
    whatsapp: '',
    iconStyle: 'color',
    iconSize: 'medium',
    align: 'center',
  },
  spacer: {
    height: 30,
  },
  product: {
    productId: '',
    name: 'Nombre del producto',
    imageUrl: '',
    price: '',
    description: '',
    link: '',
    layout: 'image-top',
    showPrice: true,
    showDescription: true,
    showButton: true,
    buttonText: 'Comprar',
  },
  coupon: {
    code: 'DESCUENTO20',
    description: '20% de descuento en toda la tienda',
    expiresAt: '',
    shopUrl: '',
    buttonText: 'Usar cupón',
  },
  table: {
    rows: 3,
    cols: 3,
    data: [
      ['Header 1', 'Header 2', 'Header 3'],
      ['Celda 1', 'Celda 2', 'Celda 3'],
      ['Celda 4', 'Celda 5', 'Celda 6'],
    ],
    headerBgColor: '#000000',
    headerTextColor: '#ffffff',
    showBorders: true,
  },
  review: {
    customerName: 'Cliente Satisfecho',
    reviewText: '¡Excelente producto! Superó mis expectativas.',
    rating: 5,
    customerPhoto: '',
  },
  video: {
    url: '',
    thumbnailUrl: '',
  },
  html: {
    code: '<!-- Tu HTML personalizado -->',
  },
  columns: {
    count: 2,
    proportions: '50/50',
    columns: [[], []], // Arrays of EmailBlock
  },
  section: {
    bgColor: '#f9fafb',
    paddingTop: 20,
    paddingBottom: 20,
    paddingLeft: 20,
    paddingRight: 20,
    borderColor: '',
    borderWidth: 0,
    borderRadius: 0,
    children: [], // Array of EmailBlock
  },
};

export interface BlockDefinition {
  type: BlockType;
  label: string;
  icon: string;
  category: 'blocks' | 'design';
}

export const BLOCK_DEFINITIONS: BlockDefinition[] = [
  // Blocks section
  { type: 'text', label: 'Texto', icon: '📝', category: 'blocks' },
  { type: 'image', label: 'Imagen', icon: '🖼️', category: 'blocks' },
  { type: 'split', label: 'División', icon: '📊', category: 'blocks' },
  { type: 'button', label: 'Botón', icon: '🔘', category: 'blocks' },
  { type: 'header_bar', label: 'Encabezado', icon: '📌', category: 'blocks' },
  { type: 'drop_shadow', label: 'Sombra', icon: '🌀', category: 'blocks' },
  { type: 'divider', label: 'Divisor', icon: '➖', category: 'blocks' },
  { type: 'social_links', label: 'Redes', icon: '❤️', category: 'blocks' },
  { type: 'spacer', label: 'Espaciador', icon: '↕️', category: 'blocks' },
  { type: 'product', label: 'Producto', icon: '📦', category: 'blocks' },
  { type: 'coupon', label: 'Cupón', icon: '🎟️', category: 'blocks' },
  { type: 'table', label: 'Tabla', icon: '📋', category: 'blocks' },
  { type: 'review', label: 'Reseña', icon: '⭐', category: 'blocks' },
  { type: 'video', label: 'Vídeo', icon: '🎬', category: 'blocks' },
  { type: 'html', label: 'HTML', icon: '</>', category: 'blocks' },
  // Design section
  { type: 'columns', label: 'Columnas', icon: '📐', category: 'design' },
  { type: 'section', label: 'Sección', icon: '📦', category: 'design' },
];

export function createBlock(type: BlockType): EmailBlock {
  return {
    id: crypto.randomUUID(),
    type,
    props: JSON.parse(JSON.stringify(BLOCK_DEFAULTS[type])),
  };
}

// Generate video thumbnail from YouTube/Vimeo URL
export function getVideoThumbnail(url: string): string {
  if (!url) return '';
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (ytMatch) return `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`;
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://vumbnail.com/${vimeoMatch[1]}.jpg`;
  return '';
}
