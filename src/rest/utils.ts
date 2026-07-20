import { current } from "immer";
import { DispatchF, PiReducer, ReduxAction, ReduxState, ReplyAction } from "../types";
import {
  ACTION_TYPES,
  Bindings,
  ContextErrorAction,
  ErrorAction,
  ErrorKind,
  HttpResponse,
  RegisterGenericProps,
  ResultAction,
} from "./types";
import { RestContentType } from "./enums";

export function parseResponse(
  response: Response,
): Promise<[any, RestContentType, string, Response]> {
  const mimeType = response.headers.get("content-type");
  if (mimeType) {
    // B2: strip parameters (e.g. "; charset=utf-8") before matching so that
    // "application/json; charset=utf-8" is correctly parsed as JSON.
    const baseMime = mimeType.split(";")[0].trim();
    switch (baseMime) {
      case "application/json":
        return response
          .json()
          .then((j) => [j, RestContentType.Object, mimeType, response]);
      case "application/jose":
        return response.text().then((t) => [t, RestContentType.Text, mimeType, response]);
      default:
        if (baseMime.startsWith("text")) {
          return response
            .text()
            .then((t) => [t, RestContentType.Text, mimeType, response]);
        }
    }
  }
  return response
    .blob()
    .then((t) => [t, RestContentType.Blob, mimeType || "unknown", response]);
}

export function createErrorAction<R>(
  type: string,
  resp: HttpResponse,
  name: string,
  url: URL,
  request: R,
): ErrorAction<R> {
  let error: ErrorKind;
  const status = resp.statusCode;
  if (status === 401) {
    error = ErrorKind.Unauthorised;
  } else if (status === 403) {
    error = ErrorKind.PermissionDenied;
  } else if (status === 404) {
    error = ErrorKind.NotFound;
  } else {
    error = ErrorKind.Other;
  }
  return {
    type,
    requestID: name,
    error,
    url: url.toString(),
    request,
    ...resp,
  };
}

export type RequestF<S extends ReduxState, A extends ReduxAction> = (
  state: S,
  action: A,
) => [RequestInit, Bindings];

export function registerCommon<S extends ReduxState, A extends ReduxAction, R, C = any>(
  reducer: PiReducer,
  props: RegisterGenericProps<S, A, R, C>,
  requestF: RequestF<S, A>,
  submitType: string,
  resultType: string,
  errorType: string,
  intErrorType: string,
) {
  const {
    name,
    origin = window.location.href,
    url,
    trigger,
    context,
    guard,
    headers,
    reply,
    error,
  } = props;

  if (!name) {
    throw Error('Missing "name"');
  }
  if (!url) {
    throw Error('Missing "url"');
  }
  if (!trigger) {
    throw Error('Missing "trigger"');
  }
  if (!reply) {
    throw Error('Missing "reply"');
  }

  reducer.register<S, A>(trigger, (state: S, action: A, dispatch: DispatchF) => {
    const ctxtP = context ? context(action, state) : null;
    if (ctxtP) {
      const s = current(state); // need current state as we are going throuygh a promise
      ctxtP
        .then((ctxt) => handleEvent(s, action, dispatch, ctxt))
        .catch((err) => {
          const a: ContextErrorAction = {
            type: ACTION_TYPES.CONTEXT_ERROR,
            error: err.toString(),
            pendingAction: action,
          };
          dispatch(a);
        });
    } else {
      // we should remove state as argument
      handleEvent(state, action, dispatch, {} as any);
    }
    return state;
  });

  function handleEvent(state: S, action: A, dispatch: DispatchF, ctxt: C) {
    if (guard) {
      if (!guard(action, state, dispatch, ctxt)) {
        return state;
      }
    }
    let bindings: Bindings = {};
    let request: RequestInit;
    let url2: URL;
    try {
      [request, bindings] = requestF(state, action);
      if (headers) {
        const h = headers(action, state, ctxt);
        request.headers = request.headers ? { ...request.headers, ...h } : h;
      }
      let o: string;
      if (typeof origin === "function") {
        const ox = origin(action, state, ctxt);
        o = ox instanceof URL ? ox.toString() : ox;
      } else {
        o = origin;
      }
      url2 = buildURL(url, o, bindings);
    } catch (e: any) {
      dispatch({
        type: intErrorType,
        error: e?.message,
        call: name,
        action,
        bindings,
      });
      return state;
    }

    dispatch({
      type: submitType,
      requestID: name,
      url: url2.toString(),
      bindings,
    });
    _fetch(url2, request)
      .then((resp) => {
        if (resp.statusCode < 300) {
          const a: ResultAction<A> = {
            type: resultType,
            queryID: name,
            ...resp,
            url: url2.toString(),
            request: action,
          };
          dispatch(a);
        } else {
          const a = createErrorAction(errorType, resp, name, url2, action);
          dispatch(a);
        }
      })
      // B3: network-level failures (DNS, CORS, offline) must dispatch an action
      // so that error handlers and UI spinners are notified instead of hanging.
      .catch((fetchError: unknown) => {
        dispatch({
          type: intErrorType,
          error: fetchError instanceof Error ? fetchError.message : String(fetchError),
          call: name,
          action,
        });
      });
  }

  reducer.register<S, ResultAction<A>>(resultType, (state, ra, dispatch) => {
    const replyAction = reply(state, ra.content, dispatch, ra);
    if (replyAction) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (typeof (replyAction as any).type !== "string") {
        console.warn(
          `[pihanga] REST reply handler '${name}' returned a non-action value — expected ReduxAction | void. Return value ignored.`,
          ra,
        );
      } else {
        const a = (replyAction as ReplyAction)._replyTo
          ? replyAction
          : { ...replyAction, _replyTo: ra.request._id };
        dispatch(a);
      }
    }
  });

  if (error) {
    reducer.register<S, ErrorAction<A>>(errorType, (state, action, dispatch) => {
      const replyAction = error(state, action, action.request, dispatch);
      if (replyAction) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (typeof (replyAction as any).type !== "string") {
          console.warn(
            `[pihanga] REST error handler '${name}' returned a non-action value — expected ReduxAction | void. Return value ignored.`,
            action.request,
          );
        } else {
          const a =
            (replyAction as ReplyAction)._replyTo || !action.request._id
              ? replyAction
              : { ...replyAction, _replyTo: action.request._id };
          dispatch(a);
        }
      }
    });
  }
}

function buildURL(url: string, origin: string, bindings: Bindings): URL {
  const u = new URL(url, origin);
  u.pathname = u.pathname
    .split("/")
    .map((p) => {
      return resolveBinding(p, bindings, encodeURIComponent);
    })
    .join("/");
  if (u.search !== "") {
    const params = new URLSearchParams();
    u.searchParams.forEach((v, k) => {
      const v2 = resolveBinding(v, bindings);
      if (v2) {
        params.set(k, v2);
      }
    });
    u.search = "?" + params.toString();
  }
  return u;
}

function resolveBinding(
  value: string,
  bindings: Bindings,
  encoder: ((v: string) => string) | undefined = undefined,
): string | undefined {
  const first = value[0];
  if (first === ":" || first === "?") {
    const k = value.slice(1);
    let v = bindings[k];
    if (v === undefined) {
      if (first === "?") {
        return undefined;
      } else {
        throw new Error(`Missing binding '${k}'.`);
      }
    }
    if (typeof v !== "string") {
      v = `${v}`;
    }
    return encoder ? encoder(v) : v;
  } else {
    return value;
  }
}

function _fetch(url: URL, request: RequestInit): Promise<HttpResponse> {
  return fetch(url, request)
    .then(parseResponse)
    .then(([content, contentType, mimeType, response]) => {
      return {
        statusCode: response.status,
        content,
        contentType,
        mimeType,
        size: getSize(response),
        // B8: convert to a plain object so the action is serialisable;
        // previously stored the WHATWG Headers instance directly.
        headers: Object.fromEntries(response.headers.entries()),
      };
    });
}

function getSize(response: Response): number {
  const s = response.headers.get("Content-Length");
  if (!s) {
    return -1;
  }
  return Number(s);
}
