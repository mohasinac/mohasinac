/**
 * GATE A — the golden test for the whole tracer.
 *
 * For each program: dump its AST, plan the splices, apply them, compile BOTH
 * the original and the instrumented copy, run both on the same input, and
 * assert the instrumented one's **stdout is byte-identical**.
 *
 * 🛑 One assertion covers the two things that matter. It catches an injection
 * that breaks the build, and an injection that silently changes behaviour — and
 * behaviour change is the failure that would make the whole feature unsafe,
 * because a trace of a program that no longer does what the learner wrote
 * teaches the wrong thing.
 *
 *   npm run verify:splice            # the adversarial catalogue
 *   npm run verify:splice -- --corpus  # plus all 53 editorial programs
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WITH_CORPUS = process.argv.includes("--corpus");

const { AZ_TRACE_HEADER, AZ_DEFAULTS, clampLimits, limitsPrelude } = await import(
  pathToFileURL(join(ROOT, "src/packages/dsa/src/trace/az-trace-header.ts")).href
);
const { planSplices, applyPlan } = await import(
  pathToFileURL(join(ROOT, "src/packages/dsa/src/trace/splice.ts")).href
);
const { parseTraceStream } = await import(
  pathToFileURL(join(ROOT, "src/packages/dsa/src/trace/protocol.ts")).href
);

const manifest = JSON.parse(readFileSync(join(ROOT, "public/toolchain/current.json"), "utf8"));
const base = join(ROOT, "public/toolchain", manifest.version);
const { runClang } = await import(pathToFileURL(join(base, "bundle.js")).href);
const wasi = await import(pathToFileURL(join(base, "wasi/index.js")).href);
const BITS = readFileSync(join(base, "stdc++.h"), "utf8");
const PCH = new Uint8Array(readFileSync(join(base, "stdcxx.pch")));

const CXX_FLAGS = ["-std=c++20", "-O2", "-fno-exceptions"];
const td = new TextDecoder();

/** Compile, optionally emitting an AST dump on stdout instead of wasm. */
async function clang(src, { ast = false, extraFiles = {} } = {}) {
  let stderr = "";
  let stdout = "";
  const files = { "t.cpp": src, "stdcxx.pch": PCH, bits: { "stdc++.h": BITS }, ...extraFiles };
  const args = ast
    ? ["clang++", ...CXX_FLAGS, "-I.", "-include-pch", "stdcxx.pch",
       "-Xclang", "-ast-dump=json", "-fsyntax-only", "t.cpp"]
    : ["clang++", ...CXX_FLAGS, "-I.", "-include-pch", "stdcxx.pch", "t.cpp", "-o", "t.wasm"];
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

/** Run wasm, splitting the trace channel from the program's own output. */
async function runWasm(wasmBytes, stdinText) {
  const { WASI, File, OpenFile, ConsoleStdout, PreopenDirectory, Fd } = wasi;
  let stdout = "";
  let raw = "";
  const fds = [
    new OpenFile(new File(new TextEncoder().encode(stdinText ?? ""))),
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
  try {
    instance.start(inst);
  } catch (err) {
    exitCode = typeof err?.code === "number" ? err.code : -1;
    if (exitCode === -1) trap = err?.message ?? String(err);
  }
  return { stdout, raw, exitCode, trap };
}

/*
 * The adversarial catalogue.
 *
 * 🛑 The 53 editorial programs are all written in one house style, so they
 * exercise almost none of these. A construct catalogue is the only way to know
 * the planner handles real C++ rather than the subset I happened to write.
 */
const CASES = [
  { name: "literals containing braces and semicolons", stdin: "", src: `
#include <bits/stdc++.h>
using namespace std;
int main() {
    string a = "has ; and { and } and // and /* inside";
    char semi = ';';
    char brace = '{';
    char esc = '\\\\';
    string raw = R"(raw ) string; with { braces } and "quotes")";
    cout << a.size() << ' ' << semi << brace << esc << ' ' << raw.size() << '\\n';
}` },

  { name: "comment containing an unmatched quote", stdin: "", src: `
#include <bits/stdc++.h>
using namespace std;
int main() {
    // it's a comment with an apostrophe and a ; and a {
    /* block ; with { and " inside */
    int x = 1;
    cout << x << '\\n';
}` },

  { name: "braceless if/else and dangling else", stdin: "", src: `
#include <bits/stdc++.h>
using namespace std;
int main() {
    int x = 3;
    if (x > 2) cout << "big";
    else cout << "small";
    cout << '\\n';
    if (x > 1) if (x > 5) cout << "a\\n"; else cout << "b\\n";
}` },

  { name: "braceless for and while bodies", stdin: "", src: `
#include <bits/stdc++.h>
using namespace std;
int main() {
    int sum = 0;
    for (int i = 0; i < 5; ++i) sum += i;
    int k = 3;
    while (k > 0) --k;
    cout << sum << ' ' << k << '\\n';
}` },

  { name: "multiple declarators on one line", stdin: "", src: `
#include <bits/stdc++.h>
using namespace std;
int main() {
    int lo = 0, hi = 9, mid = 4;
    cout << lo << hi << mid << '\\n';
}` },

  { name: "range-for by reference and with structured bindings", stdin: "", src: `
#include <bits/stdc++.h>
using namespace std;
int main() {
    vector<int> a{1, 2, 3};
    int sum = 0;
    for (int& x : a) sum += x;
    map<string, int> m{{"k", 7}};
    int got = 0;
    for (auto& [key, val] : m) got += val;
    cout << sum << ' ' << got << '\\n';
}` },

  { name: "auto destructuring from a pair", stdin: "", src: `
#include <bits/stdc++.h>
using namespace std;
int main() {
    auto [a, b] = make_pair(3, string("zz"));
    cout << a << b << '\\n';
}` },

  { name: "lambda with statements, and an IIFE", stdin: "", src: `
#include <bits/stdc++.h>
using namespace std;
int main() {
    int total = 0;
    auto add = [&](int v) { total += v; return total; };
    add(2);
    add(3);
    int once = [](int v) { int d = v * 2; return d; }(5);
    cout << total << ' ' << once << '\\n';
}` },

  { name: "nested templates closing with >> and operator< ambiguity", stdin: "", src: `
#include <bits/stdc++.h>
using namespace std;
int main() {
    vector<vector<int>> grid{{1, 2}, {3}};
    int t1 = 1, t2 = 2;
    bool less_than = t1 < t2;
    cout << grid.size() << ' ' << less_than << '\\n';
}` },

  { name: "switch with fallthrough, do-while, ternary, comma operator", stdin: "", src: `
#include <bits/stdc++.h>
using namespace std;
int main() {
    int x = 2, out = 0;
    switch (x) {
      case 1: out += 1;
      case 2: out += 2;
      default: out += 10;
    }
    int k = 2;
    do { --k; } while (k > 0);
    int tern = x > 1 ? 0 : 1;
    int comma = (x++, x);
    cout << out << ' ' << k << ' ' << tern << ' ' << comma << '\\n';
}` },

  { name: "a macro expanding to a statement", stdin: "", src: `
#include <bits/stdc++.h>
using namespace std;
#define REP(i, n) for (int i = 0; i < (n); ++i)
#define ADD(a, b) ((a) + (b))
int main() {
    int sum = 0;
    REP(i, 4) { sum = ADD(sum, i); }
    cout << sum << '\\n';
}` },

  { name: "multiple statements crammed on one line", stdin: "", src: `
#include <bits/stdc++.h>
using namespace std;
int main() {
    int a = 1; int b = 2; a += b; cout << a << '\\n';
}` },

  { name: "a statement spanning several lines", stdin: "", src: `
#include <bits/stdc++.h>
using namespace std;
int main() {
    int total =
        1 +
        2 +
        3;
    cout << total << '\\n';
}` },

  { name: "a user function called recursively", stdin: "", src: `
#include <bits/stdc++.h>
using namespace std;
int fib(int n) {
    if (n <= 1) return n;
    return fib(n - 1) + fib(n - 2);
}
int main() {
    cout << fib(10) << '\\n';
}` },

  { name: "a user struct, excluded from watches but not from stepping", stdin: "", src: `
#include <bits/stdc++.h>
using namespace std;
struct P { int x; int y; };
int main() {
    P p{1, 2};
    int s = p.x + p.y;
    cout << s << '\\n';
}` },

  { name: "reading stdin, so instrumentation must not disturb it", stdin: "3\\n10 20 30\\n", src: `
#include <bits/stdc++.h>
using namespace std;
int main() {
    int n;
    cin >> n;
    vector<long long> a(n);
    for (long long& x : a) cin >> x;
    long long sum = 0;
    for (long long x : a) sum += x;
    cout << sum << '\\n';
}` },

  { name: "the learner's own cerr output must survive", stdin: "", src: `
#include <bits/stdc++.h>
using namespace std;
int main() {
    int x = 5;
    cerr << "debug x=" << x;
    cout << x * 2 << '\\n';
    cerr << " more\\n";
}` },
];

if (WITH_CORPUS) {
  const dir = join(ROOT, "content/problems");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    for (const p of JSON.parse(readFileSync(join(dir, file), "utf8"))) {
      const fences = [...String(p.editorial ?? "").matchAll(/```cpp\n([\s\S]*?)```/g)].map((m) => m[1]);
      const complete = fences.filter((c) => /int\s+main\s*\(/.test(c));
      const program = complete[complete.length - 1];
      if (!program) continue;
      const sample = (p.testCases ?? []).find((c) => c.visibility === "sample");
      CASES.push({ name: `corpus: ${p.slug}`, src: program, stdin: sample?.input ?? "" });
    }
  }
}

/* --------------------------------------------------------------------- run */

const limits = clampLimits(AZ_DEFAULTS);
let pass = 0;
const failures = [];
let totalStatements = 0;
let totalInstrumented = 0;
let totalSkipped = 0;

console.log(`\nGATE A — ${CASES.length} program(s)\n`);

for (const c of CASES) {
  const label = c.name.padEnd(56).slice(0, 56);
  const stdin = c.stdin.replace(/\\n/g, "\n");

  // Tier 0: ground truth. If the ORIGINAL does not compile, the case itself is
  // broken and nothing can be concluded about our injection.
  const base0 = await clang(c.src);
  if (!base0.ok || !base0.wasm) {
    failures.push(`${c.name}: the ORIGINAL does not compile — bad fixture\n${base0.stderr.slice(0, 300)}`);
    console.log(`  SKIP  ${label}  original does not compile`);
    continue;
  }
  const expected = await runWasm(base0.wasm, stdin);

  const dump = await clang(c.src, { ast: true });
  if (!dump.ok || !dump.stdout.trim()) {
    failures.push(`${c.name}: AST dump failed\n${dump.stderr.slice(0, 300)}`);
    console.log(`  FAIL  ${label}  ast dump failed`);
    continue;
  }

  let ast;
  try {
    ast = JSON.parse(dump.stdout);
  } catch (err) {
    failures.push(`${c.name}: AST JSON did not parse (${String(err).slice(0, 120)})`);
    console.log(`  FAIL  ${label}  ast json unparseable`);
    continue;
  }

  const plan = planSplices(ast, c.src);
  totalStatements += plan.statementsFound;
  totalInstrumented += plan.points.length;
  totalSkipped += plan.skipped.length;

  const instrumented = applyPlan(c.src, plan, limitsPrelude(limits, plan.sites));
  const built = await clang(instrumented, { extraFiles: { "az_trace.h": AZ_TRACE_HEADER } });

  if (!built.ok || !built.wasm) {
    // 🛑 OUR bug: their code compiles, ours does not. Never shown to a learner.
    failures.push(
      `${c.name}: INSTRUMENTED build failed while the original succeeded\n${built.stderr.slice(0, 600)}`,
    );
    console.log(`  FAIL  ${label}  instrumented build failed`);
    continue;
  }

  const actual = await runWasm(built.wasm, stdin);
  const parsed = parseTraceStream(actual.raw);

  if (actual.stdout !== expected.stdout) {
    failures.push(
      `${c.name}: stdout CHANGED\n  expected ${JSON.stringify(expected.stdout)}\n  actual   ${JSON.stringify(actual.stdout)}`,
    );
    console.log(`  FAIL  ${label}  stdout differs`);
    continue;
  }
  if (actual.exitCode !== expected.exitCode) {
    failures.push(`${c.name}: exit code ${actual.exitCode} vs ${expected.exitCode}`);
    console.log(`  FAIL  ${label}  exit code differs`);
    continue;
  }
  if (parsed.malformed > 0) {
    failures.push(`${c.name}: ${parsed.malformed} malformed trace record(s)`);
    console.log(`  FAIL  ${label}  malformed records`);
    continue;
  }

  pass++;
  console.log(
    `  PASS  ${label}  ${String(parsed.frames.length).padStart(4)} frames, ` +
      `${plan.points.length}/${plan.statementsFound} stmts` +
      (plan.skipped.length ? `, ${plan.skipped.length} skipped` : ""),
  );
}

console.log(`\n  ${pass} passed, ${failures.length} failed`);
if (totalStatements > 0) {
  const pct = Math.round((totalInstrumented / totalStatements) * 100);
  console.log(`  coverage: ${totalInstrumented}/${totalStatements} statements (${pct}%), ${totalSkipped} skipped`);
}

if (failures.length) {
  console.log("\nFAILURES\n");
  for (const f of failures) console.log(`${f}\n`);
  process.exit(1);
}
console.log("\nEvery instrumented program produced byte-identical stdout.\n");
