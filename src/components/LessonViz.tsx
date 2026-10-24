import {
  tracedBinarySearch,
  tracedLinearSearch,
  tracedQueueDemo,
  tracedStackDemo,
  tracedTwoPointers,
} from "@dsa/dsa/structures";
import {
  tracedBfs,
  tracedBits,
  tracedBst,
  tracedDpTable,
  tracedDsu,
  tracedDynamicArray,
  tracedHashTable,
  tracedHeap,
  tracedLinkedList,
  tracedMonotonicStack,
  tracedSlidingWindow,
} from "@dsa/dsa/demos";
import type { VizTrace } from "@dsa/trace/types";
import { VizPlayer } from "@dsa/render/VizPlayer";
import { CodeBlock } from "@/components/CodeBlock";

/**
 * A playable visualization embedded in a lesson, from a ```` ```viz ```` fence.
 *
 * The body is one line of JSON naming a demo, so authoring a lesson
 * visualization is a two-line job:
 *
 *     ```viz
 *     { "demo": "binarySearch", "values": [1,3,5,7,9,11], "target": 9 }
 *     ```
 *
 * 🛑 These are WALKTHROUGHS, not traces. The frames come from a JS
 * implementation while the lesson shows C++, so the player gets
 * `chrome="explain"` and the heading says "walkthrough". `chrome="trace"` is
 * reserved for frames produced by running the code actually on screen —
 * blurring that would be claiming something untrue about what was executed.
 *
 * Fails SOFT: an unparseable or unknown fence renders as an ordinary code
 * block, matching how Markdown.tsx treats everything it does not recognise.
 */

interface VizDirective {
  demo?: string;
  values?: unknown;
  target?: unknown;
  ops?: unknown;
  /** Flat `[a, b, a, b, …]` pairs, for DSU unions. */
  pairs?: unknown;
  /** Adjacency list, for the graph demos. */
  graph?: unknown;
  /** Element count (DSU), step count (DP), or window size (sliding window). */
  n?: unknown;
  buckets?: unknown;
  k?: unknown;
  start?: unknown;
  value?: unknown;
  title?: string;
}

const numbers = (v: unknown, fallback: number[]): number[] =>
  Array.isArray(v) && v.every((x) => typeof x === "number" && Number.isFinite(x))
    ? (v as number[])
    : fallback;

/** An adjacency list, validated a row at a time so one bad row is not fatal. */
const rows = (v: unknown, fallback: number[][]): number[][] =>
  Array.isArray(v) && v.every((r) => Array.isArray(r))
    ? (v as unknown[][]).map((r) => numbers(r, []))
    : fallback;

/** A finite number, or the fallback. `Number(undefined)` is NaN, not a default. */
const count = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Every demo a lesson can name.
 *
 * 🛑 Defaults are part of the API: `{"demo": "heap"}` with nothing else must
 * produce a GOOD walkthrough, because that is what an author will write first.
 * Each default below is chosen to show the interesting case — the heap values
 * force two sift-ups, the hash keys collide, the DSU pairs include a cycle.
 */
const DEMOS: Record<string, (d: VizDirective) => VizTrace> = {
  // Track A / C — approaches and patterns.
  linearSearch: (d) =>
    tracedLinearSearch(numbers(d.values, [4, 8, 15, 16, 23, 42]), count(d.target, 16)),
  binarySearch: (d) =>
    tracedBinarySearch(numbers(d.values, [1, 3, 5, 7, 9, 11, 13]), count(d.target, 9)),
  twoPointers: (d) =>
    tracedTwoPointers(numbers(d.values, [1, 3, 4, 6, 8, 11]), count(d.target, 10)),
  slidingWindow: (d) =>
    tracedSlidingWindow(numbers(d.values, [2, 1, 5, 1, 3, 2]), count(d.k, 3)),
  monotonicStack: (d) => tracedMonotonicStack(numbers(d.values, [2, 1, 2, 4, 3])),
  dpTable: (d) => tracedDpTable(count(d.n, 8)),
  bits: (d) => tracedBits(count(d.value, 23)),

  // Track B — the data structures, each on the renderer that shows its point.
  stack: (d) => tracedStackDemo(numbers(d.ops, [1, 2, 3])),
  queue: (d) => tracedQueueDemo(numbers(d.ops, [1, 2, 3])),
  dynamicArray: (d) => tracedDynamicArray(numbers(d.values, [3, 1, 4, 1, 5, 9, 2])),
  linkedList: (d) => tracedLinkedList(numbers(d.values, [3, 2, 1])),
  // 5 then 3 then 8 then 1: two separate sift-ups, so the climb is visible.
  heap: (d) => tracedHeap(numbers(d.values, [5, 3, 8, 1, 9, 2])),
  bst: (d) => tracedBst(numbers(d.values, [8, 3, 10, 1, 6, 14]), count(d.target, 6)),
  // 10 and 15 both land in bucket 0 of 5 — the collision is deliberate.
  hashTable: (d) => tracedHashTable(numbers(d.values, [10, 22, 15, 7, 31]), count(d.buckets, 5)),
  // The last pair closes a cycle, which is the case worth seeing.
  dsu: (d) => tracedDsu(numbers(d.pairs, [0, 1, 2, 3, 1, 2, 0, 3]), count(d.n, 6)),
  bfs: (d) =>
    tracedBfs(
      rows(d.graph, [[1, 2], [0, 3], [0, 3], [1, 2, 4], [3]]),
      count(d.start, 0),
    ),
};

export function LessonViz({ source }: { source: string }) {
  let directive: VizDirective | null = null;
  try {
    const parsed: unknown = JSON.parse(source);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      directive = parsed as VizDirective;
    }
  } catch {
    directive = null;
  }

  const build = directive?.demo ? DEMOS[directive.demo] : undefined;

  // Unrecognised: show the author exactly what they typed, with the valid
  // names, rather than silently rendering nothing.
  if (!directive || !build) {
    return (
      <div className="my-4">
        <CodeBlock code={source} lang="viz" />
        <p className="mt-1 text-xs text-error">
          Unknown visualization. Expected JSON with a <code className="font-mono">demo</code> of:{" "}
          {Object.keys(DEMOS).join(", ")}.
        </p>
      </div>
    );
  }

  const trace = build(directive);

  return (
    <div className="my-4">
      <VizPlayer trace={trace} chrome="explain" title={directive.title ?? `${directive.demo} walkthrough`} />
      <p className="mt-1 text-xs text-text-faint">
        A walkthrough of the same algorithm, run in JavaScript — the C++ above is what you would write.
      </p>
    </div>
  );
}
