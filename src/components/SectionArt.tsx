/**
 * Per-section artwork for the home cards.
 *
 * Inline SVG rather than photography, for three concrete reasons:
 *  - Licensing: generic stock pulled from an image search is copyrighted; this
 *    is authored here, so the repo ships nothing it does not own.
 *  - CSP: `img-src` is scoped to 'self' + Firebase Storage, so a remote host
 *    would be blocked outright. Self-hosting instead would mean committing
 *    binaries for decoration.
 *  - Fit: a developer-tool identity reads better with diagrammatic marks than
 *    with photos, and these inherit the theme — `currentColor` and the accent
 *    token mean they re-derive in both light and dark presets.
 *
 * Each mark is decorative, so every <svg> is aria-hidden and the card's meaning
 * lives entirely in its text.
 */

type Variant = "projects" | "writing" | "sandbox" | "course";

const common = {
  "aria-hidden": true as const,
  viewBox: "0 0 64 40",
  className: "h-10 w-16 shrink-0",
  fill: "none" as const,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Stacked panels — things built and shipped. */
function Projects() {
  return (
    <svg {...common}>
      <rect x="4" y="18" width="30" height="18" rx="2" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      <rect x="12" y="11" width="30" height="18" rx="2" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.5" />
      <rect x="20" y="4" width="30" height="18" rx="2" stroke="var(--appkit-color-primary)" strokeWidth="1.5" />
      <path d="M26 13h12M26 17h7" stroke="var(--appkit-color-primary)" strokeOpacity="0.7" strokeWidth="1.5" />
    </svg>
  );
}

/** Prose lines with a hanging indent — an article. */
function Writing() {
  return (
    <svg {...common}>
      <path d="M10 8h32M10 14h40M10 20h36M10 26h24" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.5" />
      <path d="M10 32h14" stroke="var(--appkit-color-primary)" strokeWidth="1.5" />
      <circle cx="52" cy="32" r="3" fill="var(--appkit-color-secondary)" />
    </svg>
  );
}

/** A terminal window with a prompt and a block cursor. */
function Sandbox() {
  return (
    <svg {...common}>
      <rect x="4" y="5" width="56" height="30" rx="3" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.5" />
      <path d="M4 12h56" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" />
      <circle cx="9" cy="8.5" r="1.2" fill="var(--appkit-color-error)" />
      <circle cx="14" cy="8.5" r="1.2" fill="var(--appkit-color-warning)" />
      <circle cx="19" cy="8.5" r="1.2" fill="var(--appkit-color-success)" />
      <path d="M11 20l4 4-4 4" stroke="var(--appkit-color-primary)" strokeWidth="1.8" />
      <rect x="19" y="22.5" width="8" height="3" fill="var(--appkit-color-secondary)" />
    </svg>
  );
}

/** A binary tree — the data structures the course builds. */
function Course() {
  return (
    <svg {...common}>
      <path
        d="M32 10v6m0 0l-12 6m12-6l12 6M20 28v-6m24 6v-6"
        stroke="currentColor"
        strokeOpacity="0.4"
        strokeWidth="1.5"
      />
      <circle cx="32" cy="7" r="4" stroke="var(--appkit-color-primary)" strokeWidth="1.5" />
      <circle cx="20" cy="25" r="4" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.5" />
      <circle cx="44" cy="25" r="4" stroke="var(--appkit-color-secondary)" strokeWidth="1.5" />
    </svg>
  );
}

const ART: Record<Variant, () => React.ReactElement> = {
  projects: Projects,
  writing: Writing,
  sandbox: Sandbox,
  course: Course,
};

export function SectionArt({ variant }: { variant: Variant }) {
  const Mark = ART[variant];
  return <Mark />;
}

export type { Variant as SectionArtVariant };
