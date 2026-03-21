import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import "../../../src/test/setup.js";

// Mock getSupabaseAdmin before importing the middleware
vi.mock("../../lib/supabase.js", () => ({
  getSupabaseAdmin: vi.fn(),
}));

import { authMiddleware } from "../auth.js";
import { getSupabaseAdmin } from "../../lib/supabase.js";

const mockedGetSupabaseAdmin = vi.mocked(getSupabaseAdmin);

function createApp() {
  const app = new Hono();
  app.use("/protected/*", authMiddleware);
  app.get("/protected/resource", (c) => {
    return c.json({ ok: true, user: c.get("user"), isInternal: c.get("isInternal") });
  });
  return app;
}

describe("authMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when Authorization header is missing", async () => {
    const app = createApp();
    const res = await app.request("/protected/resource");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("No authorization header");
  });

  it("returns 401 when token is invalid (Supabase rejects it)", async () => {
    mockedGetSupabaseAdmin.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "Invalid token" },
        }),
      },
    } as any);

    const app = createApp();
    const res = await app.request("/protected/resource", {
      headers: { Authorization: "Bearer invalid-token" },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("passes through with valid Bearer token (Supabase verifies user)", async () => {
    const mockUser = { id: "user-123", email: "test@example.com" };
    mockedGetSupabaseAdmin.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: mockUser },
          error: null,
        }),
      },
    } as any);

    const app = createApp();
    const res = await app.request("/protected/resource", {
      headers: { Authorization: "Bearer valid-jwt-token" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.user).toEqual(mockUser);
  });

  it("passes through when Bearer token matches service role key", async () => {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const app = createApp();
    const res = await app.request("/protected/resource", {
      headers: { Authorization: `Bearer ${serviceKey}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.isInternal).toBe(true);
  });

  it("passes through when X-Internal-Key header matches service role key", async () => {
    // Need a different Bearer token so it does not match service key,
    // but X-Internal-Key matches.
    mockedGetSupabaseAdmin.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "bad" },
        }),
      },
    } as any);

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const app = createApp();
    const res = await app.request("/protected/resource", {
      headers: {
        Authorization: "Bearer some-other-token",
        "X-Internal-Key": serviceKey,
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isInternal).toBe(true);
  });

  it("returns 401 when Supabase returns no user and no error", async () => {
    mockedGetSupabaseAdmin.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    } as any);

    const app = createApp();
    const res = await app.request("/protected/resource", {
      headers: { Authorization: "Bearer some-token" },
    });
    expect(res.status).toBe(401);
  });
});
