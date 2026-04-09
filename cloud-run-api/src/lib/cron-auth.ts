import { timingSafeEqual } from 'node:crypto';

/**
 * Validate cron secret header using constant-time comparison.
 * Prevents timing attacks that could leak the secret byte-by-byte
 * via response-time analysis.
 *
 * @param header - The X-Cron-Secret header value from the request
 * @returns true if the header matches CRON_SECRET env var
 */
export function isValidCronSecret(header: string | undefined): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || !header) return false;

  const headerTrimmed = header.trim();
  if (headerTrimmed.length !== expected.length) return false;

  return timingSafeEqual(
    Buffer.from(headerTrimmed, 'utf-8'),
    Buffer.from(expected, 'utf-8'),
  );
}
