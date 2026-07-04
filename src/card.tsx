import React, {useEffect, useId} from "react";
import {useDispatch, useSelector, useStore} from "react-redux";
import equal from "deep-equal";

import {getLogger} from "./logger";
import {
  CSSModuleClasses,
  CardProp,
  PiCardDef,
  PiReducer,
  PiRegisterComponent,
  PiRegisterReducerF,
  ReduceF,
  ReduxAction,
  ReduxState,
  StateMapper,
  StateMapperContext,
} from "./types";
import {Action, AnyAction, Dispatch} from "@reduxjs/toolkit";
import {
  _createCardMapping,
  _updateCardMapping,
  _registerCard,
  cardMappings,
  cardTypes,
  dispatch2registerReducer,
  framework,
  CardMapping,
} from "./register_cards";

const logger = getLogger("card");

// export type CardProp = {
//   cardName: PiCardRef
// } & { [k: string]: any }

type CompProps = {[k: string]: any};
type CardInfo = {
  mapping: CardMapping;
  cardType: PiRegisterComponent;
};

/**
 * Stores the raw `CardProp` (i.e. `ctxtProps`) that was passed to the top-level
 * card of each active metacard instance.  Written synchronously during render so
 * sub-cards can read it in the same render cycle.  Cleaned up on unmount via a
 * `useEffect` destructor in `GenericCard`.
 */
const metaCardCtxtPropsStore: {[topCardName: string]: CardProp} = {};

export function Card(props: CardProp): JSX.Element {
  let cardName: string;

  const [id, _] = React.useState<number>(Math.floor(Math.random() * 10000));
  const dispatch = useDispatch(); // never change the order of hooks called

  if (typeof props.cardName === "string") {
    cardName = props.cardName;
  } else {
    // lets fix it
    cardName = checkForAnonymousCard(props, id, dispatch);
  }
  if (cardName === "") {
    logger.error("card name is not of type string", props.cardName);
    return ErrorCard(
      <div>Unknown type of cardName '{`${props.cardName}`}'</div>,
    );
  }

  const [info, errCard] = getCardInfo(cardName);
  if (errCard) {
    return ErrorCard(errCard);
  }
  if (!info) {
    throw new Error("info is empty, should never happen");
  }
  return GenericCard(cardName, props, info, id);
}

export function usePiReducer<S extends ReduxState, A extends ReduxAction>(
  eventType: string,
  mapper: ReduceF<S, A>, // (state: S, action: A, dispatch: DispatchF) => S,
  cardName: string,
) {
  const store = useStore();
  let key: string;
  if (cardName !== "") {
    key = `inside card '${cardName}'`;
  } else {
    key = useId();
  }
  useEffect(() => {
    const r = (store as any).piReducer as PiReducer;
    return r.register(eventType, mapper, 0, key);
  });
}

function checkForAnonymousCard(
  props: any,
  id: number,
  dispatch: Dispatch<AnyAction>,
): string {
  const cardType = props.cardName?.cardType;
  if (!cardType) {
    return ""; // not sure what that is
  }
  // looks like a potentially unregistered card
  let cardName: string;
  if (props.parentCard) {
    cardName = `${props.parentCard}/${cardType.split("/").pop()}`;
  } else {
    cardName = cardType;
  }
  if (props.cardKey) {
    cardName = `${cardName}#${props.cardKey}-${id}`;
  } else {
    cardName = `${cardName}#${id}`;
  }

  const mapping = cardMappings[cardName];
  const parameters = props.cardName as PiCardDef;
  const el = dispatch2registerReducer.find(([d, _]) => d === dispatch);
  if (!el) {
    logger.warn("unexpected missing mapping between dispatcher and reducerF");
    return "";
  }
  const regRed = el[1];
  if (mapping) {
    // looks like we already processed it
    // do update props if parameters have changed
    if (mapping.parameters !== parameters) {
      _updateCardMapping(cardName, parameters, regRed, mapping);
    }
  } else {
    _registerCard(cardName, parameters, regRed);
  }
  return cardName;
}

function GenericCard(
  cardName: string,
  props: CardProp,
  info: CardInfo,
  id: number,
) {
  // If this is the top card of a metacard, store its ctxtProps synchronously so
  // sub-cards rendered in the same cycle can read metaCtxtProps from the store.
  if (info.mapping.metaCard?.topCard === cardName) {
    metaCardCtxtPropsStore[cardName] = props;
  }

  // Clean up the store entry when this card unmounts.
  useEffect(() => {
    return () => {
      delete metaCardCtxtPropsStore[cardName];
    };
  }, [cardName]);

  const cardProps = useSelector<ReduxState, CompProps>(
    (s) => getCardProps(cardName, s, props),
    propEq,
  );
  const dispatch = useDispatch();
  const store = useStore();
  const piReducer = (store as any).piReducer as PiReducer | undefined;
  const dispatchWithId = (a: AnyAction) =>
    piReducer ? piReducer.dispatch(a as any) : dispatch(a);

  // Build an enriched ctxtProps for event mappers that includes a resolve function.
  // For sub-cards of a metacard, resolve substitutes metaCtxtProps as ctxtProps so
  // state mappers authored at the metacard level see the correct context.
  const eventMapperMetaCtxtProps =
    info.mapping.metaCard && info.mapping.metaCard.topCard !== cardName
      ? metaCardCtxtPropsStore[info.mapping.metaCard.topCard]
      : undefined;
  const eventMapperResolve = (prop: any): any => {
    if (typeof prop !== "function") return prop;
    const currentState = (store as any).getState();
    const ctx = {
      cardName,
      cardKey: props.cardKey,
      ctxtProps: eventMapperMetaCtxtProps ?? props,
      metaCtxtProps: eventMapperMetaCtxtProps,
      resolve: eventMapperResolve, // self-reference for nested resolves
    };
    return prop(currentState, ctx);
  };
  const ctxtPropsForEventMapper = {...props, resolve: eventMapperResolve};

  const extCardProps = appendEventHandlers(
    info,
    cardProps,
    cardName,
    ctxtPropsForEventMapper,
    dispatchWithId,
  );
  extCardProps._cls = cls_f(cardName, info.mapping.cardType);
  return React.createElement(
    info.cardType.component,
    extCardProps,
    props.children,
  );
}

const EmptyCompProps = {} as CompProps;

function ErrorCard(el: JSX.Element) {
  // Note: call the EXACT same hooks as 'GenericCard'
  useSelector<ReduxState, CompProps>(
    (s) => EmptyCompProps,
    (a, b) => false,
  );
  useDispatch();
  useEffect(() => {}, []); // match GenericCard's useEffect (hook count parity)
  return el;
}

function getCardInfo(cardName: string): [CardInfo?, JSX.Element?] {
  const mapping = cardMappings[cardName];
  if (!mapping) {
    return [undefined, renderUnknownCard(cardName)];
  }
  let cardType = cardTypes[mapping.cardType];
  if (!cardType) {
    if (framework) {
      cardType = cardTypes[`${framework}/${mapping.cardType}`];
    }
    if (!cardType) {
      return [undefined, renderUnknownCardType(mapping.cardType)];
    }
  }
  const info = {mapping, cardType};
  return [info, undefined];
}

function getCardProps(
  cardName: string,
  state: ReduxState,
  props: CardProp,
): CompProps {
  const mapping = cardMappings[cardName];
  // fetch all the usage specific props in 'rest' and pass them down
  const {cardName: _n, cardKey, parentCard: _p, children: _c, ...rest} = props;
  // For sub-cards of a metacard, surface the top card's ctxtProps as metaCtxtProps
  // so state mappers can access the context from where the metacard was placed.
  const metaCtxtProps =
    mapping.metaCard && mapping.metaCard.topCard !== cardName
      ? metaCardCtxtPropsStore[mapping.metaCard.topCard]
      : undefined;
  const ctxt: StateMapperContext<unknown> = {
    cardName,
    cardKey,
    ctxtProps: props,
    metaCtxtProps,
    // When resolving a state-mapper prop for a sub-card of a metacard, the
    // mapper was authored expecting the *metacard's* ctxtProps (e.g. elementData).
    // We therefore substitute metaCtxtProps as ctxtProps when calling the mapper,
    // while still exposing the sub-card's own ctxtProps via ctxt.ctxtProps.
    resolve: (prop: any) => {
      if (typeof prop !== "function") return prop;
      const resolveCtxt =
        metaCtxtProps != null ? {...ctxt, ctxtProps: metaCtxtProps} : ctxt;
      return prop(state, resolveCtxt);
    },
  };
  const init: CompProps = {
    cardName,
    cardKey,
    ...rest,
  };
  const cprops = Object.entries(mapping.props).reduce((p, [key, vf]) => {
    let v = vf;
    if (typeof vf === "function") {
      const f = vf as StateMapper<unknown, ReduxState, any>;
      try {
        v = f(state, ctxt);
      } catch (ex) {
        logger.error(`while resolving property '${key}'`, ex);
      }
    } else if (key in props) {
      v = props[key];
    }
    p[key] = v;
    return p;
  }, init);
  return cprops;
}

export function cls_f(
  cardName: string,
  cardComp: string,
  prefix: string = "pi",
): (nodeName: string | string[], className?: string) => string {
  const cn = cardName.replaceAll(/[/:]/g, "_");
  const cp = cardComp.replaceAll(/[/:]/g, "_");
  return (nodeName: string | string[], className?: string): string => {
    const na: string[] = typeof nodeName === "string" ? [nodeName] : nodeName;
    const ca = [] as string[];
    if (className) {
      ca.push(className);
    }
    na.forEach((n) => {
      const nn = n.replaceAll(/[/:]/g, "_");
      ca.push(`${prefix}-${cn}-${nn}`);
      ca.push(`${prefix}-${cp}-${nn}`);
    });
    return ca.join(" ");
  };
}

function propEq(oldP: CompProps, newP: CompProps): boolean {
  const isUnchanged = equal(oldP, newP);
  // for (const [k, v] of Object.entries(newP)) {
  //   const ov = oldP[k]
  //   if (ov !== v) {
  //     // two empty arrays are considered to be different, but we don't agree :)
  //     if (!(Array.isArray(v) && !v.length && Array.isArray(ov) && !ov.length)) {
  //       isUnchanged = false
  //       break
  //     }
  //   }
  // }
  RegisterCardState.changed(newP.cardName, isUnchanged, newP);
  return isUnchanged;
}

function appendEventHandlers(
  info: CardInfo,
  cardProps: CompProps,
  cardName: string,
  ctxtProps: CardProp,
  dispatch: (a: AnyAction) => any,
): CompProps {
  RegisterCardState.props(cardName, cardProps, dispatch);
  const cp: CompProps = {
    ...cardProps,
    _dispatch: (a: AnyAction) => dispatch(a),
  };

  const events = info.cardType?.events;
  if (!events) {
    return cp;
  }
  const eventMappers = info.mapping.eventMappers;
  Object.entries(events).forEach(([name, actionType]) => {
    const m = eventMappers[name];
    if (m) {
      logger.debug("setup mapper", cardName);
      cp[name] = (a: AnyAction) => {
        a.cardID = cardName;
        const a2 = m(a, ctxtProps);
        if (a2) dispatch(a2);
      };
    } else {
      cp[name] = (a: AnyAction) => {
        a.type = actionType;
        a.cardID = cardName;
        dispatch(a);
      };
    }
  });
  return cp;
}

function renderUnknownCard(cardName: string): JSX.Element {
  return <div>Unknown card '{cardName}'</div>;
}

function renderUnknownCardType(cardType: string): JSX.Element {
  return <div>Unknown card type '{cardType}'</div>;
}

// Adding card state to redux state for debugging

export const UPDATE_STATE_ACTION = "pi/card/update_state";

type CardState = {
  props: (
    cardName: string,
    cardProps: CompProps,
    dispatch: (a: AnyAction) => any,
  ) => void;
  changed: (cardName: string, isUnchanged: boolean, props: CompProps) => void;
  reducer: ReduceF<ReduxState, Action>;
};

export const RegisterCardState = createCardState();

function createCardState(): CardState {
  type S = {
    cardProps?: CompProps;
    changedAt: number;
    reportedAt: number;
  };
  const s: {[name: string]: S} = {};
  let dispatch: (a: AnyAction) => any;
  let timer: number;
  let lastReport = 0;

  // const timer
  const getS = (cardName: string, props: CompProps): S => {
    const name = cardName;
    let e = s[name];
    if (!e) {
      const ts = Date.now();
      e = {
        changedAt: ts,
        reportedAt: ts,
      } as S;
      s[name] = e;
      resetTimer();
    }
    return e;
  };
  const resetTimer = () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = window.setTimeout(() => {
      //logger.debug("... timer went off") // , s, dispatch)
      if (dispatch) {
        const changed = Object.values(s).filter(
          (s) => s.changedAt > lastReport,
        );
        if (changed.length > 0) {
          clearTimeout(timer); // just in case
          dispatch({type: UPDATE_STATE_ACTION});
        }
      }
    }, 1000);
  };
  const props = (
    cardName: string,
    cardProps: CompProps,
    _dispatch: (a: AnyAction) => any,
  ) => {
    const e = getS(cardName, cardProps);
    e.cardProps = cardProps;
    dispatch = _dispatch;
  };
  const changed = (
    cardName: string,
    isUnchanged: boolean,
    props: CompProps,
  ) => {
    const e = getS(cardName, props);
    e.reportedAt = Date.now();
    if (!isUnchanged) {
      logger.debug("card has changed:", cardName);
      e.changedAt = Date.now();
      resetTimer();
    }
  };
  const reducer = (state: ReduxState) => {
    const pi = Object.values(s)
      .filter((s) => s.reportedAt > lastReport)
      .reduce(
        (p, s) => {
          const cname = s.cardProps?.cardName;
          if (!cname) {
            logger.warn("Unexpected missing card name", s);
            return p;
          }
          const name = cname;
          const props = copySafeProps(s.cardProps || {});
          delete props.cardName;
          delete props._cls;
          p[name] = props;
          return p;
        },
        {} as {[k: string]: any},
      );
    (state.pihanga ??= {}).cards = pi;
    lastReport = Date.now();
  };
  return {props, changed, reducer};
}

function copySafeProps(props: CompProps): CompProps {
  return Object.entries(props).reduce((p, [k, v]) => {
    // const ok = (typeof v === 'undefined' || typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number' || Array.isArray(v));
    const sv = makeSafe(v);
    p[k] = sv;
    return p;
  }, {} as CompProps);
}

function makeSafe(v: any): any {
  const t = typeof v;
  if (
    t === "undefined" ||
    t === "string" ||
    t === "boolean" ||
    t === "number"
  ) {
    return v;
  }
  if (t === "function") {
    return "f(...)";
  }
  if (Array.isArray(v)) {
    return v.map(makeSafe);
  }
  if (t === "object") {
    return Object.entries(v).reduce(
      (p, [k, v]) => {
        p[k] = makeSafe(v);
        return p;
      },
      {} as {[k: string]: any},
    );
  }
  logger.warn(">>> reject", v, typeof v);
  return "...";
}
