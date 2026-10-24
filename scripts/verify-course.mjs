/**
 * Verify the seeded course data, with the security property first.
 *
 * 🛑 The check that matters: a HIDDEN test case must carry `expectedHash` and
 * must NOT carry `expectedOutput`. The problem page reads this subcollection
 * and ships sample-case fields to the browser, so a plaintext expectation on a
 * hidden case is one refactor away from being served to the learner — which
 * would make the whole exercise pointless.
 *
 * This is a script, not an inline `node -e`, because the service-account
 * private key must never pass through a shell: inline escaping silently
 * corrupts it and surfaces as `error:1E08010C:DECODER routines::unsupported`,
 * which names neither the cause nor the file.
 *
 *   node scripts/verify-course.mjs
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

const problems = [];

async function main() {
  console.log(`\nVerifying seeded course data in "${env.FIREBASE_ADMIN_PROJECT_ID}"\n`);

  const counts = {};
  for (const [label, collection] of [
    ["tracks", "courseTracks"],
    ["modules", "courseModules"],
    ["lessons", "lessons"],
    ["problems", "problems"],
  ]) {
    const snap = await db.collection(collection).where("status", "==", "published").get();
    counts[label] = snap.size;
    console.log(`  ${label.padEnd(10)} ${String(snap.size).padStart(3)} published`);
    if (label === "problems") snap.docs.forEach((d) => problems.push(d));
  }

  // --- referential integrity ------------------------------------------------
  const trackSlugs = new Set(
    (await db.collection("courseTracks").get()).docs.map((d) => d.data().slug),
  );
  const moduleSlugs = new Set(
    (await db.collection("courseModules").get()).docs.map((d) => d.data().slug),
  );

  let orphans = 0;
  for (const d of (await db.collection("courseModules").get()).docs) {
    if (!trackSlugs.has(d.data().trackSlug)) {
      console.log(`  ORPHAN module ${d.data().slug} -> track "${d.data().trackSlug}"`);
      orphans++;
    }
  }
  for (const d of (await db.collection("lessons").get()).docs) {
    if (!moduleSlugs.has(d.data().moduleSlug)) {
      console.log(`  ORPHAN lesson ${d.data().slug} -> module "${d.data().moduleSlug}"`);
      orphans++;
    }
  }

  // --- the security check ---------------------------------------------------
  let sample = 0;
  let hidden = 0;
  let leaks = 0;
  let noHash = 0;
  let noCases = 0;

  for (const problem of problems) {
    const slug = problem.data().slug;
    const cases = await problem.ref.collection("testCases").get();
    if (cases.empty) {
      console.log(`  NO TEST CASES: ${slug} (unsolvable — submit returns 409)`);
      noCases++;
      continue;
    }
    for (const c of cases.docs) {
      const data = c.data();
      if (data.visibility === "sample") {
        sample++;
        if (data.expectedOutput === undefined) {
          console.log(`  sample case without expectedOutput: ${slug}/${c.id}`);
        }
      } else {
        hidden++;
        if (data.expectedOutput !== undefined) {
          console.log(`  🛑 LEAK — hidden case stores plaintext: ${slug}/${c.id}`);
          leaks++;
        }
        if (typeof data.expectedHash !== "string" || data.expectedHash.length !== 64) {
          console.log(`  hidden case without a valid sha256: ${slug}/${c.id}`);
          noHash++;
        }
      }
    }
  }

  console.log(`\n  test cases  ${sample} sample, ${hidden} hidden`);
  console.log(`  plaintext leaks in hidden cases: ${leaks}`);
  console.log(`  hidden cases missing a valid hash: ${noHash}`);
  console.log(`  problems with no test cases: ${noCases}`);
  console.log(`  orphaned references: ${orphans}\n`);

  const failed = leaks + noHash + noCases + orphans;
  console.log(failed ? `FAILED — ${failed} problem(s)\n` : "All checks passed.\n");
  process.exit(failed ? 1 : 0);
}

await main();
