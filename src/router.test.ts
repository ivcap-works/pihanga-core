/**
 * Tests for router.ts — action creators and the showPage helper.
 *
 * These tests cover the pure, side-effect-free parts of the router:
 *   - createShowPageAction  — builds a typed Redux action from a path + query
 *   - showPage              — thin wrapper that calls dispatch with that action
 *
 * The browser-history integration (init, browserHistory.listen, etc.) is not
 * tested here because it requires a real or simulated browser navigation API.
 */
import { describe, it, expect, vi } from "vitest";
// router.ts has `import { PiRegister } from "."` (a type-only symbol used as a
// value import), which creates a circular dependency:
//   router.ts → index.ts → router.ts
// When vitest evaluates router.ts, index.ts hasn't finished loading yet, so
// registerActions is still undefined.  Mocking the index module to an empty
// object breaks the cycle without affecting the pure functions under test.
vi.mock("./index", () => ({}));

import { createShowPageAction, showPage, _routeFunctions } from "./router";

// The action type string is produced by registerActions("pi/router", ["show_page"])
// so the expected value is deterministic.
const SHOW_PAGE_TYPE = "pi/router/show_page";

// ---------------------------------------------------------------------------
// createShowPageAction
// ---------------------------------------------------------------------------

describe("createShowPageAction", () => {
  it("sets the action type to pi/router/show_page", () => {
    const action = createShowPageAction(["home"]);
    expect(action.type).toBe(SHOW_PAGE_TYPE);
  });

  it("always sets fromBrowser to false", () => {
    expect(createShowPageAction([]).fromBrowser).toBe(false);
    expect(createShowPageAction(["a", "b"]).fromBrowser).toBe(false);
  });

  it("includes the path array unchanged", () => {
    const action = createShowPageAction(["users", "42", "profile"]);
    expect(action.path).toEqual(["users", "42", "profile"]);
  });

  it("includes query when provided", () => {
    const action = createShowPageAction(["search"], { q: "hello", page: 2 });
    expect(action.query).toEqual({ q: "hello", page: 2 });
  });

  it("leaves query undefined when omitted", () => {
    const action = createShowPageAction(["home"]);
    expect(action.query).toBeUndefined();
  });

  it("handles an empty path array", () => {
    const action = createShowPageAction([]);
    expect(action.path).toEqual([]);
    expect(action.type).toBe(SHOW_PAGE_TYPE);
  });

  it("handles deeply nested paths", () => {
    const path = ["a", "b", "c", "d", "e"];
    expect(createShowPageAction(path).path).toEqual(path);
  });

  it("handles boolean and numeric query values", () => {
    const action = createShowPageAction(["report"], {
      verbose: true,
      limit: 50,
    });
    expect(action.query).toEqual({ verbose: true, limit: 50 });
  });

  it("produces a new object each call (no shared reference)", () => {
    const a1 = createShowPageAction(["x"]);
    const a2 = createShowPageAction(["x"]);
    expect(a1).not.toBe(a2);
  });
});

// ---------------------------------------------------------------------------
// showPage
// ---------------------------------------------------------------------------

describe("showPage", () => {
  it("calls dispatch exactly once", () => {
    const dispatch = vi.fn();
    showPage(dispatch, ["home"]);
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it("passes an action with the correct type to dispatch", () => {
    const dispatch = vi.fn();
    showPage(dispatch, ["dashboard"]);
    expect(dispatch.mock.calls[0][0].type).toBe(SHOW_PAGE_TYPE);
  });

  it("passes the path through to the action", () => {
    const dispatch = vi.fn();
    showPage(dispatch, ["items", "99"]);
    expect(dispatch.mock.calls[0][0].path).toEqual(["items", "99"]);
  });

  it("passes the query through to the action when provided", () => {
    const dispatch = vi.fn();
    showPage(dispatch, ["search"], { filter: "active" });
    expect(dispatch.mock.calls[0][0].query).toEqual({ filter: "active" });
  });

  it("sets fromBrowser to false on the dispatched action", () => {
    const dispatch = vi.fn();
    showPage(dispatch, ["home"]);
    expect(dispatch.mock.calls[0][0].fromBrowser).toBe(false);
  });

  it("returns whatever value dispatch returns", () => {
    const dispatch = vi.fn(() => "dispatched-id-42");
    const result = showPage(dispatch, ["home"]);
    expect(result).toBe("dispatched-id-42");
  });

  it("works with an empty path", () => {
    const dispatch = vi.fn();
    showPage(dispatch, []);
    expect(dispatch.mock.calls[0][0].path).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// _routeFunctions — query-param mode (routeQueryParam = "p")
// ---------------------------------------------------------------------------

describe("_routeFunctions — query-param mode", () => {
  const { url2route, pathl2route } = _routeFunctions("", "p");

  describe("url2route", () => {
    it("parses /?p=foo/bar into path ['foo','bar']", () => {
      const r = url2route("/?p=foo/bar");
      expect(r.path).toEqual(["foo", "bar"]);
    });

    it("strips the route param from query", () => {
      const r = url2route("/?p=foo/bar");
      expect(r.query).not.toHaveProperty("p");
    });

    it("preserves other query params", () => {
      const r = url2route("/?p=items/42&filter=active");
      expect(r.path).toEqual(["items", "42"]);
      expect(r.query).toEqual({ filter: "active" });
    });

    it("returns empty path for / (no p param)", () => {
      const r = url2route("/");
      expect(r.path).toEqual([]);
    });

    it("returns empty path for /?p= (empty value)", () => {
      // Empty value is parsed as boolean true — treated as no path
      const r = url2route("/?p=");
      expect(r.path).toEqual([]);
    });

    it("produces a canonical url /?p=foo/bar", () => {
      const r = url2route("/?p=foo/bar");
      expect(r.url).toBe("/?p=foo/bar");
    });

    it("produces / for empty path", () => {
      const r = url2route("/");
      expect(r.url).toBe("/");
    });
  });

  describe("pathl2route", () => {
    it("serialises path as ?p= query param", () => {
      const r = pathl2route(["items", "42"], {});
      expect(r.url).toBe("/?p=items/42");
    });

    it("appends extra query params after the route param", () => {
      const r = pathl2route(["search"], { q: "hello" });
      expect(r.url).toBe("/?p=search&q=hello");
    });

    it("returns / for empty path with no query", () => {
      const r = pathl2route([], {});
      expect(r.url).toBe("/");
    });

    it("keeps path and query on the returned route", () => {
      const r = pathl2route(["a", "b"], { x: "1" });
      expect(r.path).toEqual(["a", "b"]);
      expect(r.query).toEqual({ x: "1" });
    });

    it("round-trips: url2route(pathl2route(...).url) === original", () => {
      const original = pathl2route(["users", "99"], { tab: "profile" });
      const roundtripped = url2route(original.url);
      expect(roundtripped.path).toEqual(["users", "99"]);
      expect(roundtripped.query).toEqual({ tab: "profile" });
    });
  });
});

// ---------------------------------------------------------------------------
// _routeFunctions — path mode (no routeQueryParam) — regression guard
// ---------------------------------------------------------------------------

describe("_routeFunctions — path mode", () => {
  const { url2route, pathl2route } = _routeFunctions();

  it("parses /items/42 into path ['items','42']", () => {
    expect(url2route("/items/42").path).toEqual(["items", "42"]);
  });

  it("serialises ['items','42'] to /items/42", () => {
    expect(pathl2route(["items", "42"], {}).url).toBe("/items/42");
  });

  it("includes query string in url", () => {
    expect(pathl2route(["search"], { q: "hi" }).url).toBe("/search?q=hi");
  });
});
