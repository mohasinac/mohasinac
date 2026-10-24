import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeLevelOrder } from "../src/render/tree-layout.ts";

test("decodes the corpus's level-order format with null placeholders", () => {
  // The exact sample input from maximum-depth-of-binary-tree.
  const t = decodeLevelOrder(["3", "9", "20", "null", "null", "15", "7"]);
  assert.equal(t.nodes.length, 5);
  assert.equal(t.depth, 3);
  // In-order columns: 9, 3, 15, 20, 7.
  assert.deepEqual(
    [...t.nodes].sort((a, b) => a.col - b.col).map((n) => n.label),
    ["9", "3", "15", "20", "7"],
  );
});

test("a null token consumes a slot without enqueuing a child", () => {
  // `1 null 2` is a root with only a RIGHT child — depth 2, not a sibling pair.
  const t = decodeLevelOrder(["1", "null", "2"]);
  assert.equal(t.nodes.length, 2);
  assert.equal(t.depth, 2);
  const two = t.nodes.find((n) => n.label === "2");
  assert.equal(two?.depth, 1);
});

test("an empty tree yields nothing to draw", () => {
  assert.deepEqual(decodeLevelOrder([]), { nodes: [], cols: 0, depth: 0 });
  assert.deepEqual(decodeLevelOrder(["null"]), { nodes: [], cols: 0, depth: 0 });
});

test("no two nodes share a column, however skewed the tree", () => {
  // A left-skewed chain: 1 -> 2 -> 3 -> 4. In-order columns must be distinct,
  // which is what guarantees the diagram never overlaps.
  const t = decodeLevelOrder(["1", "2", "null", "3", "null", "4"]);
  const cols = t.nodes.map((n) => n.col);
  assert.equal(new Set(cols).size, cols.length);
  assert.equal(t.depth, 4);
});

test("every non-root node knows its parent, so edges can be drawn", () => {
  const t = decodeLevelOrder(["1", "2", "3"]);
  const roots = t.nodes.filter((n) => n.parent === null);
  assert.equal(roots.length, 1);
  assert.equal(roots[0]?.label, "1");
  for (const n of t.nodes.filter((x) => x.parent !== null)) {
    assert.ok(t.nodes.some((p) => p.key === n.parent), `parent of ${n.label} missing`);
  }
});

test("a deep skewed tree does not overflow the stack", () => {
  // Iterative traversal, for the same reason the lessons teach it: 2000 nodes
  // in a chain would blow a recursive walk.
  const tokens: string[] = ["0"];
  for (let i = 1; i < 2000; i++) tokens.push(String(i), "null");
  const t = decodeLevelOrder(tokens);
  assert.ok(t.nodes.length > 1000, `only decoded ${t.nodes.length}`);
});
