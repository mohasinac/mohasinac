import {
  tracedBinarySearch,
  tracedLinearSearch,
  tracedQueueDemo,
  tracedStackDemo,
  tracedTwoPointers,
} from "@dsa/dsa/structures";
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
  title?: string;
}

const numbers = (v: unknown, fallback: number[]): number[] =>
  Array.isArray(v) && v.every((x) => typeof x === "number" && Number.isFinite(x))
    ? (v as number[])
    : fallback;

const DEMOS: Record<string, (d: VizDirective) => VizTrace> = {
  linearSearch: (d) =>
    tracedLinearSearch(numbers(d.values, [4, 8, 15, 16, 23, 42]), Number(d.target ?? 16)),
  binarySearch: (d) =>
    tracedBinarySearch(numbers(d.values, [1, 3, 5, 7, 9, 11, 13]), Number(d.target ?? 9)),
  twoPointers: (d) =>
    tracedTwoPointers(numbers(d.values, [1, 3, 4, 6, 8, 11]), Number(d.target ?? 10)),
  stack: (d) => tracedStackDemo(numbers(d.ops, [1, 2, 3])),
  queue: (d) => tracedQueueDemo(numbers(d.ops, [1, 2, 3])),
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
