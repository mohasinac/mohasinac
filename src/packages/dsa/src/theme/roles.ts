/**
 * Role -> CSS custom property NAME. No colour literals anywhere in this file.
 *
 * 🛑 The light theme re-darkens every accent (primary #7c8cff -> #4b5bd6,
 * success #4ade80 -> #13804f, focus-ring #ffb86b -> #b45a00), so a hex here
 * would be wrong the moment the theme is swapped — and this package is meant to
 * be liftable into its own repo, where it must carry no palette at all.
 *
 * 🛑 Colour is never the only channel. appkit ships six usable hues and there
 * are nine roles, so hues repeat (frontier/answer are both greens,
 * pointer/comparing both ambers). The glyph and dash pattern below are the
 * primary disambiguator, and they are what also serves colour-blind readers.
 *
 * Cell TEXT is always `--viz-cell-text`, never the role ink. That collapses a
 * nine-ink by nine-fill contrast matrix into one check per fill, which is why
 * the 24% fill cap is verifiable at all.
 */

import type { VizRole } from "../trace/types.ts";

export const ROLE_INK: Readonly<Record<VizRole, string>> = {
  idle: "var(--viz-ink-idle)",
  current: "var(--viz-ink-current)",
  pointer: "var(--viz-ink-pointer)",
  window: "var(--viz-ink-window)",
  visited: "var(--viz-ink-visited)",
  frontier: "var(--viz-ink-frontier)",
  answer: "var(--viz-ink-answer)",
  discarded: "var(--viz-ink-discarded)",
  comparing: "var(--viz-ink-comparing)",
};

export const ROLE_FILL: Readonly<Record<VizRole, string>> = {
  idle: "var(--viz-fill-idle)",
  current: "var(--viz-fill-current)",
  pointer: "var(--viz-fill-pointer)",
  window: "var(--viz-fill-window)",
  visited: "var(--viz-fill-visited)",
  frontier: "var(--viz-fill-frontier)",
  answer: "var(--viz-fill-answer)",
  discarded: "var(--viz-fill-discarded)",
  comparing: "var(--viz-fill-comparing)",
};

export const ROLE_STROKE_WIDTH: Readonly<Record<VizRole, number>> = {
  idle: 1,
  current: 2,
  pointer: 2,
  window: 1.5,
  visited: 1,
  frontier: 1.5,
  answer: 2,
  discarded: 1,
  comparing: 1.5,
};

/** Non-colour channel. Empty string means a solid stroke. */
export const ROLE_DASH: Readonly<Record<VizRole, string>> = {
  idle: "",
  current: "",
  pointer: "",
  window: "",
  visited: "",
  frontier: "4 3",
  answer: "",
  discarded: "2 3",
  comparing: "",
};

/** The word a screen reader gets, and the `<details>` table's value. */
export const ROLE_WORD: Readonly<Record<VizRole, string>> = {
  idle: "",
  current: "current",
  pointer: "pointer",
  window: "in the window",
  visited: "visited",
  frontier: "frontier",
  answer: "answer",
  discarded: "discarded",
  comparing: "being compared",
};
