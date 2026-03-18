/**
 * In-memory rate limiter per client+endpoint.
 * Tracks request timestamps in a sliding window.
 *
 * Usage:
 *   const check = checkRateLimit(clientId, 'fetch-shopify-products');
 *   if (!check.allowed) return c.json({ error: `Rate limited. Retry in ${check.retryAfter} seconds.` }, 429);
 */

const store = new Map<string, number[]>();

// Cleanup stale entries every 5 minutes to prevent unbounded growth
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const WINDOW_MS = 60 * 1000; // 1 minute sliding window

setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [key, timestamps] of store) {
    const fresh = timestamps.filter(t => t > cutoff);
    if (fresh.length === 0) {
      store.delete(key);
    } else {
      store.set(key, fresh);
    }
  }
}, CLEANUP_INTERVAL_MS);

export function checkRateLimit(
  clientId: string,
  endpoint: string,
  maxPerMinute = 10
): { allowed: boolean; retryAfter: number } {
  const key = `${clientId}-${endpoint}`;
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  let timestamps = store.get(key);
  if (!timestamps) {
    timestamps = [];
    store.set(key, timestamps);
  }

  // Evict expired entries
  while (timestamps.length > 0 && timestamps[0] <= cutoff) {
    timestamps.shift();
  }

  if (timestamps.length >= maxPerMinute) {
    // Oldest relevant timestamp determines when the window reopens
    const retryAfterMs = timestamps[0] + WINDOW_MS - now;
    return { allowed: false, retryAfter: Math.ceil(retryAfterMs / 1000) };
  }

  timestamps.push(now);
  return { allowed: true, retryAfter: 0 };
}
