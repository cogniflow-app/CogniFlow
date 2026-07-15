import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const serverOnlyImports = [
  "server-only",
  "@lumen/config/server-env",
  "@lumen/config/server-capabilities",
  "@lumen/config/server-environment-parser",
  "@lumen/config/server",
  "@lumen/database/server",
  "@lumen/database/route",
  "@lumen/database/test",
];

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    name: "lumen/base",
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports", prefer: "type-imports" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["error", { allow: ["warn", "error"] }],
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSEnumDeclaration",
          message: "Use const objects and union types so runtime representations stay explicit.",
        },
      ],
    },
  },
  {
    name: "lumen/client-boundaries",
    files: ["**/*.client.{ts,tsx}", "packages/ui/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: serverOnlyImports.map((name) => ({
            name,
            message: "Client code cannot import a server-only module.",
          })),
          patterns: [
            {
              group: [
                "**/server",
                "**/server-env",
                "**/server-capabilities",
                "**/server-environment-parser",
                "**/route",
                "**/test",
              ],
              message: "Client code cannot cross a server-only package boundary.",
            },
          ],
        },
      ],
    },
  },
  {
    name: "lumen/domain-boundary",
    files: ["packages/domain/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/*", "react", "react/*", "@supabase/*", "@lumen/database/*"],
              message: "The domain package must remain framework and provider independent.",
            },
          ],
        },
      ],
    },
  },
  {
    name: "lumen/test-files",
    files: ["**/*.{test,spec}.{ts,tsx}", "tests/**/*.{ts,tsx}", "e2e/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  globalIgnores([
    "**/.next/**",
    "**/.open-next/**",
    "**/.turbo/**",
    "**/coverage/**",
    "**/dist/**",
    "**/node_modules/**",
    "**/playwright-report/**",
    "**/test-results/**",
    "supabase/.temp/**",
    "ALL_CODEX_PROMPTS.md",
  ]),
]);
