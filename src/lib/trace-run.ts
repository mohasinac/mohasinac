/**
 * The client half of the tracer: drive the worker, plan the splices, attribute
 * the result.
 *
 * Lives here rather than in the dsa package because it talks to this app's
 * `sandbox-worker.js`. The package stays worker-agnostic — it plans splices and
 * parses frames and knows nothing about `postMessage`. That boundary is what
 * makes the package extractable.
 *
 * 🛑 The ORDER of the three worker round-trips is the whole safety argument:
 *
 *   1. `run`   — the ORIGINAL, unmodified. Ground truth. If it fails, stop and
 *                show those diagnostics; no instrumentation was attempted, so
 *                the error is unambiguously the learner's.
 *   2. `ast`   — dump the AST of the original, to plan splices from real byte
 *                offsets rather than from a guess about where statements are.
 *   3. `trace` — compile and run the INSTRUMENTED copy.
 *
 * Because step 1 always happens first, any failure in step 2 or 3 is ours by
 * elimination. No heuristics, no message matching.
 */

import {
  AZ_DEFAULTS,
  type AzLimits,
  clampLimits,
  limitsPrelude,
} from "@dsa/trace/az-trace-header";
import { applyPlan, planSplices } from "@dsa/trace/splice";
import { parseTraceStream } from "@dsa/trace/protocol";
import { attributeTrace, type TraceAttribution } from "@dsa/trace/attribute";
import type { VizKind, VizSpec, VizTrace } from "@dsa/trace/types";

export interface TraceRunOptions {
  readonly worker: Worker;
  readonly source: string;
  readonly stdin: string;
  /** Per-problem overrides; clamped to the hard ceilings regardless. */
  readonly limits?: Partial<AzLimits>;
  /** Must return a unique id per request on this worker. */
  readonly nextId: () => number;
  readonly onStatus?: (message: string) => void;
  readonly timeoutMs?: number;
  /**
   * The problem's declared shape. Not inferable from a trace — see inferSpec.
   */
  readonly vizKind?: VizKind;
  /** The problem's declared variable to draw, when its input is not the point. */
  readonly vizVar?: string;
}

export interface TraceRunResult {
  readonly attribution: TraceAttribution;
  /** Present only when the attribution yields usable frames. */
  readonly trace?: VizTrace;
  /** The learner's own stdout from the ORIGINAL run, for display. */
  readonly stdout: string;
  /** Their own stderr emitted during the traced run, de-interleaved from frames. */
  readonly output: string;
}

interface WorkerReply {
  readonly ok?: boolean;
  readonly error?: string;
  readonly compilerStderr?: string;
  readonly stdout?: string;
  readonly exitCode?: number;
  readonly trap?: string;
  readonly trapKind?: string;
  readonly truncated?: boolean;
  readonly ast?: string;
  readonly compileMs?: number;
}

/**
 * One request/response round-trip, collecting any streamed `traceChunk`s.
 *
 * Resolves with the reply even when `ok` is false: a failed compile is DATA
 * here, not an exception. Attribution needs to see both outcomes to decide
 * whose fault a failure was, and throwing would discard exactly that.
 */
function request(
  worker: Worker,
  message: Record<string, unknown>,
  id: number,
  timeoutMs: number,
  onStatus?: (m: string) => void,
): Promise<{ reply: WorkerReply; raw: string }> {
  return new Promise((resolve, reject) => {
    let raw = "";
    const timer = setTimeout(() => {
      cleanup();
      // The caller must drop the worker reference: terminate is the only way
      // to stop a spinning wasm program, and it destroys everything held here.
      reject(new Error("TRACE_TIMEOUT"));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
    };

    const onMessage = (ev: MessageEvent) => {
      const d = ev.data as { type?: string; id?: number; message?: string; raw?: string } & WorkerReply;
      if (d.type === "status" && d.message) {
        onStatus?.(d.message);
        return;
      }
      // Chunks stream in during the synchronous run, so they arrive BEFORE the
      // result message. Accumulating them here is what makes a trace survive a
      // program that traps partway.
      if (d.type === "traceChunk" && d.id === id) {
        raw += d.raw ?? "";
        return;
      }
      if (d.type !== "result" || d.id !== id) return;
      cleanup();
      resolve({ reply: d, raw });
    };

    worker.addEventListener("message", onMessage);
    worker.postMessage({ id, ...message });
  });
}

const DEFAULT_TIMEOUT = 45_000;

export async function runTrace(opts: TraceRunOptions): Promise<TraceRunResult> {
  const { worker, source, stdin, nextId } = opts;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const status = opts.onStatus;
  const limits = clampLimits({ ...AZ_DEFAULTS, ...opts.limits });

  // ---- 1. Ground truth.
  status?.("Compiling your code…");
  const original = await request(worker, { cmd: "run", source, stdin }, nextId(), timeoutMs, status);
  const originalOk = original.reply.ok === true;

  if (!originalOk) {
    return {
      attribution: attributeTrace({
        original: {
          compiled: false,
          diagnostics: original.reply.compilerStderr?.trim() || original.reply.error || "Compilation failed",
        },
      }),
      stdout: "",
      output: "",
    };
  }

  const originalOutcome = {
    compiled: true,
    diagnostics: "",
    stdout: original.reply.stdout ?? "",
    exitCode: original.reply.exitCode ?? 0,
    trap: original.reply.trap ?? "",
  };

  // ---- 2. The AST, for splice offsets.
  status?.("Planning instrumentation…");
  const dump = await request(worker, { cmd: "ast", source }, nextId(), timeoutMs, status);
  let plan: ReturnType<typeof planSplices> | null = null;
  let instrumented = "";
  if (dump.reply.ok === true && (dump.reply.ast ?? "").trim() !== "") {
    try {
      plan = planSplices(JSON.parse(dump.reply.ast as string), source);
      instrumented = applyPlan(source, plan, limitsPrelude(limits, plan.sites));
    } catch {
      // A dump we cannot parse is our problem, handled by attribution below.
      plan = null;
    }
  }

  if (!plan) {
    return {
      attribution: attributeTrace({
        original: originalOutcome,
        instrumented: { compiled: false, diagnostics: dump.reply.compilerStderr ?? "ast unusable" },
      }),
      stdout: originalOutcome.stdout,
      output: "",
    };
  }

  // ---- 3. The instrumented run.
  status?.("Tracing…");
  const traced = await request(
    worker,
    { cmd: "trace", source: instrumented, stdin },
    nextId(),
    timeoutMs,
    status,
  );

  if (traced.reply.ok !== true) {
    return {
      attribution: attributeTrace({
        original: originalOutcome,
        instrumented: {
          compiled: false,
          diagnostics: traced.reply.compilerStderr?.trim() || traced.reply.error || "",
        },
      }),
      stdout: originalOutcome.stdout,
      output: "",
    };
  }

  const parsed = parseTraceStream(traced.raw);

  const attribution = attributeTrace({
    original: originalOutcome,
    instrumented: {
      compiled: true,
      diagnostics: "",
      stdout: traced.reply.stdout ?? "",
      exitCode: traced.reply.exitCode ?? 0,
      trap: traced.reply.trap ?? "",
      frames: parsed.frames,
      statementsFound: plan.statementsFound,
      statementsTraced: plan.points.length,
      skipped: plan.skipped,
      ...(parsed.capped ? { capped: parsed.capped } : {}),
      // A single trailing fragment is EXPECTED from a watchdog kill, so only treat
      // the stream as malformed when nothing usable came out of it at all.
      malformed: parsed.malformed > 0 && parsed.frames.length === 0,
    },
  });

  if (attribution.kind !== "ok" && attribution.kind !== "learner-trap") {
    return { attribution, stdout: originalOutcome.stdout, output: parsed.stderr };
  }

  return {
    attribution,
    trace: buildVizTrace(source, attribution.frames, plan, parsed.capped, opts.vizKind, opts.vizVar),
    stdout: originalOutcome.stdout,
    output: parsed.stderr,
  };
}

/**
 * Pick what to draw.
 *
 * The variable is inferred — the first array-valued one in the first frame that
 * has one, which for the overwhelming majority of these problems is "the
 * collection the code is working on".
 *
 * 🛑 The KIND is not inferred, it is declared. A linked list, a stack and a
 * queue all arrive as a flat array of values, and nothing in a trace
 * distinguishes them — so guessing would render a stack as a horizontal strip
 * and teach away the one property it is taught for. The problem's `vizKind`
 * says which, and `array` is the fallback because it is the only shape that is
 * honest about an unknown sequence.
 */
function inferSpec(
  frames: readonly { vars: Record<string, unknown> }[],
  declaredKind: VizKind | undefined,
  declaredVar: string | undefined,
): VizSpec | null {
  const pick = (): { name: string; nested: boolean } | null => {
    for (const f of frames) {
      // An explicitly named variable wins, so a problem can point at the DP
      // table rather than its input.
      if (declaredVar !== undefined) {
        const v = f.vars[declaredVar];
        if (Array.isArray(v) && v.length > 0) {
          return { name: declaredVar, nested: v.some((x) => Array.isArray(x)) };
        }
        continue;
      }
      for (const [name, value] of Object.entries(f.vars)) {
        if (!Array.isArray(value) || value.length === 0) continue;
        return { name, nested: value.some((x) => Array.isArray(x)) };
      }
    }
    return null;
  };

  const chosen = pick();
  if (!chosen) return null;
  const { name, nested } = chosen;

  /*
   * A nested array is a grid — EXCEPT for a declared graph, whose natural
   * representation is an adjacency list and therefore nested by nature.
   *
   * 🛑 Without that exception every graph problem would render as a DP-style
   * table, because `vector<vector<int>> adj` is exactly the shape a 2-D grid
   * also has. "Nested always wins" is right for the 1-D kinds (a list or a
   * stack really cannot carry a second dimension) and wrong for the one kind
   * that is defined by it.
   */
  if (nested) {
    return declaredKind === "graph"
      ? { id: "auto", kind: "graph", var: name, encoding: "adjacencyList" }
      : { id: "auto", kind: "grid", var: name };
  }

  switch (declaredKind) {
    case "linkedList":
      return { id: "auto", kind: "linkedList", var: name };
    case "stack":
      return { id: "auto", kind: "stack", var: name };
    case "queue":
      return { id: "auto", kind: "queue", var: name };
    case "tree":
      return { id: "auto", kind: "tree", var: name, encoding: "levelOrder" };
    case "heap":
      return { id: "auto", kind: "heap", var: name };
    case "graph":
      // 🛑 FLAT + graph means an EDGE LIST. An adjacency list is nested by
      // nature, so it is handled in the nested branch above; a flat array of
      // node ids declared as a graph is pairs. Decoding pairs as adjacency
      // would read every value as a neighbour index and draw a different
      // graph entirely.
      return { id: "auto", kind: "graph", var: name, encoding: "edgeList" };
    default:
      return { id: "auto", kind: "array", var: name };
  }
}

function buildVizTrace(
  source: string,
  frames: VizTrace["frames"],
  plan: ReturnType<typeof planSplices>,
  capped?: NonNullable<VizTrace["capped"]>,
  declaredKind?: VizKind,
  declaredVar?: string,
): VizTrace {
  const spec = inferSpec(
    frames as readonly { vars: Record<string, unknown> }[],
    declaredKind,
    declaredVar,
  );
  const instrumentedCount = plan.points.length;
  return {
    source,
    lang: "cpp",
    // An empty specs array is legitimate — the player falls back to code and
    // variables, which is still a working step debugger.
    specs: spec ? [spec] : [],
    frames,
    ...(capped ? { capped } : {}),
    coverage: {
      statementsFound: plan.statementsFound,
      statementsInstrumented: instrumentedCount,
      tier:
        plan.skipped.length === 0 && instrumentedCount >= plan.statementsFound
          ? "full"
          : "partial",
      ...(plan.skipped.length > 0 ? { skipped: plan.skipped } : {}),
    },
  };
}
