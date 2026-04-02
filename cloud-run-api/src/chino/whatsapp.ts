// El Chino — WhatsApp notifications
// Uses existing Twilio integration from lib/twilio-client.ts

import { getSupabaseAdmin } from '../lib/supabase.js';
import { sendWhatsApp, sendWhatsAppMedia } from '../lib/twilio-client.js';

// JM's phone — env var or hardcoded fallback
function getJMPhone(): string {
  return process.env.JOSE_WHATSAPP_NUMBER || process.env.JM_PHONE || '';
}

// ─── Send text to JM ────────────────────────────────────────────

async function sendToJM(message: string): Promise<void> {
  const phone = getJMPhone();
  if (!phone) {
    console.error('[chino/wa] JOSE_WHATSAPP_NUMBER not configured, skipping WhatsApp');
    return;
  }
  try {
    await sendWhatsApp(phone, message);
    console.log('[chino/wa] Message sent to JM');
  } catch (err: any) {
    console.error('[chino/wa] Failed to send WhatsApp:', err.message);
  }
}

// ─── Send image to JM ───────────────────────────────────────────

async function sendImageToJM(imageUrl: string, caption: string): Promise<void> {
  const phone = getJMPhone();
  if (!phone) return;
  try {
    await sendWhatsAppMedia(phone, caption, imageUrl);
  } catch (err: any) {
    console.error('[chino/wa] Failed to send image:', err.message);
  }
}

// ─── Periodic report (every 6 hours) ────────────────────────────

export async function sendPeriodicReport(): Promise<void> {
  const supabase = getSupabaseAdmin();
  const sixHoursAgo = new Date(Date.now() - 6 * 3600_000).toISOString();

  // Get report stats
  const { data: reports } = await supabase
    .from('chino_reports')
    .select('result')
    .gte('created_at', sixHoursAgo);

  const total = reports?.length || 0;
  const passed = reports?.filter((r) => r.result === 'pass').length || 0;
  const failed = reports?.filter((r) => r.result === 'fail').length || 0;
  const errCount = reports?.filter((r) => r.result === 'error').length || 0;

  // Get recent fixes
  const { data: fixes } = await supabase
    .from('steve_fix_queue')
    .select('check_number, status, probable_cause')
    .gte('created_at', sixHoursAgo);

  const autoFixed = fixes?.filter((f) => f.status === 'fixed') || [];
  const escalated = fixes?.filter((f) => f.status === 'escalated') || [];
  const pending = fixes?.filter((f) => ['pending', 'assigned', 'fixing'].includes(f.status)) || [];

  const time = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });

  let message: string;

  if (failed === 0 && errCount === 0) {
    message = `✅ *EL CHINO — Reporte ${time}*
${total} checks ejecutados
Todos pasaron ✅

Próxima revisión en 6 horas.`;
  } else {
    message = `⚠️ *EL CHINO — Reporte ${time}*
${total} checks ejecutados
${passed} pasaron ✅ | ${failed} fallaron ❌ | ${errCount} errores ⚠️`;

    if (autoFixed.length > 0) {
      message += '\n\n*Arreglados automáticamente:*';
      for (const fix of autoFixed.slice(0, 5)) {
        message += `\n• Check #${fix.check_number}: ${(fix.probable_cause || '').substring(0, 80)}`;
      }
      if (autoFixed.length > 5) message += `\n• ...y ${autoFixed.length - 5} más`;
    }

    if (escalated.length > 0) {
      message += '\n\n*Necesitan tu atención:*';
      for (const fix of escalated.slice(0, 5)) {
        message += `\n• Check #${fix.check_number}: ${(fix.probable_cause || '').substring(0, 80)}`;
      }
    }

    if (pending.length > 0) {
      message += `\n\n*En proceso:* ${pending.length} fix(es) en cola`;
    }
  }

  await sendToJM(message);
}

// ─── Escalation alert (after 2 failed fix attempts) ─────────────

export async function sendEscalationWhatsApp(fix: any): Promise<void> {
  const checkDesc = fix.chino_routine?.description || fix.probable_cause || 'Check desconocido';
  const steveVal = fix.check_result?.steve_value || 'N/A';
  const realVal = fix.check_result?.real_value || 'N/A';
  const errMsg = fix.check_result?.error_message || 'N/A';

  const message = `🔴 *EL CHINO — ESCALACIÓN*

Check #${fix.check_number} falló 2 veces.

*Qué pasó:*
${checkDesc}

*Steve dice:* ${steveVal}
*Real:* ${realVal}
*Error:* ${errMsg}

*Intento 1:* Se intentó fix automático
*Intento 2:* Approach diferente

Ambos fallaron. Necesito que lo mires tú, jefe.`;

  await sendToJM(message);

  // Send screenshot if available
  if (fix.check_result?.screenshot_url) {
    await sendImageToJM(fix.check_result.screenshot_url, 'Screenshot del error');
  }
}

// ─── Critical alert (immediate, during patrol) ──────────────────

export async function sendCriticalAlert(criticalFails: Array<{
  check_number: number;
  description: string;
  error_message?: string;
}>): Promise<void> {
  const message = `🔴 *EL CHINO — ALERTA INMEDIATA*

${criticalFails.length} check(s) CRÍTICOS fallaron:

${criticalFails.map((f) => `• #${f.check_number}: ${f.error_message || f.description}`).join('\n')}

Generando fixes automáticos...`;

  await sendToJM(message);
}
