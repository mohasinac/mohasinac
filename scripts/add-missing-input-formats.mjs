/**
 * Give the problems without an `inputFormat` one, so every problem that CAN
 * have a Tier 1 explainer does.
 *
 * 🛑 Two are deliberately left without, and that is a decision rather than an
 * omission. The stated rule is "never guess the format — a confidently
 * mis-parsed diagram teaches something false, which is worse than no diagram":
 *
 *   - `merge-k-sorted-lists` takes k lines of "len v v v…", i.e. a per-line
 *     embedded length. No reader expresses that, and the near-misses all
 *     mis-draw it: `rest` would mix the lengths in with the values, and
 *     `lines` would render each whole line as a single node.
 *   - `implement-trie-prefix-tree` takes a SCRIPT of operations
 *     ("insert apple", "search app"). There is no data structure in the input
 *     at all — the trie only exists once the operations have run — so a
 *     "before you code" diagram has nothing truthful to show.
 *
 * Both still have a working reference trace, which is where their
 * visualization actually lives.
 *
 *   node scripts/add-missing-input-formats.mjs          # verify by parsing
 *   node scripts/add-missing-input-formats.mjs --write  # apply
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "content/problems");
const WRITE = process.argv.includes("--write");

const { parseInput } = await import(
  pathToFileURL(join(ROOT, "src/packages/dsa/src/scenarios/input-format.ts")).href
);

/** slug -> { inputFormat, vizVar? } */
const FORMATS = {
  "word-break": {
    // `s` and `m` are both plain tokens; the dictionary is the next line.
    inputFormat: [
      { read: "scalars", names: ["s", "m"] },
      { read: "tokens", name: "words" },
    ],
    vizVar: "s",
  },

  "course-schedule": {
    // Prerequisite PAIRS, so `rest` yields a flat edge list — which is exactly
    // what the graph renderer decodes a flat value as.
    inputFormat: [
      { read: "scalars", names: ["n", "m"] },
      { read: "rest", name: "edges" },
    ],
    vizVar: "edges",
  },

  "merge-two-sorted-lists": {
    inputFormat: [
      { read: "scalars", names: ["n"] },
      { read: "array", name: "a", length: "n" },
      { read: "scalars", names: ["m"] },
      { read: "array", name: "b", length: "m" },
    ],
    vizVar: "a",
  },

  "linked-list-cycle": {
    inputFormat: [
      { read: "scalars", names: ["n"] },
      { read: "array", name: "nodes", length: "n" },
      { read: "scalars", names: ["pos"] },
    ],
    vizVar: "nodes",
  },

  "word-search": {
    // `lines` keeps each row as a string, which is how the grid renderer wants
    // a character board — same as number-of-islands.
    inputFormat: [
      { read: "scalars", names: ["rows", "cols"] },
      { read: "lines", name: "board", count: "rows" },
      { read: "scalars", names: ["word"] },
    ],
    vizVar: "board",
  },

  "kth-smallest-element-in-a-bst": {
    // `tokens`, not `rest`: `rest` would swallow k into the tree.
    inputFormat: [
      { read: "tokens", name: "nodes" },
      { read: "scalars", names: ["k"] },
    ],
    vizVar: "nodes",
  },

  "lowest-common-ancestor-of-a-bst": {
    inputFormat: [
      { read: "tokens", name: "nodes" },
      { read: "scalars", names: ["p", "q"] },
    ],
    vizVar: "nodes",
  },
};

const results = [];

for (const file of readdirSync(DIR).filter((f) => f.endsWith(".json")).sort()) {
  const path = join(DIR, file);
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  const list = Array.isArray(parsed) ? parsed : (parsed.items ?? []);
  let touched = false;

  for (const problem of list) {
    const spec = FORMATS[problem.slug];
    if (!spec) continue;

    if (problem.inputFormat) {
      results.push({ slug: problem.slug, ok: true, msg: "already has one — left alone" });
      continue;
    }

    // 🛑 Verified by PARSING the problem's own samples, not by inspection. A
    // descriptor that parses nothing produces a silently absent panel.
    let allOk = true;
    for (const [i, tc] of (problem.testCases ?? []).entries()) {
      const r = parseInput(tc.input, spec.inputFormat);
      if (!r.ok) {
        results.push({ slug: problem.slug, ok: false, msg: `case ${i + 1} did not parse: ${r.reason}` });
        allOk = false;
        break;
      }
      // The drawn variable must exist and have something in it.
      const drawn = spec.vizVar ? r.values[spec.vizVar] : undefined;
      if (spec.vizVar && (drawn === undefined || (Array.isArray(drawn) && drawn.length === 0))) {
        // An empty value is legitimate for an edge case (an empty list), so
        // only the FIRST case is required to be drawable.
        if (i === 0) {
          results.push({
            slug: problem.slug,
            ok: false,
            msg: `case 1 parsed but "${spec.vizVar}" is empty — nothing to draw`,
          });
          allOk = false;
          break;
        }
      }
    }
    if (!allOk) continue;

    const cases = (problem.testCases ?? []).length;
    results.push({ slug: problem.slug, ok: true, msg: `parses all ${cases} cases, draws "${spec.vizVar}"` });

    if (WRITE) {
      problem.inputFormat = spec.inputFormat;
      if (spec.vizVar) problem.vizVar = spec.vizVar;
      touched = true;
    }
  }

  if (WRITE && touched) writeFileSync(path, `${JSON.stringify(parsed, null, 2)}\n`);
}

console.log("");
let failed = 0;
for (const r of results) {
  if (r.ok) console.log(`  PASS  ${r.slug}: ${r.msg}`);
  else {
    failed++;
    console.log(`  FAIL  ${r.slug}: ${r.msg}`);
  }
}
console.log(`\n  ${results.length - failed} passed, ${failed} failed`);
if (!WRITE && failed === 0) console.log("  verify-only — pass --write to apply\n");
process.exit(failed ? 1 : 0);
