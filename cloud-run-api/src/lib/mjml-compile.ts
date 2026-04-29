/**
 * Helper para compilar MJML → HTML email-compatible.
 *
 * Steve Mail genera MJML (vía IA o editor GrapeJS) y lo persiste en
 * email_campaigns.html_content. Antes de enviar via Resend, hay que
 * compilar a HTML responsive con CSS inline.
 *
 * Si el contenido NO parece MJML (ej: HTML legacy de campañas viejas o
 * templates importados de Klaviyo) se devuelve sin tocar.
 *
 * Autor: Valentina W1 — 2026-04-29
 */

// @ts-ignore — mjml v5 expone default export, los types no siempre matchan
import mjml2html from 'mjml';

export function compileMjmlIfNeeded(content: string): string {
  if (!content) return '';
  const trimmed = content.trim();

  // Detección laxa: si no empieza con <mjml o no incluye <mj-body, asumimos
  // que ya es HTML directo (campañas viejas, importadas de Klaviyo, etc).
  const looksLikeMjml = /^<mjml[\s>]/i.test(trimmed) || /<mj-body[\s>]/i.test(trimmed);
  if (!looksLikeMjml) return content;

  try {
    const result = mjml2html(content, {
      validationLevel: 'soft',
      keepComments: false,
    });
    if (result.errors && result.errors.length > 0) {
      const summary = result.errors
        .slice(0, 3)
        .map((e: any) => e.formattedMessage || e.message)
        .join('; ');
      console.warn('[mjml-compile] warnings:', summary);
    }
    return result.html || content;
  } catch (err) {
    console.error('[mjml-compile] failed, falling back to raw content:', err);
    return content;
  }
}
