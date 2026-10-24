/**
 * Sandbox worker — compiles and runs C++ entirely in the browser.
 *
 * Everything heavy happens here so the main thread can `terminate()` a runaway
 * program: a `while(true)` loop inside WebAssembly cannot be interrupted any
 * other way.
 *
 * Served from /public as a plain ES module rather than bundled, so it can load
 * the toolchain by relative URL. All assets are same-origin, which keeps CSP at
 * `connect-src 'self'`.
 *
 * Derived from the Phase 0 spike (scratchpad/cpp-wasm-spike), which proved the
 * approach end to end before any of this was built on top.
 */

let runClang = null;
let wasi = null;
let BITS = null;
let PCH = null;
let base = null;

const td = new TextDecoder();
const te = new TextEncoder();
const post = (type, payload = {}) => self.postMessage({ type, ...payload });

/**
 * 🛑 Must match the flags the PCH was built with
 * (scripts/build-toolchain-assets.mjs CXX_FLAGS) exactly. Clang rejects a PCH
 * on any mismatch — "OptimizationLevel differs in precompiled file" — so -O is
 * not a user-facing option.
 *
 * -fno-exceptions is forced, not chosen: the bundled libc++abi was built
 * without exceptions (no __cxa_throw), so -fexceptions cannot link.
 */
const CXX_FLAGS = ["-std=c++20", "-O2", "-fno-exceptions"];

async function load() {
  if (runClang) return;

  const manifestRes = await fetch("/toolchain/current.json");
  if (!manifestRes.ok) throw new Error("toolchain manifest missing — run `npm run toolchain:build`");
  const { version } = await manifestRes.json();
  base = `/toolchain/${version}`;

  post("status", { phase: "downloading", message: "Fetching the C++ toolchain (one time, ~30 MB)…" });

  const [clangMod, wasiMod, bits, pch] = await Promise.all([
    import(`${base}/bundle.js`),
    import(`${base}/wasi/index.js`),
    fetch(`${base}/stdc++.h`).then((r) => r.text()),
    fetch(`${base}/stdcxx.pch`).then((r) => r.arrayBuffer()),
  ]);

  runClang = clangMod.runClang;
  wasi = wasiMod;
  BITS = bits;
  PCH = new Uint8Array(pch);

  post("status", { phase: "ready", message: `Clang ${version} ready` });
}

/**
 * The tracer's C++ emitter, fetched once alongside the toolchain.
 *
 * 🛑 A separate virtual file, deliberately NOT added to `bits/stdc++.h`: that
 * header's AST is baked into the 19.5 MB PCH, so extending it would force a
 * rebuild and redeploy for a header that pulls in nothing the PCH lacks.
 */
let AZ_HEADER = null;

async function loadTraceHeader() {
  if (AZ_HEADER !== null) return;
  const res = await fetch("/trace/az_trace.h");
  if (!res.ok) throw new Error("trace header missing — run `npm run toolchain:build`");
  AZ_HEADER = await res.text();
}

/** Compile source to wasm. Throws with `.stderr` carrying the diagnostics. */
async function compile(source) {
  let stderr = "";
  const files = { "sol.cpp": source, "stdcxx.pch": PCH, bits: { "stdc++.h": BITS } };
  const args = ["clang++", ...CXX_FLAGS, "-I.", "-include-pch", "stdcxx.pch", "sol.cpp", "-o", "sol.wasm"];

  const t = performance.now();
  let out;
  try {
    out = await runClang(args, files, {
      stderr: (b) => { if (b) stderr += td.decode(b); },
      fetchProgress: (e) =>
        post("progress", { done: e.doneLength, total: e.totalLength }),
    });
  } catch (err) {
    const e = new Error("compilation failed");
    e.stderr = stderr || String(err);
    throw e;
  }
  const wasmBytes = out["sol.wasm"];
  if (!wasmBytes) {
    const e = new Error("compiler produced no output");
    e.stderr = stderr;
    throw e;
  }
  return { wasm: wasmBytes, stderr, ms: Math.round(performance.now() - t) };
}

const OUTPUT_CAP = 256 * 1024;

/** Run the produced wasm under WASI with stdin pre-supplied. */
async function run(wasmBytes, stdinText) {
  const { WASI, File, OpenFile, ConsoleStdout, PreopenDirectory } = wasi;

  let stdout = "";
  let stderrOut = "";
  let truncated = false;

  const sink = (append) => (line) => {
    if (stdout.length + stderrOut.length >= OUTPUT_CAP) { truncated = true; return; }
    append(line);
  };

  const fds = [
    // stdin as an in-memory file: never blocks, so no SharedArrayBuffer and
    // therefore no COOP/COEP requirement on the hosting page.
    new OpenFile(new File(te.encode(stdinText ?? ""))),
    ConsoleStdout.lineBuffered(sink((l) => { stdout += l + "\n"; })),
    ConsoleStdout.lineBuffered(sink((l) => { stderrOut += l + "\n"; })),
    // An empty preopened dir: the program sees a filesystem containing nothing,
    // not the host's. No network interface is exposed at all.
    new PreopenDirectory(".", new Map()),
  ];

  const instance = new WASI(["sol"], [], fds);
  const t = performance.now();
  const module = await WebAssembly.compile(wasmBytes);
  const inst = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: instance.wasiImport });

  let exitCode = 0;
  try {
    instance.start(inst);
  } catch (err) {
    exitCode = typeof err?.code === "number" ? err.code : -1;
    if (exitCode === -1) stderrOut += `\n[trap] ${err?.message ?? err}`;
  }

  return { stdout, stderr: stderrOut, exitCode, truncated, ms: Math.round(performance.now() - t) };
}

/* ------------------------------------------------------------------ trace --
 *
 * A SEPARATE code path from `compile`/`run`. Those two are left byte-identical
 * on purpose: they decide verdicts, and the one hard requirement of this
 * feature is that tracing cannot change what gets judged.
 */

/** Compile instrumented source, with `az_trace.h` planted in the VFS. */
async function compileTraced(source) {
  let stderr = "";
  const files = {
    "sol.cpp": source,
    "stdcxx.pch": PCH,
    bits: { "stdc++.h": BITS },
    "az_trace.h": AZ_HEADER,
  };
  const args = ["clang++", ...CXX_FLAGS, "-I.", "-include-pch", "stdcxx.pch", "sol.cpp", "-o", "sol.wasm"];

  const t = performance.now();
  let out;
  try {
    out = await runClang(args, files, { stderr: (b) => { if (b) stderr += td.decode(b); } });
  } catch (err) {
    const e = new Error("instrumented compilation failed");
    e.stderr = stderr || String(err);
    throw e;
  }
  const wasmBytes = out["sol.wasm"];
  if (!wasmBytes) {
    const e = new Error("instrumented compile produced no output");
    e.stderr = stderr;
    throw e;
  }
  return { wasm: wasmBytes, stderr, ms: Math.round(performance.now() - t) };
}

/** Independent of OUTPUT_CAP: trace mode gets its own budget. */
const TRACE_CAP = 2 * 1024 * 1024;

/**
 * Run instrumented wasm, STREAMING the raw trace out as it is produced.
 *
 * 🛑 Streaming matters more than it looks. The 30 s watchdog calls
 * `worker.terminate()`, which destroys everything this worker holds — so a
 * trace assembled only at exit is lost exactly on an infinite loop, which is
 * when seeing the first steps is most useful. `postMessage` from inside the fd
 * callback runs on this thread during the synchronous `start()` and queues
 * fine.
 */
async function runTraced(wasmBytes, stdinText, id) {
  const { WASI, File, OpenFile, ConsoleStdout, PreopenDirectory, Fd } = wasi;

  let stdout = "";
  let stdoutBytes = 0;
  let traceBytes = 0;
  let pending = "";
  let stdoutTruncated = false;
  let traceTruncated = false;

  const flush = () => {
    if (!pending) return;
    post("traceChunk", { id, raw: pending });
    pending = "";
  };

  /**
   * Raw sink, NOT ConsoleStdout.lineBuffered: that retains a trailing partial
   * line and never flushes it, which silently discarded every frame of a first
   * attempt. Trace mode needs every byte.
   */
  class RawSink extends Fd {
    fd_write(data) {
      if (traceBytes < TRACE_CAP) {
        traceBytes += data.byteLength;
        pending += td.decode(data, { stream: true });
        // Batched rather than one message per record: 500 postMessage calls
        // would be wasteful, and the UI cannot paint faster anyway.
        if (pending.length > 16 * 1024) flush();
      } else {
        traceTruncated = true;
      }
      return { ret: 0, nwritten: data.byteLength };
    }
  }

  const fds = [
    new OpenFile(new File(te.encode(stdinText ?? ""))),
    ConsoleStdout.lineBuffered((l) => {
      if (stdoutBytes >= OUTPUT_CAP) { stdoutTruncated = true; return; }
      stdoutBytes += l.length + 1;
      stdout += l + "\n";
    }),
    // The emitter writes to stderr, so stderr IS the trace channel here. The
    // learner's own stderr arrives interleaved and is separated by the 0x01
    // framing on the main thread.
    new RawSink(),
    new PreopenDirectory(".", new Map()),
  ];

  const instance = new WASI(["sol"], [], fds);
  const t = performance.now();
  const module = await WebAssembly.compile(wasmBytes);
  const inst = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: instance.wasiImport });

  let exitCode = 0;
  let trap = "";
  try {
    instance.start(inst);
  } catch (err) {
    exitCode = typeof err?.code === "number" ? err.code : -1;
    if (exitCode === -1) trap = err?.message ?? String(err);
  }

  flush();
  return {
    stdout,
    exitCode,
    trap,
    stdoutTruncated,
    traceTruncated,
    ms: Math.round(performance.now() - t),
  };
}

self.onmessage = async (ev) => {
  const { id, cmd, source, stdin } = ev.data ?? {};
  try {
    if (cmd === "load") {
      await load();
      post("done", { id, ok: true });
      return;
    }
    if (cmd === "run") {
      await load();
      post("status", { phase: "compiling", message: "Compiling…" });
      const c = await compile(source);
      post("status", { phase: "running", message: "Running…" });
      const r = await run(c.wasm, stdin);
      post("result", {
        id,
        ok: true,
        compileMs: c.ms,
        compilerStderr: c.stderr,
        wasmBytes: c.wasm.length,
        ...r,
      });
      return;
    }
    if (cmd === "trace") {
      await load();
      await loadTraceHeader();
      post("status", { phase: "compiling", message: "Compiling instrumented…" });
      const c = await compileTraced(source);
      post("status", { phase: "running", message: "Tracing…" });
      const r = await runTraced(c.wasm, stdin, id);
      post("result", {
        id,
        ok: true,
        traced: true,
        compileMs: c.ms,
        compilerStderr: c.stderr,
        wasmBytes: c.wasm.length,
        ...r,
      });
      return;
    }

    post("result", { id, ok: false, error: `unknown command: ${cmd}` });
  } catch (err) {
    post("result", { id, ok: false, error: err?.message ?? String(err), compilerStderr: err?.stderr ?? "" });
  }
};
