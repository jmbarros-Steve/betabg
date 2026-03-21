import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import "../../../src/test/setup.js";
import { errorHandler } from "../error-handler.js";

function createApp(env: string = "production") {
  // Set NODE_ENV for this test
  process.env.NODE_ENV = env;

  const app = new Hono();
  app.get("/api/boom", () => {
    throw new Error("Something went terribly wrong");
  });
  app.onError(errorHandler);
  return app;
}

describe("errorHandler", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    // Suppress console.error output during tests
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  it("returns 500 with JSON error response", async () => {
    const app = createApp("production");
    const res = await app.request("/api/boom");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
  });

  it("does not leak error message in production", async () => {
    const app = createApp("production");
    const res = await app.request("/api/boom");
    const body = await res.json();
    expect(body.message).toBeUndefined();
  });

  it("includes error message in development mode", async () => {
    const app = createApp("development");
    const res = await app.request("/api/boom");
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
    expect(body.message).toBe("Something went terribly wrong");
  });

  it("handles errors with no stack trace gracefully", async () => {
    // Create an Error without a stack property to test edge cases
    process.env.NODE_ENV = "production";
    const app = new Hono();
    app.get("/api/no-stack", () => {
      const err = new Error("no stack");
      err.stack = undefined;
      throw err;
    });
    app.onError(errorHandler);

    const res = await app.request("/api/no-stack");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
    expect(body.message).toBeUndefined();
  });
});
