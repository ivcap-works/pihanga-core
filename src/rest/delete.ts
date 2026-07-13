// C1: adopt the same `pi/rest/<verb>/<phase>/<name>` format that GET already uses.
import { PiReducer, ReduxAction, ReduxState } from "../types";
import { registerActions } from "../redux";
import { registerCommon } from "./utils";
import { Bindings, PiRegisterDeleteProps } from "./types";

const DELETE_TYPES = registerActions("pi/rest/delete", [
  "submitted",
  "result",
  "error",
  "internal_error",
]);

export function registerDELETE<S extends ReduxState, A extends ReduxAction, R, C = any>(
  reducer: PiReducer,
): (props: PiRegisterDeleteProps<S, A, R, C>) => void {
  return function (props: PiRegisterDeleteProps<S, A, R>) {
    _registerDELETE(props, reducer);
  };
}

function _registerDELETE<S extends ReduxState, A extends ReduxAction, R, C = any>(
  props: PiRegisterDeleteProps<S, A, R, C>,
  reducer: PiReducer,
) {
  const { name, request } = props;

  const submitType = `${DELETE_TYPES.SUBMITTED}/${name}`;
  const resultType = `${DELETE_TYPES.RESULT}/${name}`;
  const errorType = `${DELETE_TYPES.ERROR}/${name}`;
  const intErrorType = `${DELETE_TYPES.INTERNAL_ERROR}/${name}`;

  function requestF(state: S, action: A): [RequestInit, Bindings] {
    const bindings = request ? request(action, state) : {};
    const reqInit = {
      method: "DELETE",
    };
    return [reqInit, bindings];
  }

  registerCommon(
    reducer,
    props,
    requestF,
    submitType,
    resultType,
    errorType,
    intErrorType,
  );
}
