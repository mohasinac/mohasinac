#!/usr/bin/env node
/**
 * Generate `src/app/theme.generated.css` from the appkit theme presets.
 *
 * WHY this exists rather than importing `@mohasinac/appkit/tokens/tokens.css`:
 * the `technical-dark` / `technical-light` presets live on the appkit branch
 * `feat/mohasinac-site` and are not in any published version (4.54.1 is the
 * latest on npm). Vercel installs appkit from the registry, so the live site
 * cannot see them.
 *
 * This keeps ONE source of truth — appkit's `tokens.css` — and extracts the two
 * `[data-theme]` blocks verbatim into a committed artifact the deploy can use.
 * The output is generated, never hand-edited; re-run this after changing the
 * presets. Once the prerelease is published and pinned, delete the generated
 * file and import appkit's stylesheet directly.
 *
 * Usage: node scripts/sync-theme-css.mjs [--check]
 *   --check  exit 1 if the generated file is out of date (CI / pre-commit)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = process.argv.includes("--check");

const SOURCE =
  process.env.APPKIT_SOURCE ?? join(ROOT, "..", "appkit-build", "appkit");
const TOKENS_CSS = join(SOURCE, "src", "tokens", "tokens.css");
const OUT = join(ROOT, "src", "app", "theme.generated.css");

const THEMES = ["technical-dark", "technical-light"];

if (!existsSync(TOKENS_CSS)) {
  console.error(
    `[sync-theme-css] appkit tokens.css not found at ${TOKENS_CSS}.\n` +
      `  This script needs the appkit build host. Set APPKIT_SOURCE or create the worktree.\n` +
      `  (The generated file is committed, so a normal build does NOT need this.)`,
  );
  process.exit(1);
}

const css = readFileSync(TOKENS_CSS, "utf8");

/** Extract a complete `[data-theme="id"] { … }` rule, preserving its comments. */
function extractBlock(id) {
  const re = new RegExp(`\\[data-theme="${id}"\\]\\s*\\{[\\s\\S]*?\\n\\}`);
  const m = css.match(re);
  if (!m) throw new Error(`no [data-theme="${id}"] block in appkit tokens.css`);
  return m[0];
}

const blocks = THEMES.map(extractBlock);

const header = `/*
 * GENERATED FILE — DO NOT EDIT.
 *
 * Source: appkit src/tokens/tokens.css (branch feat/mohasinac-site)
 * Regenerate: npm run sync:theme
 *
 * Carries the technical-dark / technical-light token blocks, which are not in
 * any published @mohasinac/appkit version yet. Replace this with a direct
 * import of appkit's tokens.css once the prerelease is published and pinned.
 */
`;

const body = `${header}\n${blocks.join("\n\n")}\n`;

if (CHECK) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (current !== body) {
    console.error(
      "[sync-theme-css] STALE: src/app/theme.generated.css differs from the appkit presets.\n" +
        '  Run "npm run sync:theme".',
    );
    process.exit(1);
  }
  console.log("[sync-theme-css] up to date.");
  process.exit(0);
}

writeFileSync(OUT, body);
const tokenCount = (body.match(/--appkit-[a-z0-9-]+:/g) ?? []).length;
console.log(
  `[sync-theme-css] wrote ${THEMES.length} theme block(s), ${tokenCount} declarations -> src/app/theme.generated.css`,
);
