// Shared currency conversion utilities for edge functions
// Uses a public exchange rate API with fallback to a cached rate

const EXCHANGE_RATE_API_URL = 'https://api.exchangerate-api.com/v4/latest/USD';

// Fallback rates when API is unavailable (updated manually)
const FALLBACK_RATES: Record<string, number> = {
  CLP: 950, // 1 USD = 950 CLP (approximate)
  MXN: 17.5,
  ARS: 900,
  COP: 4000,
  PEN: 3.7,
  EUR: 0.92,
  GBP: 0.79,
};

interface ExchangeRateResponse {
  rates: Record<string, number>;
  base: string;
  date: string;
}

// Cache for exchange rates (valid for 1 hour)
let cachedRates: ExchangeRateResponse | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Fetch current exchange rates from the API
 * Falls back to hardcoded rates if API fails
 */
export async function getExchangeRates(): Promise<Record<string, number>> {
  const now = Date.now();

  // Return cached rates if still valid
  if (cachedRates && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedRates.rates;
  }

  try {
    const response = await fetch(EXCHANGE_RATE_API_URL);
    if (!response.ok) {
      throw new Error(`Exchange rate API returned ${response.status}`);
    }

    const data: ExchangeRateResponse = await response.json();
    cachedRates = data;
    cacheTimestamp = now;

    console.log(`Exchange rates updated: 1 USD = ${data.rates.CLP} CLP`);
    return data.rates;
  } catch (error) {
    console.error('Failed to fetch exchange rates, using fallback:', error);
    return FALLBACK_RATES;
  }
}

/**
 * Convert an amount from source currency to target currency
 * @param amount - The amount to convert
 * @param fromCurrency - Source currency code (e.g., 'USD')
 * @param toCurrency - Target currency code (e.g., 'CLP')
 * @returns The converted amount
 */
export async function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<number> {
  // No conversion needed if same currency
  if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) {
    return amount;
  }

  const rates = await getExchangeRates();
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();

  // The API uses USD as base
  if (from === 'USD') {
    // Direct conversion from USD
    const rate = rates[to] || FALLBACK_RATES[to] || 1;
    return amount * rate;
  } else if (to === 'USD') {
    // Convert to USD
    const fromRate = rates[from] || FALLBACK_RATES[from] || 1;
    return amount / fromRate;
  } else {
    // Cross conversion: FROM -> USD -> TO
    const fromRate = rates[from] || FALLBACK_RATES[from] || 1;
    const toRate = rates[to] || FALLBACK_RATES[to] || 1;
    const usdAmount = amount / fromRate;
    return usdAmount * toRate;
  }
}

/**
 * Synchronously convert using fallback rates only
 * Use this when you don't want to make an API call
 */
export function convertCurrencySync(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): number {
  if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) {
    return amount;
  }

  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();

  if (from === 'USD') {
    return amount * (FALLBACK_RATES[to] || 1);
  } else if (to === 'USD') {
    return amount / (FALLBACK_RATES[from] || 1);
  } else {
    const usdAmount = amount / (FALLBACK_RATES[from] || 1);
    return usdAmount * (FALLBACK_RATES[to] || 1);
  }
}

/**
 * Get the current exchange rate for a currency pair
 */
export async function getRate(
  fromCurrency: string,
  toCurrency: string
): Promise<number> {
  if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) {
    return 1;
  }

  const rates = await getExchangeRates();
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();

  if (from === 'USD') {
    return rates[to] || FALLBACK_RATES[to] || 1;
  } else if (to === 'USD') {
    return 1 / (rates[from] || FALLBACK_RATES[from] || 1);
  } else {
    const fromRate = rates[from] || FALLBACK_RATES[from] || 1;
    const toRate = rates[to] || FALLBACK_RATES[to] || 1;
    return toRate / fromRate;
  }
}
