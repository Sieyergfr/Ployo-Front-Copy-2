import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Prüf-Build aus NEXT_BUILD_DIR (s. next.config.ts): dasselbe generierte
    // Zeug wie in .next, nur unter anderem Namen — ohne diesen Eintrag meldet
    // ein `npx eslint` nach so einem Build zehntausende Treffer im Build-Output.
    ".next-check/**",
  ]),
]);

export default eslintConfig;
