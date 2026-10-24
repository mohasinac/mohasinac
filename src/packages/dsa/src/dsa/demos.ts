/**
 * Lesson walkthroughs — one per data structure and pattern taught in the
 * course.
 *
 * Separate from `structures.ts`, which holds the self-tracing structures
 * themselves. These are the narrated *demonstrations* built on top: each is a
 * function of its input, so a lesson can say
 * `{"demo": "heap", "values": [5,3,8]}` and get a different walkthrough
 * without any new code.
 *
 * 🛑 Each demo declares the renderer that makes its PROPERTY visible, not
 * whichever is easiest. A heap drawn as a flat strip hides the log depth that
 * is the entire reason it exists; a linked list drawn as a contiguous strip
 * hides the one thing separating it from an array. The kind is part of the
 * teaching, so it is chosen here rather than inferred.
 *
 * 🛑 These run on the SERVER at render time. No toolchain download, no
 * compile, no client cost — which is the point: forcing 30 MB and a 3-second
 * compile on someone *reading* about stacks would be absurd.
 */

import { Tracer, type TracerLimits } from "./tracer.ts";
import type { VizRole, VizTrace } from "../trace/types.ts";

/**
 * Dynamic array growth — the amortised-O(1) argument, made visible.
 *
 * The point a table of numbers cannot make: growth is rare and gets rarer, so
 * the expensive copies spread thinner and thinner over the cheap pushes.
 */
export function tracedDynamicArray(
  pushes: readonly number[],
  limits?: Partial<TracerLimits>,
): VizTrace {
  const tracer = new Tracer(limits);
  const data: number[] = [];
  let capacity = 1;
  let copies = 0;
  tracer.watch("array", () => data);
  tracer.watch("capacity", () => capacity);
  tracer.watch("total copies", () => copies);

  tracer.step({ note: "An empty dynamic array with room for 1 element." });

  for (const value of pushes) {
    if (data.length === capacity) {
      // Doubling, not +1: growing by a constant would make every push O(n).
      copies += data.length;
      capacity *= 2;
      tracer.step({
        note: `Full at ${data.length}. Allocate ${capacity} slots and copy ${data.length} across — this push is the expensive one.`,
        roles: {
          cells: {
            array: Object.fromEntries(data.map((_, i) => [String(i), "comparing" as VizRole])),
          },
        },
      });
    }
    data.push(value);
    tracer.step({
      note: `Push ${value}. ${data.length} of ${capacity} slots used.`,
      roles: { cells: { array: { [String(data.length - 1)]: "current" } } },
    });
  }

  tracer.step({
    note: `${pushes.length} pushes cost ${copies} copies in total — which is why the average is O(1) even though one push in every power of two is O(n).`,
    roles: {
      cells: { array: Object.fromEntries(data.map((_, i) => [String(i), "answer" as VizRole])) },
    },
  });
  return tracer.build([{ id: "array", kind: "array", var: "array" }], "", ["arrays"]);
}

/**
 * Linked list — head insertion, then a middle deletion.
 *
 * Drawn as a CHAIN, because what is being taught is that the cells are not
 * contiguous and reaching element k costs k hops.
 */
export function tracedLinkedList(
  values: readonly number[],
  limits?: Partial<TracerLimits>,
): VizTrace {
  const tracer = new Tracer(limits);
  const list: number[] = [];
  tracer.watch("list", () => list);
  tracer.watch("length", () => list.length);

  tracer.step({ note: "An empty list — `head` is null." });

  // Head insertion is O(1), and is the operation an array cannot match.
  for (const value of values) {
    list.unshift(value);
    tracer.step({
      note: `Insert ${value} at the head — O(1), because nothing has to move.`,
      roles: { cells: { list: { "0": "current" } } },
    });
  }

  if (list.length >= 3) {
    const target = Math.floor(list.length / 2);
    tracer.step({
      note: `To delete position ${target} you must first WALK to it — ${target} hops. There is no indexing.`,
      roles: {
        cells: {
          list: {
            ...Object.fromEntries(
              Array.from({ length: target }, (_, i) => [String(i), "visited" as VizRole]),
            ),
            [String(target)]: "current",
          },
        },
      },
    });
    const removed = list[target];
    list.splice(target, 1);
    tracer.step({
      note: `Relink the previous node past it and ${removed} is gone. The deletion is O(1); finding it was not.`,
      roles: { cells: { list: { [String(Math.max(0, target - 1))]: "answer" } } },
    });
  }

  return tracer.build([{ id: "list", kind: "linkedList", var: "list" }], "", ["linked list"]);
}

/**
 * Binary min-heap — push with sift-up.
 *
 * Drawn as a HEAP, i.e. the implicit tree, because the depth IS the
 * complexity.
 */
export function tracedHeap(values: readonly number[], limits?: Partial<TracerLimits>): VizTrace {
  const tracer = new Tracer(limits);
  const heap: number[] = [];
  tracer.watch("heap", () => heap);

  const parentOf = (i: number) => Math.floor((i - 1) / 2);

  tracer.step({
    note: "An empty min-heap. Invariant: every node is <= both of its children.",
  });

  for (const value of values) {
    heap.push(value);
    let i = heap.length - 1;
    tracer.step({
      note: `Push ${value} at the end — the only spot that keeps the tree complete. It may now break the invariant.`,
      roles: { cells: { heap: { [String(i)]: "current" } } },
    });

    while (i > 0) {
      const p = parentOf(i);
      const child = heap[i] ?? 0;
      const parent = heap[p] ?? 0;
      if (parent <= child) {
        tracer.step({
          note: `${parent} <= ${child}, so the invariant holds again. Stop — climbing at most the depth is why a push is O(log n), not O(n).`,
          roles: { cells: { heap: { [String(i)]: "answer", [String(p)]: "visited" } } },
        });
        break;
      }
      tracer.step({
        note: `${child} is smaller than its parent ${parent} — swap, and keep climbing.`,
        roles: { cells: { heap: { [String(i)]: "comparing", [String(p)]: "comparing" } } },
      });
      heap[i] = parent;
      heap[p] = child;
      i = p;
    }
  }

  if (heap.length > 0) {
    tracer.step({
      note: `The root is the minimum, ${heap[0]} — readable in O(1). That is the whole deal a heap offers.`,
      roles: { cells: { heap: { "0": "answer" } } },
    });
  }

  return tracer.build([{ id: "heap", kind: "heap", var: "heap" }], "", ["heap"]);
}

/**
 * Binary search tree — insert, then search.
 *
 * The watched value is a LEVEL-ORDER encoding with `null` holes, which is what
 * TreeView decodes — and the same encoding the tree problems take on stdin, so
 * a learner meets one representation across the whole course.
 */
export function tracedBst(
  values: readonly number[],
  target: number,
  limits?: Partial<TracerLimits>,
): VizTrace {
  const tracer = new Tracer(limits);

  // Sparse level-order: index 0 is the root, children of i are 2i+1 and 2i+2.
  const slots: (number | null)[] = [];
  const levelOrder = (): string[] => {
    // Trailing holes carry no information and would only pad the drawing.
    let last = slots.length - 1;
    while (last >= 0 && (slots[last] === null || slots[last] === undefined)) last--;
    return slots.slice(0, last + 1).map((v) => (v === null || v === undefined ? "null" : String(v)));
  };
  tracer.watch("tree", levelOrder);

  const insert = (value: number): number => {
    let i = 0;
    for (;;) {
      while (slots.length <= i) slots.push(null);
      const here = slots[i];
      if (here === null || here === undefined) {
        slots[i] = value;
        return i;
      }
      // Smaller goes left, larger goes right. That is the invariant, and it is
      // the only reason a search can discard half the tree per comparison.
      i = value < here ? 2 * i + 1 : 2 * i + 2;
    }
  };

  tracer.step({
    note: "Invariant: everything in a node's left subtree is smaller, everything in its right subtree is larger.",
  });

  for (const value of values) {
    const at = insert(value);
    tracer.step({
      note: `Insert ${value}: walk down comparing, and it lands where the invariant says it must.`,
      roles: { cells: { tree: { [String(at)]: "current" } } },
    });
  }

  let i = 0;
  const visited: Record<string, VizRole> = {};
  const spec = [{ id: "tree", kind: "tree" as const, var: "tree", encoding: "levelOrder" as const }];

  while (i < slots.length) {
    const value = slots[i];
    if (value === null || value === undefined) break;
    visited[String(i)] = "visited";
    if (value === target) {
      tracer.step({
        note: `Found ${target} after ${Object.keys(visited).length} comparisons.`,
        roles: { cells: { tree: { ...visited, [String(i)]: "answer" } } },
      });
      return tracer.build(spec, "", ["bst"]);
    }
    tracer.step({
      note: `${target} ${target < value ? "<" : ">"} ${value}, so the whole ${
        target < value ? "right" : "left"
      } subtree is ruled out in one comparison.`,
      roles: { cells: { tree: { ...visited, [String(i)]: "comparing" } } },
    });
    i = target < value ? 2 * i + 1 : 2 * i + 2;
  }

  tracer.step({
    note: `${target} is not in the tree — and proving that cost the depth, not the size.`,
    roles: { cells: { tree: visited } },
  });
  return tracer.build(spec, "", ["bst"]);
}

/**
 * Hash table — insertion, with a deliberate collision.
 *
 * 🛑 The collision is the point. A hash-table demo without one teaches that
 * hashing is magic; with one, it teaches what a bucket is actually for.
 */
export function tracedHashTable(
  keys: readonly number[],
  buckets = 5,
  limits?: Partial<TracerLimits>,
): VizTrace {
  const tracer = new Tracer(limits);
  const table: number[][] = Array.from({ length: buckets }, () => []);
  tracer.watch("buckets", () => table);

  tracer.step({
    note: `${buckets} empty buckets. A key's bucket is \`key % ${buckets}\` — computed, never searched for.`,
  });

  for (const key of keys) {
    const index = ((key % buckets) + buckets) % buckets;
    const collided = (table[index]?.length ?? 0) > 0;
    table[index]?.push(key);
    const slot = (table[index]?.length ?? 1) - 1;
    tracer.step({
      note: collided
        ? `${key} % ${buckets} = ${index}, already occupied — a COLLISION. Both keys live in that bucket's chain, so a lookup there now costs a short scan.`
        : `${key} % ${buckets} = ${index}. Straight into an empty bucket, O(1).`,
      roles: { cells: { buckets: { [`${index},${slot}`]: collided ? "comparing" : "current" } } },
    });
  }

  tracer.step({
    note: "Average O(1) depends on the chains staying short — which is why a real table grows and rehashes once the load factor climbs.",
  });
  return tracer.build([{ id: "buckets", kind: "grid", var: "buckets" }], "", ["hash map"]);
}

/** Disjoint set union — union by size, with path compression. */
export function tracedDsu(
  pairs: readonly number[],
  n = 6,
  limits?: Partial<TracerLimits>,
): VizTrace {
  const tracer = new Tracer(limits);
  const parent = Array.from({ length: n }, (_, i) => i);
  const size = Array.from({ length: n }, () => 1);
  tracer.watch("parent", () => parent);
  tracer.watch("components", () => parent.filter((p, i) => p === i).length);

  const find = (x: number): number => {
    let root = x;
    while ((parent[root] ?? root) !== root) root = parent[root] ?? root;
    // Path compression: everything on the way up now points straight at the
    // root, so the NEXT find is nearly free. Half of why DSU is near-O(1).
    let walk = x;
    while ((parent[walk] ?? walk) !== walk) {
      const next = parent[walk] ?? walk;
      parent[walk] = root;
      walk = next;
    }
    return root;
  };

  tracer.step({
    note: `${n} elements, each its own set. \`parent[i] === i\` means "i is a root".`,
  });

  for (let k = 0; k + 1 < pairs.length; k += 2) {
    const a = pairs[k] ?? 0;
    const b = pairs[k + 1] ?? 0;
    if (a >= n || b >= n) continue;
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) {
      tracer.step({
        note: `${a} and ${b} are already in the same set — this edge would close a cycle.`,
        roles: { cells: { parent: { [String(a)]: "discarded", [String(b)]: "discarded" } } },
      });
      continue;
    }
    // Smaller under larger, which is what keeps the trees shallow.
    const [big, small] = (size[ra] ?? 1) >= (size[rb] ?? 1) ? [ra, rb] : [rb, ra];
    parent[small] = big;
    size[big] = (size[big] ?? 1) + (size[small] ?? 1);
    tracer.step({
      note: `Union ${a} and ${b}: attach root ${small} under ${big}. Smaller-under-larger is what bounds the depth.`,
      roles: { cells: { parent: { [String(small)]: "current", [String(big)]: "answer" } } },
    });
  }

  tracer.step({
    note: `${parent.filter((p, i) => p === i).length} components remain. Path compression has already flattened the chains, so the next query is near-constant.`,
  });
  return tracer.build([{ id: "parent", kind: "array", var: "parent" }], "", ["dsu"]);
}

/** Graph BFS — layer by layer, drawn as a graph. */
export function tracedBfs(
  adjacency: readonly (readonly number[])[],
  start = 0,
  limits?: Partial<TracerLimits>,
): VizTrace {
  const tracer = new Tracer(limits);
  const adj = adjacency.map((row) => [...row]);
  const queue: number[] = [start];
  const seen = new Set<number>([start]);
  const order: number[] = [];
  tracer.watch("graph", () => adj);
  tracer.watch("queue", () => queue);
  tracer.watch("visited", () => order);

  const visitedRoles = (extra: Record<string, VizRole>): Record<string, VizRole> => ({
    ...Object.fromEntries(order.map((v) => [String(v), "visited" as VizRole])),
    ...extra,
  });

  tracer.step({
    note: `BFS from ${start}. The QUEUE is what makes it breadth-first — swap it for a stack and you get DFS.`,
  });

  while (queue.length > 0) {
    const node = queue.shift();
    if (node === undefined) break;
    order.push(node);
    tracer.step({
      note: `Take ${node} off the front. Everything reached so far is at most this far from ${start}.`,
      roles: { cells: { graph: visitedRoles({ [String(node)]: "current" }) } },
    });

    for (const next of adj[node] ?? []) {
      if (seen.has(next)) continue;
      // Marked on ENQUEUE, not on dequeue. Marking later lets a node enter the
      // queue twice, which is the classic BFS bug.
      seen.add(next);
      queue.push(next);
      tracer.step({
        note: `${next} is new — mark it seen NOW, as it is enqueued. Marking on dequeue instead lets it enter the queue twice.`,
        roles: { cells: { graph: visitedRoles({ [String(next)]: "frontier" }) } },
      });
    }
  }

  tracer.step({
    note: `Visited ${order.length} nodes in the order ${order.join(", ")} — each exactly once.`,
    roles: {
      cells: { graph: Object.fromEntries(order.map((v) => [String(v), "answer" as VizRole])) },
    },
  });
  return tracer.build(
    [{ id: "graph", kind: "graph", var: "graph", encoding: "adjacencyList" }],
    "",
    ["bfs"],
  );
}

/** Monotonic stack — next greater element. */
export function tracedMonotonicStack(
  values: readonly number[],
  limits?: Partial<TracerLimits>,
): VizTrace {
  const tracer = new Tracer(limits);
  const a = [...values];
  const stack: number[] = [];
  const answer: number[] = new Array(a.length).fill(-1);
  tracer.watch("a", () => a);
  tracer.watch("stack", () => stack);
  tracer.watch("next greater", () => answer);

  tracer.step({
    note: "The stack holds indices whose answer is still unknown, and it stays DECREASING in value. That invariant is the whole trick.",
  });

  for (let i = 0; i < a.length; i++) {
    const current = a[i] ?? 0;
    while (stack.length > 0) {
      const topIndex = stack[stack.length - 1];
      if (topIndex === undefined) break;
      if ((a[topIndex] ?? 0) >= current) break;
      stack.pop();
      answer[topIndex] = current;
      tracer.step({
        note: `a[${i}] = ${current} beats a[${topIndex}] = ${a[topIndex]}, so ${topIndex}'s answer is ${current}. Pop it — nothing later can be its answer.`,
        roles: { cells: { a: { [String(topIndex)]: "answer", [String(i)]: "current" } } },
      });
    }
    stack.push(i);
    tracer.step({
      note: `Push ${i}. Every index is pushed once and popped at most once, which is why the whole scan is O(n) despite the inner loop.`,
      roles: { cells: { a: { [String(i)]: "current" } } },
    });
  }

  tracer.step({
    note: "Anything still on the stack has nothing greater to its right, so it keeps -1.",
  });
  return tracer.build([{ id: "stack", kind: "stack", var: "stack" }], "", ["monotonic stack"]);
}

/** A 1-D DP table filling in, drawn as a grid so the dependencies show. */
export function tracedDpTable(n = 8, limits?: Partial<TracerLimits>): VizTrace {
  const tracer = new Tracer(limits);
  const steps = Math.max(2, Math.min(n, 20));
  const dp: number[] = new Array(steps + 1).fill(0);
  // Wrapped in an array: a grid's cells arrive as rows, and one row is the
  // honest shape for a 1-D table.
  tracer.watch("dp", () => [dp]);

  dp[0] = 1;
  dp[1] = 1;
  tracer.step({
    note: "Climbing stairs: dp[i] is the number of ways to reach step i. The two base cases are stated, not derived.",
    roles: { cells: { dp: { "0,0": "answer", "0,1": "answer" } } },
  });

  for (let i = 2; i <= steps; i++) {
    dp[i] = (dp[i - 1] ?? 0) + (dp[i - 2] ?? 0);
    tracer.step({
      note: `dp[${i}] = dp[${i - 1}] + dp[${i - 2}] = ${dp[i - 1]} + ${dp[i - 2]} = ${dp[i]}. You can only arrive from one step below or two.`,
      roles: {
        cells: {
          dp: {
            [`0,${i}`]: "current",
            [`0,${i - 1}`]: "comparing",
            [`0,${i - 2}`]: "comparing",
          },
        },
      },
    });
  }

  tracer.step({
    note: `dp[${steps}] = ${dp[steps]}. Every subproblem was solved exactly once — that is what turns an exponential recursion into a linear scan.`,
    roles: { cells: { dp: { [`0,${steps}`]: "answer" } } },
  });
  return tracer.build([{ id: "dp", kind: "grid", var: "dp" }], "", ["dynamic programming"]);
}

/** Sliding window — a fixed-size window summing as it moves. */
export function tracedSlidingWindow(
  values: readonly number[],
  k = 3,
  limits?: Partial<TracerLimits>,
): VizTrace {
  const tracer = new Tracer(limits);
  const a = [...values];
  const width = Math.max(1, Math.min(k, a.length));
  let sum = 0;
  let best: number | null = null;
  tracer.watch("a", () => a);
  tracer.watch("window sum", () => sum);
  tracer.watch("best", () => best);

  const windowRoles = (lo: number, hi: number): Record<string, VizRole> =>
    Object.fromEntries(
      Array.from({ length: Math.max(0, hi - lo + 1) }, (_, j) => [
        String(lo + j),
        "window" as VizRole,
      ]),
    );

  tracer.step({
    note: `A window of ${width}. The trick is never to re-add what is already inside it.`,
  });

  for (let i = 0; i < a.length; i++) {
    sum += a[i] ?? 0;
    if (i >= width) {
      // One subtraction instead of a re-sum: this is the O(n) vs O(n·k) line.
      sum -= a[i - width] ?? 0;
      tracer.step({
        note: `Slide: add a[${i}] = ${a[i]}, drop a[${i - width}] = ${a[i - width]}. Two operations, not ${width} — re-summing would make this O(n·k).`,
        roles: { cells: { a: { ...windowRoles(i - width + 1, i), [String(i - width)]: "discarded" } } },
      });
    } else {
      tracer.step({
        note: `Filling the window: ${i + 1} of ${width}.`,
        roles: { cells: { a: windowRoles(0, i) } },
      });
    }
    if (i >= width - 1 && (best === null || sum > best)) best = sum;
  }

  tracer.step({ note: `The largest window sum is ${best}.` });
  return tracer.build([{ id: "a", kind: "array", var: "a" }], "", ["sliding window"]);
}

/** Bit manipulation — the bits of a number, inspected one at a time. */
export function tracedBits(value = 23, limits?: Partial<TracerLimits>): VizTrace {
  const tracer = new Tracer(limits);
  const width = 8;
  const n = ((value % 256) + 256) % 256;
  // Most significant bit first, so it reads the way the number is written.
  const bits = Array.from({ length: width }, (_, i) => (n >> (width - 1 - i)) & 1);
  let count = 0;
  tracer.watch("bits", () => bits);
  tracer.watch("value", () => n);
  tracer.watch("set bits", () => count);

  tracer.step({
    note: `${n} in binary is ${bits.join("")}. Each cell is one power of two, largest on the left.`,
  });

  for (let i = width - 1; i >= 0; i--) {
    const bit = bits[i] ?? 0;
    const place = 2 ** (width - 1 - i);
    if (bit === 1) count++;
    tracer.step({
      note:
        bit === 1
          ? `Bit ${width - 1 - i} is set, so ${n} & ${place} is non-zero and ${place} is part of the total.`
          : `Bit ${width - 1 - i} is clear, so ${place} contributes nothing.`,
      roles: { cells: { bits: { [String(i)]: bit === 1 ? "answer" : "discarded" } } },
    });
  }

  tracer.step({
    note: `${count} bits are set. \`n & (n - 1)\` clears the lowest set bit, so counting them takes as many steps as there are set bits — not ${width}.`,
  });
  return tracer.build([{ id: "bits", kind: "array", var: "bits" }], "", ["bit manipulation"]);
}
