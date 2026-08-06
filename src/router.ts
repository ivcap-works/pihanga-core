import { Update, createBrowserHistory, Location } from "history";
import { getLogger } from "./logger";
import { createOnAction, registerActions } from "./redux";
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
import { PiRegister } from ".";

const logger = getLogger("router");
export const browserHistory = createBrowserHistory();

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

export const showPage = (dispatch: DispatchF, path: string[], query?: PathQuery) => {
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

export function currentRoute(pathPrefix = "", routeQueryParam?: string): Route {
  const f = route_functions(pathPrefix, routeQueryParam);
  return f.location2route(browserHistory.location);
}

export function init(
  reducer: PiReducer,
  pathPrefix = "",
  routeQueryParam?: string,
): Route {
  let workingURL: string;
  const f = route_functions(pathPrefix, routeQueryParam);

  browserHistory.listen(({ action, location }: Update) => {
    // location is an object like window.location
    const { url } = f.location2route(location);
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
    (state, { url, fromBrowser }, dispatch) => {
      const r = f.url2route(url);
      r.fromBrowser = fromBrowser;
      if (workingURL && state.route?.url === r.url) {
        return; // guard: URL unchanged, nothing to do
      }
      dispatch({
        type: ACTION_TYPES.SHOW_PAGE,
        ...r,
      });
    },
    DEF_REDUCER_PRIORITY,
    "@builtin:router:NAVIGATE_TO_PAGE",
  );

  reducer.register<ReduxState, ReduxAction & ShowPageEvent>(
    ACTION_TYPES.SHOW_PAGE,
    (state, { path, query = {}, fromBrowser = false }) => {
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
    },
    DEF_REDUCER_PRIORITY,
    "@builtin:router:SHOW_PAGE",
  );

  reducer.register(
    "@@INIT",
    (_state) => {
      const url = browserPath().url;
      logger.info(`Request navigation to '${url}'`);
      setTimeout(() => navigateToPage(url, true));
    },
    DEF_REDUCER_PRIORITY,
    "@builtin:router:@@INIT",
  );
  return f.location2route(browserHistory.location);
}

/**
 * Builds a canonical URL for query-param routing mode.
 *
 * When `path` is non-empty the path segments are serialised as the value of
 * the `routeQueryParam` query parameter (e.g. `/?p=foo/bar`).  Any additional
 * `query` entries are appended as ordinary query parameters.
 * When `path` is empty the result is `/` (plus any extra query params).
 *
 * This keeps the server always serving the root path (`/`) while the logical
 * route is fully described in the query string — ideal for static hosts such
 * as GitHub Pages that cannot serve arbitrary sub-paths.
 */
function buildQueryUrl(
  path: string[],
  query: PathQuery,
  routeQueryParam: string,
): string {
  const params: string[] = [];
  if (path.length > 0) {
    params.push(`${encodeURI(routeQueryParam)}=${encodeURI(path.join("/"))}`);
  }
  for (const [k, v] of Object.entries(query)) {
    const n = encodeURI(k);
    if (typeof v === "boolean") {
      params.push(n);
    } else if (typeof v === "number") {
      params.push(`${n}=${v}`);
    } else {
      params.push(`${n}=${encodeURI(v)}`);
    }
  }
  return params.length > 0 ? `/?${params.join("&")}` : "/";
}

/** @internal Exported for unit testing only. */
export function _routeFunctions(pathPrefix = "", routeQueryParam?: string) {
  return route_functions(pathPrefix, routeQueryParam);
}

function route_functions(pathPrefix = "", routeQueryParam?: string) {
  const location2route = (location: Location): Route => {
    const [p, s] = [location.pathname, location.search];
    const url = s ? `${p}${s}` : p;
    return url2route(url);
  };

  const url2route = (url: string): Route => {
    const [pn, search] = url.split("?");
    const rawQuery = {} as PathQuery;
    if (search && search.length > 0) {
      search.split("&").forEach((el) => {
        const [k, v] = el.split("=");
        rawQuery[decodeURI(k)] = v ? decodeURI(v) : true;
      });
    }

    if (routeQueryParam) {
      // Query-param mode: logical path is stored in e.g. ?p=foo/bar
      const rawPath = rawQuery[routeQueryParam];
      // Remove the route param from the remaining query object
      const query = { ...rawQuery };
      delete query[routeQueryParam];
      const path =
        typeof rawPath === "string" && rawPath.length > 0
          ? rawPath.split("/").filter((s) => s !== "")
          : [];
      const canonicalUrl = buildQueryUrl(path, query, routeQueryParam);
      return { url: canonicalUrl, path, query };
    }

    // Default path mode
    const path = pn
      .substring(pathPrefix.length)
      .split("/")
      .filter((s) => s !== "");
    return { url, path, query: rawQuery };
  };

  const pathl2route = (path: string[], query: PathQuery): Route => {
    if (routeQueryParam) {
      const url = buildQueryUrl(path, query, routeQueryParam);
      return { url, path, query };
    }

    // Default path mode
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
    return { url, path, query };
  };

  return { location2route, url2route, pathl2route };
}
