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

/**
 * Sanitize fetched web content (markdown/HTML) before injecting into AI prompts.
 *
 * Stronger than {@link sanitizeForPrompt}: also strips <script> and <style>
 * blocks that survive a markdown conversion, and uses a larger default budget
 * because web content is usually fed as long context, not as user input.
 *
 * Use this for ANY content scraped from a third-party page (Firecrawl, direct
 * fetch, screenshot OCR, etc.) before passing it to a Claude / OpenAI prompt.
 *
 * Originally lived in `routes/analytics/deep-dive-competitor.ts`; promoted to
 * shared lib so the competitor-intelligence pipeline can reuse it without
 * importing from a route handler.
 */
export function sanitizeWebContentForPrompt(text: string, maxLength = 3000): string {
  if (!text) return '';
  return text
    .replace(/\b(ignore|forget|disregard)\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?)/gi, '[filtered]')
    .replace(/\b(you are now|act as|pretend to be|new instructions?:|system prompt:?)/gi, '[filtered]')
    .replace(/```[\s\S]*?```/g, '[code-block-removed]')
    .replace(/<script[\s\S]*?<\/script>/gi, '[script-removed]')
    .replace(/<style[\s\S]*?<\/style>/gi, '[style-removed]')
    .substring(0, maxLength);
}
