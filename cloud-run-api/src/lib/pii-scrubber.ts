/**
 * PII Scrubber — Strips sensitive personal data from messages before storing.
 *
 * Detects and redacts:
 * - Credit/debit card numbers (13-19 digit sequences)
 * - CVV/CVC codes (when near card context)
 * - Card expiry dates (MM/YY, MM/YYYY)
 * - Chilean RUT (XX.XXX.XXX-X)
 * - Generic SSN-like patterns
 *
 * Does NOT redact: emails (needed for lead extraction), phone numbers (already known),
 * or names (needed for personalization).
 */

// Credit card: 13-19 digits, optionally separated by spaces, dashes, or dots
const CARD_NUMBER_RE = /\b(?:\d[ .\-]?){12,18}\d\b/g;

// Luhn check to reduce false positives on long number sequences
function passesLuhn(digits: string): boolean {
  const nums = digits.replace(/\D/g, '');
  if (nums.length < 13 || nums.length > 19) return false;

  let sum = 0;
  let alternate = false;
  for (let i = nums.length - 1; i >= 0; i--) {
    let n = parseInt(nums[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

// Chilean RUT: 1-2 digits + dot + 3 digits + dot + 3 digits + dash + check digit
// Also matches without dots: 12345678-9
const RUT_RE = /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/g;

// CVV/CVC: 3-4 digits near keywords
const CVV_CONTEXT_RE = /(?:cvv|cvc|c[oó]digo\s*(?:de\s*)?seguridad|security\s*code|c[oó]digo)\s*[:=]?\s*(\d{3,4})\b/gi;

// Card expiry: MM/YY or MM/YYYY near card context
const EXPIRY_RE = /(?:vence|vencimiento|expir[ay]|exp|válid[oa]\s*hasta)\s*[:=]?\s*(\d{1,2}\s*[/\-.]\s*\d{2,4})\b/gi;

// Standalone expiry pattern (when in same message as card number)
const STANDALONE_EXPIRY_RE = /\b(0[1-9]|1[0-2])\s*[/\-.]\s*(\d{2,4})\b/g;

// Generic long number sequences that look like account/ID numbers (10+ digits)
// Only if they appear near financial context keywords
const FINANCIAL_CONTEXT_KEYWORDS = /tarjeta|visa|master|card|cuenta|bank|banco|débito|debito|crédito|credito/i;

export function scrubPII(text: string): { scrubbed: string; hadPII: boolean } {
  let result = text;
  let hadPII = false;

  // 1. Credit card numbers (Luhn validated)
  const cardMatches = result.match(CARD_NUMBER_RE) || [];
  for (const match of cardMatches) {
    const digits = match.replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19 && passesLuhn(digits)) {
      const lastFour = digits.slice(-4);
      result = result.replace(match, `[TARJETA****${lastFour}]`);
      hadPII = true;
    }
  }

  // 2. CVV/CVC codes near keywords
  result = result.replace(CVV_CONTEXT_RE, (full, code) => {
    hadPII = true;
    return full.replace(code, '[CVV-REDACTED]');
  });

  // 3. Card expiry near keywords
  result = result.replace(EXPIRY_RE, (full, date) => {
    hadPII = true;
    return full.replace(date, '[FECHA-REDACTED]');
  });

  // 4. If we already found card PII, also scrub standalone expiry dates in same message
  if (hadPII) {
    result = result.replace(STANDALONE_EXPIRY_RE, '[FECHA-REDACTED]');
  }

  // 5. Chilean RUT
  result = result.replace(RUT_RE, (match) => {
    hadPII = true;
    return '[RUT-REDACTED]';
  });

  // 6. If financial context exists, scrub any remaining long digit sequences
  //    Skip numbers preceded by order-related words (pedido, orden, tracking, etc.)
  if (FINANCIAL_CONTEXT_KEYWORDS.test(text)) {
    result = result.replace(
      /(?<!(pedido|orden|tracking|seguimiento|código|codigo|order|#)\s{0,3})\b\d{10,19}\b/gi,
      (match) => {
        // Skip if already redacted
        if (result.indexOf(match) === -1) return match;
        hadPII = true;
        return '[NUMERO-REDACTED]';
      },
    );
  }

  return { scrubbed: result, hadPII };
}
