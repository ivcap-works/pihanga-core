/**
 * Tests for rest/utils.ts — HTTP response helpers.
 *
 * createErrorAction and parseResponse are pure-ish utilities that transform
 * raw fetch responses into typed Redux actions, making them good candidates
 * for direct unit testing.
 */
import {describe, it, expect} from "vitest";
import {createErrorAction, parseResponse} from "./utils";
import {ErrorKind, HttpResponse} from "./types";
import {RestContentType} from "./enums";

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
      {type: "FETCH"},
    );
    expect(action.error).toBe(ErrorKind.Unauthorised);
  });

  it("maps 403 to ErrorKind.PermissionDenied", () => {
    const action = createErrorAction(
      "TEST_ERROR",
      makeHttpResponse(403),
      "fetch-items",
      EXAMPLE_URL,
      {type: "FETCH"},
    );
    expect(action.error).toBe(ErrorKind.PermissionDenied);
  });

  it("maps 404 to ErrorKind.NotFound", () => {
    const action = createErrorAction(
      "TEST_ERROR",
      makeHttpResponse(404),
      "fetch-items",
      EXAMPLE_URL,
      {type: "FETCH"},
    );
    expect(action.error).toBe(ErrorKind.NotFound);
  });

  it("maps 500 (server error) to ErrorKind.Other", () => {
    const action = createErrorAction(
      "TEST_ERROR",
      makeHttpResponse(500),
      "fetch-items",
      EXAMPLE_URL,
      {type: "FETCH"},
    );
    expect(action.error).toBe(ErrorKind.Other);
  });

  it("maps 429 (rate-limited) to ErrorKind.Other", () => {
    const action = createErrorAction(
      "TEST_ERROR",
      makeHttpResponse(429),
      "fetch-items",
      EXAMPLE_URL,
      {type: "FETCH"},
    );
    expect(action.error).toBe(ErrorKind.Other);
  });

  it("maps 422 (unprocessable entity) to ErrorKind.Other", () => {
    const action = createErrorAction(
      "TEST_ERROR",
      makeHttpResponse(422),
      "fetch-items",
      EXAMPLE_URL,
      {type: "FETCH"},
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
      {type: "ORIGINAL"},
    );
    expect(action.type).toBe("MY_SPECIFIC_ERROR");
  });

  it("sets requestID to the supplied name", () => {
    const action = createErrorAction(
      "ERR",
      makeHttpResponse(404),
      "load-user-profile",
      EXAMPLE_URL,
      {type: "LOAD"},
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
    const requestAction = {type: "FETCH_ITEM", id: "item-99"};
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
    const body = {hello: "world", count: 3};
    const response = new Response(JSON.stringify(body), {
      headers: {"content-type": "application/json"},
    });

    const [content, contentType, mimeType] = await parseResponse(response);

    expect(content).toEqual(body);
    expect(contentType).toBe(RestContentType.Object);
    expect(mimeType).toBe("application/json");
  });

  it("parses text/plain responses as a string", async () => {
    const response = new Response("plain text content", {
      headers: {"content-type": "text/plain"},
    });

    const [content, contentType, mimeType] = await parseResponse(response);

    expect(content).toBe("plain text content");
    expect(contentType).toBe(RestContentType.Text);
    expect(mimeType).toBe("text/plain");
  });

  it("parses text/html responses as a string (general text/* branch)", async () => {
    const html = "<h1>Hello</h1>";
    const response = new Response(html, {
      headers: {"content-type": "text/html"},
    });

    const [content, contentType] = await parseResponse(response);

    expect(content).toBe(html);
    expect(contentType).toBe(RestContentType.Text);
  });

  it("parses application/jose responses as a string", async () => {
    const joseToken = "eyJhbGciOiJFUzI1NiJ9.payload.sig";
    const response = new Response(joseToken, {
      headers: {"content-type": "application/jose"},
    });

    const [content, contentType] = await parseResponse(response);

    expect(content).toBe(joseToken);
    expect(contentType).toBe(RestContentType.Text);
  });

  it("falls back to Blob for unknown binary content types", async () => {
    const response = new Response(new Uint8Array([1, 2, 3]).buffer, {
      headers: {"content-type": "application/octet-stream"},
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
      headers: {"content-type": "text/plain"},
    });

    const [, , , originalResponse] = await parseResponse(response);

    expect(originalResponse).toBe(response);
  });

  // B2 — mime parameters must not prevent content-type matching
  it("B2: parses 'application/json; charset=utf-8' as JSON (not blob)", async () => {
    const body = {id: 1, name: "test"};
    const response = new Response(JSON.stringify(body), {
      headers: {"content-type": "application/json; charset=utf-8"},
    });

    const [content, contentType] = await parseResponse(response);

    expect(contentType).toBe(RestContentType.Object);
    expect(content).toEqual(body);
  });

  it("B2: parses 'text/html; charset=utf-8' as text (not blob)", async () => {
    const html = "<p>hello</p>";
    const response = new Response(html, {
      headers: {"content-type": "text/html; charset=utf-8"},
    });

    const [content, contentType] = await parseResponse(response);

    expect(contentType).toBe(RestContentType.Text);
    expect(content).toBe(html);
  });

  it("B2: preserves the full original MIME string (with params) as the mimeType tuple element", async () => {
    const fullMime = "application/json; charset=utf-8";
    const response = new Response("{}", {
      headers: {"content-type": fullMime},
    });

    const [, , mimeType] = await parseResponse(response);

    expect(mimeType).toBe(fullMime);
  });
});
