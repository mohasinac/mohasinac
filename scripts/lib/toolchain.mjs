/**
 * The C++ toolchain, driven from node.
 *
 * Extracted because five scripts had grown their own copy of this
 * (`add-reference-programs`, `verify-gates`, `verify-splice`,
 * `verify-az-header`, `build-toolchain-assets`) and a sixth was about to.
 *
 * 🛑 The flags are the reason this had to be one module rather than five
 * copies. They are not preferences:
 *
 *   - `CXX_FLAGS` must match what the PCH was built with, exactly. Clang
 *     rejects a precompiled header on any mismatch, and these scripts are the
 *     only place the PCH is used outside the browser.
 *   - `LINK_FLAGS` is load-bearing. At the stock 64 KB stack EVERY traced
 *     recursive program traps while running fine untraced — the exact
 *     misattribution failure the tracer exists to avoid. It had already
 *     drifted: `verify-az-header` carried no link flags at all.
 *
 * Mirrors `public/sandbox-worker.js`. If the flags change there, they change
 * here, and `verify:gates` asserts the pair agree.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Must equal the PCH's build flags. See the note above. */
export const CXX_FLAGS = ["-std=c++20", "-O2", "-fno-exceptions"];

export const MAX_MEMORY = 256 * 1024 * 1024;
export const STACK_SIZE = 1024 * 1024;

/**
 * Linker flags, so they cannot affect PCH compatibility — unlike `-D`, which
 * is why the tracer emits its limits as `#define`s into the rewritten source.
 */
export const LINK_FLAGS = [
  `-Wl,-z,stack-size=${STACK_SIZE}`,
  `-Wl,--max-memory=${MAX_MEMORY}`,
];

const td = new TextDecoder();
const te = new TextEncoder();

let cached = null;

/** Load clang, the WASI shim, the `<bits/stdc++.h>` shim and the PCH. Cached. */
export async function loadToolchain() {
  if (cached) return cached;
  const manifest = JSON.parse(readFileSync(join(ROOT, "public/toolchain/current.json"), "utf8"));
  const base = join(ROOT, "public/toolchain", manifest.version);
  const { runClang } = await import(pathToFileURL(join(base, "bundle.js")).href);
  const wasi = await import(pathToFileURL(join(base, "wasi/index.js")).href);
  cached = {
    version: manifest.version,
    runClang,
    wasi,
    BITS: readFileSync(join(base, "stdc++.h"), "utf8"),
    PCH: new Uint8Array(readFileSync(join(base, "stdcxx.pch"))),
  };
  return cached;
}

/**
 * Compile one translation unit.
 *
 * Returns `{ ok, stdout, stderr, wasm }` and **never throws on a compile
 * error** — a failed compile is data here, not an exception. Attribution needs
 * to see both outcomes to decide whose fault a failure was, and throwing would
 * discard exactly that.
 *
 * `ast: true` switches to `-Xclang -ast-dump=json -fsyntax-only`, where the
 * dump arrives on stdout. That costs a parse rather than a codegen, and the
 * dump omits everything loaded from the PCH — the only reason dumping a
 * program that includes `<bits/stdc++.h>` is affordable at all.
 */
export async function compile(source, { ast = false, extra = {}, link = LINK_FLAGS } = {}) {
  const { runClang, BITS, PCH } = await loadToolchain();
  let stdout = "";
  let stderr = "";

  const files = { "t.cpp": source, "stdcxx.pch": PCH, bits: { "stdc++.h": BITS }, ...extra };
  const args = ast
    ? ["clang++", ...CXX_FLAGS, "-I.", "-include-pch", "stdcxx.pch",
       "-Xclang", "-ast-dump=json", "-fsyntax-only", "t.cpp"]
    : ["clang++", ...CXX_FLAGS, "-I.", "-include-pch", "stdcxx.pch", ...link,
       "t.cpp", "-o", "t.wasm"];

  const started = Date.now();
  try {
    const out = await runClang(args, files, {
      stdout: (b) => { if (b) stdout += td.decode(b); },
      stderr: (b) => { if (b) stderr += td.decode(b); },
    });
    return { ok: true, stdout, stderr, wasm: out?.["t.wasm"], ms: Date.now() - started };
  } catch (err) {
    return { ok: false, stdout, stderr: stderr || String(err), ms: Date.now() - started };
  }
}

/**
 * Run produced wasm under WASI, with stdin pre-supplied as a virtual file.
 *
 * `captureTrace` swaps fd 2 for a RAW sink instead of `ConsoleStdout`:
 * `lineBuffered` silently discards a final unterminated line, which once lost
 * 100% of the tracer's output. Trace mode needs every byte, so callers that
 * read frames must pass it.
 *
 * 🛑 `trapKind` is decided with the instance's MEMORY, not just the message.
 * Under `-fno-exceptions` a failed allocation cannot throw, so it aborts and
 * the trap reads `unreachable` — indistinguishable from a failed assert or UB,
 * with or without `--max-memory`. Sitting against the ceiling is the evidence.
 */
export async function run(wasmBytes, stdinText = "", { captureTrace = false } = {}) {
  const { wasi } = await loadToolchain();
  const { WASI, File, OpenFile, ConsoleStdout, PreopenDirectory, Fd } = wasi;

  let stdout = "";
  let stderr = "";
  let raw = "";

  const traceSink = new (class extends Fd {
    fd_write(data) {
      raw += td.decode(data, { stream: true });
      return { ret: 0, nwritten: data.byteLength };
    }
  })();

  const fds = [
    // An in-memory file, so reading stdin never blocks — which is what avoids
    // SharedArrayBuffer and therefore COOP/COEP in the browser.
    new OpenFile(new File(te.encode(stdinText ?? ""))),
    ConsoleStdout.lineBuffered((l) => { stdout += `${l}\n`; }),
    captureTrace ? traceSink : ConsoleStdout.lineBuffered((l) => { stderr += `${l}\n`; }),
    // An empty preopened dir: the program sees a filesystem containing
    // nothing, not the host's, and no network interface at all.
    new PreopenDirectory(".", new Map()),
  ];

  const instance = new WASI(["t"], [], fds);
  const mod = await WebAssembly.compile(wasmBytes);
  const inst = await WebAssembly.instantiate(mod, { wasi_snapshot_preview1: instance.wasiImport });

  let exitCode = 0;
  let trap = "";
  let trapKind = "";
  const started = Date.now();
  try {
    instance.start(inst);
  } catch (err) {
    exitCode = typeof err?.code === "number" ? err.code : -1;
    if (exitCode === -1) {
      trap = err?.message ?? String(err);
      trapKind = classifyTrap(trap, inst);
    }
  }

  return { stdout, stderr, raw, exitCode, trap, trapKind, ms: Date.now() - started };
}

/** Mirrors `classifyTrapWithMemory` in public/sandbox-worker.js. */
export function classifyTrap(message, inst) {
  const msg = String(message ?? "");
  const bytes = inst?.exports?.memory?.buffer?.byteLength ?? 0;
  if (/unreachable/i.test(msg) && bytes >= MAX_MEMORY * 0.9) return "out_of_memory";
  if (/out of memory|allocation/i.test(msg)) return "out_of_memory";
  // A wasm stack lives in linear memory, so overflowing it is an OOB access
  // rather than a named stack error.
  if (/call stack|stack overflow/i.test(msg)) return "stack_overflow";
  if (/out of bounds|memory access/i.test(msg)) return "out_of_bounds";
  if (/divide by zero|integer divide/i.test(msg)) return "divide_by_zero";
  if (/unreachable/i.test(msg)) return "unreachable";
  return "unknown";
}

/** Trailing whitespace is not a wrong answer — matches the client and the seed script. */
export const normaliseOutput = (s) => String(s).replace(/[ \t]+$/gm, "").trimEnd();
