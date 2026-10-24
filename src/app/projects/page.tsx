import type { Metadata } from "next";
import { PROJECTS, type Project } from "@/content/profile";
import { listPublished } from "@/lib/public-content";

export const metadata: Metadata = {
  title: "Projects",
  description: "Things I have built and shipped, the stacks behind them, and what each one taught me.",
};

/**
 * Firestore is the source of truth once content is published there; the
 * bundled file is the fallback until then. Returning `null` rather than `[]`
 * from the read is what makes that distinction possible — an empty collection
 * and an unreachable one would otherwise both render an empty page.
 */
async function loadProjects(): Promise<readonly Project[]> {
  const docs = await listPublished("projects");
  if (!docs) return PROJECTS;
  return docs.map((d) => ({
    slug: String(d.slug),
    title: String(d.title ?? ""),
    role: String(d.role ?? ""),
    period: String(d.period ?? ""),
    summary: String(d.summary ?? ""),
    stack: Array.isArray(d.stack) ? (d.stack as string[]) : [],
    highlights: Array.isArray(d.highlights) ? (d.highlights as string[]) : [],
    repoUrl: typeof d.repoUrl === "string" ? d.repoUrl : undefined,
    liveUrl: typeof d.liveUrl === "string" ? d.liveUrl : undefined,
    verified: true,
  }));
}

export default async function ProjectsPage() {
  const projects = await loadProjects();

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-[0.2em] text-text-faint">portfolio</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="prose-editorial mt-3 max-w-prose text-text-muted">
          Work I have built end to end. Each entry lists what it actually does rather than what it
          was meant to.
        </p>
      </header>

      <ol className="space-y-px overflow-hidden rounded-md border border-border bg-border">
        {projects.map((p) => (
          <li key={p.slug} className="bg-surface p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="text-lg font-medium text-accent">{p.title}</h2>
              <span className="text-xs text-text-faint">
                {p.role} · {p.period}
              </span>
            </div>

            <p className="prose-editorial mt-2 max-w-prose text-sm text-text-muted">{p.summary}</p>

            <ul className="mt-3 space-y-1 text-sm text-text-muted">
              {p.highlights.map((h) => (
                <li key={h} className="flex gap-2">
                  <span aria-hidden className="text-accent">
                    ·
                  </span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              <ul className="flex flex-wrap gap-1.5">
                {p.stack.map((s) => (
                  <li
                    key={s}
                    className="rounded-sm bg-surface-raised px-1.5 py-0.5 text-[11px] text-text-faint"
                  >
                    {s}
                  </li>
                ))}
              </ul>
              <span className="ml-auto flex gap-3 text-xs">
                {p.repoUrl ? (
                  <a href={p.repoUrl} className="text-accent hover:underline" rel="noreferrer noopener">
                    source
                  </a>
                ) : null}
                {p.liveUrl ? (
                  <a href={p.liveUrl} className="text-accent hover:underline" rel="noreferrer noopener">
                    live
                  </a>
                ) : null}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </main>
  );
}
