/**
 * Node resolver hooks for the tsconfig path aliases.
 *
 * `@dsa/*` and `@/*` are TypeScript/bundler aliases — Next resolves them, Node
 * does not. Without this, a verify script cannot import any app module that
 * uses them, which would force either relative-path imports in app code
 * (inconsistent with every other file) or a bundler step just to run a test.
 *
 * Extensionless alias targets get `.ts`/`.tsx` appended, matching how the
 * TypeScript resolver treats them.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ALIASES = [
  ["@dsa/", "../src/packages/dsa/src/"],
  ["@/", "../src/"],
];

const CANDIDATE_SUFFIXES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

export async function resolve(specifier, context, next) {
  for (const [prefix, target] of ALIASES) {
    if (!specifier.startsWith(prefix)) continue;
    const rest = specifier.slice(prefix.length);
    for (const suffix of CANDIDATE_SUFFIXES) {
      const url = new URL(`${target}${rest}${suffix}`, import.meta.url);
      if (existsSync(fileURLToPath(url))) return next(url.href, context);
    }
    // Fall through to the default resolver, which will produce a clearer error
    // naming the specifier than anything thrown from here would.
    break;
  }
  return next(specifier, context);
}
