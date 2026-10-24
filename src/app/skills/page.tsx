import type { Metadata } from "next";
import Link from "next/link";
import { CERTIFICATIONS, EXPERIENCE, PROJECTS, TOOLS } from "@/content/profile";
import { listPublished } from "@/lib/public-content";
import { buildSkillIndex, normaliseSkill } from "@/lib/portfolio";

export const metadata: Metadata = {
  title: "Skills",
  description: "What I work with, and the projects, roles and credentials that back each one.",
};

/**
 * The skill view inverts the portfolio: the skill is the subject and the
 * evidence hangs off it.
 *
 * 🛑 Every number here is DERIVED from `projects.stack[]`,
 * `experience.skills[]` and `certifications.skills[]` — fields that already
 * exist. Nothing new is authored, so a skill appears the moment it is
 * mentioned anywhere and can never drift from the pages it cites.
 */
export default async function SkillsPage() {
  const [projectDocs, experienceDocs, certDocs, toolDocs] = await Promise.all([
    listPublished("projects"),
    listPublished("experience"),
    listPublished("certifications"),
    listPublished("tools"),
  ]);

  const projects = projectDocs
    ? projectDocs.map((d) => ({
        title: String(d.title ?? ""),
        stack: Array.isArray(d.stack) ? (d.stack as string[]) : [],
      }))
    : PROJECTS.map((p) => ({ title: p.title, stack: p.stack }));

  const experience = experienceDocs
    ? experienceDocs.map((d) => ({
        role: String(d.role ?? ""),
        company: String(d.company ?? ""),
        skills: Array.isArray(d.skills) ? (d.skills as string[]) : [],
      }))
    : EXPERIENCE.map((e) => ({ role: e.role, company: e.company, skills: e.skills ?? [] }));

  const certifications = certDocs
    ? certDocs.map((d) => ({
        title: String(d.title ?? ""),
        skills: Array.isArray(d.skills) ? (d.skills as string[]) : [],
      }))
    : CERTIFICATIONS.map((c) => ({ title: c.title, skills: c.skills ?? [] }));

  const index = buildSkillIndex({ projects, experience, certifications });

  /*
   * `tools` already carries `category` and `proficiency`, so the page can
   * group by category and rank within it rather than presenting one
   * undifferentiated tag cloud. Keyed by the NORMALISED name so a tool spelled
   * differently from a project's stack entry still lines up.
   */
  const tools = toolDocs
    ? toolDocs.map((d) => ({
        name: String(d.name ?? ""),
        category: String(d.category ?? "tooling"),
        proficiency: String(d.proficiency ?? ""),
      }))
    : TOOLS.map((t) => ({ name: t.name, category: t.category, proficiency: t.proficiency ?? "" }));

  const toolBySkill = new Map(tools.map((t) => [normaliseSkill(t.name), t]));

  const byCategory = new Map<string, typeof index>();
  const uncategorised: typeof index = [];
  for (const entry of index) {
    const tool = toolBySkill.get(entry.skill);
    if (!tool) {
      uncategorised.push(entry);
      continue;
    }
    const bucket = byCategory.get(tool.category);
    if (bucket) bucket.push(entry);
    else byCategory.set(tool.category, [entry]);
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-[0.2em] text-text-faint">portfolio</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Skills</h1>
        <p className="mt-3 max-w-prose text-sm text-text-muted">
          Each skill with the work that backs it. Counted from the{" "}
          <Link href="/projects" className="text-accent hover:underline">
            projects
          </Link>
          ,{" "}
          <Link href="/experience" className="text-accent hover:underline">
            roles
          </Link>{" "}
          and{" "}
          <Link href="/certifications" className="text-accent hover:underline">
            certifications
          </Link>{" "}
          listed on this site — not asserted separately.
        </p>
      </header>

      {index.length === 0 ? (
        <p className="text-sm text-text-muted">
          No skills to show yet — they are derived from published projects, roles and
          certifications.
        </p>
      ) : null}

      {[...byCategory.entries()].map(([category, entries]) => (
        <section key={category} className="mb-9">
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-wider text-text-faint">
            {category}
          </h2>
          <SkillList entries={entries} toolBySkill={toolBySkill} />
        </section>
      ))}

      {uncategorised.length > 0 ? (
        <section className="mb-9">
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-wider text-text-faint">
            also used
          </h2>
          <SkillList entries={uncategorised} toolBySkill={toolBySkill} />
        </section>
      ) : null}
    </main>
  );
}

function SkillList({
  entries,
  toolBySkill,
}: {
  entries: ReturnType<typeof buildSkillIndex>;
  toolBySkill: Map<string, { proficiency: string }>;
}) {
  return (
    <ul className="space-y-px overflow-hidden rounded-md border border-border bg-border">
      {entries.map((e) => {
        const proficiency = toolBySkill.get(e.skill)?.proficiency;
        return (
          <li key={e.skill} className="bg-surface px-3 py-2.5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="font-medium">{e.skill}</h3>
              {proficiency ? (
                <span className="font-mono text-[11px] text-text-faint">{proficiency}</span>
              ) : null}
            </div>
            {/* Spelled out rather than shown as a bare count: "used in 4
                projects, 2 roles" is the claim, and naming them is what makes
                it checkable. */}
            <p className="mt-0.5 text-xs text-text-muted">
              {[
                e.projects.length > 0
                  ? `${e.projects.length} project${e.projects.length === 1 ? "" : "s"}`
                  : null,
                e.roles.length > 0 ? `${e.roles.length} role${e.roles.length === 1 ? "" : "s"}` : null,
                e.certifications.length > 0
                  ? `${e.certifications.length} certification${e.certifications.length === 1 ? "" : "s"}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {e.projects.length > 0 || e.roles.length > 0 ? (
              <p className="mt-1 font-mono text-[11px] text-text-faint">
                {[...e.projects, ...e.roles, ...e.certifications].join(", ")}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
