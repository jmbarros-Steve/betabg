import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

/**
 * Google Calendar OAuth Callback
 *
 * Seller (sales team member) authorizes Google Calendar access.
 * Tokens are encrypted and stored in seller_calendars.
 * Scopes needed: calendar.events, calendar.freebusy
 */
export async function googleCalendarOauthCallback(c: Context) {
  try {
    const supabase = getSupabaseAdmin();

    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { code, redirect_uri, seller_name } = await c.req.json() as {
      code: string;
      redirect_uri: string;
      seller_name?: string;
    };

    if (!code || !redirect_uri) {
      return c.json({ error: 'Missing code or redirect_uri' }, 400);
    }

    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || process.env.GOOGLE_ADS_CLIENT_SECRET;
    if (!clientSecret) {
      console.error('[gcal-oauth] No GOOGLE_CALENDAR_CLIENT_SECRET configured');
      return c.json({ error: 'OAuth not configured' }, 500);
    }
    const googleClientSecret = clientSecret;

    if (!googleClientId) {
      console.error('[gcal-oauth] No GOOGLE_CLIENT_ID configured');
      return c.json({ error: 'OAuth not configured' }, 500);
    }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: googleClientId,
        client_secret: googleClientSecret,
        redirect_uri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json() as any;

    if (tokenData.error) {
      console.error('[google-calendar-oauth] Token error:', tokenData.error);
      return c.json({ error: tokenData.error_description || 'Failed to get access token' }, 400);
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in || 3600;
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Get user's email from Google
    let email = '';
    try {
      const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const profile = await profileRes.json() as any;
      email = profile.email || '';
    } catch {}

    // Verify calendar access works
    try {
      const calRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!calRes.ok) {
        const calErr = await calRes.json() as any;
        return c.json({ error: `Calendar access failed: ${calErr.error?.message || calRes.status}` }, 400);
      }
    } catch (err: any) {
      return c.json({ error: `Calendar verification failed: ${err.message}` }, 400);
    }

    // Encrypt tokens
    const { data: encryptedAccess, error: encAccErr } = await supabase
      .rpc('encrypt_platform_token', { raw_token: accessToken });
    if (encAccErr) {
      console.error('[google-calendar-oauth] Encrypt access error:', encAccErr);
      return c.json({ error: 'Failed to secure access token' }, 500);
    }

    let encryptedRefresh = null;
    if (refreshToken) {
      const { data, error } = await supabase
        .rpc('encrypt_platform_token', { raw_token: refreshToken });
      if (!error) encryptedRefresh = data;
    }

    // Upsert seller_calendars
    const existing = await safeQuerySingleOrDefault<any>(
      supabase
        .from('seller_calendars')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle(),
      null,
      'googleCalendarOauthCallback.getExistingCalendar',
    );

    const calendarData = {
      user_id: user.id,
      seller_name: seller_name || email || 'Vendedor',
      seller_email: email,
      google_access_token_encrypted: encryptedAccess,
      google_refresh_token_encrypted: encryptedRefresh,
      token_expires_at: tokenExpiresAt,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    let sellerId: string;
    if (existing) {
      const { error } = await supabase
        .from('seller_calendars')
        .update(calendarData)
        .eq('id', existing.id);
      if (error) return c.json({ error: 'Failed to update calendar' }, 500);
      sellerId = existing.id;
    } else {
      const { data: inserted, error } = await supabase
        .from('seller_calendars')
        .insert(calendarData)
        .select('id')
        .single();
      if (error || !inserted) return c.json({ error: 'Failed to create calendar' }, 500);
      sellerId = inserted.id;
    }

    console.log(`[google-calendar-oauth] Calendar connected for ${email} (seller: ${sellerId})`);

    return c.json({
      success: true,
      seller_id: sellerId,
      email,
      booking_url: `/agendar/${sellerId}`,
    });
  } catch (err: any) {
    console.error('[google-calendar-oauth] Error:', err);
    return c.json({ error: err.message || 'Internal error' }, 500);
  }
}
