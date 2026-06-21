import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {ignores: ["dist", "coverage", "docs", "node_modules"]},
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {...globals.browser, ...globals.node},
    },
    rules: {
      // Downgraded to warn for existing Redux-interop code; prefer _-prefixed names in new code
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      // {} is used intentionally in generic type constraints throughout this library
      "@typescript-eslint/no-empty-object-type": "warn",
      // Redux interop requires any in many places; warn only for new code awareness
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
