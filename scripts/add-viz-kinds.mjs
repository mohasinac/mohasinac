/**
 * Assign `vizKind` to every problem from the `patterns[]` it already carries.
 *
 * 🛑 The renderers are dead code without this. ChainView, SlabsView and
 * GraphView are all reachable only via a declared kind, and before this ran
 * only 7 tree problems declared one — so a linked-list problem would have
 * rendered as a flat strip, which is the exact thing the chain motif exists to
 * prevent.
 *
 * 🛑 STRUCTURAL patterns outrank ALGORITHMIC ones, which is the plan's motif
 * priority rule. `["tree","dfs"]` must render as a tree, not a graph, and
 * `["backtracking","matrix","dfs"]` is a grid — the algorithm is how you walk
 * the structure, not what the structure is.
 *
 * The data shape also constrains the kind, and that is why a few are
 * hand-listed rather than derived: `number-of-islands` is tagged
 * `graph traversal` but its input is a GRID, and decoding a grid as an
 * adjacency list would draw a graph that does not exist.
 *
 *   node scripts/add-viz-kinds.mjs          # report
 *   node scripts/add-viz-kinds.mjs --write  # apply
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "content/problems";
const WRITE = process.argv.includes("--write");

/**
 * Problems whose tagged pattern disagrees with their actual data shape. Each
 * one is a case where deriving from patterns alone would be wrong.
 */
const OVERRIDES = {
  // Flood fill over a character grid, not an adjacency list.
  "number-of-islands": "grid",
  // Backtracking over a board.
  "word-search": "grid",
  // Prerequisite PAIRS on stdin — an edge list, which the graph decoder reads
  // as pairs because the value is flat.
  "course-schedule": "graph",
  // A trie IS a tree, and `trie` is not in the tree pattern list.
  "implement-trie-prefix-tree": "tree",
  // Tagged `heap` but the interesting structure is the k-sized heap itself.
  "kth-largest-element-in-an-array": "heap",
  "top-k-frequent-elements": "heap",
  "meeting-rooms-ii": "heap",
  // A list problem that also uses a heap: the LIST is the structure.
  "merge-k-sorted-lists": "linkedList",
};

/** Checked in order — the first match wins, so structure comes first. */
const RULES = [
  { kind: "linkedList", patterns: ["linked list"] },
  { kind: "tree", patterns: ["tree", "bst", "trie"] },
  { kind: "grid", patterns: ["matrix", "2d dp"] },
  { kind: "graph", patterns: ["graph traversal", "topological sort", "cycle detection"] },
  { kind: "stack", patterns: ["stack", "monotonic stack"] },
  { kind: "queue", patterns: ["queue"] },
  { kind: "heap", patterns: ["heap"] },
  // Everything else is a sequence, and `array` is the only shape that is
  // honest about one. Deliberately NOT a guess at something more specific.
  { kind: "array", patterns: [] },
];

function kindFor(problem) {
  const override = OVERRIDES[problem.slug];
  if (override) return { kind: override, why: "override" };
  const patterns = (problem.patterns ?? []).map((p) => String(p).toLowerCase());
  for (const rule of RULES) {
    if (rule.patterns.length === 0) return { kind: rule.kind, why: "default" };
    const hit = rule.patterns.find((p) => patterns.includes(p));
    if (hit) return { kind: rule.kind, why: hit };
  }
  return { kind: "array", why: "default" };
}

let changed = 0;
let kept = 0;
const tally = {};

for (const file of readdirSync(DIR).filter((f) => f.endsWith(".json"))) {
  const path = join(DIR, file);
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw);
  const list = Array.isArray(parsed) ? parsed : (parsed.items ?? []);

  for (const problem of list) {
    const { kind, why } = kindFor(problem);
    tally[kind] = (tally[kind] ?? 0) + 1;

    if (problem.vizKind === kind) {
      kept++;
      continue;
    }
    if (problem.vizKind !== undefined) {
      // An existing value that disagrees is reported rather than silently
      // overwritten — authored intent beats a derivation.
      console.log(`  KEEP   ${problem.slug}: authored "${problem.vizKind}" (would derive "${kind}")`);
      kept++;
      continue;
    }
    console.log(`  SET    ${problem.slug} -> ${kind}  (${why})`);
    problem.vizKind = kind;
    changed++;
  }

  if (WRITE && changed > 0) {
    writeFileSync(path, `${JSON.stringify(parsed, null, 2)}\n`);
  }
}

console.log(`\n  ${changed} assigned, ${kept} already set`);
console.log(`  by kind: ${Object.entries(tally).map(([k, n]) => `${k}=${n}`).join(" ")}`);
if (!WRITE) console.log("\n  dry run — pass --write to apply\n");
