import { buildExplainer } from "@dsa/scenarios/explainer";
import type { InputFormat } from "@dsa/scenarios/input-format";
import type { VizKind } from "@dsa/trace/types";
import { VizPlayer } from "@dsa/render/VizPlayer";

/**
 * The "understand the problem" panel, above the editor.
 *
 * Server component: it builds the trace from the sample case and hands plain
 * data to the client player. Only the player carries `"use client"`.
 *
 * 🛑 Only SAMPLE cases reach here. A hidden case's expected output is stored as
 * a SHA-256 and the plaintext is dropped at seed time, specifically so it can
 * never be served — building an explainer from one would be impossible, and the
 * caller must not try.
 */
export function ProblemExplainer({
  samples,
  inputFormat,
  vizKind,
  vizVar,
  patterns,
}: {
  samples: readonly { input: string; expectedOutput: string }[];
  inputFormat: InputFormat | undefined;
  vizKind?: VizKind;
  vizVar?: string;
  patterns?: readonly string[];
}) {
  // No descriptor means no panel. Deliberate: guessing the input shape would
  // produce a confidently wrong diagram, which teaches something false.
  if (!inputFormat || inputFormat.length === 0) return null;

  const built = samples
    .map((s) =>
      buildExplainer({
        input: s.input,
        expectedOutput: s.expectedOutput,
        inputFormat,
        ...(vizKind ? { kind: vizKind } : {}),
        ...(vizVar ? { varName: vizVar } : {}),
        ...(patterns ? { patterns } : {}),
      }),
    )
    .filter((r): r is Extract<typeof r, { ok: true }> => r.ok);

  if (built.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="mb-2 font-mono text-xs uppercase tracking-wider text-text-faint">
        Understand the problem
      </h2>
      <div className="space-y-3">
        {built.map((b, i) => (
          <VizPlayer
            key={i}
            trace={b.trace}
            chrome="explain"
            title={`Example ${i + 1}`}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-text-faint">
        {/* Says what it is, so nobody mistakes it for a solution. */}
        These replay the worked examples from the statement. They show no approach — play them before you
        start, then write your own.
      </p>
    </section>
  );
}
