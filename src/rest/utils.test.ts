/**
 * Tests for rest/utils.ts — HTTP response helpers.
 *
 * createErrorAction and parseResponse are pure-ish utilities that transform
 * raw fetch responses into typed Redux actions, making them good candidates
 * for direct unit testing.
 */
import { describe, it, expect, afterEach } from "vitest";
import { vi } from "vitest";
// rest/types.ts calls registerActions() at module level.
// registerActions lives in redux.ts, which imports `register` from ".." (src/index.ts).
// src/index.ts imports from src/router.ts, which imports back from src/redux.ts —
// creating a cycle that makes registerActions undefined at initialisation time.
// Mocking the index module breaks the cycle; `register` is only used inside
// function bodies so this is safe for all tests in this file.
vi.mock("../index", () => ({}));

import { createErrorAction, parseResponse, registerCommon } from "./utils";
import { ErrorKind, HttpResponse } from "./types";
import { RestContentType } from "./enums";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHttpResponse(statusCode: number): HttpResponse {
  return {
    statusCode,
    content: null,
    contentType: RestContentType.Text,
    mimeType: "text/plain",
    size: 0,
    headers: {},
  };
}

const EXAMPLE_URL = new URL("https://example.com/api/items/42");

// ---------------------------------------------------------------------------
// createErrorAction
// ---------------------------------------------------------------------------

describe("createErrorAction – HTTP status → ErrorKind mapping", () => {
  it("maps 401 to ErrorKind.Unauthorised", () => {
    const action = createErrorAction(
      "TEST_ERROR",
      makeHttpResponse(401),
      "fetch-items",
      EXAMPLE_URL,
      { type: "FETCH" },
    );
    expect(action.error).toBe(ErrorKind.Unauthorised);
  });

  it("maps 403 to ErrorKind.PermissionDenied", () => {
    const action = createErrorAction(
      "TEST_ERROR",
      makeHttpResponse(403),
      "fetch-items",
      EXAMPLE_URL,
      { type: "FETCH" },
    );
    expect(action.error).toBe(ErrorKind.PermissionDenied);
  });

  it("maps 404 to ErrorKind.NotFound", () => {
    const action = createErrorAction(
      "TEST_ERROR",
      makeHttpResponse(404),
      "fetch-items",
      EXAMPLE_URL,
      { type: "FETCH" },
    );
    expect(action.error).toBe(ErrorKind.NotFound);
  });

  it("maps 500 (server error) to ErrorKind.Other", () => {
    const action = createErrorAction(
      "TEST_ERROR",
      makeHttpResponse(500),
      "fetch-items",
      EXAMPLE_URL,
      { type: "FETCH" },
    );
    expect(action.error).toBe(ErrorKind.Other);
  });

  it("maps 429 (rate-limited) to ErrorKind.Other", () => {
    const action = createErrorAction(
      "TEST_ERROR",
      makeHttpResponse(429),
      "fetch-items",
      EXAMPLE_URL,
      { type: "FETCH" },
    );
    expect(action.error).toBe(ErrorKind.Other);
  });

  it("maps 422 (unprocessable entity) to ErrorKind.Other", () => {
    const action = createErrorAction(
      "TEST_ERROR",
      makeHttpResponse(422),
      "fetch-items",
      EXAMPLE_URL,
      { type: "FETCH" },
    );
    expect(action.error).toBe(ErrorKind.Other);
  });
});

describe("createErrorAction – action shape", () => {
  it("sets the action type to the supplied type argument", () => {
    const action = createErrorAction(
      "MY_SPECIFIC_ERROR",
      makeHttpResponse(404),
      "my-call",
      EXAMPLE_URL,
      { type: "ORIGINAL" },
    );
    expect(action.type).toBe("MY_SPECIFIC_ERROR");
  });

  it("sets requestID to the supplied name", () => {
    const action = createErrorAction(
      "ERR",
      makeHttpResponse(404),
      "load-user-profile",
      EXAMPLE_URL,
      { type: "LOAD" },
    );
    expect(action.requestID).toBe("load-user-profile");
  });

  it("sets url to the stringified URL", () => {
    const url = new URL("https://api.example.com/v2/resource?filter=active");
    const action = createErrorAction("ERR", makeHttpResponse(500), "x", url, {
      type: "X",
    });
    expect(action.url).toBe(url.toString());
  });

  it("attaches the original request action as `request`", () => {
    const requestAction = { type: "FETCH_ITEM", id: "item-99" };
    const action = createErrorAction(
      "ERR",
      makeHttpResponse(404),
      "fetch",
      EXAMPLE_URL,
      requestAction,
    );
    expect(action.request).toBe(requestAction);
  });

  it("spreads all HttpResponse fields into the action", () => {
    const resp = makeHttpResponse(500);
    const action = createErrorAction("ERR", resp, "x", EXAMPLE_URL, {
      type: "X",
    });
    expect(action.statusCode).toBe(500);
    expect(action.contentType).toBe(RestContentType.Text);
  });
});

// ---------------------------------------------------------------------------
// parseResponse
// ---------------------------------------------------------------------------

describe("parseResponse", () => {
  it("parses application/json responses into a JS object", async () => {
    const body = { hello: "world", count: 3 };
    const response = new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
    });

    const [content, contentType, mimeType] = await parseResponse(response);

    expect(content).toEqual(body);
    expect(contentType).toBe(RestContentType.Object);
    expect(mimeType).toBe("application/json");
  });

  it("parses text/plain responses as a string", async () => {
    const response = new Response("plain text content", {
      headers: { "content-type": "text/plain" },
    });

    const [content, contentType, mimeType] = await parseResponse(response);

    expect(content).toBe("plain text content");
    expect(contentType).toBe(RestContentType.Text);
    expect(mimeType).toBe("text/plain");
  });

  it("parses text/html responses as a string (general text/* branch)", async () => {
    const html = "<h1>Hello</h1>";
    const response = new Response(html, {
      headers: { "content-type": "text/html" },
    });

    const [content, contentType] = await parseResponse(response);

    expect(content).toBe(html);
    expect(contentType).toBe(RestContentType.Text);
  });

  it("parses application/jose responses as a string", async () => {
    const joseToken = "eyJhbGciOiJFUzI1NiJ9.payload.sig";
    const response = new Response(joseToken, {
      headers: { "content-type": "application/jose" },
    });

    const [content, contentType] = await parseResponse(response);

    expect(content).toBe(joseToken);
    expect(contentType).toBe(RestContentType.Text);
  });

  it("falls back to Blob for unknown binary content types", async () => {
    const response = new Response(new Uint8Array([1, 2, 3]).buffer, {
      headers: { "content-type": "application/octet-stream" },
    });

    const [_content, contentType, mimeType] = await parseResponse(response);

    expect(contentType).toBe(RestContentType.Blob);
    expect(mimeType).toBe("application/octet-stream");
  });

  it("returns 'unknown' mimeType when Content-Type header is absent", async () => {
    // Use a null body so jsdom does not auto-inject a Content-Type from the
    // Blob's MIME type (a typeless Blob can still trigger "text/plain" in some
    // runtime versions).
    const response = new Response(null);

    const [_content, contentType, mimeType] = await parseResponse(response);

    expect(contentType).toBe(RestContentType.Blob);
    expect(mimeType).toBe("unknown");
  });

  it("returns the original Response as the 4th tuple element", async () => {
    const response = new Response("hi", {
      headers: { "content-type": "text/plain" },
    });

    const [, , , originalResponse] = await parseResponse(response);

    expect(originalResponse).toBe(response);
  });

  // B2 — mime parameters must not prevent content-type matching
  it("B2: parses 'application/json; charset=utf-8' as JSON (not blob)", async () => {
    const body = { id: 1, name: "test" };
    const response = new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json; charset=utf-8" },
    });

    const [content, contentType] = await parseResponse(response);

    expect(contentType).toBe(RestContentType.Object);
    expect(content).toEqual(body);
  });

  it("B2: parses 'text/html; charset=utf-8' as text (not blob)", async () => {
    const html = "<p>hello</p>";
    const response = new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });

    const [content, contentType] = await parseResponse(response);

    expect(contentType).toBe(RestContentType.Text);
    expect(content).toBe(html);
  });

  it("B2: preserves the full original MIME string (with params) as the mimeType tuple element", async () => {
    const fullMime = "application/json; charset=utf-8";
    const response = new Response("{}", {
      headers: { "content-type": fullMime },
    });

    const [, , mimeType] = await parseResponse(response);

    expect(mimeType).toBe(fullMime);
  });
});

// ---------------------------------------------------------------------------
// B8 — HttpResponse.headers is a serialisable plain object
// ---------------------------------------------------------------------------

describe("B8 — HttpResponse.headers is a serialisable plain string object", () => {
  it("Object.fromEntries(response.headers.entries()) produces a plain object (not a Headers instance)", () => {
    const response = new Response("", {
      headers: {
        "content-type": "application/json",
        "x-request-id": "abc-123",
      },
    });

    // This is exactly the expression now used in _fetch().
    const plain = Object.fromEntries(response.headers.entries());

    // B8: must NOT be a Headers instance — plain objects are JSON-serialisable.
    expect(plain).not.toBeInstanceOf(Headers);
    expect(Object.getPrototypeOf(plain)).toBe(Object.prototype);
  });

  it("all header values are strings (satisfies {[k: string]: string})", () => {
    const response = new Response("", {
      headers: {
        "content-type": "text/plain",
        "content-length": "42",
      },
    });

    const plain = Object.fromEntries(response.headers.entries());

    Object.entries(plain).forEach(([key, value]) => {
      expect(typeof key).toBe("string");
      expect(typeof value).toBe("string");
    });
  });

  it("header values are correctly round-tripped through JSON serialisation", () => {
    const response = new Response("", {
      headers: { "x-custom": "hello world", accept: "application/json" },
    });

    const plain = Object.fromEntries(response.headers.entries());
    // If serialisable, JSON.stringify → JSON.parse must give back the same data.
    const roundTripped = JSON.parse(JSON.stringify(plain));

    expect(roundTripped["x-custom"]).toBe("hello world");
    expect(roundTripped["accept"]).toBe("application/json");
  });
});

// ---------------------------------------------------------------------------
// createErrorAction — additional HTTP status code coverage
// ---------------------------------------------------------------------------

describe("createErrorAction – additional status codes map to ErrorKind.Other", () => {
  const req = { type: "FETCH" };

  it.each([
    [400, "Bad Request"],
    [408, "Request Timeout"],
    [409, "Conflict"],
    [410, "Gone"],
    [422, "Unprocessable Entity"],
    [429, "Too Many Requests"],
    [500, "Internal Server Error"],
    [502, "Bad Gateway"],
    [503, "Service Unavailable"],
    [504, "Gateway Timeout"],
  ])("maps HTTP %i (%s) to ErrorKind.Other", (statusCode) => {
    const action = createErrorAction(
      "TEST_ERROR",
      makeHttpResponse(statusCode),
      "test-call",
      EXAMPLE_URL,
      req,
    );
    expect(action.error).toBe(ErrorKind.Other);
  });
});

describe("createErrorAction – statusCode is preserved in the action", () => {
  it("the statusCode field in the action matches the response status", () => {
    for (const code of [400, 401, 403, 404, 500, 503]) {
      const action = createErrorAction(
        "ERR",
        makeHttpResponse(code),
        "check",
        EXAMPLE_URL,
        { type: "FETCH" },
      );
      expect(action.statusCode).toBe(code);
    }
  });
});

// ---------------------------------------------------------------------------
// parseResponse — additional edge cases
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// registerCommon — replyMapper integration
// ---------------------------------------------------------------------------

describe("registerCommon — replyMapper", () => {
  /** Creates a minimal mock PiReducer + dispatch wiring for testing. */
  function createMockSetup() {
    const handlers: Record<string, (state: any, action: any, dispatch: any) => any> = {};
    const dispatched: any[] = [];

    const mockReducer = {
      register: (type: string, handler: any) => {
        handlers[type] = handler;
      },
    };

    // Auto-forward dispatched actions to any registered handler.
    const dispatch = (action: any) => {
      dispatched.push(action);
      const h = handlers[action.type];
      if (h) h({}, action, dispatch);
    };

    return { handlers, dispatched, mockReducer, dispatch };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("invokes a custom replyMapper with parsed content and response headers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 42 }), {
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const { handlers, mockReducer, dispatch } = createMockSetup();
    const replyMapper = vi.fn().mockResolvedValue({ mapped: true });
    const reply = vi.fn();

    registerCommon(
      mockReducer as any,
      {
        name: "test",
        origin: "http://localhost",
        trigger: "TEST/TRIGGER",
        url: "/api/test",
        replyMapper,
        reply,
      },
      () => [{ method: "GET" }, {}],
      "test/submitted",
      "test/result",
      "test/error",
      "test/int_error",
    );

    handlers["TEST/TRIGGER"]({}, { type: "TEST/TRIGGER" }, dispatch);
    // Wait for all microtasks (fetch → parseResponse → mapper → dispatch)
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(replyMapper).toHaveBeenCalledOnce();
    expect(replyMapper).toHaveBeenCalledWith({ id: 42 }, expect.any(Object));
    expect(reply).toHaveBeenCalledOnce();
    expect(reply).toHaveBeenCalledWith(
      expect.any(Object),
      { mapped: true },
      expect.any(Function),
      expect.objectContaining({ content: { mapped: true } }),
    );
  });

  it("uses jsonReplyMapper by default for JSON responses (pass-through)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ value: 7 }), {
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const { handlers, mockReducer, dispatch } = createMockSetup();
    const reply = vi.fn();

    registerCommon(
      mockReducer as any,
      {
        name: "test",
        origin: "http://localhost",
        trigger: "TEST/TRIGGER",
        url: "/api/test",
        reply,
      },
      () => [{ method: "GET" }, {}],
      "test/submitted",
      "test/result",
      "test/error",
      "test/int_error",
    );

    handlers["TEST/TRIGGER"]({}, { type: "TEST/TRIGGER" }, dispatch);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(reply).toHaveBeenCalledOnce();
    expect(reply).toHaveBeenCalledWith(
      expect.any(Object),
      { value: 7 },
      expect.any(Function),
      expect.any(Object),
    );
  });

  it("uses textReplyMapper by default for text/* responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("hello world", { headers: { "content-type": "text/plain" } }),
        ),
    );

    const { handlers, mockReducer, dispatch } = createMockSetup();
    const reply = vi.fn();

    registerCommon(
      mockReducer as any,
      {
        name: "test",
        origin: "http://localhost",
        trigger: "TEST/TRIGGER",
        url: "/api/test",
        reply,
      },
      () => [{ method: "GET" }, {}],
      "test/submitted",
      "test/result",
      "test/error",
      "test/int_error",
    );

    handlers["TEST/TRIGGER"]({}, { type: "TEST/TRIGGER" }, dispatch);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(reply).toHaveBeenCalledWith(
      expect.any(Object),
      "hello world",
      expect.any(Function),
      expect.any(Object),
    );
  });

  it("dispatches an error action (statusCode: 0) and calls error handler when replyMapper rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 1 }), {
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const { handlers, dispatched, mockReducer, dispatch } = createMockSetup();
    const replyMapper = vi.fn().mockRejectedValue(new Error("parse failed"));
    const reply = vi.fn();
    const error = vi.fn();

    registerCommon(
      mockReducer as any,
      {
        name: "test",
        origin: "http://localhost",
        trigger: "TEST/TRIGGER",
        url: "/api/test",
        replyMapper,
        reply,
        error,
      },
      () => [{ method: "GET" }, {}],
      "test/submitted",
      "test/result",
      "test/error",
      "test/int_error",
    );

    handlers["TEST/TRIGGER"]({}, { type: "TEST/TRIGGER" }, dispatch);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(reply).not.toHaveBeenCalled();

    const errAction = dispatched.find((a) => a.type === "test/error");
    expect(errAction).toBeDefined();
    expect(errAction.statusCode).toBe(0);
    expect(errAction.content).toBe("parse failed");

    expect(error).toHaveBeenCalledOnce();
  });
});

describe("parseResponse – additional content-type edge cases", () => {
  it("returns Blob for 'application/ld+json' (not in the recognised-JSON allowlist)", async () => {
    // The implementation only treats 'application/json' as Object; all other
    // application/* subtypes fall through to the Blob branch.
    const body = { "@context": "https://schema.org", name: "test" };
    const response = new Response(JSON.stringify(body), {
      headers: { "content-type": "application/ld+json" },
    });

    const [_content, contentType, mimeType] = await parseResponse(response);

    expect(contentType).toBe(RestContentType.Blob);
    expect(mimeType).toBe("application/ld+json");
  });

  it("parses an empty JSON object body correctly", async () => {
    const response = new Response("{}", {
      headers: { "content-type": "application/json" },
    });

    const [content, contentType] = await parseResponse(response);

    expect(contentType).toBe(RestContentType.Object);
    expect(content).toEqual({});
  });

  it("parses a JSON array body correctly", async () => {
    const body = [1, 2, 3];
    const response = new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
    });

    const [content] = await parseResponse(response);

    expect(content).toEqual([1, 2, 3]);
  });

  it("parses 'text/csv' as plain text (general text/* branch)", async () => {
    const csv = "id,name\n1,Alice\n2,Bob";
    const response = new Response(csv, {
      headers: { "content-type": "text/csv" },
    });

    const [content, contentType] = await parseResponse(response);

    expect(contentType).toBe(RestContentType.Text);
    expect(content).toBe(csv);
  });
});
