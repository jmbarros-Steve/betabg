import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mockGetSession = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
    },
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { useShopifyAuthFetch } from "../useShopifyAuthFetch";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: "test-token" } },
  });
});

describe("useShopifyAuthFetch", () => {
  it("returns expected interface", () => {
    const { result } = renderHook(() => useShopifyAuthFetch());

    expect(result.current.authFetch).toBeTypeOf("function");
    expect(result.current.callEdgeFunction).toBeTypeOf("function");
    expect(result.current.executeQuery).toBeTypeOf("function");
    expect(result.current.isEmbedded).toBe(false);
    expect(result.current.isInitialized).toBe(true);
  });

  it("authFetch adds Authorization header", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useShopifyAuthFetch());

    await act(async () => {
      await result.current.authFetch("https://api.example.com/data");
    });

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers.Authorization).toBe("Bearer test-token");
    expect(options.headers["Content-Type"]).toBe("application/json");
  });

  it("authFetch works without session", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockFetch.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useShopifyAuthFetch());

    await act(async () => {
      await result.current.authFetch("https://api.example.com/data");
    });

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
  });

  it("callEdgeFunction makes authenticated POST to Supabase function", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: "ok" }),
    });

    const { result } = renderHook(() => useShopifyAuthFetch());

    let response: any;
    await act(async () => {
      response = await result.current.callEdgeFunction("my-function", {
        body: { key: "value" },
      });
    });

    expect(response.data).toEqual({ result: "ok" });
    expect(response.error).toBeNull();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/functions/v1/my-function");
    expect(options.method).toBe("POST");
  });

  it("callEdgeFunction handles non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "Server Error" }),
    });

    const { result } = renderHook(() => useShopifyAuthFetch());

    let response: any;
    await act(async () => {
      response = await result.current.callEdgeFunction("failing-fn");
    });

    expect(response.data).toBeNull();
    expect(response.error).toBe("Server Error");
  });

  it("callEdgeFunction handles network error", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useShopifyAuthFetch());

    let response: any;
    await act(async () => {
      response = await result.current.callEdgeFunction("offline-fn");
    });

    expect(response.data).toBeNull();
    expect(response.error).toBe("Network error");
  });

  it("executeQuery wraps supabase queries", async () => {
    const { result } = renderHook(() => useShopifyAuthFetch());

    let response: any;
    await act(async () => {
      response = await result.current.executeQuery(() =>
        Promise.resolve({ data: [{ id: 1 }], error: null }),
      );
    });

    expect(response.data).toEqual([{ id: 1 }]);
    expect(response.error).toBeNull();
  });

  it("executeQuery handles query errors", async () => {
    const { result } = renderHook(() => useShopifyAuthFetch());

    let response: any;
    await act(async () => {
      response = await result.current.executeQuery(() =>
        Promise.resolve({ data: null, error: { message: "Query failed" } }),
      );
    });

    expect(response.data).toBeNull();
    expect(response.error).toBe("Query failed");
  });

  it("executeQuery handles thrown exceptions", async () => {
    const { result } = renderHook(() => useShopifyAuthFetch());

    let response: any;
    await act(async () => {
      response = await result.current.executeQuery(() =>
        Promise.reject(new Error("Unexpected")),
      );
    });

    expect(response.data).toBeNull();
    expect(response.error).toBe("Unexpected");
  });
});
