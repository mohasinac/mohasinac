/**
 * Grid renderer — the `field` look, used for matrix problems and DP tables.
 *
 * A lattice of corner ticks and hairlines rather than filled boxes: only cells
 * that carry a role get a tile, so a DP table visibly *fills in* as it
 * computes. That is the whole reason not to draw solid blocks everywhere.
 *
 * Same idiom as ArrayView — inline SVG, `aria-hidden`, colour as SVG
 * attributes via the role custom properties. The meaning lives in the caption
 * and the data table.
 */

import type { TraceValue, VizRole } from "../trace/types.ts";
import { ROLE_DASH, ROLE_FILL, ROLE_INK, ROLE_STROKE_WIDTH } from "../theme/roles.ts";

export interface GridViewProps {
  /** Rows of cells. A row shorter than the widest is padded visually. */
  readonly rows: readonly (readonly TraceValue[])[];
  /** `"r,c"` -> role. Absent entries are `idle`. */
  readonly roles?: Readonly<Record<string, VizRole>>;
  readonly rowLabels?: readonly string[];
  readonly colLabels?: readonly string[];
  readonly idPrefix: string;
}

const PAD = 10;
const GUTTER = 22;

/** Estimated, not measured, so this renders identically during SSR. */
function cellSize(rows: readonly (readonly TraceValue[])[]): { w: number; h: number } {
  let longest = 1;
  for (const row of rows) {
    for (const v of row) longest = Math.max(longest, String(v).length);
  }
  return { w: Math.max(26, 10 + longest * 8), h: 26 };
}

export function GridView({ rows, roles, rowLabels, colLabels, idPrefix }: GridViewProps) {
  const cols = rows.reduce((n, r) => Math.max(n, r.length), 0);
  const { w, h } = cellSize(rows);

  const hasRowLabels = (rowLabels?.length ?? 0) > 0;
  const hasColLabels = (colLabels?.length ?? 0) > 0;
  const left = PAD + (hasRowLabels ? GUTTER : 0);
  const top = PAD + (hasColLabels ? GUTTER : 0);

  const width = left + cols * w + PAD;
  const height = top + rows.length * h + PAD;

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMinYMid meet"
      className="h-auto w-full"
      style={{ maxHeight: "20rem" }}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <defs>
        <pattern
          id={`${idPrefix}-ghatch`}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="6" stroke={ROLE_INK.visited} strokeWidth="1" opacity="0.5" />
        </pattern>
      </defs>

      {/* The lattice: hairlines only. Cells get a tile when they have a role,
          which is what makes a DP table read as filling in. */}
      {Array.from({ length: rows.length + 1 }, (_, r) => (
        <line
          key={`h${r}`}
          x1={left}
          y1={top + r * h}
          x2={left + cols * w}
          y2={top + r * h}
          stroke="var(--appkit-color-border)"
          strokeWidth="1"
        />
      ))}
      {Array.from({ length: cols + 1 }, (_, c) => (
        <line
          key={`v${c}`}
          x1={left + c * w}
          y1={top}
          x2={left + c * w}
          y2={top + rows.length * h}
          stroke="var(--appkit-color-border)"
          strokeWidth="1"
        />
      ))}

      {hasColLabels
        ? (colLabels ?? []).slice(0, cols).map((label, c) => (
            <text
              key={`cl${c}`}
              x={left + c * w + w / 2}
              y={top - 7}
              textAnchor="middle"
              fill="var(--appkit-color-text-faint)"
              fontSize="10"
              fontFamily="var(--appkit-font-mono, ui-monospace, monospace)"
            >
              {label}
            </text>
          ))
        : null}

      {hasRowLabels
        ? (rowLabels ?? []).slice(0, rows.length).map((label, r) => (
            <text
              key={`rl${r}`}
              x={left - 6}
              y={top + r * h + h / 2}
              textAnchor="end"
              dominantBaseline="central"
              fill="var(--appkit-color-text-faint)"
              fontSize="10"
              fontFamily="var(--appkit-font-mono, ui-monospace, monospace)"
            >
              {label}
            </text>
          ))
        : null}

      {rows.map((row, r) =>
        row.map((v, c) => {
          const role: VizRole = roles?.[`${r},${c}`] ?? "idle";
          const x = left + c * w;
          const y = top + r * h;
          return (
            <g key={`${r}-${c}`}>
              {role !== "idle" ? (
                <rect
                  x={x + 1}
                  y={y + 1}
                  width={w - 2}
                  height={h - 2}
                  rx="2"
                  fill={role === "visited" ? `url(#${idPrefix}-ghatch)` : ROLE_FILL[role]}
                  stroke={ROLE_INK[role]}
                  strokeWidth={ROLE_STROKE_WIDTH[role]}
                  {...(ROLE_DASH[role] ? { strokeDasharray: ROLE_DASH[role] } : {})}
                />
              ) : null}
              <text
                x={x + w / 2}
                y={y + h / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fill="var(--viz-cell-text)"
                fontSize="12"
                fontFamily="var(--appkit-font-mono, ui-monospace, monospace)"
                {...(role === "discarded" ? { opacity: 0.55 } : {})}
              >
                {String(v)}
              </text>
            </g>
          );
        }),
      )}
    </svg>
  );
}
