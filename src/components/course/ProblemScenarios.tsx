import { buildExplainer, type VizDerive } from "@dsa/scenarios/explainer";
import type { InputFormat } from "@dsa/scenarios/input-format";
import type { VizKind } from "@dsa/trace/types";
import { VizPlayer } from "@dsa/render/VizPlayer";

/**
 * Tier 2 — the scenarios a correct solution has to survive, each with the
 * pitfall it catches.
 *
 * 🛑 Rendered INSIDE the editorial's reveal. Naming the edge cases —
 * "the same value twice", "all negative", "no pair exists" — gives away most of
 * the approach, so it sits behind the same affordance as the editorial rather
 * than above the editor.
 *
 * Scenario outputs are visible by design and come from the authored `scenarios`
 * field, never from hidden test cases: those store only a SHA-256 and the
 * plaintext is dropped at seed time so it cannot be served.
 */
export function ProblemScenarios({
  scenarios,
  inputFormat,
  vizKind,
  vizVar,
  vizDerive,
  patterns,
}: {
  scenarios: readonly { label: string; input: string; output: string; why: string }[];
  inputFormat: InputFormat | undefined;
  vizKind?: VizKind;
  vizVar?: string;
  vizDerive?: VizDerive;
  patterns?: readonly string[];
}) {
  if (scenarios.length === 0) return null;

  return (
    <section className="mt-6">
      <h3 className="mb-1 text-base font-semibold">Scenarios a correct solution survives</h3>
      <p className="mb-3 text-sm text-text-muted">
        Each of these catches a specific mistake. Run your solution against them before submitting.
      </p>

      <ol className="space-y-3">
        {scenarios.map((s, i) => {
          // A visualization only when the input genuinely parses. No descriptor,
          // or a scenario whose shape differs, falls back to the text — which
          // carries the actual teaching anyway.
          const built =
            inputFormat && inputFormat.length > 0
              ? buildExplainer({
                  input: s.input,
                  expectedOutput: s.output,
                  inputFormat,
                  ...(vizKind ? { kind: vizKind } : {}),
                  ...(vizVar ? { varName: vizVar } : {}),
        ...(vizDerive ? { derive: vizDerive } : {}),
                  ...(patterns ? { patterns } : {}),
                })
              : null;

          return (
            <li key={i} className="rounded-md border border-border bg-bg p-3">
              <p className="flex items-baseline gap-2">
                <span className="font-mono text-[11px] text-text-faint">{i + 1}</span>
                <span className="font-medium">{s.label}</span>
              </p>

              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="font-mono text-text-faint">in</dt>
                <dd>
                  <pre className="overflow-x-auto whitespace-pre-wrap font-mono">{s.input.trimEnd()}</pre>
                </dd>
                <dt className="font-mono text-text-faint">out</dt>
                <dd>
                  <pre className="overflow-x-auto whitespace-pre-wrap font-mono">{s.output}</pre>
                </dd>
              </dl>

              <p className="mt-2 text-sm text-text-muted">{s.why}</p>

              {built?.ok ? (
                <div className="mt-3">
                  <VizPlayer trace={built.trace} chrome="explain" title={s.label} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
