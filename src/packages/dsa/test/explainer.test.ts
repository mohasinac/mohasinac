import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExplainer } from "../src/scenarios/explainer.ts";
import type { InputFormat } from "../src/scenarios/input-format.ts";

const COUNT_TARGET_ARRAY: InputFormat = [
  { read: "scalars", names: ["n", "target"] },
  { read: "array", name: "nums", length: "n" },
];

test("two-sum: four frames, ending on the answer highlighted", () => {
  const r = buildExplainer({
    input: "4 9\n2 7 11 15\n",
    expectedOutput: "0 1",
    inputFormat: COUNT_TARGET_ARRAY,
  });
  assert.ok(r.ok);
  assert.equal(r.trace.frames.length, 4);

  // No code and no line numbers anywhere: this is the explain chrome.
  assert.equal(r.trace.source, "");
  for (const f of r.trace.frames) assert.equal(f.line, undefined);

  // Scalars appear as narration, not as a variable row.
  assert.match(String(r.trace.frames[0]?.note), /4 values/);
  assert.match(String(r.trace.frames[0]?.note), /n = 4, target = 9/);

  const last = r.trace.frames[3];
  assert.match(String(last?.note), /the answer is 0 1/);
  assert.deepEqual(last?.roles?.cells?.nums, { "0": "answer", "1": "answer" });
});

test("the drawn variable is the array, carried in every frame", () => {
  const r = buildExplainer({
    input: "4 9\n2 7 11 15\n",
    expectedOutput: "0 1",
    inputFormat: COUNT_TARGET_ARRAY,
  });
  assert.ok(r.ok);
  for (const f of r.trace.frames) assert.deepEqual(f.vars.nums, [2, 7, 11, 15]);
  assert.equal(r.trace.specs[0]?.kind, "array");
  assert.equal(r.trace.specs[0]?.var, "nums");
});

test("a non-index answer is stated in words, never highlighted", () => {
  // contains-duplicate answers "true" — there is no cell it refers to, and
  // guessing one would be the mis-parse the module exists to refuse.
  const r = buildExplainer({
    input: "4\n1 2 3 1\n",
    expectedOutput: "true",
    inputFormat: [
      { read: "scalars", names: ["n"] },
      { read: "array", name: "a", length: "n" },
    ],
  });
  assert.ok(r.ok);
  assert.equal(r.trace.frames.length, 3);
  const last = r.trace.frames[2];
  assert.match(String(last?.note), /the answer is true/);
  assert.equal(last?.roles, undefined);
});

test("an out-of-range index is not treated as a position", () => {
  // maximum-subarray answers a SUM (6), which happens to look like an index.
  // 6 is beyond the 4-element array, so it must not be highlighted.
  const r = buildExplainer({
    input: "4\n1 2 3 4\n",
    expectedOutput: "6",
    inputFormat: [
      { read: "scalars", names: ["n"] },
      { read: "array", name: "a", length: "n" },
    ],
  });
  assert.ok(r.ok);
  assert.equal(r.trace.frames[2]?.roles, undefined);
});

test("a grid input is drawn as a grid, not an array", () => {
  const r = buildExplainer({
    input: "3 3\n1 1 1\n1 0 1\n1 1 1\n",
    expectedOutput: "1 0 1",
    inputFormat: [
      { read: "scalars", names: ["rows", "cols"] },
      { read: "matrix", name: "m", rows: "rows", cols: "cols" },
    ],
  });
  assert.ok(r.ok);
  assert.equal(r.trace.specs[0]?.kind, "grid");
  // A grid answer is never highlighted by index — row/col is ambiguous from
  // a flat token list.
  assert.equal(r.trace.frames[2]?.roles, undefined);
});

test("REFUSES when the input does not parse, rather than drawing something", () => {
  const r = buildExplainer({
    input: "9 9\n1 2\n",
    expectedOutput: "0 1",
    inputFormat: COUNT_TARGET_ARRAY,
  });
  assert.ok(!r.ok);
  assert.match(r.reason, /ended at element 2/);
});

test("REFUSES when nothing in the input is drawable", () => {
  const r = buildExplainer({
    input: "45\n",
    expectedOutput: "1836311903",
    inputFormat: [{ read: "scalars", names: ["n"] }],
  });
  assert.ok(!r.ok);
  assert.match(r.reason, /no drawable value/);
});

test("patterns pass through so the renderer can theme itself", () => {
  const r = buildExplainer({
    input: "4 9\n2 7 11 15\n",
    expectedOutput: "0 1",
    inputFormat: COUNT_TARGET_ARRAY,
    patterns: ["hash map", "arrays"],
  });
  assert.ok(r.ok);
  assert.deepEqual(r.trace.patterns, ["hash map", "arrays"]);
});

test("an explicit varName overrides the first-drawable default", () => {
  const r = buildExplainer({
    input: "2\nab\ncd\n",
    expectedOutput: "2",
    inputFormat: [
      { read: "scalars", names: ["n"] },
      { read: "lines", name: "rows", count: "n" },
    ],
    varName: "rows",
  });
  assert.ok(r.ok);
  assert.equal(r.trace.specs[0]?.var, "rows");
  assert.deepEqual(r.trace.frames[0]?.vars.rows, ["ab", "cd"]);
});

test("a string is drawn as one cell per character", () => {
  // The string problems — palindromes, anagrams, brackets — want the character
  // sequence shown, so a string counts as drawable.
  const r = buildExplainer({
    input: "racecar\n",
    expectedOutput: "true",
    inputFormat: [{ read: "line", name: "s" }],
  });
  assert.ok(r.ok);
  assert.deepEqual(r.trace.frames[0]?.vars.s, ["r", "a", "c", "e", "c", "a", "r"]);
  assert.match(String(r.trace.frames[0]?.note), /7 characters/);
  const spec = r.trace.specs[0];
  assert.equal(spec?.kind, "array");
  assert.equal(spec?.kind === "array" ? spec.asString : undefined, true);
});

test("REFUSES an absurdly long string rather than drawing a prefix", () => {
  const r = buildExplainer({
    input: `${"a".repeat(5000)}\n`,
    expectedOutput: "true",
    inputFormat: [{ read: "line", name: "s" }],
  });
  assert.ok(!r.ok);
  assert.match(r.reason, /no drawable value/);
});
