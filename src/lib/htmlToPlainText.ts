const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
  '&ndash;': '–', '&mdash;': '—', '&hellip;': '…',
  '&copy;': '©', '&reg;': '®', '&trade;': '™',
};

export function htmlToPlainText(html: string): string {
  if (!html) return '';

  let text = html;

  // Convert block elements to line breaks
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n');
  text = text.replace(/<(ul|ol)>/gi, '\n');
  text = text.replace(/<li>/gi, '• ');

  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = text.replace(/&[a-zA-Z0-9#]+;/g, (entity) => {
    if (ENTITY_MAP[entity]) return ENTITY_MAP[entity];
    // Numeric entities
    const match = entity.match(/&#(\d+);/);
    if (match) return String.fromCharCode(parseInt(match[1], 10));
    const hexMatch = entity.match(/&#x([0-9a-fA-F]+);/);
    if (hexMatch) return String.fromCharCode(parseInt(hexMatch[1], 16));
    return entity;
  });

  // Clean up whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();

  return text;
}

export function truncateTitle(title: string, maxLength: number = 60): string {
  if (title.length <= maxLength) return title;
  const truncated = title.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > maxLength * 0.6 ? truncated.substring(0, lastSpace) : truncated;
}
