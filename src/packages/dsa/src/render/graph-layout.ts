/**
 * Graph layout — deterministic, BFS-layered.
 *
 * 🛑 No force simulation and no randomness. The plan's rule for every renderer
 * is that a node must sit at the same pixel in every frame: a diagram that
 * re-settles between steps is unreadable precisely when you are trying to
 * follow one node through an algorithm. A force layout would also need an
 * animation loop and a seeded RNG to be reproducible at all.
 *
 * So: layer by BFS distance from the lowest-numbered node of each component,
 * order within a layer by discovery, and place at the centre of an equal slot.
 * Same input, same pixels, every time.
 */

export interface GraphNode {
  readonly id: number;
  readonly label: string;
  /** BFS depth from its component's root. */
  readonly layer: number;
  /** Position within its layer, left to right. */
  readonly slot: number;
  readonly layerSize: number;
}

export interface GraphEdge {
  readonly from: number;
  readonly to: number;
}

export interface GraphModel {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly layers: number;
  /** Widest layer, which sets the diagram's width. */
  readonly widest: number;
}

const EMPTY: GraphModel = { nodes: [], edges: [], layers: 0, widest: 0 };

/**
 * Decode an adjacency list: `adj[i]` is the list of i's neighbours.
 *
 * Tolerates a ragged or scalar row, because this is decoding values that came
 * across a process boundary — a malformed row degrades to "no neighbours"
 * rather than throwing and blanking the diagram.
 */
export function decodeAdjacencyList(
  rows: readonly unknown[],
  { directed = false }: { directed?: boolean } = {},
): GraphModel {
  if (rows.length === 0) return EMPTY;

  const adjacency: number[][] = rows.map((row) =>
    Array.isArray(row)
      ? row.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v >= 0 && v < rows.length)
      : [],
  );

  const edges: GraphEdge[] = [];
  const seenEdge = new Set<string>();
  for (const [from, neighbours] of adjacency.entries()) {
    for (const to of neighbours) {
      // An undirected graph lists each edge twice (i in adj[j] and j in adj[i]),
      // so collapse to one line — drawing both would double every stroke and
      // make an undirected graph look heavier than a directed one.
      const key = directed ? `${from}->${to}` : [from, to].sort((a, b) => a - b).join("-");
      if (seenEdge.has(key)) continue;
      seenEdge.add(key);
      edges.push({ from, to });
    }
  }

  return layout(adjacency, rows, edges);
}

/**
 * Decode a flat edge list: `[a, b, a, b, …]`.
 *
 * An odd trailing value is dropped rather than paired with nothing — a cap can
 * truncate a container mid-pair, and inventing an edge to node 0 would draw a
 * relationship that does not exist.
 */
export function decodeEdgeList(
  values: readonly unknown[],
  { directed = false }: { directed?: boolean } = {},
): GraphModel {
  const pairs: GraphEdge[] = [];
  let maxId = -1;
  for (let i = 0; i + 1 < values.length; i += 2) {
    const from = Number(values[i]);
    const to = Number(values[i + 1]);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0) continue;
    pairs.push({ from, to });
    maxId = Math.max(maxId, from, to);
  }
  if (maxId < 0) return EMPTY;

  const n = maxId + 1;
  const adjacency: number[][] = Array.from({ length: n }, () => []);
  const edges: GraphEdge[] = [];
  const seenEdge = new Set<string>();
  for (const { from, to } of pairs) {
    adjacency[from]?.push(to);
    if (!directed) adjacency[to]?.push(from);
    const key = directed ? `${from}->${to}` : [from, to].sort((a, b) => a - b).join("-");
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);
    edges.push({ from, to });
  }

  return layout(adjacency, Array.from({ length: n }, (_, i) => i), edges);
}

function layout(
  adjacency: readonly number[][],
  labels: readonly unknown[],
  edges: readonly GraphEdge[],
): GraphModel {
  const n = adjacency.length;
  const layerOf = new Array<number>(n).fill(-1);
  const order: number[] = [];

  /*
   * Every component gets its own BFS, starting from its lowest-numbered node.
   * 🛑 A single BFS would leave disconnected nodes unplaced — and
   * `number-of-connected-components` and `graph-valid-tree` are *about*
   * disconnected graphs, so the one case those problems exist to show would be
   * invisible.
   */
  for (let root = 0; root < n; root++) {
    if (layerOf[root] !== -1) continue;
    layerOf[root] = 0;
    const queue = [root];
    order.push(root);
    for (let head = 0; head < queue.length; head++) {
      const node = queue[head];
      if (node === undefined) continue;
      for (const next of adjacency[node] ?? []) {
        if (layerOf[next] !== -1) continue;
        layerOf[next] = (layerOf[node] ?? 0) + 1;
        queue.push(next);
        order.push(next);
      }
    }
  }

  // Slots assigned in discovery order, so a node's position depends only on
  // the adjacency data and never on iteration order of a Set or Map.
  const perLayer = new Map<number, number[]>();
  for (const id of order) {
    const layer = layerOf[id] ?? 0;
    const bucket = perLayer.get(layer);
    if (bucket) bucket.push(id);
    else perLayer.set(layer, [id]);
  }

  const nodes: GraphNode[] = [];
  for (const [layer, ids] of perLayer) {
    for (const [slot, id] of ids.entries()) {
      nodes.push({
        id,
        label: String(labels[id] ?? id),
        layer,
        slot,
        layerSize: ids.length,
      });
    }
  }
  // Sorted by id so render order is stable and a React key never shifts.
  nodes.sort((a, b) => a.id - b.id);

  const widest = [...perLayer.values()].reduce((m, ids) => Math.max(m, ids.length), 0);
  return { nodes, edges, layers: perLayer.size, widest };
}
