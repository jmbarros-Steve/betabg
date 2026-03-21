import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React, { ReactNode } from "react";

// Mock useAuth
const mockUser = vi.fn<() => any>(() => null);
vi.mock("../useAuth", () => ({
  useAuth: () => ({ user: mockUser() }),
}));

// Mock supabase
const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
    from: (...args: any[]) => mockFrom(...args),
  },
}));

import { useUserRole } from "../useUserRole";

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.mockReturnValue(null);
});

function setupRpcResponses(responses: Record<string, any>) {
  mockRpc.mockImplementation((fn: string) => {
    if (fn in responses) {
      return Promise.resolve({ data: responses[fn], error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });
}

describe("useUserRole", () => {
  it("returns null role when no user", async () => {
    const { result } = renderHook(() => useUserRole());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.role).toBeNull();
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isClient).toBe(false);
    expect(result.current.isSuperAdmin).toBe(false);
  });

  it("identifies super admin correctly", async () => {
    mockUser.mockReturnValue({ id: "admin-1" });
    setupRpcResponses({
      has_role: true,
      is_super_admin: true,
      is_shopify_user: false,
    });
    // has_role is called twice (admin and client), need smarter mock
    mockRpc.mockImplementation((fn: string, args: any) => {
      if (fn === "has_role" && args._role === "admin")
        return Promise.resolve({ data: true, error: null });
      if (fn === "has_role" && args._role === "client")
        return Promise.resolve({ data: false, error: null });
      if (fn === "is_super_admin")
        return Promise.resolve({ data: true, error: null });
      if (fn === "is_shopify_user")
        return Promise.resolve({ data: false, error: null });
      return Promise.resolve({ data: null, error: null });
    });

    const { result } = renderHook(() => useUserRole());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.role).toBe("admin");
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.isSuperAdmin).toBe(true);
    expect(result.current.isShopifyUser).toBe(false);
  });

  it("identifies client user correctly", async () => {
    mockUser.mockReturnValue({ id: "client-1" });
    mockRpc.mockImplementation((fn: string, args: any) => {
      if (fn === "has_role" && args._role === "admin")
        return Promise.resolve({ data: false, error: null });
      if (fn === "has_role" && args._role === "client")
        return Promise.resolve({ data: true, error: null });
      if (fn === "is_super_admin")
        return Promise.resolve({ data: false, error: null });
      if (fn === "is_shopify_user")
        return Promise.resolve({ data: false, error: null });
      return Promise.resolve({ data: null, error: null });
    });

    // Mock client data fetch
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() =>
        Promise.resolve({
          data: [{ id: "c1", name: "Test Client", company: "Test Co", shop_domain: null }],
          error: null,
        }),
      ),
    };
    mockFrom.mockReturnValue(mockChain);

    const { result } = renderHook(() => useUserRole());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.role).toBe("client");
    expect(result.current.isClient).toBe(true);
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.clientData).toBeTruthy();
  });

  it("shopify user is NEVER admin", async () => {
    mockUser.mockReturnValue({ id: "shopify-1" });
    mockRpc.mockImplementation((fn: string, args: any) => {
      if (fn === "has_role" && args._role === "admin")
        return Promise.resolve({ data: true, error: null }); // has admin role
      if (fn === "has_role" && args._role === "client")
        return Promise.resolve({ data: true, error: null });
      if (fn === "is_super_admin")
        return Promise.resolve({ data: false, error: null });
      if (fn === "is_shopify_user")
        return Promise.resolve({ data: true, error: null }); // BUT is shopify user
      return Promise.resolve({ data: null, error: null });
    });

    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() =>
        Promise.resolve({
          data: [{ id: "c1", name: "Shop", company: null, shop_domain: "test.myshopify.com" }],
          error: null,
        }),
      ),
    };
    mockFrom.mockReturnValue(mockChain);

    const { result } = renderHook(() => useUserRole());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.role).toBe("client"); // forced to client
    expect(result.current.isAdmin).toBe(false); // never admin
    expect(result.current.isShopifyUser).toBe(true);
    expect(result.current.isClient).toBe(true);
  });

  it("handles RPC failures gracefully with fallback", async () => {
    mockUser.mockReturnValue({ id: "fallback-1" });
    mockRpc.mockImplementation((fn: string) => {
      if (fn === "has_role")
        return Promise.resolve({ data: null, error: { message: "RPC failed" } });
      if (fn === "is_super_admin")
        return Promise.resolve({ data: false, error: null });
      if (fn === "is_shopify_user")
        return Promise.resolve({ data: false, error: null });
      return Promise.resolve({ data: null, error: null });
    });

    // Fallback query to clients table
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() =>
        Promise.resolve({
          data: [{ id: "c1" }],
          error: null,
        }),
      ),
      order: vi.fn().mockReturnThis(),
    };
    mockFrom.mockReturnValue(mockChain);

    const { result } = renderHook(() => useUserRole());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.role).toBe("client"); // resolved via fallback
  });

  it("super admin is NOT flagged as shopify user even if linked", async () => {
    mockUser.mockReturnValue({ id: "super-shopify" });
    mockRpc.mockImplementation((fn: string, args: any) => {
      if (fn === "has_role" && args._role === "admin")
        return Promise.resolve({ data: true, error: null });
      if (fn === "has_role" && args._role === "client")
        return Promise.resolve({ data: false, error: null });
      if (fn === "is_super_admin")
        return Promise.resolve({ data: true, error: null });
      if (fn === "is_shopify_user")
        return Promise.resolve({ data: true, error: null }); // linked but super admin
      return Promise.resolve({ data: null, error: null });
    });

    const { result } = renderHook(() => useUserRole());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isSuperAdmin).toBe(true);
    expect(result.current.isShopifyUser).toBe(false); // suppressed for super admin
    expect(result.current.isAdmin).toBe(true);
  });
});
