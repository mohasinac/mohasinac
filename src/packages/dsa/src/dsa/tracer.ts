/**
 * The JS tracer.
 *
 * This is the part that is *easy* in JavaScript and hard in C++: the language
 * can observe its own values, so a trace here is exact rather than a scanner
 * with an ~85% ceiling. Two concrete payoffs:
 *
 *   - lesson visualizations need no toolchain download and no compile, so
 *     someone reading about stacks sees one animate instantly;
 *   - Tier-2 walkthroughs can be GENERATED from a reference implementation
 *     instead of hand-authored, which means they stay correct when the
 *     reference changes.
 *
 * 🛑 What this produces is a WALKTHROUGH, not a trace of the learner's code.
 * When a lesson shows a C++ listing while the frames came from a JS twin, it
 * must be labelled as such — `chrome="trace"` is reserved for frames that came
 * from running the code actually on screen.
 */

import type { RoleHints, TraceFrame, TraceValue, VizSpec, VizTrace } from "../trace/types.ts";

/** Caps mirror the C++ side, for the same reason: a runaway loop. */
export interface TracerLimits {
  readonly maxSteps: number;
  readonly maxElements: number;
}

export const TRACER_DEFAULTS: TracerLimits = { maxSteps: 500, maxElements: 200 };

export interface StepOptions {
  readonly note?: string;
  readonly roles?: RoleHints;
  readonly line?: number;
  readonly depth?: number;
}

/**
 * Collects frames while a function runs.
 *
 * Deliberately explicit rather than Proxy-driven at this layer: a Proxy that
 * emitted a frame on every property read would produce thousands of
 * indistinguishable steps. The structures in `./structures.ts` call `step()` at
 * the points that are meaningful — a push, a comparison, a swap — which is what
 * makes the resulting animation legible.
 */
export class Tracer {
  private readonly frames: TraceFrame[] = [];
  private readonly limits: TracerLimits;
  private watched = new Map<string, () => unknown>();
  private cappedReason: "steps" | undefined;

  constructor(limits: Partial<TracerLimits> = {}) {
    this.limits = { ...TRACER_DEFAULTS, ...limits };
  }

  /** Register a value to snapshot on every step. Getter, so it stays live. */
  watch(name: string, get: () => unknown): void {
    this.watched.set(name, get);
  }

  unwatch(name: string): void {
    this.watched.delete(name);
  }

  get stepCount(): number {
    return this.frames.length;
  }

  get capped(): boolean {
    return this.cappedReason !== undefined;
  }

  /** Record one frame. Silently stops at the cap rather than throwing. */
  step(opts: StepOptions = {}): void {
    if (this.cappedReason) return;
    if (this.frames.length >= this.limits.maxSteps) {
      this.cappedReason = "steps";
      return;
    }

    const vars: Record<string, TraceValue> = {};
    for (const [name, get] of this.watched) {
      vars[name] = snapshot(get(), this.limits.maxElements);
    }

    this.frames.push({
      vars,
      ...(opts.note ? { note: opts.note } : {}),
      ...(opts.roles ? { roles: opts.roles } : {}),
      ...(opts.line !== undefined ? { line: opts.line } : {}),
      ...(opts.depth !== undefined ? { depth: opts.depth } : {}),
    });
  }

  build(specs: readonly VizSpec[], source = "", patterns?: readonly string[]): VizTrace {
    return {
      source,
      specs,
      frames: [...this.frames],
      ...(patterns ? { patterns } : {}),
      ...(this.cappedReason ? { capped: { reason: this.cappedReason } } : {}),
    };
  }
}

/**
 * Deep-copy a live value into something JSON-shaped.
 *
 * 🛑 Copying is the whole point. Holding a reference would mean every frame
 * showed the FINAL state of the array — the single most common bug in a
 * hand-rolled visualizer, and one that looks like the algorithm is wrong rather
 * than the recorder.
 */
export function snapshot(value: unknown, maxElements = TRACER_DEFAULTS.maxElements): TraceValue {
  if (value === null || value === undefined) return null;

  const t = typeof value;
  if (t === "number") return Number.isFinite(value as number) ? (value as number) : null;
  if (t === "boolean" || t === "string") return value as TraceValue;
  if (t === "bigint") return String(value);

  if (Array.isArray(value)) {
    const out: TraceValue[] = [];
    for (let i = 0; i < value.length && i < maxElements; i++) {
      out.push(snapshot(value[i], maxElements));
    }
    // Report the elision rather than showing a prefix as the whole thing.
    if (value.length > maxElements) out.push(`…+${value.length - maxElements}`);
    return out;
  }

  if (value instanceof Map) {
    const out: TraceValue[] = [];
    let n = 0;
    for (const [k, v] of value) {
      if (n++ >= maxElements) break;
      out.push([snapshot(k, maxElements), snapshot(v, maxElements)]);
    }
    return out;
  }

  if (value instanceof Set) {
    const out: TraceValue[] = [];
    let n = 0;
    for (const v of value) {
      if (n++ >= maxElements) break;
      out.push(snapshot(v, maxElements));
    }
    return out;
  }

  // A plain object becomes [key, value] pairs, matching how the C++ side
  // renders a std::map — so one renderer handles both.
  if (t === "object") {
    const out: TraceValue[] = [];
    let n = 0;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (n++ >= maxElements) break;
      out.push([k, snapshot(v, maxElements)]);
    }
    return out;
  }

  return "<?>";
}

/** Cell-role helper: `cells("a", { 0: "pointer", 3: "answer" })`. */
export function cells(
  varName: string,
  map: Readonly<Record<number | string, RoleHints["cells"] extends undefined ? never : string>>,
): RoleHints {
  const inner: Record<string, never> = {};
  for (const [k, v] of Object.entries(map)) {
    (inner as Record<string, string>)[String(k)] = v as string;
  }
  return { cells: { [varName]: inner } } as RoleHints;
}
