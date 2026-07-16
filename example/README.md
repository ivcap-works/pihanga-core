# pihanga-shadcn — counter example

A minimal Vite + React + TypeScript counter built with the
[`@pihanga2/shadcn`](https://github.com/ivcap-works/pihanga-shadcn) npm package.

```
  [−]   Count: 0   [+]
```

## What it demonstrates

| Concept | Where |
|---|---|
| `registerFramework` — root card | `app.pihanga.ts` |
| `registerCard` — named card declaration | `app.pihanga.ts` |
| Inline `onClicked` — Immer reducer scoped to one button | `app.pihanga.ts` |
| Named card referenced by string ID in `content[]` | `app.pihanga.ts` |
| State-selector function on `text` — reactive prop | `app.pihanga.ts` |
| External `register()` + `onButtonClicked` handler | `app.reducer.ts` |

## Key files

| File | Role |
|---|---|
| `src/app.state.ts` | Redux state type (`count: number`) |
| `src/app.pihanga.ts` | UI declaration — `registerFramework` + `registerCard` |
| `src/app.reducer.ts` | External event handler — `register()` + `onButtonClicked` |
| `src/main.ts` | Entry point — `start()` with initial state |
| `vite.config.ts` | Vite config with path aliases + `optimizeDeps` fix |

## Run

```sh
cd example
yarn install
yarn dev
```

Open http://localhost:5173 (or whichever port Vite picks).

## How it works

The UI is declared in `app.pihanga.ts` — no JSX.  Two event-handling patterns
are shown side-by-side:

**`app.pihanga.ts`** — declares the card tree; `[−]` uses an inline handler:

```ts
registerFramework(SdFramework({page: "counter/page", theme: "light"}));

registerCard(
  "counter/page",
  Stack<AppState>({
    direction: "row",
    alignItems: "center",
    spacing: 4,
    className: "p-16 justify-center",
    content: [
      // [−] inline Immer reducer — anonymous card
      Button<AppState>({
        label: "−",
        opts: {size: "lg"},
        onClicked: (state) => { state.count -= 1 },
      }),
      Typography<AppState>({
        text: (s) => `Count: ${s.count}`,
        level: "h2",
        className: "min-w-[120px] text-center",
      }),
      // [+] named card — handler registered externally in app.reducer.ts
      "counter/plus",
    ],
  }),
);

// Named card so app.reducer.ts can target it by cardID
registerCard("counter/plus", Button({label: "+", opts: {size: "lg"}}));
```

**`app.reducer.ts`** — external handler for the named `[+]` card:

```ts
register((r) => {
  onButtonClicked<AppState>(r, (state, {cardID}) => {
    if (cardID === "counter/plus") state.count += 1;
  });
});
```

Inline `onClicked` handlers and external `register()` reducers are both
**Immer reducers**: mutate the state draft directly; Immer handles immutability.

The `Typography` `text` prop is a **state-selector** — it re-runs on every
Redux state change and returns a fresh string, making the display reactive
without any explicit subscription.

## Vite config notes

The `vite.config.ts` in this example contains two important `optimizeDeps`
settings:

```ts
optimizeDeps: {
  // Exclude both @pihanga2 packages from Vite's esbuild pre-bundler.
  // Without this, @pihanga2/core gets bundled twice — once inside
  // @pihanga2/shadcn and once directly — creating two separate card
  // registries and causing "Unknown card 'app/main'" errors at runtime.
  exclude: ["@pihanga2/core", "@pihanga2/shadcn"],
  // @pihanga2/core's CJS transitive deps must still be pre-bundled.
  include: ["deep-equal", "stacktrace-js", "react-dom/client"],
},
```
