import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callApi } from "../api";

// Mock supabase
const mockGetSession = vi.fn();
const mockRefreshSession = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      refreshSession: () => mockRefreshSession(),
    },
  },
}));

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({
    data: {
      session: {
        access_token: "test-token",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      },
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("callApi", () => {
  it("makes a successful POST request", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ result: "ok" }),
    });

    const result = await callApi("test-endpoint", { body: { key: "value" } });

    expect(result.data).toEqual({ result: "ok" });
    expect(result.error).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/test-endpoint");
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe("Bearer test-token");
  });

  it("includes body as JSON", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await callApi("endpoint", { body: { foo: "bar" } });

    const [, options] = mockFetch.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ foo: "bar" });
  });

  it("retries on 401 with refreshed token", async () => {
    // First call: 401
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: "Unauthorized" }),
    });
    // Retry after refresh: 200
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ retried: true }),
    });

    mockRefreshSession.mockResolvedValueOnce({
      data: { session: { access_token: "new-token" } },
    });

    const result = await callApi("protected-endpoint");

    expect(result.data).toEqual({ retried: true });
    expect(result.error).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
  });

  it("returns error for non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "Internal Error" }),
    });

    // No session to trigger 401 retry
    mockGetSession.mockResolvedValueOnce({
      data: { session: null },
    });

    const result = await callApi("failing-endpoint");

    expect(result.data).toBeNull();
    expect(result.error).toBe("Internal Error");
  });

  it("handles abort timeout", async () => {
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          const err = new Error("Aborted");
          err.name = "AbortError";
          reject(err);
        }),
    );

    const result = await callApi("slow-endpoint");

    expect(result.data).toBeNull();
    expect(result.error).toContain("tardó demasiado");
  });

  it("handles network errors", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network failure"));

    const result = await callApi("offline-endpoint");

    expect(result.data).toBeNull();
    expect(result.error).toBe("Network failure");
  });

  it("refreshes token preemptively when near expiry", async () => {
    mockGetSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: "old-token",
          expires_at: Math.floor(Date.now() / 1000) + 30, // expires in 30s
        },
      },
    });
    mockRefreshSession.mockResolvedValueOnce({
      data: { session: { access_token: "fresh-token" } },
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ fresh: true }),
    });

    const result = await callApi("refresh-endpoint");

    expect(result.data).toEqual({ fresh: true });
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers.Authorization).toBe("Bearer fresh-token");
  });

  it("uses GET method when specified", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ get: true }),
    });

    await callApi("get-endpoint", { method: "GET" });

    const [, options] = mockFetch.mock.calls[0];
    expect(options.method).toBe("GET");
    expect(options.body).toBeUndefined();
  });

  it("includes details from backend error response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({ error: "Bad Request", details: "field X is required" }),
    });
    mockGetSession.mockResolvedValueOnce({ data: { session: null } });

    const result = await callApi("bad-request");

    expect(result.error).toBe("Bad Request: field X is required");
  });
});
