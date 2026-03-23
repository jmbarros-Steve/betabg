export type MarkupType = 'percent' | 'fixed' | 'manual';

export interface MarkupConfig {
  type: MarkupType;
  value: number;
}

export function applyMarkup(basePrice: number, markup: MarkupConfig): number {
  switch (markup.type) {
    case 'percent':
      return Math.round(basePrice * (1 + markup.value / 100));
    case 'fixed':
      return Math.round(basePrice + markup.value);
    case 'manual':
      return Math.round(markup.value);
    default:
      return basePrice;
  }
}

export function calculateMargin(basePrice: number, sellPrice: number): number {
  if (sellPrice === 0) return 0;
  return Math.round(((sellPrice - basePrice) / sellPrice) * 100);
}

export function formatCLP(amount: number): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(amount);
}
