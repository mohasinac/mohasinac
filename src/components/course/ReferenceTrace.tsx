"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VizPlayer } from "@dsa/render/VizPlayer";
import { unavailableMessage } from "@dsa/trace/attribute";
import { trapMessage } from "@dsa/trace/protocol";
import type { AzLimits } from "@dsa/trace/az-trace-header";
import type { VizKind, VizTrace } from "@dsa/trace/types";
import { runTrace } from "@/lib/trace-run";

/**
 * Step through the EDITORIAL's solution.
 *
 * 🛑 Costs zero new authored content. A problem needs an editorial and a
 * sample case to be finished at all, and those two are exactly the inputs —
 * so a problem added next year gets a reference visualization as a side effect
 * of being complete. That is the "works for every problem, including future
 * ones" requirement satisfied structurally rather than by convention.
 *
 * 🛑 Mounted INSIDE the editorial's collapsed `<details>`, which is the whole
 * reveal gate. A reference solution stepping through itself above the editor
 * would simply be the answer, and the point is to attempt it first.
 *
 * It traces the same way the learner's own code is traced — same pipeline,
 * same attribution, same honesty about what it could not instrument. The one
 * difference is whose code is on screen, which is why the heading says so.
 */
export function ReferenceTrace({
  program,
  input,
  vizLimits,
  vizKind,
  vizVar,
}: {
  /** The editorial's last complete program. */
  program: string;
  /** The problem's first sample input. */
  input: string;
  vizLimits?: Partial<AzLimits>;
  vizKind?: VizKind;
  vizVar?: string;
}) {
  const [trace, setTrace] = useState<VizTrace | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const seqRef = useRef(0);

  // Its OWN worker, not the workbench's. Sharing one would mean a reference
  // trace and a submission could interleave requests on the same toolchain,
  // and the 30 s watchdog terminates the worker — killing both.
  useEffect(() => () => workerRef.current?.terminate(), []);

  const run = useCallback(async () => {
    setBusy(true);
    setNote(null);
    setTrace(null);
    try {
      if (!workerRef.current) {
        workerRef.current = new Worker("/sandbox-worker.js", { type: "module" });
      }
      const r = await runTrace({
        worker: workerRef.current,
        source: program,
        stdin: input,
        ...(vizLimits ? { limits: vizLimits } : {}),
        ...(vizKind ? { vizKind } : {}),
        ...(vizVar ? { vizVar } : {}),
        nextId: () => ++seqRef.current,
        onStatus: setStatus,
      });

      switch (r.attribution.kind) {
        case "ok":
          setTrace(r.trace ?? null);
          break;
        case "learner-trap":
          setTrace(r.trace ?? null);
          setNote(trapMessage(r.attribution.trap));
          break;
        case "learner-compile-error":
          // 🛑 "Learner" is the wrong word here — this is the EDITORIAL's code,
          // so a compile error is an authoring bug in the course, not anything
          // the reader did. Say that, rather than showing them diagnostics for
          // code they did not write and cannot fix.
          setNote(
            "The reference solution for this problem does not compile — that is a bug in the course " +
              "content, not in anything you did. Your own code is unaffected.",
          );
          console.error("[reference] editorial program failed to compile", r.attribution.diagnostics);
          break;
        case "unavailable":
          setNote(unavailableMessage(r.attribution.reason));
          if (r.attribution.telemetry) {
            console.warn("[reference] %s: %s", r.attribution.reason, r.attribution.telemetry);
          }
          break;
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "TRACE_TIMEOUT") {
        workerRef.current?.terminate();
        workerRef.current = null;
        setNote("The reference trace timed out.");
      } else {
        setNote(msg);
      }
    } finally {
      setBusy(false);
      setStatus("");
    }
  }, [program, input, vizLimits, vizKind, vizVar]);

  return (
    <section className="mt-4 rounded-md border border-border bg-bg p-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-mono text-[11px] uppercase tracking-wider text-text-faint">
          step through the reference solution
        </h3>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="rounded-sm border border-border px-2 py-1 text-xs font-mono transition-colors hover:bg-surface-raised disabled:opacity-50"
        >
          {busy ? "Tracing…" : trace ? "Re-run" : "Run it"}
        </button>
        {status ? <span className="text-xs text-text-muted">{status}</span> : null}
      </div>

      {!trace && !busy && !note ? (
        <p className="mt-2 text-xs text-text-muted">
          Runs the editorial’s program on the first sample input and lets you step through it, with
          breakpoints. Needs the C++ toolchain, which downloads once.
        </p>
      ) : null}

      {note ? <p className="mt-2 text-xs text-text-muted">{note}</p> : null}

      {trace ? (
        <div className="mt-3">
          <VizPlayer trace={trace} chrome="trace" title="the reference solution, running" />
        </div>
      ) : null}
    </section>
  );
}
