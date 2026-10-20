#!/usr/bin/env node
/**
 * Push .env.local into the linked Vercel project.
 *
 * Values are piped via stdin rather than passed as argv, so secrets never land
 * in a shell history or a process listing — and so the multi-line private key
 * survives (argv quoting mangles it; a corrupted key surfaces much later as
 * "DECODER routines::unsupported", which says nothing about the real cause).
 *
 * Skips VERCEL_* (Vercel owns those) and anything with an empty value, so an
 * unset optional variable is never pushed as "".
 *
 * Usage: node scripts/push-env-vercel.mjs [--dry-run]
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const DRY = process.argv.includes("--dry-run");
const TARGETS = ["production", "preview", "development"];

/**
 * Per-target overrides for values that are correct locally but wrong deployed.
 *
 * NEXT_PUBLIC_SITE_URL is the obvious trap: .env.local holds localhost:3000,
 * and pushing that to production would poison every canonical URL, OG tag and
 * sitemap entry with a hostname nobody else can reach.
 *
 * Preview keeps localhost deliberately unset — Vercel gives each preview its
 * own generated domain, so a hardcoded one would always be wrong; code should
 * fall back to VERCEL_URL there.
 */
const OVERRIDES = {
  NEXT_PUBLIC_SITE_URL: {
    production: "https://www.mohasinac.com",
    preview: null, // skip — use VERCEL_URL at runtime
  },
};

const raw = readFileSync(".env.local", "utf8");
const vars = [];
for (const line of raw.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const m = t.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  const [, key] = m;
  let value = m[2];
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
  if (!value) continue; // never push an empty optional
  if (/^VERCEL_/.test(key)) continue; // Vercel manages its own
  vars.push({ key, value });
}

console.log(`${vars.length} variable(s) to push across ${TARGETS.length} environment(s)\n`);

const npx = process.platform === "win32" ? "npx.cmd" : "npx";

const mask = (k, v) => (/KEY|TOKEN|SECRET/i.test(k) ? `${v.slice(0, 6)}… (${v.length} chars)` : v);

for (const { key, value } of vars) {
  for (const target of TARGETS) {
    const override = OVERRIDES[key]?.[target];
    if (override === null) {
      console.log(`  skip   ${key.padEnd(42)} [${target}] (resolved at runtime)`);
      continue;
    }
    const finalValue = override ?? value;
    const shown = mask(key, finalValue);

    if (DRY) {
      console.log(`  would push ${key.padEnd(42)} [${target}] ${shown}`);
      continue;
    }

    // Remove first so a re-run updates rather than erroring on a duplicate.
    spawnSync(npx, ["vercel", "env", "rm", key, target, "--yes"], {
      stdio: "ignore",
      shell: process.platform === "win32",
    });
    const r = spawnSync(npx, ["vercel", "env", "add", key, target], {
      input: finalValue,
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    console.log(
      r.status === 0
        ? `  pushed ${key.padEnd(42)} [${target}] ${shown}`
        : `  FAIL   ${key.padEnd(42)} [${target}] ${(r.stderr ?? "").trim().split("\n").pop()}`,
    );
  }
}

if (!DRY) {
  console.log(`\nDone. Redeploy for these to take effect: npx vercel deploy --prod`);
}
void execFileSync;
