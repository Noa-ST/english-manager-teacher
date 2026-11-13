import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Architectural boundary: UI & Route Handlers must go through src/services/**.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/services/**", "src/lib/db/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/db/*", "@/generated/prisma*", "@prisma/client*"],
              message:
                "Direct database access is restricted to src/services/**. Call a service instead.",
            },
          ],
        },
      ],
    },
  },

  // Architectural boundary: core services stay framework-agnostic (no Next.js imports).
  {
    files: ["src/services/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/*"],
              message:
                "src/services/** must stay framework-agnostic. Move Next.js transport/cache concerns to src/lib/** or src/app/**.",
            },
          ],
        },
      ],
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
    ".agents/**",
  ]),
]);

export default eslintConfig;
