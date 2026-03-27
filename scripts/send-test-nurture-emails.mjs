#!/usr/bin/env node
/**
 * Send 3 test nurture emails — Steve Perro Lobo
 * Prospect: José Manuel, Arueda.cl, industria deportiva/outdoor
 */
import { execSync } from 'child_process';

const getSecret = (name) =>
  execSync(`gcloud secrets versions access latest --secret=${name} --project=steveapp-agency`, { encoding: 'utf-8' }).trim();

const ANTHROPIC_KEY = getSecret('ANTHROPIC_API_KEY');
const RESEND_KEY = getSecret('RESEND_API_KEY');
const TO_EMAIL = 'jmbarros@bgconsult.cl';

console.log(`Keys loaded. Sending to ${TO_EMAIL}...\n`);

// ============================================================
// Premium HTML email wrapper — Steve Ads branding
// ============================================================
const SIGNATURE = `
<table cellpadding="0" cellspacing="0" style="margin-top:32px; border-top: 1px solid #e5e7eb; padding-top:20px;">
  <tr>
    <td style="padding-right:16px; vertical-align:top;">
      <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:24px;text-align:center;line-height:48px;">🐕</div>
    </td>
    <td style="vertical-align:top;">
      <p style="margin:0;font-weight:700;font-size:15px;color:#111827;">Steve</p>
      <p style="margin:2px 0 0;font-size:13px;color:#6b7280;">CMO &bull; Steve Ads</p>
      <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;">Tu director de marketing AI &bull; <a href="https://steve.cl" style="color:#6366f1;text-decoration:none;">steve.cl</a></p>
    </td>
  </tr>
</table>`;

function wrapEmail(bodyHtml) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Header -->
        <tr><td style="padding:24px 32px 16px;text-align:left;">
          <span style="font-size:20px;font-weight:800;color:#111827;">Steve</span><span style="font-size:20px;color:#6366f1;font-weight:800;">Ads</span>
        </td></tr>
        <!-- Body Card -->
        <tr><td>
          <div style="background:#ffffff;border-radius:12px;padding:36px 32px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
            ${bodyHtml}
            ${SIGNATURE}
          </div>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">Steve Ads — Marketing AI que vende por ti</p>
          <p style="margin:4px 0 0;font-size:11px;color:#d1d5db;">Este email fue enviado porque conversamos por WhatsApp. Si no quieres más emails, responde "no más emails".</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const CTA_BUTTON = (text, href) => `
<table cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr><td style="background:linear-gradient(135deg,#6366f1,#7c3aed);border-radius:8px;padding:14px 28px;">
    <a href="${href}" style="color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">${text}</a>
  </td></tr>
</table>`;

async function callHaiku(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json();
  let text = data.content?.[0]?.text?.trim() || '';
  text = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(text);
}

async function sendEmail(subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Steve de Steve Ads <steve@steve.cl>',
      to: TO_EMAIL,
      subject,
      html: wrapEmail(html),
    }),
  });
  return res.json();
}

const DESIGN_INSTRUCTIONS = `
DISEÑO DEL CUERPO (respeta este formato exacto):
- NO incluyas wrapper, header ni footer — solo el contenido interno del email
- Usa <p> con style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;"
- Negritas: <strong style="color:#111827;">texto</strong>
- Bullets: <ul style="margin:12px 0 16px;padding-left:20px;"> con <li style="margin:0 0 8px;font-size:15px;color:#374151;">
- Para highlight/estadística importante usa: <div style="background:#f0f0ff;border-left:4px solid #6366f1;padding:16px 20px;border-radius:8px;margin:20px 0;"><p style="margin:0;font-size:15px;color:#374151;"><strong style="color:#6366f1;">dato</strong> — explicación</p></div>
- Para números o KPIs destacados usa: <span style="font-size:24px;font-weight:800;color:#6366f1;">número</span>
- NO incluyas firma — ya viene en el template
- NO uses <html>, <body>, <head>, <table> de wrapper
- NUNCA pongas "BG Consult" — la marca es "Steve Ads"
- Firma ya está incluida. NO la agregues.

Steve es el CMO de Steve Ads, una plataforma de marketing AI. NO es de BG Consult.
`;

// ============================================================
// EMAIL 1: Resumen conversación + insight
// ============================================================
console.log('--- Email 1/3: Resumen conversación ---');
const e1 = await callHaiku(`Genera el contenido HTML del cuerpo de un email de nurture para José Manuel de Arueda (www.arueda.cl) que vende productos deportivos/outdoor.

CONTEXTO: Es el primer email después de una conversación por WhatsApp donde:
- Tiene tienda online en Shopify (arueda.cl)
- Vende equipamiento deportivo y outdoor
- Factura aprox 5 millones mensuales
- Usa Meta Ads pero no ve bien los resultados
- Le interesa optimizar su marketing digital

OBJETIVO: Resumir lo conversado + darle un insight potente de su industria que lo haga pensar "este tipo sabe".

${DESIGN_INSTRUCTIONS}

Tono: Como un colega senior de marketing que te escribe después de una buena conversación. Natural, directo, con datos.
Largo: 150-200 palabras max.

Responde SOLO con JSON válido: {"subject":"asunto max 50 chars, personal, sin emojis genéricos","body":"html del cuerpo"}`);

console.log(`  Subject: ${e1.subject}`);
const r1 = await sendEmail(`[PRUEBA 1/3] ${e1.subject}`, e1.body);
console.log(`  Result:`, r1);

await new Promise(r => setTimeout(r, 2000));

// ============================================================
// EMAIL 2: Caso de éxito con números
// ============================================================
console.log('\n--- Email 2/3: Caso de éxito ---');
const e2 = await callHaiku(`Genera el contenido HTML del cuerpo de un email de nurture (paso 2 de 3) para José Manuel de Arueda (www.arueda.cl) que vende productos deportivos/outdoor.

OBJETIVO: Mostrarle un caso de éxito de una marca deportiva/outdoor que optimizó su marketing digital con IA. Tiene que sentir que se está perdiendo algo.

El caso: Una marca de equipamiento outdoor en Chile que estaba gastando en Meta Ads sin resultados claros (como él). Después de optimizar con Steve Ads:
- ROAS pasó de 1.8x a 4.2x en 60 días
- CPA bajó 38%
- Revenue creció 67% mes a mes
- Automatizaron el 80% de su operación de marketing

${DESIGN_INSTRUCTIONS}

Usa el highlight box para el dato más impactante.
Tono: Informativo con datos duros, no vendedor. Que los números hablen solos.
Largo: 180-250 palabras max.

Responde SOLO con JSON válido: {"subject":"asunto max 50 chars, con gancho","body":"html del cuerpo"}`);

console.log(`  Subject: ${e2.subject}`);
const r2 = await sendEmail(`[PRUEBA 2/3] ${e2.subject}`, e2.body);
console.log(`  Result:`, r2);

await new Promise(r => setTimeout(r, 2000));

// ============================================================
// EMAIL 3: "Preparé algo para tu marca" + CTA reunión
// ============================================================
console.log('\n--- Email 3/3: Preparé algo para tu marca ---');
const e3 = await callHaiku(`Genera el contenido HTML del cuerpo de un email de nurture FINAL (paso 3 de 3) para José Manuel de Arueda (www.arueda.cl) que vende productos deportivos/outdoor.

OBJETIVO: Que agende una llamada de 15 min. Dile que revisaste arueda.cl y encontraste oportunidades concretas. Hazlo sentir que ya trabajaste para él (gratis).

Menciona cosas específicas que "encontraste":
- Su estructura de campañas Meta podría segmentarse mejor por deporte (running vs trekking vs outdoor general)
- Hay oportunidad de retargeting dinámico con su catálogo Shopify
- El email marketing podría automatizarse para recuperar carritos abandonados

El CTA es agendar 15 min: https://meetings.hubspot.com/jose-manuel15

${DESIGN_INSTRUCTIONS}

IMPORTANTE: Después del texto principal, incluye este HTML exacto para el botón CTA:
<table cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background:linear-gradient(135deg,#6366f1,#7c3aed);border-radius:8px;padding:14px 28px;"><a href="https://meetings.hubspot.com/jose-manuel15" style="color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">Agendar 15 min</a></td></tr></table>

Tono: Personal, directo. Como si de verdad te sentaste a analizar su negocio. Urgencia suave ("esta semana" o "antes de que termine el mes").
Largo: 120-160 palabras max.

Responde SOLO con JSON válido: {"subject":"asunto max 50 chars, personal","body":"html del cuerpo"}`);

console.log(`  Subject: ${e3.subject}`);
const r3 = await sendEmail(`[PRUEBA 3/3] ${e3.subject}`, e3.body);
console.log(`  Result:`, r3);

console.log(`\n✅ Los 3 emails fueron enviados a ${TO_EMAIL}`);
