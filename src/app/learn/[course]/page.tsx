import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { getPublishedBySlug, listChildren, listPublished } from "@/lib/public-content";
import { Markdown } from "@/components/Markdown";

/*
 * The old layout put `/course/problems` and `/course/lessons` as static
 * siblings of this dynamic segment, so a course slugged "problems" or
 * "lessons" was unreachable. Problems now live under their own `/problems`
 * tree and lessons are nested inside the course, so that collision is gone and
 * no reserved-slug guard is needed.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ course: string }>;
}): Promise<Metadata> {
  const track = await getPublishedBySlug("tracks", (await params).course);
  return {
    title: track ? String(track.title ?? track.slug) : "Track",
    // The course is behind a login, so there is nothing here for a crawler.
    robots: { index: false, follow: false },
  };
}

export default async function TrackPage({ params }: { params: Promise<{ course: string }> }) {
  const { course: slug } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/learn/${slug}`)}`);

  const track = await getPublishedBySlug("tracks", slug);
  if (!track) notFound();

  const modules = await listChildren("modules", "trackSlug", slug);

  // One read for every lesson in the track, then grouped in memory — cheaper
  // and simpler than a per-module query, and the corpus is small.
  const allLessons = (await listPublished("lessons", { limit: 300 })) ?? [];
  const byModule = new Map<string, typeof allLessons>();
  for (const lesson of allLessons) {
    const key = String(lesson.moduleSlug ?? "");
    let list = byModule.get(key);
    if (!list) byModule.set(key, (list = []));
    list.push(lesson);
  }
  for (const list of byModule.values()) {
    list.sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
  }

  const lessonCount = modules.reduce((n, m) => n + (byModule.get(String(m.slug))?.length ?? 0), 0);

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <nav className="mb-5 text-xs">
        <Link href="/learn" className="text-text-faint hover:text-accent">
          ← Courses
        </Link>
      </nav>

      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">{String(track.title ?? slug)}</h1>
        {track.summary ? (
          <div className="mt-3 max-w-prose">
            <Markdown source={String(track.summary)} />
          </div>
        ) : null}
        <p className="mt-3 font-mono text-xs text-text-faint">
          {modules.length} module(s) · {lessonCount} lesson(s)
        </p>
      </header>

      {modules.length === 0 ? (
        <p className="rounded-md border border-border bg-surface p-4 text-sm text-text-muted">
          No modules published in this track yet.
        </p>
      ) : (
        <ol className="space-y-6">
          {modules.map((m, mi) => {
            const lessons = byModule.get(String(m.slug)) ?? [];
            return (
              <li key={m.id}>
                <h2 className="flex items-baseline gap-2 text-base font-semibold">
                  <span className="font-mono text-xs text-text-faint">
                    {String(mi + 1).padStart(2, "0")}
                  </span>
                  {String(m.title ?? m.slug)}
                </h2>
                {m.summary ? (
                  <p className="mt-1 text-sm text-text-muted">{String(m.summary)}</p>
                ) : null}

                {lessons.length === 0 ? (
                  <p className="mt-2 text-xs text-text-faint">No lessons yet.</p>
                ) : (
                  <ul className="mt-2 space-y-px overflow-hidden rounded-md border border-border bg-border">
                    {lessons.map((l) => (
                      <li key={l.id} className="bg-surface">
                        <Link
                          href={`/learn/${slug}/${l.slug}`}
                          className="flex items-baseline gap-3 p-3 text-sm transition-colors hover:bg-bg"
                        >
                          <span className="flex-1">{String(l.title ?? l.slug)}</span>
                          <span className="text-text-faint">→</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
