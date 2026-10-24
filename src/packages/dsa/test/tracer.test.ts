import { test } from "node:test";
import assert from "node:assert/strict";
import { Tracer, snapshot } from "../src/dsa/tracer.ts";
import {
  tracedBinarySearch,
  tracedLinearSearch,
  tracedQueueDemo,
  tracedStackDemo,
  tracedTwoPointers,
} from "../src/dsa/structures.ts";

test("snapshot COPIES, so a frame is not a live reference", () => {
  // The defining bug of a hand-rolled visualizer: holding a reference makes
  // every frame show the final state, which looks like the algorithm is wrong
  // rather than the recorder.
  const a = [1, 2, 3];
  const tracer = new Tracer();
  tracer.watch("a", () => a);
  tracer.step({ note: "before" });
  a.push(4);
  a[0] = 99;
  tracer.step({ note: "after" });

  const t = tracer.build([{ id: "a", kind: "array", var: "a" }]);
  assert.deepEqual(t.frames[0]?.vars.a, [1, 2, 3]);
  assert.deepEqual(t.frames[1]?.vars.a, [99, 2, 3, 4]);
});

test("snapshot elides a long array and reports how much", () => {
  const out = snapshot(Array.from({ length: 10 }, (_, i) => i), 4);
  assert.deepEqual(out, [0, 1, 2, 3, "…+6"]);
});

test("snapshot renders a Map as [key, value] pairs, matching std::map", () => {
  assert.deepEqual(snapshot(new Map([["a", 1]])), [["a", 1]]);
  assert.deepEqual(snapshot(new Set([1, 2])), [1, 2]);
});

test("snapshot turns non-finite numbers into null, which is JSON-legal", () => {
  assert.equal(snapshot(NaN), null);
  assert.equal(snapshot(Infinity), null);
  assert.equal(snapshot(undefined), null);
});

test("the step cap stops recording and is reported, not silently hidden", () => {
  const tracer = new Tracer({ maxSteps: 3 });
  for (let i = 0; i < 50; i++) tracer.step({ note: `step ${i}` });
  const t = tracer.build([]);
  assert.equal(t.frames.length, 3);
  assert.equal(t.capped?.reason, "steps");
  assert.ok(tracer.capped);
});

test("binary search discards half the range each step, visibly", () => {
  const t = tracedBinarySearch([1, 3, 5, 7, 9, 11], 9);
  const roles = t.frames.map((f) => f.roles?.cells?.a ?? {});
  // By the final comparison most cells are struck out — that IS the lesson.
  const discardedAtEnd = Object.values(roles[roles.length - 2] ?? {}).filter(
    (r) => r === "discarded",
  ).length;
  assert.ok(discardedAtEnd >= 3, `expected several discarded cells, got ${discardedAtEnd}`);
  assert.match(String(t.frames[t.frames.length - 1]?.note), /Done in \d+ comparisons/);
});

test("binary search takes far fewer steps than linear on the same input", () => {
  const values = Array.from({ length: 64 }, (_, i) => i * 2);
  const lin = tracedLinearSearch(values, 126);
  const bin = tracedBinarySearch(values, 126);
  // The step count is the comparison the lesson is making.
  assert.ok(
    bin.frames.length < lin.frames.length / 4,
    `binary ${bin.frames.length} vs linear ${lin.frames.length}`,
  );
});

test("a miss is narrated rather than ending silently", () => {
  const t = tracedBinarySearch([1, 3, 5], 4);
  assert.match(String(t.frames[t.frames.length - 1]?.note), /not in the array/);
});

test("two pointers ends on both answer positions", () => {
  const t = tracedTwoPointers([1, 3, 4, 6, 8, 11], 10);
  const last = t.frames[t.frames.length - 1];
  // 1+11=12 high, 1+8=9 low, 3+8=11 high, 3+6=9 low, 4+6=10 — indices 2 and 3.
  assert.match(String(last?.note), /positions 2 and 3/);
  assert.deepEqual(last?.roles?.cells?.a, { "2": "answer", "3": "answer" });
});

test("stack pops in reverse order of pushes", () => {
  const t = tracedStackDemo([1, 2, 3]);
  const notes = t.frames.map((f) => String(f.note));
  const popped = notes.filter((n) => n.startsWith("pop")).map((n) => n.match(/pop — (\d+)/)?.[1]);
  assert.deepEqual(popped, ["3", "2", "1"]);
});

test("queue pops in arrival order, and never shows a stale head", () => {
  const t = tracedQueueDemo([1, 2, 3]);
  const notes = t.frames.map((f) => String(f.note));
  const left = notes.filter((n) => n.startsWith("dequeue")).map((n) => n.match(/— (\d+)/)?.[1]);
  assert.deepEqual(left, ["1", "2", "3"]);

  // The final frame still SHOWS the element being removed, marked discarded —
  // the frame captures the moment of the decision, which is more informative
  // than showing it already gone. The head only advances after.
  const final = t.frames[t.frames.length - 1];
  assert.deepEqual(final?.vars.queue, [3]);
  assert.deepEqual(final?.roles?.cells?.queue, { "0": "discarded" });
});

test("every frame of a walkthrough carries narration", () => {
  for (const t of [
    tracedBinarySearch([1, 2, 3, 4, 5], 4),
    tracedTwoPointers([1, 2, 3, 4], 5),
    tracedStackDemo([1, 2]),
    tracedQueueDemo([1, 2]),
  ]) {
    for (const [i, f] of t.frames.entries()) {
      assert.ok(f.note && f.note.length > 0, `frame ${i} has no note`);
    }
  }
});
