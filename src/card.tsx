import React, {useCallback, useEffect, useId, useMemo, useRef} from "react";
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

// A1: memoised — Card's own props are stable strings, so React.memo prevents
// cascade re-renders from parent components re-rendering.
function CardImpl(props: CardProp): JSX.Element {
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
    // A4: render as a real component so hook counts are stable in Card
    return (
      <ErrorCardComponent
        content={<div>Unknown type of cardName '{`${props.cardName}`}'</div>}
      />
    );
  }

  const [info, errCard] = getCardInfo(cardName);
  if (errCard) {
    return <ErrorCardComponent content={errCard} />;
  }
  if (!info) {
    throw new Error("info is empty, should never happen");
  }
  return (
    <GenericCardComponent cardName={cardName} ctxtProps={props} info={info} />
  );
}
export const Card = React.memo(CardImpl);

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
    // do update props if parameters have changed (A3: use deep-equal, not identity)
    if (!equal(mapping.parameters, parameters)) {
      _updateCardMapping(cardName, parameters, regRed, mapping);
    }
  } else {
    _registerCard(cardName, parameters, regRed);
  }
  return cardName;
}

// A4: GenericCard is now a proper React component — it owns its own hook list.
type GenericCardComponentProps = {
  cardName: string;
  ctxtProps: CardProp;
  info: CardInfo;
};

// A2: GenericCardComponent uses React.memo with a structural comparator so that
// re-renders from a parent are skipped when cardName, mapping, cardType, and
// ctxtProps haven't changed.  Internally, all closures passed as card-component
// props are stabilised with useCallback/useMemo so that downstream React.memo
// on card components can also be effective.
const GenericCardComponent = React.memo(
  function GenericCardComponentImpl({
    cardName,
    ctxtProps: props,
    info,
  }: GenericCardComponentProps): JSX.Element {
    // Synchronously write ctxtProps to metacard store so sub-cards rendered in
    // the same cycle can read it.
    if (info.mapping.metaCard?.topCard === cardName) {
      metaCardCtxtPropsStore[cardName] = props;
    }

    // A2: refs to latest values so stable closures read fresh data at call time.
    const propsRef = useRef(props);
    propsRef.current = props;

    const metaCtxtPropsRef = useRef<CardProp | undefined>(undefined);
    // ctxtPropsRef holds the latest {...props, resolve} for event mappers.
    const ctxtPropsRef = useRef<any>({});

    // Clean up the metacard store entry on unmount.
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

    // A2: stable dispatchWithId — both piReducer and dispatch are stable after mount.
    const dispatchWithId = useCallback(
      (a: AnyAction) =>
        piReducer ? piReducer.dispatch(a as any) : dispatch(a),
      [piReducer, dispatch],
    );

    // A2: stable eventMapperResolve — reads from refs, never needs to be recreated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const eventMapperResolve = useCallback(
      (prop: any): any => {
        if (typeof prop !== "function") return prop;
        const currentState = (store as any).getState();
        const currentMeta = metaCtxtPropsRef.current;
        const ctx = {
          cardName,
          cardKey: propsRef.current.cardKey,
          ctxtProps: currentMeta ?? propsRef.current,
          metaCtxtProps: currentMeta,
          resolve: eventMapperResolve, // self-ref is safe: JS closure captures the var
        };
        return prop(currentState, ctx);
      },
      [cardName, store],
    ); // stable: cardName is fixed; store never changes

    // Update refs with latest render values (regular statements between hooks).
    const eventMapperMetaCtxtProps =
      info.mapping.metaCard && info.mapping.metaCard.topCard !== cardName
        ? metaCardCtxtPropsStore[info.mapping.metaCard.topCard]
        : undefined;
    metaCtxtPropsRef.current = eventMapperMetaCtxtProps;
    ctxtPropsRef.current = {...props, resolve: eventMapperResolve};

    // A2: memoised event handlers — rebuilt only when mapping or dispatch changes.
    // Handlers close over ctxtPropsRef so they always read the latest context
    // without themselves needing to be recreated.
    const eventHandlers = useMemo((): CompProps => {
      const events = info.cardType?.events;
      const result: CompProps = {_dispatch: dispatchWithId};
      if (!events) return result;
      const {eventMappers} = info.mapping;
      Object.entries(events).forEach(([evName, actionType]) => {
        const m = eventMappers[evName];
        if (m) {
          logger.debug("setup mapper", cardName);
          result[evName] = (a: AnyAction) => {
            a.cardID = cardName;
            const a2 = m(a, ctxtPropsRef.current);
            if (a2) dispatchWithId(a2);
          };
        } else {
          result[evName] = (a: AnyAction) => {
            a.type = actionType;
            a.cardID = cardName;
            dispatchWithId(a);
          };
        }
      });
      return result;
      // info.mapping.eventMappers is a new object identity whenever the mapping
      // is updated, so this correctly invalidates when props/events change.
    }, [cardName, info.mapping.eventMappers, info.cardType, dispatchWithId]);

    // A2: stable _cls — pure function of two stable strings.
    const cls = useMemo(
      () => cls_f(cardName, info.mapping.cardType),
      [cardName, info.mapping.cardType],
    );

    RegisterCardState.props(cardName, cardProps, dispatch);

    const extCardProps: CompProps = {...cardProps, ...eventHandlers, _cls: cls};
    return React.createElement(
      info.cardType.component,
      extCardProps,
      props.children,
    );
  },
  // Custom equality: info is rebuilt as a new object each render but its
  // mapping and cardType fields are stable module-level references.
  (prev, next) =>
    prev.cardName === next.cardName &&
    prev.info.mapping === next.info.mapping &&
    prev.info.cardType === next.info.cardType &&
    prev.ctxtProps === next.ctxtProps,
);

// A4: ErrorCard is now a proper React component — no parity hack needed.
// It has no useSelector subscription so it never re-renders due to store dispatches.
type ErrorCardComponentProps = {
  content: JSX.Element;
};

function ErrorCardComponent({content}: ErrorCardComponentProps): JSX.Element {
  return content;
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
