/**
 * Skill-based resume presets.
 *
 * One resume, several audiences: a backend role wants the Node/Postgres work
 * at the top and does not need the Tailwind detail. A preset is a named set of
 * skills, and everything on the resume is filtered to entries that mention at
 * least one of them.
 *
 * 🛑 Presets are DERIVED, not authored. They come from the `tools` categories
 * that already exist (`language`, `framework`, `infra`, `data`, `tooling`)
 * crossed with the skill index, so a new skill joins the right preset the
 * moment it appears in a project — there is no second list to keep in sync. A
 * hand-written preset list is the kind of thing that silently goes stale.
 *
 * 🛑 Nothing here touches Firestore. The selection lives in the browser only,
 * because tailoring a resume for one application is not a fact about the site.
 */

// `@/lib/...` even from inside src/lib, matching every other file here.
import { normaliseSkill } from "@/lib/portfolio";

/** A tool's category, as `toolSchema` defines it. */
export type SkillCategory = "language" | "framework" | "infra" | "data" | "tooling";

const CATEGORY_LABEL: Readonly<Record<SkillCategory, string>> = {
  language: "Languages",
  framework: "Frameworks",
  infra: "Infrastructure",
  data: "Data",
  tooling: "Tooling",
};

/**
 * Order matters: it is the order the presets are offered in, and it runs from
 * "what the job is about" to "how you work", which is the order a reader cares
 * about.
 */
const CATEGORY_ORDER: readonly SkillCategory[] = [
  "language",
  "framework",
  "data",
  "infra",
  "tooling",
];

export interface Preset {
  readonly id: string;
  readonly label: string;
  /** Normalised skill names. Empty means "no filter". */
  readonly skills: readonly string[];
}

export interface PresetInput {
  readonly skills: readonly string[];
  readonly tools: readonly { readonly name: string; readonly category: string }[];
}

/** The always-present preset: the whole resume, unfiltered. */
export const EVERYTHING: Preset = { id: "everything", label: "Everything", skills: [] };

/**
 * Build the preset list from the skills and tools that exist.
 *
 * A category with no skills is omitted — offering an "Infrastructure" preset
 * that filters the resume down to nothing is worse than not offering it.
 */
export function buildPresets({ skills, tools }: PresetInput): Preset[] {
  const known = new Set(skills.map((s) => normaliseSkill(s)));
  const byCategory = new Map<SkillCategory, string[]>();

  for (const tool of tools) {
    const category = tool.category as SkillCategory;
    if (!CATEGORY_ORDER.includes(category)) continue;
    const skill = normaliseSkill(tool.name);
    // Only skills the resume can actually evidence. A tool nobody used on a
    // project cannot filter anything.
    if (!known.has(skill)) continue;
    const bucket = byCategory.get(category);
    if (bucket) {
      if (!bucket.includes(skill)) bucket.push(skill);
    } else {
      byCategory.set(category, [skill]);
    }
  }

  const presets: Preset[] = [EVERYTHING];
  for (const category of CATEGORY_ORDER) {
    const inCategory = byCategory.get(category);
    if (!inCategory || inCategory.length === 0) continue;
    presets.push({
      id: category,
      label: CATEGORY_LABEL[category],
      skills: [...inCategory].sort((a, b) => a.localeCompare(b)),
    });
  }
  return presets;
}

/* ------------------------------------------------------------- filtering */

export interface Taggable {
  /** Whatever the entry calls its skills: `stack[]` or `skills[]`. */
  readonly skills?: readonly string[];
}

/**
 * Does this entry belong on a resume filtered to `selected`?
 *
 * 🛑 An entry with NO skills listed is always KEPT. Dropping it would silently
 * remove a real role from a resume because somebody forgot to tag it — a
 * failure that looks like the preset working. An untagged entry cannot be
 * judged, so it is not judged.
 */
export function matchesSelection(
  entry: Taggable,
  selected: ReadonlySet<string>,
): boolean {
  if (selected.size === 0) return true;
  const tags = entry.skills ?? [];
  if (tags.length === 0) return true;
  return tags.some((t) => selected.has(normaliseSkill(t)));
}

/**
 * Apply a selection across the resume's sections.
 *
 * Returns counts alongside the filtered lists so the UI can say what a preset
 * actually did — "3 of 5 roles" rather than quietly showing fewer.
 */
export interface ResumeSections<R extends Taggable, P extends Taggable, C extends Taggable> {
  readonly roles: readonly R[];
  readonly projects: readonly P[];
  readonly certifications: readonly C[];
}

export interface FilteredSections<R, P, C> {
  readonly roles: readonly R[];
  readonly projects: readonly P[];
  readonly certifications: readonly C[];
  readonly hidden: number;
  readonly total: number;
}

export function applySelection<R extends Taggable, P extends Taggable, C extends Taggable>(
  sections: ResumeSections<R, P, C>,
  selected: ReadonlySet<string>,
): FilteredSections<R, P, C> {
  const roles = sections.roles.filter((r) => matchesSelection(r, selected));
  const projects = sections.projects.filter((p) => matchesSelection(p, selected));
  const certifications = sections.certifications.filter((c) => matchesSelection(c, selected));

  const total = sections.roles.length + sections.projects.length + sections.certifications.length;
  const kept = roles.length + projects.length + certifications.length;

  return { roles, projects, certifications, hidden: total - kept, total };
}

/**
 * The skills line, ordered so the selected ones come first.
 *
 * Filtering the line down to only the selected skills would be a lie by
 * omission — you do still know the others. Reordering says "these are the
 * relevant ones" without claiming the rest do not exist.
 */
export function orderSkillLine(
  skills: readonly string[],
  selected: ReadonlySet<string>,
): string[] {
  if (selected.size === 0) return [...skills];
  const hit: string[] = [];
  const rest: string[] = [];
  for (const skill of skills) {
    if (selected.has(normaliseSkill(skill))) hit.push(skill);
    else rest.push(skill);
  }
  return [...hit, ...rest];
}

/* ------------------------------------------------------- stored selection */

export const STORAGE_KEY = "mohasinac:resume-selection";

/**
 * Read a saved selection.
 *
 * 🛑 Deliberately defensive: this is localStorage, which a user can edit, a
 * previous version may have written, and another tab may have changed. Anything
 * unexpected yields an empty selection — i.e. the whole resume — because
 * showing everything is the safe failure, and a corrupted key must never render
 * a blank resume.
 */
export function parseStoredSelection(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === "string" && s.length > 0 && s.length < 80);
  } catch {
    return [];
  }
}
