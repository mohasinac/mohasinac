/**
 * Run the exact queries the public pages run, and report whether each one
 * actually answers.
 *
 * This is the check the build could not make: `listPublished` swallows a
 * FAILED_PRECONDITION and falls back to bundled content, so a missing index
 * produces a page that renders fine while serving stale data. Here the failure
 * is reported instead of hidden.
 *
 *   node scripts/verify-queries.mjs
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const env = {};
for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)="?([\s\S]*?)"?$/);
  if (m && !line.trim().startsWith("#")) env[m[1]] = m[2];
}

const app = initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/^﻿/, "")
      .replace(/^["']|["']$/g, "")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "")
      .trim(),
  }),
});
const db = getFirestore(app);

/** Mirrors the orderBy in src/lib/resources.ts. */
const LISTS = [
  ["projects", "sortOrder", "asc"],
  ["tools", "sortOrder", "asc"],
  ["certifications", "issuedAt", "desc"],
  ["hobbies", "sortOrder", "asc"],
  ["businesses", "sortOrder", "asc"],
  ["blogPosts", "publishedAt", "desc"],
  ["courseTracks", "sortOrder", "asc"],
  ["courseModules", "sortOrder", "asc"],
  ["lessons", "sortOrder", "asc"],
  ["problems", "sortOrder", "asc"],
];

/** Mirrors listChildren: two equality filters. */
const CHILDREN = [
  ["courseModules", "trackSlug", "foundations"],
  ["lessons", "moduleSlug", "approach"],
];

let failed = 0;

console.log(`\nRunning the public pages' real queries against "${env.FIREBASE_ADMIN_PROJECT_ID}"\n`);

for (const [collection, field, direction] of LISTS) {
  try {
    const snap = await db
      .collection(collection)
      .where("status", "==", "published")
      .orderBy(field, direction)
      .limit(300)
      .get();
    console.log(`  OK    ${collection.padEnd(16)} ${String(snap.size).padStart(3)} docs`);
  } catch (e) {
    const building = /currently building|still building/i.test(e.message);
    console.log(
      `  ${building ? "BUILD" : "FAIL "} ${collection.padEnd(16)} ${e.message.split("\n")[0].slice(0, 90)}`,
    );
    failed++;
  }
}

for (const [collection, field, value] of CHILDREN) {
  try {
    const snap = await db
      .collection(collection)
      .where(field, "==", value)
      .where("status", "==", "published")
      .get();
    console.log(`  OK    ${collection}.${field}=${value} -> ${snap.size} docs`);
  } catch (e) {
    console.log(`  FAIL  ${collection}.${field} — ${e.message.split("\n")[0].slice(0, 90)}`);
    failed++;
  }
}

console.log(
  failed
    ? `\n${failed} query/queries not answering yet. Indexes may still be building — re-run shortly.\n`
    : "\nEvery public query answers. No silent fallback.\n",
);
process.exit(failed ? 1 : 0);
