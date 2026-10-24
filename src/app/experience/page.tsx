import type { Metadata } from "next";
import { EXPERIENCE, type Experience } from "@/content/profile";
import { listPublished } from "@/lib/public-content";
import { Timeline, TimelineDates, type TimelineItem } from "@/components/Timeline";
import { formatPartialDate } from "@/lib/portfolio";

export const metadata: Metadata = {
  title: "Experience",
  description: "Roles, what each one involved, and what I actually shipped in it.",
};

/**
 * Firestore once published, the bundled file until then. `null` from the read
 * means UNREACHABLE (a missing composite index is the usual cause) and is
 * deliberately distinct from `[]`, which means "no roles published yet" —
 * otherwise a silently failing query renders as an empty page.
 */
async function load(): Promise<readonly Experience[]> {
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

export default async function ExperiencePage() {
  const roles = await load();

  const items: TimelineItem[] = roles.map((r, i) => ({
    key: `${r.company}-${r.startDate}-${i}`,
    startDate: r.startDate,
    ...(r.endDate ? { endDate: r.endDate } : {}),
    body: (
      <div>
        <TimelineDates
          from={formatPartialDate(r.startDate)}
          {...(r.endDate ? { to: formatPartialDate(r.endDate) } : { present: true })}
        />
        <h2 className="mt-1 text-base font-medium tracking-tight">{r.role}</h2>
        <p className="text-sm text-text-muted">
          {r.company}
          {r.location ? <span className="text-text-faint"> · {r.location}</span> : null}
        </p>
        {r.summary ? <p className="mt-2 max-w-prose text-sm">{r.summary}</p> : null}
        {r.highlights && r.highlights.length > 0 ? (
          <ul className="mt-2 max-w-prose list-disc space-y-1 pl-5 text-sm text-text-muted">
            {r.highlights.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        ) : null}
        {r.skills && r.skills.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {r.skills.map((s) => (
              <li
                key={s}
                className="rounded-sm bg-surface-raised px-1.5 py-0.5 font-mono text-[11px] text-text-faint"
              >
                {s}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    ),
  }));

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-[0.2em] text-text-faint">portfolio</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Experience</h1>
        <p className="mt-3 max-w-prose text-sm text-text-muted">
          Roles in reverse order, with what each one actually involved.
        </p>
      </header>

      {items.length > 0 ? (
        <Timeline items={items} />
      ) : (
        <p className="text-sm text-text-muted">No roles published yet.</p>
      )}
    </main>
  );
}
