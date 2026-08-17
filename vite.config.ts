import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";

/**
 * Library build configuration.
 *
 * Using Vite (Rollup) instead of bare `tsc` so that relative imports in
 * the emitted ESM output carry proper `.js` extensions — a requirement for
 * native ESM consumers (Node, Deno, Vitest in node mode, etc.).
 *
 * `preserveModules: true` keeps one output file per source file (same tree
 * as `src/`), which preserves the existing `package.json` export map and
 * allows consumers to tree-shake at the module level.
 */
export default defineConfig({
  plugins: [
    react(),
    dts({
      include: ["src"],
      tsconfigPath: "./tsconfig.json",
    }),
  ],
  build: {
    lib: {
      entry: {
        index: "src/index.ts",
        "rest/index": "src/rest/index.ts",
        "rest/mock": "src/rest/mock.ts",
      },
      formats: ["es"],
    },
    rollupOptions: {
      external: [
        "react",
        "react/jsx-runtime",
        "react-dom",
        "react-dom/client",
        "react-redux",
        "@reduxjs/toolkit",
        "immer",
        "tslog",
        "fast-deep-equal",
        "history",
        "stacktrace-js",
      ],
      output: {
        // One .js file per source file — mirrors the src/ tree under dist/.
        // Rollup automatically appends .js to all relative imports.
        preserveModules: true,
        preserveModulesRoot: "src",
        entryFileNames: "[name].js",
      },
    },
    sourcemap: true,
    minify: false,
  },
});
