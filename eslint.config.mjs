import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * Flat ESLint config.
 *
 * Until this file existed, `npm run lint` exited 0 having checked nothing, and
 * `npm run check` reported success on the strength of it.
 *
 * eslint-config-next 16 ships native flat config, so it is imported directly.
 * The `FlatCompat` bridge is not used: running these configs through it hits a
 * circular reference in the plugin graph ("property 'react' closes the circle")
 * and crashes before linting anything.
 */
export default [
  ...coreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/toolchain/**", // staged clang wasm + sysroot, not our source
      "vendor/**",
    ],
  },
  {
    rules: {
      // Allow intentionally-unused args/vars when prefixed with _.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    /*
     * The data layer is backend-only by design: firestore.rules denies every
     * client read and write. A client-side Firestore/Storage import compiles
     * and ships happily, then fails at runtime looking like a rules bug — so
     * make it a lint error instead. Auth is the deliberate exception and is
     * confined to src/lib/firebase-client.ts.
     */
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/firebase-client.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "firebase/firestore",
              message:
                "Backend-only Firestore: go through an API route using the Admin SDK. firestore.rules denies all client access.",
            },
            {
              name: "firebase/storage",
              message: "Backend-only Storage: upload via an API route using the Admin SDK.",
            },
          ],
        },
      ],
    },
  },
  {
    /*
     * @mohasinac/dsa is laid out to be lifted into its own repo unchanged, so
     * the boundary is enforced here rather than left to discipline — the whole
     * value of the package is that extracting it is a `git mv`, and one stray
     * `@/` import silently destroys that.
     *
     * Also keeps it framework-free, which is what stops it ever needing
     * appkit's dedupe-peer-deps hack.
     */
    files: ["src/packages/dsa/**/*.{ts,tsx}"],
    rules: {
      /*
       * 🛑 Constructor parameter properties need code GENERATION, not type
       * erasure, so `node --experimental-strip-types` refuses them outright
       * (ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX). The package's whole test story is
       * zero-dependency `node --test`, so one of these breaks the suite.
       *
       * Caught here because I wrote the same mistake twice after already
       * documenting it — which is the signal that a comment was not enough.
       */
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSParameterProperty",
          message:
            "Write the field longhand. Parameter properties need code generation, which node --experimental-strip-types refuses — it breaks `npm run test:dsa`.",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/*"],
              message:
                "@mohasinac/dsa must not import from the app — it is laid out to be extracted as its own repo. Take the value as a parameter instead.",
            },
            {
              group: ["next", "next/*", "server-only", "firebase", "firebase/*"],
              message:
                "@mohasinac/dsa stays framework-free and isomorphic: no Next, no server-only, no Firebase. Data arrives as plain props.",
            },
          ],
        },
      ],
    },
  },
];
