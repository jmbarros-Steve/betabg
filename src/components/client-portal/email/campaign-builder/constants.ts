/**
 * Constantes del CampaignBuilder.
 *
 * Extraídas de CampaignBuilder.tsx como parte del refactor gradual.
 * Autor: Valentina W1 — 2026-04-08
 */

export const CAMPAIGN_TYPES = [
  { value: 'promotional', label: 'Promocional' },
  { value: 'newsletter', label: 'Newsletter' },
  { value: 'product_launch', label: 'Lanzamiento de producto' },
  { value: 'seasonal', label: 'Temporada / Holiday' },
  { value: 'announcement', label: 'Anuncio' },
  { value: 'restock', label: 'Restock / Back in stock' },
] as const;

/**
 * Gmail clips emails > 102KB. Advertimos al usuario si se pasa.
 * https://support.google.com/mail/answer/6558?hl=en
 */
export const GMAIL_CLIP_LIMIT = 102 * 1024;

/**
 * Valores permitidos para A/B winning metric.
 */
export const AB_WINNING_METRICS = [
  { value: 'open_rate', label: 'Tasa de apertura' },
  { value: 'click_rate', label: 'Tasa de clicks' },
  { value: 'revenue', label: 'Ingresos atribuidos' },
] as const;

/**
 * Duración por default del test A/B (en horas) antes de decidir ganador.
 */
export const DEFAULT_AB_DURATION_HOURS = 4;
export const DEFAULT_AB_TEST_PERCENT = 20;
