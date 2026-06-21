# Quick Start

This guide shows you how to bootstrap a minimal Pihanga application from scratch.

## 1. Create the entry point

```ts title="src/main.ts"
import { start, DEFAULT_REDUX_STATE } from "@pihanga2/core";
import { myInit } from "./app.pihanga";
import type { AppState } from "./app.types";

const initState: AppState = {
  ...DEFAULT_REDUX_STATE,   // required — seeds routing and framework slices
  title: "My App",
};

start(initState, [myInit]);
```

## 2. Define your state type

```ts title="src/app.types.ts"
import type { PiCardRef, ReduxState } from "@pihanga2/core";

export type AppState = ReduxState & {
  title: string;
  activePage: PiCardRef;
};
```

## 3. Register cards

```ts title="src/app.pihanga.ts"
import { type PiRegister } from "@pihanga2/core";
import type { AppState } from "./app.types";

export function myInit(register: PiRegister): void {
  // Register the top-level window card — page prop drives which card is shown
  register.window<AppState>({
    page: (s) => s.activePage,
  });

  // Register a named card instance
  register.card("page/home", {
    cardType: "my/page",
    title: (s: AppState) => s.title,
  });
}
```

## 4. Mount point

Pihanga mounts itself onto `document.getElementById("root")`. Ensure your `index.html` has:

```html title="index.html"
<div id="root"></div>
```

## 5. Register a card component

Card *components* (React implementations) are registered separately from card *instances*.
Use `registerCardComponent` — it is buffered and safe to call at module load time:

```ts title="src/cards/myPage/index.ts"
import { registerCardComponent, actionTypesToEvents } from "@pihanga2/core";
import { MY_PAGE, MY_PAGE_ACTIONS, MyPageComponent } from "./myPage";

registerCardComponent({
  name: MY_PAGE,
  component: MyPageComponent,
  events: MY_PAGE_ACTIONS,
});
```

```tsx title="src/cards/myPage/myPage.tsx"
import React from "react";
import { createCardDeclaration, registerActions, actionTypesToEvents, type PiCardProps } from "@pihanga2/core";

export const MY_PAGE = "my/page";

export type MyPageProps   = { title: string };
export type MyPageEvents  = { onTitleClick: { title: string } };

// Card factory — MyPage({ title: "Home", onTitleClick: ... })
export const MyPage = createCardDeclaration<MyPageProps, MyPageEvents>(MY_PAGE);

export const MY_PAGE_ACTIONS = actionTypesToEvents(
  registerActions(MY_PAGE, ["titleClick"])
);

export function MyPageComponent({
  title,
  onTitleClick,
}: PiCardProps<MyPageProps, MyPageEvents>) {
  return (
    <h1 onClick={() => onTitleClick({ title })}>
      {title}
    </h1>
  );
}
```

## Next steps

- [Building an Application](../guides/deployment.md) — full app anatomy (counter → multi-page)
- [Cards guide](../guides/cards.md) — full card lifecycle with typed props & events
- [Redux & Reducers guide](../guides/redux.md) — state management patterns
- [Routing guide](../guides/routing.md) — navigation with `showPage` / `onShowPage`
- [REST API guide](../guides/rest-api.md) — data fetching wired into Redux
