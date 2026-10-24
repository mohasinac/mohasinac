/**
 * Linked-list renderer — the `chain` motif.
 *
 * Nodes as separate cards joined by arrows, which is the whole point: an array
 * is one contiguous strip (see ArrayView's ruled look) and a list is discrete
 * cells that *point* at each other. Drawing them the same way would teach the
 * single most important difference wrong.
 *
 * 🛑 A cycle is a first-class case, not an error. `linked-list-cycle` and
 * `fast-and-slow-pointers` are the reason this renderer exists, and a cycle is
 * drawn as an arc returning to the target node — a straight arrow off the end
 * would show nothing at all. The encoder marks it; this file only draws it.
 *
 * Follows the SectionArt / ArrayView idiom: inline SVG, `aria-hidden`, colour
 * as SVG **attributes** via `var(--appkit-color-*)`, and the meaning carried in
 * the caption and variable panel rather than in the graphic.
 */

import type { TraceValue, VizRole } from "../trace/types.ts";
import { ROLE_DASH, ROLE_FILL, ROLE_INK, ROLE_STROKE_WIDTH } from "../theme/roles.ts";

export interface ChainViewProps {
  readonly values: readonly TraceValue[];
  /** Node index -> role. Absent entries are `idle`. */
  readonly roles?: Readonly<Record<string, VizRole>>;
  /** Scalar name -> node index, drawn as a flag above (head/slow/fast/prev). */
  readonly pointers?: readonly { readonly label: string; readonly at: number }[];
  /**
   * Index whose `next` points back into the list, and where to. Absent means
   * the list terminates, which is drawn as an explicit null rather than just
   * stopping — "it ends here" is information.
   */
  readonly cycleFrom?: number;
  readonly cycleTo?: number;
  readonly idPrefix: string;
}

const PAD = 10;
const FLAG_H = 22;
const NODE_H = 36;
const GAP = 30;
const ARC_H = 26;

function nodeWidth(values: readonly TraceValue[]): number {
  const longest = values.reduce<number>((n, v) => Math.max(n, String(v).length), 1);
  return Math.max(40, 14 + longest * 9);
}

export function ChainView({
  values,
  roles,
  pointers,
  cycleFrom,
  cycleTo,
  idPrefix,
}: ChainViewProps) {
  const w = nodeWidth(values);
  const n = Math.max(1, values.length);
  const hasCycle = cycleFrom !== undefined && cycleTo !== undefined;

  // The null terminator occupies one more slot, so it is included in the width.
  const slots = hasCycle ? n : n + 1;
  const width = PAD * 2 + slots * w + (slots - 1) * GAP;
  // The return arc is drawn BELOW the nodes, so it needs its own band — without
  // it the arc is clipped by the viewBox and silently disappears.
  const height = PAD * 2 + FLAG_H + NODE_H + (hasCycle ? ARC_H : 0);
  const top = PAD + FLAG_H;

  const xOf = (i: number) => PAD + i * (w + GAP);
  const arrowId = `${idPrefix}-chain-arrow`;

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMinYMid meet"
      className="h-auto w-full"
      style={{ maxHeight: "12rem" }}
    >
      <defs>
        {/* `context-stroke` makes one marker take the colour of whichever line
            uses it, so a role-coloured arrow needs no per-role duplicate. */}
        <marker
          id={arrowId}
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0,1 L7,4 L0,7 z" fill="context-stroke" />
        </marker>
      </defs>

      {values.map((value, i) => {
        const role: VizRole = (roles?.[String(i)] as VizRole | undefined) ?? "idle";
        const x = xOf(i);
        const isLast = i === values.length - 1;
        const outgoing = hasCycle && i === cycleFrom ? undefined : xOf(i + 1);

        return (
          <g key={i}>
            <rect
              x={x}
              y={top}
              width={w}
              height={NODE_H}
              rx={3}
              fill={ROLE_FILL[role]}
              stroke={ROLE_INK[role]}
              strokeWidth={ROLE_STROKE_WIDTH[role]}
              strokeDasharray={ROLE_DASH[role] || undefined}
            />
            <text
              x={x + w / 2}
              y={top + NODE_H / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--viz-cell-text)"
              fontSize="13"
              fontFamily="var(--font-code, ui-monospace), monospace"
            >
              {String(value)}
            </text>

            {/* Forward arrow into the next node, or into the null terminator. */}
            {outgoing !== undefined ? (
              <line
                x1={x + w}
                y1={top + NODE_H / 2}
                x2={outgoing - 3}
                y2={top + NODE_H / 2}
                stroke={ROLE_INK[role]}
                strokeWidth={1.25}
                markerEnd={`url(#${arrowId})`}
              />
            ) : null}

            {/* The return arc for a cycle, drawn under the nodes. */}
            {hasCycle && i === cycleFrom && cycleTo !== undefined ? (
              <path
                d={`M ${x + w / 2} ${top + NODE_H} C ${x + w / 2} ${top + NODE_H + ARC_H}, ${
                  xOf(cycleTo) + w / 2
                } ${top + NODE_H + ARC_H}, ${xOf(cycleTo) + w / 2} ${top + NODE_H + 3}`}
                fill="none"
                stroke={ROLE_INK.comparing}
                strokeWidth={1.25}
                strokeDasharray="3 2"
                markerEnd={`url(#${arrowId})`}
              />
            ) : null}

            {/* Pointer flags above, same convention as ArrayView so the two
                read identically when a problem uses both. */}
            {pointers
              ?.filter((p) => p.at === i)
              .map((p, k) => (
                <text
                  key={p.label}
                  x={x + w / 2}
                  y={PAD + FLAG_H - 6 - k * 11}
                  textAnchor="middle"
                  fill={ROLE_INK.pointer}
                  fontSize="10"
                  fontFamily="var(--font-code, ui-monospace), monospace"
                >
                  {p.label}↓
                </text>
              ))}

            {/* An explicit null, so "the list ends" is drawn rather than
                implied by the absence of anything. */}
            {isLast && !hasCycle ? (
              <text
                x={xOf(i + 1) + w / 2}
                y={top + NODE_H / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fill="var(--viz-ink-idle)"
                fontSize="12"
                fontFamily="var(--font-code, ui-monospace), monospace"
              >
                null
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
