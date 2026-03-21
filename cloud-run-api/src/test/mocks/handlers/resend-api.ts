/**
 * MSW handlers for the Resend API.
 * Matches the response shapes expected by:
 *   - src/routes/email/send-email.ts (Resend SDK calls POST /emails)
 *   - src/routes/email/verify-domain.ts
 */
import { http, HttpResponse } from 'msw';

const RESEND_BASE = 'https://api.resend.com';

export const resendHandlers = [
  // ── Send email ──
  http.post(`${RESEND_BASE}/emails`, async ({ request }) => {
    const body: any = await request.json();

    // Validate required fields
    if (!body.from || !body.to || !body.subject) {
      return HttpResponse.json(
        {
          statusCode: 422,
          message: 'Missing required fields',
          name: 'validation_error',
        },
        { status: 422 },
      );
    }

    // Simulate invalid "from" domain
    if (typeof body.from === 'string' && body.from.includes('@unverified.com')) {
      return HttpResponse.json(
        {
          statusCode: 403,
          message: 'The from address is not verified. Please verify your domain.',
          name: 'validation_error',
        },
        { status: 403 },
      );
    }

    return HttpResponse.json({
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    });
  }),

  // ── Get email status ──
  http.get(`${RESEND_BASE}/emails/:emailId`, ({ params }) => {
    return HttpResponse.json({
      object: 'email',
      id: params.emailId,
      to: ['test@example.cl'],
      from: 'Steve <noreply@steve.cl>',
      subject: 'Test Email',
      html: '<p>Hello</p>',
      text: null,
      created_at: '2026-03-19T10:00:00.000Z',
      last_event: 'delivered',
    });
  }),

  // ── Domains ──
  http.get(`${RESEND_BASE}/domains`, () => {
    return HttpResponse.json({
      data: [
        {
          id: 'dom_001',
          name: 'steve.cl',
          status: 'verified',
          region: 'us-east-1',
          created_at: '2026-01-15T10:00:00.000Z',
          records: [
            { record: 'MX', name: 'steve.cl', value: 'feedback-smtp.us-east-1.amazonses.com', type: 'MX', priority: 10, status: 'verified' },
            { record: 'SPF', name: 'steve.cl', type: 'TXT', value: 'v=spf1 include:amazonses.com ~all', status: 'verified' },
          ],
        },
      ],
    });
  }),

  // ── Batch send ──
  http.post(`${RESEND_BASE}/emails/batch`, async ({ request }) => {
    const body: any = await request.json();
    const results = (body || []).map((_: any, i: number) => ({
      id: `msg_batch_${i + 1}_${Date.now()}`,
    }));
    return HttpResponse.json({ data: results });
  }),

  // ── Error: Rate limit ──
  http.post(`${RESEND_BASE}/rate-limited-emails`, () => {
    return HttpResponse.json(
      {
        statusCode: 429,
        message: 'Rate limit exceeded',
        name: 'rate_limit_exceeded',
      },
      { status: 429 },
    );
  }),
];
