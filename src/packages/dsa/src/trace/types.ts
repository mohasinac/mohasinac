/**
 * The trace protocol — the single data type the whole visualizer renders.
 *
 * All three tiers produce this, which is what keeps them one feature instead of
 * three:
 *
 *   Tier 1  "understand the problem"  generated from a sample case, no code
 *   Tier 2  preset walkthrough        authored or generated from a JS reference
 *   Tier 3  live trace                the learner's own code, instrumented
 *
 * 🛑 `line` is OPTIONAL. A Tier-1 explainer frame has no line number because
 * there is no code on screen — the panel deliberately shows no code pane, no
 * variables and no call stack. Modelling that as `line: 0` and hoping nothing
 * renders it is how you get a "line 0" badge in production.
 */

/** A value a frame can carry. Containers are arrays; maps are arrays of pairs. */
export type TraceValue = number | boolean | string | null | readonly TraceValue[];

/**
 * Sentinels the C++ emitter produces for things it cannot represent.
 * Bracketed so they cannot collide with a real string the program printed.
 */
export const SENTINELS = {
  unknown: "<?>",
  pointer: "<ptr>",
  array: "<array>",
  tooDeep: "<deep>",
  truncated: "…",
} as const;

/** The semantic vocabulary renderers colour by. Roles, never raw colours. */
export type VizRole =
  | "idle"
  | "current"
  | "pointer"
  | "window"
  | "visited"
  | "frontier"
  | "answer"
  | "discarded"
  | "comparing";

export const VIZ_ROLES: readonly VizRole[] = [
  "idle",
  "current",
  "pointer",
  "window",
  "visited",
  "frontier",
  "answer",
  "discarded",
  "comparing",
] as const;

/** Which structure a spec draws. Several kinds share one renderer. */
export type VizKind =
  | "array"
  | "grid"
  | "tree"
  | "linkedList"
  | "graph"
  | "stack"
  | "queue"
  // A binary heap is an implicit tree over an array, drawn as the tree it is
  // so the shape that makes it O(log n) is visible.
  | "heap";

export interface RoleHints {
  /**
   * varName -> cell key -> role. Cell key is `"3"` for 1-D, `"2,5"` for 2-D,
   * or a node id for graphs.
   */
  readonly cells?: Readonly<Record<string, Readonly<Record<string, VizRole>>>>;
  /** A scalar that indexes into another var: `{ lo: { into: "nums" } }`. */
  readonly pointers?: Readonly<Record<string, { into: string; role?: VizRole; label?: string }>>;
  /** Inclusive ranges over a 1-D var. */
  readonly spans?: Readonly<
    Record<string, readonly { from: number; to: number; role: VizRole; label?: string }[]>
  >;
  /** Edge roles, keyed `"from->to"`. */
  readonly edges?: Readonly<Record<string, Readonly<Record<string, VizRole>>>>;
}

export interface TraceFrame {
  /**
   * 1-based line in `VizTrace.source`. Absent for explainer frames, which have
   * no code — see the note at the top of this file.
   */
  readonly line?: number;
  /** Variable name -> value. Insertion order is declaration order in scope. */
  readonly vars: Readonly<Record<string, TraceValue>>;
  /** One sentence of narration. Doubles as the caption and the a11y text. */
  readonly note?: string;
  readonly roles?: RoleHints;
  /** Call depth. Drives step-over / step-out, which need it to compute at all. */
  readonly depth?: number;
}

export interface VizSpecBase {
  readonly id: string;
  readonly title?: string;
  /** Which variable in each frame this spec draws. */
  readonly var: string;
}

export type VizSpec =
  | (VizSpecBase & { kind: "array"; asString?: boolean; indexBase?: 0 | 1 })
  | (VizSpecBase & { kind: "grid"; rowLabels?: readonly string[]; colLabels?: readonly string[] })
  | (VizSpecBase & { kind: "tree"; encoding: "levelOrder" | "edgeList" })
  | (VizSpecBase & { kind: "linkedList" })
  | (VizSpecBase & { kind: "graph"; encoding: "adjacencyList" | "edgeList"; directed?: boolean })
  | (VizSpecBase & { kind: "stack" })
  | (VizSpecBase & { kind: "queue" })
  | (VizSpecBase & { kind: "heap" });

/**
 * Why the trace was cut short. Presenting a truncated trace as a complete one
 * would teach the wrong thing, so this is surfaced in the caption.
 */
export type CapReason = "steps" | "loop" | "depth" | "bytes";

export interface VizTrace {
  /** The code listing the frames' `line` values index into. Empty for Tier 1. */
  readonly source: string;
  readonly lang?: string;
  readonly specs: readonly VizSpec[];
  readonly frames: readonly TraceFrame[];
  /** Overrides the problem's own `patterns[]` when a trace wants a specific skin. */
  readonly patterns?: readonly string[];
  /** Set when a cap trimmed the trace. */
  readonly capped?: { readonly reason: CapReason; readonly line?: number };
  /**
   * Honest coverage reporting. "~85% and says so" is only true if it says so on
   * screen, so this is not optional for Tier 3.
   */
  readonly coverage?: {
    readonly statementsFound: number;
    readonly statementsInstrumented: number;
    readonly tier: "full" | "partial" | "lines-only";
    readonly skipped?: readonly { line: number; reason: string }[];
  };
}

/** Which chrome the player wears. See the note at the top of this file. */
export type VizChrome = "explain" | "trace";
