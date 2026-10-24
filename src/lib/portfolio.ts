/**
 * Portfolio derivations: timeline ordering, credential status, and the skill
 * cross-reference.
 *
 * Pure functions over plain data, with no Firestore and no React, so they can
 * be tested without either.
 */

/* ------------------------------------------------------------------ dates */

/**
 * A partial date (`YYYY-MM` or `YYYY-MM-DD`) as a comparable key.
 *
 * Padding a month-only value to `-00` makes it sort BEFORE every day in that
 * month, which is the right answer for a start date ("sometime in June" is at
 * latest the 1st) and keeps a mixed list stable. Anything unparseable sorts
 * last rather than throwing — a malformed date should not blank the page.
 */
export function dateKey(value: string | undefined): string {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value.trim());
  if (!m) return "0000-00-00";
  return `${m[1]}-${m[2]}-${m[3] ?? "00"}`;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** `2024-06` -> "June 2024"; `2024-06-15` -> "15 June 2024". */
export function formatPartialDate(value: string | undefined): string {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value.trim());
  if (!m) return value;
  const month = MONTHS[Number(m[2]) - 1] ?? m[2];
  return m[3] ? `${Number(m[3])} ${month} ${m[1]}` : `${month} ${m[1]}`;
}

export interface TimelineEntry {
  readonly startDate?: string;
  readonly endDate?: string;
  readonly issuedAt?: string;
}

/**
 * Newest first, with an open-ended entry ahead of everything.
 *
 * 🛑 A missing `endDate` means "present", so it must sort FIRST, not last.
 * Treating absent as an empty string would do the opposite and bury the
 * current role at the bottom of the page.
 */
export function byRecencyDesc<T extends TimelineEntry>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => {
    const aOpen = a.startDate !== undefined && a.endDate === undefined;
    const bOpen = b.startDate !== undefined && b.endDate === undefined;
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    const ak = dateKey(a.startDate ?? a.issuedAt);
    const bk = dateKey(b.startDate ?? b.issuedAt);
    return bk.localeCompare(ak);
  });
}

/** Year label for grouping a rail. */
export const yearOf = (value: string | undefined): string =>
  dateKey(value).slice(0, 4) || "—";

/* ------------------------------------------------------- credential status */

export type CredentialStatus = "active" | "expiring" | "expired" | "permanent";

/**
 * Is a credential still good?
 *
 * A credential that quietly lapsed is worse than one that is absent, so this
 * is surfaced rather than left for a reader to work out from a date. "Expiring"
 * is within 90 days, which is roughly the window in which renewing is a thing
 * you would actually do.
 */
export function credentialStatus(
  expiresAt: string | undefined,
  now: Date = new Date(),
): CredentialStatus {
  if (!expiresAt) return "permanent";
  // 🛑 Checked here rather than trusting dateKey's sentinel: that sentinel is
  // "0000-00-00", which ends in "-00" and so fell into the month-end branch
  // below, producing a date in 1900 and reporting a typo as an EXPIRED
  // credential. Claiming someone's certification has lapsed because its date
  // was mistyped is exactly the wrong way to be wrong.
  if (!/^\d{4}-(?:0[1-9]|1[0-2])(?:-\d{2})?$/.test(expiresAt.trim())) return "permanent";
  const key = dateKey(expiresAt);
  // A month-only expiry is padded to -00, which would read as expired on the
  // 1st. Treat it as the END of that month instead: a credential valid
  // "through June" is valid on 30 June.
  const end =
    key.endsWith("-00")
      ? new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)
      : new Date(`${key}T23:59:59Z`);
  if (Number.isNaN(end.getTime())) return "permanent";

  const msLeft = end.getTime() - now.getTime();
  if (msLeft < 0) return "expired";
  if (msLeft <= 90 * 24 * 60 * 60 * 1000) return "expiring";
  return "active";
}

/* ------------------------------------------------------------------ skills */

/**
 * Skill aliases.
 *
 * 🛑 `projects.stack[]`, `certifications.skills[]` and `experience.skills[]`
 * are free-text arrays, so without this `"Node"`, `"node.js"` and `"NodeJS"`
 * become three separate skills and the whole cross-reference — "used in 4
 * projects, 2 roles" — silently undercounts. The same problem was already
 * solved once for `patterns[]`, so this follows that precedent: normalise,
 * then alias, with unknown values passing through as themselves rather than
 * being dropped.
 */
const SKILL_ALIASES: Readonly<Record<string, string>> = {
  node: "Node.js",
  nodejs: "Node.js",
  "node js": "Node.js",
  js: "JavaScript",
  javascript: "JavaScript",
  ts: "TypeScript",
  typescript: "TypeScript",
  react: "React",
  reactjs: "React",
  nextjs: "Next.js",
  next: "Next.js",
  postgres: "PostgreSQL",
  postgresql: "PostgreSQL",
  psql: "PostgreSQL",
  mongo: "MongoDB",
  mongodb: "MongoDB",
  "c++": "C++",
  cpp: "C++",
  cplusplus: "C++",
  "c#": "C#",
  csharp: "C#",
  py: "Python",
  python: "Python",
  python3: "Python",
  k8s: "Kubernetes",
  kubernetes: "Kubernetes",
  gcp: "Google Cloud",
  "google cloud platform": "Google Cloud",
  aws: "AWS",
  tf: "Terraform",
  terraform: "Terraform",
  gql: "GraphQL",
  graphql: "GraphQL",
  tailwind: "Tailwind CSS",
  tailwindcss: "Tailwind CSS",
  firebase: "Firebase",
  firestore: "Firestore",
  wasm: "WebAssembly",
  webassembly: "WebAssembly",
  dsa: "Data structures & algorithms",
};

/**
 * Lowercase, trim, collapse whitespace, DROP DOTS — then alias. An unknown
 * skill passes through as written.
 *
 * Dots are stripped for the lookup only, which is what makes `node.js` and
 * `NodeJS` land on the same key — a first version stripped only a trailing dot
 * and so missed the single most common spelling of the example the plan names.
 * The alias keys are therefore all dot-free. Output is always built from the
 * original text, so stripping cannot mangle an unrecognised skill.
 */
export function normaliseSkill(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ").replace(/\./g, "");
  return SKILL_ALIASES[key] ?? raw.trim().replace(/\s+/g, " ");
}

export interface SkillEvidence {
  readonly skill: string;
  readonly projects: readonly string[];
  readonly roles: readonly string[];
  readonly certifications: readonly string[];
  /** Total mentions — the ranking key. */
  readonly count: number;
}

export interface SkillSources {
  readonly projects?: readonly { readonly title: string; readonly stack?: readonly string[] }[];
  readonly experience?: readonly {
    readonly role: string;
    readonly company?: string;
    readonly skills?: readonly string[];
  }[];
  readonly certifications?: readonly {
    readonly title: string;
    readonly skills?: readonly string[];
  }[];
}

/**
 * Build the skill -> evidence cross-reference.
 *
 * Derived entirely from fields that already exist, so it needs no new
 * authoring: a skill becomes visible the moment it is mentioned anywhere.
 */
export function buildSkillIndex(sources: SkillSources): SkillEvidence[] {
  const map = new Map<
    string,
    { projects: Set<string>; roles: Set<string>; certifications: Set<string> }
  >();

  const slot = (skill: string) => {
    const existing = map.get(skill);
    if (existing) return existing;
    const fresh = { projects: new Set<string>(), roles: new Set<string>(), certifications: new Set<string>() };
    map.set(skill, fresh);
    return fresh;
  };

  for (const p of sources.projects ?? []) {
    for (const raw of p.stack ?? []) slot(normaliseSkill(raw)).projects.add(p.title);
  }
  for (const e of sources.experience ?? []) {
    const label = e.company ? `${e.role} · ${e.company}` : e.role;
    for (const raw of e.skills ?? []) slot(normaliseSkill(raw)).roles.add(label);
  }
  for (const c of sources.certifications ?? []) {
    for (const raw of c.skills ?? []) slot(normaliseSkill(raw)).certifications.add(c.title);
  }

  return [...map.entries()]
    .map(([skill, v]) => ({
      skill,
      projects: [...v.projects],
      roles: [...v.roles],
      certifications: [...v.certifications],
      count: v.projects.size + v.roles.size + v.certifications.size,
    }))
    // Most evidence first, then alphabetical so the order is stable rather
    // than dependent on insertion.
    .sort((a, b) => b.count - a.count || a.skill.localeCompare(b.skill));
}
