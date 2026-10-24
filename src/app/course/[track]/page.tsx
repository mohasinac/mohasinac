import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { getPublishedBySlug, listChildren, listPublished } from "@/lib/public-content";
import { Markdown } from "@/components/Markdown";

/*
 * Note on routing: `/course/problems` and `/course/lessons` are static
 * segments, so Next matches them before this dynamic one. A track whose slug
 * is literally "problems" or "lessons" would be unreachable — hence the guard
 * below rather than a silent 404 that looks like missing content.
 */
const RESERVED = new Set(["problems", "lessons"]);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ track: string }>;
}): Promise<Metadata> {
  const track = await getPublishedBySlug("tracks", (await params).track);
  return {
    title: track ? String(track.title ?? track.slug) : "Track",
    // The course is behind a login, so there is nothing here for a crawler.
    robots: { index: false, follow: false },
  };
}

export default async function TrackPage({ params }: { params: Promise<{ track: string }> }) {
  const { track: slug } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/course/${slug}`)}`);
  if (RESERVED.has(slug)) notFound();

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
        <Link href="/course" className="text-text-faint hover:text-accent">
          ← Course
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
                          href={`/course/lessons/${l.slug}`}
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
