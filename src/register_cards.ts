import equal from "deep-equal";
import {getLogger} from "./logger";
import {
  CSSModuleClasses,
  CardAction,
  CardProp,
  DispatchF,
  GenericCardParameterT,
  MetaCardMapperF,
  PiCardDef,
  PiCardRef,
  PiMapProps,
  PiRegisterComponent,
  PiRegisterMetaCard,
  PiRegisterReducerF,
  ReduxState,
  RegisterCardF,
  StateMapper,
  StateMapperContext,
} from "./types";
import {Action, AnyAction, Dispatch} from "@reduxjs/toolkit";

const logger = getLogger("card-register");

export function isCardRef(p: any): boolean {
  return p !== null && typeof p === "object" && p.cardType !== undefined;
}

export type Mapping = {
  cardType: string;
  props: {[k: string]: unknown};
  eventMappers: {
    [k: string]: (ev: Action, ctxtProps: CardProp) => Action | null;
  };
  cardEvents: {[key: string]: string};
  parameters: PiCardDef; // original
};

export type MetaCard = {
  type: string;
  registerCard: RegisterCardF;
  mapper: MetaCardMapperF;
  events?: {[key: string]: string};
};

export const cardTypes: {[k: string]: PiRegisterComponent} = {};
export const metacardTypes: {[k: string]: MetaCard} = {};

export let framework: string; // name of active UI framework
export const cardMappings: {[k: string]: Mapping} = {};
export const dispatch2registerReducer: [
  React.Dispatch<any>,
  PiRegisterReducerF,
][] = [];

export function addCardComponent(card: PiRegisterComponent): void {
  if (cardTypes[card.name]) {
    logger.warn(`Overwriting definition for card type "${card.name}"`);
  }
  logger.info(`Register card type "${card.name}"`);
  if (!framework) {
    // set default framework
    const na = card.name.split("/");
    if (na.length >= 2) {
      framework = na[0];
      logger.info(`Setting UI framework to "${framework}"`);
    }
  }
  cardTypes[card.name] = card;
}

export function registerMetacard(registerCard: RegisterCardF) {
  function f<C>(declaration: PiRegisterMetaCard) {
    const {type, mapper, events} = declaration;
    if (metacardTypes[type]) {
      logger.warn(`Overwriting definition for meta card type "${type}"`);
    }
    logger.info(`Register meta card type "${type}"`);
    metacardTypes[type] = {type, registerCard, mapper, events};
  }
  return f;
}

export function addCard(
  registerReducer: PiRegisterReducerF,
  dispatchF: React.Dispatch<any>,
) {
  // to be used by dynamically registered cards
  dispatch2registerReducer.push([dispatchF, registerReducer]);
  return (name: string, parameters: PiCardDef): PiCardRef => {
    return _registerCard(name, parameters, registerReducer);
  };
}

export function updateOrRegisterCard(
  registerReducer: PiRegisterReducerF,
  dispatchF: React.Dispatch<any>,
) {
  // to be used by dynamically registered cards
  dispatch2registerReducer.push([dispatchF, registerReducer]);
  return (
    name: string,
    parameters: {[key: string]: GenericCardParameterT},
  ): PiCardRef => {
    return _updateCard(name, parameters, registerReducer);
  };
}

export function _registerCard(
  name: string,
  parameters: PiCardDef,
  registerReducer: PiRegisterReducerF,
  overrideEvents?: {[key: string]: string},
): PiCardRef {
  if (cardMappings[name]) {
    logger.warn(`Overwriting definition for card "${name}"`);
  }
  let cardType = cardTypes[parameters.cardType];
  if (!cardType) {
    if (framework) {
      cardType = cardTypes[`${framework}/${parameters.cardType}`];
    }
    if (!cardType) {
      // maybe it's a metadata card
      if (_registerMetadataCard(name, parameters, registerReducer)) {
        return name;
      }
      logger.warn("unknown card type", parameters.cardType);
      return name;
    }
  }

  const events = overrideEvents || cardType.events || {};
  _createCardMapping(name, parameters, registerReducer, events);
  return name;
}

export function _updateCard(
  name: string,
  parameters: {[key: string]: GenericCardParameterT},
  registerReducer: PiRegisterReducerF,
  overrideEvents?: {[key: string]: string},
): PiCardRef {
  const mappings = cardMappings[name];
  if (!mappings) {
    // first time
    if (!parameters.cardType) {
      logger.warn("missing 'cardType'", name);
      return name;
    }
    const p: any = parameters;
    return _registerCard(name, p, registerReducer, overrideEvents);
  }

  const p = {...mappings.parameters, ...parameters};
  _createCardMapping(name, p, registerReducer, mappings.cardEvents);
  return name;
}

export function _createCardMapping(
  name: string,
  parameters: PiCardDef,
  registerReducer: PiRegisterReducerF,
  cardEvents: {[key: string]: string},
) {
  const props = {} as {[k: string]: unknown};
  const eventMappers = {} as {[k: string]: (ev: Action) => Action};

  Object.entries(parameters).forEach(([k, v]) => {
    if (k === "cardType") return;
    if (typeof v === "object") {
      const cd = v as PiCardDef; // speculative
      if (cd.cardType) {
        const cardName = `${name}/${k}`;
        v = _registerCard(cardName, cd, registerReducer);
      }
    }
    if (
      k.startsWith("on") &&
      processEventParameter(
        k,
        v,
        cardEvents,
        eventMappers,
        registerReducer,
        name,
      )
    ) {
      return;
    }
    props[k] = v;
  });
  cardMappings[name] = {
    cardType: parameters.cardType,
    props,
    eventMappers,
    cardEvents,
    parameters,
  };
}

export function _updateCardMapping(
  name: string,
  parameters: PiCardDef,
  registerReducer: PiRegisterReducerF,
  mappings: Mapping,
) {
  return _createCardMapping(
    name,
    parameters,
    registerReducer,
    mappings.cardEvents,
  );
}

function _registerMetadataCard(
  metaName: string,
  parameters: PiCardDef,
  registerReducer: PiRegisterReducerF,
): boolean {
  let mc = metacardTypes[parameters.cardType];
  if (!mc) {
    if (framework) {
      mc = metacardTypes[`${framework}/${parameters.cardType}`];
    }
    if (!mc) {
      return false;
    }
  }
  function registerCard(name: string, parameters: PiCardDef): PiCardRef {
    const n = `${metaName}/${name}`;
    return mc.registerCard(n, parameters);
  }
  const top = mc.mapper(metaName, parameters, registerCard);
  _registerCard(metaName, top, registerReducer, mc.events);
  return true;
}

// NOT IMPLEMENTED YET
// function _updateMetadataCard(
//   metaName: string,
//   parameters: PiCardDef,
//   registerReducer: PiRegisterReducerF,
// ): boolean {
//   let mc = metacardTypes[parameters.cardType]
//   if (!mc) {
//     if (framework) {
//       mc = metacardTypes[`${framework}/${parameters.cardType}`]
//     }
//     if (!mc) {
//       return false
//     }
//   }
//   function updateCard(name: string, parameters: PiCardDef): PiCardRef {
//     const n = `${metaName}/${name}`
//     return mc.updateCard(n, parameters)
//   }
//   const top = mc.mapper(metaName, parameters, updateCard)
//   _updateCard(metaName, top, registerReducer, mc.events)
//   return true
// }

export function createCardDeclaration<Props = {}, Events = {}>(
  cardType: string,
): <S extends ReduxState>(p: PiMapProps<Props, S, Events>) => PiCardDef {
  return (p) => ({
    ...p,
    cardType,
  });
}

function processEventParameter(
  propName: string,
  value: unknown,
  events: {[key: string]: string},
  eventMappers: {[k: string]: (ev: Action) => Action},
  registerReducer: PiRegisterReducerF,
  cardName: string,
): boolean {
  const eva = Object.entries(events).find(([n, _]) => {
    return propName === n || propName === `${n}Mapper`;
  });
  if (!eva) {
    logger.warn(
      `encountered property '${propName}' for card '${cardName}' which looks like an even but is not defined`,
    );
    return false;
  }

  const [evName, actionType] = eva;
  if (propName === evName) {
    // Cast to ReduceF (void return). The `=> ReduxState` return annotation has
    // been intentionally removed: Pihanga reducers are Immer recipes — the
    // handler must mutate `state` in place and must NOT return a value.
    // Any return value from `r` is ignored here; the wrapper never forwards it.
    const r = value as (
      state: ReduxState,
      action: CardAction,
      dispatch: DispatchF,
    ) => void;
    registerReducer(
      actionType,
      (s, a, d) => {
        const ca = a as CardAction;
        if (ca.cardID === cardName) {
          r(s, ca, d); // mutates the Immer draft; return value is deliberately discarded
        }
      },
      0,
      `on card ${cardName} for ${propName}`,
      r,
    );
  }
  if (propName === `${evName}Mapper`) {
    logger.debug("processEventParameter", cardName);

    const m = value as (ev: Action) => Action;
    eventMappers[evName] = m;
  }
  return true;
}

/**
 * Memorises a calculation as long as a certain "part"
 * of the ReduxState is not changing. The `filterF` function
 * is always called with the current ReduxState.
 *
 * If `memo` has been called previously, the return value of
 * `filterF` is compared with the last previous call. If it has
 * changed, `mapF` is called. Both return values are internally
 * stored and the most recent result of `mapF` is returned.
 *
 * If `filterF` is returning the same result as in the most recent
 * call, `mapF` will NOT be called, but the result of the most recent
 * `mapF` is returned.
 *
 * @example
 * ```typescript
 * options: memo<CatalogItemtT[], SelectOptionT[], AppState>(
 *   (s) => s.catalog,
 *   (items) => items.map(...),
 * ),
 * ```
 *
 * @param filterF Function to return the part [P] of the ReduxState of interests.
 * @param mapF Function to map the result of `mapF` to the return value of type T
 * @typeparam P The type of a section of the ReduxState S.
 * @typeparam T The return type of this function call.
 * @typeparam S The type of the ReduxState which is being passed to `filterF`.
 * @typeparam C They type of specific context this card is being used StateMapperContext<C> (Primarily relevant for tables)
 * @returns The result of `mapF` if the result of `filterF` has changed, otherwise returns a previous result of `mapF`
 */
export function memo<P, T, S extends ReduxState, C = any>(
  filterF: (state: S, context: StateMapperContext<C>) => P,
  mapperF: (partial: P, context: StateMapperContext<C>, state: S) => T,
): (state: S, context: StateMapperContext<C>) => T {
  const lastFilter: {[k: string]: P} = {};
  const lastValue: {[k: string]: T} = {};
  const isNotFirst: {[k: string]: boolean} = {};

  return (state: S, context: StateMapperContext<C>): T => {
    const k = context.cardKey || "-";
    const fv = filterF(state, context);
    if (isNotFirst[k] && equal(fv, lastFilter[k])) {
      // nothing changed
      return lastValue[k];
    }
    lastFilter[k] = fv;
    const v = mapperF(fv, context, state);
    lastValue[k] = v;
    isNotFirst[k] = true;
    return v;
  };
}
