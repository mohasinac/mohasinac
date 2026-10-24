/**
 * Step debugger over a captured trace.
 *
 * The realisation that makes this cheap: **nothing here re-executes anything.**
 * The whole trace is already in memory and capped at a few hundred frames, so
 * every debugger operation is a seek over an array. That is why `continue`,
 * `step over` and `step out` all cost the same, and why their REVERSE
 * counterparts exist at all — running a real debugger backwards is a research
 * project; seeking backwards over an array is a `for` loop.
 *
 * 🛑 Step-over and step-out are uncomputable without `frame.depth`. A frame
 * missing it is treated as depth 0, which degrades those two commands to a
 * plain step rather than throwing or seeking somewhere arbitrary.
 */

import type { TraceFrame, TraceValue } from "./types.ts";

/* -------------------------------------------------------------- navigation */

export type StepCommand =
  | "into" // exactly one frame — the plain step
  | "over" // next frame at the same depth or shallower
  | "out" // next frame strictly shallower
  | "continue"; // next frame on a breakpoint line

export interface SeekOptions {
  readonly frames: readonly TraceFrame[];
  readonly from: number;
  /** +1 forward, -1 backward. Backward is free here and impossible in gdb. */
  readonly direction?: 1 | -1;
  readonly breakpoints?: ReadonlySet<number>;
  /** line -> condition source, e.g. `"i == 5"`. Lines absent are unconditional. */
  readonly conditions?: ReadonlyMap<number, string>;
}

const depthOf = (f: TraceFrame | undefined): number => f?.depth ?? 0;

/**
 * Where a command lands. Returns the ORIGINAL index when there is nowhere to
 * go, so a caller can treat "no movement" as "ran to the end" without a
 * separate sentinel.
 */
export function seek(command: StepCommand, opts: SeekOptions): number {
  const { frames, from } = opts;
  const dir = opts.direction ?? 1;
  const n = frames.length;
  if (n === 0) return 0;

  const clamped = Math.min(Math.max(from, 0), n - 1);
  const first = clamped + dir;
  if (first < 0 || first >= n) return clamped;

  if (command === "into") return first;

  if (command === "continue") {
    const bps = opts.breakpoints;
    // No breakpoints means "run to the end", not "do nothing" — that is what
    // continue means in every debugger.
    if (!bps || bps.size === 0) return dir > 0 ? n - 1 : 0;
    for (let i = first; i >= 0 && i < n; i += dir) {
      const f = frames[i];
      if (f?.line === undefined || !bps.has(f.line)) continue;
      const cond = opts.conditions?.get(f.line);
      if (cond && cond.trim() !== "" && !evaluateCondition(cond, f.vars)) continue;
      return i;
    }
    // Ran off the end with nothing hit: land at the boundary, as continue does.
    return dir > 0 ? n - 1 : 0;
  }

  const baseDepth = depthOf(frames[clamped]);
  const want = command === "over" ? (d: number) => d <= baseDepth : (d: number) => d < baseDepth;

  for (let i = first; i >= 0 && i < n; i += dir) {
    if (want(depthOf(frames[i]))) return i;
  }
  // Nothing shallower ahead — step-out from `main` is the usual case. Running
  // to the boundary is more useful than refusing to move.
  return dir > 0 ? n - 1 : 0;
}

/** Lines that have at least one frame, so the gutter only offers real breakpoints. */
export function executableLines(frames: readonly TraceFrame[]): ReadonlySet<number> {
  const out = new Set<number>();
  for (const f of frames) if (f.line !== undefined) out.add(f.line);
  return out;
}

/* ------------------------------------------------- conditions and watches */

/**
 * 🛑 NO `eval`, NO `new Function`.
 *
 * Production CSP is `script-src 'self' 'nonce-…' 'wasm-unsafe-eval'` — note
 * `'unsafe-eval'` is ABSENT — while dev CSP includes it. So the one-line
 * `new Function("return " + expr)` implementation of conditional breakpoints
 * works perfectly on localhost and dies in production. This project has
 * already shipped a silently non-interactive page once for an adjacent reason;
 * a hand-written parser is thirty lines and cannot execute anything at all.
 *
 * Grammar, deliberately tiny:
 *
 *     expr   := term (("&&" | "||") term)*
 *     term   := operand (op operand)?
 *     op     := "==" | "!=" | "<=" | ">=" | "<" | ">"
 *     operand:= number | 'string' | "string" | true | false | null
 *             | identifier ( "." identifier | "[" number "]" )*
 *
 * `&&` binds tighter than `||`, as in C++. A bare operand is truthy-tested, so
 * `found` works as a condition on its own.
 */

export type CondValue = TraceValue | undefined;

/** Resolve `a.b[2]` against a frame's vars. Returns undefined if any hop misses. */
export function resolvePath(path: string, vars: Readonly<Record<string, TraceValue>>): CondValue {
  const parts = path.match(/[A-Za-z_$][\w$]*|\[\d+\]/g);
  if (!parts || parts.length === 0) return undefined;
  const head = parts[0];
  if (head === undefined || head.startsWith("[")) return undefined;

  // 🛑 hasOwn, not a bare index. `vars["__proto__"]` resolves to
  // Object.prototype — an object, therefore truthy — so `__proto__` as a
  // condition would fire on every frame. `constructor` and `toString` are the
  // same hazard. Frames only ever carry own properties, so this costs nothing.
  if (!Object.hasOwn(vars, head)) return undefined;

  let cur: CondValue = vars[head];
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (part === undefined) return undefined;
    if (part.startsWith("[")) {
      const idx = Number(part.slice(1, -1));
      cur = Array.isArray(cur) ? cur[idx] : undefined;
    } else {
      // Frames carry arrays and scalars, never objects, so a `.field` hop has
      // nothing to resolve against. Saying undefined beats inventing a value.
      return undefined;
    }
    if (cur === undefined) return undefined;
  }
  return cur;
}

const NUMBER_RE = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;

function parseOperand(raw: string, vars: Readonly<Record<string, TraceValue>>): CondValue {
  const s = raw.trim();
  if (s === "") return undefined;
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null") return null;
  if (NUMBER_RE.test(s)) return Number(s);
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    return s.slice(1, -1);
  }
  return resolvePath(s, vars);
}

const truthy = (v: CondValue): boolean =>
  v !== undefined && v !== null && v !== false && v !== 0 && v !== "";

/** Longest operators first, or `<` would shadow `<=`. */
const OPERATORS = ["==", "!=", "<=", ">=", "<", ">"] as const;

function evaluateTerm(src: string, vars: Readonly<Record<string, TraceValue>>): boolean {
  const term = src.trim();
  if (term === "") return false;

  for (const op of OPERATORS) {
    const at = term.indexOf(op);
    // Skip index 0: a leading operator is malformed, not a comparison.
    if (at <= 0) continue;
    const left = parseOperand(term.slice(0, at), vars);
    const right = parseOperand(term.slice(at + op.length), vars);
    if (left === undefined || right === undefined) return false;

    // Compare numerically when both sides are numbers, lexically otherwise.
    // Arrays compare only for equality, by their rendered form.
    const l = Array.isArray(left) ? JSON.stringify(left) : left;
    const r = Array.isArray(right) ? JSON.stringify(right) : right;

    switch (op) {
      case "==":
        return l === r;
      case "!=":
        return l !== r;
      case "<":
        return (l as number) < (r as number);
      case "<=":
        return (l as number) <= (r as number);
      case ">":
        return (l as number) > (r as number);
      case ">=":
        return (l as number) >= (r as number);
    }
  }

  // No operator: truthy-test the operand, so `found` is a valid condition.
  if (term.startsWith("!")) return !truthy(parseOperand(term.slice(1), vars));
  return truthy(parseOperand(term, vars));
}

/**
 * Evaluate a breakpoint condition against one frame's variables.
 *
 * Returns **false** on anything it cannot parse or resolve. That direction is
 * chosen deliberately: a condition that silently defaults to TRUE would turn a
 * typo into an unconditional breakpoint and look like the debugger ignoring
 * the condition. Failing closed is visible — the breakpoint never fires — and
 * the UI can flag an unparseable condition explicitly.
 */
export function evaluateCondition(
  src: string,
  vars: Readonly<Record<string, TraceValue>>,
): boolean {
  const expr = src.trim();
  if (expr === "") return true;

  // `||` first so it binds loosest.
  const ors = splitTop(expr, "||");
  if (ors.length > 1) return ors.some((part) => evaluateCondition(part, vars));

  const ands = splitTop(expr, "&&");
  if (ands.length > 1) return ands.every((part) => evaluateCondition(part, vars));

  return evaluateTerm(expr, vars);
}

/** Split on an operator that is not inside quotes or brackets. */
function splitTop(src: string, op: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === "[" || c === "(") depth++;
    else if (c === "]" || c === ")") depth--;
    else if (depth === 0 && src.startsWith(op, i)) {
      out.push(src.slice(start, i));
      i += op.length - 1;
      start = i + 1;
    }
  }
  out.push(src.slice(start));
  return out.filter((s) => s.trim() !== "");
}

/**
 * Is a condition well-formed enough to be worth keeping? Used to flag a typo in
 * the UI rather than leaving someone to wonder why their breakpoint is silent.
 */
export function isConditionParseable(src: string): boolean {
  const expr = src.trim();
  if (expr === "") return true;
  // No grouping and no arithmetic in the grammar, so parentheses and operators
  // like * / % are rejected rather than silently ignored. `+`/`-` stay, for
  // negative literals.
  if (/[^\w\s$."'[\]<>=!&|+-]/.test(expr)) return false;

  const terms = splitTop(expr, "||").flatMap((p) => splitTop(p, "&&"));
  if (terms.length === 0) return false;
  return terms.every((t) => {
    const term = t.trim().replace(/^!/, "").trim();
    for (const op of OPERATORS) {
      const at = term.indexOf(op);
      if (at > 0) {
        return isOperandShape(term.slice(0, at)) && isOperandShape(term.slice(at + op.length));
      }
    }
    // A bare term must still BE an operand. Without this check `f(i)` and other
    // arbitrary text passed as "well-formed" purely for being non-empty.
    return isOperandShape(term);
  });
}

/**
 * Does this text have the shape of an operand? A structural check, not a
 * resolution — a variable simply not in scope is still well-formed, and
 * reporting "unparseable" for it would be wrong.
 */
function isOperandShape(raw: string): boolean {
  const s = raw.trim();
  if (s === "") return false;
  if (s === "true" || s === "false" || s === "null") return true;
  if (NUMBER_RE.test(s)) return true;
  if (/^"[^"]*"$/.test(s) || /^'[^']*'$/.test(s)) return true;
  return /^[A-Za-z_$][\w$]*(?:\[\d+\])*$/.test(s);
}

/** Evaluate a watch expression. Same restricted grammar, so same safety. */
export function evaluateWatch(
  src: string,
  vars: Readonly<Record<string, TraceValue>>,
): { readonly ok: true; readonly value: TraceValue } | { readonly ok: false } {
  const expr = src.trim();
  if (expr === "") return { ok: false };
  // A comparison is a legitimate watch — "is lo < hi right now?".
  if (OPERATORS.some((op) => expr.indexOf(op) > 0)) {
    return { ok: true, value: evaluateCondition(expr, vars) };
  }
  const v = parseOperand(expr, vars);
  return v === undefined ? { ok: false } : { ok: true, value: v };
}
