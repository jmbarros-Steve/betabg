import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import "../../../src/test/setup.js";
import { corsMiddleware } from "../cors.js";

function createApp() {
  const app = new Hono();
  app.use("/*", corsMiddleware);
  app.get("/api/test", (c) => c.json({ ok: true }));
  app.post("/api/test", (c) => c.json({ created: true }));
  return app;
}

describe("corsMiddleware", () => {
  it("sets Access-Control-Allow-Origin to * on GET requests", async () => {
    const app = createApp();
    const res = await app.request("/api/test");
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("returns 204 for OPTIONS preflight requests", async () => {
    const app = createApp();
    const res = await app.request("/api/test", {
      method: "OPTIONS",
      headers: {
        Origin: "https://example.com",
        "Access-Control-Request-Method": "POST",
      },
    });
    expect(res.status).toBe(204);
  });

  it("includes authorization in allowed headers", async () => {
    const app = createApp();
    const res = await app.request("/api/test", {
      method: "OPTIONS",
      headers: {
        Origin: "https://example.com",
        "Access-Control-Request-Method": "POST",
      },
    });
    const allowedHeaders = res.headers.get("Access-Control-Allow-Headers") || "";
    expect(allowedHeaders.toLowerCase()).toContain("authorization");
  });

  it("includes x-internal-key in allowed headers", async () => {
    const app = createApp();
    const res = await app.request("/api/test", {
      method: "OPTIONS",
      headers: {
        Origin: "https://example.com",
        "Access-Control-Request-Method": "POST",
      },
    });
    const allowedHeaders = res.headers.get("Access-Control-Allow-Headers") || "";
    expect(allowedHeaders.toLowerCase()).toContain("x-internal-key");
  });

  it("allows GET, POST, OPTIONS methods", async () => {
    const app = createApp();
    const res = await app.request("/api/test", {
      method: "OPTIONS",
      headers: {
        Origin: "https://example.com",
        "Access-Control-Request-Method": "POST",
      },
    });
    const allowedMethods = res.headers.get("Access-Control-Allow-Methods") || "";
    expect(allowedMethods).toContain("GET");
    expect(allowedMethods).toContain("POST");
    expect(allowedMethods).toContain("OPTIONS");
  });

  it("sets Max-Age header for caching preflight", async () => {
    const app = createApp();
    const res = await app.request("/api/test", {
      method: "OPTIONS",
      headers: {
        Origin: "https://example.com",
        "Access-Control-Request-Method": "GET",
      },
    });
    const maxAge = res.headers.get("Access-Control-Max-Age");
    expect(maxAge).toBe("86400");
  });
});
