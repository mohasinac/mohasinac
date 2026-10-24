import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { extractReferenceProgram, looksLikeSketch } from "../src/scenarios/reference-program.ts";

describe("extractReferenceProgram", () => {
  it("takes the LAST complete program, not the first", () => {
    // 🛑 Editorials here are written brute-force-first and build to the
    // optimal solution. Tracing the FIRST runnable fence would illustrate the
    // approach the editorial spends its length arguing against.
    const editorial = [
      "## Brute force",
      "```cpp",
      "int main() { /* O(n^2) */ return 1; }",
      "```",
      "## Optimal",
      "```cpp",
      "int main() { /* O(n) */ return 2; }",
      "```",
    ].join("\n");
    const r = extractReferenceProgram(editorial);
    assert.equal(r?.source.includes("O(n)"), true);
    assert.equal(r?.source.includes("O(n^2)"), false);
    assert.equal(r?.fenceIndex, 2);
    assert.equal(r?.fenceCount, 2);
  });

  it("skips a helper-only fence and finds the complete one before it", () => {
    const editorial = [
      "```cpp",
      "int main() { return 0; }",
      "```",
      "A helper, for reference:",
      "```cpp",
      "ListNode* reverse(ListNode* head) { return head; }",
      "```",
    ].join("\n");
    const r = extractReferenceProgram(editorial);
    assert.equal(r?.source.includes("int main"), true);
    assert.equal(r?.fenceIndex, 1);
  });

  it("returns null when no fence has an entry point", () => {
    const editorial = ["```cpp", "int helper(int x) { return x; }", "```"].join("\n");
    assert.equal(extractReferenceProgram(editorial), null);
  });

  it("returns null for an editorial with no code at all", () => {
    assert.equal(extractReferenceProgram("Just prose."), null);
    assert.equal(extractReferenceProgram(""), null);
  });

  it("ignores fences in another language, including their bodies", () => {
    // A python body containing the words `int main(` must not be mistaken for
    // a C++ program.
    const editorial = [
      "```python",
      "# int main() { } is not python",
      "```",
      "```cpp",
      "int main() { return 0; }",
      "```",
    ].join("\n");
    const r = extractReferenceProgram(editorial);
    assert.equal(r?.source.trim(), "int main() { return 0; }");
    assert.equal(r?.fenceCount, 1);
  });

  it("ignores an untagged fence", () => {
    const editorial = ["```", "int main() { return 9; }", "```"].join("\n");
    assert.equal(extractReferenceProgram(editorial), null);
  });

  it("does not match a fence with an info string that is not a bare word", () => {
    // Mirrors Markdown.tsx: such a fence does not render as code there either,
    // so extracting it would show something the learner never saw.
    const editorial = ['```cpp title="x"', "int main() { return 0; }", "```"].join("\n");
    assert.equal(extractReferenceProgram(editorial), null);
  });

  it("keeps a multi-line program intact, indentation and blank lines included", () => {
    const program = [
      "#include <bits/stdc++.h>",
      "using namespace std;",
      "",
      "int main() {",
      "    int n;",
      "    cin >> n;",
      "    cout << n << '\\n';",
      "}",
    ].join("\n");
    const r = extractReferenceProgram(["```cpp", program, "```"].join("\n"));
    assert.equal(r?.source, `${program}\n`);
  });

  it("recovers the program from an unterminated fence", () => {
    // A truncated editorial is a CONTENT bug. Dropping the program silently
    // would make it look like a tracer bug instead.
    const r = extractReferenceProgram(["```cpp", "int main() { return 0; }"].join("\n"));
    assert.equal(r?.source.trim(), "int main() { return 0; }");
  });

  it("matches main with unusual but legal spacing", () => {
    for (const decl of ["int main()", "int  main ( )", "int\tmain()"]) {
      const r = extractReferenceProgram(["```cpp", `${decl} { return 0; }`, "```"].join("\n"));
      assert.notEqual(r, null, decl);
    }
  });

  it("ends the source with exactly one newline", () => {
    const r = extractReferenceProgram(["```cpp", "int main() { return 0; }", "", "", "```"].join("\n"));
    assert.equal(r?.source.endsWith("}\n"), true);
  });
});

describe("sketch detection", () => {
  it("skips a placeholder main and keeps looking", () => {
    // 🛑 The exact shape that shipped in seven editorials: it has an entry
    // point, it compiles, and it reads nothing — so it traced a diagram of
    // nothing while every check passed.
    const editorial = [
      "```cpp",
      "int main() { int real = 1; std::cin >> real; std::cout << real; }",
      "```",
      "## A sketch of the idea",
      "```cpp",
      "int main() {",
      "    TreeNode* root = nullptr;   // replaced by read_tree() in your solution",
      "    std::cout << depth(root);",
      "}",
      "```",
    ].join("\n");
    const r = extractReferenceProgram(editorial);
    assert.equal(r?.source.includes("std::cin"), true, "should pick the real program");
    assert.equal(r?.source.includes("replaced by"), false);
    assert.equal(r?.fenceIndex, 1);
  });

  it("returns null when every candidate is a sketch", () => {
    // Better than handing back something that compiles and does nothing.
    const editorial = [
      "```cpp",
      "int main() { /* ... read_tree() as given ... */ }",
      "```",
    ].join("\n");
    assert.equal(extractReferenceProgram(editorial), null);
  });

  it("recognises each placeholder phrase", () => {
    for (const phrase of [
      "// replaced by read_tree() in your solution",
      "// ... read_tree() as given ...",
      "// the rest is omitted for brevity",
      "// ...",
    ]) {
      assert.equal(looksLikeSketch(`int main() {\n    ${phrase}\n}`), true, phrase);
    }
  });

  it("does not flag an ordinary program", () => {
    assert.equal(
      looksLikeSketch("int main() {\n    int n;\n    std::cin >> n;\n    std::cout << n;\n}"),
      false,
    );
  });
});
