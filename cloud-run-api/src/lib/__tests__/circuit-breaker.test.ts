import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "../../../src/test/setup.js";

// Mock supabase before importing circuit-breaker
vi.mock("../../lib/supabase.js", () => ({
  getSupabaseAdmin: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        then: vi.fn((cb: any) => cb({ error: null })),
      }),
    }),
  }),
}));

import { canRequest, recordSuccess, recordFailure, getCircuitStatus } from "../circuit-breaker.js";

describe("circuit-breaker", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Reset circuits by calling recordSuccess to set state back to closed
    // Using a unique service name per test avoids cross-contamination
  });

  it("starts in CLOSED state for a new service", () => {
    const service = "test-service-new-" + Math.random();
    const status = getCircuitStatus(service);
    expect(status.state).toBe("closed");
    expect(status.failures).toBe(0);
  });

  it("allows requests when circuit is CLOSED", () => {
    const service = "test-service-closed-" + Math.random();
    expect(canRequest(service)).toBe(true);
  });

  it("stays CLOSED after fewer than 3 failures", () => {
    const service = "test-service-few-failures-" + Math.random();
    recordFailure(service, "error 1");
    recordFailure(service, "error 2");
    const status = getCircuitStatus(service);
    expect(status.state).toBe("closed");
    expect(status.failures).toBe(2);
    expect(canRequest(service)).toBe(true);
  });

  it("opens after 3 consecutive failures (FAILURE_THRESHOLD)", () => {
    const service = "test-service-opens-" + Math.random();
    recordFailure(service, "error 1");
    recordFailure(service, "error 2");
    recordFailure(service, "error 3");
    const status = getCircuitStatus(service);
    expect(status.state).toBe("open");
    expect(status.failures).toBe(3);
  });

  it("blocks requests when circuit is OPEN", () => {
    const service = "test-service-blocks-" + Math.random();
    recordFailure(service, "error 1");
    recordFailure(service, "error 2");
    recordFailure(service, "error 3");
    expect(canRequest(service)).toBe(false);
  });

  it("transitions to HALF_OPEN after recovery timeout expires", () => {
    const service = "test-service-halfopen-" + Math.random();
    recordFailure(service, "error 1");
    recordFailure(service, "error 2");
    recordFailure(service, "error 3");
    expect(getCircuitStatus(service).state).toBe("open");

    // Simulate time passing beyond the 60s recovery timeout
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 61_000);

    // canRequest should transition to half_open and allow
    expect(canRequest(service)).toBe(true);
    expect(getCircuitStatus(service).state).toBe("half_open");

    vi.restoreAllMocks();
  });

  it("resets to CLOSED on success in HALF_OPEN state", () => {
    const service = "test-service-reset-" + Math.random();
    recordFailure(service, "error 1");
    recordFailure(service, "error 2");
    recordFailure(service, "error 3");

    // Force to half_open by simulating time
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 61_000);
    canRequest(service); // transitions to half_open
    vi.restoreAllMocks();

    expect(getCircuitStatus(service).state).toBe("half_open");

    // Success resets to closed
    recordSuccess(service);
    expect(getCircuitStatus(service).state).toBe("closed");
    expect(getCircuitStatus(service).failures).toBe(0);
  });

  it("reverts to OPEN if test request fails in HALF_OPEN state", () => {
    const service = "test-service-revert-" + Math.random();
    recordFailure(service, "error 1");
    recordFailure(service, "error 2");
    recordFailure(service, "error 3");

    // Force to half_open
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 61_000);
    canRequest(service);
    vi.restoreAllMocks();

    expect(getCircuitStatus(service).state).toBe("half_open");

    // Failure in half_open goes back to open
    recordFailure(service, "still failing");
    expect(getCircuitStatus(service).state).toBe("open");
  });

  it("recordSuccess resets failures to 0", () => {
    const service = "test-service-success-reset-" + Math.random();
    recordFailure(service, "err");
    recordFailure(service, "err");
    expect(getCircuitStatus(service).failures).toBe(2);

    recordSuccess(service);
    expect(getCircuitStatus(service).failures).toBe(0);
    expect(getCircuitStatus(service).state).toBe("closed");
  });
});
