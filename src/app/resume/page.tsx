import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  CERTIFICATIONS,
  EXPERIENCE,
  PROFILE,
  PROJECTS,
  TOOLS,
  type Certification,
  type Experience,
} from "@/content/profile";
import { listPublished } from "@/lib/public-content";
import { getSessionUser } from "@/lib/session";
import { byRecencyDesc, buildSkillIndex } from "@/lib/portfolio";
import { ResumeComposer } from "@/components/ResumeComposer";

export const metadata: Metadata = {
  title: "Resume",
  // Gated, so keep it out of the index — a crawler would only ever get the
  // redirect, and listing it would advertise a path that never serves content.
  robots: { index: false, follow: false },
};

async function loadExperience(): Promise<readonly Experience[]> {
  const docs = await listPublished("experience");
  if (!docs) return EXPERIENCE;
  return docs.map((d) => ({
    company: String(d.company ?? ""),
    role: String(d.role ?? ""),
    startDate: String(d.startDate ?? ""),
    ...(typeof d.endDate === "string" ? { endDate: d.endDate } : {}),
    ...(typeof d.location === "string" ? { location: d.location } : {}),
    ...(typeof d.summary === "string" ? { summary: d.summary } : {}),
    highlights: Array.isArray(d.highlights) ? (d.highlights as string[]) : [],
    skills: Array.isArray(d.skills) ? (d.skills as string[]) : [],
    verified: true,
  }));
}

async function loadCertifications(): Promise<readonly Certification[]> {
  const docs = await listPublished("certifications");
  if (!docs) return CERTIFICATIONS;
  return docs.map((d) => ({
    title: String(d.title ?? ""),
    issuer: String(d.issuer ?? ""),
    issuedAt: String(d.issuedAt ?? ""),
    ...(typeof d.expiresAt === "string" ? { expiresAt: d.expiresAt } : {}),
    ...(typeof d.credentialUrl === "string" ? { credentialUrl: d.credentialUrl } : {}),
    skills: Array.isArray(d.skills) ? (d.skills as string[]) : [],
    verified: true,
  }));
}

/**
 * The resume, generated from the same documents the rest of the site reads.
 *
 * 🛑 Not a stored file. A PDF under `public/` is world-readable at a guessable
 * URL regardless of what gate the button sits behind, which would make the
 * sign-in requirement decorative. This page is behind `getSessionUser()` AND
 * `/resume` is in the middleware's PROTECTED_PREFIXES, and the PDF is produced
 * by the browser printing this page — so the bytes only ever exist after the
 * session check.
 *
 * The side effect worth having: it cannot go stale. There is no second copy to
 * forget to update.
 */
export default async function ResumePage() {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/resume")}`);

  const [experience, certifications, projectDocs, toolDocs] = await Promise.all([
    loadExperience(),
    loadCertifications(),
    listPublished("projects"),
    listPublished("tools"),
  ]);

  const projects = projectDocs
    ? projectDocs.map((d) => ({
        title: String(d.title ?? ""),
        role: String(d.role ?? ""),
        period: String(d.period ?? ""),
        summary: String(d.summary ?? ""),
        stack: Array.isArray(d.stack) ? (d.stack as string[]) : [],
      }))
    : PROJECTS.map((p) => ({
        title: p.title,
        role: p.role,
        period: p.period,
        summary: p.summary,
        stack: p.stack,
      }));

  const tools = toolDocs
    ? toolDocs.map((d) => ({ name: String(d.name ?? ""), category: String(d.category ?? "") }))
    : TOOLS.map((t) => ({ name: t.name, category: t.category }));

  const skills = buildSkillIndex({
    projects,
    experience: experience.map((e) => ({ role: e.role, company: e.company, skills: e.skills ?? [] })),
    certifications: certifications.map((c) => ({ title: c.title, skills: c.skills ?? [] })),
  });

  // Tools fill the skills line when nothing has been cross-referenced yet, so
  // the resume is not blank before the portfolio is populated.
  const skillLine =
    skills.length > 0 ? skills.map((s) => s.skill) : tools.map((t) => t.name);

  const roles = byRecencyDesc(experience);

  /*
   * 🛑 The server renders EVERYTHING and the client filters it down.
   *
   * The other way round — a filtered resume requested from the server — would
   * make the chosen skill set a URL parameter or a request body, and from
   * there it is one step from being stored. Keeping the filter client-side is
   * what makes "nothing is saved to the database" true by construction rather
   * than by discipline.
   */
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 print:max-w-none print:px-0 print:py-0">
      <ResumeComposer
        profile={{
          name: PROFILE.name,
          tagline: PROFILE.tagline,
          bio: PROFILE.bio,
          // PROFILE is `as const`, so these are literal types rather than
          // `string` — a `v is string` predicate is not assignable to them.
          // Dropping the empties is all that is needed.
          contact: [PROFILE.location, PROFILE.email, PROFILE.links.github].filter(
            (v) => v !== "",
          ),
        }}
        roles={roles.map((r) => ({
          role: r.role,
          company: r.company,
          startDate: r.startDate,
          ...(r.endDate ? { endDate: r.endDate } : {}),
          ...(r.summary ? { summary: r.summary } : {}),
          highlights: r.highlights ?? [],
          skills: r.skills ?? [],
        }))}
        projects={projects.map((p) => ({
          title: p.title,
          ...(p.period ? { period: p.period } : {}),
          ...(p.summary ? { summary: p.summary } : {}),
          // A project's `stack[]` IS its skill list, which is what the filter
          // and the skill index both read it as.
          skills: p.stack,
        }))}
        certifications={certifications.map((c) => ({
          title: c.title,
          issuer: c.issuer,
          issuedAt: c.issuedAt,
          skills: c.skills ?? [],
        }))}
        skillLine={skillLine}
        tools={tools}
      />
    </main>
  );
}
