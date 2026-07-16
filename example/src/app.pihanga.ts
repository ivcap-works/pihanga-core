/**
 * app.pihanga.ts — card layout for the counter example
 *
 * Registers the application's card tree. The UI is intentionally minimal:
 *
 *   ┌─────────────────────────────────────────┐
 *   │  [−]   Count: 0   [+]                   │
 *   └─────────────────────────────────────────┘
 *
 * - `registerFramework` installs the root `_window` card that wraps the app
 *   in a ThemeProvider.
 * - `registerCard("page", Counter(...))` places the `Counter` meta card as
 *   the sole page content. `Counter` encapsulates all internal layout and
 *   button wiring; this site only needs to supply the current `value` from
 *   the Redux state via a resolver function `(s) => s.count`.
 * - Domain events emitted by `Counter` (e.g. `COUNTER_ACTION.CHANGED`) are
 *   handled in `app.reducer.ts` — this file has no reducer logic of its own.
 */

import {registerCard, registerFramework} from "@pihanga2/core";
import {SdFramework} from "@pihanga2/shadcn/cards/framework";

import type {AppState} from "./app.state";
import {Counter} from "./counter.card";

export function appPiInit(): void {
  // ── Root framework card ────────────────────────────────────────────────────
  // Registers the single "_window" card that wraps the app in ThemeProvider.
  registerFramework(SdFramework({page: "page", theme: "light"}));

  registerCard(
    "page",
    Counter<AppState>({
      value: (s) => s.count,
    }),
  );
}
