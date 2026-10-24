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
import { byRecencyDesc, buildSkillIndex, formatPartialDate } from "@/lib/portfolio";
import { ResumeActions } from "@/components/ResumeActions";

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

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 print:max-w-none print:px-0 print:py-0">
      <div className="mb-8 print:hidden">
        <ResumeActions />
      </div>

      <article className="resume space-y-7">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">{PROFILE.name}</h1>
          <p className="mt-1 text-sm text-text-muted">{PROFILE.tagline}</p>
          <p className="mt-2 font-mono text-[11px] text-text-faint">
            {[PROFILE.location, PROFILE.email, PROFILE.links.github].filter(Boolean).join(" · ")}
          </p>
        </header>

        {PROFILE.bio ? (
          <section>
            <h2 className="resume-h2">Summary</h2>
            <p className="mt-1 text-sm">{PROFILE.bio}</p>
          </section>
        ) : null}

        {skillLine.length > 0 ? (
          <section>
            <h2 className="resume-h2">Skills</h2>
            <p className="mt-1 text-sm">{skillLine.join(" · ")}</p>
          </section>
        ) : null}

        {roles.length > 0 ? (
          <section>
            <h2 className="resume-h2">Experience</h2>
            <ul className="mt-2 space-y-4">
              {roles.map((r, i) => (
                <li key={`${r.company}-${i}`} className="break-inside-avoid">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <h3 className="text-sm font-medium">
                      {r.role} · {r.company}
                    </h3>
                    <span className="font-mono text-[11px] text-text-faint">
                      {formatPartialDate(r.startDate)}
                      {r.endDate ? ` — ${formatPartialDate(r.endDate)}` : " — present"}
                    </span>
                  </div>
                  {r.summary ? <p className="mt-1 text-sm">{r.summary}</p> : null}
                  {r.highlights && r.highlights.length > 0 ? (
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-text-muted">
                      {r.highlights.map((h) => (
                        <li key={h}>{h}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {projects.length > 0 ? (
          <section>
            <h2 className="resume-h2">Projects</h2>
            <ul className="mt-2 space-y-3">
              {projects.map((p) => (
                <li key={p.title} className="break-inside-avoid">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <h3 className="text-sm font-medium">{p.title}</h3>
                    {p.period ? (
                      <span className="font-mono text-[11px] text-text-faint">{p.period}</span>
                    ) : null}
                  </div>
                  {p.summary ? <p className="mt-0.5 text-sm">{p.summary}</p> : null}
                  {p.stack.length > 0 ? (
                    <p className="mt-0.5 font-mono text-[11px] text-text-faint">
                      {p.stack.join(" · ")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {certifications.length > 0 ? (
          <section>
            <h2 className="resume-h2">Certifications</h2>
            <ul className="mt-2 space-y-1.5">
              {byRecencyDesc(certifications).map((c, i) => (
                <li key={`${c.title}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <span>
                    {c.title} <span className="text-text-muted">· {c.issuer}</span>
                  </span>
                  <span className="font-mono text-[11px] text-text-faint">
                    {formatPartialDate(c.issuedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    </main>
  );
}
