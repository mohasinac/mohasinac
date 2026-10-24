/**
 * Correct house-robber, which is unsolvable as shipped.
 *
 * 🛑 The same arithmetic error appears in THREE places, because the author made
 * it once and then propagated it:
 *
 *   1. hidden test case `5 1 1 5 10` expects 20. The answer is 16.
 *      dp = max(dp[3], dp[2] + 10) = max(10, 6 + 10) = 16. The 20 comes from
 *      robbing indices 0, 3 and 4 — but 3 and 4 are ADJACENT, which the problem
 *      forbids. A learner with correct code is told "wrong answer" and given no
 *      diagnostic.
 *   2. scenario[1] states the same 20 and explains it as "5 + 5 + 10".
 *   3. the editorial's "Why greedy fails" paragraph asserts "optimal is
 *      5 + 5 + 10 = 20", and contains a literal "→ wait," — an unedited
 *      stream-of-thought artifact in published teaching material.
 *
 * 🛑 `verify:explainers` cross-checks scenario outputs against test cases and
 * PASSED, because both copies were wrong in the same way. Agreement is not
 * correctness — which is exactly why the generator checks against a RUNNING
 * reference rather than against another authored number.
 *
 * The replacement counterexample is `6 10 6`: greedy-by-largest takes 10, while
 * the optimum is 6 + 6 = 12. Minimal, and actually true.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PATH = join(ROOT, "content/problems/03-dp-graphs-trees.json");
const WRITE = process.argv.includes("--write");

const parsed = JSON.parse(readFileSync(PATH, "utf8"));
const list = Array.isArray(parsed) ? parsed : (parsed.items ?? []);
const problem = list.find((p) => p.slug === "house-robber");
if (!problem) throw new Error("house-robber not found");

const changes = [];

/* ---- 1. the hidden expectation --------------------------------------- */
for (const tc of problem.testCases ?? []) {
  if (tc.input.includes("5 1 1 5 10") && tc.expectedOutput === "20") {
    tc.expectedOutput = "16";
    changes.push("testCase expectedOutput 20 -> 16");
  }
}

/* ---- 2. the scenario -------------------------------------------------- */
for (const s of problem.scenarios ?? []) {
  if (String(s.input).includes("5 1 1 5 10")) {
    s.output = "16";
    // Turned into the lesson it should always have been: the wrong answer here
    // is precisely the mistake the original author made.
    s.why =
      "The tempting answer is 5 + 5 + 10 = 20, taking houses 0, 3 and 4 — but 3 and 4 are " +
      "ADJACENT, so that is not allowed. The best legal choice is houses 0, 2 and 4: " +
      "5 + 1 + 10 = 16. This is the trap the constraint exists to create, and checking " +
      "adjacency on your own answer is the habit worth building.";
    changes.push("scenario output 20 -> 16, and its explanation rewritten");
  }
}

/* ---- 3. the editorial paragraph -------------------------------------- */
const WRONG_PARAGRAPH =
  "Taking the largest house first is wrong: on `2 7 9 3 1`, greedy takes 9, then must skip 7 and 3, leaving 2 and 1 for a total of 12 — which happens to be right. But on `2 1 1 2` greedy takes a 2, then the other 2, total 4; correct. Try `4 1 1 4 1 1 4`: greedy works again. The failure is subtler — `2 7 9 3 1` with values changed to `5 1 1 5 10`: greedy takes 10, skips 5, takes 5 and 1 → wait, it takes 10 then can take index 0,1,2 → 5+1 = 6, total 16; optimal is 5+5+10 = 20. Greedy by largest value has no exchange argument, so use DP.";

const RIGHT_PARAGRAPH =
  "Taking the largest house first looks reasonable, and it survives a surprising number of inputs: on `2 7 9 3 1` it takes 9, then 2 and 1, for 12 — which is optimal. On `2 1 1 2` it takes both 2s for 4; also optimal.\n\nThe smallest input that breaks it is `6 10 6`. Greedy takes 10 and is then blocked on both sides, finishing at 10. The optimum ignores the biggest house entirely and takes `6 + 6 = 12`. That is the whole problem in three numbers: a local maximum can cost you more than it pays, and greedy has no exchange argument to rule that out. So use DP.";

const before = String(problem.editorial ?? "");
if (before.includes(WRONG_PARAGRAPH)) {
  problem.editorial = before.replace(WRONG_PARAGRAPH, RIGHT_PARAGRAPH);
  changes.push("editorial: replaced the wrong counterexample (and removed a '→ wait,' artifact)");
} else if (before.includes("→ wait,")) {
  changes.push("WARNING: the '→ wait,' artifact is present but the paragraph did not match exactly");
}

console.log(changes.length === 0 ? "  nothing to change" : "");
for (const c of changes) console.log(`  ${c}`);

if (WRITE && changes.length > 0) {
  writeFileSync(PATH, `${JSON.stringify(parsed, null, 2)}\n`);
  console.log("\n  written");
} else if (!WRITE) {
  console.log("\n  dry run — pass --write to apply");
}
