/**
 * Insert a ```viz fence into each lesson that should have one.
 *
 * 🛑 Placement is chosen per lesson, not mechanically. A walkthrough belongs
 * where it ANSWERS something the prose has just raised — the dynamic-array
 * growth demo goes immediately before the complexity section it justifies, the
 * hash-table collision demo immediately before "Why O(1) is an average". Put
 * at the top of a lesson it is decoration; put in the right place it is the
 * argument.
 *
 * Idempotent: a lesson that already has a fence is left alone, so this can be
 * re-run after adding a demo.
 *
 *   node scripts/add-lesson-viz.mjs          # report
 *   node scripts/add-lesson-viz.mjs --write  # apply
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "content/lessons");
const WRITE = process.argv.includes("--write");

/**
 * lesson -> { before: the heading to sit above, lead: one sentence, json }
 *
 * `before` is matched as a whole line, so a heading that moves does not
 * silently relocate the walkthrough somewhere wrong — it fails loudly instead.
 */
const PLACEMENTS = {
  "a-21-big-o": {
    before: "## Where the formula lies to you",
    lead: "The difference between O(n) and O(log n) is easier to watch than to read. Same array, same target, both searches:",
    json: '{ "demo": "linearSearch", "values": [1, 3, 5, 7, 9, 11, 13], "target": 13, "title": "linear search — every element" }',
    second: {
      lead: "And the same thing, halving:",
      json: '{ "demo": "binarySearch", "values": [1, 3, 5, 7, 9, 11, 13], "target": 13, "title": "binary search — three comparisons" }',
    },
  },
  "a-22-amortised": {
    before: "## When you may not use the amortised bound",
    lead: "Watch the copies rather than counting them. Growth is rare, and it gets rarer — which is the whole argument:",
    json: '{ "demo": "dynamicArray", "values": [3, 1, 4, 1, 5, 9, 2, 6], "title": "eight pushes, three reallocations" }',
  },
  "b-12-dynamic-array": {
    before: "## Complexity",
    lead: "The capacity doubling, and what each push actually costs:",
    json: '{ "demo": "dynamicArray", "values": [3, 1, 4, 1, 5, 9, 2], "title": "push until it grows" }',
  },
  "b-13-linked-list": {
    before: "## Complexity",
    lead: "Head insertion is free; reaching the middle is not. Both, in order:",
    json: '{ "demo": "linkedList", "values": [3, 2, 1], "title": "insert at the head, then delete the middle" }',
  },
  "b-31-hash-table": {
    before: "## Why O(1) is an average",
    lead: "Five keys into five buckets, including two that land in the same one:",
    json: '{ "demo": "hashTable", "values": [10, 22, 15, 7, 31], "buckets": 5, "title": "insert, with a collision" }',
  },
  "b-41-trees-and-bst": {
    before: "## The four traversals",
    lead: "Six inserts, then a search — notice each comparison discards an entire subtree:",
    json: '{ "demo": "bst", "values": [8, 3, 10, 1, 6, 14], "target": 6, "title": "build a BST, then find 6" }',
  },
  "b-42-heap": {
    before: "## Why building is O(n)",
    lead: "Each push lands at the end and then climbs only as far as the invariant requires:",
    json: '{ "demo": "heap", "values": [5, 3, 8, 1, 9, 2], "title": "six pushes, sifting up" }',
  },
  "b-51-graph-representations": {
    before: "## Choosing between them",
    lead: "An adjacency list, drawn as the graph it describes:",
    json: '{ "demo": "bfs", "graph": [[1, 2], [0, 3], [0, 3], [1, 2, 4], [3]], "title": "the list, as a graph" }',
  },
  "b-52-dsu": {
    before: "## Why the two optimisations are not optional",
    lead: "Four unions, the last of which closes a cycle. Watch `parent` flatten as it goes:",
    json: '{ "demo": "dsu", "pairs": [0, 1, 2, 3, 1, 2, 0, 3], "n": 6, "title": "union by size, with path compression" }',
  },
  "c-31-monotonic-stack": {
    before: "## The four variants",
    lead: "Next greater element. The stack only ever holds indices still waiting for an answer:",
    json: '{ "demo": "monotonicStack", "values": [2, 1, 2, 4, 3], "title": "next greater element" }',
  },
  "c-51-graph-traversal": {
    before: "## Counting components (flood fill)",
    lead: "BFS from node 0, one layer at a time:",
    json: '{ "demo": "bfs", "graph": [[1, 2], [0, 3], [0, 3], [1, 2, 4], [3]], "start": 0, "title": "BFS, layer by layer" }',
  },
  "c-61-dynamic-programming": {
    before: "## One dimension: house robber",
    lead: "The table filling in, with each cell's two dependencies lit:",
    json: '{ "demo": "dpTable", "n": 8, "title": "climbing stairs, bottom-up" }',
  },
  "c-71-greedy-and-bits": {
    before: "## XOR, and why it solves \"find the single number\"",
    lead: "The bits of 23, one place value at a time:",
    json: '{ "demo": "bits", "value": 23, "title": "23 in binary" }',
  },
};

let inserted = 0;
let skipped = 0;
let failed = 0;

for (const [slug, place] of Object.entries(PLACEMENTS)) {
  const path = join(DIR, `${slug}.md`);
  let body;
  try {
    body = readFileSync(path, "utf8");
  } catch {
    console.log(`  FAIL  ${slug}: no such lesson`);
    failed++;
    continue;
  }

  if (body.includes("```viz")) {
    console.log(`  SKIP  ${slug}: already has a visualization`);
    skipped++;
    continue;
  }

  const lines = body.split(/\r?\n/);
  const at = lines.findIndex((l) => l.trim() === place.before);
  if (at < 0) {
    // Loud, not silent: a moved heading must not relocate the walkthrough.
    console.log(`  FAIL  ${slug}: anchor not found — "${place.before}"`);
    failed++;
    continue;
  }

  const block = [place.lead, "", "```viz", place.json, "```", ""];
  if (place.second) {
    block.push(place.second.lead, "", "```viz", place.second.json, "```", "");
  }

  lines.splice(at, 0, ...block);
  if (WRITE) writeFileSync(path, lines.join("\n"));
  console.log(`  ADD   ${slug}: above "${place.before}"${place.second ? " (two fences)" : ""}`);
  inserted++;
}

console.log(`\n  ${inserted} inserted, ${skipped} already had one, ${failed} failed`);
if (!WRITE) console.log("  dry run — pass --write to apply\n");
process.exit(failed ? 1 : 0);
