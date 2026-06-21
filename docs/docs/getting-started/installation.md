# Installation

## Requirements

- **Node.js** 18+
- **React** 18+ (peer dependency)
- **react-dom** 18+ (peer dependency)
- **react-redux** 9+ (peer dependency)

## Install the package

=== "yarn"

    ```bash
    yarn add @pihanga2/core react react-dom react-redux
    ```

=== "npm"

    ```bash
    npm install @pihanga2/core react react-dom react-redux
    ```

=== "pnpm"

    ```bash
    pnpm add @pihanga2/core react react-dom react-redux
    ```

## TypeScript

`@pihanga2/core` ships with full TypeScript declarations. No separate `@types/` package is required.

Ensure your `tsconfig.json` targets at least `ES2019` and uses `moduleResolution: bundler` (or `node16`):

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true
  }
}
```

## Entry points

| Import path | Contents |
|---|---|
| `@pihanga2/core` | Main API — `register`, `start`, `Card`, `usePiReducer`, … |
| `@pihanga2/core/types` | TypeScript types only (no runtime code) |
| `@pihanga2/core/rest` | REST registration helpers |
