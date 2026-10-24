/**
 * Add the missing `blind75` tag to problems that are in the canonical list.
 *
 * 🛑 Why this was invisible: `problems.sheets[]` does NOT drive navigation —
 * `src/app/problems/[set]/page.tsx` maps over `problemSets.order[]` and looks
 * each slug up. So a mis-tagged problem still appears in its set, and nothing
 * errors. The tag only matters to anything that filters on `sheets[]`, where
 * it would silently undercount.
 *
 * Deliberately NOT touching `single-number`, which carries the `blind75` tag
 * but is not in the canonical 75. Removing a tag changes what a set claims to
 * contain, so that is the author's call, not a script's.
 *
 *   node scripts/fix-blind75-tags.mjs          # report
 *   node scripts/fix-blind75-tags.mjs --write  # apply
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "content/problems");
const WRITE = process.argv.includes("--write");

/** Canonical Blind 75, but missing the tag in this repo. */
const NEEDS_TAG = new Set(["unique-paths", "meeting-rooms-ii", "missing-number"]);

let fixed = 0;
for (const file of readdirSync(DIR).filter((f) => f.endsWith(".json"))) {
  const path = join(DIR, file);
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  const list = Array.isArray(parsed) ? parsed : (parsed.items ?? []);
  let touched = false;

  for (const problem of list) {
    if (!NEEDS_TAG.has(problem.slug)) continue;
    const sheets = Array.isArray(problem.sheets) ? problem.sheets : [];
    if (sheets.includes("blind75")) {
      console.log(`  SKIP  ${problem.slug}: already tagged`);
      continue;
    }
    // Prepended, so the ordering matches every other problem's sheets[].
    problem.sheets = ["blind75", ...sheets];
    console.log(`  TAG   ${problem.slug} -> ${JSON.stringify(problem.sheets)}`);
    fixed++;
    touched = true;
  }

  if (WRITE && touched) writeFileSync(path, `${JSON.stringify(parsed, null, 2)}\n`);
}

console.log(`\n  ${fixed} tagged`);
if (!WRITE) console.log("  dry run — pass --write to apply\n");
