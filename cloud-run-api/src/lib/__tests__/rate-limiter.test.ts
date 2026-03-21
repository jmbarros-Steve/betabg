import { describe, it, expect, vi, afterEach } from "vitest";
import "../../../src/test/setup.js";
import { checkRateLimit } from "../rate-limiter.js";

describe("checkRateLimit", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows the first request", () => {
    const clientId = "client-" + Math.random();
    const result = checkRateLimit(clientId, "endpoint-a", 10);
    expect(result.allowed).toBe(true);
    expect(result.retryAfter).toBe(0);
  });

  it("allows up to maxPerMinute requests", () => {
    const clientId = "client-max-" + Math.random();
    const maxPerMinute = 5;

    for (let i = 0; i < maxPerMinute; i++) {
      const result = checkRateLimit(clientId, "endpoint-b", maxPerMinute);
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks request N+1 beyond maxPerMinute", () => {
    const clientId = "client-block-" + Math.random();
    const maxPerMinute = 3;

    for (let i = 0; i < maxPerMinute; i++) {
      checkRateLimit(clientId, "endpoint-c", maxPerMinute);
    }

    const blocked = checkRateLimit(clientId, "endpoint-c", maxPerMinute);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("different keys (client+endpoint combos) have separate buckets", () => {
    const clientA = "client-a-" + Math.random();
    const clientB = "client-b-" + Math.random();
    const maxPerMinute = 2;

    // Fill up client A
    checkRateLimit(clientA, "endpoint-d", maxPerMinute);
    checkRateLimit(clientA, "endpoint-d", maxPerMinute);
    const blockedA = checkRateLimit(clientA, "endpoint-d", maxPerMinute);
    expect(blockedA.allowed).toBe(false);

    // Client B is unaffected
    const resultB = checkRateLimit(clientB, "endpoint-d", maxPerMinute);
    expect(resultB.allowed).toBe(true);
  });

  it("same client with different endpoints have separate buckets", () => {
    const clientId = "client-ep-" + Math.random();
    const maxPerMinute = 2;

    // Fill up endpoint-x
    checkRateLimit(clientId, "endpoint-x", maxPerMinute);
    checkRateLimit(clientId, "endpoint-x", maxPerMinute);
    const blockedX = checkRateLimit(clientId, "endpoint-x", maxPerMinute);
    expect(blockedX.allowed).toBe(false);

    // endpoint-y is independent
    const resultY = checkRateLimit(clientId, "endpoint-y", maxPerMinute);
    expect(resultY.allowed).toBe(true);
  });

  it("allows requests again after the sliding window expires", () => {
    const clientId = "client-expire-" + Math.random();
    const maxPerMinute = 2;

    // Use all slots
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);

    checkRateLimit(clientId, "endpoint-e", maxPerMinute);
    checkRateLimit(clientId, "endpoint-e", maxPerMinute);
    const blocked = checkRateLimit(clientId, "endpoint-e", maxPerMinute);
    expect(blocked.allowed).toBe(false);

    // Advance time past the 60s window
    vi.spyOn(Date, "now").mockReturnValue(now + 61_000);

    const afterWindow = checkRateLimit(clientId, "endpoint-e", maxPerMinute);
    expect(afterWindow.allowed).toBe(true);
  });

  it("uses default maxPerMinute of 10 when not specified", () => {
    const clientId = "client-default-" + Math.random();

    // Should allow 10 requests
    for (let i = 0; i < 10; i++) {
      const result = checkRateLimit(clientId, "endpoint-f");
      expect(result.allowed).toBe(true);
    }

    // 11th should be blocked
    const blocked = checkRateLimit(clientId, "endpoint-f");
    expect(blocked.allowed).toBe(false);
  });
});
