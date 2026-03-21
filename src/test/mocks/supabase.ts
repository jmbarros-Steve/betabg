import { vi } from "vitest";

// Chain-builder for .from().select().eq().limit() etc.
function createQueryBuilder(resolvedData: any = [], resolvedError: any = null) {
  const builder: any = {};
  const methods = [
    "select",
    "insert",
    "update",
    "upsert",
    "delete",
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "like",
    "ilike",
    "is",
    "in",
    "contains",
    "containedBy",
    "filter",
    "not",
    "or",
    "order",
    "limit",
    "range",
    "single",
    "maybeSingle",
    "match",
    "textSearch",
  ];
  for (const m of methods) {
    builder[m] = vi.fn().mockReturnValue(builder);
  }
  // Terminal: return data
  builder.then = undefined; // make it thenable
  // Override so await works
  const result = { data: resolvedData, error: resolvedError };
  // Make the builder itself awaitable
  Object.defineProperty(builder, "then", {
    value: (resolve: any) => resolve(result),
    writable: true,
  });
  return builder;
}

export function createMockSupabaseClient(overrides: Record<string, any> = {}) {
  const mockAuth = {
    getSession: vi.fn().mockResolvedValue({
      data: { session: null },
      error: null,
    }),
    getUser: vi.fn().mockResolvedValue({
      data: { user: null },
      error: null,
    }),
    signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signUp: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    refreshSession: vi.fn().mockResolvedValue({
      data: { session: null },
      error: null,
    }),
    onAuthStateChange: vi.fn().mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    }),
    ...overrides.auth,
  };

  const mockFunctions = {
    invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides.functions,
  };

  const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null });

  const client = {
    auth: mockAuth,
    functions: mockFunctions,
    rpc: mockRpc,
    from: vi.fn().mockReturnValue(createQueryBuilder()),
    ...overrides,
  };

  return client;
}

/**
 * Setup vi.mock for @/integrations/supabase/client
 * Call this at the top of test files that import supabase.
 *
 * Usage:
 *   const mockClient = createMockSupabaseClient();
 *   vi.mock("@/integrations/supabase/client", () => ({ supabase: mockClient }));
 */
export { createQueryBuilder };
