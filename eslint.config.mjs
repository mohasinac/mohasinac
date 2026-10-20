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
];
