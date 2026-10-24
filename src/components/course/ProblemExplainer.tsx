import { buildExplainer, type VizDerive } from "@dsa/scenarios/explainer";
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
  vizDerive,
  patterns,
}: {
  samples: readonly { input: string; expectedOutput: string }[];
  inputFormat: InputFormat | undefined;
  vizKind?: VizKind;
  vizVar?: string;
  vizDerive?: VizDerive;
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
        ...(vizDerive ? { derive: vizDerive } : {}),
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
      {/*
        Side by side on a wide screen. A sample input is usually a handful of
        cells, so each panel was ~190px of diagram in a ~980px box — stacking
        two of them filled half a screen with empty space and pushed the editor
        below the fold. Two columns also let the examples be COMPARED, which is
        the point of having two: the same question, a different answer.
      */}
      <div className="grid gap-3 lg:grid-cols-2">
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
