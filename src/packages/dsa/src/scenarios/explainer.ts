/**
 * Tier 1 — "understand the problem", generated from a sample test case.
 *
 * Builds a short narrated sequence from an `input -> expectedOutput` pair that
 * has already been verified correct by the judge. No algorithm, no stepping
 * through code, and therefore no spoiler: it restates the worked example from
 * the statement as something you can play.
 *
 * 🛑 Frames here carry NO `line` and NO working variables. The explainer panel
 * shows no code pane and no variable table — someone who has not written a line
 * yet cannot be helped by either. That is why `TraceFrame.line` is optional.
 */

import type { TraceFrame, TraceValue, VizKind, VizSpec, VizTrace } from "../trace/types.ts";
import { parseInput, type InputFormat, type ParsedValue } from "./input-format.ts";

export interface ExplainerInput {
  /** Raw stdin of a SAMPLE case — never a hidden one. */
  readonly input: string;
  /** The verified expected output for that case. */
  readonly expectedOutput: string;
  readonly inputFormat: InputFormat;
  /** Which structure to draw. Inferred from the chosen var when absent. */
  readonly kind?: VizKind;
  /** Which parsed variable to draw. The first drawable one when absent. */
  readonly varName?: string;
  readonly title?: string;
  readonly patterns?: readonly string[];
  /** Derive a drawable value when the input is only a size. See VizDerive. */
  readonly derive?: VizDerive;
}

export type ExplainerResult =
  | { ok: true; trace: VizTrace }
  | { ok: false; reason: string };

/**
 * Longest string we will split into per-character cells. A 200 000-character
 * palindrome input is legitimate and undrawable; showing a prefix as if it were
 * the whole thing would be the usual confident lie, so the panel is refused
 * instead.
 */
const MAX_STRING_CELLS = 120;

/**
 * Parsed values the renderers can draw.
 *
 * A string counts: for the string problems — palindromes, anagrams, bracket
 * matching, longest-substring — the thing worth showing IS the sequence of
 * characters, and an array renderer with `asString` draws exactly that.
 */
function isDrawable(v: ParsedValue): boolean {
  if (Array.isArray(v)) return true;
  return typeof v === "string" && v.length > 0 && v.length <= MAX_STRING_CELLS;
}

function toTraceValue(v: ParsedValue): TraceValue {
  // A string becomes one cell per character — that is what makes the string
  // problems legible.
  if (typeof v === "string") return [...v];
  if (Array.isArray(v)) {
    // One level of nesting is enough: a matrix is rows of cells, and the
    // renderers take nothing deeper.
    return (v as readonly unknown[]).map((x) =>
      Array.isArray(x) ? (x as readonly (number | string)[]).map((y) => y as TraceValue) : (x as TraceValue),
    );
  }
  return v as TraceValue;
}

/**
 * How a problem whose input is only a size derives something to draw.
 *
 * Three shapes, which is all the corpus needs — and each names the scalars it
 * reads, so a renamed scalar fails to derive rather than drawing the wrong
 * thing.
 */
export type VizDerive =
  /** `[1, 2, … n]` — the n steps of climbing-stairs. */
  | { as: "range"; name: string; from: string }
  /** An empty `rows × cols` lattice — the board unique-paths crosses. */
  | { as: "grid"; name: string; rows: string; cols: string }
  /** The bits of a value, most significant first. */
  | { as: "bits"; name: string; from: string; width?: number };

/** Caps a derived range, so a size of 10^9 refuses rather than hanging. */
const MAX_DERIVED_CELLS = 120;

function deriveDrawable(
  derive: VizDerive,
  values: Record<string, ParsedValue>,
): [string, ParsedValue] | null {
  const scalar = (key: string): number | null => {
    const v = values[key];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };

  if (derive.as === "range") {
    const n = scalar(derive.from);
    // 0 is legitimate and undrawable; a huge n is legitimate and undrawable.
    // Both refuse, rather than drawing a prefix as if it were the whole thing.
    if (n === null || n <= 0 || n > MAX_DERIVED_CELLS) return null;
    return [derive.name, Array.from({ length: n }, (_, i) => i + 1)];
  }

  if (derive.as === "grid") {
    const rows = scalar(derive.rows);
    const cols = scalar(derive.cols);
    if (rows === null || cols === null || rows <= 0 || cols <= 0) return null;
    if (rows * cols > MAX_DERIVED_CELLS * 4) return null;
    // Zeros, not indices: the cells are empty ground to cross, and numbering
    // them would imply a value the problem does not have.
    return [derive.name, Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0))];
  }

  const value = scalar(derive.from);
  if (value === null || value < 0) return null;
  const width = derive.width ?? 8;
  if (value >= 2 ** width) return null;
  // Most significant bit first, so it reads the way the number is written.
  return [derive.name, Array.from({ length: width }, (_, i) => (value >> (width - 1 - i)) & 1)];
}

function inferKind(value: ParsedValue): VizKind {
  if (Array.isArray(value) && value.length > 0 && Array.isArray(value[0])) return "grid";
  return "array";
}

/** Cell count of a drawable value, for the narration and the index check. */
function cellCount(v: ParsedValue): number {
  if (typeof v === "string") return v.length;
  return Array.isArray(v) ? v.length : 0;
}

/** Scalars read from the input, rendered as `n = 4, target = 9`. */
function describeScalars(values: Record<string, ParsedValue>, drawn: string): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(values)) {
    if (k === drawn || Array.isArray(v)) continue;
    parts.push(`${k} = ${String(v)}`);
  }
  return parts.join(", ");
}

/**
 * The answer's cells, when the expected output names positions into the drawn
 * array. Returns null when the output is not a list of indices — a count, a
 * boolean or a string answer has nothing to highlight, and guessing would be
 * the mis-parse this whole module refuses to do.
 */
function answerCells(expectedOutput: string, length: number): string[] | null {
  const tokens = expectedOutput.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 8) return null;
  const idx: string[] = [];
  for (const t of tokens) {
    if (!/^\d+$/.test(t)) return null;
    const n = Number(t);
    if (n >= length) return null;
    idx.push(String(n));
  }
  return idx;
}

export function buildExplainer(opts: ExplainerInput): ExplainerResult {
  const parsed = parseInput(opts.input, opts.inputFormat);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  const entries = Object.entries(parsed.values);
  let chosen =
    (opts.varName ? entries.find(([k]) => k === opts.varName) : undefined) ??
    entries.find(([, v]) => isDrawable(v));

  /*
   * 🛑 Three problems have NOTHING in their input to draw, because the input is
   * only a size: `climbing-stairs` reads `n`, `unique-paths` reads `m` and `n`,
   * `number-of-1-bits` reads one integer. Each nonetheless has an obvious
   * subject — the n steps, the m×n grid, the bits of the value — and refusing a
   * panel left those three with no "understand this problem" view at all.
   *
   * So a problem may DERIVE its drawable value from its scalars. Explicit per
   * problem rather than guessed: synthesising a shape from whichever scalar
   * happens to come first is how a diagram ends up confidently wrong.
   */
  if (!chosen && opts.derive) {
    chosen = deriveDrawable(opts.derive, parsed.values) ?? undefined;
  }

  if (!chosen) {
    return { ok: false, reason: "no drawable value in the parsed input" };
  }
  const [drawnName, drawnValue] = chosen;
  if (!isDrawable(drawnValue)) {
    return { ok: false, reason: `"${drawnName}" is a scalar, not a structure` };
  }

  const kind = opts.kind ?? inferKind(drawnValue);
  const value = toTraceValue(drawnValue);
  const length = cellCount(drawnValue);
  const scalars = describeScalars(parsed.values, drawnName);
  const answer = opts.expectedOutput.trim();

  const spec: VizSpec =
    kind === "grid"
      ? { id: "explain", kind: "grid", var: drawnName, title: opts.title }
      : {
          id: "explain",
          kind: "array",
          var: drawnName,
          title: opts.title,
          ...(typeof drawnValue === "string" ? { asString: true } : {}),
        };

  const vars: Record<string, TraceValue> = { [drawnName]: value };

  const frames: TraceFrame[] = [
    {
      vars,
      note:
        kind === "grid"
          ? `Here is the input: a ${length}-row grid${scalars ? `, with ${scalars}` : ""}.`
          : `Here is the input: ${length} ${
              typeof drawnValue === "string" ? (length === 1 ? "character" : "characters") : length === 1 ? "value" : "values"
            }${scalars ? `, with ${scalars}` : ""}.`,
    },
    {
      vars,
      note: scalars
        ? `The question is asked in terms of ${scalars}.`
        : "Read what the question asks for before looking at the answer.",
    },
  ];

  // Highlight the answer only when it genuinely names positions in the drawn
  // array. Otherwise state it in words — which is still the useful thing.
  const cells = kind === "array" ? answerCells(answer, length) : null;

  if (cells) {
    frames.push({
      vars,
      note: `These ${cells.length === 1 ? "is the position" : `${cells.length} positions`} the answer refers to.`,
      roles: { cells: { [drawnName]: Object.fromEntries(cells.map((c) => [c, "comparing" as const])) } },
    });
    frames.push({
      vars,
      note: `So the answer is ${answer}.`,
      roles: { cells: { [drawnName]: Object.fromEntries(cells.map((c) => [c, "answer" as const])) } },
    });
  } else {
    frames.push({ vars, note: `For this input, the answer is ${answer}.` });
  }

  return {
    ok: true,
    trace: {
      source: "",
      specs: [spec],
      frames,
      ...(opts.patterns ? { patterns: opts.patterns } : {}),
    },
  };
}
