/**
 * Verify every declared `inputFormat` actually parses its own problem's SAMPLE
 * cases, and that the explainer it produces is sane.
 *
 * 🛑 This is the test that matters for Tier 1. A descriptor that compiles but
 * mis-reads its input produces a confidently wrong diagram — the single failure
 * mode the whole feature is built to avoid. Checking it against the real,
 * judge-verified sample inputs is the only way to know.
 *
 *   npm run verify:explainers
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseInput } from "../src/packages/dsa/src/scenarios/input-format.ts";
import { buildExplainer } from "../src/packages/dsa/src/scenarios/explainer.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = join(ROOT, "content", "problems");

let withFormat = 0;
let without = 0;
let okCases = 0;
let failures = [];
let noPanel = [];

for (const file of readdirSync(CONTENT).filter((f) => f.endsWith(".json"))) {
  for (const p of JSON.parse(readFileSync(join(CONTENT, file), "utf8"))) {
    if (!Array.isArray(p.inputFormat)) {
      without++;
      continue;
    }
    withFormat++;

    const samples = (p.testCases ?? []).filter((c) => c.visibility === "sample");
    if (samples.length === 0) {
      failures.push(`${p.slug}: has an inputFormat but no sample case to drive it`);
      continue;
    }

    for (const [i, c] of samples.entries()) {
      const parsed = parseInput(c.input, p.inputFormat);
      if (!parsed.ok) {
        failures.push(`${p.slug} sample ${i + 1}: ${parsed.reason}`);
        continue;
      }

      const built = buildExplainer({
        input: c.input,
        expectedOutput: String(c.expectedOutput ?? ""),
        inputFormat: p.inputFormat,
        ...(p.vizKind ? { kind: p.vizKind } : {}),
        ...(p.vizVar ? { varName: p.vizVar } : {}),
        patterns: p.patterns ?? [],
      });

      if (!built.ok) {
        // Parsing worked but nothing was drawable — the descriptor is right and
        // the problem simply has no structure to show. Report, do not fail.
        noPanel.push(`${p.slug}: ${built.reason}`);
        continue;
      }
      if (built.trace.frames.length < 3) {
        failures.push(`${p.slug} sample ${i + 1}: only ${built.trace.frames.length} frames`);
        continue;
      }
      okCases++;
    }
  }
}

console.log(`\nproblems with a descriptor: ${withFormat}`);
console.log(`problems deliberately without: ${without}`);
console.log(`sample cases producing a valid explainer: ${okCases}`);

if (noPanel.length) {
  console.log(`\nparsed but not drawable (${noPanel.length}) — no panel, by design:`);
  for (const n of [...new Set(noPanel)]) console.log(`  ${n}`);
}

if (failures.length) {
  console.log(`\nFAILURES (${failures.length}):`);
  for (const f of failures) console.log(`  ${f}`);
  console.log("");
  process.exit(1);
}

console.log("\nEvery declared input format parses its own sample cases.\n");
