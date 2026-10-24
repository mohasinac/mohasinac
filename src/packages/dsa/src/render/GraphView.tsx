/**
 * Graph renderer — the `graph` motif.
 *
 * Nodes as circles on BFS layers, edges as straight lines. Circles rather than
 * the boxes every other renderer uses, deliberately: a graph node has no
 * position in a sequence, and a box in a row reads as "index 3 of something".
 *
 * Layout comes from `graph-layout.ts` and is deterministic — see the note there
 * on why there is no force simulation.
 */

import type { VizRole } from "../trace/types.ts";
import { ROLE_DASH, ROLE_FILL, ROLE_INK, ROLE_STROKE_WIDTH } from "../theme/roles.ts";
import type { GraphModel } from "./graph-layout.ts";

export interface GraphViewProps {
  readonly model: GraphModel;
  /** Node id -> role. Absent entries are `idle`. */
  readonly roles?: Readonly<Record<string, VizRole>>;
  /** Edge roles keyed `"from->to"`, for highlighting a traversal. */
  readonly edgeRoles?: Readonly<Record<string, VizRole>>;
  readonly directed?: boolean;
  readonly idPrefix: string;
}

const PAD = 16;
const R = 14;
const LAYER_H = 62;

export function GraphView({ model, roles, edgeRoles, directed, idPrefix }: GraphViewProps) {
  if (model.nodes.length === 0) {
    return (
      <p className="text-sm text-text-muted">No graph to draw at this step.</p>
    );
  }

  const width = PAD * 2 + Math.max(1, model.widest) * (R * 2 + 26);
  const height = PAD * 2 + Math.max(1, model.layers) * LAYER_H;
  const arrowId = `${idPrefix}-graph-arrow`;

  /** Centre of an equal slot within the node's layer. */
  const posOf = (layer: number, slot: number, layerSize: number) => {
    const usable = width - PAD * 2;
    const slotW = usable / Math.max(1, layerSize);
    return {
      x: PAD + slotW * (slot + 0.5),
      y: PAD + layer * LAYER_H + LAYER_H / 2,
    };
  };

  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const centre = (id: number) => {
    const n = byId.get(id);
    return n ? posOf(n.layer, n.slot, n.layerSize) : { x: PAD, y: PAD };
  };

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-auto w-full"
      style={{ maxHeight: "18rem" }}
    >
      <defs>
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

      {/* Edges first so nodes paint over their endpoints. */}
      {model.edges.map(({ from, to }) => {
        const role: VizRole = (edgeRoles?.[`${from}->${to}`] as VizRole | undefined) ?? "idle";
        const a = centre(from);
        const b = centre(to);

        // A self-loop has no direction to shorten along, so it gets a small
        // arc above the node instead of a zero-length line.
        if (from === to) {
          return (
            <path
              key={`e-${from}-${to}`}
              d={`M ${a.x - 6} ${a.y - R} C ${a.x - 18} ${a.y - R - 20}, ${a.x + 18} ${
                a.y - R - 20
              }, ${a.x + 6} ${a.y - R}`}
              fill="none"
              stroke={ROLE_INK[role]}
              strokeWidth={1.25}
            />
          );
        }

        // Shortened to the circle's edge, so an arrowhead lands on the
        // boundary rather than under the node where it cannot be seen.
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;

        return (
          <line
            key={`e-${from}-${to}`}
            x1={a.x + ux * R}
            y1={a.y + uy * R}
            x2={b.x - ux * (R + 2)}
            y2={b.y - uy * (R + 2)}
            stroke={ROLE_INK[role]}
            strokeWidth={role === "idle" ? 1 : ROLE_STROKE_WIDTH[role]}
            strokeDasharray={ROLE_DASH[role] || undefined}
            markerEnd={directed ? `url(#${arrowId})` : undefined}
          />
        );
      })}

      {model.nodes.map((n) => {
        const role: VizRole = (roles?.[String(n.id)] as VizRole | undefined) ?? "idle";
        const { x, y } = posOf(n.layer, n.slot, n.layerSize);
        return (
          <g key={n.id}>
            <circle
              cx={x}
              cy={y}
              r={R}
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
              {n.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
