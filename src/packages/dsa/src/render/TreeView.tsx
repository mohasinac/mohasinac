/**
 * Tree renderer — the `branches` look.
 *
 * Hairline node circles with mono labels and rigid parent-child links. Straight
 * segments rather than curves: a tree reads better with rigid links, and curves
 * imply a flexibility the structure does not have.
 *
 * Geometry comes from `decodeLevelOrder`, which assigns integer columns by an
 * in-order walk — deterministic, and guaranteed collision-free however
 * unbalanced the tree is.
 */

import type { VizRole } from "../trace/types.ts";
import { ROLE_DASH, ROLE_FILL, ROLE_INK, ROLE_STROKE_WIDTH } from "../theme/roles.ts";
import type { TreeModel } from "./tree-layout.ts";

export interface TreeViewProps {
  readonly model: TreeModel;
  /** Node key -> role. Absent entries are `idle`. */
  readonly roles?: Readonly<Record<string, VizRole>>;
  readonly idPrefix: string;
}

const PAD = 16;
const ROW_H = 54;
const NODE_R = 14;

export function TreeView({ model, roles, idPrefix }: TreeViewProps) {
  if (model.nodes.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        An empty tree — there is nothing to draw, which is itself the edge case worth remembering.
      </p>
    );
  }

  /*
   * Column width steps down as the tree widens, with a floor. Below ~26px the
   * labels stop being legible, so past that the box grows and the container
   * scrolls instead — the same choice `pre` and `table` already make globally.
   */
  const colW = model.cols > 22 ? 26 : model.cols > 14 ? 34 : 44;
  const width = PAD * 2 + Math.max(1, model.cols) * colW;
  const height = PAD * 2 + Math.max(1, model.depth) * ROW_H;

  const x = (col: number) => PAD + col * colW + colW / 2;
  const y = (depth: number) => PAD + depth * ROW_H + NODE_R;

  const byKey = new Map(model.nodes.map((n) => [n.key, n]));

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMinYMid meet"
      width={width}
      height={height}
      className="h-auto max-w-full"
      style={{ maxHeight: "22rem" }}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <defs>
        <pattern
          id={`${idPrefix}-thatch`}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="6" stroke={ROLE_INK.visited} strokeWidth="1" opacity="0.5" />
        </pattern>
      </defs>

      {/* Edges first, so nodes paint over their endpoints. Drawn from the rim
          rather than the centre so a link never crosses a label. */}
      {model.nodes.map((n) => {
        if (!n.parent) return null;
        const p = byKey.get(n.parent);
        if (!p) return null;
        const x1 = x(p.col);
        const y1 = y(p.depth);
        const x2 = x(n.col);
        const y2 = y(n.depth);
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const ox = (dx / len) * NODE_R;
        const oy = (dy / len) * NODE_R;
        return (
          <line
            key={`e-${n.key}`}
            x1={x1 + ox}
            y1={y1 + oy}
            x2={x2 - ox}
            y2={y2 - oy}
            stroke="var(--appkit-color-border)"
            strokeWidth="1"
          />
        );
      })}

      {model.nodes.map((n) => {
        const role: VizRole = roles?.[n.key] ?? "idle";
        const cx = x(n.col);
        const cy = y(n.depth);
        return (
          <g key={n.key}>
            <circle
              cx={cx}
              cy={cy}
              r={NODE_R}
              fill={
                role === "idle"
                  ? "var(--appkit-color-surface)"
                  : role === "visited"
                    ? `url(#${idPrefix}-thatch)`
                    : ROLE_FILL[role]
              }
              stroke={role === "idle" ? "var(--appkit-color-border)" : ROLE_INK[role]}
              strokeWidth={role === "idle" ? 1 : ROLE_STROKE_WIDTH[role]}
              {...(ROLE_DASH[role] ? { strokeDasharray: ROLE_DASH[role] } : {})}
            />
            {/* `current` gets a second ring: a non-colour channel, because
                several roles share a hue. */}
            {role === "current" ? (
              <circle cx={cx} cy={cy} r={NODE_R - 3} stroke={ROLE_INK.current} strokeWidth="1" />
            ) : null}
            <text
              x={cx}
              y={cy}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--viz-cell-text)"
              fontSize="11"
              fontFamily="var(--appkit-font-mono, ui-monospace, monospace)"
              {...(role === "discarded" ? { opacity: 0.55 } : {})}
            >
              {n.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
