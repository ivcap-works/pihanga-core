import { PiReducer, ReduxAction, ReduxState } from "../types"
import { registerCommon } from "./utils"
import { Bindings, Domain, PiRegisterGetProps } from "./types"
import { registerActions } from "../redux"

export const ACTION_TYPES = registerActions(`${Domain}/get`, [
  "submitted",
  "result",
  "error",
  "internal_error",
  // "PERIODIC_TICK",
])

export function registerGET<S extends ReduxState, A extends ReduxAction, R, C = any>(
  reducer: PiReducer,
): (props: PiRegisterGetProps<S, A, R, C>) => void {
  return function (props: PiRegisterGetProps<S, A, R, C>) {
    _registerGET(props, reducer)
  }
}

function _registerGET<S extends ReduxState, A extends ReduxAction, R, C = any>(
  props: PiRegisterGetProps<S, A, R, C>,
  reducer: PiReducer,
) {
  const { name, request } = props

  const submitType = `${ACTION_TYPES.SUBMITTED}/${name}`
  const resultType = `${ACTION_TYPES.RESULT}/${name}`
  const errorType = `${ACTION_TYPES.ERROR}/${name}`
  const intErrorType = `${ACTION_TYPES.INTERNAL_ERROR}/${name}`

  function requestF(state: S, action: A): [RequestInit, Bindings] {
    const bindings = request ? request(action, state) : {}
    const reqInit = {
      method: "GET",
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
