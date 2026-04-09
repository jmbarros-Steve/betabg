/**
 * Shared prompt sanitization utilities.
 * All AI route handlers should use these instead of duplicating sanitization logic.
 */

/**
 * Sanitize user-controlled text before injecting into AI prompts.
 * Strips common prompt-injection patterns and limits length.
 */
export function sanitizeForPrompt(text: string, maxLength = 500): string {
  if (!text) return '';
  return text
    .replace(/\b(ignore|forget|disregard)\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?)/gi, '[filtered]')
    .replace(/\b(you are now|act as|pretend to be|new instructions?:|system prompt:?)/gi, '[filtered]')
    .replace(/```[\s\S]*?```/g, '[code-block-removed]')
    .substring(0, maxLength);
}
