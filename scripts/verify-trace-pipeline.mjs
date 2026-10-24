/**
 * The trace pipeline, against a MOCK worker.
 *
 * Gates C/D/E prove the C++ and the attribution function. This proves the
 * glue — the part where a wrong `await` order or a swallowed reply would
 * quietly undo the guarantee. A mock worker means every outcome (including the
 * ones that are hard to provoke for real, like a timeout) is reachable.
 *
 * 🛑 The assertion that matters: the learner's diagnostics are the ORIGINAL
 * compile's, and the instrumented compile's never reach them.
 *
 *   npm run verify:trace-pipeline
 */
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { runTrace } = await import(pathToFileURL(join(ROOT, "src/lib/trace-run.ts")).href);
const { unavailableMessage } = await import(
  pathToFileURL(join(ROOT, "src/packages/dsa/src/trace/attribute.ts")).href
);

const results = [];
const check = (name, cond, detail = "") => results.push({ name, ok: Boolean(cond), detail });

/**
 * A worker stub. `handlers` maps a cmd to a reply (or a function of the
 * message). `calls` records the command order, which is the thing under test.
 */
function mockWorker(handlers) {
  const listeners = new Set();
  const calls = [];
  return {
    calls,
    addEventListener: (_t, fn) => listeners.add(fn),
    removeEventListener: (_t, fn) => listeners.delete(fn),
    postMessage(msg) {
      calls.push(msg.cmd);
      const h = handlers[msg.cmd];
      const reply = typeof h === "function" ? h(msg) : h;
      if (reply === undefined) return; // never answers — exercises the timeout
      // Asynchronous, like a real worker, so a pipeline that assumed a
      // synchronous reply would fail here.
      queueMicrotask(() => {
        for (const chunk of reply.chunks ?? []) {
          for (const fn of listeners) fn({ data: { type: "traceChunk", id: msg.id, raw: chunk } });
        }
        for (const fn of listeners) fn({ data: { type: "result", id: msg.id, ...reply.result } });
      });
    },
  };
}

const SOURCE = "#include <bits/stdc++.h>\nint main() { int x = 1; std::cout << x; }\n";

/** A minimal AST whose only statement is the `int x = 1;` DeclStmt. */
const astFor = (src) => {
  const declOffset = src.indexOf("int x = 1;");
  const bodyOffset = src.indexOf("{", src.indexOf("main"));
  return JSON.stringify({
    kind: "TranslationUnitDecl",
    inner: [
      {
        kind: "FunctionDecl",
        name: "main",
        inner: [
          {
            kind: "CompoundStmt",
            range: { begin: { offset: bodyOffset }, end: { offset: src.length - 2 } },
            inner: [
              {
                kind: "DeclStmt",
                range: { begin: { offset: declOffset }, end: { offset: declOffset + 9 } },
                inner: [{ kind: "VarDecl", name: "x", type: { qualType: "int" } }],
              },
            ],
          },
        ],
      },
    ],
  });
};

/**
 * 🛑 The REAL wire format: 0x01 on BOTH ends, then the newline that flushes
 * whatever line the emitter interrupted, and `reason` (not `r`) on a cap.
 *
 * A first version of this file invented its own format and so tested a
 * protocol that does not exist. A mock of a wire format is only worth having
 * if it matches the wire.
 */
const SOH = "";
const frame = (line, vars) =>
  `${SOH}${JSON.stringify({ k: "f", s: 1, l: line, d: 0, v: vars })}${SOH}
`;
const capRecord = (reason, line) =>
  `${SOH}${JSON.stringify({ k: "cap", reason, l: line })}${SOH}
`;

let nextId = 0;
const ids = () => ++nextId;

/* ---------------------------------------------- the learner's code is broken */
{
  const worker = mockWorker({
    run: { result: { ok: false, compilerStderr: "sol.cpp:2:14: error: expected ';'" } },
    ast: { result: { ok: true, ast: "SHOULD NOT BE CALLED" } },
    trace: { result: { ok: false, compilerStderr: "AZ SPLICE NOISE" } },
  });
  const r = await runTrace({ worker, source: SOURCE, stdin: "", nextId: ids });

  check("a broken original is attributed to the learner", r.attribution.kind === "learner-compile-error", r.attribution.kind);
  check(
    "and shows THEIR diagnostics, never the splice noise",
    r.attribution.diagnostics?.includes("expected ';'") &&
      !r.attribution.diagnostics?.includes("AZ SPLICE NOISE"),
  );
  // 🛑 The strongest form of the guarantee: instrumentation is not merely
  // ignored on failure, it is never ATTEMPTED. Tier 0 short-circuits.
  check(
    "instrumentation is never attempted at all",
    worker.calls.length === 1 && worker.calls[0] === "run",
    worker.calls.join(" -> "),
  );
}

/* ------------------------------------------------------- the happy path */
{
  const instrumentedSeen = [];
  const worker = mockWorker({
    run: { result: { ok: true, stdout: "1", exitCode: 0 } },
    ast: (m) => ({ result: { ok: true, ast: astFor(m.source) } }),
    trace: (m) => {
      instrumentedSeen.push(m.source);
      return {
        chunks: [frame(2, { x: 1 })],
        result: { ok: true, stdout: "1", exitCode: 0 },
      };
    },
  });
  const r = await runTrace({ worker, source: SOURCE, stdin: "", nextId: ids });

  check("the happy path yields a usable trace", r.attribution.kind === "ok", r.attribution.kind);
  check("with the frames parsed out of the stream", (r.trace?.frames.length ?? 0) === 1, `${r.trace?.frames.length} frames`);
  check(
    "ground truth is fetched BEFORE the ast and the trace",
    worker.calls.join(",") === "run,ast,trace",
    worker.calls.join(","),
  );
  check(
    "the trace carries the ORIGINAL source for the code pane",
    r.trace?.source === SOURCE,
  );
  // 🛑 If the instrumented text were shown, every line number in the code pane
  // would point at the wrong line.
  check(
    "the instrumented text is sent to the compiler but never shown",
    (instrumentedSeen[0] ?? "").includes("__az::") && !(r.trace?.source ?? "").includes("__az::"),
  );
  check("coverage is reported, not implied", Boolean(r.trace?.coverage), JSON.stringify(r.trace?.coverage));
}

/* -------------------------------- our splice breaks a program that compiled */
{
  const worker = mockWorker({
    run: { result: { ok: true, stdout: "1", exitCode: 0 } },
    ast: (m) => ({ result: { ok: true, ast: astFor(m.source) } }),
    trace: { result: { ok: false, compilerStderr: "az_trace.h:1: error: our bug" } },
  });
  const r = await runTrace({ worker, source: SOURCE, stdin: "", nextId: ids });

  check(
    "a splice failure reports step-through unavailable",
    r.attribution.kind === "unavailable" && r.attribution.reason === "instrumented-compile-failed",
    `${r.attribution.kind}/${r.attribution.reason ?? ""}`,
  );
  check(
    "the message does not blame the learner",
    !/your code is (wrong|broken)/i.test(unavailableMessage(r.attribution.reason)),
  );
  check("their own stdout still survives for display", r.stdout === "1", JSON.stringify(r.stdout));
}

/* --------------------------------------------- an unusable AST is our problem */
{
  const worker = mockWorker({
    run: { result: { ok: true, stdout: "1", exitCode: 0 } },
    ast: { result: { ok: true, ast: "{ not json" } },
    trace: { result: { ok: true, stdout: "1" } },
  });
  const r = await runTrace({ worker, source: SOURCE, stdin: "", nextId: ids });
  check(
    "an unparseable AST is attributed to us, and tracing stops",
    r.attribution.kind === "unavailable",
    `${r.attribution.kind}/${r.attribution.reason ?? ""}`,
  );
  check("and the instrumented run is not attempted", !worker.calls.includes("trace"), worker.calls.join(","));
}

/* ----------------------------- the traced run diverges — discard the trace */
{
  const worker = mockWorker({
    run: { result: { ok: true, stdout: "1", exitCode: 0 } },
    ast: (m) => ({ result: { ok: true, ast: astFor(m.source) } }),
    trace: {
      chunks: [frame(2, { x: 1 })],
      // Different stdout: the splice changed observable behaviour.
      result: { ok: true, stdout: "999", exitCode: 0 },
    },
  });
  const r = await runTrace({ worker, source: SOURCE, stdin: "", nextId: ids });
  check(
    "a diverged traced stdout discards the trace",
    r.attribution.kind === "unavailable" && r.attribution.reason === "instrumented-diverged",
    `${r.attribution.kind}/${r.attribution.reason ?? ""}`,
  );
  check("and no frames are handed to the player", r.trace === undefined);
}

/* ------------------------- trapped only when instrumented: never their bug */
{
  const worker = mockWorker({
    run: { result: { ok: true, stdout: "1", exitCode: 0 } },
    ast: (m) => ({ result: { ok: true, ast: astFor(m.source) } }),
    trace: {
      chunks: [frame(2, { x: 1 })],
      result: { ok: true, stdout: "", exitCode: -1, trap: "Maximum call stack size exceeded" },
    },
  });
  const r = await runTrace({ worker, source: SOURCE, stdin: "", nextId: ids });
  check(
    "a trap only under instrumentation is ours",
    r.attribution.kind === "unavailable" && r.attribution.reason === "instrumented-trapped",
    `${r.attribution.kind}/${r.attribution.reason ?? ""}`,
  );
}

/* ------------------------- trapped in BOTH: theirs, with the frames kept */
{
  const worker = mockWorker({
    run: { result: { ok: true, stdout: "", exitCode: -1, trap: "memory access out of bounds" } },
    ast: (m) => ({ result: { ok: true, ast: astFor(m.source) } }),
    trace: {
      chunks: [frame(2, { x: 1 }), frame(2, { x: 2 })],
      result: { ok: true, stdout: "", exitCode: -1, trap: "memory access out of bounds" },
    },
  });
  const r = await runTrace({ worker, source: SOURCE, stdin: "", nextId: ids });
  check(
    "a trap in BOTH builds is the learner's, and is classified",
    r.attribution.kind === "learner-trap" && r.attribution.trap === "out_of_bounds",
    `${r.attribution.kind}/${r.attribution.trap ?? ""}`,
  );
  check(
    "the frames leading up to their trap are kept — the useful part",
    (r.trace?.frames.length ?? 0) === 2,
    `${r.trace?.frames.length} frames`,
  );
}

/* ------------------------------- the spec: declared kind, inferred variable */
{
  // A list, a stack and a queue all arrive as a flat array of values, so the
  // KIND cannot be inferred — only declared. 🛑 Getting this wrong renders a
  // stack as a horizontal strip, teaching away the one property it exists for.
  const mk = (extra) =>
    mockWorker({
      run: { result: { ok: true, stdout: "1", exitCode: 0 } },
      ast: (m) => ({ result: { ok: true, ast: astFor(m.source) } }),
      trace: {
        chunks: [frame(2, { nums: [3, 1, 4], total: 8 })],
        result: { ok: true, stdout: "1", exitCode: 0 },
      },
      ...extra,
    });

  const base = { source: SOURCE, stdin: "", nextId: ids };

  const plain = await runTrace({ worker: mk(), ...base });
  check(
    "with no declared kind the spec defaults to array",
    plain.trace?.specs[0]?.kind === "array" && plain.trace?.specs[0]?.var === "nums",
    JSON.stringify(plain.trace?.specs[0]),
  );

  for (const kind of ["linkedList", "stack", "queue", "tree", "graph"]) {
    const r = await runTrace({ worker: mk(), ...base, vizKind: kind });
    check(
      `a declared ${kind} produces a ${kind} spec, not an array`,
      r.trace?.specs[0]?.kind === kind,
      JSON.stringify(r.trace?.specs[0]),
    );
  }

  const named = await runTrace({ worker: mk(), ...base, vizVar: "nums" });
  check("a declared variable is honoured", named.trace?.specs[0]?.var === "nums");

  // A scalar cannot be drawn, so naming one must fall through to no spec
  // rather than producing a diagram of nothing.
  const scalar = await runTrace({ worker: mk(), ...base, vizVar: "total" });
  check(
    "declaring a scalar variable yields no spec rather than an empty diagram",
    (scalar.trace?.specs.length ?? 0) === 0,
    JSON.stringify(scalar.trace?.specs),
  );
  check(
    "and the trace is still usable — code and variables are the point",
    scalar.attribution.kind === "ok" && (scalar.trace?.frames.length ?? 0) === 1,
  );
}

{
  // A nested value is a grid whatever was declared: drawing a 2-D value as a
  // stack would silently throw away a dimension.
  const worker = mockWorker({
    run: { result: { ok: true, stdout: "1", exitCode: 0 } },
    ast: (m) => ({ result: { ok: true, ast: astFor(m.source) } }),
    trace: {
      chunks: [frame(2, { dp: [[1, 2], [3, 4]] })],
      result: { ok: true, stdout: "1", exitCode: 0 },
    },
  });
  const r = await runTrace({ worker, source: SOURCE, stdin: "", nextId: ids, vizKind: "stack" });
  check(
    "a nested array stays a grid even when another kind is declared",
    r.trace?.specs[0]?.kind === "grid",
    JSON.stringify(r.trace?.specs[0]),
  );
}

{
  // 🛑 The exception to the rule above: an adjacency list IS nested by nature,
  // so a declared graph must survive it. Without this every graph problem
  // would render as a DP-style table, because `vector<vector<int>> adj` has
  // exactly the shape a 2-D grid has.
  const worker = mockWorker({
    run: { result: { ok: true, stdout: "1", exitCode: 0 } },
    ast: (m) => ({ result: { ok: true, ast: astFor(m.source) } }),
    trace: {
      chunks: [frame(2, { adj: [[1], [0, 2], [1]] })],
      result: { ok: true, stdout: "1", exitCode: 0 },
    },
  });
  const r = await runTrace({ worker, source: SOURCE, stdin: "", nextId: ids, vizKind: "graph" });
  check(
    "a declared graph survives a nested adjacency list",
    r.trace?.specs[0]?.kind === "graph",
    JSON.stringify(r.trace?.specs[0]),
  );
}

/* --------------------------- a cap is surfaced, never silently swallowed */
{
  const worker = mockWorker({
    run: { result: { ok: true, stdout: "1", exitCode: 0 } },
    ast: (m) => ({ result: { ok: true, ast: astFor(m.source) } }),
    trace: {
      chunks: [
        frame(2, { x: 1 }),
        capRecord("loop", 2),
      ],
      result: { ok: true, stdout: "1", exitCode: 0 },
    },
  });
  const r = await runTrace({ worker, source: SOURCE, stdin: "", nextId: ids });
  check(
    "a cap record reaches the trace so the UI can say it is incomplete",
    r.trace?.capped?.reason === "loop",
    JSON.stringify(r.trace?.capped),
  );
}

/* ----------------- the learner's own stderr is separated from the frames */
{
  const worker = mockWorker({
    run: { result: { ok: true, stdout: "1", exitCode: 0 } },
    ast: (m) => ({ result: { ok: true, ast: astFor(m.source) } }),
    trace: {
      // Their unterminated partial line, then a frame, then more of their text.
      chunks: [`debug no newline ${frame(2, { x: 1 }).trimEnd()}\nmore\n`],
      result: { ok: true, stdout: "1", exitCode: 0 },
    },
  });
  const r = await runTrace({ worker, source: SOURCE, stdin: "", nextId: ids });
  check(
    "their stderr survives intact around a frame",
    r.output.includes("debug no newline") && r.output.includes("more"),
    JSON.stringify(r.output),
  );
  check("and the frame is still parsed", (r.trace?.frames.length ?? 0) === 1, `${r.trace?.frames.length}`);
}

/* ----------------------------------------------------- a worker that hangs */
{
  const worker = mockWorker({ run: undefined });
  let threw = "";
  try {
    await runTrace({ worker, source: SOURCE, stdin: "", nextId: ids, timeoutMs: 50 });
  } catch (err) {
    threw = err?.message ?? String(err);
  }
  check("a hung worker rejects rather than hanging forever", threw === "TRACE_TIMEOUT", threw);
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
