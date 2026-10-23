"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * In-browser C++ sandbox.
 *
 * The worker owns the toolchain; this component owns the UI and — critically —
 * the watchdog. A `while(true)` inside WebAssembly cannot be interrupted from
 * inside, so the only way to stop it is to terminate the worker from here.
 */

const DEFAULT_SOURCE = `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) return 0;

    vector<long long> a(n);
    for (int i = 0; i < n; i++) cin >> a[i];

    long long target;
    cin >> target;

    // Count pairs summing to target — the two-sum pattern, with a hash map.
    unordered_map<long long, int> seen;
    long long pairs = 0;
    for (int i = 0; i < n; i++) {
        auto it = seen.find(target - a[i]);
        if (it != seen.end()) pairs += it->second;
        seen[a[i]]++;
    }

    sort(a.begin(), a.end());
    cout << "pairs: " << pairs << "\\n";
    cout << "sum:   " << accumulate(a.begin(), a.end(), 0LL) << "\\n";
    cout << "sorted:";
    for (long long v : a) cout << ' ' << v;
    cout << "\\n";
}
`;

const DEFAULT_STDIN = "5\n2 7 11 15 2\n9\n";

/** Wall-clock ceiling for a single run, including compilation. */
const TIMEOUT_MS = 30_000;
/** Source size cap — mirrors the server-side limit used for submissions. */
const MAX_SOURCE_BYTES = 64 * 1024;

type RunState = "idle" | "loading" | "compiling" | "running";

interface RunResult {
  ok: boolean;
  stdout?: string;
  stderr?: string;
  compilerStderr?: string;
  error?: string;
  exitCode?: number;
  compileMs?: number;
  ms?: number;
  truncated?: boolean;
  wasmBytes?: number;
}

export function Sandbox() {
  const [source, setSource] = useState(DEFAULT_SOURCE);
  const [stdin, setStdin] = useState(DEFAULT_STDIN);
  const [state, setState] = useState<RunState>("idle");
  const [status, setStatus] = useState<string>("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  // Cleanup only. Capability detection deliberately does NOT live here:
  // calling setState from an effect to record it would both trip
  // react-hooks/set-state-in-effect and desync SSR from the first client
  // render (Worker is undefined on the server, defined in the browser).
  // It is checked at click time instead, where it can be reported directly.
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  /**
   * Reuse the worker across runs.
   *
   * 🛑 Do NOT spawn a fresh one per run. The toolchain costs seconds to
   * instantiate, and discarding it each time turned a measured 1.1s warm
   * compile into 8.6s on the deployed site. The worker is only destroyed when
   * the watchdog fires — which is the one case where a clean slate is the
   * point.
   */
  const getWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current;
    const w = new Worker("/sandbox-worker.js", { type: "module" });
    workerRef.current = w;
    return w;
  }, []);

  const run = useCallback(() => {
    // Graceful degradation: say so plainly rather than offering a Run button
    // that silently never works.
    if (typeof WebAssembly === "undefined" || typeof Worker === "undefined") {
      setResult({
        ok: false,
        error:
          "This browser does not support WebAssembly in a worker, so the sandbox cannot run here. The editor above still works as a viewer.",
      });
      return;
    }

    const bytes = new TextEncoder().encode(source).length;
    if (bytes > MAX_SOURCE_BYTES) {
      setResult({ ok: false, error: `Source is ${(bytes / 1024).toFixed(1)} KB; the limit is 64 KB.` });
      return;
    }

    setResult(null);
    setProgress(null);
    setState("loading");
    setStatus("Starting the toolchain…");

    const id = ++seqRef.current;
    const worker = getWorker();

    timerRef.current = setTimeout(() => {
      // The only way to stop a spinning wasm program. Dropping the reference
      // means the next run pays the cold-start cost again — correct here,
      // since the worker may be mid-infinite-loop and is not reusable.
      worker.terminate();
      workerRef.current = null;
      setState("idle");
      setStatus("");
      setResult({
        ok: false,
        error: `Stopped after ${TIMEOUT_MS / 1000}s. If that was an infinite loop, this is the watchdog doing its job.`,
      });
    }, TIMEOUT_MS);

    worker.onmessage = (ev: MessageEvent) => {
      const d = ev.data;
      if (d.type === "status") {
        setStatus(d.message);
        if (d.phase === "compiling") setState("compiling");
        if (d.phase === "running") setState("running");
        return;
      }
      if (d.type === "progress") {
        setProgress({ done: d.done, total: d.total });
        return;
      }
      if (d.type === "result" && d.id === id) {
        if (timerRef.current) clearTimeout(timerRef.current);
        setState("idle");
        setStatus("");
        setProgress(null);
        setResult(d as RunResult);
      }
    };

    worker.onerror = (e) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      // A worker that errored may be in an unknown state — discard it so the
      // next run starts clean rather than inheriting the fault.
      worker.terminate();
      workerRef.current = null;
      setState("idle");
      setResult({ ok: false, error: `Worker failed: ${e.message}` });
    };

    worker.postMessage({ id, cmd: "run", source, stdin });
  }, [source, stdin, getWorker]);

  const busy = state !== "idle";
  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div>
          <label htmlFor="src" className="mb-1 flex items-baseline justify-between text-xs uppercase tracking-wider text-text-faint">
            <span>main.cpp</span>
            <span className="normal-case tracking-normal">C++20 · -O2 · -fno-exceptions</span>
          </label>
          <textarea
            id="src"
            spellCheck={false}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            rows={22}
            className="w-full resize-y rounded-md border border-border bg-surface p-3 font-mono text-[13px] leading-relaxed outline-none focus:border-accent"
          />
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="stdin" className="mb-1 block text-xs uppercase tracking-wider text-text-faint">
              stdin
            </label>
            <textarea
              id="stdin"
              spellCheck={false}
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              rows={6}
              className="w-full resize-y rounded-md border border-border bg-surface p-3 font-mono text-[13px] outline-none focus:border-accent"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={run}
              disabled={busy}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Working…" : "Run"}
            </button>
            {busy ? (
              <span className="text-xs text-text-muted">
                {status}
                {pct !== null ? ` ${pct}%` : ""}
              </span>
            ) : null}
          </div>

          <p className="text-xs leading-relaxed text-text-faint">
            First run downloads Clang and the C++ standard library (~30&nbsp;MB), then the browser
            caches it. Nothing you write is uploaded — compilation and execution both happen on this
            machine.
          </p>
        </div>
      </div>

      {result ? <Output result={result} /> : null}
    </div>
  );
}

function Output({ result }: { result: RunResult }) {
  const failed = !result.ok;
  const diagnostics = result.compilerStderr?.trim();
  const runtimeErr = result.stderr?.trim();

  return (
    <section className="overflow-hidden rounded-md border border-border">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-surface-raised px-3 py-2 text-xs">
        <span className={failed ? "text-error" : "text-success"}>
          {failed ? "● failed" : `● exit ${result.exitCode}`}
        </span>
        {result.compileMs !== undefined ? <span className="text-text-faint">compile {result.compileMs} ms</span> : null}
        {result.ms !== undefined ? <span className="text-text-faint">run {result.ms} ms</span> : null}
        {result.wasmBytes ? (
          <span className="text-text-faint">{(result.wasmBytes / 1024).toFixed(0)} KB wasm</span>
        ) : null}
        {result.truncated ? <span className="text-warning">output truncated</span> : null}
      </header>

      {result.error ? (
        <p className="border-b border-border bg-surface px-3 py-2 text-sm text-error">{result.error}</p>
      ) : null}

      {diagnostics ? (
        <pre className="overflow-x-auto border-b border-border bg-surface px-3 py-2 text-xs text-warning">
          {diagnostics}
        </pre>
      ) : null}

      {runtimeErr ? (
        <pre className="overflow-x-auto border-b border-border bg-surface px-3 py-2 text-xs text-error">
          {runtimeErr}
        </pre>
      ) : null}

      <pre className="overflow-x-auto bg-bg px-3 py-3 text-[13px] leading-relaxed">
        {result.stdout?.length ? result.stdout : <span className="text-text-faint">(no output)</span>}
      </pre>
    </section>
  );
}
