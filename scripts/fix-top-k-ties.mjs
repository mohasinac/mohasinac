/**
 * Make top-k-frequent-elements single-valued.
 *
 * 🛑 It is currently NON-DETERMINISTIC, not merely ambiguous. Two causes
 * compound:
 *
 *   1. the statement fixes the OUTPUT order ("ascending") but never says which
 *      k to pick when frequencies TIE;
 *   2. the reference builds `counts` from an `unordered_map` — whose iteration
 *      order is unspecified — and hands it to `nth_element` with a comparator
 *      that only looks at frequency (`x.second > y.second`).
 *
 * So for `5 5 5 7 7 9 9` with k=2 (counts 5→3, 7→2, 9→2) the program may
 * legitimately print `5 7` or `5 9`, on the same input, depending on the hash
 * order. A hash-judged problem cannot be non-deterministic: a learner's correct
 * answer would pass or fail at random.
 *
 * The fix states the tie-break and implements it: frequency descending, then
 * value ascending. Verified against every existing case — `5 7`, `2 3 4`,
 * `1 2`, `1`, `-3` all remain correct, so no expectation changes.
 *
 *   node scripts/fix-top-k-ties.mjs          # report
 *   node scripts/fix-top-k-ties.mjs --write  # apply
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PATH = join(ROOT, "content/problems/01-arrays-hashing.json");
const WRITE = process.argv.includes("--write");

const parsed = JSON.parse(readFileSync(PATH, "utf8"));
const list = Array.isArray(parsed) ? parsed : (parsed.items ?? []);
const problem = list.find((p) => p.slug === "top-k-frequent-elements");
if (!problem) throw new Error("top-k-frequent-elements not found");

const changes = [];

/* ---- 1. state the tie-break ------------------------------------------- */
const OUTPUT_RULE = "`k` integers in ascending order, separated by single spaces.";
const OUTPUT_RULE_FIXED =
  "`k` integers in ascending order, separated by single spaces.\n\n" +
  "If several values occur the same number of times, prefer the **smaller value**. " +
  "Without that rule the answer would not be unique — `5 5 5 7 7 9 9` with `k = 2` " +
  "could be either `5 7` or `5 9`, and both would be correct.";

if (String(problem.statement).includes(OUTPUT_RULE_FIXED)) {
  changes.push("statement: tie-break already stated");
} else if (String(problem.statement).includes(OUTPUT_RULE)) {
  problem.statement = String(problem.statement).replace(OUTPUT_RULE, OUTPUT_RULE_FIXED);
  changes.push("statement: tie-break stated");
} else {
  changes.push("WARNING: output rule not found in the statement");
}

/* ---- 2. make the reference deterministic ------------------------------ */
const WRONG_SELECT = `    // Partial sort is enough: we only need the first k in order, not all d.
    // Comparator is STRICT (uses >, not >=) — see the algorithms lesson.
    nth_element(counts.begin(), counts.begin() + k - 1, counts.end(),
                [](const auto& x, const auto& y) { return x.second > y.second; });`;

const RIGHT_SELECT = `    // 🛑 The comparator MUST break ties on the value, not just compare
    // frequencies. \`counts\` comes from an unordered_map, whose iteration order
    // is unspecified, so a frequency-only comparator makes the ANSWER depend on
    // the hash order — the same input could print \`5 7\` or \`5 9\`. Adding the
    // value as a tiebreak is what makes the result reproducible at all.
    nth_element(counts.begin(), counts.begin() + k - 1, counts.end(),
                [](const auto& x, const auto& y) {
                    if (x.second != y.second) return x.second > y.second;
                    return x.first < y.first;   // same frequency: smaller value wins
                });`;

const editorial = String(problem.editorial ?? "");
if (editorial.includes(RIGHT_SELECT)) {
  changes.push("editorial: comparator already deterministic");
} else if (editorial.includes(WRONG_SELECT)) {
  problem.editorial = editorial.replace(WRONG_SELECT, RIGHT_SELECT);
  changes.push("editorial: comparator now breaks ties on the value");
} else {
  changes.push("WARNING: the nth_element block did not match exactly");
}

console.log("");
for (const c of changes) console.log(`  ${c}`);

if (WRITE && !changes.some((c) => c.startsWith("WARNING"))) {
  writeFileSync(PATH, `${JSON.stringify(parsed, null, 2)}\n`);
  console.log("\n  written");
} else if (!WRITE) {
  console.log("\n  dry run — pass --write to apply");
} else {
  console.log("\n  NOT written — a pattern did not match");
  process.exit(1);
}
