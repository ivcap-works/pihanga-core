import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Absolute paths to the local package sources — no build step required.
const PIHANGA_CORE_SRC = path.resolve(__dirname, "../src");
const PIHANGA_SHADCN_SRC = "/Users/ott030/src/pihanga2/pihanga-shadcn/src";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      // ── pihanga-shadcn internal @/ aliases ────────────────────────────────
      // pihanga-shadcn source files use @/lib, @/components/ui/...,
      // @/registry/ui/... and @/cards/... to reference their own src tree.
      // The example's own source files do NOT use @/ imports, so we can
      // safely redirect all @/ to pihanga-shadcn/src without conflict.
      {
        find: "@/lib",
        replacement: `${PIHANGA_SHADCN_SRC}/lib`,
      },
      {
        // @/registry → pihanga-shadcn/src/components
        // (shadcn convention: "registry" = the UI component registry, maps to components/)
        find: "@/registry",
        replacement: `${PIHANGA_SHADCN_SRC}/components`,
      },
      {
        find: "@/components",
        replacement: `${PIHANGA_SHADCN_SRC}/components`,
      },
      {
        find: "@/cards",
        replacement: `${PIHANGA_SHADCN_SRC}/cards`,
      },
      {
        // Catch-all: any remaining @/... → pihanga-shadcn/src/...
        find: "@",
        replacement: PIHANGA_SHADCN_SRC,
      },

      // ── Local pihanga-core source ─────────────────────────────────────────
      {
        find: /^@pihanga2\/core\/(.+)$/,
        replacement: `${PIHANGA_CORE_SRC}/$1`,
      },
      {
        find: "@pihanga2/core",
        replacement: path.resolve(PIHANGA_CORE_SRC, "index.ts"),
      },

      // ── Local pihanga-shadcn source ───────────────────────────────────────
      {
        find: /^@pihanga2\/shadcn\/(.+)$/,
        replacement: `${PIHANGA_SHADCN_SRC}/$1`,
      },
      {
        find: "@pihanga2/shadcn",
        replacement: path.resolve(PIHANGA_SHADCN_SRC, "cards/core-index.ts"),
      },
    ],
    dedupe: ["react", "react-dom", "react-redux", "@pihanga2/core"],
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname, ".."), "/Users/ott030/src/pihanga2/pihanga-shadcn"],
    },
  },
  optimizeDeps: {
    exclude: ["@pihanga2/core", "@pihanga2/shadcn"],
    include: ["fast-deep-equal", "stacktrace-js", "react-dom/client", "lucide-react"],
  },
});
