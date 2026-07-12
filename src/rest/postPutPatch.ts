import {PiReducer, ReduxAction, ReduxState} from "../types";
import {
  ACTION_TYPES,
  Bindings,
  PiRegisterPoPuPaProps,
  PoPuPaRequest,
} from "./types";
import {RequestF, registerCommon} from "./utils";

export function registerPOST<
  S extends ReduxState,
  A extends ReduxAction,
  R,
  C = any,
>(reducer: PiReducer): (props: PiRegisterPoPuPaProps<S, A, R>) => void {
  return function (props: PiRegisterPoPuPaProps<S, A, R>) {
    const {name, request} = props;

    const submitType = `${ACTION_TYPES.POST_SUBMITTED}:${name}`;
    const resultType = `${ACTION_TYPES.POST_RESULT}:${name}`;
    const errorType = `${ACTION_TYPES.POST_ERROR}:${name}`;
    const intErrorType = `${ACTION_TYPES.POST_INTERNAL_ERROR}:${name}`;

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

export function registerPUT<
  S extends ReduxState,
  A extends ReduxAction,
  R,
  C = any,
>(reducer: PiReducer): (props: PiRegisterPoPuPaProps<S, A, R>) => void {
  return function (props: PiRegisterPoPuPaProps<S, A, R>) {
    const {name, request} = props;

    const submitType = `${ACTION_TYPES.PUT_SUBMITTED}:${name}`;
    const resultType = `${ACTION_TYPES.PUT_RESULT}:${name}`;
    const errorType = `${ACTION_TYPES.PUT_ERROR}:${name}`;
    const intErrorType = `${ACTION_TYPES.PUT_INTERNAL_ERROR}:${name}`;

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

export function registerPATCH<
  S extends ReduxState,
  A extends ReduxAction,
  R,
  C = any,
>(reducer: PiReducer): (props: PiRegisterPoPuPaProps<S, A, R, C>) => void {
  return function (props: PiRegisterPoPuPaProps<S, A, R>) {
    const {name, request} = props;

    const submitType = `${ACTION_TYPES.PATCH_SUBMITTED}:${name}`;
    const resultType = `${ACTION_TYPES.PATCH_RESULT}:${name}`;
    const errorType = `${ACTION_TYPES.PATCH_ERROR}:${name}`;
    const intErrorType = `${ACTION_TYPES.PATCH_INTERNAL_ERROR}:${name}`;

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
    const headers = {} as {[k: string]: any};
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
