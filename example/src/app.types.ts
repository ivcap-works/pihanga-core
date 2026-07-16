// src/app.types.ts — app-wide type definitions
import type {ReduxAction, ReplyAction} from "@pihanga2/core";

/**
 * Standard error envelope — attach to any async action that can fail.
 */
export type ErrorEvent = {
  message: string;
  source: string;
  cause: unknown;
  requestAction: ReduxAction;
};

export type ErrorAction = ReplyAction & ErrorEvent;
