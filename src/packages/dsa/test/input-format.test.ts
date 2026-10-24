import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInput, type InputFormat } from "../src/scenarios/input-format.ts";

/**
 * Inputs here are copied verbatim from content/problems/*.json, so these tests
 * fail if a real problem's format stops parsing — not just if the parser's own
 * invented examples break.
 */

const COUNT_THEN_ARRAY: InputFormat = [
  { read: "scalars", names: ["n", "target"] },
  { read: "array", name: "nums", length: "n" },
];

test("count-then-array: two-sum", () => {
  const r = parseInput("4 9\n2 7 11 15\n", COUNT_THEN_ARRAY);
  assert.ok(r.ok);
  assert.deepEqual(r.values, { n: 4, target: 9, nums: [2, 7, 11, 15] });
});

test("negative and zero values coerce to numbers, not strings", () => {
  const r = parseInput("5 -8\n-3 4 -5 0 1\n", COUNT_THEN_ARRAY);
  assert.ok(r.ok);
  assert.deepEqual(r.values.nums, [-3, 4, -5, 0, 1]);
});

test("n = 0 yields an empty array rather than failing", () => {
  // contains-duplicate's `0\n\n` case: a real, verified test input.
  const r = parseInput("0\n\n", [
    { read: "scalars", names: ["n"] },
    { read: "array", name: "a", length: "n" },
  ]);
  assert.ok(r.ok);
  assert.deepEqual(r.values.a, []);
});

test("REFUSES a short array instead of drawing half of one", () => {
  // The whole point: a confidently wrong diagram is worse than no diagram.
  const r = parseInput("5 9\n2 7\n", COUNT_THEN_ARRAY);
  assert.ok(!r.ok);
  assert.match(r.reason, /ended at element 2/);
});

test("REFUSES when a declared scalar is missing", () => {
  const r = parseInput("4\n", COUNT_THEN_ARRAY);
  assert.ok(!r.ok);
  assert.match(r.reason, /"target"/);
});

test("REFUSES a length that names a non-integer", () => {
  const r = parseInput("abc 9\n1 2\n", COUNT_THEN_ARRAY);
  assert.ok(!r.ok);
  assert.match(r.reason, /not a non-negative integer/);
});

test("two bare strings: valid-anagram", () => {
  const r = parseInput("anagram\nnagaram\n", [
    { read: "scalars", names: ["a", "b"] },
  ]);
  assert.ok(r.ok);
  assert.deepEqual(r.values, { a: "anagram", b: "nagaram" });
});

test("a whole line with spaces: valid-palindrome", () => {
  const r = parseInput("A man, a plan, a canal: Panama\n", [
    { read: "line", name: "s" },
  ]);
  assert.ok(r.ok);
  assert.equal(r.values.s, "A man, a plan, a canal: Panama");
});

test("an all-whitespace line is valid input, not a parse failure", () => {
  // valid-palindrome's " \n" case — the expected answer is true.
  const r = parseInput(" \n", [{ read: "line", name: "s" }]);
  assert.ok(r.ok);
  assert.equal(r.values.s, " ");
});

test("scalars then lines: the >> followed by getline trap", () => {
  // number-of-islands. A naive reader returns the empty remainder of line 1
  // here, exactly as C++ does without cin.ignore().
  const r = parseInput("4 5\n11000\n11000\n00100\n00011\n", [
    { read: "scalars", names: ["rows", "cols"] },
    { read: "lines", name: "grid", count: "rows" },
  ]);
  assert.ok(r.ok);
  assert.deepEqual(r.values.grid, ["11000", "11000", "00100", "00011"]);
});

test("matrix of numbers: set-matrix-zeroes", () => {
  const r = parseInput("3 3\n1 1 1\n1 0 1\n1 1 1\n", [
    { read: "scalars", names: ["rows", "cols"] },
    { read: "matrix", name: "m", rows: "rows", cols: "cols" },
  ]);
  assert.ok(r.ok);
  assert.deepEqual(r.values.m, [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
  ]);
});

test("level-order tree keeps `null` as a token", () => {
  const r = parseInput("3 9 20 null null 15 7\n", [{ read: "rest", name: "nodes" }]);
  assert.ok(r.ok);
  assert.deepEqual(r.values.nodes, ["3", "9", "20", "null", "null", "15", "7"]);
});

test("an empty tree yields no tokens rather than failing", () => {
  const r = parseInput("\n", [{ read: "rest", name: "nodes" }]);
  assert.ok(r.ok);
  assert.deepEqual(r.values.nodes, []);
});

test("CRLF input parses the same as LF", () => {
  const r = parseInput("2 2\r\nab\r\ncd\r\n", [
    { read: "scalars", names: ["rows", "cols"] },
    { read: "lines", name: "grid", count: "rows" },
  ]);
  assert.ok(r.ok);
  assert.deepEqual(r.values.grid, ["ab", "cd"]);
});

test("an empty format is refused rather than silently succeeding", () => {
  const r = parseInput("1 2\n", []);
  assert.ok(!r.ok);
});

test("a huge declared length is refused, not allocated", () => {
  const r = parseInput("999999 0\n", COUNT_THEN_ARRAY);
  assert.ok(!r.ok);
  assert.match(r.reason, /draw limit/);
});
