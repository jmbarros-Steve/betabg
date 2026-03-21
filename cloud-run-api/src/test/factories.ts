/**
 * Test factories for building mock objects used across test suites.
 */

/**
 * Build a mock Request object with sensible defaults.
 */
export function buildRequest(
  overrides: {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    body?: string | null;
  } = {}
): Request {
  const {
    method = "GET",
    url = "http://localhost:8080/api/test",
    headers = {},
    body = null,
  } = overrides;

  const init: RequestInit = {
    method,
    headers: new Headers(headers),
  };

  // Only attach body for methods that support it
  if (body !== null && method !== "GET" && method !== "HEAD") {
    init.body = body;
  }

  return new Request(url, init);
}
