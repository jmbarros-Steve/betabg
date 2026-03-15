/** 15 visual styles for ad image generation, rotated per client to avoid repetition. */
export const VISUAL_STYLES = [
  'UGC (user-generated content)',
  'Editorial de revista',
  'Flat lay cenital',
  'Lifestyle outdoor',
  'Lifestyle indoor',
  'Behind-the-scenes',
  'Antes/Después split',
  'Close-up de producto',
  'Modelo usando el producto',
  'Estilo testimonial',
  'Minimalista fondo limpio',
  'Bold typography overlay',
  'Comparación split-screen',
  'Seasonal/temático',
  'Night mood / luces neón',
] as const;

export type VisualStyle = (typeof VISUAL_STYLES)[number];
