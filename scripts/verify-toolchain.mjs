/**
 * Smoke test for the shared toolchain harness: compile, run, AST dump, and the
 * raw trace sink that keeps an unterminated final line.
 *
 *   node scripts/verify-toolchain.mjs
 */
import * as t from "./lib/toolchain.mjs";

console.log("flags:", t.CXX_FLAGS.join(" "), "|", t.LINK_FLAGS.join(" "));
const tc = await t.loadToolchain();
console.log("toolchain", tc.version);

const src = `#include <bits/stdc++.h>
int main() {
    int n;
    std::cin >> n;
    std::cout << n * 2 << '\\n';
}
`;

const c = await t.compile(src);
console.log("compile ok:", c.ok, "|", c.ms + "ms");
if (!c.ok) {
  console.log("stderr:\n" + c.stderr.split("\n").slice(0, 8).join("\n"));
  process.exit(1);
}
const r = await t.run(c.wasm, "21\n");
console.log("run:", JSON.stringify(r.stdout), "exit", r.exitCode, r.ms + "ms");

// AST mode, which the splice planner needs.
const a = await t.compile(src, { ast: true });
console.log("ast ok:", a.ok, "| dump bytes:", a.stdout.length);

// Trace capture: stderr must arrive raw, not line-buffered.
const traced = await t.compile(`#include <bits/stdc++.h>
int main() { fputs("no-newline-tail", stderr); std::cout << "x\\n"; }
`);
const tr = await t.run(traced.wasm, "", { captureTrace: true });
console.log("captureTrace kept an unterminated tail:", JSON.stringify(tr.raw));
console.log("without capture, the same tail:", JSON.stringify((await t.run(traced.wasm, "")).stderr));
