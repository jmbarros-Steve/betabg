import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const mockFrom = vi.fn();
const mockFunctionsInvoke = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    functions: {
      invoke: (...args: any[]) => mockFunctionsInvoke(...args),
    },
  },
}));

import { useMetaScopes, ALL_REQUIRED_SCOPES } from "../useMetaScopes";

function mockConnectionQuery(connections: any[] | null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(() =>
      Promise.resolve({ data: connections, error: null }),
    ),
  };
  mockFrom.mockReturnValue(chain);
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: delete mocked window.location
  Object.defineProperty(window, "location", {
    writable: true,
    value: { ...window.location, origin: "https://test.app", href: "" },
  });
});

describe("useMetaScopes", () => {
  it("sets noConnection when no meta connection found", async () => {
    mockConnectionQuery([]);

    const { result } = renderHook(() => useMetaScopes("client-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.noConnection).toBe(true);
    expect(result.current.granted).toEqual([]);
  });

  it("sets noConnection when data is null", async () => {
    mockConnectionQuery(null);

    const { result } = renderHook(() => useMetaScopes("client-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.noConnection).toBe(true);
  });

  it("loads granted scopes on success", async () => {
    mockConnectionQuery([{ id: "conn-1" }]);
    mockFunctionsInvoke.mockResolvedValue({
      data: {
        success: true,
        granted: ["ads_read", "ads_management", "business_management"],
        declined: ["catalog_management"],
      },
      error: null,
    });

    const { result } = renderHook(() => useMetaScopes("client-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.noConnection).toBe(false);
    expect(result.current.granted).toEqual(["ads_read", "ads_management", "business_management"]);
    expect(result.current.declined).toEqual(["catalog_management"]);
    expect(result.current.scopeDataLoaded).toBe(true);
    expect(result.current.connectionId).toBe("conn-1");
  });

  it("identifies token_expired state", async () => {
    mockConnectionQuery([{ id: "conn-1" }]);
    mockFunctionsInvoke.mockResolvedValue({
      data: { token_expired: true },
      error: null,
    });

    const { result } = renderHook(() => useMetaScopes("client-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tokenExpired).toBe(true);
    expect(result.current.scopeDataLoaded).toBe(true);
    expect(result.current.granted).toEqual([]);
    expect(result.current.needsReconnect).toBe(true);
  });

  it("identifies missing_all state", async () => {
    mockConnectionQuery([{ id: "conn-1" }]);
    mockFunctionsInvoke.mockResolvedValue({
      data: { missing_all: true },
      error: null,
    });

    const { result } = renderHook(() => useMetaScopes("client-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.scopeDataLoaded).toBe(true);
    expect(result.current.granted).toEqual([]);
  });

  it("hides scope panel when edge function fails", async () => {
    mockConnectionQuery([{ id: "conn-1" }]);
    mockFunctionsInvoke.mockResolvedValue({
      data: null,
      error: { message: "Edge function error" },
    });

    const { result } = renderHook(() => useMetaScopes("client-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.scopeDataLoaded).toBe(false); // panel stays hidden
  });

  it("computes feature availability based on granted scopes", async () => {
    mockConnectionQuery([{ id: "conn-1" }]);
    mockFunctionsInvoke.mockResolvedValue({
      data: {
        success: true,
        granted: ["ads_read"], // only metrics available
        declined: [],
      },
      error: null,
    });

    const { result } = renderHook(() => useMetaScopes("client-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasFeature("metrics")).toBe(true); // requires ads_read
    expect(result.current.hasFeature("campaigns")).toBe(false); // requires ads_management
    expect(result.current.hasFeature("nonexistent")).toBe(false);
  });

  it("needsReconnect is true when scopes are partial", async () => {
    mockConnectionQuery([{ id: "conn-1" }]);
    mockFunctionsInvoke.mockResolvedValue({
      data: {
        success: true,
        granted: ["ads_read"], // only 1 of many
        declined: [],
      },
      error: null,
    });

    const { result } = renderHook(() => useMetaScopes("client-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.needsReconnect).toBe(true);
  });

  it("needsReconnect is false when all scopes granted", async () => {
    mockConnectionQuery([{ id: "conn-1" }]);
    mockFunctionsInvoke.mockResolvedValue({
      data: {
        success: true,
        granted: [...ALL_REQUIRED_SCOPES],
        declined: [],
      },
      error: null,
    });

    const { result } = renderHook(() => useMetaScopes("client-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.needsReconnect).toBe(false);
  });

  it("ALL_REQUIRED_SCOPES contains expected scopes", () => {
    expect(ALL_REQUIRED_SCOPES).toContain("ads_read");
    expect(ALL_REQUIRED_SCOPES).toContain("ads_management");
    expect(ALL_REQUIRED_SCOPES).toContain("business_management");
    expect(ALL_REQUIRED_SCOPES).toContain("pages_read_engagement");
    expect(ALL_REQUIRED_SCOPES.length).toBeGreaterThan(10);
  });
});
