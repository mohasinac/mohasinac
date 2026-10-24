/**
 * Give the three size-only problems something to draw.
 *
 * Their inputs carry no structure — just a count — so the explainer refused a
 * panel and they had no "understand this problem" view at all. Each has an
 * obvious subject, which is derived rather than guessed.
 *
 *   node scripts/add-viz-derive.mjs [--write]
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "content/problems");
const WRITE = process.argv.includes("--write");

const { buildExplainer } = await import(
  pathToFileURL(join(ROOT, "src/packages/dsa/src/scenarios/explainer.ts")).href
);

const DERIVES = {
  // The n steps you are climbing.
  "climbing-stairs": { as: "range", name: "steps", from: "n" },
  // The grid you cross. m rows, n columns — matching the problem's own names.
  "unique-paths": { as: "grid", name: "grid", rows: "m", cols: "n" },
  // The bits whose set count is the answer.
  "number-of-1-bits": { as: "bits", name: "bits", from: "value" },
};

const results = [];
for (const file of readdirSync(DIR).filter((f) => f.endsWith(".json")).sort()) {
  const path = join(DIR, file);
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  const list = Array.isArray(parsed) ? parsed : (parsed.items ?? []);
  let touched = false;

  for (const problem of list) {
    const derive = DERIVES[problem.slug];
    if (!derive) continue;

    const samples = (problem.testCases ?? []).filter((t) => t.visibility === "sample");
    let built = 0;
    let reason = "";
    for (const tc of samples) {
      const r = buildExplainer({
        input: tc.input,
        expectedOutput: String(tc.expectedOutput ?? ""),
        inputFormat: problem.inputFormat,
        ...(problem.vizKind ? { kind: problem.vizKind } : {}),
        derive,
      });
      if (r.ok) built++;
      else reason = r.reason;
    }

    const ok = built === samples.length && samples.length > 0;
    results.push({
      slug: problem.slug,
      ok,
      msg: ok
        ? `${derive.as} from ${derive.from ?? `${derive.rows}x${derive.cols}`} — ${built}/${samples.length} samples draw`
        : `only ${built}/${samples.length} draw: ${reason}`,
    });

    if (WRITE && ok) {
      problem.vizDerive = derive;
      touched = true;
    }
  }
  if (WRITE && touched) writeFileSync(path, `${JSON.stringify(parsed, null, 2)}\n`);
}

console.log("");
let failed = 0;
for (const r of results) {
  if (r.ok) console.log(`  PASS  ${r.slug}: ${r.msg}`);
  else { failed++; console.log(`  FAIL  ${r.slug}: ${r.msg}`); }
}
console.log(`\n  ${results.length - failed} passed, ${failed} failed`);
if (!WRITE && failed === 0) console.log("  verify-only — pass --write to apply\n");
process.exit(failed ? 1 : 0);
