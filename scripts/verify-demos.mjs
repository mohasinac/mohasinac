/**
 * Every lesson demo builds a renderable walkthrough — including with NO
 * arguments, which is what an author writes first.
 *
 * 🛑 A demo that throws takes the whole lesson page down (it is built during a
 * server render), and a demo that returns a trace the player cannot draw
 * renders "No visualization available" — silently, inside a lesson that says
 * one is there. Neither shows up in a typecheck.
 *
 * Also checks that every `demo` named in a lesson's ```viz fence is registered,
 * which is the other half: a typo in a fence renders an error block on a live
 * lesson page.
 *
 *   npm run verify:demos
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const P = (rel) => pathToFileURL(join(ROOT, rel)).href;

const structures = await import(P("src/packages/dsa/src/dsa/structures.ts"));
const demos = await import(P("src/packages/dsa/src/dsa/demos.ts"));

/**
 * Mirrors the DEMOS registry in src/components/LessonViz.tsx. Kept as a list of
 * names here and cross-checked against that file below, so the two cannot
 * drift apart without this failing.
 */
const BUILD = {
  linearSearch: () => structures.tracedLinearSearch([4, 8, 15, 16, 23, 42], 16),
  binarySearch: () => structures.tracedBinarySearch([1, 3, 5, 7, 9, 11, 13], 9),
  twoPointers: () => structures.tracedTwoPointers([1, 3, 4, 6, 8, 11], 10),
  slidingWindow: () => demos.tracedSlidingWindow([2, 1, 5, 1, 3, 2], 3),
  monotonicStack: () => demos.tracedMonotonicStack([2, 1, 2, 4, 3]),
  dpTable: () => demos.tracedDpTable(8),
  bits: () => demos.tracedBits(23),
  stack: () => structures.tracedStackDemo([1, 2, 3]),
  queue: () => structures.tracedQueueDemo([1, 2, 3]),
  dynamicArray: () => demos.tracedDynamicArray([3, 1, 4, 1, 5, 9, 2]),
  linkedList: () => demos.tracedLinkedList([3, 2, 1]),
  heap: () => demos.tracedHeap([5, 3, 8, 1, 9, 2]),
  bst: () => demos.tracedBst([8, 3, 10, 1, 6, 14], 6),
  hashTable: () => demos.tracedHashTable([10, 22, 15, 7, 31], 5),
  dsu: () => demos.tracedDsu([0, 1, 2, 3, 1, 2, 0, 3], 6),
  bfs: () => demos.tracedBfs([[1, 2], [0, 3], [0, 3], [1, 2, 4], [3]], 0),
};

/** Kinds VizPlayer dispatches to a renderer. Must match its switch. */
const RENDERED = new Set(["array", "grid", "tree", "linkedList", "stack", "queue", "heap", "graph"]);

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: Boolean(ok), detail });

/* ------------------------------------------- every demo builds and is drawable */

for (const [name, build] of Object.entries(BUILD)) {
  let trace;
  try {
    trace = build();
  } catch (err) {
    check(`${name} builds`, false, String(err?.message ?? err));
    continue;
  }

  const spec = trace.specs?.[0];
  const frames = trace.frames ?? [];

  // 🛑 A spec is REQUIRED here: chrome="explain" has only the diagram, so a
  // spec-less walkthrough renders "No visualization available" inside a
  // lesson that claims one is present.
  if (!spec) {
    check(`${name} declares a spec`, false, "no specs[0] — explain chrome cannot render");
    continue;
  }
  if (!RENDERED.has(spec.kind)) {
    check(`${name} uses a rendered kind`, false, `kind "${spec.kind}" has no renderer`);
    continue;
  }

  // The drawn variable must exist in at least one frame, or the diagram is
  // empty at every step while the captions talk about it.
  const drawable = frames.some((f) => {
    const v = f.vars?.[spec.var];
    return Array.isArray(v) && v.length > 0;
  });

  const narrated = frames.filter((f) => typeof f.note === "string" && f.note.trim() !== "").length;

  const ok = frames.length >= 2 && drawable && narrated === frames.length;
  check(
    `${name}: ${spec.kind} of "${spec.var}"`,
    ok,
    `${frames.length} frames, ${narrated} narrated${drawable ? "" : ", NOTHING DRAWABLE"}`,
  );
}

/* --------------------- the registry and the lesson fences agree with each other */

const lessonViz = readFileSync(join(ROOT, "src/components/LessonViz.tsx"), "utf8");
const registered = new Set(
  [...lessonViz.matchAll(/^\s{2}([A-Za-z][\w]*):\s*\(d\)\s*=>/gm)].map((m) => m[1]),
);

const missingFromRegistry = Object.keys(BUILD).filter((n) => !registered.has(n));
const missingFromScript = [...registered].filter((n) => !(n in BUILD));
check(
  "this script covers every registered demo",
  missingFromScript.length === 0,
  missingFromScript.join(", "),
);
check(
  "every demo this script knows is registered",
  missingFromRegistry.length === 0,
  missingFromRegistry.join(", "),
);

/* ----------------------------- every fence in every lesson names a real demo */

const lessonDir = join(ROOT, "content/lessons");
let fences = 0;
const badNames = [];
const lessonsWithViz = [];

for (const file of readdirSync(lessonDir).filter((f) => f.endsWith(".md"))) {
  const body = readFileSync(join(lessonDir, file), "utf8");
  const blocks = [...body.matchAll(/^```viz\s*$\n([\s\S]*?)^```\s*$/gm)].map((m) => m[1]);
  if (blocks.length > 0) lessonsWithViz.push(file.replace(/\.md$/, ""));
  for (const block of blocks) {
    fences++;
    let directive;
    try {
      directive = JSON.parse(block);
    } catch {
      badNames.push(`${file}: unparseable JSON`);
      continue;
    }
    if (!directive?.demo || !registered.has(directive.demo)) {
      badNames.push(`${file}: unknown demo "${directive?.demo}"`);
    }
  }
}

check(`every viz fence names a registered demo (${fences} fences)`, badNames.length === 0, badNames.join("; "));

/* ----------------------------------------------------------------- report */

console.log("");
let failed = 0;
for (const r of results) {
  if (r.ok) console.log(`  PASS  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
  else {
    failed++;
    console.log(`  FAIL  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
  }
}

const kinds = {};
for (const build of Object.values(BUILD)) {
  try {
    const k = build().specs?.[0]?.kind ?? "(none)";
    kinds[k] = (kinds[k] ?? 0) + 1;
  } catch {
    /* already reported above */
  }
}
console.log(`\n  ${results.length - failed} passed, ${failed} failed`);
console.log(`  renderers exercised: ${Object.entries(kinds).map(([k, n]) => `${k}=${n}`).join(" ")}`);
const unused = [...RENDERED].filter((k) => !(k in kinds));
if (unused.length > 0) console.log(`  note: no demo uses ${unused.join(", ")}`);
console.log(`  lessons with a visualization: ${lessonsWithViz.length} of ${readdirSync(lessonDir).filter((f) => f.endsWith(".md")).length}`);
console.log("");
process.exit(failed ? 1 : 0);
