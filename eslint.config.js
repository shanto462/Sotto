import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/**", "dist/**", "build/**"],
  },
  js.configs.recommended,
  {
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },
  // Electron main process, shared library, scripts and tests (Node, ESM).
  {
    files: ["desktop/*.js", "desktop/windows/**/*.js", "src/**/*.js", "assets/**/*.js", "test/**/*.js", "*.js"],
    languageOptions: { sourceType: "module", globals: globals.node },
  },
  // Preload scripts run as CommonJS inside the sandboxed renderer.
  {
    files: ["desktop/preload/**/*.cjs"],
    languageOptions: { sourceType: "commonjs", globals: { ...globals.node, ...globals.browser } },
  },
  // Renderer UI (classic scripts in the browser).
  {
    files: ["desktop/ui/**/*.js"],
    languageOptions: { sourceType: "script", globals: globals.browser },
  },
  // Chrome MV3 extension.
  {
    files: ["extension/**/*.js"],
    languageOptions: {
      sourceType: "module",
      globals: { ...globals.browser, ...globals.webextensions, ...globals.serviceworker },
    },
  },
];
