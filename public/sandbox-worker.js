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
    post("result", { id, ok: false, error: `unknown command: ${cmd}` });
  } catch (err) {
    post("result", { id, ok: false, error: err?.message ?? String(err), compilerStderr: err?.stderr ?? "" });
  }
};
