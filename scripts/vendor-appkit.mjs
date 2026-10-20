#!/usr/bin/env node
/**
 * Re-vendor @mohasinac/appkit from the build host as a packed tarball.
 *
 * WHY a vendored tarball rather than the npm registry:
 * publishing is blocked on this account — the npm token is a granular one
 * without publish rights, and 2FA requires an interactive OTP. Two
 * `npm publish --tag next` runs reported success and nothing ever reached the
 * registry (`npm profile get` returns 403). Until that is sorted, the branch
 * build ships here instead.
 *
 * WHY a tarball rather than a symlink or `file:` directory:
 * npm EXTRACTS a tarball into node_modules, exactly as it would a published
 * package. A symlink (or a `file:` pointing at a directory) is linked instead,
 * which makes appkit resolve its own React through the worktree path — the
 * dual-instance SSR crash that appkit's dedupe-peer-deps postinstall exists to
 * prevent. A tarball also survives the trip to Vercel, which a symlink to a
 * directory outside the repo cannot.
 *
 * Usage: node scripts/vendor-appkit.mjs [--check]
 *   --check  exit 1 if the build host is newer than the vendored tarball
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, rmSync, statSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = process.argv.includes("--check");
const SOURCE = process.env.APPKIT_SOURCE ?? join(ROOT, "..", "appkit-build", "appkit");
const VENDOR = join(ROOT, "vendor");

if (!existsSync(join(SOURCE, "package.json"))) {
  console.error(`[vendor-appkit] build host not found at ${SOURCE}. Set APPKIT_SOURCE.`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(SOURCE, "package.json"), "utf8"));
const expected = `mohasinac-appkit-${pkg.version}.tgz`;
const existing = existsSync(VENDOR)
  ? readdirSync(VENDOR).filter((f) => f.endsWith(".tgz"))
  : [];

/** Newest mtime under dist/ — the build output the tarball is made from. */
function newestDistMtime() {
  let newest = 0;
  const walk = (p) => {
    const st = statSync(p);
    if (st.isDirectory()) for (const e of readdirSync(p)) walk(join(p, e));
    else if (st.mtimeMs > newest) newest = st.mtimeMs;
  };
  walk(join(SOURCE, "dist"));
  return newest;
}

if (CHECK) {
  const current = join(VENDOR, expected);
  if (!existsSync(current)) {
    console.error(`[vendor-appkit] STALE: ${expected} is missing. Run "npm run vendor:appkit".`);
    process.exit(1);
  }
  if (newestDistMtime() > statSync(current).mtimeMs) {
    console.error(
      `[vendor-appkit] STALE: ${SOURCE}/dist is newer than vendor/${expected}.\n` +
        `  Rebuild the host, then run "npm run vendor:appkit".`,
    );
    process.exit(1);
  }
  console.log(`[vendor-appkit] up to date (v${pkg.version}).`);
  process.exit(0);
}

if (!existsSync(join(SOURCE, "dist"))) {
  console.error(`[vendor-appkit] ${SOURCE}/dist is missing — run "npm run build" in the host first.`);
  process.exit(1);
}

console.log(`[vendor-appkit] packing ${pkg.name}@${pkg.version} …`);
execFileSync("npm", ["pack", "--pack-destination", VENDOR], {
  cwd: SOURCE,
  stdio: ["ignore", "pipe", "pipe"],
  shell: process.platform === "win32",
});

// Drop superseded tarballs so the repo never accumulates 6 MB blobs.
for (const f of existing) {
  if (f !== expected) {
    rmSync(join(VENDOR, f));
    console.log(`[vendor-appkit] removed stale ${f}`);
  }
}

// Keep package.json pointing at the version actually vendored.
const appPkgPath = join(ROOT, "package.json");
const appPkg = JSON.parse(readFileSync(appPkgPath, "utf8"));
const spec = `file:vendor/${expected}`;
if (appPkg.dependencies["@mohasinac/appkit"] !== spec) {
  appPkg.dependencies["@mohasinac/appkit"] = spec;
  writeFileSync(appPkgPath, `${JSON.stringify(appPkg, null, 2)}\n`);
  console.log(`[vendor-appkit] package.json -> ${spec}`);
}

const bytes = statSync(join(VENDOR, expected)).size;
console.log(`[vendor-appkit] vendored ${expected} (${(bytes / 1048576).toFixed(1)} MB)`);
console.log(`[vendor-appkit] run "npm install" to extract it into node_modules.`);
