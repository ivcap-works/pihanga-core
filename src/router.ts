import {Update, createBrowserHistory, Location} from "history";
import {getLogger} from "./logger";
import {createOnAction, registerActions} from "./redux";
import {
  DEF_REDUCER_PRIORITY,
  DispatchF,
  PathQuery,
  PiReducer,
  ReduceF,
  ReduxAction,
  ReduxState,
  Route,
} from "./types";
import {PiRegister} from ".";

const logger = getLogger("router");
export const browserHistory = createBrowserHistory();

// type Route = {
//   path: string[]
//   query: PathQuery
//   url: string
//   fromBrowser?: boolean
// }

export const ACTION_TYPES = registerActions("pi/router", [
  "show_page",
  "navigate_to_page",
]);

export type ShowPageEvent = {
  path: string[];
  query?: PathQuery;
  fromBrowser?: boolean;
};
export const onShowPage = createOnAction<ShowPageEvent>(ACTION_TYPES.SHOW_PAGE);

export const showPage = (
  dispatch: DispatchF,
  path: string[],
  query?: PathQuery,
) => {
  return dispatch(createShowPageAction(path, query));
};

export const createShowPageAction = (
  path: string[],
  query?: PathQuery,
): ReduxAction & ShowPageEvent => ({
  type: ACTION_TYPES.SHOW_PAGE,
  path,
  query,
  fromBrowser: false,
});

export type NavigateToPageEvent = {
  url: string;
  fromBrowser: boolean;
};
export const onNavigateToPage = createOnAction<NavigateToPageEvent>(
  ACTION_TYPES.NAVIGATE_TO_PAGE,
);

export const ON_INIT_ACTION = "pi/start";
export const onInit = createOnAction<{}>(ON_INIT_ACTION);

export function currentRoute(pathPrefix = ""): Route {
  const f = route_functions(pathPrefix);
  const r2 = f.url2route(window.location.href);
  const r = f.location2route(browserHistory.location);
  return r;
}

export function init(reducer: PiReducer, pathPrefix = ""): Route {
  let workingURL: string;
  const f = route_functions(pathPrefix);

  browserHistory.listen(({action, location}: Update) => {
    // location is an object like window.location
    const {url} = f.location2route(location);
    if (workingURL !== url) {
      logger.info("browser history:", url, action);
      setTimeout(() => navigateToPage(url, action === "POP"));
    }
  });

  function browserPath(): Route {
    return f.location2route(browserHistory.location);
  }

  function navigateToPage(url: string, fromBrowser = false) {
    reducer.dispatch({
      type: ACTION_TYPES.NAVIGATE_TO_PAGE,
      url,
      fromBrowser,
    });
  }

  reducer.register<ReduxState, ReduxAction & NavigateToPageEvent>(
    ACTION_TYPES.NAVIGATE_TO_PAGE,
    (state, {url, fromBrowser}, dispatch) => {
      const r = f.url2route(url);
      r.fromBrowser = fromBrowser;
      if (workingURL && state.route?.url === r.url) {
        return state;
      }
      dispatch({
        type: ACTION_TYPES.SHOW_PAGE,
        ...r,
      });
      return state;
    },
    DEF_REDUCER_PRIORITY,
    "@builtin:router:NAVIGATE_TO_PAGE",
  );

  reducer.register<ReduxState, ReduxAction & ShowPageEvent>(
    ACTION_TYPES.SHOW_PAGE,
    (state, {path, query = {}, fromBrowser = false}) => {
      const route = f.pathl2route(path, query);
      workingURL = route.url;
      if (!fromBrowser) {
        const hp = browserPath();
        if (route.url !== hp.url) {
          browserHistory.push(route.url);
        }
      }
      state.route = {
        ...route,
        fromBrowser,
      };
      return state;
    },
    DEF_REDUCER_PRIORITY,
    "@builtin:router:SHOW_PAGE",
  );

  reducer.register(
    "@@INIT",
    (state) => {
      const url = browserPath().url;
      logger.info(`Request navigation to '${url}'`);
      setTimeout(() => navigateToPage(url, true));
      return state;
    },
    DEF_REDUCER_PRIORITY,
    "@builtin:router:@@INIT",
  );
  return f.location2route(browserHistory.location);
}

function route_functions(pathPrefix = "") {
  const location2route = (location: Location): Route => {
    const [p, s] = [location.pathname, location.search];
    const url = s ? `${p}${s}` : p;
    return url2route(url);
  };

  const url2route = (url: string): Route => {
    const [pn, search] = url.split("?");

    const path = pn
      .substring(pathPrefix.length)
      .split("/")
      .filter((s) => s !== "");
    const query = {} as PathQuery;
    const s = search;
    if (s && s.length > 0) {
      s.split("&").forEach((el) => {
        const [k, v] = el.split("=");
        query[decodeURI(k)] = v ? decodeURI(v) : true;
      });
    }
    return {url, path, query};
  };

  const pathl2route = (path: string[], query: PathQuery): Route => {
    let url = `${pathPrefix}/${path.join("/")}`;
    if (query) {
      const qa = Object.entries(query);
      if (qa.length > 0) {
        const s = qa
          .map(([k, v]) => {
            const n = encodeURI(k);
            if (typeof v === "boolean") {
              return n;
            } else if (typeof v === "number") {
              return `${n}=${v}`;
            } else {
              return `${n}=${encodeURI(v)}`;
            }
          })
          .join("&");
        url = `${url}?${s}`;
      }
    }
    return {url, path, query};
  };
  return {location2route, url2route, pathl2route};
}
