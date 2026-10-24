/**
 * Give the seven tree problems a reference program that actually runs.
 *
 * 🛑 Their editorials end in a SKETCH, not a program:
 *
 *     int main() {
 *         // ... read_tree() as given ...
 *         TreeNode* root = nullptr;   // replaced by read_tree() in your solution
 *         ...
 *     }
 *
 * It has `int main(`, it compiles, and it never reads input — so it prints a
 * sentinel or nothing. `extractReferenceProgram`'s HAS_MAIN test cannot tell
 * that apart from a real solution, which means **10e's "reference traces
 * 53/53" was overstating it**: these seven traced a do-nothing program, and a
 * learner opening the reference walkthrough saw a diagram of nothing.
 *
 * Two of them (`kth-smallest`, `lowest-common-ancestor-of-a-bst`) also contain
 * a real `cin >> k`, which is why a "does it read stdin?" heuristic missed
 * them. The reliable signal is the placeholder comment itself.
 *
 * The fix is the pattern `add-reference-programs.mjs` established: take the
 * problem's own `starterCode` — which already carries `read_tree()` and the
 * input parsing — and splice the algorithm in at its `// Your code here.`
 * marker. The reference is then exactly what a learner would write, and it is
 * compiled and checked against every authored sample before being written.
 *
 *   node scripts/fix-sketch-references.mjs          # verify only
 *   node scripts/fix-sketch-references.mjs --write  # append the fences
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { compile, run, normaliseOutput } from "./lib/toolchain.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "content/problems");
const WRITE = process.argv.includes("--write");

/**
 * Default marker for the learner's own code.
 *
 * Not every starter uses it — three of these spell out the task instead
 * ("// Print one line per level.") — so a fix may override it. Kept explicit
 * per problem rather than guessed at structurally: a wrong guess would splice
 * the algorithm into the wrong place, and an unmatched marker fails loudly,
 * which is how the three were found.
 */
const DEFAULT_MARKER = /[ \t]*\/\/ Your code here\.\n/;

/**
 * slug -> { helpers, body }
 *
 * `helpers` goes above `main`; `body` replaces the marker inside it. Both are
 * taken from the problem's own editorial, so the reference teaches the same
 * algorithm the prose argues for.
 */
const FIXES = {
  "maximum-depth-of-binary-tree": {
    helpers: `int depth(TreeNode* node) {
    // The base case carries the whole definition: an absent subtree has
    // depth 0, so a leaf comes out at 1 without a special case.
    if (!node) return 0;
    return 1 + max(depth(node->left), depth(node->right));
}`,
    body: `    cout << depth(root) << '\\n';\n`,
  },

  "binary-tree-level-order-traversal": {
    marker: /[ \t]*\/\/ Print one line per level\.\n/,
    helpers: "",
    body: `    // One queue, and the LEVEL boundary taken from its size before the
    // loop body runs — that snapshot is what separates the levels.
    if (!root) return 0;
    queue<TreeNode*> q;
    q.push(root);
    while (!q.empty()) {
        int wide = (int)q.size();
        for (int i = 0; i < wide; ++i) {
            TreeNode* node = q.front();
            q.pop();
            cout << node->val << (i + 1 == wide ? '\\n' : ' ');
            if (node->left) q.push(node->left);
            if (node->right) q.push(node->right);
        }
    }
`,
  },

  "validate-binary-search-tree": {
    marker: /[ \t]*\/\/ Print exactly "true" or "false"\.\n/,
    helpers: `/**
 * 🛑 Bounds, not a parent comparison. Checking only node-vs-children passes
 * trees that are locally fine and globally wrong, which is the trap this
 * problem exists for.
 */
bool valid(TreeNode* node, long long low, long long high) {
    if (!node) return true;
    if (node->val <= low || node->val >= high) return false;
    return valid(node->left, low, node->val) && valid(node->right, node->val, high);
}`,
    body: `    cout << (valid(root, LLONG_MIN, LLONG_MAX) ? "true" : "false") << '\\n';\n`,
  },

  "subtree-of-another-tree": {
    marker: /[ \t]*\/\/ Print exactly "true" or "false"\.\n/,
    helpers: `bool same(TreeNode* a, TreeNode* b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a->val == b->val && same(a->left, b->left) && same(a->right, b->right);
}

/** A match must be EXACT from that node down — a partial match is not a subtree. */
bool contains(TreeNode* big, TreeNode* small) {
    if (!small) return true;
    if (!big) return false;
    if (same(big, small)) return true;
    return contains(big->left, small) || contains(big->right, small);
}`,
    body: `    cout << (contains(root, sub) ? "true" : "false") << '\\n';\n`,
  },

  "binary-tree-maximum-path-sum": {
    helpers: `long long best = LLONG_MIN;

/** Returns the best DOWNWARD path sum starting at \`node\`. */
long long gain(TreeNode* node) {
    if (!node) return 0;
    // max(0, ...) is the trick: a branch with a negative total is worse than
    // not taking that branch at all, so clamp and skip it.
    long long left = max(0LL, gain(node->left));
    long long right = max(0LL, gain(node->right));
    // Bending at this node uses BOTH sides; that candidate cannot be passed up.
    best = max(best, node->val + left + right);
    return node->val + max(left, right);
}`,
    body: `    gain(root);\n    cout << best << '\\n';\n`,
  },

  "kth-smallest-element-in-a-bst": {
    helpers: "",
    body: `    // In-order on a BST yields sorted values, so the k-th one visited IS
    // the answer — and the walk can stop the moment it is found.
    stack<TreeNode*> st;
    TreeNode* cur = root;
    int seen = 0;
    while (cur || !st.empty()) {
        while (cur) {
            st.push(cur);
            cur = cur->left;
        }
        cur = st.top();
        st.pop();
        if (++seen == k) {
            cout << cur->val << '\\n';
            return 0;
        }
        cur = cur->right;
    }
`,
  },

  "lowest-common-ancestor-of-a-bst": {
    helpers: "",
    body: `    // The BST ordering decides the direction without any searching: if both
    // targets sit on one side, descend; the moment they split, you are at the
    // lowest common ancestor.
    TreeNode* node = root;
    while (node) {
        if (p < node->val && q < node->val) node = node->left;
        else if (p > node->val && q > node->val) node = node->right;
        else break;
    }
    if (node) cout << node->val << '\\n';
`,
  },
};

const results = [];

for (const file of readdirSync(DIR).filter((f) => f.endsWith(".json")).sort()) {
  const path = join(DIR, file);
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  const list = Array.isArray(parsed) ? parsed : (parsed.items ?? []);
  let touched = false;

  for (const problem of list) {
    const fix = FIXES[problem.slug];
    if (!fix) continue;

    const starter = String(problem.starterCode ?? "");
    const marker = fix.marker ?? DEFAULT_MARKER;
    if (!marker.test(starter)) {
      results.push({ slug: problem.slug, ok: false, msg: "no '// Your code here.' marker in starterCode" });
      continue;
    }

    let source = starter.replace(marker, fix.body);
    if (fix.helpers) {
      source = source.replace(/\nint main\(/, `\n${fix.helpers}\n\nint main(`);
    }

    const built = await compile(source);
    if (!built.ok || !built.wasm) {
      results.push({
        slug: problem.slug,
        ok: false,
        msg: `does not compile: ${built.stderr.split("\n").slice(0, 2).join(" / ")}`,
      });
      continue;
    }

    // 🛑 Every authored sample, not just the first. A program that happens to
    // pass one input is how a wrong reference ships.
    const samples = (problem.testCases ?? []).filter((t) => t.visibility === "sample");
    let allPass = true;
    for (const [i, tc] of samples.entries()) {
      const r = await run(built.wasm, tc.input);
      const got = normaliseOutput(r.stdout);
      const want = normaliseOutput(tc.expectedOutput ?? "");
      if (r.exitCode !== 0) {
        results.push({ slug: problem.slug, ok: false, msg: `sample ${i + 1} ${r.trapKind}: ${r.trap}` });
        allPass = false;
        break;
      }
      if (got !== want) {
        results.push({
          slug: problem.slug,
          ok: false,
          msg: `sample ${i + 1} mismatch — want ${JSON.stringify(want)}, got ${JSON.stringify(got)}`,
        });
        allPass = false;
        break;
      }
    }
    if (!allPass) continue;

    results.push({ slug: problem.slug, ok: true, msg: `compiles, matches all ${samples.length} samples` });

    if (WRITE) {
      // Appended, so `extractReferenceProgram` — which takes the LAST complete
      // program — picks this one over the sketch above it.
      const fence = `\n\n### The complete program\n\n\`\`\`cpp\n${source.trim()}\n\`\`\`\n`;
      problem.editorial = `${String(problem.editorial ?? "").trimEnd()}${fence}`;
      touched = true;
    }
  }

  if (WRITE && touched) writeFileSync(path, `${JSON.stringify(parsed, null, 2)}\n`);
}

console.log("");
let failed = 0;
for (const r of results) {
  if (r.ok) console.log(`  PASS  ${r.slug}: ${r.msg}`);
  else {
    failed++;
    console.log(`  FAIL  ${r.slug}: ${r.msg}`);
  }
}
const missing = Object.keys(FIXES).filter((s) => !results.some((r) => r.slug === s));
for (const s of missing) {
  failed++;
  console.log(`  FAIL  ${s}: not found in content/problems`);
}
console.log(`\n  ${results.length - (failed - missing.length)} passed, ${failed} failed`);
if (!WRITE && failed === 0) console.log("  verify-only — pass --write to append the fences\n");
process.exit(failed ? 1 : 0);
