import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  evaluateCondition,
  evaluateWatch,
  executableLines,
  isConditionParseable,
  resolvePath,
  seek,
} from "../src/trace/debugger.ts";
import type { TraceFrame } from "../src/trace/types.ts";

/**
 * A call trace shaped like `main` -> `f` -> `g`, so step-over and step-out have
 * something real to disagree about:
 *
 *   0  line 10  depth 0   main
 *   1  line 11  depth 0   main
 *   2  line  3  depth 1     f
 *   3  line  4  depth 1     f
 *   4  line  1  depth 2       g
 *   5  line  2  depth 2       g
 *   6  line  5  depth 1     f   (back from g)
 *   7  line 12  depth 0   main  (back from f)
 */
const frames: readonly TraceFrame[] = [
  { line: 10, depth: 0, vars: { i: 0 } },
  { line: 11, depth: 0, vars: { i: 1 } },
  { line: 3, depth: 1, vars: { n: 5 } },
  { line: 4, depth: 1, vars: { n: 5 } },
  { line: 1, depth: 2, vars: { x: 7 } },
  { line: 2, depth: 2, vars: { x: 8 } },
  { line: 5, depth: 1, vars: { n: 5 } },
  { line: 12, depth: 0, vars: { i: 2 } },
];

describe("seek", () => {
  it("step into advances exactly one frame", () => {
    assert.equal(seek("into", { frames, from: 1 }), 2);
  });

  it("step over from a call site skips the whole callee", () => {
    // At index 1 (depth 0) the next depth-0 frame is index 7, so the entire
    // f/g subtree is skipped. This is the assertion that fails if `depth` is
    // ignored.
    assert.equal(seek("over", { frames, from: 1 }), 7);
  });

  it("step over inside a function stays inside it", () => {
    // From index 2 (depth 1), the next frame at depth <= 1 is index 3 — still
    // in f, NOT jumping out to main.
    assert.equal(seek("over", { frames, from: 2 }), 3);
  });

  it("step out leaves the current function", () => {
    assert.equal(seek("out", { frames, from: 4 }), 6); // out of g, back into f
    assert.equal(seek("out", { frames, from: 2 }), 7); // out of f, back into main
  });

  it("step out of the outermost frame runs to the end rather than refusing", () => {
    assert.equal(seek("out", { frames, from: 0 }), frames.length - 1);
  });

  it("reverse step over works, which a real debugger cannot do", () => {
    // Backwards from index 7 (depth 0), the previous depth<=0 frame is index 1.
    assert.equal(seek("over", { frames, from: 7, direction: -1 }), 1);
  });

  it("reverse step out finds the shallower frame behind it", () => {
    // From index 5 (inside g, depth 2) the nearest shallower frame BEHIND is
    // index 3 — g's call site, inside f. Landing at index 1 would be two
    // step-outs, not one.
    assert.equal(seek("out", { frames, from: 5, direction: -1 }), 3);
  });

  it("does not move past either boundary", () => {
    assert.equal(seek("into", { frames, from: 0, direction: -1 }), 0);
    assert.equal(seek("into", { frames, from: frames.length - 1 }), frames.length - 1);
  });

  it("treats a missing depth as 0 and degrades to a plain step", () => {
    const flat: readonly TraceFrame[] = [
      { line: 1, vars: {} },
      { line: 2, vars: {} },
      { line: 3, vars: {} },
    ];
    assert.equal(seek("over", { frames: flat, from: 0 }), 1);
    assert.equal(seek("out", { frames: flat, from: 0 }), flat.length - 1);
  });

  it("handles an empty trace without throwing", () => {
    assert.equal(seek("into", { frames: [], from: 0 }), 0);
    assert.equal(seek("continue", { frames: [], from: 0 }), 0);
  });
});

describe("continue", () => {
  it("stops at the next breakpoint line", () => {
    assert.equal(seek("continue", { frames, from: 0, breakpoints: new Set([1]) }), 4);
  });

  it("runs to the end when no breakpoints are set", () => {
    // 🛑 Not "does nothing": continue with no breakpoints means run to
    // completion in every debugger ever written.
    assert.equal(seek("continue", { frames, from: 0 }), frames.length - 1);
    assert.equal(seek("continue", { frames, from: 0, breakpoints: new Set() }), frames.length - 1);
  });

  it("runs to the end when a breakpoint is on a line that never executes", () => {
    assert.equal(
      seek("continue", { frames, from: 0, breakpoints: new Set([999]) }),
      frames.length - 1,
    );
  });

  it("reverse-continues to the previous breakpoint", () => {
    assert.equal(
      seek("continue", { frames, from: 7, direction: -1, breakpoints: new Set([3]) }),
      2,
    );
  });

  it("honours a condition, skipping hits that do not satisfy it", () => {
    const loop: readonly TraceFrame[] = [
      { line: 5, depth: 0, vars: { i: 0 } },
      { line: 5, depth: 0, vars: { i: 1 } },
      { line: 5, depth: 0, vars: { i: 2 } },
      { line: 5, depth: 0, vars: { i: 3 } },
    ];
    assert.equal(
      seek("continue", {
        frames: loop,
        from: 0,
        breakpoints: new Set([5]),
        conditions: new Map([[5, "i == 3"]]),
      }),
      3,
    );
  });

  it("skips every hit when a condition is never true", () => {
    const loop: readonly TraceFrame[] = [
      { line: 5, depth: 0, vars: { i: 0 } },
      { line: 5, depth: 0, vars: { i: 1 } },
    ];
    assert.equal(
      seek("continue", {
        frames: loop,
        from: 0,
        breakpoints: new Set([5]),
        conditions: new Map([[5, "i == 99"]]),
      }),
      loop.length - 1,
    );
  });
});

describe("executableLines", () => {
  it("lists only lines that actually ran", () => {
    const lines = executableLines(frames);
    assert.equal(lines.has(10), true);
    assert.equal(lines.has(7), false);
  });

  it("ignores frames with no line, so explainer frames add nothing", () => {
    assert.equal(executableLines([{ vars: {} }]).size, 0);
  });
});

describe("evaluateCondition", () => {
  const vars = { i: 5, n: 10, name: "two", found: true, zero: 0, nums: [3, 1, 4], done: false };

  it("compares numbers numerically, not lexically", () => {
    // The trap this catches: "9" < "10" is FALSE as strings.
    assert.equal(evaluateCondition("i < n", { i: 9, n: 10 }), true);
    assert.equal(evaluateCondition("i > n", { i: 9, n: 10 }), false);
  });

  it("handles every supported operator", () => {
    assert.equal(evaluateCondition("i == 5", vars), true);
    assert.equal(evaluateCondition("i != 5", vars), false);
    assert.equal(evaluateCondition("i <= 5", vars), true);
    assert.equal(evaluateCondition("i >= 6", vars), false);
    assert.equal(evaluateCondition("i < 6", vars), true);
    assert.equal(evaluateCondition("i > 4", vars), true);
  });

  it("does not let < shadow <=", () => {
    assert.equal(evaluateCondition("i <= 5", vars), true);
    assert.equal(evaluateCondition("i < 5", vars), false);
  });

  it("compares strings with either quote style", () => {
    assert.equal(evaluateCondition('name == "two"', vars), true);
    assert.equal(evaluateCondition("name == 'two'", vars), true);
    assert.equal(evaluateCondition('name == "three"', vars), false);
  });

  it("truthy-tests a bare operand, and negates with !", () => {
    assert.equal(evaluateCondition("found", vars), true);
    assert.equal(evaluateCondition("done", vars), false);
    assert.equal(evaluateCondition("!done", vars), true);
    assert.equal(evaluateCondition("zero", vars), false);
  });

  it("binds && tighter than ||, as C++ does", () => {
    // false && false || true  ==  (false && false) || true  ==  true.
    // With the wrong precedence this is false && (false || true) == false.
    assert.equal(evaluateCondition("done && done || found", vars), true);
    assert.equal(evaluateCondition("found && i == 5", vars), true);
    assert.equal(evaluateCondition("found && i == 6", vars), false);
  });

  it("indexes into an array value", () => {
    assert.equal(evaluateCondition("nums[2] == 4", vars), true);
    assert.equal(evaluateCondition("nums[0] == 4", vars), false);
  });

  it("an empty condition is unconditional", () => {
    assert.equal(evaluateCondition("", vars), true);
    assert.equal(evaluateCondition("   ", vars), true);
  });

  it("fails CLOSED on an unknown variable", () => {
    // 🛑 Deliberate direction. Defaulting to true would turn a typo into an
    // unconditional breakpoint, which reads as the condition being ignored.
    assert.equal(evaluateCondition("nope == 1", vars), false);
    assert.equal(evaluateCondition("nope", vars), false);
  });

  it("fails closed on garbage rather than throwing", () => {
    for (const junk of ["==", "<=>", "i ==", "== 5", "((", "i === 5 ? 1 : 2"]) {
      assert.doesNotThrow(() => evaluateCondition(junk, vars));
    }
  });

  it("does not execute anything, however hostile the input", () => {
    // Not a security boundary — the author is the viewer — but it proves the
    // parser treats these as data, which is what CSP compliance requires.
    for (const hostile of [
      "globalThis.alert(1)",
      "constructor.constructor('return 1')()",
      "i.toString()",
      "__proto__",
    ]) {
      assert.doesNotThrow(() => evaluateCondition(hostile, vars));
      assert.equal(evaluateCondition(hostile, vars), false);
    }
  });

  it("does not split an operator inside a string literal", () => {
    assert.equal(evaluateCondition('name == "a&&b"', { name: "a&&b" }), true);
  });
});

describe("resolvePath", () => {
  it("reads a plain name and an index", () => {
    assert.equal(resolvePath("x", { x: 3 }), 3);
    assert.equal(resolvePath("a[1]", { a: [9, 8] }), 8);
  });

  it("returns undefined rather than inventing a value", () => {
    assert.equal(resolvePath("missing", { x: 1 }), undefined);
    assert.equal(resolvePath("a[9]", { a: [1] }), undefined);
    assert.equal(resolvePath("x[0]", { x: 5 }), undefined);
    assert.equal(resolvePath("", { x: 1 }), undefined);
  });
});

describe("isConditionParseable", () => {
  it("accepts the supported grammar", () => {
    for (const ok of ["i == 5", "i < n && found", "nums[0] != 3", "found", "", "!done"]) {
      assert.equal(isConditionParseable(ok), true, ok);
    }
  });

  it("rejects what it cannot express, so the UI can say so", () => {
    for (const bad of ["i * 2 == 4", "f(i)", "i ==", "== 5", "i % 2 == 0"]) {
      assert.equal(isConditionParseable(bad), false, bad);
    }
  });
});

describe("evaluateWatch", () => {
  const vars = { i: 5, nums: [1, 2, 3] };

  it("returns a value for a resolvable expression", () => {
    assert.deepEqual(evaluateWatch("i", vars), { ok: true, value: 5 });
    assert.deepEqual(evaluateWatch("nums", vars), { ok: true, value: [1, 2, 3] });
    assert.deepEqual(evaluateWatch("nums[1]", vars), { ok: true, value: 2 });
  });

  it("evaluates a comparison as a boolean watch", () => {
    assert.deepEqual(evaluateWatch("i < 10", vars), { ok: true, value: true });
    assert.deepEqual(evaluateWatch("i > 10", vars), { ok: true, value: false });
  });

  it("reports failure instead of a misleading value", () => {
    assert.deepEqual(evaluateWatch("nope", vars), { ok: false });
    assert.deepEqual(evaluateWatch("", vars), { ok: false });
  });
});
