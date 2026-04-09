import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { sendWhatsApp } from '../../lib/twilio-client.js';
import { sendMetaCAPIEvent } from '../../lib/meta-capi.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

/**
 * Booking API — Public endpoints for meeting scheduling
 *
 * GET  /api/booking/slots/:sellerId — available time slots (next 5 business days)
 * POST /api/booking/confirm         — confirm a slot → creates Google Calendar event + Meet
 *
 * No JWT required — these are accessed by prospects from WhatsApp links.
 */

// ============================================================
// Helper: Refresh Google access token if expired
// ============================================================
async function getValidAccessToken(
  seller: {
    id: string;
    google_access_token_encrypted: string;
    google_refresh_token_encrypted: string | null;
    token_expires_at: string | null;
  },
): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  // Decrypt current access token
  const { data: accessToken } = await supabase
    .rpc('decrypt_platform_token', { encrypted_token: seller.google_access_token_encrypted });

  if (!accessToken) return null;

  // Check if token is still valid (with 5 min buffer)
  const expiresAt = seller.token_expires_at ? new Date(seller.token_expires_at) : null;
  if (expiresAt && expiresAt.getTime() > Date.now() + 5 * 60 * 1000) {
    return accessToken;
  }

  // Token expired — refresh it
  if (!seller.google_refresh_token_encrypted) return null;

  const { data: refreshToken } = await supabase
    .rpc('decrypt_platform_token', { encrypted_token: seller.google_refresh_token_encrypted });

  if (!refreshToken) return null;

  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || process.env.GOOGLE_ADS_CLIENT_SECRET;

  if (!googleClientId || !googleClientSecret) return null;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: googleClientId,
      client_secret: googleClientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const data = await res.json() as any;
  if (data.error || !data.access_token) {
    console.error('[booking-api] Token refresh failed:', data.error);
    return null;
  }

  // Save new encrypted access token
  const { data: newEncrypted } = await supabase
    .rpc('encrypt_platform_token', { raw_token: data.access_token });

  if (newEncrypted) {
    await supabase
      .from('seller_calendars')
      .update({
        google_access_token_encrypted: newEncrypted,
        token_expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', seller.id);
  }

  return data.access_token;
}

// ============================================================
// GET /api/booking/slots/:sellerId
// ============================================================
export async function bookingSlots(c: Context) {
  const sellerId = c.req.param('sellerId');
  if (!sellerId) return c.json({ error: 'Missing sellerId' }, 400);

  const supabase = getSupabaseAdmin();

  // Load seller config
  const seller = await safeQuerySingleOrDefault<any>(
    supabase
      .from('seller_calendars')
      .select('*')
      .eq('id', sellerId)
      .eq('is_active', true)
      .maybeSingle(),
    null,
    'bookingApi.getSellerForSlots',
  );

  if (!seller) return c.json({ error: 'Seller not found or inactive' }, 404);

  const accessToken = await getValidAccessToken(seller);
  if (!accessToken) {
    return c.json({ error: 'Calendar not connected or token expired' }, 503);
  }

  // Generate candidate slots for next 5 business days
  const slotDuration = seller.slot_duration_minutes || 15;
  const buffer = seller.buffer_minutes || 5;
  const workStart = seller.working_hours_start || 9;
  const workEnd = seller.working_hours_end || 18;
  const workDays = seller.working_days || [1, 2, 3, 4, 5];

  // Helper: convert a Chile local datetime to proper UTC
  // (server runs in UTC — setHours would set UTC hours, not Chile hours)
  const chileLocalToUTC = (y: number, mo: number, d: number, h: number, min: number): Date => {
    const approx = new Date(Date.UTC(y, mo - 1, d, h, min, 0));
    const chileDisp = new Date(approx.toLocaleString('en-US', { timeZone: 'America/Santiago' }));
    const offsetMs = approx.getTime() - chileDisp.getTime();
    return new Date(approx.getTime() + offsetMs);
  };

  // Get today in Chile time
  const nowUTC = new Date();
  const chileToday = new Date(nowUTC.toLocaleString('en-US', { timeZone: 'America/Santiago' }));

  const candidateSlots: { start: Date; end: Date }[] = [];
  let daysChecked = 0;
  let dayOffset = 1; // Start tomorrow

  while (daysChecked < 5 && dayOffset < 14) {
    // Target day in Chile time
    const targetUTC = new Date(Date.UTC(chileToday.getFullYear(), chileToday.getMonth(), chileToday.getDate() + dayOffset));
    const targetChile = new Date(targetUTC.toLocaleString('en-US', { timeZone: 'America/Santiago' }));
    const dayOfWeek = targetChile.getDay() === 0 ? 7 : targetChile.getDay(); // 1=Mon, 7=Sun

    if (workDays.includes(dayOfWeek)) {
      const ty = targetChile.getFullYear();
      const tm = targetChile.getMonth() + 1;
      const td = targetChile.getDate();

      for (let hour = workStart; hour < workEnd; hour++) {
        for (let min = 0; min < 60; min += slotDuration + buffer) {
          const slotStart = chileLocalToUTC(ty, tm, td, hour, min);
          const slotEnd = new Date(slotStart.getTime() + slotDuration * 60 * 1000);
          // Verify end doesn't exceed workEnd in Chile
          const endChile = new Date(slotEnd.toLocaleString('en-US', { timeZone: 'America/Santiago' }));
          if (endChile.getHours() > workEnd || (endChile.getHours() === workEnd && endChile.getMinutes() > 0)) break;
          candidateSlots.push({ start: slotStart, end: slotEnd });
        }
      }
      daysChecked++;
    }
    dayOffset++;
  }

  if (candidateSlots.length === 0) {
    return c.json({ seller_name: seller.seller_name, slots: [] });
  }

  // Slots are already in proper UTC — use directly for Google Calendar API
  const timeMin = candidateSlots[0].start;
  const timeMax = candidateSlots[candidateSlots.length - 1].end;

  try {
    const freeBusyRes = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        timeZone: 'America/Santiago',
        items: [{ id: seller.google_calendar_id || 'primary' }],
      }),
    });

    if (!freeBusyRes.ok) {
      const errData = await freeBusyRes.json() as any;
      console.error('[booking-api] FreeBusy error:', errData);
      return c.json({ error: 'Failed to check calendar availability' }, 503);
    }

    const freeBusyData = await freeBusyRes.json() as any;
    const calendarId = seller.google_calendar_id || 'primary';
    const busySlots: Array<{ start: string; end: string }> = freeBusyData.calendars?.[calendarId]?.busy || [];

    // Filter out busy slots (slots are already UTC)
    const availableSlots = candidateSlots.filter(candidate => {
      const candidateStartUTC = candidate.start.getTime();
      const candidateEndUTC = candidate.end.getTime();

      return !busySlots.some(busy => {
        const busyStart = new Date(busy.start).getTime();
        const busyEnd = new Date(busy.end).getTime();
        return candidateStartUTC < busyEnd && candidateEndUTC > busyStart;
      });
    });

    // Format for response
    const formattedSlots = availableSlots.map(s => ({
      start: s.start.toISOString(),
      end: s.end.toISOString(),
      label: s.start.toLocaleString('es-CL', {
        timeZone: 'America/Santiago',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
    }));

    return c.json({
      seller_name: seller.seller_name,
      slot_duration: slotDuration,
      slots: formattedSlots,
    });

  } catch (err: any) {
    console.error('[booking-api] Slots error:', err);
    return c.json({ error: 'Failed to load slots' }, 500);
  }
}

// ============================================================
// POST /api/booking/confirm
// ============================================================
export async function bookingConfirm(c: Context) {
  const { seller_id, slot_start, prospect_name, prospect_phone, prospect_id, website, monthly_budget } = await c.req.json() as {
    seller_id: string;
    slot_start: string;
    prospect_name: string;
    prospect_phone?: string;
    prospect_id?: string;
    website?: string;
    monthly_budget?: string;
  };

  if (!seller_id || !slot_start || !prospect_name) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  // Bug #42 fix: validate slot_start is a valid date and in the future
  const startDate = new Date(slot_start);
  if (isNaN(startDate.getTime())) {
    return c.json({ error: 'Invalid slot_start date' }, 400);
  }
  if (startDate.getTime() <= Date.now()) {
    return c.json({ error: 'slot_start must be in the future' }, 400);
  }

  const supabase = getSupabaseAdmin();

  // Load seller
  const seller = await safeQuerySingleOrDefault<any>(
    supabase
      .from('seller_calendars')
      .select('*')
      .eq('id', seller_id)
      .eq('is_active', true)
      .maybeSingle(),
    null,
    'bookingApi.getSellerForConfirm',
  );

  if (!seller) return c.json({ error: 'Seller not found' }, 404);

  const accessToken = await getValidAccessToken(seller);
  if (!accessToken) return c.json({ error: 'Calendar token expired' }, 503);

  const slotDuration = seller.slot_duration_minutes || 15;
  const startTime = new Date(slot_start);
  const endTime = new Date(startTime.getTime() + slotDuration * 60 * 1000);

  // Double-check the slot is still free
  try {
    const freeBusyRes = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin: startTime.toISOString(),
        timeMax: endTime.toISOString(),
        timeZone: 'America/Santiago',
        items: [{ id: seller.google_calendar_id || 'primary' }],
      }),
    });

    const fbData = await freeBusyRes.json() as any;
    const calId = seller.google_calendar_id || 'primary';
    const busy = fbData.calendars?.[calId]?.busy || [];
    if (busy.length > 0) {
      return c.json({ error: 'Este horario ya no está disponible. Por favor elige otro.' }, 409);
    }
  } catch {}

  // Create Google Calendar event with Google Meet
  const calendarId = seller.google_calendar_id || 'primary';
  const eventBody = {
    summary: `Llamada Steve Ads — ${prospect_name}`,
    description: `Reunión agendada por ${prospect_name}${prospect_phone ? ` (${prospect_phone})` : ''} vía Steve Ads.${website ? `\n🌐 Web: ${website}` : ''}${monthly_budget ? `\n💰 Inversión: ${monthly_budget} CLP/mes` : ''}\n\nAgendado automáticamente.`,
    start: {
      dateTime: startTime.toISOString(),
      timeZone: 'America/Santiago',
    },
    end: {
      dateTime: endTime.toISOString(),
      timeZone: 'America/Santiago',
    },
    attendees: seller.seller_email ? [{ email: seller.seller_email }] : [],
    conferenceData: {
      createRequest: {
        requestId: `steve-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 120 },
        { method: 'popup', minutes: 15 },
      ],
    },
  };

  try {
    const eventRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventBody),
      },
    );

    if (!eventRes.ok) {
      const errData = await eventRes.json() as any;
      console.error('[booking-api] Event creation error:', errData);
      return c.json({ error: 'Failed to create calendar event' }, 500);
    }

    const event = await eventRes.json() as any;
    const meetLink = event.conferenceData?.entryPoints?.find(
      (e: any) => e.entryPointType === 'video',
    )?.uri || event.hangoutLink || null;

    const meetingTimeStr = startTime.toLocaleString('es-CL', {
      timeZone: 'America/Santiago',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });

    // Update wa_prospects if we have prospect_id or prospect_phone
    if (prospect_id || prospect_phone) {
      const updateData: Record<string, any> = {
        meeting_at: startTime.toISOString(),
        meeting_url: meetLink || event.htmlLink,
        meeting_status: 'scheduled',
        reminder_24h_sent: false,
        reminder_2h_sent: false,
        assigned_seller_id: seller_id,
        updated_at: new Date().toISOString(),
      };

      // Save website and budget from booking form
      if (website) updateData.website_url = website;
      if (monthly_budget) updateData.budget_range = monthly_budget;

      const query = prospect_id
        ? supabase.from('wa_prospects').update(updateData).eq('id', prospect_id)
        : supabase.from('wa_prospects').update(updateData).eq('phone', prospect_phone!.replace(/\+/g, ''));

      await query;
    }

    // Send WA confirmation to prospect
    if (prospect_phone) {
      const phone = prospect_phone.startsWith('+') ? prospect_phone : `+${prospect_phone}`;
      const confirmMsg = `Listo ${prospect_name}! Reunión confirmada 🐕\n\n📅 ${meetingTimeStr}\n📹 Google Meet: ${meetLink || 'Te llego la invitación al calendario'}\n\nTe mando recordatorio antes. ¡Nos vemos!`;
      await sendWhatsApp(phone, confirmMsg).catch(err => {
        console.error('[booking-api] WA confirmation error:', err);
      });

      // Save outbound message
      const steveNumber = process.env.STEVE_WA_NUMBER || process.env.TWILIO_PHONE_NUMBER || '';
      await supabase.from('wa_messages').insert({
        client_id: null,
        channel: 'prospect',
        direction: 'outbound',
        from_number: steveNumber,
        to_number: prospect_phone.replace(/\+/g, ''),
        body: confirmMsg,
        contact_name: prospect_name,
        contact_phone: prospect_phone.replace(/\+/g, ''),
      }).then(() => {}, () => {});
    }

    // Notify seller via WA
    const adminPhone = process.env.ADMIN_NOTIFY_PHONE;
    if (adminPhone) {
      const adminMsg = `🐕 Nueva reunión agendada!\n\nProspecto: ${prospect_name}\nTeléfono: ${prospect_phone || 'N/A'}\n\n📅 ${meetingTimeStr}\n📹 ${meetLink || event.htmlLink}`;
      await sendWhatsApp(
        adminPhone.startsWith('+') ? adminPhone : `+${adminPhone}`,
        adminMsg,
      ).catch(() => {});
    }

    console.log(`[booking-api] Meeting booked: ${prospect_name} at ${meetingTimeStr} | Meet: ${meetLink}`);

    // Fire Meta CAPI Schedule event (fire & forget)
    sendMetaCAPIEvent({
      eventName: 'Schedule',
      eventId: `schedule-${seller_id}-${startTime.getTime()}`,
      userData: {
        phone: prospect_phone,
        name: prospect_name,
        country: 'cl',
      },
      customData: { content_name: 'Consultoría Steve Ads' },
    }).catch(() => {});

    return c.json({
      success: true,
      meeting: {
        date: meetingTimeStr,
        meet_link: meetLink,
        calendar_link: event.htmlLink,
        event_id: event.id,
      },
    });

  } catch (err: any) {
    console.error('[booking-api] Confirm error:', err);
    return c.json({ error: 'Failed to book meeting' }, 500);
  }
}
