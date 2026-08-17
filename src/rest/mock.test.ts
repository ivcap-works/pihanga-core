/**
 * Tests for src/rest/mock.ts — REST mock registry.
 *
 * Demonstrates the minimal per-file boilerplate required with the harness:
 *   • two unavoidable Vitest lines (vi.hoisted + vi.mock)
 *   • one harness setup call
 *   • one afterEach cleanup
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearRestMocks,
  registerRestMock,
  createPiMockState,
  piCoreMockFactory,
  createRestTestHarness,
} from "./mock";
import { registerCommon } from "./utils";
import { registerGET } from "./get";
import { createOnDispatchPipe } from "../index";

// ── Two unavoidable Vitest lines ───────────────────────────────────────────────
// vi.hoisted / vi.mock must appear in the file being transformed — they cannot
// be re-exported from a shared helper.
//
// IMPORTANT: vi.hoisted() runs BEFORE imports are resolved, so the callback
// MUST NOT call any imported function (TDZ crash).  Write the state object
// inline.  piCoreMockFactory() is safe inside vi.mock because that factory is
// called lazily, only when "../index" is first imported (after all static
// imports are resolved).
const _s = vi.hoisted((): import("./mock").PiMockState => ({
  currentPiRegister: null,
  oneShotHandlers: {},
  pendingCallbacks: [],
}));
vi.mock("../index", (io) => piCoreMockFactory(io, _s));

// ── One-time harness setup ─────────────────────────────────────────────────────
const { createSetup, flush, afterEachCleanup } = createRestTestHarness(_s);
afterEach(() => {
  clearRestMocks();
  vi.unstubAllGlobals();
  afterEachCleanup();
});

// ---------------------------------------------------------------------------
// Unit tests: pattern matching
// ---------------------------------------------------------------------------

describe("registerRestMock — pattern matching", () => {
  it("matches by exact path (no method)", async () => {
    const handler = vi.fn().mockReturnValue({ status: 200, body: { ok: true } });
    registerRestMock("/api/items", handler);

    const { handlers, mockReducer, dispatch } = createSetup();
    const reply = vi.fn();

    registerCommon(
      mockReducer as any,
      {
        name: "t",
        origin: "http://localhost",
        trigger: "T/LOAD",
        url: "/api/items",
        reply,
      },
      () => [{ method: "GET" }, {}],
      "t/submitted",
      "t/result",
      "t/error",
      "t/int_error",
    );

    handlers["T/LOAD"]({}, { type: "T/LOAD" }, dispatch);
    await flush();

    expect(handler).toHaveBeenCalledOnce();
    expect(reply).toHaveBeenCalledOnce();
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      { ok: true },
      expect.any(Function),
      expect.any(Object),
    );
  });

  it("matches by method + path", async () => {
    const getHandler = vi.fn().mockReturnValue({ status: 200, body: { verb: "get" } });
    const postHandler = vi.fn().mockReturnValue({ status: 201, body: { verb: "post" } });

    registerRestMock("GET /api/items", getHandler);
    registerRestMock("POST /api/items", postHandler);

    const { handlers, mockReducer, dispatch } = createSetup();
    const replyGet = vi.fn();
    registerCommon(
      mockReducer as any,
      {
        name: "g",
        origin: "http://localhost",
        trigger: "G/LOAD",
        url: "/api/items",
        reply: replyGet,
      },
      () => [{ method: "GET" }, {}],
      "g/submitted",
      "g/result",
      "g/error",
      "g/int_error",
    );
    handlers["G/LOAD"]({}, { type: "G/LOAD" }, dispatch);
    await flush();

    expect(getHandler).toHaveBeenCalledOnce();
    expect(postHandler).not.toHaveBeenCalled();
    expect(replyGet).toHaveBeenCalledWith(
      expect.anything(),
      { verb: "get" },
      expect.any(Function),
      expect.any(Object),
    );
  });

  it("matches by RegExp against full URL", async () => {
    const handler = vi.fn().mockReturnValue({ status: 200, body: [1, 2, 3] });
    registerRestMock(/\/api\/items\/\d+/, handler);

    const { handlers, mockReducer, dispatch } = createSetup();
    const reply = vi.fn();
    registerCommon(
      mockReducer as any,
      {
        name: "r",
        origin: "http://localhost",
        trigger: "R/LOAD",
        url: "/api/items/42",
        reply,
      },
      () => [{ method: "GET" }, {}],
      "r/submitted",
      "r/result",
      "r/error",
      "r/int_error",
    );
    handlers["R/LOAD"]({}, { type: "R/LOAD" }, dispatch);
    await flush();

    expect(handler).toHaveBeenCalledOnce();
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      [1, 2, 3],
      expect.any(Function),
      expect.any(Object),
    );
  });

  it("matches :param segments as wildcards", async () => {
    const handler = vi.fn().mockReturnValue({ status: 200, body: { id: "99" } });
    registerRestMock("GET /api/items/:id", handler);

    const { handlers, mockReducer, dispatch } = createSetup();
    const reply = vi.fn();
    registerCommon(
      mockReducer as any,
      {
        name: "p",
        origin: "http://localhost",
        trigger: "P/LOAD",
        url: "/api/items/99",
        reply,
      },
      () => [{ method: "GET" }, {}],
      "p/submitted",
      "p/result",
      "p/error",
      "p/int_error",
    );
    handlers["P/LOAD"]({}, { type: "P/LOAD" }, dispatch);
    await flush();

    expect(handler).toHaveBeenCalledOnce();
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      { id: "99" },
      expect.any(Function),
      expect.any(Object),
    );
  });

  it("does NOT match when method differs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ real: true }), {
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const deleteHandler = vi.fn().mockReturnValue({ status: 204 });
    registerRestMock("DELETE /api/items/1", deleteHandler);

    const { handlers, mockReducer, dispatch } = createSetup();
    const reply = vi.fn();
    registerCommon(
      mockReducer as any,
      {
        name: "nd",
        origin: "http://localhost",
        trigger: "ND/LOAD",
        url: "/api/items/1",
        reply,
      },
      () => [{ method: "GET" }, {}],
      "nd/submitted",
      "nd/result",
      "nd/error",
      "nd/int_error",
    );
    handlers["ND/LOAD"]({}, { type: "ND/LOAD" }, dispatch);
    await flush();

    expect(deleteHandler).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      { real: true },
      expect.any(Function),
      expect.any(Object),
    );
  });
});

// ---------------------------------------------------------------------------
// Behaviour: fall-through, error responses, network errors
// ---------------------------------------------------------------------------

describe("registerRestMock — behaviour", () => {
  it("first-match-wins when multiple mocks match", async () => {
    const first = vi.fn().mockReturnValue({ status: 200, body: { which: "first" } });
    const second = vi.fn().mockReturnValue({ status: 200, body: { which: "second" } });
    registerRestMock("/api/items", first);
    registerRestMock("/api/items", second);

    const { handlers, mockReducer, dispatch } = createSetup();
    const reply = vi.fn();
    registerCommon(
      mockReducer as any,
      {
        name: "fw",
        origin: "http://localhost",
        trigger: "FW/LOAD",
        url: "/api/items",
        reply,
      },
      () => [{ method: "GET" }, {}],
      "fw/submitted",
      "fw/result",
      "fw/error",
      "fw/int_error",
    );
    handlers["FW/LOAD"]({}, { type: "FW/LOAD" }, dispatch);
    await flush();

    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      { which: "first" },
      expect.any(Function),
      expect.any(Object),
    );
  });

  it("undefined return falls through to the next matching mock", async () => {
    const fallThrough = vi.fn().mockReturnValue(undefined);
    const real = vi.fn().mockReturnValue({ status: 200, body: { which: "real" } });
    registerRestMock("/api/items", fallThrough);
    registerRestMock("/api/items", real);

    const { handlers, mockReducer, dispatch } = createSetup();
    const reply = vi.fn();
    registerCommon(
      mockReducer as any,
      {
        name: "ft",
        origin: "http://localhost",
        trigger: "FT/LOAD",
        url: "/api/items",
        reply,
      },
      () => [{ method: "GET" }, {}],
      "ft/submitted",
      "ft/result",
      "ft/error",
      "ft/int_error",
    );
    handlers["FT/LOAD"]({}, { type: "FT/LOAD" }, dispatch);
    await flush();

    expect(fallThrough).toHaveBeenCalledOnce();
    expect(real).toHaveBeenCalledOnce();
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      { which: "real" },
      expect.any(Function),
      expect.any(Object),
    );
  });

  it("error status (≥ 300) dispatches to the error handler", async () => {
    registerRestMock("GET /api/gone", () => ({
      status: 404,
      body: { error: "not found" },
    }));

    const { handlers, dispatched, mockReducer, dispatch } = createSetup();
    const reply = vi.fn();
    registerCommon(
      mockReducer as any,
      {
        name: "err",
        origin: "http://localhost",
        trigger: "ERR/LOAD",
        url: "/api/gone",
        reply,
        error: vi.fn(),
      },
      () => [{ method: "GET" }, {}],
      "err/submitted",
      "err/result",
      "err/error",
      "err/int_error",
    );
    handlers["ERR/LOAD"]({}, { type: "ERR/LOAD" }, dispatch);
    await flush();

    expect(reply).not.toHaveBeenCalled();
    const errAction = dispatched.find((a) => a.type === "err/error");
    expect(errAction).toBeDefined();
    expect(errAction.statusCode).toBe(404);
  });

  it("thrown handler simulates a network error → dispatches INTERNAL_ERROR", async () => {
    registerRestMock("GET /api/broken", () => {
      throw new Error("Network failure");
    });

    const { handlers, dispatched, mockReducer, dispatch } = createSetup();
    const reply = vi.fn();
    registerCommon(
      mockReducer as any,
      {
        name: "ne",
        origin: "http://localhost",
        trigger: "NE/LOAD",
        url: "/api/broken",
        reply,
      },
      () => [{ method: "GET" }, {}],
      "ne/submitted",
      "ne/result",
      "ne/error",
      "ne/int_error",
    );
    handlers["NE/LOAD"]({}, { type: "NE/LOAD" }, dispatch);
    await flush();

    expect(reply).not.toHaveBeenCalled();
    const intErr = dispatched.find((a) => a.type === "ne/int_error");
    expect(intErr).toBeDefined();
    expect(intErr.error).toContain("Network failure");
  });

  it("mock returns a string body → text response", async () => {
    registerRestMock("GET /api/text", () => ({ status: 200, body: "hello world" }));

    const { handlers, mockReducer, dispatch } = createSetup();
    const reply = vi.fn();
    registerCommon(
      mockReducer as any,
      {
        name: "txt",
        origin: "http://localhost",
        trigger: "TXT/LOAD",
        url: "/api/text",
        reply,
      },
      () => [{ method: "GET" }, {}],
      "txt/submitted",
      "txt/result",
      "txt/error",
      "txt/int_error",
    );
    handlers["TXT/LOAD"]({}, { type: "TXT/LOAD" }, dispatch);
    await flush();

    expect(reply).toHaveBeenCalledOnce();
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      "hello world",
      expect.any(Function),
      expect.any(Object),
    );
  });
});

// ---------------------------------------------------------------------------
// Full Redux event cycle using registerGET
// ---------------------------------------------------------------------------

describe("full Redux event cycle via registerGET + registerRestMock", () => {
  it("trigger → fetch → reply handler called with mocked body", async () => {
    registerRestMock("GET /api/items/:id", () => ({
      status: 200,
      body: { id: "42", name: "Widget" },
    }));

    const { dispatched, mockReducer, dispatch } = createSetup();
    const reply = vi.fn();

    registerGET<any, any, { id: string; name: string }>(mockReducer as any)({
      name: "loadItem",
      origin: "http://localhost",
      trigger: "ITEM/LOAD",
      url: "/api/items/:id",
      request: (action: any) => ({ id: action.id }),
      reply,
    });

    dispatch({ type: "ITEM/LOAD", id: "42" });
    await flush();

    expect(reply).toHaveBeenCalledOnce();
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      { id: "42", name: "Widget" },
      expect.any(Function),
      expect.any(Object),
    );
  });

  it("reply handler can dispatch a domain action — full action sequence is recorded", async () => {
    registerRestMock("GET /api/items/:id", () => ({
      status: 200,
      body: { id: "7", name: "Sprocket" },
    }));

    const { dispatched, mockReducer, dispatch } = createSetup();

    registerGET<any, any, { id: string; name: string }>(mockReducer as any)({
      name: "loadItem2",
      origin: "http://localhost",
      trigger: "ITEM2/LOAD",
      url: "/api/items/:id",
      request: (action: any) => ({ id: action.id }),
      reply: (_state, item, d) => {
        d({ type: "ITEM2/LOADED", item });
      },
    });

    dispatch({ type: "ITEM2/LOAD", id: "7" });
    await flush();

    const types = dispatched.map((a) => a.type);
    expect(types).toContain("ITEM2/LOAD");
    expect(types).toContain("pi/rest/get/submitted/loadItem2");
    expect(types).toContain("pi/rest/get/result/loadItem2");
    expect(types).toContain("ITEM2/LOADED");

    const loaded = dispatched.find((a) => a.type === "ITEM2/LOADED");
    expect(loaded!.item).toEqual({ id: "7", name: "Sprocket" });
  });

  it("error response → error handler called, reply is NOT called", async () => {
    registerRestMock("GET /api/items/:id", () => ({
      status: 404,
      body: { detail: "not found" },
    }));

    const { dispatched, mockReducer, dispatch } = createSetup();
    const reply = vi.fn();

    registerGET<any, any, any>(mockReducer as any)({
      name: "loadItemErr",
      origin: "http://localhost",
      trigger: "ITEM_ERR/LOAD",
      url: "/api/items/:id",
      request: (action: any) => ({ id: action.id }),
      reply,
      error: (_state, errAction, _req, d) => {
        d({ type: "ITEM_ERR/FAILED", statusCode: errAction.statusCode });
      },
    });

    dispatch({ type: "ITEM_ERR/LOAD", id: "99" });
    await flush();

    expect(reply).not.toHaveBeenCalled();
    const failed = dispatched.find((a) => a.type === "ITEM_ERR/FAILED");
    expect(failed).toBeDefined();
    expect(failed!.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// createOnDispatchPipe + registerGET + registerRestMock
// ---------------------------------------------------------------------------

describe("createOnDispatchPipe + registerGET + registerRestMock", () => {
  it("pipe onReply fires with the mocked REST body, correlated by _replyTo", async () => {
    registerRestMock("GET /api/docs/:id", () => ({
      status: 200,
      body: { id: "abc", content: "Hello" },
    }));

    const { dispatched, mockReducer, dispatch } = createSetup();

    registerGET<any, any, { id: string; content: string }>(mockReducer as any)({
      name: "fetchDoc",
      origin: "http://localhost",
      trigger: "DOC/FETCH",
      url: "/api/docs/:id",
      request: (action: any) => ({ id: action.id }),
      reply: (_state, doc) => ({ type: "DOC/FETCHED", doc }),
    });

    const fetchDocument = createOnDispatchPipe("DOC/FETCH", "DOC/FETCHED");

    let capturedDoc: any;
    fetchDocument(dispatch as any, { id: "abc" }, (_state: any, action: any) => {
      capturedDoc = action.doc;
    });

    await flush();

    expect(capturedDoc).toEqual({ id: "abc", content: "Hello" });

    const fetched = dispatched.find((a) => a.type === "DOC/FETCHED");
    expect(fetched?._replyTo).toBeDefined();
    const trigger = dispatched.find((a) => a.type === "DOC/FETCH");
    expect(fetched._replyTo).toBe(trigger._id);
  });
});

// ---------------------------------------------------------------------------
// clearRestMocks
// ---------------------------------------------------------------------------

describe("clearRestMocks", () => {
  it("removes all registered mocks so subsequent calls hit real fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ real: true }), {
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const mockHandler = vi.fn().mockReturnValue({ status: 200, body: { mock: true } });
    registerRestMock("/api/items", mockHandler);
    clearRestMocks();

    const { handlers, mockReducer, dispatch } = createSetup();
    const reply = vi.fn();
    registerCommon(
      mockReducer as any,
      {
        name: "cm",
        origin: "http://localhost",
        trigger: "CM/LOAD",
        url: "/api/items",
        reply,
      },
      () => [{ method: "GET" }, {}],
      "cm/submitted",
      "cm/result",
      "cm/error",
      "cm/int_error",
    );
    handlers["CM/LOAD"]({}, { type: "CM/LOAD" }, dispatch);
    await flush();

    expect(mockHandler).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      { real: true },
      expect.any(Function),
      expect.any(Object),
    );
  });
});
