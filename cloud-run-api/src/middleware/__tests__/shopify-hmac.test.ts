import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { createHmac } from "node:crypto";
import "../../../src/test/setup.js";
import { shopifyHmacMiddleware } from "../shopify-hmac.js";

function createApp() {
  const app = new Hono();
  app.post("/api/shopify/webhook", shopifyHmacMiddleware, (c) => {
    return c.json({ ok: true, rawBody: c.get("rawBody"), parsedBody: c.get("parsedBody") });
  });
  return app;
}

function computeHmac(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64");
}

describe("shopifyHmacMiddleware", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when x-shopify-hmac-sha256 header is missing", async () => {
    const app = createApp();
    const res = await app.request("/api/shopify/webhook", {
      method: "POST",
      body: JSON.stringify({ id: 1 }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Missing HMAC signature");
  });

  it("returns 401 when HMAC is invalid", async () => {
    const app = createApp();
    const payload = JSON.stringify({ id: 1, title: "Test Product" });
    const res = await app.request("/api/shopify/webhook", {
      method: "POST",
      body: payload,
      headers: {
        "Content-Type": "application/json",
        "x-shopify-hmac-sha256": "invalid-hmac-value",
      },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid HMAC signature");
  });

  it("passes through with a valid HMAC signature", async () => {
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET!;
    const payload = JSON.stringify({ id: 123, title: "Real Product" });
    const validHmac = computeHmac(payload, secret);

    const app = createApp();
    const res = await app.request("/api/shopify/webhook", {
      method: "POST",
      body: payload,
      headers: {
        "Content-Type": "application/json",
        "x-shopify-hmac-sha256": validHmac,
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.rawBody).toBe(payload);
    expect(body.parsedBody).toEqual({ id: 123, title: "Real Product" });
  });

  it("returns 500 when webhook secret env vars are not configured", async () => {
    const originalWebhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET;
    const originalClientSecret = process.env.SHOPIFY_CLIENT_SECRET;
    delete process.env.SHOPIFY_WEBHOOK_SECRET;
    delete process.env.SHOPIFY_CLIENT_SECRET;

    vi.spyOn(console, "error").mockImplementation(() => {});

    const app = createApp();
    const res = await app.request("/api/shopify/webhook", {
      method: "POST",
      body: JSON.stringify({ id: 1 }),
      headers: {
        "Content-Type": "application/json",
        "x-shopify-hmac-sha256": "some-hmac",
      },
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Server configuration error");

    // Restore
    process.env.SHOPIFY_WEBHOOK_SECRET = originalWebhookSecret;
    process.env.SHOPIFY_CLIENT_SECRET = originalClientSecret;
  });

  it("uses SHOPIFY_CLIENT_SECRET as fallback when SHOPIFY_WEBHOOK_SECRET is not set", async () => {
    const originalWebhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET;
    delete process.env.SHOPIFY_WEBHOOK_SECRET;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET || "test-shopify-client-secret";
    process.env.SHOPIFY_CLIENT_SECRET = clientSecret;

    const payload = JSON.stringify({ id: 456 });
    const validHmac = computeHmac(payload, clientSecret);

    const app = createApp();
    const res = await app.request("/api/shopify/webhook", {
      method: "POST",
      body: payload,
      headers: {
        "Content-Type": "application/json",
        "x-shopify-hmac-sha256": validHmac,
      },
    });
    expect(res.status).toBe(200);

    // Restore
    process.env.SHOPIFY_WEBHOOK_SECRET = originalWebhookSecret;
  });
});
