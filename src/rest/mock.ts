/**
 * REST mock registry for testing.
 *
 * Import from `@pihanga2/core/rest/mock` to intercept Pihanga REST calls in
 * tests without hitting a real network.
 *
 * The mock system hooks into the private `_fetch` shim inside `utils.ts` via
 * a module-level callback (`_setMockResolver`).  Because the hook is only set
 * when **this module is imported**, production bundles that never import
 * `@pihanga2/core/rest/mock` will not include any mock code at all.
 *
 * @example
 * ```ts
 * import { afterEach } from "vitest"
 * import { registerRestMock, clearRestMocks } from "@pihanga2/core/rest/mock"
 *
 * afterEach(() => clearRestMocks())
 *
 * // Match by "METHOD /path/:param" — colon segments are wildcards
 * registerRestMock("GET /api/items/:id", (url) => ({
 *   status: 200,
 *   body: { id: url.pathname.split("/").pop(), name: "Widget" },
 * }))
 *
 * // Match any HTTP method
 * registerRestMock("/api/items", () => ({ status: 200, body: [] }))
 *
 * // Match by RegExp
 * registerRestMock(/\/api\/broken/, () => { throw new Error("Network failure") })
 *
 * // Return undefined to fall through to real fetch
 * registerRestMock("GET /api/items/:id", (url) => {
 *   if (url.pathname.endsWith("/secret")) return undefined
 *   return { status: 200, body: {} }
 * })
 * ```
 */

import { RestContentType } from "./enums";
import type { HttpResponse } from "./types";
import { _setMockResolver } from "./utils";
export {
  createPiMockState,
  piCoreMockFactory,
  createRestTestHarness,
} from "./test-harness";
export type { PiMockState, PiOneShotEntry } from "./test-harness";

// ── Public types ──────────────────────────────────────────────────────────────

/**
 * Simplified response shape returned by a mock handler.
 * Automatically converted to the internal `HttpResponse` format.
 */
export type MockResponse = {
  /** HTTP status code. Defaults to `200`. */
  status?: number;
  /**
   * Response body.
   * - Objects / arrays → JSON (`RestContentType.Object`)
   * - Strings → plain text (`RestContentType.Text`)
   * - `null` / omitted → empty text response
   */
  body?: unknown;
  /** Response headers. Defaults to `{}`. */
  headers?: Record<string, string>;
};

/**
 * Mock handler function.
 *
 * @param url     The resolved URL that would have been fetched.
 * @param request The `RequestInit` that would have been sent.
 * @returns
 *   - `MockResponse` — intercepts the call with the given response.
 *   - `undefined` — falls through to the next matching mock, or real `fetch`.
 *   - Throw — treated as a network-level failure (dispatches `INTERNAL_ERROR`).
 */
export type MockHandler = (
  url: URL,
  request: RequestInit,
) => MockResponse | undefined | Promise<MockResponse | undefined>;

// ── Internal types ────────────────────────────────────────────────────────────

type MockMatcher = (url: URL, method: string) => boolean;
type MockEntry = { matcher: MockMatcher; handler: MockHandler };

// ── Registry ──────────────────────────────────────────────────────────────────

const _registry: MockEntry[] = [];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Register a mock handler for Pihanga REST calls.
 *
 * @param pattern
 *   One of:
 *   - `"METHOD /path/:param"` — matches the HTTP method **and** URL pathname.
 *     `:param` matches exactly one non-slash path segment (consistent with the
 *     URL template syntax used in `registerGET` / `registerPOST` / …).
 *   - `"/path/:param"` — matches **any** HTTP method on the given path.
 *   - `RegExp` — tested against the full URL string (`url.toString()`).
 *
 * @param handler
 *   Called when the pattern matches. Return `{ status, body, headers }` to
 *   intercept, `undefined` to fall through to the next mock / real `fetch`, or
 *   throw to simulate a network error.
 *
 * Mocks are evaluated in **registration order**; the first match wins.
 */
export function registerRestMock(pattern: string | RegExp, handler: MockHandler): void {
  _registry.push({ matcher: buildMatcher(pattern), handler });
}

/**
 * Remove **all** registered mocks.
 * Call this in `afterEach` to keep tests isolated.
 */
export function clearRestMocks(): void {
  _registry.length = 0;
}

// ── Internal resolver (injected into utils.ts) ────────────────────────────────

/**
 * Walk the registry and, if a mock matches, execute its handler.
 * Returns an `HttpResponse` on a hit, or `null` to signal "use real fetch".
 *
 * @internal
 */
async function resolveMock(url: URL, request: RequestInit): Promise<HttpResponse | null> {
  const method = (request.method ?? "GET").toUpperCase();
  for (const entry of _registry) {
    if (entry.matcher(url, method)) {
      const raw = await entry.handler(url, request);
      if (raw === undefined) {
        // handler explicitly fell through — continue to the next entry
        continue;
      }
      return toHttpResponse(raw);
    }
  }
  return null;
}

// Wire up the resolver when this module is first imported.
_setMockResolver(resolveMock);

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildMatcher(pattern: string | RegExp): MockMatcher {
  if (pattern instanceof RegExp) {
    return (url) => pattern.test(url.toString());
  }

  // "METHOD /path/:param"  or  "/path/:param"
  const parts = pattern.trim().split(/\s+/);
  let methodFilter: string | null;
  let pathTemplate: string;

  if (parts.length >= 2) {
    methodFilter = parts[0].toUpperCase();
    pathTemplate = parts[1];
  } else {
    methodFilter = null;
    pathTemplate = parts[0];
  }

  const pathRegex = templateToRegex(pathTemplate);
  return (url, method) => {
    if (methodFilter && methodFilter !== method) return false;
    return pathRegex.test(url.pathname);
  };
}

/**
 * Convert a path template like `/api/items/:id` into a `RegExp` that matches
 * the concrete URL pathname. `:param` segments match exactly one non-slash
 * segment, mirroring the URL template syntax in the REST registration helpers.
 */
function templateToRegex(template: string): RegExp {
  const escaped = template
    // Escape all regex metacharacters before substituting :params
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    // Replace :param with a single-segment wildcard
    .replace(/:[^/]+/g, "[^/]+");
  return new RegExp(`^${escaped}(/.*)?$`);
}

function toHttpResponse(mock: MockResponse): HttpResponse {
  const status = mock.status ?? 200;
  const headers = mock.headers ?? {};
  const body = mock.body ?? null;

  if (typeof body === "string") {
    return {
      statusCode: status,
      content: body,
      contentType: RestContentType.Text,
      mimeType: headers["content-type"] ?? "text/plain",
      headers,
      size: body.length,
    };
  }

  if (body === null) {
    return {
      statusCode: status,
      content: null,
      contentType: RestContentType.Text,
      mimeType: headers["content-type"] ?? "text/plain",
      headers,
      size: 0,
    };
  }

  // Object / array → JSON
  return {
    statusCode: status,
    content: body,
    contentType: RestContentType.Object,
    mimeType: headers["content-type"] ?? "application/json",
    headers,
    size: -1,
  };
}
