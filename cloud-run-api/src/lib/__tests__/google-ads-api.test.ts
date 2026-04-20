import { describe, it, expect } from 'vitest';
import { parseRetryAfterSeconds, formatRetryAfter, hashBody } from '../google-ads-api.js';

describe('parseRetryAfterSeconds', () => {
  it('parses typical Google Ads retry message', () => {
    const err = 'Too many requests. Retry in 61502 seconds. (unknown)';
    expect(parseRetryAfterSeconds(err)).toBe(61502);
  });

  it('parses case-insensitive', () => {
    expect(parseRetryAfterSeconds('retry in 30 seconds')).toBe(30);
    expect(parseRetryAfterSeconds('RETRY IN 60 seconds')).toBe(60);
  });

  it('returns null when no retry info present', () => {
    expect(parseRetryAfterSeconds('Some other error')).toBeNull();
    expect(parseRetryAfterSeconds('')).toBeNull();
  });

  it('ignores non-numeric retry messages', () => {
    expect(parseRetryAfterSeconds('Retry in X seconds')).toBeNull();
  });
});

describe('formatRetryAfter', () => {
  it('formats sub-minute as seconds', () => {
    expect(formatRetryAfter(30)).toBe('30s');
    expect(formatRetryAfter(59)).toBe('59s');
  });

  it('formats minutes without hours', () => {
    expect(formatRetryAfter(60)).toBe('1m');
    expect(formatRetryAfter(300)).toBe('5m');
    expect(formatRetryAfter(3540)).toBe('59m');
  });

  it('formats hours + minutes for long waits', () => {
    expect(formatRetryAfter(3600)).toBe('1h 0m');
    expect(formatRetryAfter(61502)).toBe('17h 5m');
    expect(formatRetryAfter(86400)).toBe('24h 0m');
  });
});

describe('hashBody', () => {
  it('produces same hash for same inputs', () => {
    const ops = [{ campaignOperation: { create: { name: 'Test' } } }];
    const h1 = hashBody('123', ops);
    const h2 = hashBody('123', ops);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^m:-?\d+$/);
  });

  it('produces different hash for different customerId', () => {
    const ops = [{ campaignOperation: { create: { name: 'Test' } } }];
    expect(hashBody('123', ops)).not.toBe(hashBody('456', ops));
  });

  it('produces different hash for different operations', () => {
    expect(hashBody('123', [{ a: 1 }])).not.toBe(hashBody('123', [{ a: 2 }]));
  });

  it('handles empty operations', () => {
    expect(hashBody('123', [])).toMatch(/^m:-?\d+$/);
  });

  it('survives circular refs via fallback', () => {
    const circular: any = { a: 1 };
    circular.self = circular;
    // No throw; returns fallback with timestamp
    const h = hashBody('123', [circular]);
    expect(h).toMatch(/^m:/);
  });
});
