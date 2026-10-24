/**
 * Declarative parser for a problem's stdin text.
 *
 * Inputs are plain text in a per-problem shape (`"4 9\n2 7 11 15\n"`), so Tier 1
 * needs to know what those bytes mean before it can draw them.
 *
 * 🛑 Never guess the format. A confidently mis-parsed diagram teaches something
 * false, which is strictly worse than no diagram. A problem with no descriptor
 * gets no explainer panel and the page behaves exactly as it does today.
 *
 * About ten shapes cover all 53 problems: count-then-array, two strings, grid
 * dims then rows, level-order tree with `null`, count then adjacency pairs, a
 * single integer, and a count then one spec per line.
 */

export type InputStep =
  /** Named scalars read as whitespace-separated tokens: `n`, `target`. */
  | { read: "scalars"; names: readonly string[] }
  /** `length` is a literal, or the name of an earlier scalar. */
  | { read: "array"; name: string; length: string | number }
  | { read: "matrix"; name: string; rows: string | number; cols: string | number }
  /** `count` whole lines, each kept as a string (grids of characters). */
  | { read: "lines"; name: string; count: string | number }
  /** One whole line including spaces — the `getline` problems. */
  | { read: "line"; name: string }
  /** Every remaining token. Level-order trees, where `null` is a real token. */
  | { read: "rest"; name: string };

export type InputFormat = readonly InputStep[];

export type ParsedValue = number | string | readonly (number | string)[] | readonly string[];
export type ParsedInput = Record<string, ParsedValue>;

export interface ParseFailure {
  ok: false;
  reason: string;
}
export interface ParseSuccess {
  ok: true;
  values: ParsedInput;
}
export type ParseResult = ParseSuccess | ParseFailure;

/**
 * A cursor over the raw text that can read either tokens or whole lines.
 *
 * Both modes are needed because some problems are token-oriented (`cin >> n`)
 * and some are line-oriented (`getline`), and a few are both — a count on the
 * first line followed by lines containing spaces. Tracking a single offset and
 * deriving both views from it is what keeps the two consistent; two independent
 * cursors would drift.
 */
class Cursor {
  private pos = 0;
  private readonly text: string;

  // Written out longhand rather than as a constructor parameter property:
  // `constructor(private readonly text: string)` needs code generation, which
  // node's --experimental-strip-types refuses (ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX).
  // Keeping the package strippable is what lets it be tested with zero deps.
  constructor(text: string) {
    this.text = text;
  }

  /** Next whitespace-delimited token, or null at end of input. */
  token(): string | null {
    while (this.pos < this.text.length && /\s/.test(this.text[this.pos] ?? "")) this.pos++;
    if (this.pos >= this.text.length) return null;
    const start = this.pos;
    while (this.pos < this.text.length && !/\s/.test(this.text[this.pos] ?? "")) this.pos++;
    return this.text.slice(start, this.pos);
  }

  /**
   * Rest of the current line, then advance past the newline.
   *
   * Skips a single pending newline first, so a `line` read directly after a
   * `scalars` read returns the NEXT line rather than the empty remainder of the
   * one the tokens were on. This is the same trap as needing `cin.ignore()`
   * between `>>` and `getline`, and it is handled here once.
   */
  line(): string | null {
    if (this.pos >= this.text.length) return null;
    if (this.text[this.pos] === "\r") this.pos++;
    if (this.text[this.pos] === "\n") this.pos++;
    if (this.pos >= this.text.length) return null;
    const nl = this.text.indexOf("\n", this.pos);
    const end = nl === -1 ? this.text.length : nl;
    const raw = this.text.slice(this.pos, end);
    this.pos = end;
    return raw.replace(/\r$/, "");
  }

  remainingTokens(): string[] {
    const out: string[] = [];
    for (let t = this.token(); t !== null; t = this.token()) out.push(t);
    return out;
  }
}

/** A number if it parses cleanly, otherwise the original string. */
function coerce(token: string): number | string {
  if (token === "") return token;
  const n = Number(token);
  return Number.isFinite(n) && /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(token) ? n : token;
}

/** Resolve a count that is either a literal or the name of an earlier scalar. */
function resolveCount(
  spec: string | number,
  values: ParsedInput,
): { ok: true; n: number } | ParseFailure {
  if (typeof spec === "number") {
    return Number.isInteger(spec) && spec >= 0
      ? { ok: true, n: spec }
      : { ok: false, reason: `length ${spec} is not a non-negative integer` };
  }
  const ref = values[spec];
  if (typeof ref !== "number" || !Number.isInteger(ref) || ref < 0) {
    return { ok: false, reason: `length refers to "${spec}", which is not a non-negative integer` };
  }
  return { ok: true, n: ref };
}

/** Guard against a malformed descriptor asking for a million cells. */
const MAX_CELLS = 10_000;

export function parseInput(text: string, format: InputFormat): ParseResult {
  if (format.length === 0) return { ok: false, reason: "empty input format" };

  const cursor = new Cursor(text);
  const values: ParsedInput = {};

  for (const step of format) {
    switch (step.read) {
      case "scalars": {
        for (const name of step.names) {
          const t = cursor.token();
          if (t === null) return { ok: false, reason: `input ended while reading "${name}"` };
          values[name] = coerce(t);
        }
        break;
      }

      case "array": {
        const count = resolveCount(step.length, values);
        if (!count.ok) return count;
        if (count.n > MAX_CELLS) {
          return { ok: false, reason: `array "${step.name}" of ${count.n} exceeds the draw limit` };
        }
        const arr: (number | string)[] = [];
        for (let i = 0; i < count.n; i++) {
          const t = cursor.token();
          // A short array is a descriptor/data mismatch, not something to paper
          // over — a half-drawn array is a wrong diagram.
          if (t === null) {
            return { ok: false, reason: `input ended at element ${i} of "${step.name}"` };
          }
          arr.push(coerce(t));
        }
        values[step.name] = arr;
        break;
      }

      case "matrix": {
        const rows = resolveCount(step.rows, values);
        if (!rows.ok) return rows;
        const cols = resolveCount(step.cols, values);
        if (!cols.ok) return cols;
        if (rows.n * cols.n > MAX_CELLS) {
          return { ok: false, reason: `matrix "${step.name}" exceeds the draw limit` };
        }
        const grid: (number | string)[][] = [];
        for (let r = 0; r < rows.n; r++) {
          const row: (number | string)[] = [];
          for (let c = 0; c < cols.n; c++) {
            const t = cursor.token();
            if (t === null) {
              return { ok: false, reason: `input ended at (${r},${c}) of "${step.name}"` };
            }
            row.push(coerce(t));
          }
          grid.push(row);
        }
        // Flattened one level: the grid renderer takes rows of cells.
        values[step.name] = grid as unknown as readonly (number | string)[];
        break;
      }

      case "lines": {
        const count = resolveCount(step.count, values);
        if (!count.ok) return count;
        const lines: string[] = [];
        for (let i = 0; i < count.n; i++) {
          const l = cursor.line();
          if (l === null) return { ok: false, reason: `input ended at line ${i} of "${step.name}"` };
          lines.push(l);
        }
        values[step.name] = lines;
        break;
      }

      case "line": {
        const l = cursor.line();
        // An empty line is legitimate here — "valid palindrome" has a
        // whitespace-only case whose answer is true. Only a missing line fails.
        if (l === null) return { ok: false, reason: `input ended while reading "${step.name}"` };
        values[step.name] = l;
        break;
      }

      case "rest": {
        values[step.name] = cursor.remainingTokens();
        break;
      }
    }
  }

  return { ok: true, values };
}
