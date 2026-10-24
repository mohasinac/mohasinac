/**
 * Decode a level-order token list into nodes, and lay them out.
 *
 * 🛑 Layout is DETERMINISTIC — no physics, no randomness, no
 * iterate-to-convergence. A diagram that jitters between frames is unreadable,
 * and the geometry must be identical for frame 1 and frame 60.
 */

export interface TreeNodeModel {
  readonly key: string;
  readonly label: string;
  readonly depth: number;
  /** Integer column from the in-order walk. Pixels are the renderer's job. */
  readonly col: number;
  readonly parent: string | null;
}

export interface TreeModel {
  readonly nodes: readonly TreeNodeModel[];
  readonly cols: number;
  readonly depth: number;
}

/**
 * Level-order tokens with `null` placeholders — the format every tree problem
 * in the corpus uses: `3 9 20 null null 15 7`.
 *
 * Mirrors the `read_tree` helper in the problems' starter code, so a learner
 * sees the same tree the diagram draws.
 */
export function decodeLevelOrder(tokens: readonly string[]): TreeModel {
  const first = tokens[0];
  if (tokens.length === 0 || first === undefined || first === "null") {
    return { nodes: [], cols: 0, depth: 0 };
  }

  interface Raw {
    key: string;
    label: string;
    left: string | null;
    right: string | null;
    parent: string | null;
  }

  const raw = new Map<string, Raw>();
  const rootKey = "n0";
  raw.set(rootKey, { key: rootKey, label: first, left: null, right: null, parent: null });

  // Same queue walk as the C++ helper: a null token consumes a slot without
  // enqueuing a child, which is what makes the format unambiguous.
  const queue: string[] = [rootKey];
  let i = 1;
  let made = 1;
  let head = 0;

  while (head < queue.length && i < tokens.length) {
    const parentKey = queue[head++];
    const parent = parentKey ? raw.get(parentKey) : undefined;
    if (!parent) break;

    for (const side of ["left", "right"] as const) {
      if (i >= tokens.length) break;
      const tok = tokens[i++];
      if (tok === undefined || tok === "null") continue;
      const key = `n${made++}`;
      raw.set(key, { key, label: tok, left: null, right: null, parent: parentKey ?? null });
      parent[side] = key;
      queue.push(key);
    }
  }

  /*
   * In-order column assignment: walk left, take the next column, walk right.
   *
   * Chosen over a "tidy" centred layout because it guarantees no two nodes
   * share a column however unbalanced the tree is — so a right-skewed chain
   * renders as a clean diagonal staircase, which is the honest picture of a
   * degenerate BST and exactly what the BST lesson wants to show.
   */
  const nodes: TreeNodeModel[] = [];
  let col = 0;
  let maxDepth = 0;

  // Iterative, so a 10^4-node skewed tree cannot overflow the stack — the same
  // reason the lessons teach iterative traversal.
  const stack: { key: string; depth: number; phase: 0 | 1 }[] = [
    { key: rootKey, depth: 0, phase: 0 },
  ];

  while (stack.length > 0) {
    const top = stack.pop();
    if (!top) break;
    const node = raw.get(top.key);
    if (!node) continue;

    if (top.phase === 0) {
      // Push self (to visit after the left subtree), then the left subtree.
      stack.push({ key: top.key, depth: top.depth, phase: 1 });
      if (node.left) stack.push({ key: node.left, depth: top.depth + 1, phase: 0 });
      continue;
    }

    nodes.push({
      key: node.key,
      label: node.label,
      depth: top.depth,
      col: col++,
      parent: node.parent,
    });
    maxDepth = Math.max(maxDepth, top.depth);
    if (node.right) stack.push({ key: node.right, depth: top.depth + 1, phase: 0 });
  }

  return { nodes, cols: col, depth: maxDepth + 1 };
}

/** Node key -> role, keyed by the node's LABEL so authored roles stay readable. */
export function rolesByLabel(
  model: TreeModel,
  byLabel: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  if (!byLabel) return {};
  const out: Record<string, string> = {};
  for (const node of model.nodes) {
    const role = byLabel[node.label];
    if (role) out[node.key] = role;
  }
  return out;
}
