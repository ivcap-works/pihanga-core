/**
 * Tests for redux.ts — action registration and event-name mapping utilities.
 *
 * These are pure functions with no side-effects on component state so they're
 * easy to exercise directly and their behaviour is very important for the rest
 * of the framework.
 */
import { describe, it, expect } from "vitest";
import { registerActions, actionTypesToEvents } from "./redux";

// ---------------------------------------------------------------------------
// registerActions
// ---------------------------------------------------------------------------

describe("registerActions", () => {
  it("maps each action name to 'namespace/name'", () => {
    const A = registerActions("test/ra/basic", ["create", "delete"]);
    expect(A.CREATE).toBe("test/ra/basic/create");
    expect(A.DELETE).toBe("test/ra/basic/delete");
  });

  it("converts action names to UPPER_CASE keys regardless of input case", () => {
    const A = registerActions("test/ra/case", ["loadItems", "save_record"]);
    expect(A.LOADITEMS).toBe("test/ra/case/loadItems");
    expect(A.SAVE_RECORD).toBe("test/ra/case/save_record");
  });

  it("preserves the original value (including case) in the namespace path", () => {
    const A = registerActions("test/ra/preserve", ["myAction"]);
    // key is uppercased but value keeps the original name
    expect(A.MYACTION).toBe("test/ra/preserve/myAction");
  });

  it("handles a single-item action list", () => {
    const A = registerActions("test/ra/single", ["ping"]);
    expect(A.PING).toBe("test/ra/single/ping");
  });
});

// ---------------------------------------------------------------------------
// actionTypesToEvents
// ---------------------------------------------------------------------------

describe("actionTypesToEvents", () => {
  it("converts a single UPPER_CASE key to an onCamelCase handler name", () => {
    const events = actionTypesToEvents({ CLICK: "ui/click" });
    expect(events.onClick).toBe("ui/click");
  });

  it("converts a multi-word key (ITEM_SELECTED) to onItemSelected", () => {
    const events = actionTypesToEvents({ ITEM_SELECTED: "list/item_selected" });
    expect(events.onItemSelected).toBe("list/item_selected");
  });

  it("handles three-word action types", () => {
    const events = actionTypesToEvents({
      USER_PROFILE_LOADED: "user/profile_loaded",
    });
    expect(events.onUserProfileLoaded).toBe("user/profile_loaded");
  });

  it("preserves the action type value unchanged", () => {
    const actionType = "my-module/some-action";
    const events = actionTypesToEvents({ DO_THING: actionType });
    expect(events.onDoThing).toBe(actionType);
  });

  it("handles multiple entries in one call", () => {
    const events = actionTypesToEvents({
      SUBMIT: "form/submit",
      RESET: "form/reset",
      FIELD_CHANGED: "form/field_changed",
    });
    expect(events.onSubmit).toBe("form/submit");
    expect(events.onReset).toBe("form/reset");
    expect(events.onFieldChanged).toBe("form/field_changed");
  });

  it("returns an empty object for empty input", () => {
    const events = actionTypesToEvents({});
    expect(events).toEqual({});
  });

  it("round-trips with registerActions output", () => {
    // registerActions -> actionTypesToEvents should produce handler-ready keys
    const A = registerActions("test/roundtrip", ["save", "load_data"]);
    const events = actionTypesToEvents(A);
    expect(events.onSave).toBe("test/roundtrip/save");
    expect(events.onLoadData).toBe("test/roundtrip/load_data");
  });
});
