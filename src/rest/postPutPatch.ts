// C1: adopt the same `pi/rest/<verb>/<phase>/<name>` format that GET already uses.
// Previous format was `pi/rest/POST_SUBMITTED:<name>` (uppercase, colon) — inconsistent.
import { PiReducer, ReduxAction, ReduxState } from "../types";
import { registerActions } from "../redux";
import { Bindings, PiRegisterPoPuPaProps, PoPuPaRequest } from "./types";
import { RequestF, registerCommon } from "./utils";

// C1: one registerActions block per verb, mirroring get.ts
const POST_TYPES = registerActions("pi/rest/post", [
  "submitted",
  "result",
  "error",
  "internal_error",
]);
const PUT_TYPES = registerActions("pi/rest/put", [
  "submitted",
  "result",
  "error",
  "internal_error",
]);
const PATCH_TYPES = registerActions("pi/rest/patch", [
  "submitted",
  "result",
  "error",
  "internal_error",
]);

export function registerPOST<S extends ReduxState, A extends ReduxAction, R, C = any>(
  reducer: PiReducer,
): (props: PiRegisterPoPuPaProps<S, A, R>) => void {
  return function (props: PiRegisterPoPuPaProps<S, A, R>) {
    const { name, request } = props;

    const submitType = `${POST_TYPES.SUBMITTED}/${name}`;
    const resultType = `${POST_TYPES.RESULT}/${name}`;
    const errorType = `${POST_TYPES.ERROR}/${name}`;
    const intErrorType = `${POST_TYPES.INTERNAL_ERROR}/${name}`;

    registerCommon(
      reducer,
      props,
      requestF("POST", request),
      submitType,
      resultType,
      errorType,
      intErrorType,
    );
  };
}

export function registerPUT<S extends ReduxState, A extends ReduxAction, R, C = any>(
  reducer: PiReducer,
): (props: PiRegisterPoPuPaProps<S, A, R>) => void {
  return function (props: PiRegisterPoPuPaProps<S, A, R>) {
    const { name, request } = props;

    const submitType = `${PUT_TYPES.SUBMITTED}/${name}`;
    const resultType = `${PUT_TYPES.RESULT}/${name}`;
    const errorType = `${PUT_TYPES.ERROR}/${name}`;
    const intErrorType = `${PUT_TYPES.INTERNAL_ERROR}/${name}`;

    registerCommon(
      reducer,
      props,
      requestF("PUT", request),
      submitType,
      resultType,
      errorType,
      intErrorType,
    );
  };
}

export function registerPATCH<S extends ReduxState, A extends ReduxAction, R, C = any>(
  reducer: PiReducer,
): (props: PiRegisterPoPuPaProps<S, A, R, C>) => void {
  return function (props: PiRegisterPoPuPaProps<S, A, R>) {
    const { name, request } = props;

    const submitType = `${PATCH_TYPES.SUBMITTED}/${name}`;
    const resultType = `${PATCH_TYPES.RESULT}/${name}`;
    const errorType = `${PATCH_TYPES.ERROR}/${name}`;
    const intErrorType = `${PATCH_TYPES.INTERNAL_ERROR}/${name}`;

    registerCommon(
      reducer,
      props,
      requestF("PATCH", request),
      submitType,
      resultType,
      errorType,
      intErrorType,
    );
  };
}

function requestF<S extends ReduxState, A extends ReduxAction>(
  method: string,
  request: (action: A, state: S) => PoPuPaRequest,
): RequestF<S, A> {
  return (state: S, action: A): [RequestInit, Bindings] => {
    const r = request(action, state);
    let ct = r.contentType;
    const headers = {} as { [k: string]: any };
    let body = r.body;
    if (body) {
      // B4: content-type is only required when a body is present; a body-less
      // POST/PUT/PATCH is perfectly valid (e.g. trigger-only endpoints).
      if (!ct) {
        if (typeof body === "object") {
          ct = "application/json";
        } else if (typeof body === "string") {
          ct = "text/plain";
        } else {
          throw Error("Cannot determine 'contentType'");
        }
      }
      headers["Content-Type"] = ct;
      if (ct === "application/json") {
        body = JSON.stringify(body);
      }
    }
    // No body → content-type is not required; omit the dead second !ct check.

    const reqInit = {
      method,
      body,
      headers,
    };
    return [reqInit, r.bindings || {}];
  };
}
