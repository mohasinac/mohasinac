#!/usr/bin/env node
/**
 * Point .env.local's FIREBASE_ADMIN_* variables at a service-account JSON,
 * without the key ever passing through a shell (where backslash escaping
 * silently corrupts it — a mangled key fails with the distinctly unhelpful
 * "error:1E08010C:DECODER routines::unsupported").
 *
 * The JSON is read in place and NOT copied into the repo.
 *
 * Usage: node scripts/set-admin-key.mjs "C:/path/to/key.json"
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const src = process.argv[2];
if (!src || !existsSync(src)) {
  console.error(`usage: node scripts/set-admin-key.mjs <service-account.json>\n  not found: ${src ?? "(no path given)"}`);
  process.exit(1);
}

const sa = JSON.parse(readFileSync(src, "utf8"));
for (const field of ["project_id", "client_email", "private_key"]) {
  if (!sa[field]) {
    console.error(`not a service-account key: missing "${field}"`);
    process.exit(1);
  }
}

const ENV = ".env.local";
let env = readFileSync(ENV, "utf8");

const set = (key, value) => {
  const line = `${key}="${value}"`;
  const re = new RegExp(`^${key}=.*$`, "m");
  env = re.test(env) ? env.replace(re, line) : `${env.replace(/\n*$/, "")}\n${line}\n`;
};

set("FIREBASE_ADMIN_PROJECT_ID", sa.project_id);
set("FIREBASE_ADMIN_CLIENT_EMAIL", sa.client_email);
// Store with literal \n escapes; appkit's parsePrivateKey converts them back.
set("FIREBASE_ADMIN_PRIVATE_KEY", sa.private_key.replace(/\r/g, "").replace(/\n/g, "\\n"));

writeFileSync(ENV, env);

// Prove the stored form round-trips to a valid PEM before claiming success.
const stored = env.match(/^FIREBASE_ADMIN_PRIVATE_KEY="(.*)"$/m)?.[1] ?? "";
const roundTripped = stored.replace(/\\n/g, "\n");
const ok =
  roundTripped.startsWith("-----BEGIN PRIVATE KEY-----") &&
  roundTripped.trimEnd().endsWith("-----END PRIVATE KEY-----") &&
  roundTripped.split("\n").length > 10;

console.log(`key id       ${sa.private_key_id?.slice(0, 10) ?? "?"}…`);
console.log(`client email ${sa.client_email}`);
console.log(`PEM round-trip ${ok ? "OK" : "FAILED — the stored value is not a valid PEM"}`);
process.exit(ok ? 0 : 1);
