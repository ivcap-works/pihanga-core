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

import { createShowPageAction, showPage } from "./router";

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
