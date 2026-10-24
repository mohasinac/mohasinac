/**
 * One-shot: attach authored `scenarios` to the problems where the edge cases
 * carry a specific, nameable lesson.
 *
 * 🛑 These are written fresh, NOT copied from hidden test cases. A hidden case
 * stores only a SHA-256 of its expected output — the plaintext is dropped at
 * seed time so it can never be served — whereas a scenario is visible by
 * design. The two have opposite requirements and must stay separate fields.
 *
 * The material is real though: the hidden cases were chosen adversarially in
 * the first place, and 30 of the 53 editorials already have a Pitfalls section
 * saying why. This turns that prose into something a learner can run.
 *
 *   node scripts/add-scenarios.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "..", "content", "problems");

const SCENARIOS = {
  "two-sum": [
    { label: "the ordinary case", input: "4 9\n2 7 11 15\n", output: "0 1",
      why: "Two distinct positions sum to the target. Nothing subtle." },
    { label: "the same value twice", input: "2 6\n3 3\n", output: "0 1",
      why: "3 + 3 = 6. This is why the hash-map insert must happen AFTER the lookup — inserting first lets an element pair with itself and prints 0 0." },
    { label: "no pair exists", input: "2 5\n1 2\n", output: "-1",
      why: "Every pair has to be ruled out before concluding there is none. A loop that returns early on the first miss gets this wrong." },
  ],
  "contains-duplicate": [
    { label: "empty input", input: "0\n\n", output: "false",
      why: "Nothing can be duplicated. A loop assuming at least two elements, or `i < size() - 1` on an unsigned size, breaks here." },
    { label: "one element", input: "1\n7\n", output: "false",
      why: "The smallest case with data but no possible pair." },
    { label: "the duplicate is first", input: "5\n-1 -1 2 3 4\n", output: "true",
      why: "Negatives are values like any other, and the answer is found immediately — the early return should fire on the second read, not after all five." },
  ],
  "maximum-subarray": [
    { label: "all negative", input: "3\n-5 -2 -9\n", output: "-2",
      why: "The single most common wrong answer. A non-empty subarray is required, so initialising the best to 0 returns 0 here instead of the largest single value." },
    { label: "one element", input: "1\n-1\n", output: "-1",
      why: "No room to extend or restart; the answer is the element itself." },
    { label: "the whole array", input: "5\n5 4 -1 7 8\n", output: "23",
      why: "The running sum never goes negative, so it is never worth restarting — the opposite of the all-negative case." },
  ],
  "best-time-to-buy-and-sell-stock": [
    { label: "prices only fall", input: "5\n7 6 4 3 1\n", output: "0",
      why: "Doing nothing is allowed, so the answer is 0 — which is why the best profit starts at 0 here, unlike maximum-subarray where 0 would be wrong." },
    { label: "two days, rising", input: "2\n1 2\n", output: "1",
      why: "The smallest profitable case. Buy must come strictly before sell." },
    { label: "two days, falling", input: "2\n2 1\n", output: "0",
      why: "If the minimum is updated before the sale is evaluated, this wrongly reports a same-day trade." },
  ],
  "product-of-array-except-self": [
    { label: "one zero", input: "5\n-1 1 0 -3 3\n", output: "0 0 9 0 0",
      why: "Every position except the zero's has the zero in its prefix or suffix, so only the zero's own position is non-zero. No special case is needed — which is the point of the two-pass approach." },
    { label: "two zeros", input: "3\n0 0 5\n", output: "0 0 0",
      why: "With two zeros every answer is 0. A division-based solution cannot handle either zero case, which is why division is forbidden." },
  ],
  "valid-palindrome": [
    { label: "only punctuation", input: ".,;\n", output: "true",
      why: "Nothing alphanumeric survives the filter, so it is vacuously a palindrome. Without `lo < hi` inside each skip loop, both pointers run off the end here." },
    { label: "a digit and a letter", input: "0P\n", output: "false",
      why: "Digits count as alphanumeric, so this is a two-character comparison that fails. Solutions that only consider letters report true." },
  ],
  "valid-parentheses": [
    { label: "never closed", input: "((\n", output: "false",
      why: "Survives every loop iteration and is still unbalanced. This is the check people omit: leftover open brackets mean invalid." },
    { label: "closes with nothing open", input: ")\n", output: "false",
      why: "The stack is empty when a closer arrives — a distinct failure from closing the wrong kind." },
    { label: "overlapping, not nested", input: "([)]\n", output: "false",
      why: "Bracket COUNTS are balanced for both kinds, so counting cannot solve this. Only the stack's ordering catches it." },
  ],
  "binary-search": [
    { label: "target between elements", input: "2 2\n1 3\n", output: "-1",
      why: "The two-element case where a wrong bound update loops forever. `lo = mid` makes no progress when mid == lo." },
    { label: "target at the start", input: "5 1\n1 2 3 4 5\n", output: "0",
      why: "Index 0 is a boundary an off-by-one will miss." },
    { label: "target at the end", input: "5 5\n1 2 3 4 5\n", output: "4",
      why: "The other boundary. Half-open bounds make both of these fall out without special cases." },
  ],
  "climbing-stairs": [
    { label: "one step", input: "1\n", output: "1",
      why: "The base case. A loop starting at 2 must already have this right." },
    { label: "the upper bound", input: "45\n", output: "1836311903",
      why: "fib(46), which only just fits in a signed 32-bit int. This is why the accumulator is 64-bit." },
  ],
  "coin-change": [
    { label: "amount is zero", input: "1 0\n1\n", output: "0",
      why: "Zero coins make zero. dp[0] = 0 is the base case everything else builds on." },
    { label: "unreachable", input: "1 3\n2\n", output: "-1",
      why: "No combination of 2s makes 3. This is the case where an unguarded sentinel overflows: INT_MAX + 1 is undefined behaviour and typically goes negative, winning the min() and producing a confident wrong answer." },
    { label: "greedy would fail", input: "3 6\n1 3 4\n", output: "2",
      why: "Greedy takes 4 + 1 + 1 = three coins. The answer is 3 + 3 = two. This is the case that proves the problem is not greedy." },
  ],
  "house-robber": [
    { label: "empty row", input: "0\n\n", output: "0",
      why: "Nothing to take." },
    { label: "the greedy trap", input: "5\n5 1 1 5 10\n", output: "20",
      why: "Taking the largest house first (10) forces skipping the 5 beside it. The answer takes 5 + 5 + 10 — which is why a local choice is not safe here." },
  ],
  "longest-increasing-subsequence": [
    { label: "all equal", input: "7\n7 7 7 7 7 7 7\n", output: "1",
      why: "Strictly increasing, so equal values do not extend. This is exactly where lower_bound is required and upper_bound would wrongly answer 7." },
    { label: "strictly decreasing", input: "5\n5 4 3 2 1\n", output: "1",
      why: "Every element replaces the single tail, so the answer stays 1." },
  ],
  "single-number": [
    { label: "one element", input: "1\n0\n", output: "0",
      why: "Zero is a legitimate answer, so a solution using 0 as its 'not found' sentinel cannot distinguish it." },
    { label: "negatives", input: "5\n-3 7 7 -9 -9\n", output: "-3",
      why: "XOR works on bit patterns, so two's-complement negatives cancel exactly as positives do. No special case." },
  ],
  "missing-number": [
    { label: "the missing one is n", input: "4\n0 1 2 3\n", output: "4",
      why: "The missing value is the range's upper bound, which is why the XOR accumulator seeds with n rather than 0 — seeding with 0 is right only when the answer is not n." },
    { label: "the missing one is 0", input: "1\n1\n", output: "0",
      why: "The other boundary." },
  ],
  "number-of-islands": [
    { label: "no land", input: "1 1\n0\n", output: "0",
      why: "The flood fill never runs." },
    { label: "diagonals do not connect", input: "3 3\n101\n010\n101\n", output: "5",
      why: "Five separate islands. A solution using eight directions instead of four merges them into one." },
  ],
  "merge-intervals": [
    { label: "fully contained", input: "2\n1 10\n2 3\n", output: "1 10",
      why: "The shorter interval must not shrink the longer one. This is why extending uses max(end, candidate) rather than assignment." },
    { label: "touching", input: "2\n1 4\n4 5\n", output: "1 5",
      why: "They meet at 4 and merge, because this problem treats touching as overlapping. The `<=` is what decides that, and the statement is the only thing that tells you which to use." },
  ],
  "meeting-rooms-ii": [
    { label: "back to back", input: "2\n7 10\n10 12\n", output: "1",
      why: "One ends exactly as the next begins, so one room suffices. This is the tie-break: at equal times an END must be processed before a START." },
    { label: "all overlapping", input: "3\n1 10\n2 7\n3 19\n", output: "3",
      why: "Three simultaneous meetings need three rooms — the maximum-overlap reading of the problem, not the maximum-non-overlapping one." },
  ],
  "kth-largest-element-in-an-array": [
    { label: "duplicates count", input: "3 2\n5 5 4\n", output: "5",
      why: "The 2nd largest in sorted order is the second 5, not 4. A solution that deduplicates first answers a different question." },
    { label: "k equals n", input: "5 5\n1 2 3 4 5\n", output: "1",
      why: "The k-th largest with k = n is the minimum — the boundary where an off-by-one on k shows up." },
  ],
};

let attached = 0;
for (const file of readdirSync(CONTENT).filter((f) => f.endsWith(".json"))) {
  const path = join(CONTENT, file);
  const items = JSON.parse(readFileSync(path, "utf8"));
  for (const problem of items) {
    const s = SCENARIOS[problem.slug];
    if (s) {
      problem.scenarios = s;
      attached++;
    }
  }
  writeFileSync(path, `${JSON.stringify(items, null, 2)}\n`);
}

const known = Object.keys(SCENARIOS).length;
console.log(`attached scenarios to ${attached} of ${known} named problems`);
if (attached !== known) {
  console.log("MISMATCH — a slug in the table does not exist in content/");
  process.exit(1);
}
