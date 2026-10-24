/**
 * Whose fault was it?
 *
 * 🛑 This file exists to satisfy the single hard requirement on the tracer:
 *
 *     The learner must NEVER see a compile error, a trap, or a wrong answer
 *     that was caused by OUR instrumentation when their own code is valid.
 *
 * That guarantee is cheap to state and easy to lose. It is made structural
 * here by one rule, applied without exception:
 *
 *     Learner-facing diagnostics come ONLY from the uninstrumented build.
 *
 * Diagnostics from the instrumented build are telemetry about a bug in the
 * splice planner. They are counted and logged; they are never rendered. (A
 * test splice once produced a benign `-Wunused-value` on a comma operator —
 * exactly the kind of noise that must not reach someone's error panel.)
 *
 * The ordering is what makes this work rather than hope: the original is
 * compiled anyway, for judging, and it is compiled FIRST. So at the moment any
 * instrumented failure appears, we already know whether the original was fine.
 * If it was, the failure is ours by elimination — no heuristics involved.
 */

import type { CapReason, TraceFrame } from "./types.ts";
import { type TrapKind, classifyTrap } from "./protocol.ts";

/** One build-and-run attempt. Shared shape for both the original and the traced copy. */
export interface BuildOutcome {
  /** Did the compile succeed? */
  readonly compiled: boolean;
  /** Compiler diagnostics. For the instrumented build these are telemetry ONLY. */
  readonly diagnostics: string;
  /** Absent when the program was not run (because it did not compile). */
  readonly stdout?: string;
  /** 0 is a normal exit; -1 is a wasm trap. */
  readonly exitCode?: number;
  /** Raw trap text, when one occurred. */
  readonly trap?: string;
}

/** The traced build additionally yields frames and coverage. */
export interface TracedOutcome extends BuildOutcome {
  readonly frames?: readonly TraceFrame[];
  readonly statementsFound?: number;
  readonly statementsTraced?: number;
  readonly skipped?: readonly { readonly line: number; readonly reason: string }[];
  readonly capped?: { readonly reason: CapReason; readonly line?: number };
  readonly malformed?: boolean;
}

/**
 * Why step-through is unavailable. Every one of these is OUR problem, and the
 * UI message for each says so — never "your code is wrong".
 */
export type UnavailableReason =
  | "instrumented-compile-failed"
  | "instrumented-diverged"
  | "instrumented-trapped"
  | "instrumented-malformed"
  | "no-frames"
  | "not-attempted";

export type TraceAttribution =
  /**
   * Their code does not compile. Instrumentation was never attempted, so the
   * error is unambiguously theirs — and these diagnostics came from the
   * original build.
   */
  | { readonly kind: "learner-compile-error"; readonly diagnostics: string }
  /**
   * Their code compiled and then trapped, under BOTH builds. A real bug in
   * their program, so it is shown — with whatever frames we captured leading
   * up to it, which is the useful part.
   */
  | {
      readonly kind: "learner-trap";
      readonly trap: TrapKind;
      readonly frames: readonly TraceFrame[];
      readonly capped?: { readonly reason: CapReason; readonly line?: number };
    }
  /** A usable trace. `partial` when some statements could not be instrumented. */
  | {
      readonly kind: "ok";
      readonly complete: boolean;
      readonly frames: readonly TraceFrame[];
      readonly statementsFound: number;
      readonly statementsTraced: number;
      readonly skipped: readonly { readonly line: number; readonly reason: string }[];
      readonly capped?: { readonly reason: CapReason; readonly line?: number };
    }
  /**
   * Our bug. The learner sees "step-through unavailable" and their program
   * runs normally; `telemetry` is for logging and never for rendering.
   */
  | {
      readonly kind: "unavailable";
      readonly reason: UnavailableReason;
      readonly telemetry: string;
    };

/**
 * Decide what the learner sees.
 *
 * `original` MUST be the uninstrumented build. Passing the traced build as
 * both arguments would defeat the entire point of the function, which is why
 * the parameter is named rather than positional.
 */
export function attributeTrace(args: {
  readonly original: BuildOutcome;
  readonly instrumented?: TracedOutcome;
}): TraceAttribution {
  const { original, instrumented } = args;

  // --- Tier 0: ground truth. Nothing below this line runs if their code is
  // broken, which is what makes the guarantee structural.
  if (!original.compiled) {
    return { kind: "learner-compile-error", diagnostics: original.diagnostics };
  }

  if (!instrumented) {
    return { kind: "unavailable", reason: "not-attempted", telemetry: "" };
  }

  // Our splice produced something clang rejected, while their own code was
  // fine. Their diagnostics are discarded here precisely BECAUSE they are not
  // theirs.
  if (!instrumented.compiled) {
    return {
      kind: "unavailable",
      reason: "instrumented-compile-failed",
      telemetry: instrumented.diagnostics,
    };
  }

  const originalTrapped = original.exitCode === -1;
  const tracedTrapped = instrumented.exitCode === -1;

  // Trapped ONLY when instrumented. Our injected calls add stack frames, so
  // this is the classic way to push a deep-but-valid recursion over the edge.
  // 🛑 Reporting this as a learner error would be actively misleading: it would
  // tell someone their correct program has a bug.
  if (tracedTrapped && !originalTrapped) {
    return {
      kind: "unavailable",
      reason: "instrumented-trapped",
      telemetry: instrumented.trap ?? "trapped with no message",
    };
  }

  // Observable behaviour changed. Even though the judge never reads the traced
  // run, a diverged stdout means the splice altered the program — so the frames
  // describe a program the learner did not write and must not be shown.
  if (
    !originalTrapped &&
    !tracedTrapped &&
    original.stdout !== undefined &&
    instrumented.stdout !== undefined &&
    original.stdout !== instrumented.stdout
  ) {
    return {
      kind: "unavailable",
      reason: "instrumented-diverged",
      telemetry: `stdout differs: ${JSON.stringify(original.stdout.slice(0, 120))} vs ${JSON.stringify(
        instrumented.stdout.slice(0, 120),
      )}`,
    };
  }

  if (instrumented.malformed) {
    return {
      kind: "unavailable",
      reason: "instrumented-malformed",
      telemetry: "the trace stream could not be parsed",
    };
  }

  const frames = instrumented.frames ?? [];

  // Their program really does trap. Show it, with the frames leading up to it
  // — which is exactly when a trace is most instructive.
  if (originalTrapped) {
    return {
      kind: "learner-trap",
      trap: classifyTrap(original.trap ?? ""),
      frames,
      ...(instrumented.capped ? { capped: instrumented.capped } : {}),
    };
  }

  if (frames.length === 0) {
    return { kind: "unavailable", reason: "no-frames", telemetry: "0 frames emitted" };
  }

  const found = instrumented.statementsFound ?? 0;
  const traced = instrumented.statementsTraced ?? 0;
  const skipped = instrumented.skipped ?? [];

  return {
    kind: "ok",
    complete: skipped.length === 0 && (found === 0 || traced >= found),
    frames,
    statementsFound: found,
    statementsTraced: traced,
    skipped,
    ...(instrumented.capped ? { capped: instrumented.capped } : {}),
  };
}

/**
 * The learner-facing sentence for an unavailable trace.
 *
 * Every one of these says the tool fell short, never that their code did —
 * because in every one of these cases that is the truth. 🛑 Shipping the
 * coverage badge and these messages is what makes the stated honesty real; a
 * silent fallback to "no visualization" looks identical to a broken feature.
 */
export function unavailableMessage(reason: UnavailableReason): string {
  switch (reason) {
    case "instrumented-compile-failed":
      return "Step-through isn’t available for this code — your program is fine and ran normally. This is a limitation of the tracer, not a problem with what you wrote.";
    case "instrumented-trapped":
      return "Step-through isn’t available here: tracing adds stack frames, and this program is close enough to the stack limit that tracing pushes it over. Your program itself runs fine.";
    case "instrumented-diverged":
      return "Step-through was discarded because the traced build didn’t behave identically to your program. Showing it would mean showing something you didn’t write.";
    case "instrumented-malformed":
      return "The trace came back incomplete and couldn’t be read. Your program ran normally.";
    case "no-frames":
      return "No steps were recorded for this program, so there’s nothing to step through.";
    case "not-attempted":
      return "Step-through hasn’t been run for this code yet.";
  }
}
