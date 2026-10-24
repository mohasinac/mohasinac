/**
 * Compile `az_trace.h` against the REAL toolchain and run a program that
 * exercises every branch of the emitter.
 *
 * 🛑 This is the test that matters. The unit tests only assert things about the
 * header's TEXT; they cannot tell whether it compiles, and the one failure mode
 * that would sink this feature — an ambiguous overload set — is invisible until
 * clang sees it. Every design claim in that header came from compiling, and
 * this keeps it honest.
 *
 *   npm run verify:az-header
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// The header lives in TS as a string constant; read it the same way the worker
// will, so the thing under test is the thing that ships.
const { AZ_TRACE_HEADER, AZ_DEFAULTS, limitsPrelude } = await import(
  pathToFileURL(join(ROOT, "src/packages/dsa/src/trace/az-trace-header.ts")).href
);

const manifest = JSON.parse(readFileSync(join(ROOT, "public/toolchain/current.json"), "utf8"));
const base = join(ROOT, "public/toolchain", manifest.version);

const { runClang } = await import(pathToFileURL(join(base, "bundle.js")).href);
const wasi = await import(pathToFileURL(join(base, "wasi/index.js")).href);
const BITS = readFileSync(join(base, "stdc++.h"), "utf8");
const PCH = new Uint8Array(readFileSync(join(base, "stdcxx.pch")));

/** Must match the PCH byte for byte, or clang rejects it. */
const CXX_FLAGS = ["-std=c++20", "-O2", "-fno-exceptions"];

/**
 * A program touching every branch of the if-constexpr chain. If an overload set
 * had been used instead, this would fail with "call to 'v' is ambiguous" for
 * every one of these types.
 */
const PROGRAM = `${limitsPrelude(AZ_DEFAULTS, 2)}
#include <bits/stdc++.h>
using namespace std;

int main() {
    int i = -7;
    size_t sz = 9;
    double d = 0.1;
    bool bo = false;
    char ch = 'Z';
    string st = "a b";
    vector<int> v1{1, 2, 3};
    vector<vector<int>> v2{{1}, {2, 3}};
    map<string, int> mp{{"k", 1}};
    set<int> s2{1, 3};
    pair<int, string> pr{4, "z"};
    array<int, 3> ar{7, 8, 9};
    int raw[3] = {1, 2, 3};
    int* np = nullptr;
    unsigned long long big = 18446744073709551615ULL;
    double nan_v = nan("");

    if (__az::on(1, 0)) {
        AZ_V(1, i);
        AZ_V(0, sz);
        AZ_V(0, d);
        AZ_V(0, bo);
        AZ_V(0, ch);
        AZ_V(0, st);
        AZ_V(0, v1);
        AZ_V(0, v2);
        AZ_V(0, mp);
        AZ_V(0, s2);
        AZ_V(0, pr);
        AZ_V(0, ar);
        AZ_V(0, raw);
        AZ_V(0, np);
        AZ_V(0, big);
        AZ_V(0, nan_v);
        __az::end();
    }

    // Caps: 10 iterations against AZ_MAX_LOOP of 25 must NOT cap; a tight
    // 10000-iteration loop against AZ_MAX_STEPS of 500 must.
    for (int k = 0; k < 10000; ++k) {
        __az::tick(1);
        if (__az::on(2, 1)) { AZ_V(1, k); __az::end(); }
    }

    // Depth guard runs its destructor on every exit path.
    { __az::Depth guard(3); }

    // 🛑 The program's own stdout must be untouched by any of the above.
    cout << "STDOUT-OK " << i << ' ' << st << '\\n';
    // And a mid-line write to stderr must stay separable from the frames.
    fputs("partial-no-newline", stderr);
}
`;

console.log("\nCompiling az_trace.h against the real toolchain…\n");

let stderr = "";
const files = {
  "t.cpp": PROGRAM,
  "stdcxx.pch": PCH,
  bits: { "stdc++.h": BITS },
  "az_trace.h": AZ_TRACE_HEADER,
};

let out;
const t0 = Date.now();
try {
  out = await runClang(
    ["clang++", ...CXX_FLAGS, "-I.", "-include-pch", "stdcxx.pch", "t.cpp", "-o", "t.wasm"],
    files,
    { stderr: (b) => { if (b) stderr += new TextDecoder().decode(b); } },
  );
} catch (err) {
  console.log("COMPILE FAILED\n");
  console.log(stderr || String(err));
  process.exit(1);
}

const wasmBytes = out["t.wasm"];
if (!wasmBytes) {
  console.log("No wasm produced.\n");
  console.log(stderr);
  process.exit(1);
}
console.log(`  compiled in ${Date.now() - t0} ms, ${wasmBytes.length} bytes`);
if (stderr.trim()) console.log(`  diagnostics:\n${stderr}`);

// ---- run it -----------------------------------------------------------------

const { WASI, File, OpenFile, ConsoleStdout, PreopenDirectory } = wasi;
let stdout = "";
let errRaw = "";

const fds = [
  new OpenFile(new File(new TextEncoder().encode(""))),
  ConsoleStdout.lineBuffered((l) => { stdout += `${l}\n`; }),
  // Raw, not line-buffered: lineBuffered drops a final unterminated line, which
  // is exactly what the 0x01 framing exists to survive.
  new (class extends wasi.Fd {
    fd_write(data) {
      errRaw += new TextDecoder().decode(data);
      return { ret: 0, nwritten: data.byteLength };
    }
  })(),
  new PreopenDirectory(".", new Map()),
];

const instance = new WASI(["t"], [], fds);
const mod = await WebAssembly.compile(wasmBytes);
const inst = await WebAssembly.instantiate(mod, { wasi_snapshot_preview1: instance.wasiImport });

let exitCode = 0;
try {
  instance.start(inst);
} catch (err) {
  exitCode = typeof err?.code === "number" ? err.code : -1;
  if (exitCode === -1) console.log(`  [trap] ${err?.message ?? err}`);
}

// ---- assert -----------------------------------------------------------------

const SOH = "\x01";
const parts = errRaw.split(SOH);
const frames = [];
let ownStderr = "";
for (const [i, part] of parts.entries()) {
  if (i % 2 === 1) frames.push(part);
  else ownStderr += part;
}

const fail = [];
const ok = [];

const check = (cond, msg) => (cond ? ok.push(msg) : fail.push(msg));

check(exitCode === 0, `exit code is 0 (got ${exitCode})`);
check(stdout.includes("STDOUT-OK -7 a b"), "the program's own stdout is intact and untouched");
check(frames.length > 0, `frames were emitted (${frames.length})`);

let parsed = [];
let badJson = 0;
for (const f of frames) {
  try {
    parsed.push(JSON.parse(f));
  } catch {
    badJson++;
  }
}
check(badJson === 0, `every frame is valid JSON (${badJson} bad)`);

const typeFrame = parsed.find((p) => p.k === "f" && p.v && "i" in p.v);
check(Boolean(typeFrame), "the all-types frame was emitted");
if (typeFrame) {
  const v = typeFrame.v;
  const expect = {
    i: -7, sz: 9, d: 0.1, bo: false, ch: "Z", st: "a b",
    v1: [1, 2, 3], v2: [[1], [2, 3]], mp: [["k", 1]], s2: [1, 3],
    pr: [4, "z"], ar: [7, 8, 9], raw: "<array>", np: null,
    big: 18446744073709551615n > 0 ? 18446744073709551615 : 0, nan_v: "NaN",
  };
  for (const [key, want] of Object.entries(expect)) {
    const got = JSON.stringify(v[key]);
    // big is beyond Number.MAX_SAFE_INTEGER, so compare its text.
    if (key === "big") {
      check(String(v[key]).startsWith("1844674407370955"), `big unsigned printed in full (${v[key]})`);
      continue;
    }
    check(got === JSON.stringify(want), `${key} = ${got} (expected ${JSON.stringify(want)})`);
  }
}

const cap = parsed.find((p) => p.k === "cap");
check(Boolean(cap), "a cap record was emitted for the 10000-iteration loop");
if (cap) check(cap.reason === "steps" || cap.reason === "loop", `cap reason is ${cap.reason}`);

const steps = parsed.filter((p) => p.k === "f").length;
check(steps <= AZ_DEFAULTS.maxSteps + 1, `frame count respects the cap (${steps})`);

check(
  ownStderr.includes("partial-no-newline"),
  "a mid-line write to the learner's stderr survives the 0x01 split",
);
check(
  !ownStderr.includes('{"k"'),
  "no frame JSON leaked into the learner's stderr",
);

console.log("");
for (const m of ok) console.log(`  PASS  ${m}`);
for (const m of fail) console.log(`  FAIL  ${m}`);
console.log(`\n${ok.length} passed, ${fail.length} failed\n`);

process.exit(fail.length ? 1 : 0);
