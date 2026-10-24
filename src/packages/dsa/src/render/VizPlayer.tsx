"use client";

/**
 * The player. One `"use client"` boundary for the whole visualizer.
 *
 * `chrome="explain"` is Tier 1: stage, caption and transport only — no code
 * pane, no variable table. Someone who has not written a line yet is not helped
 * by either, which is also why explainer frames carry no `line`.
 *
 * `chrome="trace"` adds the code pane and variables, and is only ever used for
 * frames that came from running the code on screen.
 */

import { useCallback, useId, useMemo, useRef, useState } from "react";
import type { CapReason, TraceValue, VizChrome, VizRole, VizTrace } from "../trace/types.ts";
import { ROLE_WORD } from "../theme/roles.ts";
import {
  type StepCommand,
  evaluateWatch,
  executableLines,
  isConditionParseable,
  seek,
} from "../trace/debugger.ts";
import { ArrayView } from "./ArrayView.tsx";
import { ChainView } from "./ChainView.tsx";
import { CodePane } from "./CodePane.tsx";
import { GraphView } from "./GraphView.tsx";
import { GridView } from "./GridView.tsx";
import { SlabsView } from "./SlabsView.tsx";
import { TreeView } from "./TreeView.tsx";
import { VarsPane } from "./VarsPane.tsx";
import { decodeAdjacencyList, decodeEdgeList, type GraphModel } from "./graph-layout.ts";
import { decodeLevelOrder, type TreeModel } from "./tree-layout.ts";

/*
 * There is deliberately no prefers-reduced-motion handling here any more.
 * It existed to suppress the autoplay loop; with every advance driven by the
 * reader, the player has no motion of its own to reduce.
 */

export interface VizPlayerProps {
  readonly trace: VizTrace;
  readonly chrome?: VizChrome;
  readonly title?: string;
}

const EMPTY_TREE: TreeModel = { nodes: [], cols: 0, depth: 0 };
const EMPTY_GRAPH: GraphModel = { nodes: [], edges: [], layers: 0, widest: 0 };


/** Plain-language cap reasons, for the badge. */
const CAP_WORD: Record<CapReason, string> = {
  steps: "the step limit was reached",
  loop: "a loop ran more times than the limit shows",
  depth: "recursion went deeper than the limit",
  bytes: "the trace grew too large",
};

/** Indexed reads are `T | undefined` under noUncheckedIndexedAccess. */
const at = <T,>(xs: readonly T[], i: number): T | undefined => xs[i];

function asCells(v: TraceValue | undefined): readonly TraceValue[] {
  return Array.isArray(v) ? v : [];
}

/**
 * The first edge hint that points at or before its own source.
 *
 * A forward edge is just the ordinary `next` and needs no special drawing; a
 * back-edge is a cycle, and 🛑 without finding it a cyclic list renders as if
 * it terminated — the single most important fact about `linked-list-cycle`
 * silently absent from its own diagram.
 */
function findBackEdge(
  edges: Readonly<Record<string, VizRole>> | undefined,
): { from: number; to: number } | undefined {
  if (!edges) return undefined;
  for (const key of Object.keys(edges)) {
    const [a, b] = key.split("->");
    const from = Number(a);
    const to = Number(b);
    if (Number.isInteger(from) && Number.isInteger(to) && to <= from) return { from, to };
  }
  return undefined;
}

export function VizPlayer({ trace, chrome = "explain", title }: VizPlayerProps) {
  const [index, setIndex] = useState(0);
  const scopeRef = useRef<HTMLDivElement | null>(null);

  /*
   * Debugger state. Only meaningful for chrome="trace", but held
   * unconditionally — hooks cannot be called conditionally, and the explain
   * chrome simply never renders the controls that read it.
   */
  const [breakpoints, setBreakpoints] = useState<ReadonlySet<number>>(() => new Set());
  const [conditions, setConditions] = useState<ReadonlyMap<number, string>>(() => new Map());
  const [watchExprs, setWatchExprs] = useState<readonly string[]>([]);
  const [condDraft, setCondDraft] = useState("");
  const [watchDraft, setWatchDraft] = useState("");

  // useId, not a literal: SVG `url(#...)` resolves against the DOCUMENT, so two
  // players on one page would cross-wire their patterns.
  const idPrefix = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const total = trace.frames.length;
  const frame = at(trace.frames, Math.min(index, Math.max(0, total - 1)));
  const spec = at(trace.specs, 0);

  /*
   * 🛑 No autoplay. Every advance is a deliberate step the reader takes.
   *
   * This previously ran a requestAnimationFrame loop behind a play/pause
   * button with a speed control. A diagram that advances on its own pulls the
   * eye forward while you are still reading the caption for the step you are
   * on — which is the opposite of what a teaching animation should do. It also
   * removed the reduced-motion handling entirely, since there is now no motion
   * to reduce.
   */

  const step = useCallback(
    (d: number) => {
      setIndex((i) => Math.min(total - 1, Math.max(0, i + d)));
    },
    [total],
  );

  /*
   * Every debugger command is a seek over the frames already in memory — no
   * re-execution, which is also why `direction: -1` exists at all. Reverse
   * step-out is free here and a research project in a real debugger.
   */
  const command = useCallback(
    (cmd: StepCommand, direction: 1 | -1 = 1) => {
      setIndex((i) =>
        seek(cmd, { frames: trace.frames, from: i, direction, breakpoints, conditions }),
      );
    },
    [trace.frames, breakpoints, conditions],
  );

  const toggleBreakpoint = useCallback((line: number) => {
    setBreakpoints((prev) => {
      const next = new Set(prev);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });
    // A condition belongs to a breakpoint, so clearing the breakpoint clears
    // it — otherwise re-adding the breakpoint would silently resurrect an old
    // condition and look like it was ignoring the click.
    setConditions((prev) => {
      if (!prev.has(line)) return prev;
      const next = new Map(prev);
      next.delete(line);
      return next;
    });
  }, []);

  const executable = useMemo(() => executableLines(trace.frames), [trace.frames]);

  /*
   * 🛑 Scoped to this container, never bound to `window`. The problem page
   * renders ProblemWorkbench's <textarea id="sol"> alongside this, and a window
   * listener would swallow Space and the arrow keys while someone is typing C++.
   */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || t?.isContentEditable) return;

      const handled: Record<string, () => void> = {
        // Space advances one step rather than toggling play, which no longer
        // exists. It stays bound because it is the key people press.
        " ": () => step(1),
        ArrowRight: () => step(e.shiftKey ? 10 : 1),
        l: () => step(1),
        ArrowLeft: () => step(e.shiftKey ? -10 : -1),
        h: () => step(-1),
        Home: () => step(-total),
        End: () => step(total),
        // The conventional debugger keys, so muscle memory transfers. Shift
        // reverses each one, which no real debugger can offer.
        F10: () => command("over", e.shiftKey ? -1 : 1),
        F11: () => command(e.shiftKey ? "out" : "into"),
        F8: () => command("continue", e.shiftKey ? -1 : 1),
        F5: () => command("continue", e.shiftKey ? -1 : 1),
      };
      const fn = handled[e.key];
      if (!fn) return;
      e.preventDefault();
      fn();
    },
    [step, total, command],
  );

  const cells = useMemo(
    () => (spec ? asCells(frame?.vars[spec.var]) : []),
    [spec, frame],
  );
  const roles = spec ? frame?.roles?.cells?.[spec.var] : undefined;

  /*
   * Decoded once per frame rather than per render. The layout is deterministic,
   * so a node sits at the same pixel in every frame — the anti-jitter rule.
   */
  const treeModel = useMemo(
    () => (spec?.kind === "tree" ? decodeLevelOrder(cells.map((c) => String(c))) : EMPTY_TREE),
    [spec, cells],
  );

  /**
   * Pointer flags, from the frame's `roles.pointers` hints.
   *
   * Only hints that point INTO the drawn variable are kept: a pointer into a
   * different array would land at a meaningless position on this diagram, and
   * a flag in the wrong place is worse than no flag.
   */
  const pointers = useMemo(() => {
    const hints = frame?.roles?.pointers;
    if (!hints || !spec) return [];
    return Object.entries(hints)
      .filter(([, h]) => h.into === spec.var)
      .map(([name, h]) => ({ label: h.label ?? name, at: Number(frame?.vars[name] ?? -1) }))
      .filter((p) => Number.isInteger(p.at) && p.at >= 0);
  }, [frame, spec]);

  /**
   * A cycle, read off the edge hints as a `"from->to"` key.
   *
   * 🛑 Without this a cyclic list renders as if it terminated — the single most
   * important fact about `linked-list-cycle` silently absent from its own
   * diagram.
   */
  const edgeHints = spec ? frame?.roles?.edges?.[spec.var] : undefined;
  const cycle = useMemo(() => findBackEdge(edgeHints), [edgeHints]);

  /*
   * Decoded once per frame, like the tree model. Deterministic by construction
   * (see graph-layout.ts), so a node sits at the same pixel in every frame.
   */
  const graphEncoding = spec?.kind === "graph" ? spec.encoding : undefined;
  const graphDirected = spec?.kind === "graph" && spec.directed === true;
  const graphModel = useMemo(() => {
    if (graphEncoding === undefined) return EMPTY_GRAPH;
    return graphEncoding === "edgeList"
      ? decodeEdgeList(cells, { directed: graphDirected })
      : decodeAdjacencyList(cells, { directed: graphDirected });
  }, [graphEncoding, graphDirected, cells]);

  /** The previous frame, so the variable panel can mark what changed. */
  const prevFrame = at(trace.frames, Math.min(index, Math.max(0, total - 1)) - 1);

  /** Lines the planner could not instrument, so the gutter can explain a gap. */
  const skippedByLine = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of trace.coverage?.skipped ?? []) m.set(s.line, s.reason);
    return m;
  }, [trace.coverage]);

  const watches = useMemo(
    () =>
      watchExprs.map((expr) => {
        const r = frame ? evaluateWatch(expr, frame.vars) : { ok: false as const };
        // null means "could not resolve here", which the panel renders as
        // "not in scope" rather than as a value.
        return { expr, value: r.ok ? r.value : null };
      }),
    [watchExprs, frame],
  );

  /*
   * A frame is required; a SPEC is not.
   *
   * 🛑 A trace of a program with no collection in scope — a pure-arithmetic or
   * bit-manipulation solution — has nothing to draw, but the code pane,
   * variable panel and the whole step debugger are still exactly as useful.
   * Refusing to render those because no diagram could be inferred would throw
   * away the feature over a missing nice-to-have. The explain chrome does still
   * need a spec, because a diagram is all it has.
   */
  if (!frame || (!spec && chrome === "explain")) {
    return (
      <p className="rounded-md border border-border bg-surface p-4 text-sm text-text-muted">
        No visualization available for this problem.
      </p>
    );
  }

  const caption = frame.note ?? "";
  const asString = spec?.kind === "array" && spec.asString === true;
  const isTrace = chrome === "trace" && trace.source.trim() !== "";
  const condLine = frame.line;
  const condDraftOk = isConditionParseable(condDraft);

  return (
    <div
      ref={scopeRef}
      role="group"
      tabIndex={0}
      aria-label={title ?? "Problem walkthrough"}
      onKeyDown={onKeyDown}
      className="rounded-md border border-border bg-surface focus-visible:outline-none"
    >
      <div className="flex items-baseline justify-between border-b border-border px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-text-faint">
          {title ?? (chrome === "explain" ? "understand the problem" : "trace")}
        </span>
        <span className="font-mono text-[11px] text-text-faint">
          step {index + 1} / {total}
        </span>
      </div>

      {/* 🛑 chrome="trace" only ever renders frames that came from running the
          code shown here. Anything else is a WALKTHROUGH and uses the explain
          chrome — otherwise the line highlight would point at code that was
          never executed, which is a lie told convincingly. */}
      {isTrace ? (
        <div className="grid gap-px border-b border-border bg-border lg:grid-cols-[3fr_2fr]">
          <div className="bg-surface">
            <CodePane
              source={trace.source}
              {...(frame.line !== undefined ? { currentLine: frame.line } : {})}
              breakpoints={breakpoints}
              executable={executable}
              onToggleBreakpoint={toggleBreakpoint}
              conditions={conditions}
              skipped={skippedByLine}
            />
          </div>
          <div className="bg-surface">
            <VarsPane
              vars={frame.vars}
              {...(prevFrame ? { previous: prevFrame.vars } : {})}
              watches={watches}
              onRemoveWatch={(expr) =>
                setWatchExprs((prev) => prev.filter((e) => e !== expr))
              }
            />
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto p-3">
        {!spec ? null : spec.kind === "array" ? (
          <ArrayView values={cells} roles={roles} asString={asString} idPrefix={idPrefix} />
        ) : spec.kind === "grid" ? (
          <GridView
            // A grid's cells arrive as rows; a stray scalar row is wrapped so a
            // malformed value degrades to one cell rather than throwing.
            rows={cells.map((row) => (Array.isArray(row) ? row : [row]))}
            roles={roles}
            {...(spec.rowLabels ? { rowLabels: spec.rowLabels } : {})}
            {...(spec.colLabels ? { colLabels: spec.colLabels } : {})}
            idPrefix={idPrefix}
          />
        ) : spec.kind === "tree" ? (
          <TreeView model={treeModel} roles={roles} idPrefix={idPrefix} />
        ) : spec.kind === "linkedList" ? (
          <ChainView
            values={cells}
            roles={roles}
            {...(pointers.length > 0 ? { pointers } : {})}
            {...(cycle ? { cycleFrom: cycle.from, cycleTo: cycle.to } : {})}
            idPrefix={idPrefix}
          />
        ) : spec.kind === "stack" || spec.kind === "queue" || spec.kind === "heap" ? (
          <SlabsView values={cells} kind={spec.kind} roles={roles} idPrefix={idPrefix} />
        ) : (
          <GraphView
            model={graphModel}
            roles={roles}
            {...(edgeHints ? { edgeRoles: edgeHints } : {})}
            {...(spec.directed ? { directed: true } : {})}
            idPrefix={idPrefix}
          />
        )}
      </div>

      {/* The caption is the primary non-visual channel: the SVG is aria-hidden,
          so this text is what carries the meaning. */}
      <p className="border-t border-border px-3 py-2 text-sm text-text-muted">{caption}</p>

      {/* Safe to announce on every step now that steps only happen when the
          reader asks for one. Under autoplay this fired continuously, which is
          a denial of service on a screen reader. */}
      <p aria-live="polite" className="sr-only">
        {`Step ${index + 1} of ${total}. ${caption}`}
      </p>

      <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2 text-xs">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={index === 0}
          className="rounded-sm border border-border px-2 py-1 font-mono transition-colors hover:bg-surface-raised disabled:opacity-40"
        >
          prev
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={index + 1 >= total}
          className="rounded-sm border border-border px-2 py-1 font-mono transition-colors hover:bg-surface-raised disabled:opacity-40"
        >
          next
        </button>

        <input
          type="range"
          min={0}
          max={Math.max(0, total - 1)}
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
          aria-label="Step"
          aria-valuetext={`Step ${index + 1} of ${total}`}
          className="h-1 flex-1 accent-accent"
        />

        <span className="font-mono text-[11px] text-text-faint">
          space or → to step
        </span>
      </div>

      {isTrace ? (
        <>
          <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2 text-xs">
            <span className="font-mono text-[11px] uppercase tracking-wider text-text-faint">
              debug
            </span>
            {(
              [
                ["into", "into", "F11", "one frame"],
                ["over", "over", "F10", "skip the whole call"],
                ["out", "out", "⇧F11", "leave this function"],
                ["continue", "continue", "F8", "to the next breakpoint"],
              ] as const
            ).map(([cmd, label, key, hint]) => (
              <span key={cmd} className="inline-flex">
                <button
                  type="button"
                  onClick={() => command(cmd)}
                  title={`${hint} (${key})`}
                  className="rounded-l-sm border border-border px-2 py-1 font-mono transition-colors hover:bg-surface-raised"
                >
                  {label}
                </button>
                {/* Reverse is a first-class button, not a modifier only, because
                    it is the single most useful thing a captured trace can do
                    that a live debugger cannot. */}
                <button
                  type="button"
                  onClick={() => command(cmd, -1)}
                  aria-label={`${label} backwards`}
                  title={`${label} backwards — only possible because the whole trace is captured`}
                  className="-ml-px rounded-r-sm border border-border px-1.5 py-1 font-mono text-text-faint transition-colors hover:bg-surface-raised hover:text-text"
                >
                  ↩
                </button>
              </span>
            ))}
            {breakpoints.size > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setBreakpoints(new Set());
                  setConditions(new Map());
                }}
                className="rounded-sm border border-border px-2 py-1 font-mono text-text-faint transition-colors hover:bg-surface-raised hover:text-text"
              >
                clear {breakpoints.size} breakpoint{breakpoints.size === 1 ? "" : "s"}
              </button>
            ) : (
              <span className="font-mono text-[11px] text-text-faint">
                click the gutter to set a breakpoint
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2 text-xs">
            {condLine !== undefined && breakpoints.has(condLine) ? (
              <>
                <label
                  htmlFor={`${idPrefix}-cond`}
                  className="font-mono text-[11px] text-text-faint"
                >
                  break on line {condLine} when
                </label>
                <input
                  id={`${idPrefix}-cond`}
                  value={condDraft}
                  onChange={(e) => setCondDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || !condDraftOk) return;
                    setConditions((prev) => {
                      const next = new Map(prev);
                      if (condDraft.trim() === "") next.delete(condLine);
                      else next.set(condLine, condDraft.trim());
                      return next;
                    });
                    setCondDraft("");
                  }}
                  placeholder="i == 5"
                  aria-invalid={!condDraftOk}
                  className="w-40 rounded-sm border border-border bg-bg px-2 py-1 font-mono"
                />
                {/* 🛑 Said out loud rather than failing silently. The evaluator
                    fails CLOSED, so an unparseable condition means the
                    breakpoint never fires — which without this message is
                    indistinguishable from the debugger ignoring it. */}
                {!condDraftOk ? (
                  <span className="font-mono text-[11px] text-error">
                    only <code>var op value</code> with == != &lt; &lt;= &gt; &gt;= and &amp;&amp;
                    / || — no arithmetic or calls
                  </span>
                ) : null}
              </>
            ) : (
              <span className="font-mono text-[11px] text-text-faint">
                select a frame on a breakpoint line to add a condition
              </span>
            )}

            <span className="flex-1" />

            <label htmlFor={`${idPrefix}-watch`} className="font-mono text-[11px] text-text-faint">
              watch
            </label>
            <input
              id={`${idPrefix}-watch`}
              value={watchDraft}
              onChange={(e) => setWatchDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                const expr = watchDraft.trim();
                if (expr === "") return;
                setWatchExprs((prev) => (prev.includes(expr) ? prev : [...prev, expr]));
                setWatchDraft("");
              }}
              placeholder="nums[lo]"
              className="w-32 rounded-sm border border-border bg-bg px-2 py-1 font-mono"
            />
          </div>
        </>
      ) : null}

      {/* 🛑 The coverage badge. "~85% and says so" is only true if it SAYS so on
          screen, and a truncated trace presented as a complete one teaches the
          wrong thing. Both facts are stated here or nowhere. */}
      {isTrace && (trace.coverage || trace.capped) ? (
        <p className="border-t border-border px-3 py-2 font-mono text-[11px] text-text-faint">
          {trace.coverage
            ? `traced ${trace.coverage.statementsInstrumented} of ${trace.coverage.statementsFound} statements`
            : null}
          {trace.coverage?.skipped?.length
            ? ` · ${trace.coverage.skipped.length} skipped (${trace.coverage.skipped[0]?.reason ?? "unknown"})`
            : null}
          {trace.capped
            ? ` · stopped early: ${CAP_WORD[trace.capped.reason]}${
                trace.capped.line ? ` at line ${trace.capped.line}` : ""
              } — this trace is incomplete`
            : null}
        </p>
      ) : null}

      {/* Role information as WORDS, so nothing depends on colour. Doubles as the
          debugging view when a visualization looks wrong. */}
      {roles && Object.keys(roles).length > 0 ? (
        <details className="border-t border-border px-3 py-2">
          <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-wider text-text-faint">
            This step as a table
          </summary>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {Object.entries(roles).map(([cell, role]) => (
              <div key={cell} className="col-span-2 grid grid-cols-subgrid">
                <dt className="font-mono text-text-faint">
                  {spec?.var}[{cell}]
                </dt>
                <dd>
                  {String(cells[Number(cell)] ?? "")} — {ROLE_WORD[role as VizRole]}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
    </div>
  );
}
