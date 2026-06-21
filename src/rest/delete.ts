import { PiReducer, ReduxAction, ReduxState } from "../types"
import { registerCommon } from "./utils"
import { Bindings, ACTION_TYPES, PiRegisterDeleteProps } from "./types"

export function registerDELETE<S extends ReduxState, A extends ReduxAction, R, C = any>(
  reducer: PiReducer,
): (props: PiRegisterDeleteProps<S, A, R, C>) => void {
  return function (props: PiRegisterDeleteProps<S, A, R>) {
    _registerDELETE(props, reducer)
  }
}

function _registerDELETE<S extends ReduxState, A extends ReduxAction, R, C = any>(
  props: PiRegisterDeleteProps<S, A, R, C>,
  reducer: PiReducer,
) {
  const { name, request } = props

  const submitType = `${ACTION_TYPES.DELETE_SUBMITTED}:${name}`
  const resultType = `${ACTION_TYPES.DELETE_RESULT}:${name}`
  const errorType = `${ACTION_TYPES.DELETE_ERROR}:${name}`
  const intErrorType = `${ACTION_TYPES.DELETE_INTERNAL_ERROR}:${name}`

  function requestF(state: S, action: A): [RequestInit, Bindings] {
    const bindings = request ? request(action, state) : {}
    const reqInit = {
      method: "DELETE",
    }
    return [reqInit, bindings]
  }

  registerCommon(
    reducer,
    props,
    requestF,
    submitType,
    resultType,
    errorType,
    intErrorType,
  )
}
