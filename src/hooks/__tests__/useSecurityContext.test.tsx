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
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

import { SecurityProvider, useSecurityContext } from "../useSecurityContext";

function wrapper({ children }: { children: ReactNode }) {
  return <SecurityProvider>{children}</SecurityProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.mockReturnValue(null);
});

describe("useSecurityContext", () => {
  it("throws when used outside SecurityProvider", () => {
    expect(() => {
      renderHook(() => useSecurityContext());
    }).toThrow("useSecurityContext must be used within a SecurityProvider");
  });

  it("returns defaults when no user", async () => {
    const { result } = renderHook(() => useSecurityContext(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isShopifyUser).toBe(false);
    expect(result.current.isSuperAdmin).toBe(false);
    expect(result.current.shopDomain).toBeNull();
    expect(result.current.canAccessAdminRoutes).toBe(false);
    expect(result.current.canAccessClientPortal).toBe(false);
  });

  it("super admin can access admin routes", async () => {
    mockUser.mockReturnValue({ id: "admin-1" });
    mockRpc.mockImplementation((fn: string) => {
      if (fn === "is_shopify_user") return Promise.resolve({ data: false, error: null });
      if (fn === "is_super_admin") return Promise.resolve({ data: true, error: null });
      if (fn === "get_user_shop_domain") return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: null, error: null });
    });

    const { result } = renderHook(() => useSecurityContext(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isSuperAdmin).toBe(true);
    expect(result.current.isRealAdmin).toBe(true);
    expect(result.current.canAccessAdminRoutes).toBe(true);
  });

  it("shopify user cannot access admin routes", async () => {
    mockUser.mockReturnValue({ id: "shop-1" });
    mockRpc.mockImplementation((fn: string) => {
      if (fn === "is_shopify_user") return Promise.resolve({ data: true, error: null });
      if (fn === "is_super_admin") return Promise.resolve({ data: false, error: null });
      if (fn === "get_user_shop_domain")
        return Promise.resolve({ data: "test.myshopify.com", error: null });
      return Promise.resolve({ data: null, error: null });
    });

    const { result } = renderHook(() => useSecurityContext(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isShopifyUser).toBe(true);
    expect(result.current.canAccessAdminRoutes).toBe(false);
    expect(result.current.canAccessClientPortal).toBe(true);
    expect(result.current.shopDomain).toBe("test.myshopify.com");
  });

  it("shopify user who somehow is super admin is still blocked from admin", async () => {
    mockUser.mockReturnValue({ id: "edge-1" });
    mockRpc.mockImplementation((fn: string) => {
      if (fn === "is_shopify_user") return Promise.resolve({ data: true, error: null });
      if (fn === "is_super_admin") return Promise.resolve({ data: true, error: null });
      if (fn === "get_user_shop_domain")
        return Promise.resolve({ data: "shop.myshopify.com", error: null });
      return Promise.resolve({ data: null, error: null });
    });

    const { result } = renderHook(() => useSecurityContext(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    // isRealAdmin = isSuperAdmin && !isShopifyUser → true && !true → false
    expect(result.current.isRealAdmin).toBe(false);
    expect(result.current.canAccessAdminRoutes).toBe(false);
  });

  it("client with shop_domain can access portal", async () => {
    mockUser.mockReturnValue({ id: "client-1" });
    mockRpc.mockImplementation((fn: string) => {
      if (fn === "is_shopify_user") return Promise.resolve({ data: false, error: null });
      if (fn === "is_super_admin") return Promise.resolve({ data: false, error: null });
      if (fn === "get_user_shop_domain")
        return Promise.resolve({ data: "client-shop.myshopify.com", error: null });
      return Promise.resolve({ data: null, error: null });
    });

    const { result } = renderHook(() => useSecurityContext(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.canAccessClientPortal).toBe(true);
  });

  it("handles RPC errors gracefully", async () => {
    mockUser.mockReturnValue({ id: "err-1" });
    mockRpc.mockRejectedValue(new Error("RPC failed"));

    const { result } = renderHook(() => useSecurityContext(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    // Should default to safe values
    expect(result.current.isShopifyUser).toBe(false);
    expect(result.current.isSuperAdmin).toBe(false);
    expect(result.current.canAccessAdminRoutes).toBe(false);
  });
});
