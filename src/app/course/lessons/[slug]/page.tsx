import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { getPublishedBySlug, listChildren } from "@/lib/public-content";
import { Markdown } from "@/components/Markdown";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const lesson = await getPublishedBySlug("lessons", (await params).slug);
  return {
    title: lesson ? String(lesson.title ?? lesson.slug) : "Lesson",
    robots: { index: false, follow: false },
  };
}

export default async function LessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/course/lessons/${slug}`)}`);

  const lesson = await getPublishedBySlug("lessons", slug);
  if (!lesson) notFound();

  const moduleSlug = String(lesson.moduleSlug ?? "");
  const [parentModule, siblings] = await Promise.all([
    moduleSlug ? getPublishedBySlug("modules", moduleSlug) : Promise.resolve(null),
    moduleSlug ? listChildren("lessons", "moduleSlug", moduleSlug) : Promise.resolve([]),
  ]);

  const index = siblings.findIndex((s) => s.slug === slug);
  const prev = index > 0 ? siblings[index - 1] : null;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;
  const trackSlug = parentModule ? String(parentModule.trackSlug ?? "") : "";

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <nav className="mb-5 flex flex-wrap items-center gap-2 text-xs text-text-faint">
        <Link href="/course" className="hover:text-accent">
          Course
        </Link>
        {trackSlug ? (
          <>
            <span aria-hidden>/</span>
            <Link href={`/course/${trackSlug}`} className="hover:text-accent">
              {trackSlug}
            </Link>
          </>
        ) : null}
        {parentModule ? (
          <>
            <span aria-hidden>/</span>
            <span>{String(parentModule.title ?? moduleSlug)}</span>
          </>
        ) : null}
      </nav>

      <article>
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{String(lesson.title ?? slug)}</h1>
          {lesson.summary ? (
            <p className="mt-2 max-w-prose text-sm text-text-muted">{String(lesson.summary)}</p>
          ) : null}
        </header>

        <Markdown source={String(lesson.content ?? "")} />
      </article>

      {prev || next ? (
        <nav className="mt-10 flex items-stretch gap-3 border-t border-border pt-5 text-sm">
          {prev ? (
            <Link
              href={`/course/lessons/${prev.slug}`}
              className="flex-1 rounded-md border border-border bg-surface p-3 transition-colors hover:bg-surface-raised"
            >
              <span className="block font-mono text-[11px] uppercase tracking-wider text-text-faint">
                ← previous
              </span>
              <span className="mt-1 block">{String(prev.title ?? prev.slug)}</span>
            </Link>
          ) : (
            <span className="flex-1" />
          )}
          {next ? (
            <Link
              href={`/course/lessons/${next.slug}`}
              className="flex-1 rounded-md border border-border bg-surface p-3 text-right transition-colors hover:bg-surface-raised"
            >
              <span className="block font-mono text-[11px] uppercase tracking-wider text-text-faint">
                next →
              </span>
              <span className="mt-1 block">{String(next.title ?? next.slug)}</span>
            </Link>
          ) : (
            <span className="flex-1" />
          )}
        </nav>
      ) : null}
    </main>
  );
}
