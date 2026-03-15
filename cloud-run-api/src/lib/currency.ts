/**
 * Shared currency conversion module with TTL-based cache.
 * All backend routes should use this instead of duplicating exchange rate logic.
 */

const EXCHANGE_RATE_API_URL = 'https://api.exchangerate-api.com/v4/latest/USD';

const FALLBACK_RATES: Record<string, number> = {
  CLP: 950,
  MXN: 17.5,
  EUR: 0.92,
  GBP: 0.79,
  ARS: 900,
  COP: 4200,
  PEN: 3.7,
};

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let cachedRates: Record<string, number> | null = null;
let cacheTimestamp = 0;

/**
 * Fetch exchange rates from API with 1-hour TTL cache.
 * Falls back to hardcoded rates on failure.
 */
export async function getExchangeRates(): Promise<Record<string, number>> {
  const now = Date.now();
  if (cachedRates && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedRates;
  }

  try {
    const response = await fetch(EXCHANGE_RATE_API_URL);
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    const data: any = await response.json();
    cachedRates = data.rates || FALLBACK_RATES;
    cacheTimestamp = now;
    console.log(`[currency] Exchange rates fetched: 1 USD = ${cachedRates!['CLP']} CLP`);
    return cachedRates!;
  } catch (error) {
    console.error('[currency] Failed to fetch exchange rates, using fallback:', error);
    // If we have stale cached rates, prefer them over fallback
    if (cachedRates) {
      console.warn('[currency] Using stale cached rates');
      return cachedRates;
    }
    return FALLBACK_RATES;
  }
}

/**
 * Convert an amount from any currency to CLP.
 * Uses cached exchange rates (1-hour TTL).
 */
export async function convertToCLP(amount: number, fromCurrency: string): Promise<number> {
  const currency = fromCurrency.toUpperCase();
  if (currency === 'CLP') return amount;

  const rates = await getExchangeRates();

  if (currency === 'USD') {
    return amount * (rates['CLP'] || FALLBACK_RATES['CLP']);
  }

  // Convert FROM -> USD -> CLP
  const fromRate = rates[currency] || 1;
  const clpRate = rates['CLP'] || FALLBACK_RATES['CLP'];
  return (amount / fromRate) * clpRate;
}

/**
 * Fetch the currency of a Google Ads account via the API.
 * Returns 'USD' as fallback if the API call fails.
 */
export async function fetchGoogleAccountCurrency(
  customerId: string,
  accessToken: string,
  developerToken: string
): Promise<string> {
  try {
    const query = `SELECT customer.currency_code FROM customer LIMIT 1`;
    const response = await fetch(
      `https://googleads.googleapis.com/v18/customers/${customerId}/googleAds:searchStream`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'developer-token': developerToken,
          'login-customer-id': customerId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      }
    );
    if (!response.ok) return 'USD';
    const text = await response.text();
    const json = JSON.parse(text);
    const results = Array.isArray(json) ? json[0]?.results : json?.results;
    return results?.[0]?.customer?.currencyCode || 'USD';
  } catch {
    console.warn('[currency] Could not fetch Google Ads account currency, defaulting to USD');
    return 'USD';
  }
}
