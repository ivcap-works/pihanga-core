# Cards Guide

A **card** is the fundamental UI unit in Pihanga. It combines a React component with a typed prop/event interface and a name in the global card registry.

!!! tip "Check the card library first"
    Before writing a card from scratch, browse the **[pihanga-shadcn card catalogue](https://ivcap-works.github.io/pihanga-shadcn/)**.
    It ships ready-made cards (`Button`, `Stack`, `List`, `Table`, `Form`, `Input`, `Typography`,
    `ImageViewer`, `FileDrop`, …) and contains more comprehensive examples of how to define
    well-structured, maintainable cards.

## Anatomy of a card

Every card has two parts:

1. **A card type declaration** — defines the TypeScript types and creates a factory function
2. **A card component** — the React component that renders it

### Step 1 — Declare the card type

```ts title="src/cards/counter/counter.types.ts"
import { createCardDeclaration, actionTypesToEvents } from "@pihanga2/core";

export const COUNTER_CARD = "my/counter";

export type CounterProps = {
  count: number;
  label?: string;
};

export type CounterEvents = {
  onIncrement: { delta: number };
  onReset: Record<string, never>;
};

// Factory function: CounterCard({ count: 0, label: "Hits" })
export const CounterCard = createCardDeclaration<CounterProps, CounterEvents>(
  COUNTER_CARD,
);

// Redux action types that map to CounterEvents
export const COUNTER_ACTIONS = actionTypesToEvents<CounterEvents>(COUNTER_CARD);
```

### Step 2 — Write the React component

```tsx title="src/cards/counter/counter.component.tsx"
import React from "react";
import { PiCardProps } from "@pihanga2/core";
import { CounterProps, CounterEvents } from "./counter.types";

export function CounterComponent({
  count,
  label = "Count",
  onIncrement,
  onReset,
}: PiCardProps<CounterProps, CounterEvents>) {
  return (
    <div>
      <span>{label}: {count}</span>
      <button onClick={() => onIncrement({ delta: 1 })}>+1</button>
      <button onClick={() => onReset({})}>Reset</button>
    </div>
  );
}
```

### Step 3 — Register the component

```ts title="src/cards/counter/index.ts"
import { registerCardComponent } from "@pihanga2/core";
import { COUNTER_CARD, COUNTER_ACTIONS } from "./counter.types";
import { CounterComponent } from "./counter.component";

registerCardComponent({
  name: COUNTER_CARD,
  component: CounterComponent,
  events: COUNTER_ACTIONS,
});
```

### Step 4 — Register a card instance

```ts title="src/app.pihanga.ts"
import { register } from "@pihanga2/core";
import { CounterCard } from "./cards/counter/counter.types";

register((r) => {
  r.card("page/myCounter", CounterCard({ count: 0, label: "Clicks" }));
});
```

## Card props vs events

| Concept | TypeScript type | Description |
|---|---|---|
| **Props** | `MyCardProps` | Static configuration passed from parent card or state |
| **Events** | `MyCardEvents` | User interactions dispatched as Redux actions |
| `PiCardProps<P, E>` | Combined | Type for the component function signature |

## Rendering a card by name

Use the `<Card>` component anywhere inside a Pihanga app:

```tsx
import { Card } from "@pihanga2/core";

function ParentComponent() {
  return <Card name="page/myCounter" />;
}
```

The card name is looked up in the global registry at render time.

## Common pitfalls

!!! warning "Import order"
    `registerCardComponent()` must be called **before** `start()` renders the component tree.
    Ensure your card modules are imported before `start()` is invoked.

!!! warning "Unknown card type"
    If you see a console error like `"unknown card type: my/counter"`, the `registerCardComponent`
    call for that card type has not been executed yet. Check your module imports.
