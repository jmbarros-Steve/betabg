/**
 * Contract tests for Resend API.
 *
 * These tests verify that our MSW mocks return the exact shapes
 * our application code expects. Verified against:
 *   - src/routes/email/send-email.ts (Resend SDK: emails.send)
 *   - src/routes/email/verify-domain.ts
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { server } from '../mocks/server.js';

const RESEND_BASE = 'https://api.resend.com';
const RESEND_HEADERS = {
  'Content-Type': 'application/json',
  Authorization: 'Bearer re_test_1234567890',
};

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Resend API Contract: Send Email', () => {
  it('returns { id } on successful send', async () => {
    const res = await fetch(`${RESEND_BASE}/emails`, {
      method: 'POST',
      headers: RESEND_HEADERS,
      body: JSON.stringify({
        from: 'Steve <noreply@steve.cl>',
        to: ['test@example.cl'],
        subject: 'Test Email',
        html: '<p>Hello World</p>',
      }),
    });
    expect(res.ok).toBe(true);

    const body = await res.json();
    // Our code: const messageId = result?.id
    expect(body).toHaveProperty('id');
    expect(typeof body.id).toBe('string');
    expect(body.id.startsWith('msg_')).toBe(true);
  });

  it('returns 422 when required fields are missing', async () => {
    const res = await fetch(`${RESEND_BASE}/emails`, {
      method: 'POST',
      headers: RESEND_HEADERS,
      body: JSON.stringify({
        // Missing from, to, subject
        html: '<p>Hello</p>',
      }),
    });
    expect(res.status).toBe(422);

    const body = await res.json();
    expect(body).toHaveProperty('message');
    expect(body).toHaveProperty('name');
  });

  it('returns 403 for unverified domain', async () => {
    const res = await fetch(`${RESEND_BASE}/emails`, {
      method: 'POST',
      headers: RESEND_HEADERS,
      body: JSON.stringify({
        from: 'test@unverified.com',
        to: ['test@example.cl'],
        subject: 'Test',
        html: '<p>Hi</p>',
      }),
    });
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.message).toContain('not verified');
  });
});

describe('Resend API Contract: Domains', () => {
  it('returns domains list with status and DNS records', async () => {
    const res = await fetch(`${RESEND_BASE}/domains`, {
      headers: RESEND_HEADERS,
    });
    expect(res.ok).toBe(true);

    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);

    const domain = body.data[0];
    expect(domain).toHaveProperty('id');
    expect(domain).toHaveProperty('name');
    expect(domain).toHaveProperty('status');
    expect(domain).toHaveProperty('records');
    expect(domain.status).toBe('verified');
  });
});

describe('Resend API Contract: Email Status', () => {
  it('returns email details including last_event', async () => {
    const res = await fetch(`${RESEND_BASE}/emails/msg_test_001`, {
      headers: RESEND_HEADERS,
    });
    expect(res.ok).toBe(true);

    const body = await res.json();
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('to');
    expect(body).toHaveProperty('from');
    expect(body).toHaveProperty('subject');
    expect(body).toHaveProperty('last_event');
    expect(body).toHaveProperty('created_at');

    expect(Array.isArray(body.to)).toBe(true);
    expect(['delivered', 'sent', 'opened', 'clicked', 'bounced', 'complained']).toContain(body.last_event);
  });
});
