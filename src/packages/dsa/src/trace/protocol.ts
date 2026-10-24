/**
 * Parse the raw stderr of a traced run into frames plus the learner's own
 * output.
 *
 * 🛑 Records are bracketed by `0x01` on BOTH ends, so a split on that byte
 * alternates: even indices are the learner's output, odd indices are records.
 * That is what makes `"partial-no-newline \x01{…}\x01more\n"` separable — a
 * newline-delimited protocol would glue their text onto the frame at both ends.
 *
 * Verified against the real toolchain in `scripts/verify-az-header.mjs`.
 *
 * Everything here tolerates damage. A run can be killed by the 30 s watchdog
 * mid-record, so a trailing unterminated record is NORMAL, not an error — the
 * frames before it are still exactly what the learner wants to see.
 */

import type { CapReason, TraceFrame, TraceValue } from "./types.ts";

export const SOH = "\x01";

/** A step record, as emitted. */
interface RawStep {
  k: "f";
  /** 1-based step counter, assigned C++-side. */
  s: number;
  /** 1-based line in the ORIGINAL, uninstrumented source. */
  l: number;
  /** Call depth — required for step-over and step-out. */
  d: number;
  v: Record<string, TraceValue>;
}

interface RawCap {
  k: "cap";
  reason: string;
  l: number;
}

export interface ParsedTrace {
  readonly frames: readonly TraceFrame[];
  /** The learner's own stderr, with every record removed. */
  readonly stderr: string;
  readonly capped?: { readonly reason: CapReason; readonly line?: number };
  /**
   * Records that did not parse. Expected to be 0 or 1 — a single trailing
   * fragment from a killed run. More than that means the emitter is wrong.
   */
  readonly malformed: number;
  /** True when the stream ended inside a record. */
  readonly truncated: boolean;
}

const CAP_REASONS: readonly string[] = ["steps", "loop", "depth", "bytes"];

function toCapReason(value: unknown): CapReason | null {
  return typeof value === "string" && CAP_REASONS.includes(value) ? (value as CapReason) : null;
}

/** Shape-check rather than trust: this crosses a process boundary. */
function isRawStep(x: unknown): x is RawStep {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    o.k === "f" &&
    typeof o.s === "number" &&
    typeof o.l === "number" &&
    typeof o.v === "object" &&
    o.v !== null &&
    !Array.isArray(o.v)
  );
}

function isRawCap(x: unknown): x is RawCap {
  if (typeof x !== "object" || x === null) return false;
  return (x as Record<string, unknown>).k === "cap";
}

export function parseTraceStream(raw: string): ParsedTrace {
  const parts = raw.split(SOH);

  const frames: TraceFrame[] = [];
  let stderr = "";
  let malformed = 0;
  let capped: ParsedTrace["capped"];

  /*
   * An odd number of parts means the stream ended OUTSIDE a record, which is
   * the clean case. An even number means it ended inside one, so the final part
   * is a fragment rather than the learner's output — attributing it to their
   * stderr would print half a JSON object at them.
   */
  const truncated = parts.length % 2 === 0;
  const lastIndex = parts.length - 1;

  for (const [i, part] of parts.entries()) {
    if (i % 2 === 0) {
      /*
       * 🛑 Strip ONE leading newline when this segment follows a record.
       *
       * The emitter writes `\n` after a record's closing 0x01 so that whatever
       * line it interrupted gets flushed — that newline is PROTOCOL, not the
       * learner's output. Attributing it to their stderr inserts a blank line
       * after every frame, which looks like their program did it.
       *
       * Exactly one, and only here: if they then print two newlines of their
       * own, both are theirs and must survive.
       */
      stderr += i > 0 ? part.replace(/^\r?\n/, "") : part;
      continue;
    }

    if (i === lastIndex && truncated) {
      // The fragment of a record interrupted by the watchdog. Not an error.
      continue;
    }

    let value: unknown;
    try {
      value = JSON.parse(part);
    } catch {
      malformed++;
      continue;
    }

    if (isRawStep(value)) {
      frames.push({
        line: value.l,
        vars: value.v,
        ...(typeof value.d === "number" ? { depth: value.d } : {}),
      });
      continue;
    }

    if (isRawCap(value)) {
      const reason = toCapReason(value.reason);
      if (reason) {
        capped = { reason, ...(typeof value.l === "number" ? { line: value.l } : {}) };
      } else {
        malformed++;
      }
      continue;
    }

    malformed++;
  }

  return {
    frames,
    stderr,
    ...(capped ? { capped } : {}),
    malformed,
    truncated,
  };
}

/**
 * A human sentence for a cap, so the UI never presents a truncated trace as a
 * complete one.
 */
export function capMessage(
  capped: ParsedTrace["capped"],
  limits: { maxSteps: number; maxLoopIterations: number; maxDepth: number },
): string | null {
  if (!capped) return null;
  const at = capped.line ? ` at line ${capped.line}` : "";
  switch (capped.reason) {
    case "steps":
      return `Stopped after ${limits.maxSteps} steps${at}. Raise the limit to see further.`;
    case "loop":
      return `Stopped after ${limits.maxLoopIterations} iterations of the loop${at} — later code is still traced.`;
    case "depth":
      return `Recursion reached depth ${limits.maxDepth}${at}. On a long list or a skewed tree, an iterative solution is the fix.`;
    case "bytes":
      return `The trace grew too large${at} and was cut short.`;
  }
}

/**
 * Classify a wasm trap into something explainable.
 *
 * 🛑 The message a learner sees must name a cause they can act on. Today an
 * exhausted stack and a failed allocation both arrive as an opaque
 * `[trap] …`, which tells them nothing.
 */
export type TrapKind =
  | "stack_overflow"
  | "out_of_memory"
  | "out_of_bounds"
  | "divide_by_zero"
  | "unreachable"
  | "unknown";

export function classifyTrap(message: string): TrapKind {
  const m = message.toLowerCase();
  if (m.includes("call stack exhausted") || m.includes("maximum call stack")) {
    return "stack_overflow";
  }
  if (m.includes("out of memory") || m.includes("memory.grow") || m.includes("allocation")) {
    return "out_of_memory";
  }
  if (m.includes("out of bounds")) return "out_of_bounds";
  if (m.includes("divide by zero") || m.includes("integer divide")) return "divide_by_zero";
  if (m.includes("unreachable")) return "unreachable";
  return "unknown";
}

export function trapMessage(kind: TrapKind): string {
  switch (kind) {
    case "stack_overflow":
      return "Stack overflow — the recursion went too deep. A linked list or tree with 10^5 nodes needs an iterative solution.";
    case "out_of_memory":
      return "Out of memory. Check for an allocation inside a loop, or a table far larger than the constraints require.";
    case "out_of_bounds":
      return "Out-of-bounds access. An index went past the end of a container — note that .at() traps here rather than throwing.";
    case "divide_by_zero":
      return "Division by zero.";
    case "unreachable":
      return "The program hit an unreachable instruction, which usually means undefined behaviour or a failed assertion.";
    case "unknown":
      return "The program crashed for a reason the sandbox could not identify.";
  }
}
