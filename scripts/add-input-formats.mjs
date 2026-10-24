/**
 * One-shot: attach an `inputFormat` descriptor to each problem in `content/`.
 *
 * Tier 1's explainer refuses to guess a format, so every problem that should
 * get a panel needs one declared. Written as a slug -> shape table because the
 * shapes repeat heavily — ten of them cover the whole corpus.
 *
 * A slug absent from the table keeps no descriptor and therefore gets no
 * explainer, which is the intended degradation rather than a gap to paper over.
 *
 *   node scripts/add-input-formats.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "..", "content", "problems");

/** The ten shapes. */
const F = {
  /** `n` then n values. */
  nArray: (name = "nums") => [
    { read: "scalars", names: ["n"] },
    { read: "array", name, length: "n" },
  ],
  /** `n k` then n values — a count plus one parameter. */
  nkArray: (second, name = "nums") => [
    { read: "scalars", names: ["n", second] },
    { read: "array", name, length: "n" },
  ],
  /** Two whitespace-delimited strings. */
  twoWords: () => [{ read: "scalars", names: ["a", "b"] }],
  /** One whole line, which may contain spaces. */
  oneLine: (name = "s") => [{ read: "line", name }],
  /** One integer. */
  oneScalar: (name = "n") => [{ read: "scalars", names: [name] }],
  /** Two integers. */
  twoScalars: (a, b) => [{ read: "scalars", names: [a, b] }],
  /** `rows cols` then `rows` lines of characters. */
  charGrid: () => [
    { read: "scalars", names: ["rows", "cols"] },
    { read: "lines", name: "grid", count: "rows" },
  ],
  /** `rows cols` then a numeric matrix. */
  numGrid: () => [
    { read: "scalars", names: ["rows", "cols"] },
    { read: "matrix", name: "m", rows: "rows", cols: "cols" },
  ],
  /** `n` then an n x n matrix. */
  squareGrid: () => [
    { read: "scalars", names: ["n"] },
    { read: "matrix", name: "m", rows: "n", cols: "n" },
  ],
  /** `n` then n pairs — intervals, edges. */
  nPairs: (name = "pairs") => [
    { read: "scalars", names: ["n"] },
    { read: "matrix", name, rows: "n", cols: 2 },
  ],
  /** Every remaining token: a level-order tree with `null` placeholders. */
  tokens: (name = "nodes") => [{ read: "rest", name }],
};

const FORMATS = {
  // --- n then an array -----------------------------------------------------
  "contains-duplicate": F.nArray("a"),
  "maximum-subarray": F.nArray("a"),
  "product-of-array-except-self": F.nArray("a"),
  "longest-consecutive-sequence": F.nArray("a"),
  "three-sum": F.nArray("a"),
  "container-with-most-water": F.nArray("h"),
  "best-time-to-buy-and-sell-stock": F.nArray("price"),
  "house-robber": F.nArray("a"),
  "longest-increasing-subsequence": F.nArray("a"),
  "daily-temperatures": F.nArray("t"),
  "find-minimum-in-rotated-sorted-array": F.nArray("a"),
  "single-number": F.nArray("a"),
  "missing-number": F.nArray("a"),
  "reverse-linked-list": F.nArray("values"),
  "reorder-list": F.nArray("values"),
  "group-anagrams": F.nArray("words"),

  // --- n plus one parameter, then an array ---------------------------------
  "two-sum": F.nkArray("target"),
  "binary-search": F.nkArray("target", "a"),
  "search-in-rotated-sorted-array": F.nkArray("target", "a"),
  "top-k-frequent-elements": F.nkArray("k", "a"),
  "kth-largest-element-in-an-array": F.nkArray("k", "a"),
  "coin-change": F.nkArray("amount", "coins"),
  "remove-nth-node-from-end-of-list": F.nArray("values"),

  // --- strings -------------------------------------------------------------
  "valid-anagram": F.twoWords(),
  "longest-common-subsequence": F.twoWords(),
  "valid-palindrome": F.oneLine(),
  "longest-substring-without-repeating-characters": F.oneLine(),
  "valid-parentheses": F.oneLine(),

  // --- single numbers ------------------------------------------------------
  "climbing-stairs": F.oneScalar(),
  "number-of-1-bits": F.oneScalar("value"),
  "unique-paths": F.twoScalars("m", "n"),

  // --- grids ---------------------------------------------------------------
  "number-of-islands": F.charGrid(),
  "set-matrix-zeroes": F.numGrid(),
  "spiral-matrix": F.numGrid(),
  "rotate-image": F.squareGrid(),

  // --- pairs ---------------------------------------------------------------
  "merge-intervals": F.nPairs("intervals"),
  "meeting-rooms-ii": F.nPairs("meetings"),

  // --- level-order trees ---------------------------------------------------
  "maximum-depth-of-binary-tree": F.tokens(),
  "invert-binary-tree": F.tokens(),
  "validate-binary-search-tree": F.tokens(),
  "binary-tree-maximum-path-sum": F.tokens(),
  "binary-tree-level-order-traversal": F.tokens(),
  "subtree-of-another-tree": F.tokens(),
  "same-tree": F.tokens(),
};

/**
 * Problems deliberately left WITHOUT a descriptor, with the reason. Each has an
 * input shape the parser cannot express truthfully, and a wrong diagram is
 * worse than none.
 */
const SKIP = {
  "word-search": "grid then a trailing word — needs a line after `lines`",
  "linked-list-cycle": "n, values, then a cycle index that is not part of the structure",
  "merge-two-sorted-lists": "two independent count+array blocks",
  "merge-k-sorted-lists": "k variable-length lists, one per line",
  "course-schedule": "n and m, then m pairs — m is the pair count, not n",
  "word-break": "a string, then a count, then that many words",
  "implement-trie-prefix-tree": "a command stream, not a data structure",
  "kth-smallest-element-in-a-bst": "tree tokens then a trailing k",
  "lowest-common-ancestor-of-a-bst": "tree tokens then two trailing values",
};

let attached = 0;
let skipped = 0;
let unknown = [];

for (const file of readdirSync(CONTENT).filter((f) => f.endsWith(".json"))) {
  const path = join(CONTENT, file);
  const items = JSON.parse(readFileSync(path, "utf8"));
  for (const problem of items) {
    const fmt = FORMATS[problem.slug];
    if (fmt) {
      problem.inputFormat = fmt;
      attached++;
    } else if (SKIP[problem.slug]) {
      delete problem.inputFormat;
      skipped++;
    } else {
      unknown.push(problem.slug);
    }
  }
  writeFileSync(path, `${JSON.stringify(items, null, 2)}\n`);
}

console.log(`attached ${attached}, deliberately skipped ${skipped}`);
if (unknown.length) {
  console.log(`\nNOT IN EITHER TABLE (${unknown.length}) — decide explicitly:`);
  for (const s of unknown) console.log(`  ${s}`);
}
