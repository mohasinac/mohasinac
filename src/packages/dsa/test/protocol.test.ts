import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SOH,
  capMessage,
  classifyTrap,
  parseTraceStream,
  trapMessage,
} from "../src/trace/protocol.ts";

const frame = (s: number, l: number, v: Record<string, unknown>, d = 0) =>
  `${SOH}${JSON.stringify({ k: "f", s, l, d, v })}${SOH}\n`;

test("separates frames from the learner's own stderr", () => {
  const raw = `debug one\n${frame(1, 10, { i: 0 })}debug two\n${frame(2, 11, { i: 1 })}`;
  const p = parseTraceStream(raw);
  assert.equal(p.frames.length, 2);
  assert.equal(p.stderr, "debug one\ndebug two\n");
  assert.equal(p.malformed, 0);
  assert.equal(p.truncated, false);
});

test("a MID-LINE write survives the split — the reason for 0x01 framing", () => {
  // Verified against the real toolchain: a newline-delimited protocol glues
  // "partial-no-newline" onto the front of the frame and "more" onto the back.
  const raw = `partial-no-newline${frame(1, 5, { x: 1 })}more\n`;
  const p = parseTraceStream(raw);
  assert.equal(p.frames.length, 1);
  assert.equal(p.stderr, "partial-no-newlinemore\n");
  assert.ok(!p.stderr.includes('{"k"'), "no frame JSON leaked into their output");
});

test("frames carry the line and the call depth", () => {
  // Depth is what makes step-over and step-out computable at all.
  const p = parseTraceStream(frame(1, 42, { lo: 0 }, 3));
  assert.equal(p.frames[0]?.line, 42);
  assert.equal(p.frames[0]?.depth, 3);
  assert.deepEqual(p.frames[0]?.vars, { lo: 0 });
});

test("a run killed mid-record is NORMAL, not an error", () => {
  // The 30 s watchdog terminates the worker wherever it happens to be. The
  // frames before the cut are still exactly what the learner wants.
  const raw = `${frame(1, 1, { a: 1 })}${SOH}{"k":"f","s":2,"l":2,"d":0,"v":{"a"`;
  const p = parseTraceStream(raw);
  assert.equal(p.frames.length, 1);
  assert.equal(p.truncated, true);
  assert.equal(p.malformed, 0, "a trailing fragment is not malformed");
  assert.ok(!p.stderr.includes('{"k"'), "the fragment is not shown as their output");
});

test("a cap record is surfaced with its reason and line", () => {
  const raw = `${frame(1, 7, {})}${SOH}{"k":"cap","reason":"loop","l":14}${SOH}\n`;
  const p = parseTraceStream(raw);
  assert.deepEqual(p.capped, { reason: "loop", line: 14 });
});

test("an unknown cap reason is counted, not trusted", () => {
  const raw = `${SOH}{"k":"cap","reason":"gremlins","l":1}${SOH}\n`;
  const p = parseTraceStream(raw);
  assert.equal(p.capped, undefined);
  assert.equal(p.malformed, 1);
});

test("a record with the wrong shape is rejected rather than half-read", () => {
  // Crosses a process boundary, so shape is checked rather than trusted.
  const raw = `${SOH}{"k":"f","s":"one","l":2,"v":{}}${SOH}\n${SOH}{"k":"f"}${SOH}\n`;
  const p = parseTraceStream(raw);
  assert.equal(p.frames.length, 0);
  assert.equal(p.malformed, 2);
});

test("an empty stream yields nothing and complains about nothing", () => {
  const p = parseTraceStream("");
  assert.deepEqual(p.frames, []);
  assert.equal(p.stderr, "");
  assert.equal(p.malformed, 0);
  assert.equal(p.truncated, false);
});

test("a stream with no frames at all is just their stderr", () => {
  const p = parseTraceStream("only debug output\n");
  assert.equal(p.frames.length, 0);
  assert.equal(p.stderr, "only debug output\n");
});

test("a stray 0x01 from the learner costs one malformed record, not the trace", () => {
  // Their own output can legitimately contain a control byte. Frames escape
  // every byte below 0x20, so ours never can.
  const raw = `before${SOH}not json${SOH}after\n${frame(1, 1, { a: 1 })}`;
  const p = parseTraceStream(raw);
  assert.equal(p.frames.length, 1);
  assert.equal(p.malformed, 1);
  assert.equal(p.stderr, "beforeafter\n");
});

test("cap messages name a cause and an action, never just a number", () => {
  const limits = { maxSteps: 500, maxLoopIterations: 25, maxDepth: 2000 };
  assert.equal(capMessage(undefined, limits), null);
  assert.match(String(capMessage({ reason: "steps" }, limits)), /500 steps/);
  assert.match(
    String(capMessage({ reason: "loop", line: 14 }, limits)),
    /25 iterations of the loop at line 14.*later code is still traced/,
  );
  // The depth message has to point at the fix, not just the limit.
  assert.match(String(capMessage({ reason: "depth" }, limits)), /iterative solution/);
});

test("traps are classified into something a learner can act on", () => {
  assert.equal(classifyTrap("RuntimeError: call stack exhausted"), "stack_overflow");
  assert.equal(classifyTrap("Out of memory: memory.grow failed"), "out_of_memory");
  assert.equal(classifyTrap("memory access out of bounds"), "out_of_bounds");
  assert.equal(classifyTrap("integer divide by zero"), "divide_by_zero");
  assert.equal(classifyTrap("unreachable executed"), "unreachable");
  assert.equal(classifyTrap("something entirely new"), "unknown");
});

test("the stack-overflow message points at the iterative fix", () => {
  assert.match(trapMessage("stack_overflow"), /iterative/);
  assert.match(trapMessage("out_of_bounds"), /\.at\(\) traps here rather than throwing/);
  // Even the unknown case says what it does not know, rather than nothing.
  assert.match(trapMessage("unknown"), /could not identify/);
});
