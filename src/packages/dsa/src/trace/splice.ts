/**
 * Plan the instrumentation edits for a C++ translation unit.
 *
 * Works from **byte offsets** produced by clang's own
 * `-Xclang -ast-dump=json`, not from a hand-written parser. That choice is
 * driven entirely by the one hard requirement:
 *
 *   🛑 A learner must never see a compile error caused by OUR injection when
 *      their own code is valid.
 *
 * A scanner can only say "I think this is a statement boundary"; the AST gives
 * boundaries from the compiler that is about to compile the file. A scanner's
 * failures are input-dependent — it passes 200 fixtures and then someone writes
 * `for (auto& [k, v] : m) if (v) cnt[k]++;` and gets a syntax error in code
 * they can see is correct.
 *
 * ## Four properties of the dump that this code is built around
 *
 * 1. **`<bits/stdc++.h>` is absent.** `-ast-dump=json` does not re-emit
 *    declarations loaded from a PCH, so the dump is 120 KB for simple code
 *    rather than hundreds of MB. The PCH shipped for speed also made this
 *    approach viable.
 * 2. **`loc.line` is elided when unchanged** from the previous node — two
 *    thirds of statement nodes have no line at all — but `offset` is ALWAYS
 *    present. So line numbers are derived from offsets here, never read.
 * 3. **Template instantiations re-emit the same offsets**, so splice points
 *    must be deduped by offset or the injection happens twice.
 * 4. **Range-for desugaring injects `__range1`, `__begin1`, `__end1`**, which
 *    must be filtered out of watch lists.
 */

/** A clang AST node, as far as this module cares. */
export interface AstNode {
  id?: string;
  kind?: string;
  name?: string;
  type?: { qualType?: string };
  loc?: { offset?: number; file?: string; line?: number; includedFrom?: unknown };
  /** Present on IfStmt. Positional branch extraction depends on it. */
  hasElse?: boolean;
  range?: { begin?: { offset?: number; tokLen?: number }; end?: { offset?: number; tokLen?: number } };
  inner?: AstNode[];
}

export interface SplicePoint {
  /** Byte offset in the ORIGINAL source to insert before. */
  offset: number;
  /** 1-based line in the original source, derived from the offset. */
  line: number;
  /** Variables in scope at this point, declaration order. */
  watch: readonly string[];
  /** Enclosing loop site id, 0 when none. */
  site: number;
}

export interface SplicePlan {
  readonly points: readonly SplicePoint[];
  /** Function-body offsets needing a depth guard. */
  readonly depthGuards: readonly { offset: number; line: number }[];
  /**
   * Loop-body offsets needing an iteration counter.
   *
   * 🛑 Without these, `loop_hits[site]` never increments and the per-loop cap
   * can never fire — so one hot loop would consume the entire step budget and
   * nothing after it would ever be traced. The global step cap alone does not
   * give that property.
   */
  readonly ticks: readonly { offset: number; site: number }[];
  /**
   * Brace-less bodies to wrap.
   *
   * 🛑 Required for CORRECTNESS, not tidiness. Injecting before a brace-less
   * body turns `if (c) stmt;` into `if (c) { injected } stmt;` — which compiles
   * and moves the statement out of the branch. A silent semantic change is far
   * worse than a compile error.
   */
  readonly wraps: readonly { begin: number; end: number }[];
  readonly sites: number;
  /** Constructs deliberately skipped, with a reason, for the coverage badge. */
  readonly skipped: readonly { line: number; reason: string }[];
  readonly statementsFound: number;
}

/**
 * 🛑 THE CENTRAL CORRECTION, and the reason GATE A exists.
 *
 * A first attempt injected before any node whose KIND looked statement-ish.
 * That is wrong: most of those nodes are expressions nested inside a statement,
 * so the injection landed mid-expression and produced garbage —
 *
 *     cout << if(__az::on(...)){...}a.size()
 *     for (if(__az::on(...)){...}int i = 0; ...)
 *
 * and, far worse, one case compiled while changing meaning:
 *
 *     if (c) stmt;   ->   if (c) { injected } stmt;
 *
 * which silently moves `stmt` out of the branch. A compile error is recoverable;
 * a semantic change that compiles is the failure this whole feature must not
 * have.
 *
 * So positions come from STRUCTURE, not from kind: the direct children of a
 * `CompoundStmt` are the statement positions, full stop. A brace-less branch or
 * loop body is not one, so it gets WRAPPED in braces using the AST's own
 * begin/end offsets — which is precisely the thing a token scanner could not
 * have done reliably.
 */

const LOOP_KINDS = new Set(["ForStmt", "CXXForRangeStmt", "WhileStmt", "DoStmt"]);

/** Statements that carry sub-statements needing their own handling. */
const BRANCH_KINDS = new Set(["IfStmt", "SwitchStmt", ...LOOP_KINDS]);

/**
 * Types excluded from watch lists. An iterator or a stream has no useful
 * printed form, and a lambda's closure type cannot be named.
 */
const EXCLUDED_TYPES: readonly RegExp[] = [
  /\biterator\b/,
  /\b(?:basic_)?[io]stream\b/,
  /\bistringstream\b/,
  /\bostringstream\b/,
  /\(lambda at /,
  /\bstd::function</,
  /\(\*\)\(/,
];

/** Compiler-generated, from range-for desugaring. */
const isGenerated = (name: string): boolean => name.startsWith("__");

function isWatchable(node: AstNode): boolean {
  const name = node.name;
  if (!name || isGenerated(name)) return false;
  const qual = node.type?.qualType ?? "";
  return !EXCLUDED_TYPES.some((re) => re.test(qual));
}

/**
 * Clang reports UTF-8 BYTE offsets; JS string indices are UTF-16 code units.
 *
 * 🛑 Any non-ASCII character earlier in the file makes the byte offset run
 * ahead of the string index — an em-dash in a comment is 3 bytes but 1 char, so
 * it shifts everything after it by 2. The corpus editorials are full of them,
 * and the result was injections landing INSIDE identifiers:
 *
 *     coif(__az::on(...)){...}ut << cur->val    (from "cout")
 *     loif(__az::on(...)){...}ng long left      (from "long long")
 *
 * The adversarial catalogue is pure ASCII and could never have caught this.
 * Every offset from the AST must be translated before it is used as an index.
 */
export function byteToIndex(source: string): (byteOffset: number) => number {
  // Prefix byte offset of each character index.
  const bytes: number[] = new Array(source.length + 1);
  let b = 0;
  for (let i = 0; i < source.length; i++) {
    bytes[i] = b;
    const code = source.codePointAt(i) ?? 0;
    if (code < 0x80) b += 1;
    else if (code < 0x800) b += 2;
    else if (code < 0x10000) b += 3;
    else { b += 4; i++; bytes[i] = b; } // surrogate pair: one code point, two units
  }
  bytes[source.length] = b;

  return (byteOffset: number) => {
    let lo = 0;
    let hi = source.length;
    while (lo < hi) {
      const mid = lo + Math.ceil((hi - lo) / 2);
      if ((bytes[mid] ?? 0) <= byteOffset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
}

/** Offset -> 1-based line, via one prefix pass over the source. */
export function lineIndex(source: string): (offset: number) => number {
  const starts: number[] = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") starts.push(i + 1);
  }
  return (offset: number) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = lo + Math.ceil((hi - lo) / 2);
      if ((starts[mid] ?? 0) <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

/**
 * Byte ranges covered by preprocessor directives.
 *
 * A statement originating inside a `#define` has locations pointing into the
 * macro definition, so instrumenting it would attach a frame to the wrong line.
 * Those are skipped — silently wrong line numbers are worse than a gap.
 */
export function directiveRanges(source: string): readonly [number, number][] {
  const out: [number, number][] = [];
  let i = 0;
  const n = source.length;
  while (i < n) {
    let j = i;
    while (j < n && (source[j] === " " || source[j] === "\t")) j++;
    if (source[j] === "#") {
      const start = i;
      while (j < n) {
        if (source[j] === "\\" && source[j + 1] === "\n") {
          j += 2;
          continue;
        }
        if (source[j] === "\n") break;
        j++;
      }
      out.push([start, j]);
    }
    while (j < n && source[j] !== "\n") j++;
    i = j + 1;
  }
  return out;
}

const inAnyRange = (offset: number, ranges: readonly [number, number][]): boolean =>
  ranges.some(([a, b]) => offset >= a && offset <= b);

/** Walk the dump and produce a plan. */
export function planSplices(ast: AstNode, source: string): SplicePlan {
  const toIndex = byteToIndex(source);
  const toLine = lineIndex(source);
  const directives = directiveRanges(source);

  const points: SplicePoint[] = [];
  const depthGuards: { offset: number; line: number }[] = [];
  const ticks: { offset: number; site: number }[] = [];
  const wraps: { begin: number; end: number }[] = [];
  const skipped: { line: number; reason: string }[] = [];
  const seen = new Set<number>();
  let sites = 0;
  let statementsFound = 0;

  /**
   * Scope chain. A scope marked `barrier` hides everything OUTSIDE it.
   *
   * 🛑 Needed for lambdas. Inside `[](int v) { … }` with no capture-default, an
   * enclosing local cannot be named at all — emitting a watch for it fails with
   * "cannot be implicitly captured in a lambda with no capture-default". Rather
   * than try to read the capture list, be conservative: a lambda body watches
   * only what it declares itself.
   */
  const scopes: { names: string[]; barrier: boolean }[] = [];
  const pushScope = (barrier = false) => scopes.push({ names: [], barrier });
  const addName = (name: string) => scopes[scopes.length - 1]?.names.push(name);

  const visibleWatch = (): string[] => {
    const got = new Set<string>();
    const out: string[] = [];
    // Start after the innermost barrier.
    let from = 0;
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (scopes[i]?.barrier) { from = i; break; }
    }
    for (const scope of scopes.slice(from)) {
      for (const name of scope.names) {
        if (!got.has(name)) {
          got.add(name);
          out.push(name);
        }
      }
    }
    // Keeps a record small and the UI legible; a 40-variable frame helps nobody.
    return out.slice(0, 12);
  };

  /** Record a step at a position already known to be a statement position. */
  const addPoint = (offset: number, site: number): void => {
    // Template instantiations re-emit the same offsets, so dedupe or inject
    // twice.
    if (seen.has(offset)) return;
    if (inAnyRange(offset, directives)) {
      skipped.push({ line: toLine(offset), reason: "inside a macro definition" });
      return;
    }
    seen.add(offset);
    points.push({ offset, line: toLine(offset), watch: visibleWatch(), site });
  };

  /** Declarations in this statement become visible to LATER statements. */
  const declare = (node: AstNode): void => {
    if (node.kind !== "DeclStmt") return;
    for (const decl of node.inner ?? []) {
      if (decl.kind === "VarDecl" && isWatchable(decl)) {
        addName(decl.name as string);
      }
    }
  };

  /** End offset of a node, inclusive of its last token. */
  const endOf = (node: AstNode): number | undefined => {
    const e = node.range?.end;
    if (e?.offset === undefined) return undefined;
    // tokLen is in bytes too, so translate the END of the token.
    return toIndex(e.offset + (e.tokLen ?? 0));
  };

  /** One statement in statement position. */
  const doStatement = (stmt: AstNode, site: number): void => {
    const kind = stmt.kind ?? "";

    /*
     * 🛑 A case or default LABEL is not a statement position. Injecting before
     * it produces `{ injected case 1: … }`, which does not parse. Step the
     * labelled statements instead.
     */
    if (kind === "CaseStmt" || kind === "DefaultStmt" || kind === "LabelStmt") {
      for (const child of stmt.inner ?? []) {
        if (isStatement(child)) doStatement(child, site);
      }
      return;
    }

    const beginByte = stmt.range?.begin?.offset ?? stmt.loc?.offset;
    const begin = beginByte === undefined ? undefined : toIndex(beginByte);
    statementsFound++;
    if (begin !== undefined) addPoint(begin, site);
    declare(stmt);
    descend(stmt, site);
  };

  /**
   * A sub-statement of a branch or loop. A `CompoundStmt` is handled normally;
   * anything else is a brace-less body and must be WRAPPED before anything can
   * be injected into it.
   */
  const doBody = (body: AstNode, site: number, tick: boolean): void => {
    if (body.kind === "CompoundStmt") {
      const openByte = body.range?.begin?.offset;
      const open = openByte === undefined ? undefined : toIndex(openByte);
      if (tick && open !== undefined) ticks.push({ offset: open + 1, site });
      doBlock(body, site);
      return;
    }
    // Null statement — `while (…) ;` — has nothing to trace.
    if (body.kind === "NullStmt") return;

    const beginByte = body.range?.begin?.offset ?? body.loc?.offset;
    const begin = beginByte === undefined ? undefined : toIndex(beginByte);
    const end = endOf(body);
    if (begin === undefined || end === undefined) {
      skipped.push({ line: begin === undefined ? 0 : toLine(begin), reason: "body with no range" });
      return;
    }

    /*
     * 🛑 Extend past the trailing semicolon. A node range ends at the last
     * TOKEN, so `cout << "big"` excludes its `;` and the wrap produced
     * `{cout << "big"};` — "expected ; after expression".
     */
    let close = end;
    while (close < source.length && /s/.test(source[close] ?? "")) close++;
    if (source[close] === ";") close++;
    else close = end;
    wraps.push({ begin, end: close });
    if (tick) ticks.push({ offset: begin, site });
    pushScope();
    doStatement(body, site);
    scopes.pop();
  };

  /** The statement list of a compound statement — the only statement positions. */
  const doBlock = (block: AstNode, site: number): void => {
    pushScope();
    for (const stmt of block.inner ?? []) doStatement(stmt, site);
    scopes.pop();
  };

  /** Recurse into a statement's sub-STATEMENTS only, never its expressions. */
  const descend = (stmt: AstNode, site: number): void => {
    const kind = stmt.kind ?? "";

    if (kind === "CompoundStmt") {
      doBlock(stmt, site);
      return;
    }

    if (LOOP_KINDS.has(kind)) {
      const mySite = ++sites;
      // A loop's own declarations (the init, or a range-for's variable) are in
      // scope for its body.
      pushScope();
      for (const child of stmt.inner ?? []) {
        if (child.kind === "DeclStmt") declare(child);
        if (child.kind === "VarDecl" && isWatchable(child)) {
          addName(child.name as string);
        }
      }
      const body = findBody(stmt);
      if (body) doBody(body, mySite, true);
      scopes.pop();
      return;
    }

    if (kind === "IfStmt" || kind === "SwitchStmt") {
      /*
       * 🛑 Clang orders an IfStmt as [init?, var?, cond, then, else?]. The
       * CONDITION is an expression, and kind-sniffing wrongly accepts it as a
       * body — wrapping it produced `if ({x > 2})`. Take the branches from the
       * END instead, using hasElse, which is positional and cannot misfire.
       */
      const kids = stmt.inner ?? [];
      const branchCount = kind === "IfStmt" ? (stmt.hasElse ? 2 : 1) : 1;
      for (const child of kids.slice(Math.max(0, kids.length - branchCount))) {
        doBody(child, site, false);
      }
      return;
    }

    if (kind === "LambdaExpr") {
      // The body hangs off the generated CXXRecordDecl's operator().
      const record = stmt.inner?.find((c) => c.kind === "CXXRecordDecl");
      const method = record?.inner?.find((c) => c.kind === "CXXMethodDecl");
      const body = method?.inner?.find((c) => c.kind === "CompoundStmt");
      if (body) {
        pushScope(true);
        for (const param of method?.inner ?? []) {
          if (param.kind === "ParmVarDecl" && isWatchable(param)) addName(param.name as string);
        }
        doBlock(body, 0);
        scopes.pop();
      }
      return;
    }

    // Any other statement kind: look only for nested compound statements, which
    // is how a bare `{ … }` block appears.
    for (const child of stmt.inner ?? []) {
      if (child.kind === "CompoundStmt") doBlock(child, site);
      else if (child.inner) descend(child, site);
    }
  };

  /**
   * A loop body's position depends on the loop.
   *
   * 🛑 for / range-for / while put the body LAST, after the init, condition and
   * increment. A do-while puts it FIRST — `do { … } while (cond)` is ordered
   * [body, cond] — so taking the last child wrapped the CONDITION:
   * `while ({ tick(); cond })`.
   */
  const findBody = (loop: AstNode): AstNode | undefined => {
    const kids = (loop.inner ?? []).filter(isStatement);
    if (loop.kind === "DoStmt") return kids[0];
    return kids[kids.length - 1];
  };

  /** Statement-ish for the purpose of being a BODY, not of being a position. */
  function isStatement(node: AstNode): boolean {
    const k = node.kind ?? "";
    return (
      k === "CompoundStmt" ||
      k === "NullStmt" ||
      k === "DeclStmt" ||
      k === "ReturnStmt" ||
      k === "BreakStmt" ||
      k === "ContinueStmt" ||
      k === "GotoStmt" ||
      k === "LabelStmt" ||
      k === "CaseStmt" ||
      k === "DefaultStmt" ||
      BRANCH_KINDS.has(k) ||
      // An expression used as a statement, e.g. a brace-less `sum += i;`.
      k.endsWith("Operator") ||
      k.endsWith("CallExpr") ||
      k === "CXXThrowExpr"
    );
  }

  /** Top level: find function bodies in THIS file. */
  const findFunctions = (node: AstNode): void => {
    const kind = node.kind ?? "";
    if (kind === "FunctionDecl" || kind === "CXXMethodDecl") {
      const body = node.inner?.find((c) => c.kind === "CompoundStmt");
      const bodyOffsetByte = body?.range?.begin?.offset;
      const bodyOffset = bodyOffsetByte === undefined ? undefined : toIndex(bodyOffsetByte);
      const fromElsewhere = node.loc?.includedFrom !== undefined || node.loc?.file !== undefined;

      if (body && bodyOffset !== undefined && !fromElsewhere) {
        if (node.inner?.some((c) => c.kind === "TemplateTypeParmDecl")) {
          skipped.push({ line: toLine(bodyOffset), reason: "uninstantiated template" });
        } else {
          depthGuards.push({ offset: bodyOffset + 1, line: toLine(bodyOffset) });
          pushScope();
          for (const param of node.inner ?? []) {
            if (param.kind === "ParmVarDecl" && isWatchable(param)) {
              addName(param.name as string);
            }
          }
          doBlock(body, 0);
          scopes.pop();
        }
      }
      return;
    }
    for (const child of node.inner ?? []) findFunctions(child);
  };

  findFunctions(ast);

  return {
    points: [...points].sort((a, b) => b.offset - a.offset),
    depthGuards,
    ticks,
    wraps,
    sites,
    skipped,
    statementsFound,
  };
}

/** Render the plan into instrumented source. */
export function applyPlan(source: string, plan: SplicePlan, prelude: string): string {
  interface Edit {
    at: number;
    text: string;
    /** Lower value ends up further LEFT at the same offset. */
    rank: number;
  }

  const edits: Edit[] = [];

  for (const g of plan.depthGuards) {
    edits.push({ at: g.offset, text: `__az::Depth __az_d(${g.line});`, rank: 1 });
  }

  // Braces first in offset terms, but all edits are applied right-to-left
  // below, so ordering between the arrays does not matter — only the sort does.
  for (const w of plan.wraps) {
    // rank 0: the opening brace must precede any step injected at the same
    // offset, so the step lands INSIDE the braces.
    edits.push({ at: w.begin, text: "{", rank: 0 });
    edits.push({ at: w.end, text: "}", rank: 9 });
  }

  for (const t of plan.ticks) {
    edits.push({ at: t.offset, text: `__az::tick(${t.site});`, rank: 2 });
  }

  for (const p of plan.points) {
    const watches = p.watch
      .map((name, i) => `AZ_V(${i === 0 ? 1 : 0},${name});`)
      .join("");
    edits.push({
      at: p.offset,
      text: `if(__az::on(${p.line},${p.site})){${watches}__az::end();}`,
      rank: 3,
    });
  }

  // Right-to-left so earlier offsets stay valid. A stable tie-break keeps the
  // output deterministic when a guard and a step share an offset.
  // Right-to-left so earlier offsets stay valid. At equal offsets, the HIGHER
  // rank is applied first and therefore ends up further right.
  edits.sort((a, b) => b.at - a.at || b.rank - a.rank);

  let out = source;
  for (const e of edits) {
    out = out.slice(0, e.at) + e.text + out.slice(e.at);
  }
  return prelude + out;
}
