// src/app.state.ts
import type {ReduxState} from "@pihanga2/core";

/**
 * Application state — extends pihanga-core's base Redux state.
 * All state is managed by Immer-powered reducers registered in
 * app.pihanga.ts via the inline `onClicked` handler on each Button card.
 */
export type AppState = ReduxState & {
  /** The current counter value. */
  count: number;
};
