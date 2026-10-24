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

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { TraceValue, VizChrome, VizRole, VizTrace } from "../trace/types.ts";
import { ROLE_WORD } from "../theme/roles.ts";
import { ArrayView } from "./ArrayView.tsx";
import { GridView } from "./GridView.tsx";

/*
 * prefers-reduced-motion as an external store rather than state set inside an
 * effect. Setting state synchronously in an effect causes cascading renders
 * (and eslint's react-hooks rule rejects it); this is the shape the hook exists
 * for, and `getServerSnapshot` returning true means the server always emits the
 * calm variant.
 */
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export interface VizPlayerProps {
  readonly trace: VizTrace;
  readonly chrome?: VizChrome;
  readonly title?: string;
}

const SPEEDS = [0.5, 1, 2, 4] as const;
const BASE_MS = 1400;

/** Indexed reads are `T | undefined` under noUncheckedIndexedAccess. */
const at = <T,>(xs: readonly T[], i: number): T | undefined => xs[i];

function asCells(v: TraceValue | undefined): readonly TraceValue[] {
  return Array.isArray(v) ? v : [];
}

export function VizPlayer({ trace, chrome = "explain", title }: VizPlayerProps) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const scopeRef = useRef<HTMLDivElement | null>(null);

  // useId, not a literal: SVG `url(#...)` resolves against the DOCUMENT, so two
  // players on one page would cross-wire their patterns.
  const idPrefix = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const total = trace.frames.length;
  const frame = at(trace.frames, Math.min(index, Math.max(0, total - 1)));
  const spec = at(trace.specs, 0);

  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    // The server renders the CALM variant, which is both the safe default and
    // hydration-stable.
    () => true,
  );

  /*
   * requestAnimationFrame rather than setInterval: no drift, it pauses with a
   * background tab, and — because every accumulator lives inside the effect
   * closure — React's StrictMode double-mount in dev discards the whole thing
   * on cleanup instead of running two timers at once. setIndex is a functional
   * update for the same reason.
   */
  useEffect(() => {
    if (!playing || reducedMotion || total <= 1) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const tick = () => {
      const now = performance.now();
      acc += now - last;
      last = now;
      if (acc >= BASE_MS / speed) {
        acc = 0;
        setIndex((i) => {
          if (i + 1 < total) return i + 1;
          setPlaying(false);
          return i;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, total, reducedMotion]);

  const step = useCallback(
    (d: number) => {
      setPlaying(false);
      setIndex((i) => Math.min(total - 1, Math.max(0, i + d)));
    },
    [total],
  );

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
        " ": () => setPlaying((p) => !p),
        k: () => setPlaying((p) => !p),
        ArrowRight: () => step(e.shiftKey ? 10 : 1),
        l: () => step(1),
        ArrowLeft: () => step(e.shiftKey ? -10 : -1),
        h: () => step(-1),
        Home: () => step(-total),
        End: () => step(total),
        Escape: () => setPlaying(false),
      };
      const fn = handled[e.key];
      if (!fn) return;
      e.preventDefault();
      fn();
    },
    [step, total],
  );

  const cells = useMemo(
    () => (spec ? asCells(frame?.vars[spec.var]) : []),
    [spec, frame],
  );
  const roles = spec ? frame?.roles?.cells?.[spec.var] : undefined;

  if (!frame || !spec) {
    return (
      <p className="rounded-md border border-border bg-surface p-4 text-sm text-text-muted">
        No visualization available for this problem.
      </p>
    );
  }

  const caption = frame.note ?? "";
  const asString = spec.kind === "array" && spec.asString === true;

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

      <div className="overflow-x-auto p-3">
        {spec.kind === "array" ? (
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
        ) : (
          // Tree, linked-list, graph and column views land in later phases.
          // Saying so beats drawing the wrong shape.
          <p className="text-sm text-text-muted">
            A <code className="font-mono">{spec.kind}</code> view is not built yet — the caption below is
            still accurate.
          </p>
        )}
      </div>

      {/* The caption is the primary non-visual channel: the SVG is aria-hidden,
          so this text is what carries the meaning. */}
      <p className="border-t border-border px-3 py-2 text-sm text-text-muted">{caption}</p>

      {/* Announced only while paused. A live region firing on every frame of a
          playing animation is a denial of service on a screen reader. */}
      <p aria-live="polite" className="sr-only">
        {!playing ? `Step ${index + 1} of ${total}. ${caption}` : ""}
      </p>

      <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2 text-xs">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-pressed={playing}
          disabled={total <= 1}
          className="rounded-sm border border-border px-2 py-1 font-mono transition-colors hover:bg-surface-raised disabled:opacity-40"
        >
          {playing ? "pause" : "play"}
        </button>
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
          onChange={(e) => {
            setPlaying(false);
            setIndex(Number(e.target.value));
          }}
          aria-label="Step"
          aria-valuetext={`Step ${index + 1} of ${total}`}
          className="h-1 flex-1 accent-accent"
        />

        <button
          type="button"
          onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] ?? 1)}
          className="rounded-sm border border-border px-2 py-1 font-mono transition-colors hover:bg-surface-raised"
        >
          {speed}×
        </button>
        <span className="font-mono text-[11px] text-text-faint">
          space play · ←→ step
        </span>
      </div>

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
                  {spec.var}[{cell}]
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
