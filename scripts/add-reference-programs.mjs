/**
 * Give the three editorials that lack a complete `int main()` one, so every
 * problem has a reference visualization.
 *
 * 🛑 Each program is COMPILED AND RUN against the problem's sample cases before
 * it is written. Hand-authoring C++ into a JSON string and hoping is how the
 * three bugs in Phase 9 got in (a method declared before the struct it took,
 * an invalid `\A` escape, a miscounted 3Sum answer). The toolchain is runnable
 * from here, so there is no reason to guess.
 *
 * The programs are not invented: each is the problem's own `starterCode`
 * scaffold — which already does all the parsing — with the editorial's helper
 * spliced in at the marker comment and the output line filled in. That keeps
 * the reference identical to what a learner would write.
 *
 *   node scripts/add-reference-programs.mjs          # verify only
 *   node scripts/add-reference-programs.mjs --write  # verify, then write
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WRITE = process.argv.includes("--write");

const manifest = JSON.parse(readFileSync(join(ROOT, "public/toolchain/current.json"), "utf8"));
const base = join(ROOT, "public/toolchain", manifest.version);
const { runClang } = await import(pathToFileURL(join(base, "bundle.js")).href);
const wasi = await import(pathToFileURL(join(base, "wasi/index.js")).href);
const BITS = readFileSync(join(base, "stdc++.h"), "utf8");
const PCH = new Uint8Array(readFileSync(join(base, "stdcxx.pch")));

const CXX_FLAGS = ["-std=c++20", "-O2", "-fno-exceptions"];
const LINK_FLAGS = [`-Wl,-z,stack-size=${1024 * 1024}`, `-Wl,--max-memory=${256 * 1024 * 1024}`];
const td = new TextDecoder();

async function compile(src) {
  let stderr = "";
  try {
    const out = await runClang(
      ["clang++", ...CXX_FLAGS, "-I.", "-include-pch", "stdcxx.pch", ...LINK_FLAGS, "t.cpp", "-o", "t.wasm"],
      { "t.cpp": src, "stdcxx.pch": PCH, bits: { "stdc++.h": BITS } },
      { stderr: (b) => { if (b) stderr += td.decode(b); } },
    );
    return { ok: true, stderr, wasm: out?.["t.wasm"] };
  } catch (err) {
    return { ok: false, stderr: stderr || String(err) };
  }
}

async function run(wasmBytes, stdinText) {
  const { WASI, File, OpenFile, ConsoleStdout, PreopenDirectory } = wasi;
  let stdout = "";
  const fds = [
    new OpenFile(new File(new TextEncoder().encode(stdinText))),
    ConsoleStdout.lineBuffered((l) => { stdout += `${l}\n`; }),
    ConsoleStdout.lineBuffered(() => {}),
    new PreopenDirectory(".", new Map()),
  ];
  const instance = new WASI(["t"], [], fds);
  const inst = await WebAssembly.instantiate(await WebAssembly.compile(wasmBytes), {
    wasi_snapshot_preview1: instance.wasiImport,
  });
  try {
    instance.start(inst);
  } catch (err) {
    if (typeof err?.code !== "number") return { stdout, trap: err?.message ?? String(err) };
  }
  return { stdout, trap: "" };
}

/**
 * How each program is assembled: a `helper` inserted before `main`, and the
 * starter's marker comment replaced by the call that prints the answer.
 */
const BUILDS = {
  "linked-list-cycle": {
    helper: `bool has_cycle(ListNode* head) {
    ListNode* slow = head;
    ListNode* fast = head;

    // Checking BOTH fast and fast->next is what makes this safe: the body
    // dereferences fast->next->next, and on an even-length list fast->next
    // is the last node, whose next is null.
    while (fast && fast->next) {
        slow = slow->next;
        fast = fast->next->next;
        if (slow == fast) return true;
    }
    return false;
}`,
    // The starter's instruction comment, replaced by the answer.
    marker: /\s*\/\/ Print exactly "true" or "false"\.[\s\S]*?O\(1\) extra space\.\n/,
    body: `
    cout << (has_cycle(head) ? "true" : "false") << '\\n';
`,
  },
  "same-tree": {
    /*
     * 🛑 NOT `is_same`. `std::is_same` exists in <type_traits>, the starter
     * has `using namespace std;`, and the PCH pulls in the whole library — so
     * that name is ambiguous and the program does not compile:
     *
     *   error: reference to 'is_same' is ambiguous
     *
     * Found by compiling, not by reading. Exactly the class of bug that makes
     * hand-authoring C++ into JSON a bad idea.
     */
    helper: `bool same_tree(TreeNode* a, TreeNode* b) {
    // Both null is equal; exactly one null is not. Checking that first is
    // what makes the value comparison below safe to dereference.
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (a->val != b->val) return false;
    return same_tree(a->left, b->left) && same_tree(a->right, b->right);
}`,
    marker: /\s*\/\/ Print exactly "true" or "false"\.\n/,
    body: `
    cout << (same_tree(a, b) ? "true" : "false") << '\\n';
`,
  },
  "invert-binary-tree": {
    helper: `TreeNode* invert(TreeNode* root) {
    if (!root) return nullptr;
    // Swap first, then recurse: recursing first and swapping after works too,
    // but swapping the already-inverted children reads as a double inversion.
    std::swap(root->left, root->right);
    invert(root->left);
    invert(root->right);
    return root;
}`,
    marker: /\s*\/\/ Invert the tree, then call print_tree\(root\)\.\n/,
    body: `
    print_tree(invert(root));
`,
  },
};

/* ------------------------------------------------------------------- run it */

const files = readdirSync(join(ROOT, "content/problems")).filter((f) => f.endsWith(".json"));
let built = 0;
let failed = 0;

for (const file of files) {
  const path = join(ROOT, "content/problems", file);
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  const list = Array.isArray(parsed) ? parsed : (parsed.items ?? []);
  let touched = false;

  for (const problem of list) {
    const build = BUILDS[problem.slug];
    if (!build) continue;

    const starter = String(problem.starterCode ?? "");
    if (starter.trim() === "") {
      console.log(`  SKIP  ${problem.slug}: no starterCode to build from`);
      continue;
    }

    // Insert the helper just before main, and fill in the body.
    let source = starter.replace(/\nint main\(/, `\n${build.helper}\n\nint main(`);
    if (build.marker && build.body) {
      if (!build.marker.test(source)) {
        console.log(`  FAIL  ${problem.slug}: marker comment not found in starterCode`);
        failed++;
        continue;
      }
      source = source.replace(build.marker, build.body);
    } else {
      // No marker: the starter already prints, via a TODO the learner fills.
      // Report rather than guess at where the call goes.
      console.log(`  NOTE  ${problem.slug}: no marker configured — inspecting starter`);
    }

    const compiled = await compile(source);
    if (!compiled.ok || !compiled.wasm) {
      console.log(`  FAIL  ${problem.slug}: does not compile`);
      console.log(`        ${compiled.stderr.split("\n").slice(0, 3).join("\n        ")}`);
      failed++;
      continue;
    }

    // 🛑 Every sample case, not just the first: a program that happens to pass
    // one input is exactly how a wrong reference gets shipped.
    const samples = (problem.testCases ?? []).filter((t) => t.visibility === "sample");
    let allPass = true;
    for (const tc of samples) {
      const r = await run(compiled.wasm, tc.input);
      const got = r.stdout.replace(/[ \t]+$/gm, "").trimEnd();
      const want = String(tc.expectedOutput ?? "").replace(/[ \t]+$/gm, "").trimEnd();
      if (got !== want) {
        allPass = false;
        console.log(`  FAIL  ${problem.slug}: input ${JSON.stringify(tc.input)}`);
        console.log(`        expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}${r.trap ? ` (trap: ${r.trap})` : ""}`);
      }
    }
    if (!allPass) {
      failed++;
      continue;
    }

    console.log(`  PASS  ${problem.slug}: compiles and matches all ${samples.length} sample cases`);
    built++;

    if (WRITE) {
      const fence = `\n\n### The complete program\n\n\`\`\`cpp\n${source.trim()}\n\`\`\`\n`;
      problem.editorial = `${String(problem.editorial ?? "").trimEnd()}${fence}`;
      touched = true;
    }
  }

  if (WRITE && touched) writeFileSync(path, `${JSON.stringify(parsed, null, 2)}\n`);
}

console.log(`\n  ${built} verified, ${failed} failed`);
if (!WRITE && failed === 0) console.log("  verify-only — pass --write to append the fences\n");
process.exit(failed ? 1 : 0);
