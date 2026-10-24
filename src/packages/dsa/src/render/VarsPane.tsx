"use client";

/**
 * The variable panel: name, value, and — the part that makes a trace readable —
 * which values CHANGED on this step.
 *
 * Watching a table of twelve variables tells you very little; watching the one
 * that just moved tells you what the line did. So a changed name is marked, and
 * marked with a word as well as a colour, because the whole panel is also the
 * fallback for anyone who cannot see the diagram.
 */

import type { ReactNode } from "react";
import type { TraceValue } from "../trace/types.ts";

export interface VarsPaneProps {
  readonly vars: Readonly<Record<string, TraceValue>>;
  /** The previous frame's vars, for the change marks. Absent on the first frame. */
  readonly previous?: Readonly<Record<string, TraceValue>>;
  readonly watches?: readonly { readonly expr: string; readonly value: TraceValue | null }[];
  readonly onRemoveWatch?: (expr: string) => void;
}

/** Short enough to sit in a table cell; the full value is the title attribute. */
function render(v: TraceValue | undefined): string {
  if (v === undefined) return "—";
  if (v === null) return "null";
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x) => render(x)).join(", ")}]`;
  return String(v);
}

const same = (a: TraceValue | undefined, b: TraceValue | undefined): boolean =>
  render(a) === render(b);

export function VarsPane({ vars, previous, watches, onRemoveWatch }: VarsPaneProps): ReactNode {
  const names = Object.keys(vars);

  if (names.length === 0 && (!watches || watches.length === 0)) {
    return (
      <p className="px-3 py-2 text-xs text-text-muted">
        No variables are in scope at this step.
      </p>
    );
  }

  return (
    <div className="max-h-80 overflow-auto px-3 py-2">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        {names.map((name) => {
          // `previous === undefined` is the first frame: nothing has changed
          // yet, so nothing is marked. Treating it as "everything changed"
          // would make the first step a wall of highlights.
          const changed = previous !== undefined && !same(vars[name], previous[name]);
          const full = render(vars[name]);
          return (
            <div key={name} className="col-span-2 grid grid-cols-subgrid">
              <dt
                className={[
                  "font-mono",
                  changed ? "text-accent" : "text-text-faint",
                ].join(" ")}
              >
                {name}
              </dt>
              <dd className="flex min-w-0 items-baseline gap-2">
                <span
                  title={full}
                  className={[
                    "truncate font-mono",
                    changed ? "text-text" : "text-text-muted",
                  ].join(" ")}
                >
                  {full}
                </span>
                {changed ? (
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-accent">
                    changed
                  </span>
                ) : null}
              </dd>
            </div>
          );
        })}

        {watches?.map((w) => (
          <div key={`watch:${w.expr}`} className="col-span-2 grid grid-cols-subgrid">
            <dt className="truncate font-mono text-info" title={w.expr}>
              {w.expr}
            </dt>
            <dd className="flex min-w-0 items-baseline gap-2">
              <span className="truncate font-mono text-text-muted">
                {/* null is the "could not resolve" signal, distinct from a
                    value that genuinely IS null — saying so beats showing a
                    stale or invented value. */}
                {w.value === null ? "not in scope here" : render(w.value)}
              </span>
              {onRemoveWatch ? (
                <button
                  type="button"
                  onClick={() => onRemoveWatch(w.expr)}
                  aria-label={`Stop watching ${w.expr}`}
                  className="shrink-0 font-mono text-[10px] text-text-faint hover:text-error"
                >
                  remove
                </button>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
