/**
 * app.reducer.ts — application-level event handlers
 *
 * This module wires the application's Redux reducers by responding to
 * domain events emitted by meta cards — in this case the `Counter` meta card
 * defined in `counter.card.ts`.
 *
 * `onCounterChanged` is the semantic event helper exported by the Counter meta
 * card. It fires whenever the user increments or decrements the counter,
 * carrying the new numeric value in its payload. Raw button-click details are
 * fully encapsulated inside the meta card and never surface here.
 *
 * The `register()` callback is invoked once during app boot (inside `start()`).
 * Inside it, `onCounterChanged` wires a Redux reducer that updates `state.count`
 * to the value reported by the Counter.
 */

import {register} from "@pihanga2/core";
import type {AppState} from "./app.state";
import {onCounterChanged} from "./counter.card";

register((r) => {
  // Handle the counter updates.
  onCounterChanged<AppState>(r, (state, {value}) => {
    state.count = value;
  });
});
