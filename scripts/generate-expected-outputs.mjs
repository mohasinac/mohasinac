/**
 * Fill in hidden test cases' expected outputs by RUNNING the editorial's
 * reference program — and verify the stored ones still match.
 *
 * 🛑 The whole point of the batch. The first 53 problems' expected outputs were
 * computed by hand, which this plan has called the main risk surface since
 * Phase 8: a wrong expectation makes a problem unsolvable with NO diagnostic —
 * the learner's correct code is marked wrong and nothing says why. The
 * toolchain runs from node now, so there is no reason to hand-compute.
 *
 * 🛑 THE CROSS-CHECK IS WHAT MAKES THIS SAFE. Without it this idea is worse
 * than hand-computing, because a wrong reference program generates expectations
 * that are confidently wrong AND perfectly self-consistent — the problem would
 * be unsolvable and every check in the repo would pass.
 *
 * So the reference must first reproduce the AUTHORED sample outputs, which are
 * the worked examples printed in the statement and therefore human-checkable. A
 * disagreement means the REFERENCE is wrong, not the expectation, and nothing
 * is written.
 *
 * 🛑 It generates OUTPUTS, never INPUTS. Hidden inputs stay hand-chosen and
 * adversarial — `3 4 5 1 2` vs `4 1` for subtree, all-negative trees for max
 * path sum, single-row matrices for spiral order. A generator cannot know which
 * input is interesting.
 *
 *   node scripts/generate-expected-outputs.mjs                 # verify only
 *   node scripts/generate-expected-outputs.mjs --write         # fill blanks
 *   node scripts/generate-expected-outputs.mjs --only <slug>   # one problem
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compile, run, normaliseOutput } from "./lib/toolchain.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "content/problems");
const WRITE = process.argv.includes("--write");
const onlyFlag = process.argv.indexOf("--only");
const ONLY = onlyFlag > -1 ? process.argv[onlyFlag + 1] : null;

const { extractReferenceProgram } = await import(
  pathToFileURL(join(ROOT, "src/packages/dsa/src/scenarios/reference-program.ts")).href
);

/** A run that traps or times out is a failure, not an output. */
async function solve(wasm, input) {
  const r = await run(wasm, input);
  if (r.exitCode !== 0) {
    return { ok: false, why: r.trapKind ? `${r.trapKind}: ${r.trap}` : `exit ${r.exitCode}` };
  }
  return { ok: true, output: normaliseOutput(r.stdout) };
}

const report = [];
let generated = 0;
let verified = 0;
let failures = 0;

for (const file of readdirSync(DIR).filter((f) => f.endsWith(".json")).sort()) {
  const path = join(DIR, file);
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  const list = Array.isArray(parsed) ? parsed : (parsed.items ?? []);
  let touched = false;

  for (const problem of list) {
    if (ONLY && problem.slug !== ONLY) continue;

    const cases = problem.testCases ?? [];
    const samples = cases.filter((c) => c.visibility === "sample");
    const hidden = cases.filter((c) => c.visibility !== "sample");

    // Nothing to do for a problem whose hidden cases are all filled AND whose
    // samples are all authored — unless we are verifying, which is the default.
    const reference = extractReferenceProgram(String(problem.editorial ?? ""));
    if (!reference) {
      report.push({ slug: problem.slug, level: "FAIL", msg: "no runnable program in the editorial" });
      failures++;
      continue;
    }

    const built = await compile(reference.source);
    if (!built.ok || !built.wasm) {
      report.push({
        slug: problem.slug,
        level: "FAIL",
        msg: `reference does not compile: ${built.stderr.split("\n")[0] ?? ""}`,
      });
      failures++;
      continue;
    }

    /* ---- the gate: the reference must reproduce every authored sample ---- */
    let referenceTrusted = true;
    for (const [i, tc] of samples.entries()) {
      const authored = tc.expectedOutput;
      // 🛑 `""` is a LEGITIMATE expectation, not a missing one: "print nothing"
      // is the right answer for an empty result — merging two empty lists, for
      // instance. Only undefined/null mean unauthored. A first version of this
      // check conflated them and rejected a correct problem.
      if (authored === undefined || authored === null) {
        report.push({
          slug: problem.slug,
          level: "FAIL",
          // Samples are the statement's worked examples. Generating them would
          // remove the only human-checkable anchor the reference is tested against.
          msg: `sample ${i + 1} has no authored expectedOutput — samples must be written by hand`,
        });
        failures++;
        referenceTrusted = false;
        continue;
      }
      const got = await solve(built.wasm, tc.input);
      if (!got.ok) {
        report.push({ slug: problem.slug, level: "FAIL", msg: `sample ${i + 1}: ${got.why}` });
        failures++;
        referenceTrusted = false;
        continue;
      }
      if (got.output !== normaliseOutput(authored)) {
        report.push({
          slug: problem.slug,
          level: "FAIL",
          msg:
            `sample ${i + 1} DISAGREES — the reference is wrong, not the expectation.\n` +
            `          input    ${JSON.stringify(tc.input)}\n` +
            `          authored ${JSON.stringify(normaliseOutput(authored))}\n` +
            `          produced ${JSON.stringify(got.output)}`,
        });
        failures++;
        referenceTrusted = false;
        continue;
      }
      verified++;
    }

    if (!referenceTrusted) continue;

    /* ---- only now: fill or verify the hidden cases ---- */
    for (const [i, tc] of hidden.entries()) {
      const got = await solve(built.wasm, tc.input);
      if (!got.ok) {
        report.push({ slug: problem.slug, level: "FAIL", msg: `hidden ${i + 1}: ${got.why}` });
        failures++;
        continue;
      }

      const existing = tc.expectedOutput;
      // Same distinction as for samples: `""` is an authored "print nothing",
      // so it gets VERIFIED rather than overwritten.
      if (existing === undefined || existing === null) {
        if (WRITE) {
          tc.expectedOutput = got.output;
          touched = true;
        }
        generated++;
        report.push({
          slug: problem.slug,
          level: WRITE ? "GEN" : "WOULD",
          msg: `hidden ${i + 1} -> ${JSON.stringify(got.output.slice(0, 60))}`,
        });
        continue;
      }

      // Already filled: VERIFY it. This is what catches an editorial edit that
      // changes behaviour — otherwise the stored hashes would silently disagree
      // with the reference and the problem would drift out of solvability.
      if (normaliseOutput(existing) !== got.output) {
        report.push({
          slug: problem.slug,
          level: "FAIL",
          msg:
            `hidden ${i + 1} DRIFTED from the reference.\n` +
            `          stored   ${JSON.stringify(normaliseOutput(existing))}\n` +
            `          produced ${JSON.stringify(got.output)}`,
        });
        failures++;
        continue;
      }
      verified++;
    }
  }

  if (WRITE && touched) writeFileSync(path, `${JSON.stringify(parsed, null, 2)}\n`);
}

/* ----------------------------------------------------------------- report */

console.log("");
const byLevel = { FAIL: [], GEN: [], WOULD: [] };
for (const r of report) (byLevel[r.level] ?? []).push(r);

for (const r of report) {
  const tag = r.level === "FAIL" ? "FAIL " : r.level === "GEN" ? "GEN  " : "WOULD";
  console.log(`  ${tag} ${r.slug}: ${r.msg}`);
}

console.log(
  `\n  ${verified} expectations verified against the reference · ` +
    `${generated} ${WRITE ? "generated" : "would be generated"} · ${failures} failures`,
);
if (!WRITE && generated > 0) console.log("  pass --write to fill them in");
if (failures > 0) {
  console.log("\n  🛑 Nothing was written for a problem whose samples disagree — fix the reference.\n");
}
console.log("");
process.exit(failures > 0 ? 1 : 0);
