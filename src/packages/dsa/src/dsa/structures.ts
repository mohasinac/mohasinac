/**
 * Self-tracing data structures, for lesson walkthroughs.
 *
 * Each one mirrors the C++ class taught in the Data Structures course and
 * emits a frame at the points that are *meaningful* — a push, a comparison, a
 * swap — rather than on every property access. That selectivity is what makes
 * the resulting animation legible instead of a thousand identical steps.
 *
 * Invariants are stated the same way the lessons state them, because that is
 * the thing being taught.
 */

import { Tracer, type TracerLimits } from "./tracer.ts";
import type { VizRole, VizSpec, VizTrace } from "../trace/types.ts";

/**
 * Stack — last in, first out.
 *
 * Invariant: the only accessible element is the most recently pushed one that
 * has not been popped. Push and pop act on the same end.
 */
export class TracedStack {
  private readonly data: number[] = [];
  private readonly tracer: Tracer;

  constructor(tracer: Tracer) {
    // Longhand, not a parameter property: those need code generation,
    // which node --experimental-strip-types refuses.
    this.tracer = tracer;
    tracer.watch("stack", () => this.data);
  }

  push(x: number): void {
    this.data.push(x);
    this.tracer.step({
      note: `push ${x} — it goes on top, and it is now the only reachable element.`,
      roles: { cells: { stack: { [String(this.data.length - 1)]: "current" } } },
    });
  }

  pop(): number | undefined {
    if (this.data.length === 0) {
      this.tracer.step({ note: "pop on an empty stack — nothing to remove." });
      return undefined;
    }
    const top = this.data.length - 1;
    this.tracer.step({
      note: `pop — ${this.data[top]} comes off, because it went on last.`,
      roles: { cells: { stack: { [String(top)]: "discarded" } } },
    });
    return this.data.pop();
  }

  get size(): number {
    return this.data.length;
  }
}

/**
 * Queue — first in, first out.
 *
 * Modelled with a head index rather than `shift()` on purpose: that is the
 * circular-buffer idea from the lesson, and `shift()` is the O(n) mistake the
 * lesson warns about.
 */
export class TracedQueue {
  private readonly data: number[] = [];
  private readonly tracer: Tracer;
  private head = 0;

  constructor(tracer: Tracer) {
    this.tracer = tracer;
    tracer.watch("queue", () => this.data.slice(this.head));
  }

  push(x: number): void {
    this.data.push(x);
    this.tracer.step({
      note: `enqueue ${x} — it joins the back of the queue.`,
      roles: { cells: { queue: { [String(this.data.length - this.head - 1)]: "current" } } },
    });
  }

  pop(): number | undefined {
    if (this.head >= this.data.length) {
      this.tracer.step({ note: "dequeue on an empty queue — nothing waiting." });
      return undefined;
    }
    const value = this.data[this.head];
    this.tracer.step({
      note: `dequeue — ${value} leaves, because it arrived first.`,
      roles: { cells: { queue: { "0": "discarded" } } },
    });
    // Advance the head rather than shifting n elements: the line that makes
    // this O(1) instead of O(n).
    this.head++;
    return value;
  }

  get size(): number {
    return this.data.length - this.head;
  }
}

/** Linear search, narrated — the baseline the lessons optimise away from. */
export function tracedLinearSearch(
  values: readonly number[],
  target: number,
  limits?: Partial<TracerLimits>,
): VizTrace {
  const tracer = new Tracer(limits);
  const a = [...values];
  tracer.watch("a", () => a);

  tracer.step({ note: `Looking for ${target} by checking every position in turn.` });

  for (let i = 0; i < a.length; i++) {
    const found = a[i] === target;
    tracer.step({
      note: found
        ? `a[${i}] is ${a[i]} — found it, after ${i + 1} ${i === 0 ? "check" : "checks"}.`
        : `a[${i}] is ${a[i]}, not ${target}. Keep going.`,
      roles: { cells: { a: { [String(i)]: found ? "answer" : "comparing" } } },
    });
    if (found) return tracer.build(SPEC_A, "", ["arrays"]);
  }

  tracer.step({ note: `Every position checked; ${target} is not here.` });
  return tracer.build(SPEC_A, "", ["arrays"]);
}

/**
 * Binary search, narrated — and the contrast with the linear version is the
 * lesson: the step COUNT is the thing to notice.
 */
export function tracedBinarySearch(
  sorted: readonly number[],
  target: number,
  limits?: Partial<TracerLimits>,
): VizTrace {
  const tracer = new Tracer(limits);
  const a = [...sorted];
  tracer.watch("a", () => a);

  let lo = 0;
  let hi = a.length;

  tracer.step({
    note: `Looking for ${target} in a sorted array — half the remaining range is discarded each step.`,
  });

  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    const roles: Record<string, VizRole> = {};
    // Everything outside [lo, hi) is already ruled out — showing that is the
    // whole point of visualising this one.
    for (let i = 0; i < a.length; i++) {
      if (i < lo || i >= hi) roles[String(i)] = "discarded";
    }
    roles[String(mid)] = "current";

    const value = a[mid];
    tracer.step({
      note:
        value === target
          ? `a[${mid}] is ${value} — found it.`
          : `a[${mid}] is ${value}, ${(value ?? 0) < target ? "too small" : "too large"}; discard ${
              (value ?? 0) < target ? "everything at or below it" : "everything at or above it"
            }.`,
      roles: { cells: { a: roles } },
    });

    if (value === target) {
      tracer.step({
        note: `Done in ${tracer.stepCount - 1} comparisons.`,
        roles: { cells: { a: { [String(mid)]: "answer" } } },
      });
      return tracer.build(SPEC_A, "", ["binary search"]);
    }
    // mid is ruled out, hence +1 — writing `lo = mid` never makes progress.
    if ((value ?? 0) < target) lo = mid + 1;
    else hi = mid;
  }

  tracer.step({ note: `The range is empty, so ${target} is not in the array.` });
  return tracer.build(SPEC_A, "", ["binary search"]);
}

/** Two pointers converging — the pattern, narrated. */
export function tracedTwoPointers(
  sorted: readonly number[],
  target: number,
  limits?: Partial<TracerLimits>,
): VizTrace {
  const tracer = new Tracer(limits);
  const a = [...sorted];
  tracer.watch("a", () => a);

  let lo = 0;
  let hi = a.length - 1;
  tracer.step({ note: `Find two values summing to ${target}, starting from both ends.` });

  while (lo < hi) {
    const sum = (a[lo] ?? 0) + (a[hi] ?? 0);
    const roles: Record<string, VizRole> = {
      [String(lo)]: "comparing",
      [String(hi)]: "comparing",
    };
    tracer.step({
      note:
        sum === target
          ? `${a[lo]} + ${a[hi]} = ${target}. Found.`
          : `${a[lo]} + ${a[hi]} = ${sum}, ${sum < target ? "too small — move the left pointer right" : "too large — move the right pointer left"}.`,
      roles: { cells: { a: roles } },
    });

    if (sum === target) {
      tracer.step({
        note: `The answer is positions ${lo} and ${hi}.`,
        roles: { cells: { a: { [String(lo)]: "answer", [String(hi)]: "answer" } } },
      });
      return tracer.build(SPEC_A, "", ["two pointers"]);
    }
    // Safe to discard: a[hi] is already the largest available, so no pair using
    // a[lo] can reach the target.
    if (sum < target) lo++;
    else hi--;
  }

  tracer.step({ note: "The pointers met without finding a pair." });
  return tracer.build(SPEC_A, "", ["two pointers"]);
}

const SPEC_A: readonly VizSpec[] = [{ id: "a", kind: "array", var: "a" }];

/** Run a stack or queue demo and return the trace. */
export function tracedStackDemo(ops: readonly number[], limits?: Partial<TracerLimits>): VizTrace {
  const tracer = new Tracer(limits);
  const s = new TracedStack(tracer);
  for (const x of ops) s.push(x);
  while (s.size > 0) s.pop();
  return tracer.build([{ id: "stack", kind: "array", var: "stack" }], "", ["stack"]);
}

export function tracedQueueDemo(ops: readonly number[], limits?: Partial<TracerLimits>): VizTrace {
  const tracer = new Tracer(limits);
  const q = new TracedQueue(tracer);
  for (const x of ops) q.push(x);
  while (q.size > 0) q.pop();
  return tracer.build([{ id: "queue", kind: "array", var: "queue" }], "", ["queue"]);
}
