import { RestContentType } from "..";
import { registerActions } from "../redux";
import { DispatchF, ReduxAction, ReduxState } from "../types";

export const Domain = "pi/rest";
/**
 * @deprecated C1: POST/PUT/PATCH/DELETE entries (e.g. `POST_SUBMITTED`) no longer
 * match the action types actually dispatched by `registerPOST` etc.  The new
 * uniform scheme is `pi/rest/<verb>/<phase>/<name>` (lowercase, slash-separated),
 * consistent with how GET has always worked.  These legacy keys will be removed
 * in the next major version.  Error/permission entries are still valid.
 */
export const ACTION_TYPES = registerActions(Domain, [
  // GET — managed by get.ts with its own registerActions("pi/rest/get", ...)
  // "GET_SUBMITTED",
  // "GET_RESULT",
  // "GET_ERROR",
  // "GET_INTERNAL_ERROR",
  // "GET_PERIODIC_TICK",

  // DEPRECATED — dispatched types are now "pi/rest/post/submitted/<name>" etc.
  "POST_SUBMITTED",
  "POST_RESULT",
  "POST_ERROR",
  "POST_INTERNAL_ERROR",
  "PUT_SUBMITTED",
  "PUT_RESULT",
  "PUT_ERROR",
  "PUT_INTERNAL_ERROR",
  "PATCH_SUBMITTED",
  "PATCH_RESULT",
  "PATCH_ERROR",
  "PATCH_INTERNAL_ERROR",
  "DELETE_SUBMITTED",
  "DELETE_RESULT",
  "DELETE_ERROR",
  "DELETE_INTERNAL_ERROR",

  // Still active — used for error classification actions
  "UNAUTHORISED_ERROR",
  "PERMISSION_DENIED_ERROR",
  "NOT_FOUND_ERROR",
  "ERROR",
  "CONTEXT_ERROR",
]);

export type Bindings = { [key: string]: string | number | undefined };
export type PoPuPaRequest = {
  body: any;
  contentType?: string; // if not set and body is 'object' then we send it as jsonconst h = {}
  bindings?: Bindings;
};

export type RegisterGenericProps<
  S extends ReduxState,
  A extends ReduxAction,
  R,
  C = any,
> = {
  name: string;
  origin?: string | ((action: A, state: S, context: C) => string | URL); // if defined, will be prepended to 'url' (URL(window.location.href).origin)
  url: string;
  trigger: string;
  context?: (action: A, state: S) => Promise<C> | null;
  guard?: (action: A, state: S, dispatcher: DispatchF, context: C) => boolean;
  headers?: (action: A, state: S, context: C) => { [key: string]: string };
  reply: (state: S, reply: R, dispatcher: DispatchF, result: ResultAction<A>) => void;
  error?: (state: S, error: ErrorAction<A>, requestAction: A, dispatch: DispatchF) => S;
};

export type PiRegisterGetProps<
  S extends ReduxState,
  A extends ReduxAction,
  R,
  C = any,
> = RegisterGenericProps<S, A, R, C> & {
  request?: (action: A, state: S) => Bindings;
};

export type PiRegisterPoPuPaProps<
  S extends ReduxState,
  A extends ReduxAction,
  R,
  C = any,
> = RegisterGenericProps<S, A, R, C> & {
  request: (action: A, state: S) => PoPuPaRequest;
};

export type PiRegisterDeleteProps<
  S extends ReduxState,
  A extends ReduxAction,
  R,
  C = any,
> = RegisterGenericProps<S, A, R, C> & {
  request?: (action: A, state: S) => Bindings;
};

export type HttpResponse = {
  statusCode: number;
  // B8: was typed as {[k: string]: any} but the runtime value was a non-serialisable
  // WHATWG Headers instance (causing RTK serializable-check warnings). Now converted
  // to a plain string-keyed object at fetch time — serialisable without extra config.
  headers: { [k: string]: string };
  content: any;
  contentType: RestContentType;
  mimeType: string;
  size: number;
};

export type SubmitAction = ReduxAction & {
  requestID: string;
  url: string;
  bindings: Bindings;
};

export enum ErrorKind {
  Unauthorised = "Unauthorised",
  PermissionDenied = "PermissionDenied",
  NotFound = "NotFound",
  Other = "Other",
}

export type ResultAction<R> = ReduxAction & {
  queryID: string;
  url: string;
  request: R;
} & HttpResponse;

export type ErrorAction<R> = ReduxAction & {
  requestID: string;
  error: ErrorKind;
  url: string;
  request: R;
} & HttpResponse;

export type ContextErrorAction = ReduxAction & {
  error: string;
  pendingAction: ReduxAction;
};
