/**
 * GATES C, D and E.
 *
 *   C — caps and resource exhaustion behave, and SAY they tripped
 *   D — judge isolation: the instrumented build never decides a verdict
 *   E — misattribution: a failure caused by OUR injection is never blamed on
 *       the learner
 *
 * 🛑 E is the one that would actively mislead someone. Everything else here
 * fails loudly; a misattributed error fails quietly and convincingly.
 *
 *   npm run verify:gates
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const { AZ_TRACE_HEADER, AZ_DEFAULTS, clampLimits, limitsPrelude } = await import(
  pathToFileURL(join(ROOT, "src/packages/dsa/src/trace/az-trace-header.ts")).href
);
const { planSplices, applyPlan } = await import(
  pathToFileURL(join(ROOT, "src/packages/dsa/src/trace/splice.ts")).href
);
const { parseTraceStream, classifyTrap } = await import(
  pathToFileURL(join(ROOT, "src/packages/dsa/src/trace/protocol.ts")).href
);
const { attributeTrace, unavailableMessage } = await import(
  pathToFileURL(join(ROOT, "src/packages/dsa/src/trace/attribute.ts")).href
);

const manifest = JSON.parse(readFileSync(join(ROOT, "public/toolchain/current.json"), "utf8"));
const base = join(ROOT, "public/toolchain", manifest.version);
const { runClang } = await import(pathToFileURL(join(base, "bundle.js")).href);
const wasi = await import(pathToFileURL(join(base, "wasi/index.js")).href);
const BITS = readFileSync(join(base, "stdc++.h"), "utf8");
const PCH = new Uint8Array(readFileSync(join(base, "stdcxx.pch")));

const CXX_FLAGS = ["-std=c++20", "-O2", "-fno-exceptions"];
/**
 * 🛑 Must match `LINK_FLAGS` in public/sandbox-worker.js. Without the explicit
 * stack size these gates test a configuration that does not ship — and the
 * default 64KB stack makes EVERY traced recursive program trap, which is the
 * exact failure GATE E exists to prevent.
 */
const MAX_MEMORY = 256 * 1024 * 1024;
const LINK_FLAGS = [`-Wl,-z,stack-size=${1024 * 1024}`, `-Wl,--max-memory=${MAX_MEMORY}`];
const td = new TextDecoder();

async function clang(src, { ast = false, extra = {} } = {}) {
  let stderr = "";
  let stdout = "";
  const files = { "t.cpp": src, "stdcxx.pch": PCH, bits: { "stdc++.h": BITS }, ...extra };
  const args = ast
    ? ["clang++", ...CXX_FLAGS, "-I.", "-include-pch", "stdcxx.pch",
       "-Xclang", "-ast-dump=json", "-fsyntax-only", "t.cpp"]
    : ["clang++", ...CXX_FLAGS, "-I.", "-include-pch", "stdcxx.pch", ...LINK_FLAGS, "t.cpp", "-o", "t.wasm"];
  try {
    const out = await runClang(args, files, {
      stdout: (b) => { if (b) stdout += td.decode(b); },
      stderr: (b) => { if (b) stderr += td.decode(b); },
    });
    return { ok: true, stdout, stderr, wasm: out?.["t.wasm"] };
  } catch (err) {
    return { ok: false, stdout, stderr: stderr || String(err) };
  }
}

async function runWasm(wasmBytes, stdinText = "") {
  const { WASI, File, OpenFile, ConsoleStdout, PreopenDirectory, Fd } = wasi;
  let stdout = "";
  let raw = "";
  const fds = [
    new OpenFile(new File(new TextEncoder().encode(stdinText))),
    ConsoleStdout.lineBuffered((l) => { stdout += `${l}\n`; }),
    new (class extends Fd {
      fd_write(data) {
        raw += td.decode(data, { stream: true });
        return { ret: 0, nwritten: data.byteLength };
      }
    })(),
    new PreopenDirectory(".", new Map()),
  ];
  const instance = new WASI(["t"], [], fds);
  const mod = await WebAssembly.compile(wasmBytes);
  const inst = await WebAssembly.instantiate(mod, { wasi_snapshot_preview1: instance.wasiImport });
  let exitCode = 0;
  let trap = "";
  let trapKind = "";
  try {
    instance.start(inst);
  } catch (err) {
    exitCode = typeof err?.code === "number" ? err.code : -1;
    if (exitCode === -1) {
      trap = err?.message ?? String(err);
      // Mirrors classifyTrapWithMemory in the worker: `unreachable` while
      // sitting against the memory ceiling is OOM, which the message alone
      // cannot tell you.
      const bytes = inst?.exports?.memory?.buffer?.byteLength ?? 0;
      trapKind =
        /unreachable/i.test(trap) && bytes >= MAX_MEMORY * 0.9
          ? "out_of_memory"
          : classifyTrap(trap);
    }
  }
  return { stdout, raw, exitCode, trap, trapKind };
}

/** Instrument a program end to end. Returns null when the AST is unusable. */
async function instrument(src, limits) {
  const dump = await clang(src, { ast: true });
  if (!dump.ok || !dump.stdout.trim()) return null;
  let ast;
  try {
    ast = JSON.parse(dump.stdout);
  } catch {
    return null;
  }
  const plan = planSplices(ast, src);
  return { plan, code: applyPlan(src, plan, limitsPrelude(limits, plan.sites)) };
}

const results = [];
const check = (name, cond, detail = "") =>
  results.push({ name, ok: Boolean(cond), detail });

const limits = clampLimits(AZ_DEFAULTS);

/* ============================================================== GATE C ==== */

console.log("\nGATE C — caps and resource exhaustion\n");

{
  // An infinite loop: caps must stop TRACING while the program keeps running.
  const src = `
#include <bits/stdc++.h>
using namespace std;
int main() {
    long long n = 0;
    for (long long i = 0; i < 2000000; ++i) { n += i; }
    cout << n << '\\n';
}`;
  const ins = await instrument(src, limits);
  const built = await clang(ins.code, { extra: { "az_trace.h": AZ_TRACE_HEADER } });
  const r = await runWasm(built.wasm);
  const p = parseTraceStream(r.raw);

  check("a 2,000,000-iteration loop still completes", r.exitCode === 0);
  check(
    "its stdout is correct despite the cap",
    r.stdout.trim() === "1999999000000",
    r.stdout.trim(),
  );
  check("a cap record is emitted", Boolean(p.capped), JSON.stringify(p.capped));
  check(
    "the cap is per-LOOP, not merely global",
    p.capped?.reason === "loop",
    `reason=${p.capped?.reason}`,
  );
  check(
    `frames stay within the step cap (${limits.maxSteps})`,
    p.frames.length <= limits.maxSteps + 2,
    `${p.frames.length} frames`,
  );
}

{
  // Code AFTER a hot loop must still be traced — the reason the cap is
  // per-site rather than one global budget.
  const src = `
#include <bits/stdc++.h>
using namespace std;
int main() {
    long long n = 0;
    for (long long i = 0; i < 100000; ++i) { n += i; }
    int after_the_loop = 7;
    cout << n << ' ' << after_the_loop << '\\n';
}`;
  const ins = await instrument(src, limits);
  const built = await clang(ins.code, { extra: { "az_trace.h": AZ_TRACE_HEADER } });
  const r = await runWasm(built.wasm);
  const p = parseTraceStream(r.raw);
  const tracedAfter = p.frames.some((f) => "after_the_loop" in f.vars);
  check("statements after a hot loop are still traced", tracedAfter);
}

{
  // Unbounded recursion: the depth guard must trip BEFORE the real stack dies,
  // so the learner gets a diagnosis instead of an opaque trap.
  const src = `
#include <bits/stdc++.h>
using namespace std;
long long deep(long long n) {
    if (n <= 0) return 0;
    return 1 + deep(n + 1);
}
int main() {
    cout << deep(1) << '\\n';
}`;
  const ins = await instrument(src, limits);
  const built = await clang(ins.code, { extra: { "az_trace.h": AZ_TRACE_HEADER } });
  const r = await runWasm(built.wasm);
  const p = parseTraceStream(r.raw);

  // 🛑 The depth guard must out-run the REAL stack, which it only does because
  // the link step sets an explicit 1MB stack. At the stock 64KB this assertion
  // failed: the stack died around depth ~300 traced, long before any cap.
  check(
    "unbounded recursion emits a depth cap, not just a trap",
    p.capped?.reason === "depth",
    `reason=${p.capped?.reason} trap=${r.trap.slice(0, 50)}`,
  );
  check(
    "the depth cap names the recursive function's line",
    typeof p.capped?.line === "number" && p.capped.line > 0,
    `line=${p.capped?.line}`,
  );
  if (r.trap) {
    check(
      "and if it still traps, the trap is classified rather than opaque",
      r.trapKind !== "unknown",
      `${r.trapKind}: ${r.trap.slice(0, 50)}`,
    );
  }
}

{
  // Allocation in a loop. OOM is NOT identifiable from the trap text under
  // -fno-exceptions (a failed new aborts -> "unreachable"), so it is identified
  // by memory pressure instead. This asserts the measurement, not a guess.
  const src = `
#include <bits/stdc++.h>
using namespace std;
int main() {
    vector<vector<long long>> hog;
    for (int i = 0; i < 100000; ++i) hog.push_back(vector<long long>(200000, i));
    cout << hog.size() << '\\n';
}`;
  const built = await clang(src);
  const r = await runWasm(built.wasm);
  check(
    "allocation in a loop is classified out_of_memory, not a mystery trap",
    r.trapKind === "out_of_memory",
    `${r.trapKind} / ${r.trap.slice(0, 40)}`,
  );
}

{
  // Each remaining trap class, so none of them reaches a learner unexplained.
  const cases = [
    {
      name: "an out-of-bounds write",
      want: "out_of_bounds",
      src: `#include <bits/stdc++.h>
int main() { std::vector<int> v(4); int* p = v.data(); for (long i = 0; i < 1000000000L; ++i) p[i] = 1; std::cout << v[0]; }`,
    },
    {
      name: "a divide by zero",
      want: "divide_by_zero",
      src: `#include <bits/stdc++.h>
int main() { int n = 0; std::cin >> n; std::cout << (7 / n); }`,
    },
  ];
  for (const c of cases) {
    const built = await clang(c.src);
    const r = await runWasm(built.wasm, "0\n");
    check(`${c.name} is classified`, r.trapKind === c.want, `got ${r.trapKind} (${r.trap.slice(0, 40)})`);
  }
}

{
  // A per-problem override must observably move the cap, and the hard ceiling
  // must hold against a hostile value.
  const tight = clampLimits({ ...AZ_DEFAULTS, maxLoopIterations: 3 });
  const src = `
#include <bits/stdc++.h>
using namespace std;
int main() {
    int total = 0;
    for (int i = 0; i < 50; ++i) { total += i; }
    cout << total << '\\n';
}`;
  const insDefault = await instrument(src, limits);
  const insTight = await instrument(src, tight);
  const bDefault = await clang(insDefault.code, { extra: { "az_trace.h": AZ_TRACE_HEADER } });
  const bTight = await clang(insTight.code, { extra: { "az_trace.h": AZ_TRACE_HEADER } });
  const rDefault = parseTraceStream((await runWasm(bDefault.wasm)).raw);
  const rTight = parseTraceStream((await runWasm(bTight.wasm)).raw);

  check(
    "a per-problem vizLimits override observably changes the cap",
    rTight.frames.length < rDefault.frames.length,
    `${rTight.frames.length} frames at maxLoopIterations=3 vs ${rDefault.frames.length} at ${limits.maxLoopIterations}`,
  );
  check(
    "and the capped run still prints the correct answer",
    (await runWasm(bTight.wasm)).stdout.trim() === "1225",
  );

  const hostile = clampLimits({ maxSteps: 10_000_000, maxLoopIterations: 99999, maxDepth: 10_000_000, maxElements: 999999 });
  check(
    "clampLimits refuses values beyond the hard ceiling",
    hostile.maxSteps <= 5000 && hostile.maxLoopIterations <= 200 && hostile.maxDepth <= 10000 && hostile.maxElements <= 2000,
    JSON.stringify(hostile),
  );
  // 🛑 The depth ceiling must stay inside what a TRACED build survives.
  // Measured: >12,000 traced frames at a 1MB stack. A ceiling above that would
  // reintroduce the misattribution bug for anyone who raised the limit.
  check(
    "the depth ceiling stays below the measured traced-stack limit",
    hostile.maxDepth <= 12000,
    `ceiling=${hostile.maxDepth}, measured traced survival >12000`,
  );
}

{
  // A large container must be elided rather than dumped whole.
  const src = `
#include <bits/stdc++.h>
using namespace std;
int main() {
    vector<int> big(5000, 7);
    cout << big.size() << '\\n';
}`;
  const ins = await instrument(src, limits);
  const built = await clang(ins.code, { extra: { "az_trace.h": AZ_TRACE_HEADER } });
  const r = await runWasm(built.wasm);
  const p = parseTraceStream(r.raw);
  const withBig = p.frames.find((f) => Array.isArray(f.vars.big));
  const len = Array.isArray(withBig?.vars.big) ? withBig.vars.big.length : 0;
  check(
    `a 5000-element vector is elided to <= ${limits.maxElements + 1}`,
    len > 0 && len <= limits.maxElements + 1,
    `${len} entries`,
  );
  // The marker is an actual ellipsis in the parsed value. Asserting on the
  // ESCAPE (…) would be testing the wire format, which JSON.parse has
  // already decoded by the time a frame reaches us.
  const last = Array.isArray(withBig?.vars.big) ? withBig.vars.big.at(-1) : undefined;
  check("the elision is reported, not silent", last === "…", JSON.stringify(last));
}

/* ============================================================== GATE D ==== */

console.log("\nGATE D — judge isolation\n");

{
  const src = `
#include <bits/stdc++.h>
using namespace std;
int main() {
    int n, target;
    cin >> n >> target;
    vector<long long> a(n);
    for (long long& x : a) cin >> x;
    for (int i = 0; i < n; ++i)
        for (int j = i + 1; j < n; ++j)
            if (a[i] + a[j] == target) { cout << i << ' ' << j << '\\n'; return 0; }
    cout << "-1\\n";
}`;
  const stdin = "4 9\n2 7 11 15\n";

  const plain = await clang(src);
  const plainRun = await runWasm(plain.wasm, stdin);

  const ins = await instrument(src, limits);
  const built = await clang(ins.code, { extra: { "az_trace.h": AZ_TRACE_HEADER } });
  const tracedRun = await runWasm(built.wasm, stdin);

  check(
    "instrumented stdout is byte-identical to the original",
    tracedRun.stdout === plainRun.stdout,
    `${JSON.stringify(plainRun.stdout)} vs ${JSON.stringify(tracedRun.stdout)}`,
  );
  check("and it is the right answer", plainRun.stdout.trim() === "0 1");

  // The judge hashes stdout. Identical stdout means an identical verdict.
  const { createHash } = await import("node:crypto");
  const norm = (s) => s.replace(/[ \t]+$/gm, "").trimEnd();
  const h = (s) => createHash("sha256").update(norm(s)).digest("hex");
  check(
    "the verdict hash is identical, so a trace cannot change a grade",
    h(plainRun.stdout) === h(tracedRun.stdout),
  );

  // And the worker keeps them on separate commands.
  const worker = readFileSync(join(ROOT, "public/sandbox-worker.js"), "utf8");
  check(
    "cmd:run still uses the uninstrumented compile/run path",
    /if \(cmd === "run"\)[\s\S]*?await compile\(source\)[\s\S]*?await run\(c\.wasm, stdin\)/.test(worker),
  );
  check(
    "cmd:trace compiles through a SEPARATE function",
    /if \(cmd === "trace"\)[\s\S]*?await compileTraced\(source\)/.test(worker),
  );
  // The trace reply rides the same "result" channel, so the only thing
  // stopping a traced stdout from being hashed is the flag plus the guard
  // that reads it. Assert BOTH halves — either alone is useless.
  check(
    "a traced result is flagged as such by the worker",
    /if \(cmd === "trace"\)[\s\S]*?traced: true/.test(worker),
  );
  const bench = readFileSync(join(ROOT, "src/components/course/ProblemWorkbench.tsx"), "utf8");
  check(
    "and the judging path ignores a traced result instead of hashing it",
    /if \(d\.traced\) return;/.test(bench),
  );
  check(
    "the judging path refuses truncated output before resolving",
    bench.indexOf("if (d.truncated)") < bench.indexOf("resolve({ stdout"),
  );
}

/* ============================================================== GATE E ==== */

console.log("\nGATE E — misattribution\n");

{
  // The learner's code is BROKEN. Ground truth must come from the original
  // compile, and instrumentation must never be attempted or blamed.
  const src = `
#include <bits/stdc++.h>
using namespace std;
int main() {
    int x = ;
    cout << x;
}`;
  const plain = await clang(src);
  check(
    "a genuinely broken program fails the ORIGINAL compile",
    !plain.ok || !plain.wasm,
  );
  check(
    "and its diagnostics name the learner's own line, not ours",
    /t\.cpp:5/.test(plain.stderr) && !/az_trace|__az/.test(plain.stderr),
    plain.stderr.split("\n")[0]?.slice(0, 80),
  );
}

{
  // Same broken program, through the real attribution function.
  const src = `
#include <bits/stdc++.h>
using namespace std;
int main() {
    int x = ;
    cout << x;
}`;
  const plain = await clang(src);
  const a = attributeTrace({
    original: { compiled: false, diagnostics: plain.stderr },
    // Even if something upstream wrongly handed us an instrumented result,
    // Tier 0 must win.
    instrumented: { compiled: false, diagnostics: "SPLICE BUG TELEMETRY" },
  });
  check("a broken program is attributed to the learner", a.kind === "learner-compile-error", a.kind);
  check(
    "and it shows the ORIGINAL diagnostics, never the instrumented ones",
    a.kind === "learner-compile-error" &&
      a.diagnostics.includes("expected expression") &&
      !a.diagnostics.includes("SPLICE BUG"),
  );
}

{
  // 🛑 THE case the plan singles out: valid code where OUR injection breaks the
  // build. Sabotage the spliced source for real (not inside a comment, which is
  // how a first version of this test fooled itself into passing).
  const src = `
#include <bits/stdc++.h>
using namespace std;
int main() {
    int ok = 1;
    cout << ok << '\\n';
}`;
  const plain = await clang(src);
  const plainRun = await runWasm(plain.wasm);
  const ins = await instrument(src, limits);
  const sabotaged = ins.code.replace("int ok = 1;", "int ok = 1; __az::not_a_function();");
  const broken = await clang(sabotaged, { extra: { "az_trace.h": AZ_TRACE_HEADER } });

  check(
    "the original still compiles when the instrumented build does not",
    plain.ok && !broken.ok,
    `original=${plain.ok} instrumented=${broken.ok}`,
  );

  const a = attributeTrace({
    original: { compiled: true, diagnostics: "", stdout: plainRun.stdout, exitCode: 0 },
    instrumented: { compiled: false, diagnostics: broken.stderr },
  });
  check(
    "a splice failure is attributed to US, not the learner",
    a.kind === "unavailable" && a.reason === "instrumented-compile-failed",
    `${a.kind}/${a.reason ?? ""}`,
  );
  check(
    "its learner-facing message blames the tracer, not their code",
    a.kind === "unavailable" &&
      /limitation of the tracer|isn’t available/.test(unavailableMessage(a.reason)) &&
      !/your (code|program) is (wrong|broken)/i.test(unavailableMessage(a.reason)),
  );
  check(
    "the instrumented diagnostics are kept as telemetry, not shown",
    a.kind === "unavailable" && a.telemetry.length > 0 && !unavailableMessage(a.reason).includes("az"),
  );
}

{
  // The stack variant, with a REAL run: deep-but-valid recursion that survives
  // uninstrumented and dies once our frames are added. maxDepth is raised so
  // the guard cannot pre-empt it — that is the whole point of the case.
  const deepLimits = clampLimits({ ...AZ_DEFAULTS, maxDepth: 10000, maxSteps: 5000 });
  const src = `
#include <bits/stdc++.h>
using namespace std;
long long sum_to(long long n) {
    if (n == 0) return 0;
    return n + sum_to(n - 1);
}
int main() {
    cout << sum_to(60000) << '\\n';
}`;
  const plain = await clang(src);
  const plainRun = await runWasm(plain.wasm);
  const ins = await instrument(src, deepLimits);
  const built = await clang(ins.code, { extra: { "az_trace.h": AZ_TRACE_HEADER } });
  const tracedRun = await runWasm(built.wasm);

  const a = attributeTrace({
    original: {
      compiled: true,
      diagnostics: "",
      stdout: plainRun.stdout,
      exitCode: plainRun.exitCode,
      trap: plainRun.trap,
    },
    instrumented: {
      compiled: true,
      diagnostics: "",
      stdout: tracedRun.stdout,
      exitCode: tracedRun.exitCode,
      trap: tracedRun.trap,
      frames: parseTraceStream(tracedRun.raw).frames,
    },
  });

  // Report what actually happened rather than asserting a particular depth
  // survives — that is a property of the toolchain's stack size, not of us.
  const label = `original exit=${plainRun.exitCode}, traced exit=${tracedRun.exitCode}`;
  if (plainRun.exitCode === 0 && tracedRun.exitCode === -1) {
    check(
      "trapping ONLY when instrumented reports step-through unavailable",
      a.kind === "unavailable" && a.reason === "instrumented-trapped",
      `${a.kind}/${a.reason ?? ""} — ${label}`,
    );
    check(
      "and never a learner error",
      a.kind !== "learner-trap" && a.kind !== "learner-compile-error",
    );
  } else {
    // Still assert the rule, via the attribution function directly, so this
    // case is covered even on a toolchain whose stack is too generous to fail.
    const synthetic = attributeTrace({
      original: { compiled: true, diagnostics: "", stdout: "x\n", exitCode: 0 },
      instrumented: {
        compiled: true,
        diagnostics: "",
        exitCode: -1,
        trap: "Maximum call stack size exceeded",
      },
    });
    check(
      `trap-only-when-instrumented is attributed to us (synthetic; real run did not diverge — ${label})`,
      synthetic.kind === "unavailable" && synthetic.reason === "instrumented-trapped",
      `${synthetic.kind}/${synthetic.reason ?? ""}`,
    );
  }

  // Both trapping IS the learner's bug, and must be reported as such — the
  // mirror case, without which the rule above would just be "never blame them".
  const bothTrapped = attributeTrace({
    original: { compiled: true, diagnostics: "", exitCode: -1, trap: "Maximum call stack size exceeded" },
    instrumented: { compiled: true, diagnostics: "", exitCode: -1, trap: "Maximum call stack size exceeded", frames: [] },
  });
  check(
    "a trap present in BOTH builds is correctly reported as the learner's",
    bothTrapped.kind === "learner-trap" && bothTrapped.trap === "stack_overflow",
    `${bothTrapped.kind}/${bothTrapped.trap ?? ""}`,
  );

  // And a diverged stdout is ours, even though the judge never reads it.
  const diverged = attributeTrace({
    original: { compiled: true, diagnostics: "", stdout: "42\n", exitCode: 0 },
    instrumented: { compiled: true, diagnostics: "", stdout: "41\n", exitCode: 0, frames: [] },
  });
  check(
    "a diverged stdout is attributed to us and the trace discarded",
    diverged.kind === "unavailable" && diverged.reason === "instrumented-diverged",
    `${diverged.kind}/${diverged.reason ?? ""}`,
  );
}

/* ----------------------------------------------------------------- report */

console.log("");
let failed = 0;
for (const r of results) {
  if (r.ok) console.log(`  PASS  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
  else {
    failed++;
    console.log(`  FAIL  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
  }
}
console.log(`\n  ${results.length - failed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
