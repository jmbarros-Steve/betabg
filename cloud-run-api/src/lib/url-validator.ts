/**
 * URL validation helpers for SSRF protection.
 *
 * Reusable across any route/lib that fetches user-supplied URLs (scrapers,
 * webhooks, redirects, etc.). Extracted from deep-dive-competitor.ts to avoid
 * duplication across the competitor intelligence pipeline.
 *
 * Owner: Sofía W14 (Integraciones)
 */

export interface SsrfValidationResult {
  safe: boolean;
  reason?: string;
}

/**
 * Validate that a URL is safe to fetch from server-side code.
 *
 * Rejects:
 *   - Non-HTTP(S) protocols (file://, gopher://, etc.)
 *   - Localhost variants (localhost, 0.0.0.0, [::1])
 *   - Cloud metadata endpoints (169.254.169.254, metadata.google.internal)
 *   - Private/internal IPv4 ranges (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, 0/8)
 */
export function validateUrlForSSRF(urlString: string): SsrfValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { safe: false, reason: 'Invalid URL' };
  }

  // Only allow HTTP and HTTPS
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: `Protocol not allowed: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block cloud metadata endpoints
  if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
    return { safe: false, reason: 'Cloud metadata endpoint blocked' };
  }

  // Block localhost variants
  if (hostname === 'localhost' || hostname === '0.0.0.0' || hostname === '[::1]') {
    return { safe: false, reason: 'Localhost not allowed' };
  }

  // Check if hostname is an IP address and block private/internal ranges
  // IPv4 pattern
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octets = [
      parseInt(ipv4Match[1]),
      parseInt(ipv4Match[2]),
      parseInt(ipv4Match[3]),
      parseInt(ipv4Match[4]),
    ];
    const [a, b] = octets;

    // 127.0.0.0/8 — loopback
    if (a === 127) return { safe: false, reason: 'Loopback address blocked' };
    // 10.0.0.0/8 — private
    if (a === 10) return { safe: false, reason: 'Private IP (10.x) blocked' };
    // 172.16.0.0/12 — private
    if (a === 172 && b >= 16 && b <= 31) return { safe: false, reason: 'Private IP (172.16-31.x) blocked' };
    // 192.168.0.0/16 — private
    if (a === 192 && b === 168) return { safe: false, reason: 'Private IP (192.168.x) blocked' };
    // 169.254.0.0/16 — link-local
    if (a === 169 && b === 254) return { safe: false, reason: 'Link-local address blocked' };
    // 0.0.0.0/8
    if (a === 0) return { safe: false, reason: 'Zero network blocked' };
  }

  return { safe: true };
}
