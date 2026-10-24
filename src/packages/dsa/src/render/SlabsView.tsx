/**
 * Stack / queue / heap renderer — the `slabs` motif.
 *
 * 🛑 Orientation carries the meaning, and it differs per kind:
 *
 *   stack  — VERTICAL, growing upward, with the top marked. Push and pop happen
 *            at the same end, and a horizontal row cannot show that.
 *   queue  — HORIZONTAL, with `front` and `back` marked at opposite ends. The
 *            whole point of a queue is that they ARE opposite ends.
 *   heap   — vertical levels, each row twice the previous, so the shape that
 *            makes the complexity O(log n) is the thing you can see.
 *
 * Rendering all three as one recoloured strip would erase exactly the property
 * each one is taught for — which is why the plan asked for motifs rather than
 * "the same blocks in different colours".
 */

import type { TraceValue, VizRole } from "../trace/types.ts";
import { ROLE_DASH, ROLE_FILL, ROLE_INK, ROLE_STROKE_WIDTH } from "../theme/roles.ts";

export type SlabsKind = "stack" | "queue" | "heap";

export interface SlabsViewProps {
  readonly values: readonly TraceValue[];
  readonly kind: SlabsKind;
  readonly roles?: Readonly<Record<string, VizRole>>;
  readonly idPrefix: string;
}

const PAD = 10;
const SLAB_H = 26;
const SLAB_GAP = 3;
const LABEL_W = 44;

function slabWidth(values: readonly TraceValue[]): number {
  const longest = values.reduce<number>((n, v) => Math.max(n, String(v).length), 1);
  return Math.max(46, 14 + longest * 9);
}

export function SlabsView({ values, kind, roles, idPrefix }: SlabsViewProps) {
  const roleAt = (i: number): VizRole =>
    (roles?.[String(i)] as VizRole | undefined) ?? "idle";

  if (kind === "queue") return <QueueView values={values} roleAt={roleAt} />;
  if (kind === "heap") return <HeapView values={values} roleAt={roleAt} idPrefix={idPrefix} />;
  return <StackView values={values} roleAt={roleAt} />;
}

/* ------------------------------------------------------------------- stack */

function StackView({
  values,
  roleAt,
}: {
  values: readonly TraceValue[];
  roleAt: (i: number) => VizRole;
}) {
  const w = slabWidth(values);
  const n = Math.max(1, values.length);
  const width = PAD * 2 + LABEL_W + w;
  const height = PAD * 2 + n * (SLAB_H + SLAB_GAP);

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMinYMid meet"
      width={width}
      height={height}
      className="h-auto max-w-full"
      style={{ maxHeight: "16rem" }}
    >
      {values.map((value, i) => {
        // Index 0 is the BOTTOM of the stack, so it is drawn last — reversing
        // here is what makes "push goes on top" visible.
        const fromTop = values.length - 1 - i;
        const y = PAD + fromTop * (SLAB_H + SLAB_GAP);
        const role = roleAt(i);
        const isTop = i === values.length - 1;
        return (
          <g key={i}>
            <rect
              x={PAD + LABEL_W}
              y={y}
              width={w}
              height={SLAB_H}
              rx={2}
              fill={ROLE_FILL[role]}
              stroke={ROLE_INK[role]}
              strokeWidth={ROLE_STROKE_WIDTH[role]}
              strokeDasharray={ROLE_DASH[role] || undefined}
            />
            <text
              x={PAD + LABEL_W + w / 2}
              y={y + SLAB_H / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--viz-cell-text)"
              fontSize="13"
              fontFamily="var(--font-code, ui-monospace), monospace"
            >
              {String(value)}
            </text>
            {isTop ? (
              <text
                x={PAD + LABEL_W - 6}
                y={y + SLAB_H / 2}
                textAnchor="end"
                dominantBaseline="central"
                fill={ROLE_INK.pointer}
                fontSize="10"
                fontFamily="var(--font-code, ui-monospace), monospace"
              >
                top →
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------- queue */

function QueueView({
  values,
  roleAt,
}: {
  values: readonly TraceValue[];
  roleAt: (i: number) => VizRole;
}) {
  const w = slabWidth(values);
  const n = Math.max(1, values.length);
  const width = PAD * 2 + n * (w + SLAB_GAP);
  const height = PAD * 2 + SLAB_H + 18;
  const top = PAD;

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMinYMid meet"
      width={width}
      height={height}
      className="h-auto max-w-full"
      style={{ maxHeight: "9rem" }}
    >
      {values.map((value, i) => {
        const x = PAD + i * (w + SLAB_GAP);
        const role = roleAt(i);
        const label = i === 0 ? "front" : i === values.length - 1 ? "back" : "";
        return (
          <g key={i}>
            <rect
              x={x}
              y={top}
              width={w}
              height={SLAB_H}
              rx={2}
              fill={ROLE_FILL[role]}
              stroke={ROLE_INK[role]}
              strokeWidth={ROLE_STROKE_WIDTH[role]}
              strokeDasharray={ROLE_DASH[role] || undefined}
            />
            <text
              x={x + w / 2}
              y={top + SLAB_H / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--viz-cell-text)"
              fontSize="13"
              fontFamily="var(--font-code, ui-monospace), monospace"
            >
              {String(value)}
            </text>
            {/* Both ends are labelled even when the queue holds one element,
                in which case front and back are the same cell — which is worth
                seeing rather than hiding. */}
            {label ? (
              <text
                x={x + w / 2}
                y={top + SLAB_H + 12}
                textAnchor="middle"
                fill={ROLE_INK.pointer}
                fontSize="10"
                fontFamily="var(--font-code, ui-monospace), monospace"
              >
                {label}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/* -------------------------------------------------------------------- heap */

function HeapView({
  values,
  roleAt,
  idPrefix,
}: {
  values: readonly TraceValue[];
  roleAt: (i: number) => VizRole;
  idPrefix: string;
}) {
  const n = values.length;
  const depth = n === 0 ? 1 : Math.floor(Math.log2(n)) + 1;
  const widest = 2 ** (depth - 1);
  const cell = 34;
  const rowH = 46;
  const width = PAD * 2 + widest * cell;
  const height = PAD * 2 + depth * rowH;

  /* A binary heap is an implicit tree over an array: child of i is 2i+1 /
   * 2i+2. Positions are computed from that arithmetic, so the layout is
   * deterministic and a node sits at the same pixel in every frame — the
   * anti-jitter rule the plan sets for every renderer. */
  const centreOf = (i: number): { x: number; y: number } => {
    const level = Math.floor(Math.log2(i + 1));
    const indexInLevel = i + 1 - 2 ** level;
    const slots = 2 ** level;
    const slotW = (width - PAD * 2) / slots;
    return {
      x: PAD + slotW * (indexInLevel + 0.5),
      y: PAD + level * rowH + rowH / 2 - 8,
    };
  };

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      width={width}
      height={height}
      className="h-auto max-w-full"
      style={{ maxHeight: "16rem" }}
    >
      {/* Edges first, so nodes paint over their endpoints. */}
      {values.map((_, i) => {
        const kids = [2 * i + 1, 2 * i + 2].filter((k) => k < n);
        const from = centreOf(i);
        return kids.map((k) => {
          const to = centreOf(k);
          return (
            <line
              key={`${idPrefix}-e-${i}-${k}`}
              x1={from.x}
              y1={from.y + 12}
              x2={to.x}
              y2={to.y - 12}
              stroke="var(--viz-ink-idle)"
              strokeWidth={1}
            />
          );
        });
      })}

      {values.map((value, i) => {
        const { x, y } = centreOf(i);
        const role = roleAt(i);
        return (
          <g key={i}>
            <circle
              cx={x}
              cy={y}
              r={13}
              fill={ROLE_FILL[role]}
              stroke={ROLE_INK[role]}
              strokeWidth={ROLE_STROKE_WIDTH[role]}
              strokeDasharray={ROLE_DASH[role] || undefined}
            />
            <text
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--viz-cell-text)"
              fontSize="12"
              fontFamily="var(--font-code, ui-monospace), monospace"
            >
              {String(value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
