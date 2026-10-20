#!/usr/bin/env node
/**
 * sync-appkit.mjs — link the locally-built appkit into this app's node_modules.
 *
 * While the appkit work lives on an unmerged, unpublished branch
 * (`feat/mohasinac-site`), `npm install` resolves `@mohasinac/appkit` from the
 * npm registry and therefore does NOT contain it. This script copies the built
 * `dist/` (plus the files the exports map reaches) from the build-host worktree
 * over the installed copy, the same approach letitrip.in uses.
 *
 *   build host:  d:\proj\appkit-build\appkit   (worktree, branch feat/mohasinac-site)
 *   target:      ./node_modules/@mohasinac/appkit
 *
 * Why a copy rather than `npm link` or `file:`: a symlink makes Turbopack
 * resolve appkit's own React imports through the worktree's path, which
 * reintroduces the dual-instance SSR crash that appkit's dedupe-peer-deps
 * postinstall exists to prevent.
 *
 * Usage:
 *   node scripts/sync-appkit.mjs           # copy if stale
 *   node scripts/sync-appkit.mjs --check   # exit 1 if stale (for CI / pre-commit)
 */
import { cpSync, existsSync, readFileSync, rmSync, statSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = process.argv.includes("--check");

const SOURCE =
  process.env.APPKIT_SOURCE ?? join(ROOT, "..", "appkit-build", "appkit");
const TARGET = join(ROOT, "node_modules", "@mohasinac", "appkit");

// Everything the published package exposes. Mirrors appkit's package.json
// "files" plus the asset directories its exports map reaches.
const SYNCED = ["dist", "firebase", "package.json"];

function fail(message) {
  console.error(`[sync-appkit] ${message}`);
  process.exit(1);
}

if (!existsSync(SOURCE)) {
  fail(
    `appkit build host not found at ${SOURCE}.\n` +
      `  Create it with:\n` +
      `    git -C <appkit-repo> worktree add ${SOURCE} feat/mohasinac-site\n` +
      `  or point APPKIT_SOURCE at an existing checkout.`,
  );
}
if (!existsSync(join(SOURCE, "dist"))) {
  fail(`${SOURCE}/dist is missing — run "npm run build" in the build host first.`);
}
if (!existsSync(TARGET)) {
  fail(`${TARGET} is missing — run "npm install" before syncing.`);
}

/** Newest mtime anywhere under a path; used as a cheap staleness signal. */
function newestMtime(path) {
  let newest = 0;
  const walk = (p) => {
    const st = statSync(p);
    if (st.isDirectory()) {
      for (const entry of readdirSync(p)) walk(join(p, entry));
    } else if (st.mtimeMs > newest) {
      newest = st.mtimeMs;
    }
  };
  walk(path);
  return newest;
}

const srcVersion = JSON.parse(readFileSync(join(SOURCE, "package.json"), "utf8")).version;
const stale = [];

for (const name of SYNCED) {
  const from = join(SOURCE, name);
  if (!existsSync(from)) continue;
  const to = join(TARGET, name);
  if (!existsSync(to) || newestMtime(from) > newestMtime(to)) stale.push(name);
}

if (stale.length === 0) {
  console.log(`[sync-appkit] already in sync (v${srcVersion}).`);
  process.exit(0);
}

if (CHECK) {
  fail(
    `STALE: node_modules/@mohasinac/appkit/{${stale.join(", ")}} is older than the build host.\n` +
      `  Run "npm run sync:appkit" (and rebuild the host if you changed appkit source).`,
  );
}

for (const name of stale) {
  const from = join(SOURCE, name);
  const to = join(TARGET, name);
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
}

console.log(`[sync-appkit] synced ${stale.join(", ")} from ${SOURCE} (v${srcVersion}).`);
