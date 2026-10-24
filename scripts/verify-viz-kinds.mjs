/**
 * Every published problem declares a `vizKind`, and every declared kind has a
 * renderer.
 *
 * 🛑 This exists because the renderers are unreachable without the data, and
 * both halves of that fail SILENTLY:
 *
 *   - a problem with no `vizKind` falls back to `array`, so a linked list
 *     renders as a flat strip, looking perfectly fine while teaching away the
 *     one thing that distinguishes a list from an array;
 *   - a declared kind with no renderer shows a "not built yet" note instead of
 *     a diagram.
 *
 * Neither throws, so neither would be noticed. Before this ran, only 7 of 53
 * problems declared a kind.
 *
 *   npm run verify:viz-kinds
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const app = initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    // The key is read from the file and never passed through a shell: inline
    // escaping corrupts it and surfaces as a DECODER error naming neither the
    // cause nor the file.
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/^﻿/, "").replace(/\\n/g, "\n"),
  }),
});

const snap = await getFirestore(app)
  .collection("problems")
  .where("status", "==", "published")
  .get();

const tally = {};
for (const doc of snap.docs) {
  const kind = doc.data().vizKind ?? "(none)";
  tally[kind] = (tally[kind] ?? 0) + 1;
}

/** Kinds VizPlayer actually dispatches to a renderer. */
const RENDERED = new Set(["array", "grid", "tree", "linkedList", "stack", "queue", "heap", "graph"]);

let failed = 0;

const missing = snap.docs.filter((d) => !d.data().vizKind).map((d) => d.id);
if (missing.length > 0) {
  failed++;
  console.log(`  FAIL  ${missing.length} problems declare no vizKind: ${missing.slice(0, 5).join(", ")}`);
} else {
  console.log(`  PASS  all ${snap.size} published problems declare a vizKind`);
}

const unrendered = Object.keys(tally).filter((k) => !RENDERED.has(k));
if (unrendered.length > 0) {
  failed++;
  console.log(`  FAIL  declared kinds with no renderer: ${unrendered.join(", ")}`);
} else {
  console.log("  PASS  every declared kind has a renderer");
}

const dist = Object.entries(tally)
  .sort((a, b) => b[1] - a[1])
  .map(([k, n]) => `${k}=${n}`)
  .join(" ");
console.log(`\n  distribution: ${dist}`);

// Reported, never failed: a renderer with no problem is not a bug. It does mean
// the corpus exercises nothing in it, which is worth knowing before trusting it.
const unused = [...RENDERED].filter((k) => !(k in tally));
if (unused.length > 0) {
  console.log(`  note: no problem uses ${unused.join(", ")} — untested by the corpus`);
}

console.log("");
process.exit(failed ? 1 : 0);
