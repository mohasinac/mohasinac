/**
 * Array / string renderer — the `ledger` look.
 *
 * A continuous ruled strip with hairline dividers rather than separate boxes,
 * indices in a gutter below, and pointers hanging above as labelled flags. That
 * is deliberately not "plain blocks": the strip reads as one sequence, which is
 * what an array is.
 *
 * Follows the `SectionArt.tsx` idiom — inline SVG, `aria-hidden`, colour
 * applied as SVG **attributes** via `var(--appkit-color-*)` rather than inline
 * style. The information is carried in text elsewhere (the caption, the
 * variable list, the data table), because an SVG with sixty rects is unusable
 * to a screen reader however well each node is labelled.
 */

import type { TraceValue, VizRole } from "../trace/types.ts";
import { ROLE_DASH, ROLE_FILL, ROLE_INK, ROLE_STROKE_WIDTH } from "../theme/roles.ts";

export interface ArrayViewProps {
  readonly values: readonly TraceValue[];
  /** Cell index -> role. Absent entries are `idle`. */
  readonly roles?: Readonly<Record<string, VizRole>>;
  /** Scalar name -> index it points at, drawn as a flag above. */
  readonly pointers?: readonly { readonly label: string; readonly at: number }[];
  readonly asString?: boolean;
  /** Unique per player instance: SVG ids resolve document-wide. */
  readonly idPrefix: string;
}

const PAD = 10;
const FLAG_H = 22;
const CELL_H = 38;
const INDEX_H = 16;

/** Rough text width without touching the DOM, so this works during SSR. */
function cellWidth(values: readonly TraceValue[], asString: boolean): number {
  if (asString) return 26;
  const longest = values.reduce<number>((n, v) => Math.max(n, String(v).length), 1);
  return Math.max(34, 12 + longest * 9);
}

export function ArrayView({
  values,
  roles,
  pointers,
  asString = false,
  idPrefix,
}: ArrayViewProps) {
  const w = cellWidth(values, asString);
  const width = PAD * 2 + Math.max(1, values.length) * w;
  const height = PAD * 2 + FLAG_H + CELL_H + INDEX_H;
  const top = PAD + FLAG_H;

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMinYMid meet"
      width={width}
      height={height}
      className="h-auto max-w-full"
      style={{ maxHeight: "14rem" }}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <defs>
        {/* Hatch for `visited` — the non-colour channel for that role. */}
        <pattern
          id={`${idPrefix}-hatch`}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="6"
            stroke={ROLE_INK.visited}
            strokeWidth="1"
            opacity="0.5"
          />
        </pattern>
      </defs>

      {/* The strip: one outline round the whole sequence, so it reads as a
          single thing rather than n boxes. */}
      <rect
        x={PAD}
        y={top}
        width={Math.max(1, values.length) * w}
        height={CELL_H}
        rx="3"
        fill="var(--appkit-color-surface)"
        stroke="var(--appkit-color-border)"
        strokeWidth="1"
      />

      {values.map((v, i) => {
        const role: VizRole = roles?.[String(i)] ?? "idle";
        const x = PAD + i * w;
        const isIdle = role === "idle";
        return (
          <g key={i}>
            {!isIdle ? (
              <rect
                x={x + 1}
                y={top + 1}
                width={w - 2}
                height={CELL_H - 2}
                rx="2"
                fill={role === "visited" ? `url(#${idPrefix}-hatch)` : ROLE_FILL[role]}
                stroke={ROLE_INK[role]}
                strokeWidth={ROLE_STROKE_WIDTH[role]}
                {...(ROLE_DASH[role] ? { strokeDasharray: ROLE_DASH[role] } : {})}
              />
            ) : null}

            {/* Hairline divider rather than a gap: keeps the strip continuous. */}
            {i > 0 ? (
              <line
                x1={x}
                y1={top + 4}
                x2={x}
                y2={top + CELL_H - 4}
                stroke="var(--appkit-color-border)"
                strokeWidth="1"
              />
            ) : null}

            <text
              x={x + w / 2}
              y={top + CELL_H / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--viz-cell-text)"
              fontSize="13"
              fontFamily="var(--appkit-font-mono, ui-monospace, monospace)"
              {...(role === "discarded" ? { opacity: 0.55 } : {})}
            >
              {String(v)}
            </text>

            {/* Struck through for `discarded` — again, not colour alone. */}
            {role === "discarded" ? (
              <line
                x1={x + 5}
                y1={top + CELL_H / 2}
                x2={x + w - 5}
                y2={top + CELL_H / 2}
                stroke={ROLE_INK.discarded}
                strokeWidth="1"
              />
            ) : null}

            <text
              x={x + w / 2}
              y={top + CELL_H + INDEX_H - 4}
              textAnchor="middle"
              fill="var(--appkit-color-text-faint)"
              fontSize="10"
              fontFamily="var(--appkit-font-mono, ui-monospace, monospace)"
            >
              {i}
            </text>
          </g>
        );
      })}

      {/* Pointer flags, stacked into lanes when two land on the same cell. */}
      {(pointers ?? []).map((p, n) => {
        if (p.at < 0 || p.at >= values.length) return null;
        const x = PAD + p.at * w + w / 2;
        const collisions = (pointers ?? []).filter((q, m) => m < n && q.at === p.at).length;
        const y = PAD + FLAG_H - 6 - collisions * 11;
        return (
          <g key={`${p.label}-${n}`}>
            <line
              x1={x}
              y1={y + 2}
              x2={x}
              y2={top}
              stroke={ROLE_INK.pointer}
              strokeWidth="1"
            />
            <text
              x={x}
              y={y}
              textAnchor="middle"
              fill={ROLE_INK.pointer}
              fontSize="10"
              fontFamily="var(--appkit-font-mono, ui-monospace, monospace)"
            >
              {p.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
