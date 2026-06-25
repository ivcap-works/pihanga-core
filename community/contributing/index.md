# Contributing

Contributions are welcome! Here's how to get started.

## Development setup

```bash
git clone https://github.com/ivcap-works/pihanga-core.git
cd pihanga-core
make install
```

## Running checks

```bash
make check        # lint + type-check + tests (CI gate)
make lint         # ESLint only
make type-check   # TypeScript only
make test         # Vitest in watch mode
make test-run     # Vitest single run
```

## Project structure

```
src/
├── index.ts          # Public API
├── types.ts          # Core TypeScript types
├── card.tsx          # <Card> component, usePiReducer hook
├── register.ts       # Low-level card registry
├── register_cards.ts # addCard, registerCardComponent, createCardDeclaration
├── reducer.ts        # createReducer — Redux reducer factory
├── redux.ts          # registerActions, actionTypesToEvents, createOnAction
├── router.ts         # showPage, onShowPage, routing logic
├── logger.ts         # getLogger (tslog wrapper)
├── store.ts          # configureStore
└── rest/             # REST handler registration
    ├── index.ts
    ├── types.ts
    ├── get.ts
    ├── postPutPatch.ts
    ├── delete.ts
    └── utils.ts
```

## Coding conventions

- **TypeScript strict** — avoid `any`; use generics.
- **No default exports** — use named exports in all library files.
- **File naming** — `snake_case` for files in `src/`, camelCase for identifiers.
- **Logging** — use `getLogger("module-name")` rather than `console.log`.
- **Immutability** — reducers use Immer; do not mutate state outside Immer producers.

## What NOT to change without discussion

- `src/index.ts` — public API; breaking changes require a semver major bump.
- `src/types.ts` — core types consumed by all downstream packages.
- `src/reducer.ts` — tightly coupled to Redux Toolkit internals.

## Publishing

```bash
make publish    # build + npm publish (requires npm login)
```

Releases are also triggered automatically by the `publish.yml` GitHub Actions workflow
when a `v*` tag is pushed.
