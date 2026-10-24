"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VizPlayer } from "@dsa/render/VizPlayer";
import { unavailableMessage } from "@dsa/trace/attribute";
import { trapMessage } from "@dsa/trace/protocol";
import type { AzLimits } from "@dsa/trace/az-trace-header";
import type { VizKind, VizTrace } from "@dsa/trace/types";
import { runTrace } from "@/lib/trace-run";

export interface TestCase {
  id: string;
  visibility: "sample" | "hidden";
  input: string;
  /** Present only for sample cases; hidden expectations stay on the server. */
  expectedOutput: string | null;
}

interface CaseOutcome {
  caseId: string;
  visibility: string;
  passed: boolean;
  stdout?: string;
  expected?: string | null;
}

/**
 * 🛑 The worker's output budget is shared across stdout AND stderr, and when it
 * trips it silently drops further lines and sets `truncated`.
 *
 * That makes a truncated run UNJUDGEABLE: a learner who leaves debug output in
 * a loop can push past the cap, have their *stdout* cut short, and get a wrong
 * answer for code that is correct. Hashing a truncated string produces a
 * confident, wrong verdict — the worst possible failure. So refuse to judge it
 * and say why.
 */
const TRUNCATED_MESSAGE =
  "Output limit exceeded, so this run cannot be judged — the comparison would be against " +
  "incomplete output. Reduce what the program prints (debug output on cerr counts toward " +
  "the same limit) and run again.";

const TIMEOUT_MS = 30_000;
const MAX_SOURCE_BYTES = 64 * 1024;

/** SHA-256 hex, matching what the server stores for hidden cases. */
async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Problem workbench: edit, run against every test case in the browser, then
 * submit hashes for judging.
 *
 * Reuses the same worker as the sandbox — one toolchain, one watchdog, one set
 * of limits. The worker is persistent across runs because re-instantiating
 * Clang per case would make a 20-case problem unusable.
 */
export function ProblemWorkbench({
  problemSlug,
  starterCode,
  cases,
  vizLimits,
  vizKind,
  vizVar,
}: {
  problemSlug: string;
  starterCode: string;
  cases: TestCase[];
  /** Per-problem cap overrides. Clamped to the hard ceilings regardless. */
  vizLimits?: Partial<AzLimits>;
  /** Declared shape to draw. A list/stack/queue is indistinguishable from an
   *  array in a trace, so this cannot be inferred. */
  vizKind?: VizKind;
  /** Declared variable to draw, when the input is not the interesting one. */
  vizVar?: string;
}) {
  const [source, setSource] = useState(starterCode || "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    \n}\n");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [outcomes, setOutcomes] = useState<CaseOutcome[] | null>(null);
  const [verdict, setVerdict] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Step-through state, kept entirely separate from the judged run. */
  const [trace, setTrace] = useState<VizTrace | null>(null);
  const [traceNote, setTraceNote] = useState<string | null>(null);
  const [tracing, setTracing] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const seqRef = useRef(0);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const getWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current;
    const w = new Worker("/sandbox-worker.js", { type: "module" });
    workerRef.current = w;
    return w;
  }, []);

  /** Run one case; resolves with stdout or rejects with a message. */
  const runCase = useCallback(
    (input: string): Promise<{ stdout: string; compileMs: number }> =>
      new Promise((resolve, reject) => {
        const worker = getWorker();
        const id = ++seqRef.current;

        const timer = setTimeout(() => {
          // Only way to stop a spinning wasm program.
          worker.terminate();
          workerRef.current = null;
          reject(new Error(`Timed out after ${TIMEOUT_MS / 1000}s`));
        }, TIMEOUT_MS);

        const onMessage = (ev: MessageEvent) => {
          const d = ev.data;
          if (d.type === "status") setStatus(d.message);
          if (d.type !== "result" || d.id !== id) return;
          // 🛑 `cmd:"trace"` replies on this same "result" channel, marked
          // `traced`. An instrumented run must NEVER produce a verdict — the
          // trace shares an fd and changed inlining can alter UB — so this
          // ignores it rather than hashing its stdout. Request ids make a
          // collision unlikely today; the guard makes it impossible.
          if (d.traced) return;
          clearTimeout(timer);
          worker.removeEventListener("message", onMessage);
          if (!d.ok) {
            reject(new Error(d.compilerStderr?.trim() || d.error || "Run failed"));
            return;
          }
          // Checked BEFORE resolving: the caller immediately hashes this string
          // for the verdict, so a truncated value must never reach it.
          if (d.truncated) {
            reject(new Error(TRUNCATED_MESSAGE));
            return;
          }
          resolve({ stdout: d.stdout ?? "", compileMs: d.compileMs ?? 0 });
        };

        worker.addEventListener("message", onMessage);
        worker.postMessage({ id, cmd: "run", source, stdin: input });
      }),
    [source, getWorker],
  );

  /**
   * Visualize: a SEPARATE action from Run & submit, deliberately.
   *
   * 🛑 No click ever needs both compiles. Tracing costs a second compile and
   * produces frames that must never influence a verdict, so binding it to
   * submit would both slow every submission down and blur the one boundary
   * this feature must keep sharp.
   *
   * It traces the FIRST sample case. Hidden cases are not an option even in
   * principle: their expected output exists only as a SHA-256 on the server,
   * and tracing one would show the learner an input chosen to be unseen.
   */
  async function onVisualize() {
    const sample = cases.find((c) => c.visibility === "sample");
    if (!sample) {
      setTraceNote("This problem has no sample case to step through yet.");
      return;
    }
    if (new TextEncoder().encode(source).length > MAX_SOURCE_BYTES) {
      setError("Source exceeds the 64 KB limit.");
      return;
    }

    setTracing(true);
    setTrace(null);
    setTraceNote(null);
    setError(null);

    try {
      const r = await runTrace({
        worker: getWorker(),
        source,
        stdin: sample.input,
        ...(vizLimits ? { limits: vizLimits } : {}),
        ...(vizKind ? { vizKind } : {}),
        ...(vizVar ? { vizVar } : {}),
        nextId: () => ++seqRef.current,
        onStatus: setStatus,
      });

      switch (r.attribution.kind) {
        case "learner-compile-error":
          // Theirs, and from the ORIGINAL compile — the only diagnostics that
          // are ever allowed to reach this panel.
          setError(r.attribution.diagnostics);
          break;
        case "unavailable":
          setTraceNote(unavailableMessage(r.attribution.reason));
          // Telemetry about OUR bug. Logged, never rendered.
          if (r.attribution.telemetry) {
            console.warn("[tracer] %s: %s", r.attribution.reason, r.attribution.telemetry);
          }
          break;
        case "learner-trap":
          setTrace(r.trace ?? null);
          setTraceNote(trapMessage(r.attribution.trap));
          break;
        case "ok":
          setTrace(r.trace ?? null);
          break;
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "TRACE_TIMEOUT") {
        // terminate() is the only way to stop a spinning wasm program, and it
        // destroys this worker — so drop the reference or every later run
        // posts into a corpse.
        workerRef.current?.terminate();
        workerRef.current = null;
        setTraceNote(
          "Tracing timed out. If your program loops forever, the step limit stops the " +
            "trace but not the program — fix the loop and try again.",
        );
      } else {
        setTraceNote(msg);
      }
    } finally {
      setTracing(false);
      setStatus("");
    }
  }

  async function onSubmit() {
    if (new TextEncoder().encode(source).length > MAX_SOURCE_BYTES) {
      setError("Source exceeds the 64 KB limit.");
      return;
    }
    if (cases.length === 0) {
      setError("This problem has no test cases yet.");
      return;
    }

    setBusy(true);
    setError(null);
    setOutcomes(null);
    setVerdict(null);

    try {
      const results: Array<{ caseId: string; outputHash: string }> = [];
      const local: CaseOutcome[] = [];
      let compileMs = 0;

      for (const [i, c] of cases.entries()) {
        setStatus(`Running case ${i + 1} of ${cases.length}…`);
        const { stdout, compileMs: ms } = await runCase(c.input);
        compileMs = ms || compileMs;

        // Trailing-whitespace differences are not wrong answers.
        const normalised = stdout.replace(/[ \t]+$/gm, "").trimEnd();
        results.push({ caseId: c.id, outputHash: await sha256Hex(normalised) });

        local.push({
          caseId: c.id,
          visibility: c.visibility,
          // Sample cases can be judged locally for instant feedback; hidden
          // ones are decided by the server.
          passed:
            c.expectedOutput !== null
              ? normalised === c.expectedOutput.replace(/[ \t]+$/gm, "").trimEnd()
              : false,
          stdout: c.visibility === "sample" ? stdout : undefined,
          expected: c.expectedOutput,
        });
      }

      setStatus("Submitting…");
      const res = await fetch("/api/course/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemSlug, source, results, compileMs }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? `Submission failed (${res.status})`);
        return;
      }

      setVerdict(body.data.verdict);
      // Server verdict wins for hidden cases; keep local detail for samples.
      const serverCases: Array<{ caseId: string; passed: boolean }> = body.data.cases ?? [];
      setOutcomes(
        local.map((l) => {
          const s = serverCases.find((x) => x.caseId === l.caseId);
          return s ? { ...l, passed: s.passed } : l;
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setStatus("");
    }
  }

  const sampleCount = cases.filter((c) => c.visibility === "sample").length;

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="sol" className="mb-1 flex items-baseline justify-between text-xs uppercase tracking-wider text-text-faint">
          <span>solution.cpp</span>
          <span className="normal-case tracking-normal">
            {cases.length} test case(s) · {sampleCount} shown
          </span>
        </label>
        <textarea
          id="sol"
          spellCheck={false}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          rows={20}
          className="w-full resize-y rounded-md border border-border bg-surface p-3 font-mono text-[13px] leading-relaxed outline-none focus:border-accent"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Running…" : "Run & submit"}
        </button>
        <button
          type="button"
          onClick={onVisualize}
          disabled={busy || tracing}
          title="Compile a traced copy and step through it. Never affects your verdict."
          className="rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-surface-raised disabled:opacity-50"
        >
          {tracing ? "Tracing…" : "Visualize"}
        </button>
        {status ? <span className="text-xs text-text-muted">{status}</span> : null}
        {verdict ? (
          <span className={verdict === "accepted" ? "text-sm text-success" : "text-sm text-error"}>
            {verdict === "accepted" ? "● Accepted" : "● Wrong answer"}
          </span>
        ) : null}
      </div>

      {error ? (
        <pre role="alert" className="overflow-x-auto rounded-md border border-border bg-surface p-3 text-xs text-error">
          {error}
        </pre>
      ) : null}

      {/* 🛑 Worded as a limitation of the tool, because in every case that
          produces one of these it IS one. Never "your code is wrong". */}
      {traceNote ? (
        <p className="rounded-md border border-border bg-surface p-3 text-xs text-text-muted">
          {traceNote}
        </p>
      ) : null}

      {trace ? (
        <VizPlayer trace={trace} chrome="trace" title="step through your code" />
      ) : null}

      {outcomes ? (
        <ul className="space-y-px overflow-hidden rounded-md border border-border bg-border text-sm">
          {outcomes.map((o, i) => (
            <li key={o.caseId} className="bg-surface p-3">
              <span className="flex items-center gap-2">
                <span className={o.passed ? "text-success" : "text-error"}>{o.passed ? "●" : "○"}</span>
                <span>
                  Case {i + 1}
                  <span className="ml-2 text-xs text-text-faint">{o.visibility}</span>
                </span>
              </span>
              {o.visibility === "sample" && !o.passed ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <pre className="overflow-x-auto rounded-sm bg-bg p-2 text-xs">
                    expected:{"\n"}
                    {o.expected}
                  </pre>
                  <pre className="overflow-x-auto rounded-sm bg-bg p-2 text-xs">
                    got:{"\n"}
                    {o.stdout}
                  </pre>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
